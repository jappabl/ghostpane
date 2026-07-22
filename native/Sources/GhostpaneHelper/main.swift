import Foundation
import GhostpaneNativeCore
import Darwin

private final class HelperRuntime: @unchecked Sendable {
    private let writer = ProtocolWriter()
    private let controller = HelperController(
        capture: AudioCapture(),
        transcriber: SpeechTranscriber()
    )
    private var monitor: GlobalHotkeyMonitor?
    private var progressTimer: DispatchSourceTimer?
    private var holdStartedAt: Date?
    private var audioReadyForPress = false
    private var signalSources: [DispatchSourceSignal] = []
    private var shuttingDown = false

    func run() {
        let permissions = PermissionInspector.current()
        emit(.ready(permissions))
        if permissions.canOwnHotkey { startMonitor() }
        installSignalHandlers()
        startCommandReader()
        RunLoop.main.run()
    }

    private func startMonitor() {
        guard monitor == nil else { return }
        let monitor = GlobalHotkeyMonitor { [weak self] action in
            self?.handle(action)
        }
        if monitor.start() { self.monitor = monitor }
        else { emit(.error("Could not start the global Command+Return monitor.")) }
    }

    private func handle(_ action: HotkeyAction) {
        switch action {
        case .pressBegan:
            audioReadyForPress = PermissionInspector.current().audioSupported
            if audioReadyForPress { controller.pressBegan() }
        case .tap:
            Task {
                if audioReadyForPress { await controller.tap() }
                audioReadyForPress = false
                emit(.tap())
            }
        case .holdStarted:
            guard audioReadyForPress else {
                let state = PermissionInspector.current()
                if state.macOSMajor >= 14 { requestPermissions() }
                emit(.error(audioUnavailableMessage(state)))
                return
            }
            holdStartedAt = Date()
            emit(.holdStarted())
            startProgressTimer()
        case .holdFinished:
            guard audioReadyForPress else { return }
            audioReadyForPress = false
            stopProgressTimer()
            emit(.transcribing())
            Task {
                do { emit(try await controller.holdFinished()) }
                catch { emit(.error(error.localizedDescription)) }
            }
        case .holdCancelled:
            audioReadyForPress = false
            stopProgressTimer()
            Task {
                await controller.cancel()
                emit(.holdCancelled())
            }
        }
    }

    private func startProgressTimer() {
        stopProgressTimer()
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { [weak self] in
            guard let self, let started = self.holdStartedAt else { return }
            self.emit(.holdProgress(elapsedMs: Int(Date().timeIntervalSince(started) * 1_000)))
        }
        progressTimer = timer
        timer.resume()
    }

    private func stopProgressTimer() {
        progressTimer?.cancel()
        progressTimer = nil
        holdStartedAt = nil
    }

    private func startCommandReader() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            while let line = readLine() {
                DispatchQueue.main.async { self?.handleCommand(line) }
            }
        }
    }

    private func handleCommand(_ line: String) {
        guard let data = line.data(using: .utf8),
              let command = try? JSONDecoder().decode(HelperCommand.self, from: data),
              command.isSupported else {
            emit(.error("Invalid helper command."))
            return
        }
        switch command.type {
        case "permissions":
            emit(.permissionState(PermissionInspector.current()))
        case "request-permissions":
            requestPermissions()
        case "cancel":
            stopProgressTimer()
            Task {
                await controller.cancel()
                emit(.holdCancelled())
            }
        case "shutdown":
            shutdown()
        default:
            emit(.error("Unsupported helper command: \(command.type)"))
        }
    }

    private func requestPermissions() {
        PermissionInspector.requestAccessibility()
        _ = PermissionInspector.requestScreen()
        Task {
            _ = await PermissionInspector.requestMicrophone()
            _ = await PermissionInspector.requestSpeech()
            let state = PermissionInspector.current()
            emit(.permissionState(state))
            if state.canOwnHotkey { startMonitor() }
        }
    }

    private func audioUnavailableMessage(_ state: PermissionState) -> String {
        guard state.macOSMajor >= 14 else {
            return "Held microphone and system-audio capture requires macOS 14 or newer. Tap Command+Return for a screenshot-only ask."
        }
        var missing: [String] = []
        if state.accessibility != .granted { missing.append("Accessibility") }
        if state.microphone != .granted { missing.append("Microphone") }
        if state.screen != .granted { missing.append("Screen Recording") }
        if state.speech != .granted { missing.append("Speech Recognition") }
        return "Grant Ghostpane \(missing.joined(separator: ", ")) permission in Privacy & Security, restart if macOS asks, then hold Command+Return again."
    }

    private func installSignalHandlers() {
        for signalNumber in [SIGTERM, SIGINT] {
            Darwin.signal(signalNumber, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
            source.setEventHandler { [weak self] in self?.shutdown() }
            signalSources.append(source)
            source.resume()
        }
    }

    private func emit(_ event: HelperEvent) {
        do { try writer.write(event) }
        catch {
            FileHandle.standardError.write(Data("protocol write failed: \(error)\n".utf8))
        }
    }

    private func shutdown() {
        guard !shuttingDown else { return }
        shuttingDown = true
        stopProgressTimer()
        monitor?.stop()
        monitor = nil
        signalSources.forEach { $0.cancel() }
        signalSources.removeAll()
        Task {
            await controller.cancel()
            Foundation.exit(EXIT_SUCCESS)
        }
    }
}

private let runtime = HelperRuntime()
runtime.run()

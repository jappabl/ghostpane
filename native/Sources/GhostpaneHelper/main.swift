import Foundation
import GhostpaneNativeCore

private final class HelperRuntime: @unchecked Sendable {
    private let writer = ProtocolWriter()
    private let controller = HelperController(
        capture: AudioCapture(),
        transcriber: SpeechTranscriber()
    )
    private var monitor: GlobalHotkeyMonitor?
    private var progressTimer: DispatchSourceTimer?
    private var holdStartedAt: Date?

    func run() {
        let permissions = PermissionInspector.current()
        emit(.ready(permissions))
        if permissions.canOwnHotkey { startMonitor() }
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
            controller.pressBegan()
        case .tap:
            Task {
                await controller.tap()
                emit(.tap())
            }
        case .holdStarted:
            holdStartedAt = Date()
            emit(.holdStarted())
            startProgressTimer()
        case .holdFinished:
            stopProgressTimer()
            emit(.transcribing())
            Task {
                do { emit(try await controller.holdFinished()) }
                catch { emit(.error(error.localizedDescription)) }
            }
        case .holdCancelled:
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
            PermissionInspector.requestAccessibility()
            _ = PermissionInspector.requestScreen()
            Task {
                _ = await PermissionInspector.requestMicrophone()
                _ = await PermissionInspector.requestSpeech()
                let state = PermissionInspector.current()
                emit(.permissionState(state))
                if state.canOwnHotkey { startMonitor() }
            }
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

    private func emit(_ event: HelperEvent) {
        do { try writer.write(event) }
        catch {
            FileHandle.standardError.write(Data("protocol write failed: \(error)\n".utf8))
        }
    }

    private func shutdown() {
        stopProgressTimer()
        monitor?.stop()
        monitor = nil
        Task {
            await controller.cancel()
            Foundation.exit(EXIT_SUCCESS)
        }
    }
}

private let runtime = HelperRuntime()
runtime.run()

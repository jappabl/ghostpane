import Foundation

public final class HelperController: @unchecked Sendable {
    private let capture: AudioCapturing
    private let transcriber: SpeechTranscribing
    private let now: () -> Date
    private let lock = NSLock()
    private var startTask: Task<Void, Error>?
    private var startedAt: Date?

    public init(
        capture: AudioCapturing,
        transcriber: SpeechTranscribing,
        now: @escaping () -> Date = Date.init
    ) {
        self.capture = capture
        self.transcriber = transcriber
        self.now = now
    }

    public func pressBegan() {
        lock.withLock {
            guard startTask == nil else { return }
            startedAt = now()
            startTask = Task { try await capture.start() }
        }
    }

    public func tap() async {
        let task = takeStartTask()
        _ = try? await task?.value
        await capture.cancel()
    }

    public func holdFinished() async throws -> HelperEvent {
        let started = lock.withLock { startedAt }
        let task = takeStartTask()
        do {
            guard let task else { throw AudioCaptureError.notRecording }
            try await task.value
            let artifacts = try await capture.stop()
            defer { artifacts.cleanup() }
            async let microphone = transcriber.transcribe(url: artifacts.microphoneURL)
            async let system = transcriber.transcribe(url: artifacts.systemURL)
            let durationMs = max(0, Int(now().timeIntervalSince(started ?? now()) * 1_000))
            return try await HelperEvent.holdFinished(
                microphoneTranscript: microphone,
                systemTranscript: system,
                durationMs: durationMs
            )
        } catch {
            await capture.cancel()
            throw error
        }
    }

    public func cancel() async {
        let task = takeStartTask()
        _ = try? await task?.value
        await capture.cancel()
    }

    private func takeStartTask() -> Task<Void, Error>? {
        lock.withLock {
            defer { startTask = nil; startedAt = nil }
            return startTask
        }
    }
}

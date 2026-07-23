import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

public protocol AudioCapturing: AnyObject, Sendable {
    func start() async throws
    func stop() async throws -> AudioArtifacts
    func cancel() async
}

public enum AudioCaptureError: LocalizedError {
    case alreadyRecording
    case notRecording
    case noDisplay

    public var errorDescription: String? {
        switch self {
        case .alreadyRecording: return "Audio recording is already active."
        case .notRecording: return "Audio recording is not active."
        case .noDisplay: return "No display is available for system-audio capture."
        }
    }
}

public final class AudioCapture: AudioCapturing, @unchecked Sendable {
    private let lock = NSLock()
    private var artifacts: AudioArtifacts?
    private var microphoneEngine: AVAudioEngine?
    private var microphoneFile: AVAudioFile?
    private var systemStream: SCStream?
    private var systemWriter: SystemAudioWriter?

    public init() {}

    public func start() async throws {
        let owned = try AudioArtifacts.makeEmpty()
        let accepted = lock.withLock {
            guard artifacts == nil else { return false }
            artifacts = owned
            return true
        }
        guard accepted else {
            owned.cleanup()
            throw AudioCaptureError.alreadyRecording
        }

        do {
            try await startSystemAudio(into: owned.systemURL)
            try startMicrophone(into: owned.microphoneURL)
        } catch {
            await cancel()
            throw error
        }
    }

    private func startMicrophone(into url: URL) throws {
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        input.installTap(onBus: 0, bufferSize: 2_048, format: format) { buffer, _ in
            try? file.write(from: buffer)
        }
        engine.prepare()
        try engine.start()
        microphoneEngine = engine
        microphoneFile = file
    }

    private func startSystemAudio(into url: URL) async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )
        guard let display = content.displays.first else { throw AudioCaptureError.noDisplay }
        let filter = SCContentFilter(
            display: display,
            excludingApplications: [],
            exceptingWindows: []
        )
        let configuration = SCStreamConfiguration()
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        configuration.showsCursor = false
        configuration.capturesAudio = true
        configuration.excludesCurrentProcessAudio = true
        configuration.sampleRate = 48_000
        configuration.channelCount = 2

        let writer = SystemAudioWriter(outputURL: url)
        let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
        try stream.addStreamOutput(writer, type: .audio, sampleHandlerQueue: writer.sampleQueue)
        try await stream.startCapture()
        systemWriter = writer
        systemStream = stream
    }

    public func stop() async throws -> AudioArtifacts {
        guard let owned = lock.withLock({ artifacts }) else {
            throw AudioCaptureError.notRecording
        }
        microphoneEngine?.inputNode.removeTap(onBus: 0)
        microphoneEngine?.stop()
        microphoneEngine = nil
        microphoneFile = nil

        if let stream = systemStream { try await stream.stopCapture() }
        if let writer = systemWriter { try await writer.finish() }
        systemStream = nil
        systemWriter = nil
        lock.withLock { artifacts = nil }
        return owned
    }

    public func cancel() async {
        microphoneEngine?.inputNode.removeTap(onBus: 0)
        microphoneEngine?.stop()
        microphoneEngine = nil
        microphoneFile = nil
        if let stream = systemStream { try? await stream.stopCapture() }
        systemStream = nil
        systemWriter = nil
        let owned = lock.withLock { () -> AudioArtifacts? in
            defer { artifacts = nil }
            return artifacts
        }
        owned?.cleanup()
    }
}

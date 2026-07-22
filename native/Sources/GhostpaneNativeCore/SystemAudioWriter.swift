import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

public enum SystemAudioWriterError: LocalizedError {
    case cannotCreateInput
    case appendFailed(String)

    public var errorDescription: String? {
        switch self {
        case .cannotCreateInput: return "Could not create the system-audio encoder."
        case let .appendFailed(message): return "System-audio encoding failed: \(message)"
        }
    }
}

public final class SystemAudioWriter: NSObject, SCStreamOutput, @unchecked Sendable {
    public let sampleQueue = DispatchQueue(label: "com.ghostpane.system-audio")
    private let outputURL: URL
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var failure: Error?

    public init(outputURL: URL) {
        self.outputURL = outputURL
    }

    public func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio, sampleBuffer.isValid, sampleBuffer.numSamples > 0 else { return }
        do {
            if writer == nil { try startWriter(from: sampleBuffer) }
            if input?.isReadyForMoreMediaData == true && input?.append(sampleBuffer) == false {
                failure = SystemAudioWriterError.appendFailed(writer?.error?.localizedDescription ?? "unknown error")
            }
        } catch {
            failure = error
        }
    }

    private func startWriter(from sampleBuffer: CMSampleBuffer) throws {
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .m4a)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 48_000,
            AVNumberOfChannelsKey: 2,
            AVEncoderBitRateKey: 192_000
        ]
        let input = AVAssetWriterInput(
            mediaType: .audio,
            outputSettings: settings,
            sourceFormatHint: sampleBuffer.formatDescription
        )
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else { throw SystemAudioWriterError.cannotCreateInput }
        writer.add(input)
        guard writer.startWriting() else {
            throw writer.error ?? SystemAudioWriterError.cannotCreateInput
        }
        writer.startSession(atSourceTime: sampleBuffer.presentationTimeStamp)
        self.writer = writer
        self.input = input
    }

    public func finish() async throws {
        let current = await withCheckedContinuation { continuation in
            sampleQueue.async { continuation.resume(returning: (self.writer, self.input, self.failure)) }
        }
        if let failure = current.2 { throw failure }
        guard let writer = current.0, let input = current.1 else { return }
        input.markAsFinished()
        await writer.finishWriting()
        if writer.status == .failed {
            throw writer.error ?? SystemAudioWriterError.appendFailed("unknown error")
        }
    }
}

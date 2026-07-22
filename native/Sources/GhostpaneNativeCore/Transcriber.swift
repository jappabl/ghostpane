import Foundation
import Speech

public protocol SpeechTranscribing: Sendable {
    func transcribe(url: URL) async throws -> String
}

public enum SpeechTranscriberError: LocalizedError {
    case permissionDenied
    case unavailable
    case onDeviceUnavailable

    public var errorDescription: String? {
        switch self {
        case .permissionDenied: return "Speech Recognition permission is required."
        case .unavailable: return "English speech recognition is currently unavailable."
        case .onDeviceUnavailable: return "On-device English transcription is unavailable on this Mac."
        }
    }
}

private final class RecognitionCompletion: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = false

    func claim() -> Bool {
        lock.withLock {
            if completed { return false }
            completed = true
            return true
        }
    }
}

public struct SpeechTranscriber: SpeechTranscribing {
    public init() {}

    public func transcribe(url: URL) async throws -> String {
        guard FileManager.default.fileExists(atPath: url.path),
              (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) ?? 0 > 0 else {
            return "No speech detected"
        }
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            throw SpeechTranscriberError.permissionDenied
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
              recognizer.isAvailable else {
            throw SpeechTranscriberError.unavailable
        }
        guard recognizer.supportsOnDeviceRecognition else {
            throw SpeechTranscriberError.onDeviceUnavailable
        }

        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false
        request.requiresOnDeviceRecognition = true
        let completion = RecognitionCompletion()

        return try await withCheckedThrowingContinuation { continuation in
            recognizer.recognitionTask(with: request) { result, error in
                if let result, result.isFinal, completion.claim() {
                    let text = result.bestTranscription.formattedString
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    continuation.resume(returning: text.isEmpty ? "No speech detected" : text)
                } else if let error, completion.claim() {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
}

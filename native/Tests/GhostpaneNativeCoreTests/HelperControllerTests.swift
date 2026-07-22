import Foundation
import XCTest
@testable import GhostpaneNativeCore

private final class FakeCapture: AudioCapturing, @unchecked Sendable {
    let artifacts: AudioArtifacts
    var starts = 0
    var stops = 0
    var cancels = 0

    init(artifacts: AudioArtifacts) { self.artifacts = artifacts }
    func start() async throws { starts += 1 }
    func stop() async throws -> AudioArtifacts { stops += 1; return artifacts }
    func cancel() async { cancels += 1; artifacts.cleanup() }
}

private struct FakeTranscriber: SpeechTranscribing {
    func transcribe(url: URL) async throws -> String {
        url.lastPathComponent == "microphone.caf" ? "my question" : "meeting response"
    }
}

final class HelperControllerTests: XCTestCase {
    func testHoldCompletionLabelsTranscriptsAndCleansArtifacts() async throws {
        let artifacts = try AudioArtifacts.makeEmpty()
        FileManager.default.createFile(atPath: artifacts.microphoneURL.path, contents: Data())
        FileManager.default.createFile(atPath: artifacts.systemURL.path, contents: Data())
        let capture = FakeCapture(artifacts: artifacts)
        let controller = HelperController(
            capture: capture,
            transcriber: FakeTranscriber(),
            now: { Date(timeIntervalSince1970: 10) }
        )

        controller.pressBegan()
        let event = try await controller.holdFinished()

        XCTAssertEqual(event.microphoneTranscript, "my question")
        XCTAssertEqual(event.systemTranscript, "meeting response")
        XCTAssertEqual(capture.starts, 1)
        XCTAssertEqual(capture.stops, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: artifacts.directoryURL.path))
    }

    func testTapCancelsBufferedAudio() async throws {
        let artifacts = try AudioArtifacts.makeEmpty()
        let capture = FakeCapture(artifacts: artifacts)
        let controller = HelperController(capture: capture, transcriber: FakeTranscriber())

        controller.pressBegan()
        await controller.tap()

        XCTAssertEqual(capture.starts, 1)
        XCTAssertEqual(capture.cancels, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: artifacts.directoryURL.path))
    }
}

import XCTest
@testable import GhostpaneNativeCore

final class ProtocolTests: XCTestCase {
    func testTapEventHasVersionedJSONShape() throws {
        let data = try JSONEncoder().encode(HelperEvent.tap())
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["protocolVersion"] as? Int, 1)
        XCTAssertEqual(object["type"] as? String, "tap")
    }

    func testHoldFinishedIncludesOnlyTranscriptsAndDuration() throws {
        let event = HelperEvent.holdFinished(
            microphoneTranscript: "question",
            systemTranscript: "meeting",
            durationMs: 900
        )
        let data = try JSONEncoder().encode(event)
        let text = try XCTUnwrap(String(data: data, encoding: .utf8))

        XCTAssertTrue(text.contains("question"))
        XCTAssertTrue(text.contains("meeting"))
        XCTAssertFalse(text.contains(".caf"))
        XCTAssertFalse(text.contains(".m4a"))
    }

    func testHelperCommandRequiresProtocolVersionOne() throws {
        let valid = Data(#"{"protocolVersion":1,"type":"request-permissions"}"#.utf8)
        let future = Data(#"{"protocolVersion":2,"type":"request-permissions"}"#.utf8)

        XCTAssertTrue(try JSONDecoder().decode(HelperCommand.self, from: valid).isSupported)
        XCTAssertFalse(try JSONDecoder().decode(HelperCommand.self, from: future).isSupported)
    }

    func testOcrCommandCarriesRequestIdAndImagePath() throws {
        let data = Data(#"{"protocolVersion":1,"type":"ocr","id":"7","path":"/tmp/screen.png"}"#.utf8)
        let command = try JSONDecoder().decode(HelperCommand.self, from: data)

        XCTAssertEqual(command.type, "ocr")
        XCTAssertEqual(command.id, "7")
        XCTAssertEqual(command.path, "/tmp/screen.png")
    }

    func testOcrResultCarriesRequestIdAndPositionedLines() throws {
        let event = HelperEvent.ocrResult(id: "7", lines: [
            TextLine(text: "def twoSum", x: 0.1, y: 0.2, width: 0.3, height: 0.05)
        ])
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(event)) as? [String: Any])
        let lines = try XCTUnwrap(object["lines"] as? [[String: Any]])

        XCTAssertEqual(object["type"] as? String, "ocr-result")
        XCTAssertEqual(object["id"] as? String, "7")
        XCTAssertEqual(lines.first?["text"] as? String, "def twoSum")
        XCTAssertEqual(lines.first?["x"] as? Double, 0.1)
        XCTAssertEqual(lines.first?["y"] as? Double, 0.2)
    }

    func testOcrFailureIsDistinctFromTheAudioErrorEvent() throws {
        let event = HelperEvent.ocrFailed(id: "7", message: "unreadable")
        XCTAssertEqual(event.type, "ocr-failed")
        XCTAssertEqual(event.id, "7")
        XCTAssertEqual(event.message, "unreadable")
    }
}


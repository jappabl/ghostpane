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
}

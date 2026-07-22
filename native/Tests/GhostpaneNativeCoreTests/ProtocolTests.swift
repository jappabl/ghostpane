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
}

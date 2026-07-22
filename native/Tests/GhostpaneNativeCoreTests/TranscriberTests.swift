import Foundation
import XCTest
@testable import GhostpaneNativeCore

final class TranscriberTests: XCTestCase {
    func testRecognizesAppleNoSpeechErrors() {
        XCTAssertTrue(isNoSpeechRecognitionError(
            NSError(domain: "kAFAssistantErrorDomain", code: 1110)
        ))
        XCTAssertTrue(isNoSpeechRecognitionError(
            NSError(domain: "Speech", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "No speech detected"
            ])
        ))
        XCTAssertFalse(isNoSpeechRecognitionError(
            NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
        ))
    }
}

import XCTest
@testable import GhostpaneNativeCore

final class GlobalHotkeyMonitorTests: XCTestCase {
    func testMatchesOnlyNonRepeatingCommandReturn() {
        XCTAssertTrue(isCommandReturn(keyCode: 36, commandPressed: true, isRepeat: false))
        XCTAssertFalse(isCommandReturn(keyCode: 36, commandPressed: false, isRepeat: false))
        XCTAssertFalse(isCommandReturn(keyCode: 48, commandPressed: true, isRepeat: false))
        XCTAssertFalse(isCommandReturn(keyCode: 36, commandPressed: true, isRepeat: true))
    }
}

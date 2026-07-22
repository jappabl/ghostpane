import XCTest
@testable import GhostpaneNativeCore

final class GlobalHotkeyMonitorTests: XCTestCase {
    func testMatchesOnlyNonRepeatingCommandReturn() {
        XCTAssertTrue(isCommandReturn(keyCode: 36, commandPressed: true, isRepeat: false))
        XCTAssertFalse(isCommandReturn(keyCode: 36, commandPressed: false, isRepeat: false))
        XCTAssertFalse(isCommandReturn(keyCode: 48, commandPressed: true, isRepeat: false))
        XCTAssertFalse(isCommandReturn(keyCode: 36, commandPressed: true, isRepeat: true))
    }

    func testActiveReturnFinishesEvenWhenCommandWasReleasedFirst() {
        XCTAssertTrue(shouldFinishCommandReturn(keyCode: 36, pressActive: true))
        XCTAssertFalse(shouldFinishCommandReturn(keyCode: 36, pressActive: false))
        XCTAssertFalse(shouldFinishCommandReturn(keyCode: 48, pressActive: true))
    }

    func testActiveReturnKeyDownIsSuppressedIncludingAutorepeat() {
        XCTAssertTrue(shouldSuppressActiveReturnKeyDown(keyCode: 36, pressActive: true))
        XCTAssertFalse(shouldSuppressActiveReturnKeyDown(keyCode: 36, pressActive: false))
    }
}

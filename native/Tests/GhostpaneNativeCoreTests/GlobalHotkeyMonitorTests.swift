import XCTest
@testable import GhostpaneNativeCore

final class GlobalHotkeyMonitorTests: XCTestCase {
    func testMatchesOnlyNonRepeatingCommandShiftReturn() {
        XCTAssertTrue(isAudioHotkey(
            keyCode: 36, commandPressed: true, shiftPressed: true,
            controlPressed: false, optionPressed: false, isRepeat: false
        ))
        XCTAssertFalse(isAudioHotkey(
            keyCode: 36, commandPressed: true, shiftPressed: false,
            controlPressed: false, optionPressed: false, isRepeat: false
        ))
        XCTAssertFalse(isAudioHotkey(
            keyCode: 36, commandPressed: false, shiftPressed: true,
            controlPressed: false, optionPressed: false, isRepeat: false
        ))
        XCTAssertFalse(isAudioHotkey(
            keyCode: 48, commandPressed: true, shiftPressed: true,
            controlPressed: false, optionPressed: false, isRepeat: false
        ))
        XCTAssertFalse(isAudioHotkey(
            keyCode: 36, commandPressed: true, shiftPressed: true,
            controlPressed: true, optionPressed: false, isRepeat: false
        ))
        XCTAssertFalse(isAudioHotkey(
            keyCode: 36, commandPressed: true, shiftPressed: true,
            controlPressed: false, optionPressed: true, isRepeat: false
        ))
        XCTAssertFalse(isAudioHotkey(
            keyCode: 36, commandPressed: true, shiftPressed: true,
            controlPressed: false, optionPressed: false, isRepeat: true
        ))
    }

    func testActivePressFinishesWhenEitherRequiredModifierIsReleased() {
        XCTAssertFalse(shouldFinishAudioHotkeyForModifierChange(
            commandPressed: true, shiftPressed: true, pressActive: true
        ))
        XCTAssertTrue(shouldFinishAudioHotkeyForModifierChange(
            commandPressed: false, shiftPressed: true, pressActive: true
        ))
        XCTAssertTrue(shouldFinishAudioHotkeyForModifierChange(
            commandPressed: true, shiftPressed: false, pressActive: true
        ))
        XCTAssertFalse(shouldFinishAudioHotkeyForModifierChange(
            commandPressed: false, shiftPressed: false, pressActive: false
        ))
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

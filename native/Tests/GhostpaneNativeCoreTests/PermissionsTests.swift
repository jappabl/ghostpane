import XCTest
@testable import GhostpaneNativeCore

final class PermissionsTests: XCTestCase {
    func testAudioReadinessRequiresEveryPermissionAndMacOS14() {
        let ready = PermissionState(
            accessibility: .granted,
            microphone: .granted,
            screen: .granted,
            speech: .granted,
            macOSMajor: 14
        )
        XCTAssertTrue(ready.audioSupported)

        let deniedMic = PermissionState(
            accessibility: .granted,
            microphone: .denied,
            screen: .granted,
            speech: .granted,
            macOSMajor: 14
        )
        XCTAssertFalse(deniedMic.audioSupported)

        let oldMac = PermissionState(
            accessibility: .granted,
            microphone: .granted,
            screen: .granted,
            speech: .granted,
            macOSMajor: 13
        )
        XCTAssertFalse(oldMac.audioSupported)
    }

    func testHotkeyOwnershipNeedsOnlyAccessibility() {
        let state = PermissionState(
            accessibility: .granted,
            microphone: .notDetermined,
            screen: .denied,
            speech: .notDetermined,
            macOSMajor: 14
        )
        XCTAssertTrue(state.canOwnHotkey)
    }
}

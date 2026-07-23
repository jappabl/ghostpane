import XCTest
@testable import GhostpaneNativeCore

final class HotkeyStateMachineTests: XCTestCase {
    func testShortAudioPressEmitsCleanupActionOnly() {
        var events: [HotkeyAction] = []
        let state = HotkeyStateMachine(threshold: .milliseconds(350)) { events.append($0) }

        state.keyDown(at: .zero)
        state.keyUp(at: .milliseconds(120))

        XCTAssertEqual(events, [.pressBegan, .shortPress])
    }

    func testHoldIgnoresAutorepeatAndFinishesOnce() {
        var events: [HotkeyAction] = []
        let state = HotkeyStateMachine(threshold: .milliseconds(350)) { events.append($0) }

        state.keyDown(at: .zero)
        state.keyDown(at: .milliseconds(20))
        state.thresholdReached(at: .milliseconds(350))
        state.keyUp(at: .milliseconds(800))
        state.keyUp(at: .milliseconds(900))

        XCTAssertEqual(events, [.pressBegan, .holdStarted, .holdFinished])
    }

    func testCancelledPressEmitsCancellationOnlyAfterHoldStarts() {
        var events: [HotkeyAction] = []
        let state = HotkeyStateMachine(threshold: .milliseconds(350)) { events.append($0) }

        state.keyDown(at: .zero)
        state.thresholdReached(at: .milliseconds(350))
        state.cancel()

        XCTAssertEqual(events, [.pressBegan, .holdStarted, .holdCancelled])
    }
}

import Foundation

public enum HotkeyAction: Equatable, Sendable {
    case pressBegan
    case shortPress
    case holdStarted
    case holdFinished
    case holdCancelled
}

public final class HotkeyStateMachine: @unchecked Sendable {
    private enum State {
        case idle
        case pressed(startedAt: Duration)
        case holding
    }

    private let threshold: Duration
    private let emit: (HotkeyAction) -> Void
    private var state: State = .idle
    private let lock = NSLock()

    public init(
        threshold: Duration = .milliseconds(350),
        emit: @escaping (HotkeyAction) -> Void
    ) {
        self.threshold = threshold
        self.emit = emit
    }

    public func keyDown(at time: Duration) {
        var began = false
        lock.withLock {
            guard case .idle = state else { return }
            state = .pressed(startedAt: time)
            began = true
        }
        if began { emit(.pressBegan) }
    }

    public func thresholdReached(at time: Duration) {
        var action: HotkeyAction?
        lock.withLock {
            guard case let .pressed(startedAt) = state,
                  time - startedAt >= threshold else { return }
            state = .holding
            action = .holdStarted
        }
        if let action { emit(action) }
    }

    public func keyUp(at time: Duration) {
        var actions: [HotkeyAction] = []
        lock.withLock {
            switch state {
            case .idle:
                return
            case let .pressed(startedAt):
                if time - startedAt >= threshold {
                    actions = [.holdStarted, .holdFinished]
                } else {
                    actions = [.shortPress]
                }
            case .holding:
                actions = [.holdFinished]
            }
            state = .idle
        }
        actions.forEach(emit)
    }

    public func cancel() {
        var action: HotkeyAction?
        lock.withLock {
            if case .holding = state { action = .holdCancelled }
            state = .idle
        }
        if let action { emit(action) }
    }
}

import ApplicationServices
import Foundation

public func isCommandReturn(keyCode: Int64, commandPressed: Bool, isRepeat: Bool) -> Bool {
    keyCode == 36 && commandPressed && !isRepeat
}

public func shouldFinishCommandReturn(keyCode: Int64, pressActive: Bool) -> Bool {
    keyCode == 36 && pressActive
}

public func shouldSuppressActiveReturnKeyDown(keyCode: Int64, pressActive: Bool) -> Bool {
    keyCode == 36 && pressActive
}

public final class GlobalHotkeyMonitor: @unchecked Sendable {
    private let stateMachine: HotkeyStateMachine
    private let clock = ContinuousClock()
    private lazy var origin = clock.now
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var thresholdWorkItem: DispatchWorkItem?
    private var pressActive = false
    private var suppressNextReturnKeyUp = false

    public init(emit: @escaping (HotkeyAction) -> Void) {
        self.stateMachine = HotkeyStateMachine(emit: emit)
    }

    @discardableResult
    public func start() -> Bool {
        guard eventTap == nil else { return true }
        let eventMask = (1 << CGEventType.keyDown.rawValue) |
            (1 << CGEventType.keyUp.rawValue) |
            (1 << CGEventType.flagsChanged.rawValue)
        let pointer = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: CGEventMask(eventMask),
            callback: { _, type, event, userInfo in
                guard let userInfo else { return Unmanaged.passUnretained(event) }
                let monitor = Unmanaged<GlobalHotkeyMonitor>.fromOpaque(userInfo).takeUnretainedValue()
                return monitor.handle(type: type, event: event)
            },
            userInfo: pointer
        ) else { return false }

        eventTap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        return true
    }

    public func stop() {
        thresholdWorkItem?.cancel()
        thresholdWorkItem = nil
        stateMachine.cancel()
        pressActive = false
        suppressNextReturnKeyUp = false
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes)
        }
        if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: false) }
        runLoopSource = nil
        eventTap = nil
    }

    private func elapsed() -> Duration { origin.duration(to: clock.now) }

    private func handle(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let isRepeat = event.getIntegerValueField(.keyboardEventAutorepeat) != 0
        let commandPressed = event.flags.contains(.maskCommand)

        if type == .flagsChanged && pressActive && !commandPressed {
            finishPress()
            suppressNextReturnKeyUp = true
            return Unmanaged.passUnretained(event)
        }

        if type == .keyDown && shouldSuppressActiveReturnKeyDown(
            keyCode: keyCode, pressActive: pressActive
        ) {
            return nil
        }

        if type == .keyDown && isCommandReturn(
            keyCode: keyCode, commandPressed: commandPressed, isRepeat: isRepeat
        ) {
            pressActive = true
            let now = elapsed()
            stateMachine.keyDown(at: now)
            thresholdWorkItem?.cancel()
            let item = DispatchWorkItem { [weak self] in
                guard let self else { return }
                self.stateMachine.thresholdReached(at: self.elapsed())
            }
            thresholdWorkItem = item
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(350), execute: item)
            return nil
        }
        if type == .keyUp && shouldFinishCommandReturn(
            keyCode: keyCode, pressActive: pressActive
        ) {
            finishPress()
            return nil
        }
        if type == .keyUp && keyCode == 36 && suppressNextReturnKeyUp {
            suppressNextReturnKeyUp = false
            return nil
        }
        return Unmanaged.passUnretained(event)
    }

    private func finishPress() {
        thresholdWorkItem?.cancel()
        thresholdWorkItem = nil
        pressActive = false
        stateMachine.keyUp(at: elapsed())
    }

    deinit { stop() }
}

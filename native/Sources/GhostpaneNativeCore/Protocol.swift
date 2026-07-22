import Foundation

public struct HelperEvent: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let type: String
    public let microphoneTranscript: String?
    public let systemTranscript: String?
    public let durationMs: Int?
    public let message: String?
    public let elapsedMs: Int?
    public let permissions: PermissionState?

    public init(
        protocolVersion: Int = 1,
        type: String,
        microphoneTranscript: String? = nil,
        systemTranscript: String? = nil,
        durationMs: Int? = nil,
        message: String? = nil,
        elapsedMs: Int? = nil,
        permissions: PermissionState? = nil
    ) {
        self.protocolVersion = protocolVersion
        self.type = type
        self.microphoneTranscript = microphoneTranscript
        self.systemTranscript = systemTranscript
        self.durationMs = durationMs
        self.message = message
        self.elapsedMs = elapsedMs
        self.permissions = permissions
    }

    public static func tap() -> HelperEvent { HelperEvent(type: "tap") }
    public static func holdStarted() -> HelperEvent { HelperEvent(type: "hold-started") }
    public static func holdProgress(elapsedMs: Int) -> HelperEvent {
        HelperEvent(type: "hold-progress", elapsedMs: elapsedMs)
    }
    public static func holdFinished(
        microphoneTranscript: String,
        systemTranscript: String,
        durationMs: Int
    ) -> HelperEvent {
        HelperEvent(
            type: "hold-finished",
            microphoneTranscript: microphoneTranscript,
            systemTranscript: systemTranscript,
            durationMs: durationMs
        )
    }
    public static func holdCancelled() -> HelperEvent { HelperEvent(type: "hold-cancelled") }
    public static func error(_ message: String) -> HelperEvent {
        HelperEvent(type: "error", message: message)
    }
    public static func ready(_ permissions: PermissionState) -> HelperEvent {
        HelperEvent(type: "ready", permissions: permissions)
    }
    public static func permissionState(_ permissions: PermissionState) -> HelperEvent {
        HelperEvent(type: "permission-state", permissions: permissions)
    }
}

public final class ProtocolWriter: @unchecked Sendable {
    private let handle: FileHandle
    private let lock = NSLock()
    private let encoder = JSONEncoder()

    public init(handle: FileHandle = .standardOutput) {
        self.handle = handle
    }

    public func write(_ event: HelperEvent) throws {
        var data = try encoder.encode(event)
        data.append(0x0A)
        try lock.withLock { try handle.write(contentsOf: data) }
    }
}

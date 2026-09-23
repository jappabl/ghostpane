import Foundation

public struct HelperCommand: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let type: String
    /// Correlates a request that gets a reply (ocr) with that reply.
    public let id: String?
    /// Image to read, for ocr.
    public let path: String?

    public init(protocolVersion: Int = 1, type: String, id: String? = nil, path: String? = nil) {
        self.protocolVersion = protocolVersion
        self.type = type
        self.id = id
        self.path = path
    }

    public var isSupported: Bool { protocolVersion == 1 }
}

/// One line of recognised text. Position and size are fractions of the image,
/// measured from its top-left corner like screen coordinates.
public struct TextLine: Codable, Equatable, Sendable {
    public let text: String
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double

    public init(text: String, x: Double, y: Double, width: Double, height: Double) {
        self.text = text
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

public struct HelperEvent: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let type: String
    public let microphoneTranscript: String?
    public let systemTranscript: String?
    public let durationMs: Int?
    public let message: String?
    public let elapsedMs: Int?
    public let permissions: PermissionState?
    public let id: String?
    public let lines: [TextLine]?

    public init(
        protocolVersion: Int = 1,
        type: String,
        microphoneTranscript: String? = nil,
        systemTranscript: String? = nil,
        durationMs: Int? = nil,
        message: String? = nil,
        elapsedMs: Int? = nil,
        permissions: PermissionState? = nil,
        id: String? = nil,
        lines: [TextLine]? = nil
    ) {
        self.protocolVersion = protocolVersion
        self.type = type
        self.microphoneTranscript = microphoneTranscript
        self.systemTranscript = systemTranscript
        self.durationMs = durationMs
        self.message = message
        self.elapsedMs = elapsedMs
        self.permissions = permissions
        self.id = id
        self.lines = lines
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
    public static func transcribing() -> HelperEvent { HelperEvent(type: "transcribing") }
    public static func error(_ message: String) -> HelperEvent {
        HelperEvent(type: "error", message: message)
    }
    public static func ready(_ permissions: PermissionState) -> HelperEvent {
        HelperEvent(type: "ready", permissions: permissions)
    }
    public static func permissionState(_ permissions: PermissionState) -> HelperEvent {
        HelperEvent(type: "permission-state", permissions: permissions)
    }
    public static func ocrResult(id: String, lines: [TextLine]) -> HelperEvent {
        HelperEvent(type: "ocr-result", id: id, lines: lines)
    }
    /// Not "error": that event means the held-audio flow failed, and the app shows it.
    public static func ocrFailed(id: String, message: String) -> HelperEvent {
        HelperEvent(type: "ocr-failed", message: message, id: id)
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

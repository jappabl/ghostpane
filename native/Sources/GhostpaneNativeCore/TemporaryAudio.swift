import Foundation

public final class AudioArtifacts: @unchecked Sendable {
    public let directoryURL: URL
    public let microphoneURL: URL
    public let systemURL: URL
    private let lock = NSLock()
    private var cleaned = false

    public init(directoryURL: URL, microphoneURL: URL, systemURL: URL) {
        self.directoryURL = directoryURL
        self.microphoneURL = microphoneURL
        self.systemURL = systemURL
    }

    public static func makeEmpty() throws -> AudioArtifacts {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ghostpane-audio", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o700], ofItemAtPath: root.path
        )
        let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o700], ofItemAtPath: directory.path
        )
        return AudioArtifacts(
            directoryURL: directory,
            microphoneURL: directory.appendingPathComponent("microphone.caf"),
            systemURL: directory.appendingPathComponent("system.m4a")
        )
    }

    public func cleanup() {
        let shouldClean = lock.withLock {
            if cleaned { return false }
            cleaned = true
            return true
        }
        guard shouldClean else { return }
        try? FileManager.default.removeItem(at: directoryURL)
    }

    deinit { cleanup() }
}

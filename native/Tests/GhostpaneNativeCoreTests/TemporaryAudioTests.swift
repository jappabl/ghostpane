import Foundation
import XCTest
@testable import GhostpaneNativeCore

final class TemporaryAudioTests: XCTestCase {
    func testArtifactsDeleteBothFilesIdempotently() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let microphone = directory.appendingPathComponent("microphone.caf")
        let system = directory.appendingPathComponent("system.m4a")
        FileManager.default.createFile(atPath: microphone.path, contents: Data("mic".utf8))
        FileManager.default.createFile(atPath: system.path, contents: Data("system".utf8))
        let artifacts = AudioArtifacts(
            directoryURL: directory,
            microphoneURL: microphone,
            systemURL: system
        )

        artifacts.cleanup()
        artifacts.cleanup()

        XCTAssertFalse(FileManager.default.fileExists(atPath: microphone.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: system.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
    }

    func testTemporaryFactoryUsesUniqueOwnedDirectory() throws {
        let first = try AudioArtifacts.makeEmpty()
        let second = try AudioArtifacts.makeEmpty()
        defer { first.cleanup(); second.cleanup() }

        XCTAssertNotEqual(first.directoryURL, second.directoryURL)
        XCTAssertTrue(first.microphoneURL.path.hasSuffix("microphone.caf"))
        XCTAssertTrue(first.systemURL.path.hasSuffix("system.m4a"))
    }
}

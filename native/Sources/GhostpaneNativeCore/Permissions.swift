import ApplicationServices
import AVFoundation
import Foundation
import Speech

public enum PermissionStatus: String, Codable, Equatable, Sendable {
    case granted
    case denied
    case notDetermined
    case restricted
}

public struct PermissionState: Codable, Equatable, Sendable {
    public let accessibility: PermissionStatus
    public let microphone: PermissionStatus
    public let screen: PermissionStatus
    public let speech: PermissionStatus
    public let macOSMajor: Int

    public init(
        accessibility: PermissionStatus,
        microphone: PermissionStatus,
        screen: PermissionStatus,
        speech: PermissionStatus,
        macOSMajor: Int
    ) {
        self.accessibility = accessibility
        self.microphone = microphone
        self.screen = screen
        self.speech = speech
        self.macOSMajor = macOSMajor
    }

    public var canOwnHotkey: Bool { accessibility == .granted }
    public var audioSupported: Bool {
        macOSMajor >= 14 && accessibility == .granted && microphone == .granted &&
            screen == .granted && speech == .granted
    }
}

public enum PermissionInspector {
    public static func current() -> PermissionState {
        PermissionState(
            accessibility: AXIsProcessTrusted() ? .granted : .denied,
            microphone: map(AVCaptureDevice.authorizationStatus(for: .audio)),
            screen: CGPreflightScreenCaptureAccess() ? .granted : .denied,
            speech: map(SFSpeechRecognizer.authorizationStatus()),
            macOSMajor: ProcessInfo.processInfo.operatingSystemVersion.majorVersion
        )
    }

    public static func requestAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    public static func requestMicrophone() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .audio)
    }

    public static func requestScreen() -> Bool {
        CGRequestScreenCaptureAccess()
    }

    public static func requestSpeech() async -> PermissionStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: map(status))
            }
        }
    }

    private static func map(_ status: AVAuthorizationStatus) -> PermissionStatus {
        switch status {
        case .authorized: return .granted
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }

    private static func map(_ status: SFSpeechRecognizerAuthorizationStatus) -> PermissionStatus {
        switch status {
        case .authorized: return .granted
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }
}

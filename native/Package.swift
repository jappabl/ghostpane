// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "GhostpaneNative",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "GhostpaneNativeCore", targets: ["GhostpaneNativeCore"]),
        .executable(name: "GhostpaneHelper", targets: ["GhostpaneHelper"])
    ],
    targets: [
        .target(name: "GhostpaneNativeCore"),
        .executableTarget(name: "GhostpaneHelper", dependencies: ["GhostpaneNativeCore"]),
        .testTarget(name: "GhostpaneNativeCoreTests", dependencies: ["GhostpaneNativeCore"])
    ]
)

// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "GhostpaneNative",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "GhostpaneNativeCore", targets: ["GhostpaneNativeCore"])
    ],
    targets: [
        .target(name: "GhostpaneNativeCore"),
        .testTarget(name: "GhostpaneNativeCoreTests", dependencies: ["GhostpaneNativeCore"])
    ]
)

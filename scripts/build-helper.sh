#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

SWIFT_BIN="$(xcrun --find swift)"
LIPO_BIN="$(xcrun --find lipo)"
MODULE_CACHE="$PROJECT_ROOT/.swift-cache"
mkdir -p "$MODULE_CACHE"
export CLANG_MODULE_CACHE_PATH="${CLANG_MODULE_CACHE_PATH:-$MODULE_CACHE}"
export SWIFTPM_MODULECACHE_OVERRIDE="${SWIFTPM_MODULECACHE_OVERRIDE:-$MODULE_CACHE}"

"$SWIFT_BIN" build --disable-sandbox --package-path "$PROJECT_ROOT/native" -c release --arch arm64
"$SWIFT_BIN" build --disable-sandbox --package-path "$PROJECT_ROOT/native" -c release --arch x86_64

OUTPUT_DIR="$PROJECT_ROOT/build/native"
mkdir -p "$OUTPUT_DIR"
"$LIPO_BIN" -create \
  "$PROJECT_ROOT/native/.build/arm64-apple-macosx/release/GhostpaneHelper" \
  "$PROJECT_ROOT/native/.build/x86_64-apple-macosx/release/GhostpaneHelper" \
  -output "$OUTPUT_DIR/ghostpane-helper"
chmod 755 "$OUTPUT_DIR/ghostpane-helper"
"$LIPO_BIN" "$OUTPUT_DIR/ghostpane-helper" -verify_arch arm64 x86_64

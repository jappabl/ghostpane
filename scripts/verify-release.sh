#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 APP DMG EXPECTED_ARCH" >&2
  exit 2
fi

APP="$1"
DMG="$2"
EXPECTED_ARCH="$3"
[[ "$EXPECTED_ARCH" == "x64" ]] && EXPECTED_ARCH="x86_64"

[[ -d "$APP" ]] || { echo "missing app: $APP" >&2; exit 1; }
[[ -s "$DMG" ]] || { echo "missing or empty DMG: $DMG" >&2; exit 1; }

HELPER="$APP/Contents/Resources/native/ghostpane-helper"
APP_EXECUTABLE="$APP/Contents/MacOS/Ghostpane"
[[ -x "$HELPER" ]] || { echo "missing executable helper: $HELPER" >&2; exit 1; }
[[ -x "$APP_EXECUTABLE" ]] || { echo "missing app executable: $APP_EXECUTABLE" >&2; exit 1; }

codesign --verify --deep --strict "$APP"
codesign --verify --strict "$HELPER"
lipo "$APP_EXECUTABLE" -verify_arch "$EXPECTED_ARCH"
lipo "$HELPER" -verify_arch arm64 x86_64

echo "verified $(basename "$DMG"): signed app, $EXPECTED_ARCH app, universal helper"

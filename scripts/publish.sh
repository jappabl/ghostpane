#!/usr/bin/env bash
# One-shot publish to GitHub so anyone can download & install Ghostpane.
#
# Prereqs: `gh auth status` shows you logged in and the stable signing identity
# named "Ghostpane Local Signing" is installed in your keychain.
# Usage:   ./scripts/publish.sh [repo-name] [--private]
#
# It rebuilds and verifies both signed apps before uploading either DMG.

set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${1:-ghostpane}"
VIS="--public"
[[ "${2:-}" == "--private" ]] && VIS="--private"

VERSION="v$(node -p "require('./package.json').version")"
gh auth status >/dev/null
OWNER="$(gh api user -q .login)"

echo "==> Publishing $OWNER/$REPO ($VIS), release $VERSION"

# 1. Create + push the repo if the remote doesn't exist yet.
if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" $VIS --source=. --remote=origin \
    --description "Invisible AI overlay with ChatGPT, Claude, screen, and held-audio context" \
    --push
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
fi

# 2. Always rebuild and verify both architectures. The signing hook fails closed.
echo "==> Building signed DMGs..."
GHOSTPANE_REQUIRE_SIGNING=1 npm run dist

ARM_APP="release/mac-arm64/Ghostpane.app"
X64_APP="release/mac/Ghostpane.app"
[[ -d "$X64_APP" ]] || X64_APP="release/mac-x64/Ghostpane.app"
ARM_DMG="$(find release -maxdepth 1 -type f -name '*-arm64.dmg' -print -quit)"
X64_DMG="$(find release -maxdepth 1 -type f -name '*.dmg' ! -name '*-arm64.dmg' -print -quit)"
scripts/verify-release.sh "$ARM_APP" "$ARM_DMG" arm64
scripts/verify-release.sh "$X64_APP" "$X64_DMG" x64

# 3. Create (or update) the release with the DMGs attached.
if gh release view "$VERSION" --repo "$OWNER/$REPO" >/dev/null 2>&1; then
  gh release upload "$VERSION" "$ARM_DMG" "$X64_DMG" --repo "$OWNER/$REPO" --clobber
else
  gh release create "$VERSION" "$ARM_DMG" "$X64_DMG" \
    --repo "$OWNER/$REPO" \
    --title "Ghostpane $VERSION" \
    --notes-file docs/RELEASE_NOTES.md
fi

echo "==> Done: https://github.com/$OWNER/$REPO/releases/tag/$VERSION"

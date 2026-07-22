#!/usr/bin/env bash
# One-shot publish to GitHub so anyone can download & install Ghostpane.
#
# Prereqs: `gh auth status` shows you logged in, DMGs built in release/.
# Usage:   ./scripts/publish.sh [repo-name] [--private]
#
# It will: create the repo (if missing), push main, and cut a v0.1.0 release
# with the locally-built DMGs attached. Re-runnable.

set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${1:-ghostpane}"
VIS="--public"
[[ "${2:-}" == "--private" ]] && VIS="--private"

VERSION="v$(node -p "require('./package.json').version")"
OWNER="$(gh api user -q .login)"

echo "==> Publishing $OWNER/$REPO ($VIS), release $VERSION"

# 1. Create + push the repo if the remote doesn't exist yet.
if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" $VIS --source=. --remote=origin \
    --description "Invisible AI overlay excluded from screen recording, powered by your Claude subscription" \
    --push
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
fi

# 2. Ensure the DMGs exist (build if not).
if ! ls release/*.dmg >/dev/null 2>&1; then
  echo "==> No DMGs found; building..."
  npm run dist
fi

# 3. Create (or update) the release with the DMGs attached.
if gh release view "$VERSION" --repo "$OWNER/$REPO" >/dev/null 2>&1; then
  gh release upload "$VERSION" release/*.dmg --repo "$OWNER/$REPO" --clobber
else
  gh release create "$VERSION" release/*.dmg \
    --repo "$OWNER/$REPO" \
    --title "Ghostpane $VERSION" \
    --notes-file docs/RELEASE_NOTES.md
fi

echo "==> Done: https://github.com/$OWNER/$REPO/releases/tag/$VERSION"

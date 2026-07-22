# Signed DMG Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle the universal native helper and reliably publish signed ARM64 and Intel Ghostpane DMGs from GitHub Actions and the local release script.

**Architecture:** SwiftPM produces arm64 and x86_64 helpers that are combined into one universal executable. electron-builder embeds that helper in both apps. Release automation imports one stable PKCS#12 identity into a temporary keychain, fails closed on missing signing material, verifies signatures and architectures, then uploads both DMGs.

**Tech Stack:** SwiftPM, `lipo`, electron-builder, macOS codesign/security tools, GitHub Actions, Bash.

## Global Constraints

- GitHub download remains one DMG per architecture.
- No separate helper, runtime, transcription model, or package installation.
- Never upload an unsigned application.
- Signing identity name is exactly `Ghostpane Local Signing`.
- GitHub secrets are `GHOSTPANE_CERT_P12_BASE64` and `GHOSTPANE_CERT_PASSWORD`.
- Both ARM64 and Intel artifacts must be present before release upload.

---

### Task 1: Universal helper build and Electron packaging

**Files:**
- Create: `scripts/build-helper.sh`
- Modify: `package.json`
- Modify: `electron-builder.yml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `build/native/ghostpane-helper`, a universal `arm64 x86_64` executable.
- `npm run native:test` and `npm run native:build` become stable build entry points.

- [ ] **Step 1: Add scripts that fail because the helper is not built**

```json
{
  "native:test": "swift test --package-path native",
  "native:build": "bash scripts/build-helper.sh",
  "build": "npm run native:build && electron-vite build",
  "dist": "npm run build && electron-builder --mac"
}
```

- [ ] **Step 2: Verify the missing build script fails**

Run: `npm run native:build`

Expected: FAIL because `scripts/build-helper.sh` does not exist.

- [ ] **Step 3: Implement deterministic universal build script**

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
swift build --package-path "$ROOT/native" -c release --arch arm64
swift build --package-path "$ROOT/native" -c release --arch x86_64
mkdir -p "$ROOT/build/native"
lipo -create \
  "$ROOT/native/.build/arm64-apple-macosx/release/GhostpaneHelper" \
  "$ROOT/native/.build/x86_64-apple-macosx/release/GhostpaneHelper" \
  -output "$ROOT/build/native/ghostpane-helper"
chmod 755 "$ROOT/build/native/ghostpane-helper"
lipo -verify_arch arm64 x86_64 "$ROOT/build/native/ghostpane-helper"
```

- [ ] **Step 4: Package the helper as an extra resource**

Add:

```yaml
extraResources:
  - from: build/native/ghostpane-helper
    to: native/ghostpane-helper
```

Ignore `/build/native/` and Swift `.build/` output without ignoring the existing checked-in `build/afterPack.cjs`.

- [ ] **Step 5: Build and inspect output**

Run: `npm run native:test && npm run build && lipo -archs build/native/ghostpane-helper`

Expected: tests PASS, Electron build succeeds, and lipo prints `x86_64 arm64` in either order.

- [ ] **Step 6: Commit packaging integration**

```bash
git add scripts/build-helper.sh package.json electron-builder.yml .gitignore
git commit -m "build: bundle universal audio helper"
```

### Task 2: Fail-closed signing and verification scripts

**Files:**
- Modify: `build/afterPack.cjs`
- Create: `scripts/verify-release.sh`
- Test: `tests/after-pack.test.ts`

**Interfaces:**
- Produces: strict release-mode signing and reusable `verify-release.sh` checks.

- [ ] **Step 1: Write failing hook-policy tests**

Extract `shouldRequireSigning(env)` and test:

```ts
expect(shouldRequireSigning({ CI: 'true' })).toBe(true)
expect(shouldRequireSigning({ GHOSTPANE_REQUIRE_SIGNING: '1' })).toBe(true)
expect(shouldRequireSigning({})).toBe(false)
```

- [ ] **Step 2: Verify failure**

Run: `./node_modules/.bin/vitest run tests/after-pack.test.ts`

Expected: FAIL because the policy export does not exist.

- [ ] **Step 3: Make signing fail closed in release mode**

If the identity is absent and signing is required, throw instead of returning. Sign the nested helper first with runtime options, then the app:

```text
codesign --force --options runtime --timestamp=none --sign "Ghostpane Local Signing" <helper>
codesign --force --deep --options runtime --timestamp=none --sign "Ghostpane Local Signing" <app>
```

Keep local development packaging permissive unless `GHOSTPANE_REQUIRE_SIGNING=1`.

- [ ] **Step 4: Implement artifact verification**

`scripts/verify-release.sh APP DMG EXPECTED_ARCH` must run `codesign --verify --deep --strict`, confirm the helper exists and is executable, check `lipo -verify_arch "$EXPECTED_ARCH"` for app executable, check both helper architectures, and require a non-empty DMG.

- [ ] **Step 5: Run tests and commit**

Run: `./node_modules/.bin/vitest run tests/after-pack.test.ts`

Expected: PASS.

```bash
git add build/afterPack.cjs scripts/verify-release.sh tests/after-pack.test.ts
git commit -m "build: fail closed on unsigned releases"
```

### Task 3: Repair GitHub Actions release workflow

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: signing secrets and build/verification scripts.
- Produces: two verified DMGs attached to the pushed tag's release.

- [ ] **Step 1: Replace the monolithic job with validate, package, and release stages**

`validate` runs `npm ci`, `npm test`, `npm run typecheck`, and `npm run native:test`.

`package` runs only after validation, checks both secrets before importing, creates a temporary keychain, imports the PKCS#12 identity, unlocks it, sets the key partition list, sets `GHOSTPANE_REQUIRE_SIGNING=1`, runs `npm run dist`, verifies both app architectures/signatures, and uploads DMGs as a workflow artifact.

`release` downloads that workflow artifact and runs `softprops/action-gh-release@v2` with `files: release/*.dmg` and `fail_on_unmatched_files: true`.

- [ ] **Step 2: Add unconditional keychain cleanup**

Create the keychain path from `$RUNNER_TEMP/ghostpane-signing.keychain-db`; the cleanup step uses `if: always()` and deletes only that exact keychain.

- [ ] **Step 3: Validate workflow syntax locally**

Run: `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml", aliases: true); puts "valid"'`

Expected: `valid`.

- [ ] **Step 4: Commit workflow repair**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish verified signed DMGs"
```

### Task 4: Local publishing and user documentation

**Files:**
- Modify: `scripts/publish.sh`
- Modify: `README.md`
- Modify: `docs/SMOKE.md`
- Modify: `docs/RELEASE_NOTES.md`

**Interfaces:**
- Produces: one-command local fallback that uploads only verified signed DMGs.

- [ ] **Step 1: Make local publishing rebuild and verify instead of trusting stale DMGs**

Require `gh auth status`, run `GHOSTPANE_REQUIRE_SIGNING=1 npm run dist`, locate both generated apps/DMGs, call `scripts/verify-release.sh` for arm64 and x64, then create or clobber the release assets. Abort before any upload if verification fails.

- [ ] **Step 2: Update installation and provider documentation**

Document that downloads remain `.dmg` files, ChatGPT is the default, users run `codex login`, Claude remains optional, held audio requires macOS 14+, and the first hold requires Accessibility, Microphone, Screen Recording, and Speech Recognition permissions.

- [ ] **Step 3: Extend the smoke checklist**

Add separate checks for tap, microphone-only hold, system-audio-only hold, simultaneous hold, ChatGPT/Claude switching, denied permissions, and confirmation that Ghostpane temp media disappears after a request.

- [ ] **Step 4: Run complete verification**

Run: `npm test && npm run typecheck && npm run native:test && npm run build`

Expected: all tests PASS and the production build succeeds.

- [ ] **Step 5: Commit release docs and script**

```bash
git add scripts/publish.sh README.md docs/SMOKE.md docs/RELEASE_NOTES.md
git commit -m "docs: explain ChatGPT audio release flow"
```

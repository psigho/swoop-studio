# Swoop Studio release review

The user approved public publication on 21 October 2026 after the local feature tests. Release **0.2.5** uses MIT for Swoop's original application code. Its separate FFmpeg/x264 executable retains its own GPL license and corresponding source/build materials. The source, included original demo and installer payload were audited for credentials, private recordings and proprietary third-party application assets; none were found in the intended payload. Earlier sections below record the local review history and apply to their named versions.

## Automatic recording backups

A newly recorded take previously lived only in renderer memory. Closing without Save project or Export discarded the video, even when no edits had been made. Desktop capture now starts an app-data recording backup before starting its encoder, appends ordered WebM chunks with a disk flush before acknowledgement, and atomically stores the completed cursor track and recording metadata. No backups are automatically deleted. A writable backup folder is required to start desktop recording; later write failures keep the in-memory take available with explicit Save/Export guidance.

The **Recordings** panel opens automatically at startup when backups exist and can reopen completed or interrupted takes. The raw file and exact folder are accessible from the panel. Interrupted takes are persistently labeled as partial; their ending and cursor track may be missing. Accepted video bytes survive capture errors, renderer crashes and process restart. Unsaved editor settings still require Save project. The test launcher now uses one stable candidate profile across versions so its backups remain discoverable after updates.

Review caught and fixed Windows final-flush access, active partial backups remaining hidden after renderer failures, ambiguous partial-recovery status, and timestamp names being shortened on reopen. A bounded decoder timeout keeps an unreadable fragment from trapping the recovery dialog. Tests use isolated profiles and owned media only; no user window was closed or recorded.

All **102 unit tests passed** (50 renderer/engine/project and 52 native tests). Seven recovery runtime checks passed against both source Electron and the exact packaged executable, including actual self-window capture, close without saving/exporting, completed cursor preservation, and a forced mid-take process exit after two observed disk writes. Both completed and interrupted recordings reopened through the UI with byte-identical media and decoded frames. Interrupted WebM container warnings are recorded separately. The packaged dependency command passed all five checks, the NSIS preflight harness passed all six checks, and all six installer payload checks passed. Receipts: `artifacts/release-review/take-backup-unit-results.txt`, `artifacts/take-recovery/packaged-0.2.4/result.json`, `artifacts/dependency-cli-0.2.4/cli-verification.json`, `artifacts/installer-preflight-0.2.4/results.json` and `artifacts/installer-0.2.4/verification.json`.

The full setup wizard, installation/uninstall, power loss and clean-machine behavior remain outside the executed scope. The installer remains unsigned and local. Public binary distribution still requires the encoder materials described below; no GitHub upload occurred.

## Earlier 0.2.3 installer and included demo update

Setup now checks Windows 10/11 AMD64 support and actual write access before extracting files. It asks the user to save and close an open studio, without killing the process. After extraction, the exact packaged app runs an isolated dependency check before Setup creates shortcuts or an uninstall entry. It checks 14 Electron runtime files, loads the bundled native pointer module without starting capture, encodes/decodes MP4 with the exact bundled FFmpeg, and checks recording API availability and first-frame decoding of the included 1080p demo. Missing components, failed startup, timeouts and missing/stale/empty reports stop Setup.

The original 8.486-second cursor-effects playground export is bundled and available offline through **Help → Watch included demo**. The packaged player was tested for playback, seeking, reaching the end, Back and Escape; there were no network requests or collected renderer errors.

**78 automated tests passed** (38 engine/project/geometry and 40 native/dependency tests). The packaged dependency command passed all five checks with system encoder paths excluded and package-loader environment overrides deliberately poisoned. Six installer macro checks passed, including failure fixtures, preserving an open fixture process and invoking the actual packaged checker. Six installer payload checks passed, including exact demo bytes and bundled encoder encode/decode. Receipts: `artifacts/release-review/dependency-demo-unit-results.txt`, `artifacts/dependency-cli-0.2.3/`, `artifacts/bundled-demo-packaged-0.2.3/result.json`, `artifacts/installer-preflight-0.2.3/results.json` and `artifacts/installer-0.2.3/verification.json`.

Review caught environment-controlled dependency loaders, premature Electron exit before the report was saved, and a Windows path issue in the archive verifier; all were fixed and rechecked against the rebuilt package. These checks do not prove capture permission, a clean-machine installation, uninstall behavior or every recording device. The full installer has not been executed or registered, and remains local and unsigned.

## Earlier 0.2.2 review fixes

1. **Important: installer startup on other PCs.** The old fallback wrote beside the executable and could fail in Program Files or on an unwritable K: drive. `electron/data-path.cjs` verifies writable profile/session/temp folders, prefers K: when usable, and falls back to Electron's per-user app-data path. An invalid explicit `SWOOP_DATA_DIR` reports a startup error without silently changing profiles.
2. **Important: save completion could hide newer edits.** The editor now captures one coherent name/edit/media snapshot before asynchronous work. A revision token prevents that older save from renaming or marking newer changes as saved. Saves are serialized; recording/finishing and closing during pending saves are guarded.
3. **Installer portability: bundled MP4 encoder.** FFmpeg is now included as an unpacked executable and preferred after an explicit override. Global FFmpeg is optional. The native hook is also unpacked, and the installed application ID matches its shortcuts.

The native and editor reviewers cross-reviewed each other's fixes. No additional concrete blocker was found in the scoped capture, save, project, trim, cursor, export or cancellation flows. This review is not a guarantee that manual testing cannot reveal more bugs.

## Earlier 0.2.2 executed checks

- **69 automated tests passed**: 38 engine/project/geometry tests and 31 native/data-path tests.
- **Four deferred-save runtime cases passed**, covering newer edits, coherent media snapshots, duplicate saves and cancellation.
- **Four packaged smoke checks passed**: startup/native capabilities, current compiled UI match, save/reopen, bundled MP4 UI export with global FFmpeg excluded from PATH. The output fully decodes.
- **Five installer payload checks passed**: reviewed version/runtime files, development/private-file exclusions, native hook unpacking, encoder encode/decode, license/build notices.
- Full `npm audit`: **zero vulnerabilities** after a scoped, proxy-tested downloader dependency override.

Receipts are under `artifacts/release-review/` and `artifacts/installer-0.2.2/`. The installer is local, unsigned, not executed, and has not changed application registration or uninstall entries. Installation/uninstall and the user's final feature test are still pending. Public binary distribution also requires the corresponding encoder/library source materials described in the third-party notice.

## Final test candidate

`TEST-RELEASE.cmd` opens `release/installers/0.2.4/win-unpacked/Swoop-Studio.exe` with the separate writable `K:\_data\swoop-studio-final-test` profile. It does not close or replace the user's earlier open window. Check the footer for **0.2.4**. The setup file is `release/installers/0.2.4/Swoop-Studio-Setup-0.2.4-x64.exe`.

Suggested pass: record a short screen/window take; pause and resume; move, click and hold-drag; change trail/cursor styles; save and reopen; trim and export MP4; check for doubled cursors, stutters, missing effects and audio sync. Keep the source window stationary because tracking still uses its starting bounds.

Also record a take without editing or saving a project, finish it, close the studio, and reopen the same candidate. Open it from **Recordings**, verify playback and cursor motion, and use **Show recordings folder** to confirm the original WebM remains available. A project save preserves later edits separately.

## GitHub publication

The public destination is [psigho/swoop-studio](https://github.com/psigho/swoop-studio). The release contains the Windows x64 installer, source/build materials and checksums. Application recordings, local profiles, test output and development caches are excluded. Commit attribution uses the verified GitHub account with its GitHub no-reply address; global Git author configuration is unchanged. See the current release and verification receipt for final hashes and executed checks.

# Verification receipt

Executed locally on Windows x64 on 16 October 2026 (Asia/Karachi).

## Public release 0.2.5 — 21 October 2026

The current machine-readable receipt is [docs/release-verification-0.2.5.json](docs/release-verification-0.2.5.json). Earlier sections below retain the scope and distribution status of their named local candidates.

- All **103 unit tests passed** (50 renderer/engine/project and 53 native), and the current npm audit reported zero vulnerabilities. Production build passed.
- Eight installer payload checks passed, including current runtime sources, exact original demo bytes, exclusion of recordings/private/development output, native module unpacking, MIT/GPL/LGPL license and source materials, and the exact self-built encoder binary/source hashes.
- Five packaged dependency checks and six NSIS preflight harness checks passed. Four packaged save/reopen/MP4 UI checks and four offline demo playback checks passed.
- All seven packaged recording-recovery workflows passed using the new bundled encoder for decoding. An actual self-window recording reopened with identical media and 57 cursor samples after closing without saving/exporting. A forced mid-take exit retained a byte-identical playable 1.99-second partial recording; incomplete-WebM warnings were collected separately and no interrupted cursor metadata was claimed.
- The self-built FFmpeg 6.1.6/x264 encoder passed startup/diagnostics and the real Swoop export command for VP8/Opus, VP9/Opus and H.264/AAC inputs, preserving video and audio. Resulting outputs and the included demo fully decoded. The official FFmpeg source signature was verified. Exact source archives, recipe, toolchain notices and hash records accompany the release and repository.
- The exact native-hook npm source archive matches the lockfile's integrity and all 40 installed files, including every Windows native build input. Its MIT wrapper and LGPLv3 library notices plus rebuild/replacement instructions are provided. A native-hook rebuild was not claimed.

The installer is unsigned. Full installation/uninstall, a clean Windows machine, power loss and all recording hardware were not tested. Runtime tests used isolated profiles and owned source windows; no user recording or other application was captured. Windows CI runs installation, unit tests and the editor build; its result is available in the repository's Actions tab.

## Recording recovery candidate 0.2.4 — 20 October 2026

- Production build and **102 unit tests passed**: 50 renderer/engine/project tests and 52 native tests. New coverage includes ordered chunk persistence, final-chunk draining, failed disk/Blob/metadata operations, interrupted cleanup, actual Windows file flushing, restart recovery and path/link rejection. Receipt: `artifacts/release-review/take-backup-unit-results.txt`.
- Seven recovery workflows passed against source Electron and the exact packaged executable. The packaged receipt is `artifacts/take-recovery/packaged-0.2.4/result.json`; it records media hashes, cursor samples, isolated profiles and precise capture scope.
- A real recording of the isolated studio's own window finished, closed without Save project or Export, then reopened through Recordings with identical media and all 53 cursor samples. Its raw WebM fully decoded.
- A second real self-window recording reached two distinct on-disk byte sizes before forced process exit without stopping or finalizing its recorder. After restart, the identical 1,146,355-byte partial backup reopened in the UI with a readable 1600×1000 frame and finite 1.98-second duration. The partial recording correctly has no final cursor metadata. Expected incomplete-WebM warnings were collected separately.
- Completed and interrupted generated fixtures also passed exact-byte storage/UI recovery. No page errors or network requests were collected; the test captured no other application/full desktop and did not touch user profiles or close user windows. The recovery panel screenshot was visually inspected.
- All five packaged dependency checks, six NSIS preflight harness checks and six installer payload checks passed. The payload matches seven current runtime sources and the original included demo. Receipts: `artifacts/dependency-cli-0.2.4/cli-verification.json`, `artifacts/installer-preflight-0.2.4/results.json` and `artifacts/installer-0.2.4/verification.json`.

Desktop raw backups are separate from saved project edits and are never automatically expired. Interrupted recordings recover only the bytes already written; unreadable fragments remain on disk. The test launcher uses a stable candidate profile at `K:\_data\swoop-studio-final-test`. This change cannot recreate an unsaved take discarded by an older build.

The unsigned installer remains local and has not been installed. Full installation/uninstall, power loss and a clean Windows machine were not tested; no GitHub upload occurred. Third-party source-distribution materials remain pending before public binary distribution.

## Installer candidate 0.2.3 — 20 October 2026

- All **78 unit tests passed**, including nine dependency-check regressions.
- The packaged headless checker passed all five dependency checks: supported Windows x64 runtime, 14 Electron files, exact bundled native module loading, bundled MP4 encode/decode, recording API availability and first-frame decode of the included 1080p demo. System encoder paths were excluded and dependency-loader environment overrides were deliberately poisoned. Receipt: `artifacts/dependency-cli-0.2.3/cli-verification.json`.
- All six NSIS macro checks passed: writable/blocked targets, success and failure reports, missing/stale/empty reports, executable startup failure, preserving a running fixture, and the actual packaged app checker. Receipt: `artifacts/installer-preflight-0.2.3/results.json`. These isolated harnesses create no application registration or shortcuts.
- The bundled demo played and sought offline in the packaged app, reached its end without error, and closed through Back and Escape. No network requests or renderer errors were collected. Receipt: `artifacts/bundled-demo-packaged-0.2.3/result.json`.
- All six installer payload checks passed, including current reviewed runtime sources, exact original demo bytes, private/development file exclusions, unpacked native hook, bundled encoder encode/decode and third-party notices. Receipt: `artifacts/installer-0.2.3/verification.json`.

The demo is an original 8.486-second H.264 playground export at 1920×1080, with no audio. It is bundled under `dist/demo` and opens through **Help → Watch included demo**. Its SHA-256 is `121c6979cfcd41633eb1863b3e89d28e65e1c9053a42fed21ca0c7723adff992`; provenance is in `public/demo/README.md`.

The full setup wizard has not been run, installation/uninstall and a clean Windows machine remain untested, and the user's open app was preserved. The unsigned installer is local; no GitHub upload occurred. Encoder source-distribution materials remain pending before public binary distribution, as recorded in `THIRD-PARTY-NOTICES.md`.

## Release candidate 0.2.2 — 20 October 2026

Code review fixed the startup data-directory fallback and the pending-save/newer-edit race. The local NSIS setup includes native pointer tracking and an unpacked MP4 encoder. All 69 unit tests, four save-race runtime cases, four packaged smoke cases and five installer payload checks passed. Full npm audit reported zero vulnerabilities. The packaged smoke excluded system FFmpeg and successfully saved/reopened a project and rendered/decoded MP4.

See `REVIEW-RELEASE.md`, `INSTALLER.md`, `artifacts/release-review/0.2.2/packaged-smoke.json` and `artifacts/installer-0.2.2/verification.json`. The installer has not been executed, installation/uninstall behavior is not yet manually tested, and no GitHub upload occurred. The older sections below retain their historical scope.

## Smooth trail patch 0.2.1

- Production build and versioned portable packaging passed; the previous 0.2.0 executable remains available.
- All 61 unit tests passed. New regressions cover bounded spatial corner rounding, short turns between uniform sample times, pixel arc-length clipping, U-turns, loops and stationary/malformed input. Receipt: `artifacts/smooth-trail-test/unit-results.txt`.
- Sixteen existing browser visibility/export cases passed without reducing their thresholds. All three trail styles remained visible outside the cursor head; deterministic backward seeking changed zero pixels. Receipt: `artifacts/effects-v02/proof-results.json`.
- The same fresh recording and exact recorded gesture times are used for the comparison export in `artifacts/smooth-trail-test/`. The renderer rounds the centerline and caps tail length; it does not retime recorded events or reconstruct human movement missing from the automated input.

## Cursor update 0.2.0

- Production TypeScript/Vite build and portable packaging passed. New executable: `release/v0.2.0/Swoop-Studio-win32-x64/Swoop-Studio.exe`.
- 55 automated tests passed: 20 motion/render/effect helpers, 12 project validation/roundtrip, 23 native bridge/pointer/file lifecycle. Latest receipt: `artifacts/fresh-cursor-test/unit-results.txt`; the earlier `artifacts/cursor-v02-unit-results.txt` records 53 tests before the two fast-drag regressions were added.
- Six UI checks passed, including nine distinct cursor renders, all trail/click/drag presets, live test-pad gestures and saving settings/gesture data. Receipt: `artifacts/cursor-v02-ui-results.json`.
- Sixteen browser pixel/export checks passed, including visible trails outside the cursor head, all new styles, deterministic backward seeking and a fully decoded 720p shared-renderer WebM. Receipt: `artifacts/effects-v02/proof-results.json`.
- The packaged 0.2.0 app passed all eleven capture/edit/project/export workflows listed below, with zero collected runtime errors. The current `artifacts/packaged-e2e-results.json` identifies version 0.2.0; native media capture and FFmpeg encoding were real, while file dialogs used explicit harness paths.
- New app state, session cache and export staging use `K:\_data\swoop-studio`; the packaged end-to-end test used a separate profile under the workspace's `artifacts` folder. The old executable was preserved.
- Native down/up/held-state tests cover pause, stop, visibility and multiple buttons. Physical mouse gestures in arbitrary applications and long sessions were not exercised by automation. Older recordings cannot recover missing drag data.
- A fresh dedicated-window recording used Windows automation input, with six native down/up pairs, five held movement samples, three numbered click targets and two delivered cards. The fast 18.9 ms drags exposed a minimum-duration filter; recognition now uses displacement, retaining release fading while rejecting tiny jitter. The editable project and re-export are in `artifacts/fresh-cursor-test/`. No other window or desktop content was captured.

The sections below record the original 0.1.0 delivery and its bounded test scope; the shared packaged-test receipt has been refreshed for 0.2.0.

## Application

- Swoop Studio 0.1.0, Electron 44.7.2, React 19.3.1.
- Production TypeScript/Vite build passed.
- 34 automated tests passed: 9 motion/render helpers, 10 project validation, 15 native bridge/pointer/file lifecycle.
- `npm audit` reported zero vulnerabilities for the installed dependency tree.
- A portable application was built at `release/Swoop-Studio-win32-x64`.

## Actual packaged-app end-to-end run

`scripts/native-e2e.mjs` drove the packaged executable. Its structured receipt is `artifacts/packaged-e2e-results.json` (`passed: true`, `errors: []`). Native save/open dialogs and discard confirmations were answered by the test harness with explicit fixture paths. The media capture and encoder were real.

Passed workflows:

1. Native bridge startup, FFmpeg availability and native click-hook availability.
2. Changing cursor, rendering the demo through the UI and saving H.264 MP4.
3. Saving edit state into a `.swoop` project, including normalizing an empty name.
4. Opening that project and restoring the edit.
5. Importing a generated video with audio, trimming it, and exporting WebM through the UI.
6. Embedded-media project roundtrip and restoring the source playback position to trim-in.
7. Replaying a trimmed clip after reaching trim-end, four consecutive passes.
8. Protecting an unsaved edit before starting a new take.
9. Recording the studio's own window with real Windows capture, pause/resume, pointer samples, and editing the resulting take. Self-source detection kept its window visible.
10. Saving the actual recording in a portable project.
11. Exporting the actual recorded take through the shared frame renderer.

No other application or the full desktop was recorded for this test. Physical microphone quality, long multi-hour recording, moving/resizing window tracking and arbitrary capture hardware were not exercised. Global click tracking availability and clock/coordinate behavior were checked; the automated mouse gestures use browser input rather than reproducing human hardware clicks.

## Encoded-media checks

- Full demo: `artifacts/swoop-studio-demo-1080.webm`, original Canvas content, 1920×1080 VP9, 12.056 seconds, 353 decoded frames. Playback and seeking verified; decoded frame visually inspected.
- Demo SHA-256: `bd7a95326485f672559d7722072a9a2747e68856b19eaf36f794145731085f1c`.
- Packaged UI MP4: H.264, 1280×720, approximately 2.38 seconds for the 2.4-second selected interval.
- Packaged UI imported-video export: VP9 + Opus, 1280×720, approximately 1.02 seconds for a 1-second trim.
- Packaged UI actual-recording export: VP9 + Opus, 1280×720, approximately 2.24 seconds.
- Generated tone and derived audio were decoded with audible level measured by FFmpeg. The Chrome-created synthetic Opus fixture and its derived export emit one header warning while their audio decodes successfully.
- Real-time export is not a frame-exact offline renderer. Browser scheduling and encoder flush can move the boundary by a few frames.

See `artifacts/ENGINE-VERIFICATION.md` for engine checks and `REVIEW-DESIGN.md` for the bounded visual review. Final desktop evidence is `artifacts/ui-final-1366.png` and `artifacts/ui-final-1440.png`. The reviewer marked the four listed fixes resolved at their tested scope.

## Design detector interpretation

The mechanical detector ran once. Its 173 reports comprise 168 advisory color/type/radius differences and 5 warnings. Four warnings refer to functional trim/resize handles, where colored edges identify editable timeline boundaries. The remaining warning refers to a short export progress-bar width transition. These are documented exceptions, not a claim of a clean detector pass. The final screenshot/source review judged the listed usability fixes resolved.

## Delivery boundaries

This is a local personal-use first version with one clip per project. Cursor hiding is best effort; an overlay toggle handles sources with a baked-in pointer. Window tracking uses initial geometry. Exports retain source audio where present; Windows loopback includes all system sounds. Existing Cursorful files were not modified or shipped. No public deployment or sharing occurred.

Paid media-generation API spend was $0.00. Codex/account usage, electricity and human review costs were not measured.

## Source control

A local repository was initialized on `codex/swoop-studio`, with the source staged. The initial commit could not be created because Git has no configured author name/email on this machine. No identity was invented or global Git setting changed. The complete source and executable are saved on disk.

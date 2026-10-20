# Windows installer

Download the unsigned Windows x64 installer from the
[GitHub release](https://github.com/psigho/swoop-studio/releases/latest).
Version 0.2.5 supports Windows 10 or Windows 11 on Intel/AMD 64-bit PCs. ARM64 is
not supported. Building an installer from source does not install or publish it.

Run `npm ci`, then `npm run installer`. The pinned `electron-builder` tool creates
an assisted NSIS installer in `release/installers/<version>/`. Build caches use
`K:\_cache` when K: exists, or the ignored `artifacts/.build-cache` directory. Set
`SWOOP_BUILD_CACHE` to override the cache location. The build explicitly disables
publishing.

Run `node scripts/verify-installer.mjs` after building. It checks the packaged
runtime against the reviewed sources, rejects private/development payloads,
checks the native pointer module, encodes and decodes a short MP4 with the bundled
encoder, then writes an installer SHA-256 receipt. It does not execute the
installer. Run `node scripts/check-installer-preflight.mjs` to compile and execute
the installer's actual dependency-check macros in isolated test programs. These
tests check writable/blocked targets, success and failure results, missing/stale
reports, executable launch failure and preserving an open app. The test programs
create no installation registration or shortcuts.

`node scripts/check-build-proxy.cjs` checks the downloader's proxy API
through a local loopback server; this validates the scoped `global-agent@4.1.3`
override that removes an obsolete vulnerable logging dependency from build tools.

The installation wizard offers a per-user installation and an installation
folder choice, including a writable folder on K:. It creates Desktop and Start
menu shortcuts and a Windows uninstall entry. It does not request administrator
privileges or automatically launch the app after installation. Uninstall keeps
user recordings and app data.

Desktop recordings are written into the app-data profile's `Recordings` folder
as capture runs. This folder is outside the installed application and is kept
across upgrades and uninstall. The Recordings panel shows the exact location.
Completed backups contain the original WebM and cursor metadata; interrupted
backups keep the video bytes already flushed to disk. Backups have no automatic
expiry. Project edits still require Save project.

The package allowlist contains the built editor, its bundled demo video, runtime
source files, package metadata and production dependencies. It excludes personal recorded clips,
projects, test fixtures, development scripts, Git state and build tools. Electron
and its third-party notices remain with the runtime.

WebM and MP4 export are included. MP4 encoding uses the bundled Windows x64
FFmpeg executable built from FFmpeg 6.1.6 and x264 source for this release. The
minimal build supports Swoop's WebM input and H.264 MP4 output. The reviewed binary
is `vendor/ffmpeg/win32-x64/ffmpeg.exe` in the source checkout and
`resources/encoder/ffmpeg.exe` in the installed app. Its licenses, recipe and
manifest ship with the application; see `THIRD-PARTY-NOTICES.md`.

The encoder's complete source archives are in `vendor/ffmpeg/source/`, its build
recipe is `vendor/ffmpeg/build.sh`, and `vendor/ffmpeg/manifest.json` records
SHA-256 checksums. License texts are in `vendor/ffmpeg/licenses/`. These materials
are included in the repository and source archive, and are also provided in the
release asset **Swoop-Studio-Encoder-Source-0.2.5.zip**. The installer includes the
encoder, notices and build metadata without duplicating the full source archives.
Use this recipe and the exact source archives to rebuild the release encoder;
a different system FFmpeg executable is not a substitute for the bundled release
artifact. No encoder build toolchain is required to use the installed app.

Setup runs offline dependency checks. Before extraction it requires Windows 10
or Windows 11 on an Intel/AMD 64-bit PC and tests actual write access to the
selected folder. It asks you to save and close an open Swoop Studio before an
upgrade, with Retry and Cancel options; it never forces the app to close.

After extraction, before registering shortcuts or an uninstall entry, Setup
starts the bundled app's headless `--check-dependencies` command. This checks
the Electron files, loading the native pointer module, running the bundled FFmpeg
encoder and decoding the included demo video in Chromium. It uses a temporary
isolated profile, so it does not access your normal project session or start
recording. The command must exit successfully and create a fresh, nonempty
`dependency-report.json` in the installation folder. A missing component or a
checker that cannot start stops Setup with a report location and recovery
instructions. A failed setup may leave extracted files; it does not report a
successful installation.

Node.js, npm, Ghidra, REA, a system FFmpeg installation and a separate Visual C++
redistributable are not required to use the installed app. Electron, the cursor
capture module and FFmpeg ship in the installer. Setup does not download tools
or install unrelated runtimes. Windows supplies its normal system and media
components; Windows N/KN installations need the corresponding Media Feature Pack
if the offline video check reports that media support is unavailable.

To repeat the check manually, run the installed executable with
`--check-dependencies --dependency-report="<writable-folder>\dependency-report.json"`.
This command writes its report and exits without opening the editor. The demo
video is available offline from **Help → Watch included demo**. A manual check
leaves its isolated `.swoop-check-*` scratch folder beside the report, or under an
explicit `--dependency-work-dir=<folder>`; Setup uses its own temporary directory
and removes it when Setup exits.

The executable is unsigned. Windows may display an unrecognized-publisher prompt.
See `VERIFICATION.md` for checks actually executed and their limits. The isolated
preflight tests and packaged-app checks do not establish full install/uninstall
behavior on every supported Windows configuration.

Configuration references: [electron-builder NSIS options](https://www.electron.build/nsis/),
[file selection](https://www.electron.build/file-patterns),
[NSIS scripting reference](https://nsis.sourceforge.io/Docs/Chapter4.html),
[NSIS process checks](https://nsis.sourceforge.io/NsProcess_plugin) and
[NSIS child-process execution](https://nsis.sourceforge.io/NsExec_plug-in).

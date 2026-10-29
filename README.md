# Swoop Studio

A local Windows screen recorder and editor with animated cursors, click and drag effects, and zooms.

[Download for Windows](https://github.com/psigho/swoop-studio/releases/latest) · [Release notes](CHANGELOG.md) · [Installer details](INSTALLER.md)

## Install

Download **Swoop-Studio-Setup-0.2.7-x64.exe** from the GitHub release, run Setup, then open **Swoop Studio** from the Start menu or Desktop shortcut. Supported platform: **Windows 10 version 2004 (build 19041) or later, or Windows 11, on an Intel/AMD 64-bit PC**. ARM64, macOS and Linux builds are not provided.

The installer includes the app runtime, native pointer capture, local MP4 encoder and an offline demo. You do not need Node.js, npm or a separate FFmpeg installation. Setup checks the operating system, installation folder and bundled components before completing. The installer is unsigned, so Windows may show an unrecognized-publisher prompt.

The app works offline. **Help → Watch included demo** plays an original sample of the Presenter cursor, Ribbon trail, Burst clicks and Elastic drag. You can also explore the editable playground before recording.

## Record and edit

1. Choose **New video**, select a screen or window, and choose microphone/system audio. Turn Microphone on to choose its input by name and select all, left or right channels. Choose a specific system sound output without changing your Windows default. Enable Zoom while typing to focus the camera on a text field.
2. Record after the countdown. Restore the studio to pause or finish. **Escape** finishes a take while the studio has focus; it is not a system-wide hotkey.
3. Adjust the frame, cursor effects and zoom moments in the editor. Recorded clicks and typing activity can create automatic zooms.
4. **Save project** to preserve your edit, or **Export** to create a WebM or H.264 MP4 video.

Each project edits one source clip. It includes:

- Four looks: Flow, Punch, Daydream and Focus.
- Nine cursor shapes, with adjustable color and size.
- Ribbon, Comet and Ghost trails; Ripple, Pulse, Burst and Ring click effects; Elastic, Path and Selection drag effects.
- Editable zoom timing and focus, optional typing zoom, three motion styles and three entrance animations.
- Backgrounds, aspect ratios, padding, rounded corners, window chrome, shadow and grain.
- Trim controls and WebM/MP4 export at 720, 1080 or 1440 short-edge quality, with source audio.

Exports render in real time. Leave Swoop open until export finishes. `.swoop` projects embed the original video, cursor track and edit; source recordings up to 180 MB can be embedded. Larger recordings can still be exported while open.

## Your recordings stay on disk

The desktop app writes the original video to its **Recordings** folder while recording. Open **Recordings** beside Open/Save to reopen a take or show its folder. The list also appears at startup when backups exist.

The default location is `K:\_data\swoop-studio\Recordings` when K: is writable, otherwise a folder inside your Windows user app data. The Recordings panel shows the exact location. A custom data profile has its own folder.

Completed takes include their editable cursor track. Closing without saving an edit keeps the original recording backup. **Save project** preserves your edits; **Export** creates the finished video. Recording backups never expire automatically and remain after uninstall, until you remove them yourself.

A forced close or capture/write failure can leave an interrupted take. Only video already written to disk can be recovered; the ending or cursor track may be missing. Unreadable fragments remain available in the folder. The browser preview has no automatic disk backup.

## Current limits

- Windows recording captures pixels without the Windows cursor, then adds the editable Swoop cursor. Older recordings and imported videos retain their original pixels; a cursor already baked into them cannot be removed.
- Window pointer tracking uses the window's position and size at the start of capture. Keep the selected window visible and stationary during a take. Windows excludes protected content. Closing, minimizing or resizing the selected window stops the take and keeps its backup.
- Windows system audio records the selected playback device, including any applications using it. Choose the output in recording setup; per-application isolation is not provided.
- This release has no multi-clip assembly, webcam track, transcription or cloud sharing.
- Hardware coverage and long, multi-hour recording tests are limited. See [verification scope](VERIFICATION.md) for executed checks; these do not establish support for every capture device or Windows configuration.

## Shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| Left / Right | Step one frame |
| Shift + Left / Right | Jump one second |
| Z | Add a zoom at the playhead |
| Delete | Remove selected zoom |
| I / O | Set trim start / end |
| Ctrl + Z / Ctrl + Shift + Z | Undo / redo |
| Ctrl + S / Ctrl + O | Save / open project |
| Ctrl + E | Export |
| Escape | Finish an active take or close a panel, while Swoop has focus |

## Development

Use Windows x64 and Node.js 22:

```powershell
npm ci
npm test
npm run build
npm run desktop
```

`npm run dev` starts the browser preview at `http://127.0.0.1:9347`. To use that server in Electron, set `VITE_DEV_SERVER_URL=http://127.0.0.1:9347` before `npm run desktop`. Browser mode provides playground editing, video import and WebM download. The desktop app adds pointer capture, recording backups, project dialogs and MP4 conversion.

`npm run package` creates a portable Windows folder. `npm run installer` builds the NSIS installer without publishing it. Keep every file in a portable build together; `START-STUDIO.cmd` opens the current built version when available. See [installer and encoder build details](INSTALLER.md) before distributing binaries.

The Windows CI workflow runs dependency installation, unit tests and the editor build. It does not perform desktop capture or publish releases. Local checks also cover packaged dependency checks, demo playback, project save/reopen, MP4 export and recording recovery; [VERIFICATION.md](VERIFICATION.md) records their scope and results.

The optional desktop/recovery harnesses generate owned VP9/Opus fixtures with a separate full FFmpeg build. Set `SWOOP_FIXTURE_ENCODER` to that test-only executable before running `npm run test:desktop` or `node scripts/take-recovery-test.mjs`. Swoop itself encodes and decodes with its reviewed bundled encoder.

## Licenses and provenance

The interface, demo and rendering code are original and released under the [MIT license](LICENSE). Cursorful binaries and assets are not included. Third-party components retain their own licenses. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for the bundled encoder and other notices. The encoder's source archives, build recipe and checksums are in `vendor/ffmpeg/` and the release's **Swoop-Studio-Encoder-Source-0.2.6.zip**.

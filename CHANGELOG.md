# Changelog

## 0.2.7

- Fixes saving audio recordings in portable projects when the recording MIME codec list contains a comma. Raw take backups remain readable.

- Zoom while typing creates sustained, editable camera holds around the focused caret or text field. Only timing and position are saved, never keys or text. Password fields and focus outside a selected window are excluded.
- Cursor sampling increases from 30 Hz to 120 Hz with native motion updates. Fast cursor movements use direct interpolation, avoiding the delay introduced by easing each movement. Stationary holds are compacted.
- Choose a specific system output device by name using native WASAPI loopback. Windows playback defaults remain unchanged.
- Installer includes and checks the original MIT Windows audio/focus helper and its complete source.

## 0.2.6

- Windows Graphics Capture excludes the original Windows pointer before editable cursor effects are added, preventing the second cursor during fast movement in new recordings.
- A visible **New video** button opens recording setup for a fresh take while preserving the current edit if setup is cancelled.
- Microphone selection by device name and all/left/right input routing. A selected left or right input plays in both ears.
- Recording setup shows the default Windows system-sound output and links to Windows sound settings.
- Recording backups accept Windows short-path aliases while still rejecting linked files/folders and junctions.
- Updates the bundled Electron runtime to 44.9.3.
- Installer checks the native recording helper, Windows capture API and graphics device. Requires Windows 10 version 2004 (build 19041) or newer, or Windows 11, on x64.

The Windows capture helper and its complete MIT-licensed source/build recipe accompany the app. Existing clips with an original cursor baked into their pixels retain it.

## 0.2.5

First public Windows x64 release.

- Screen/window recording with optional microphone and system audio.
- One-clip editor with trim, framing, backgrounds, animated zooms and WebM/H.264 MP4 export.
- Nine cursor shapes, smooth trails, click effects and drag effects, with editable cursor tracks for completed recordings.
- Recording backups written during capture, a Recordings browser, and recovery of readable video from interrupted takes. Backups never expire automatically; project edits still require Save project.
- Offline installer checks for Windows support, folder access, runtime components, native pointer capture loading, encoding and included-demo playback.
- Original demo video available from Help.
- A bundled minimal FFmpeg 6.1.6/x264 encoder with accompanying source and build materials.

The installer is unsigned. Supported platform is Windows 10/11 on Intel/AMD x64. See [README.md](README.md) for recording, recovery and capture limitations and [VERIFICATION.md](VERIFICATION.md) for tested scope.

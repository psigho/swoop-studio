# Included Swoop demo

`Swoop-Studio-Demo.mp4` is an existing local Swoop export, included for offline viewing from **Help → Watch included demo**. It shows the Presenter cursor, Ribbon trail, Burst clicks and Elastic drag in the editable playground. It is a playground sample, not a separate desktop recording.

- Source: `artifacts/smooth-trail-test/smooth-trail-motion-demo.mp4`
- Source export: Swoop Studio 0.2.1, 2026-10-16; recorded by `scripts/smooth-trail-demo.mjs`.
- Media: H.264, 1920 × 1080, 8.486 seconds, no audio track.
- Size: 3,186,096 bytes.
- SHA-256: `121c6979cfcd41633eb1863b3e89d28e65e1c9053a42fed21ca0c7723adff992`.
- Asset creation uses the application's own original playground and cursor renderer. No media generation service was used.

Vite copies this directory into `dist/demo/`; the Windows installer includes that directory inside the application archive. Playback uses Electron's video element, with no external player or network dependency. Keep this file as the one canonical source copy for future builds.

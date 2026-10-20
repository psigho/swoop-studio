# Cursor effects update — Swoop Studio 0.2.1

The studio layout is preserved. Cursor controls now have Pointer, Trail, Click and Drag tabs and an interactive test pad.

## Smooth trail patch

Version 0.2.1 rounds the trail's centerline, preserves short captured turns, and replaces the crossing polygon with a single rounded shape. A tail is capped at eight cursor widths so extremely fast jumps cannot draw a long zigzag across the page. Ribbon, Comet and Ghost keep their controls; a thin outer shape keeps pale trails visible on pale content. The current cursor head and recorded click/drag times are unchanged.

All 61 unit tests passed, including bounded corner rounding, fast-drag timing, reversals, loops, age interpolation and stationary samples. All sixteen browser effect/export checks passed with the existing visibility thresholds; backward seeking reproduced identical pixels.

## What changed

- Fixed the nearly invisible trail. The old effect used six faint cursor copies across only 156 ms. New ribbon, comet and ghost trails use evenly timed history, adjustable 0.12–1.2 second duration and 0–100% strength.
- Added Presenter, Outline, Neon and Spotlight, bringing the cursor library to nine styles. Presenter uses an original tutorial-style yellow highlight. These are original drawings, with no claim to reproduce Zaid's exact cursor.
- Added Ripple, Pulse, Burst and Ring click treatments, with their own color and size.
- Added Elastic, Drag path and Selection drag treatments. New recordings preserve button down/up and held state alongside positions; pause, release, visibility and stop handling keep gestures bounded.
- Added a live test pad with its own pointer movement, clicks and dragging, using exactly the same drawing layer as preview and export. Its demo loop runs without recording the desktop.
- Saved projects retain the new controls and gesture data. Older projects get default settings; old click-only tracks do not invent drags.

## Try it

1. Open the new build using the desktop shortcut or START-STUDIO.cmd. The footer identifies version 0.2.1.
2. Choose **Cursor → Trail → Ribbon**. Move inside **Try it here** to see it clearly; use **Run demo** for automatic movement.
3. Try **Pointer → Presenter**, then **Click → Burst** and **Drag → Elastic**. Hold and move inside the test pad.
4. Make a fresh recording to retain drag gestures from real applications. The previous version recorded clicks without complete release/held data.

Trails need movement; they fade when the pointer stops. Imported videos have no separate cursor track, so the test pad remains the best way to explore effects before making a recording. Sources with a baked-in pointer still use the existing Cursor effects toggle to avoid doubled cursors.

## Update delivery

Version 0.2.1 is packaged at `release/v0.2.1/Swoop-Studio-win32-x64/Swoop-Studio.exe`. The earlier builds remain available at their original paths so a running window or unsaved recording is not overwritten.

The new build keeps its settings, browser cache and export staging files in `K:\_data\swoop-studio`. Its separate profile lets it run beside the earlier version without interrupting that window.

## Verification

Automated coverage includes project roundtrip/defaults, native press/release and pause/stop transitions, deterministic trail sampling, release fading, legacy tracks and visibility boundaries. UI tests selected all nine cursors and confirmed distinct rendered pixels; all trail/click/drag presets and the live pad were exercised. Pixel tests compare each new effect with a disabled baseline, and a short shared-renderer WebM is fully decoded with FFmpeg.

All 55 automated tests passed. The packaged 0.2.0 executable also passed 11 end-to-end workflows, including real capture of its own window, pause/resume, portable projects and MP4/WebM export. A separate fresh window capture with Windows automation retained six down/up pairs and both card drags. That test exposed and fixed fast drags being suppressed by a 60 ms duration floor; movement distance now distinguishes them from click jitter. Physical human mouse gestures and long recording sessions remain manual testing work.

Current detailed receipts:

- `artifacts/cursor-v02-ui-results.json`
- `artifacts/cursor-v02-unit-results.txt`
- `artifacts/packaged-e2e-results.json`
- `artifacts/effects-v02/proof-results.json`
- `artifacts/effects-v02/effects-contact-sheet.png`
- `artifacts/effects-v02/cursor-effects-demo.webm`

Research references and observed scope are documented in CURSOR-REFERENCES.md. No paid media-generation service was used.

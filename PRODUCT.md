# Swoop Studio

<!-- impeccable:product-schema 1 -->

## Platform
web

The interface is a local Electron desktop application for Windows. It is an editing tool, not a hosted website.

## Stack
Delegated by user: choose the stack and creative direction autonomously. Electron 44.7.2, React, TypeScript, Vite, Canvas 2D, MediaRecorder, local FFmpeg for optional MP4 conversion. No hosted service or model API is required.

## Users
Junaid, making personal screen recordings, demonstrations and explainers on his Windows PC. The user wants something good, fun and engaging and has delegated design decisions while asleep.

## Product Purpose
Record a screen or window, turn recorded cursor movement and clicks into editable cinematic zooms, customize cursor appearance and framing, preview, and export locally.

## Capabilities and Constraints
Whole-screen/window capture; optional microphone and supported system audio; playback and trim; editable zoom regions; cursor styles, size, color, trail and click ripples; animated framing; aspect ratios; imported video; save/open projects; local WebM export and MP4 via installed FFmpeg. A generated demo makes first use inspectable without recording the user's desktop.

Implementation priorities inferred from broad brief: reliable source capture and local export first, expressive motion with editable controls second. Exact proprietary Cursorful algorithms and assets are not required or copied. Read-only REA investigation provides architectural evidence. Installed Cursorful remains intact.

## Operating Context
Windows desktop with 1366x768 minimum practical editing canvas. Browser preview supports demo, import, editing and WebM download; native desktop recording and file dialogs use the Electron bridge. No automatic recording of the user's activity. Project files remain local.

## Product Principles
The video is the center of the workspace. Every displayed control changes the output or manages a real workflow. Clear recording state and permission boundaries. Preview and export share one renderer. Motion has character without compromising readability.

## Evidence on Hand
Cursorful desktop package is Electron with native cursor/window/input modules. REA analyses and Ghidra cursor module evidence are in K:\Antigravity Projects\cursorful-investigation. That investigation is partial and does not establish full app behavior.

## Cursor effects update (0.2.0)

The user approved the existing layout and asked for a visible trail, more tutorial-style cursors, richer click effects and dragging cues. The layout is preserved. The Cursor inspector now includes a shared-renderer live test pad, nine shapes, three trail styles, four click styles and three drag cues. New capture preserves down/up/held state. Existing click-only tracks remain valid without fabricated drags.

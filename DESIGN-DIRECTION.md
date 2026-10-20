# Swoop Studio direction

Reading this as: a Windows creative editing tool for Junaid's personal demonstrations, with a precise studio-console language and an expressive output canvas. Mode: Operate. Design variance 5, interface motion 3, preview motion 8, density 7.

## Authorization and visual evidence

Junaid explicitly delegated decisions while asleep: "you can cook a lot ... have fun give me something good fun and engaging". The unattended choice is recorded here; no additional approval gate is inferred.

I opened https://cursorful.com/editor in Codex's in-app browser and inspected its actual rendered screenshot on 2026-10-16. The live editor has a top file toolbar, large central video stage, transport underneath, a timeline below, and a right inspector for background, cursor, and click treatment. A small vertical tool column separates stage and inspector. The transferable technique is direct manipulation near a large preview and persistent time controls. Swoop will increase contrast, reduce scattered settings, and keep the working state visible. It will not reproduce Cursorful's mint identity, assets, or proprietary implementation.

The ui-ux-pro-max direction engine was run. Its marketing-hero pattern and Fredoka/Nunito pairing are wrong for a precision editor and were rejected on product grounds. Its restrained accent and short interaction guidance carry forward. Impeccable context and new-work playbooks were read. The concept seed ran after PRODUCT.md existed, key 2390d93f, assigned grounded candidate 6; its output completed before a Windows libuv shutdown assertion returned exit 1. No visual artifact code preceded that run.

## Grounded candidate set

1. Nonlinear editing workstation: strong time hierarchy, a familiar stage/timeline relationship.
2. Tethered photography desk: a dominant preview with a compact treatment inspector.
3. Animation graph workspace: motion parameters become readable and adjustable.
4. DJ performance desk: capture and playback state is visible from a distance.
5. Camera field monitor: restrained chrome, safe framing, exact time readout.
6. Broadcast control console: a fixed operational grid, source status, decisive record/export controls and color only where it carries state. Selected by the seed and accepted under delegated authority.
7. Animatic contact sheet: rapidly comparing framing and camera movement recipes.

The broadcast console earns the selection because recording and editing are time-sensitive operations: source, recording state, time, playback and final output stay in known places. We adapt the discipline rather than drawing physical knobs, meters without signals, or decorative hardware.

## Challenger evaluation

Axes: audience identification and product clarity. These remain recorded alternatives, not hidden discarded steps.

- Variable-font specimen: competitive on immediate treatment feedback, lower product clarity because the real screen/timeline relationship is displaced. Raise retained: every continuous parameter visibly changes the preview without an Apply step.
- Design annual plate: declined on both axes for an everyday editor. Raise retained: consistent baseline alignment and exact frame boundaries. No registration marks, stamps or enormous typography.
- Orienteering map: declined on both axes. Raise retained: source media stays fixed while edit instructions remain a distinct overlay layer.
- Cassette j-card: declined on both axes. Raise retained: duration and running time always reconcile; decorative handwriting and physical flips would obstruct editing.
- Botanical folio: declined on both axes. Raise retained: preset comparisons share the same exact sample frame and scale.
- Vertical video feed: declined on both axes. Raise retained: the current video owns the central field; no feature banners compete with it.

## Six-block build spec

### What

Swoop Studio, a local Windows screen-recording and motion studio. The first viewport is a working editor with a generated demo. One can immediately play it, change cursor and camera motion, then record or import a real clip and export locally.

### Structure

- Fixed desktop application shell, no document scrolling. Native Windows title bar may remain; app header 56px.
- Header: compact Swoop symbol and product name, project title, quiet saved state. Import and Record stay explicit. Export is the decisive far-right action.
- Main body at 1366x768: 64px left tool rail; optional 188px asset/preset column that collapses; flexible preview; 260px right inspector. At 1440 and above the optional panel may grow to 204px, inspector to 280px.
- Left tool rail: Studio, Motion, Cursor, Canvas, Audio, each with icon and short label or tooltip. The active item has one tangerine vertical indicator and a neutral selected surface.
- Stage: centered 16:9 or chosen-aspect composition, fit within available space with at least 24px breathing room; real generated demo or user's media is the stage content. Canvas may be colorful. Chrome is quiet.
- Under-stage transport, 44px: play/pause, current and total time, volume, fit/zoom. Time uses tabular figures.
- Bottom timeline 210px at 768px height, 236px with more vertical room. Ruler, source strip and zoom/motion tracks are visibly separate. A tangerine playhead crosses them. Selected zoom regions expose their parameters in the inspector. Editing controls remain above tracks, never floating over the video.
- Inspector: section title, short contextual sentence, paired label/value rows, sliders, selects, color wells, and compact style tiles. Tool choices change the inspector, not the entire page.
- First-run prompt lives only inside an empty stage with Record screen, Import video, and Try demo. Demo selection opens a real playable generated clip and its editable motion data. No marketing feature cards.

### Style / DNA

- Shell #171918; panels #202320; raised controls #292D28; field #141613; dividing border #373D35.
- Primary text #F3F5ED, secondary #A8AFA4, subdued #7F897B. Important functional labels must satisfy AA contrast.
- Sole chrome accent tangerine #FF834D. On tangerine, use ink #23170F. Lime #D7F28B belongs to preview cursor treatments, waveform/signal confirmation, or preset artwork, not competing primary buttons.
- Typeface Segoe UI Variable, Segoe UI, system sans-serif. Product labels 13px, supporting labels 12px, section names 14px/600, panel heading 18px/600. No display-face pairing. Time has font-variant-numeric: tabular-nums.
- Corner system: 6px controls, 10px panels, 12px video frame. No pill treatment except a true segmented control or compact status indicator.
- One icon family, Phosphor, consistent 1.5/regular weight. No bespoke drawn interface icons. Cursor shapes belong to the compositor and must not be confused with the editing pointer.
- Thin neutral borders define surfaces. Shadow belongs mainly to the video frame. No glass panels, decorative mesh, grain across chrome, oversized type, eyebrows, em dashes, or colored empty widgets.

### Motion

- UI hover/selection/focus feedback 120-180ms, state transitions 180-220ms. No entrance choreography or decorative loops.
- Output recipes: Glide (smooth focus following), Punch (quick push with a gentle settle), Orbit (subtle camera sway), Spotlight (focused cursor emphasis). They modify the actual renderer and export, rather than animate editor chrome.
- Cursor treatments: Studio arrow, Bold arrow, Halo, Dot. Adjustable size/color, smoothing, trailing glow, click ripple and press squash. Sample tiles use a common frame and deterministic cursor event sequence.
- Preset selection should show its change in the current frame and next playback cycle immediately. Controls need no Apply button.
- Reduced-motion setting snaps interface transitions; output motion remains an explicit creative choice with a separate intensity control.

### Stack

Electron 40, React, TypeScript, Vite, Canvas 2D shared preview/export renderer, MediaRecorder, optional installed FFmpeg for MP4. Local by default. Use semantic form controls and Phosphor icons. Self-host assets or use system fonts. Minimum desktop target 1366x768; at narrower browser preview widths collapse the optional asset panel before sacrificing the stage.

### Reference

Actual observed Cursorful web editor: https://cursorful.com/editor. Craft ceiling is the clarity of professional NLE workspaces with the speed of a focused screen recorder. The reference contributes hierarchy and task relationships. Broadcast-console discipline contributes fixed locations, state visibility and precise controls. The user's media and chosen cursor/motion effects provide the personality.

## Direction contract

- Primary task: record/import, shape movement and framing, preview and export a screen demonstration.
- First impression: an already-working studio with an engaging demo, not a landing page or settings dashboard.
- Signature: a single recording responds to motion recipes and expressive cursor treatments while all edits stay inspectable on a timeline.
- Honest risk: a graphite editor can feel familiar. Distinction must come from exceptionally convincing output motion, beautiful sample content, careful timing and the responsiveness of controls, not decorative UI eccentricity.
- Must verify: 1366x768 and 1440x900; no clipped bottom controls, no horizontal page scroll, 44px primary hit targets, visible focus, keyboard Space playback, Escape close dialogs, readable selection and disabled states. A selected treatment, saved state, successful export and recording activity must never be implied without real application state.
- Implementation order: functional editor skeleton, shared renderer/demo, source capture/import, cursor and motion inspector, timeline editing, project save/open, local export, then one bounded visual review and correction pass.

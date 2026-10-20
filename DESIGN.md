---
name: Swoop Studio
description: A local recording studio with expressive video and quiet, precise controls.
colors:
  accent: "#ff834d"
  accent-ink: "#23170f"
  shell: "#171918"
  panel: "#202320"
  raised: "#292d28"
  border: "#373d35"
  text: "#f3f5ed"
  muted: "#a8afa4"
  field: "#141a10"
  focus: "#ffae83"
typography:
  body:
    fontFamily: "Manrope Variable, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  title:
    fontFamily: "Manrope Variable, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 750
    letterSpacing: "-0.4px"
  section:
    fontFamily: "Manrope Variable, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 700
  label:
    fontFamily: "Manrope Variable, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  button:
    fontFamily: "Manrope Variable, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 650
  time:
    fontFamily: "Manrope Variable, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  modal:
    fontFamily: "Manrope Variable, Segoe UI, sans-serif"
    fontSize: "23px"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "-0.8px"
rounded:
  compact: "4px"
  field: "5px"
  segmented: "6px"
  button: "7px"
  preview: "8px"
  dialog: "15px"
spacing:
  tight: "6px"
  control-gap: "8px"
  compact-panel: "13px"
  inspector-inset: "17px"
  toolbar-inset: "18px"
  dialog-inset: "26px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 13px"
    height: "36px"
  button-header-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 13px"
    height: "44px"
  button-subtle:
    backgroundColor: "#2b302a"
    textColor: "#e5e9df"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 13px"
    height: "36px"
  number-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "7px"
  demo-tag:
    textColor: "#c7d2bf"
    rounded: "3px"
    padding: "3px 5px"
---

# Design System: Swoop Studio

## Overview

**Creative North Star: "The recording desk"**

Swoop uses a fixed graphite workbench for recording, framing and editing time-based media. The chrome is restrained and compact; the video carries color, motion and personality. Stable tool locations, clear time readouts and direct preview feedback matter more than decorative animation.

This document records the built interface after its bounded correction pass. The actual typeface is locally bundled Manrope Variable and the actual icon family is Lucide. The earlier Segoe/Phosphor proposal in DESIGN-DIRECTION.md remains historical direction evidence, not the current implementation specification.

**Key Characteristics:**

- One warm orange action and selection family over green-tinted graphite neutrals.
- A tight single-family type ramp with tabular time values.
- Persistent source, timeline and inspector relationships.
- Expressive content inside the preview; quiet, immediate editor controls.

## Colors

The shell uses subdued green-tinted neutrals, with warm orange reserved for decisive actions and active editing state.

### Primary

- **Tangerine** (`accent`): Export, Record icon, selected treatment outline and playhead.
- **Warm ink** (`accent-ink`): readable text and icon foreground on the solid tangerine action.
- **Peach focus** (`focus`): the visible keyboard focus outline.

### Neutral

- **Graphite shell** (`shell`): outer workspace.
- **Panel graphite** (`panel`): standard panel layer; some adjacent panel surfaces use the close source value #20231f.
- **Raised graphite** (`raised`): controls and hover surfaces.
- **Moss-grey rule** (`border`): panel boundaries.
- **Chalk text** (`text`) and **sage-grey support** (`muted`): primary and secondary functional copy.
- **Deep field** (`field`): editable number controls.

**The Output Color Rule.** Canvas backgrounds and cursor colors may be saturated. They describe the video being made; they do not introduce a competing chrome action color.

## Typography

All interface roles use Manrope Variable, locally bundled through @fontsource-variable/manrope, with Segoe UI and sans-serif fallback. Lucide provides the consistent interface icon vocabulary. No display/body pairing is present.

The normal body is 12px/500. Panel titles are 14px/750; section names 12px/700; functional labels and button copy 11px; supporting descriptions 10px. Timecode is 11px with tabular numerals. Modal headings are 23px/750, line-height 1.3. The wordmark is a separate compact brand treatment and should not become a general heading style.

**The Readable Control Rule.** Preserve the final 11px functional label and 10px time-ruler sizes when adding comparable controls. Remaining smaller metadata in the current status strip, trim fields and minor timeline furniture is not a size precedent for new input labels.

## Layout

At the practical desktop baseline, the shell has four columns: 64px tool rail, 188px preset library, flexible preview/workbench with a 330px minimum, and 260px inspector. The top bar is 60px and status strip 27px. The workbench keeps a 44px source toolbar, flexible stage, 56px transport and 210px timeline. Stage content fits the chosen aspect ratio within the measured available rectangle.

At widths of 1550px and above, the rail/library/inspector become 68/210/280px and the timeline 225px. At widths up to 1190px, the library collapses, retaining the tool rail, workbench and inspector. At heights up to 760px the header becomes 56px, timeline 195px and transport 50px. The application currently has a minimum page width of 860px and shell height of 650px; it is a desktop workspace rather than a phone surface.

The inspector scrolls independently, with its footer pinned. The preset library also scrolls when its content exceeds the available height. Maintain these task regions rather than introducing page-level document scrolling.

## Elevation & Depth

Tonal surfaces and thin boundaries provide most separation. The video receives an offset soft drop shadow; dialogs and transient notifications lift above the workbench with larger neutral shadows. Controls use very slight depth, never a large colored glow.

- Stage filter: `drop-shadow(0 12px 26px #0004)`.
- Primary action shadow: `0 2px 4px #0002`.
- Dialog shadow: `0 24px 80px #0008`.
- Notification shadow: `0 8px 24px #0006`.

## Shapes

Corners are compact: 4px numeric details/segments, 5px fields, 6px segmented containers, 7px buttons, 8px treatment previews and 15px focused dialogs. Circle silhouettes are reserved for playback, status dots, color wells and cursor-related choices. Thin borders carry structure; selected orange outlines remain legible against the neutral surfaces.

## Components

### Buttons

Solid tangerine is reserved for the primary workflow. Header Import, Record and Export controls are 44px high; the play button is a 44px circle. Other `.button` instances remain compact at 36px. Standard ghost icon utilities are 31px, and the rail has 51x57px targets. Header and playback target sizes are the precedent for new primary controls.

Primary hover changes to #ff9a6c. Subtle buttons use #2b302a with a #42483d border. Record has a quiet warm surface #30271f and peach text #ffc4a7. Disabled controls lower opacity to .38. Focus is a 2px peach outline with 3px offset. Hover/state transitions are about 140ms.

### Inputs and choices

Sliders align label and value above the track. Their visible track is 3px and thumb 9px; associated labels are 11px and value readouts 10px. Number fields use a dark surface, thin border and 5px corners. Toggles use a compact orange selected switch and a native checkbox as the interactive input. Segmented choices retain neutral inactive labels and a warm filled selected state.

### Navigation and panels

The left rail combines a Lucide icon with a short label and neutral/tangerine selection. The right inspector has text tabs and a clear active underline. Preset thumbnails are real canvas renders of the same sample, with a tangerine outline and check on the chosen look. Panel titles and supporting copy share a fixed baseline rhythm.

### Timeline and preview

Time ruler, video strip and zoom region lane remain visually separate. Zoom regions use a muted green fill at rest and warm orange/brown selection, with distinct grab and edge-resize affordances. The playhead uses tangerine across the ruler and tracks. Focal points are mapped from the fitted preview back through actual framing and camera geometry.

### Dialogs and feedback

Recording, export and shortcut dialogs use one 560px focused surface, dark scrim, scrollable height cap and visible close action. Focus enters the dialog, Tab is contained, focus restores on close and editor shortcuts are blocked behind it. Escape is handled before editable-field exclusions. Notifications and errors name the concrete outcome or recovery. Recording activity uses an explicit dock, elapsed time, pause state and finish action.

## Do's and Don'ts

### Do:

- **Do** keep the video larger and more expressive than the editor chrome.
- **Do** use the orange family for action, selection, playhead and focus state.
- **Do** preserve tabular numbers for duration, timing and numeric controls.
- **Do** update preview output immediately when a treatment changes.
- **Do** keep primary actions at the corrected 44px hit size.
- **Do** respect reduced-motion for interface transitions while keeping creative output motion an explicit setting.

### Don't:

- **Don't** turn the editor into a landing page with feature cards or oversized headings.
- **Don't** introduce a second icon family or an external font request.
- **Don't** copy the residual tiny metadata sizes into new functional form labels.
- **Don't** animate content visibility behind scroll or delay access to the editor with entrance choreography.
- **Don't** imply recording, saving or export success without real application state.

## Cursor effects panel extension (0.2.0)

The main studio layout and tokens are preserved. The Cursor inspector uses compact Pointer/Trail/Click/Drag tabs, one 320×166 logical-pixel test canvas, live thumbnails of actual cursor shapes, and the existing toggle/slider/color-control system. The test pad shares drawPointerLayer with preview and export. Its demo loop gives immediate effect feedback; pointer interaction switches it to live mode. Creative colors belong to video/effect content; interface chrome retains tangerine selection.

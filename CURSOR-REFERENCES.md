# Cursor effects references

Research date: 16 October 2026. Existing Swoop layout is approved; these are additive effect references.

## Primary sources checked

- [PowerToys Mouse utilities](https://learn.microsoft.com/en-us/windows/powertoys/mouse-utilities): Microsoft's current documentation describes Circle highlight, Spotlight and Ripple modes; separate primary/secondary button colors; persistent highlighting; and configurable pulse size, intensity and duration. The documented Ripple default duration is 480 ms. Its held ripple can follow the pointer while dragging. These are documentation observations, not a hands-on PowerToys test.
- [Screen Studio cursor guide](https://screen.studio/guide/cursor): documents cursor size, macOS/Touch types, idle hiding, movement rotation, shake removal and original cursor type optimization. These confirm the value of distinct cursor silhouettes and calm motion. No software assets were copied.
- [Official zSecurity tutorial page](https://zsecurity.org/hidden-wi-fi-networks-dont-exist/), linked [YouTube recording](https://www.youtube.com/watch?v=iQpJEIWKfns): followed the official page's embedded video and visually inspected public playback. At approximately 3:02, a small white I-beam is visible over the black terminal. Other sampled moments contained presenter/B-roll. These samples do **not** establish that Zaid uses a yellow halo, nor a specific custom cursor pack. Do not label a preset an exact Zaid reproduction.

## Recommended Swoop treatment

The following are original implementation recommendations, not claims that the references have these exact settings.

1. **Presenter:** crisp outlined arrow with a soft yellow halo. Keep the halo translucent enough for readable code. Label it Presenter, not Zaid.
2. **Precision:** slender crosshair or small target ring for pointing at exact controls or code.
3. **Spotlight:** a clear focus circle that can stay visible while a long explanation pauses the pointer.
4. **Trail:** connected tapered motion ribbon with a contrasting fine core, instead of nearly transparent isolated dots. Preserve recent actual positions for about 250–400 ms and fade by age. It should stay recognizable over both black terminals and white pages. Avoid a line spanning teleports or unrelated cursor samples.
5. **Click:** animate at the original click location. Offer ripple, pulse and burst variations. Give secondary clicks a distinguishable color/shape. A 400–550 ms duration is a sensible starting range.
6. **Drag:** show a held ring attached to the pointer plus a subdued path from press to current position; finish with a release pulse. Only show this when actual button-down/button-up telemetry exists. Legacy clicks or imported videos without pointer telemetry must not invent drag actions.

## Verification targets

- Compare trail on/off at the same moving frame over light and dark content.
- Verify click initiation, continuous held movement and release as separate moments.
- Confirm seeking does not leave stale trails or stuck drag states.
- Verify effects in exported video as well as the editor preview.
- Make unavailable pointer data obvious; a source video by itself does not supply editable cursor tracking.

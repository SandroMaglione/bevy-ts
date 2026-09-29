---
"@typeonce/bevy-ts-browser": minor
---

Add `Touch`: on-screen touch controls over an element.

- A floating stick that appears where the thumb lands in its region, with a dead zone and a tilt of length 0 to 1.
- Buttons with `held`/`pressed`/`released` edges that survive taps shorter than a frame. Buttons with an `aimRadius` aim by dragging (Brawl Stars style), and the aim is reported on the release. A cancelled touch (system gesture, window blur) releases with `cancelled: true`.
- Each finger belongs to one control, so moving and attacking work at the same time. The layout is a function of the element's size.
- `view()` returns live positions for drawing the controls, and `scripted(buttons, timeline)` plays timelines for tests.
- Sets `touch-action: none` on the element while tracking.

`Pointer.track` now ignores touch pointers by default (new `pointerTypes` option, default `["mouse", "pen"]`), so a finger on an on-screen control is not also a click.

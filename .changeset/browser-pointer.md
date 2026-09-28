---
"@typeonce/bevy-ts-browser": minor
---

Add `Pointer`: mouse and pen input over one element, with element-relative position, whether the pointer is over the element, and `primary`/`secondary`/`middle` button states with press/release edges that survive clicks shorter than a frame. It captures the pointer while a button is held, suppresses the context menu by default, and releases buttons on window blur. `Pointer.scripted`, `Pointer.recording`, and `Pointer.parseTimeline` mirror the keyboard timeline helpers for tests and replays.

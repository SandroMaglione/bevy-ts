---
"@typeonce/bevy-ts-browser": minor
---

`Touch` layouts take an optional `swipe` area: a finger landing there, and not on a button or the stick, reports how far it moved since the previous snapshot (`snapshot().swipe.delta`, in CSS pixels). This enables Genshin Impact-style controls: move with the stick on the left, and swipe anywhere else to turn or look around. Scripted timelines take `swipe` deltas per frame.

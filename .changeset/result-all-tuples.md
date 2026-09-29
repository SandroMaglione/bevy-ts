---
"@typeonce/bevy-ts": patch
---

`Result.all([a, b])` now infers a tuple, so the success value keeps each position's type (`readonly [number, string]` instead of `readonly (string | number)[]`).

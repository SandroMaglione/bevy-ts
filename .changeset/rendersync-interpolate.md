---
"@typeonce/bevy-ts-pixi": minor
---

`RenderSync.system`'s `transform` is optional: without it, `apply` runs on creation and on `redrawOn` changes only (callbacks see `transform: undefined`), for games that place nodes every frame some other way. New `RenderSync.interpolate(Game, { registry, previous, current, clock, place })` draws fixed-step movement smoothly: every run it places each node at `previous + (current - previous) * alpha`, with `alpha` from a clock service such as `FixedLoop`'s render callback. Both components must hold `{ x, y }` and the clock must provide `alpha`, checked at compile time.

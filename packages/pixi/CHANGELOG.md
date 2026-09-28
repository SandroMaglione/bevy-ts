# @typeonce/bevy-ts-pixi

## 0.2.0

### Minor Changes

- 4b3a312: `InputCapture.system(...)` and `RenderSync.system(...)` accept `when`, run conditions like a system's own. A gated capture takes no snapshots meanwhile, so presses stay in the device until it resumes (pauses, hit-stop); a gated render sync catches up on additions, changes, and removals when it runs again. The machines the conditions read are requirements of the generated system.
- 4b3a312: `RenderSync.system`'s `transform` is optional: without it, `apply` runs on creation and on `redrawOn` changes only (callbacks see `transform: undefined`), for games that place nodes every frame some other way. New `RenderSync.interpolate(Game, { registry, previous, current, clock, place })` draws fixed-step movement smoothly: every run it places each node at `previous + (current - previous) * alpha`, with `alpha` from a clock service such as `FixedLoop`'s render callback. Both components must hold `{ x, y }` and the clock must provide `alpha`, checked at compile time.

### Patch Changes

- Updated dependencies [4b3a312]
- Updated dependencies [4b3a312]
- Updated dependencies [4b3a312]
- Updated dependencies [4b3a312]
- Updated dependencies [4b3a312]
- Updated dependencies [4b3a312]
  - @typeonce/bevy-ts-browser@0.2.0
  - @typeonce/bevy-ts@0.2.0

## 0.1.1

### Patch Changes

- c95a102: First release published from CI through npm trusted publishing, with provenance attestations. Declarations are now verified against consumers on both TypeScript 7 and TypeScript 6. No API or output changes.
- Updated dependencies [c95a102]
  - @typeonce/bevy-ts@0.1.1
  - @typeonce/bevy-ts-browser@0.1.1

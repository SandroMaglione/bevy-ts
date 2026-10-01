# @typeonce/bevy-ts-pixi

## 0.3.0

### Patch Changes

- 2b0fb7e: Add `Game.Condition.check(name, access, predicate)` (types in `@typeonce/bevy-ts/Condition`): a run condition computed by ordinary code, so conditions need no growing set of combinators. A check declares its reads like a system and receives them read-only. It may read resources, machines, and queries with no write slots and no `added`/`changed` filters; events, transition events, removed/despawned reads, relation failures, and services are compile errors, as are other games' descriptors and non-boolean predicates. Its reads become requirements of whatever it gates, through `not`/`and`/`or`, a system's `when`, and `Schedule.when`. Checks are evaluated before each gated system against committed values, so they see writes from earlier systems in the same run, and they never advance the world tick or a reader cursor. A throwing predicate propagates like a throwing system. Devtools render checks as `check(name)` and count their reads as the gated system's reads.

  Conditions now carry their requirements in one type-level field, read with `ConditionNeeds` / `ConditionNeedsFromConditions`. `MachineNeedsFromCondition(s)` remain and extract only the machines. `InputCapture.system` and `RenderSync` (`system`, `interpolate`) pass a check's requirements through their `when` option.

- Updated dependencies [2b0fb7e]
- Updated dependencies [c4d1add]
- Updated dependencies [bd9bdd5]
- Updated dependencies [bd9bdd5]
- Updated dependencies [94bdc32]
- Updated dependencies [421a727]
- Updated dependencies [f196f48]
- Updated dependencies [bd9bdd5]
  - @typeonce/bevy-ts@0.3.0
  - @typeonce/bevy-ts-browser@0.3.0

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

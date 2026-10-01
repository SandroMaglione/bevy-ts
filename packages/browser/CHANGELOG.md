# @typeonce/bevy-ts-browser

## 0.3.0

### Minor Changes

- 421a727: Add `Touch`: on-screen touch controls over an element.

  - A floating stick that appears where the thumb lands in its region, with a dead zone and a tilt of length 0 to 1.
  - Buttons with `held`/`pressed`/`released` edges that survive taps shorter than a frame. Buttons with an `aimRadius` aim by dragging (Brawl Stars style), and the aim is reported on the release. A cancelled touch (system gesture, window blur) releases with `cancelled: true`.
  - Each finger belongs to one control, so moving and attacking work at the same time. The layout is a function of the element's size.
  - `view()` returns live positions for drawing the controls, and `scripted(buttons, timeline)` plays timelines for tests.
  - Sets `touch-action: none` on the element while tracking.

  `Pointer.track` now ignores touch pointers by default (new `pointerTypes` option, default `["mouse", "pen"]`), so a finger on an on-screen control is not also a click.

- f196f48: `Touch` layouts take an optional `swipe` area: a finger landing there, and not on a button or the stick, reports how far it moved since the previous snapshot (`snapshot().swipe.delta`, in CSS pixels). This enables Genshin Impact-style controls: move with the stick on the left, and swipe anywhere else to turn or look around. Scripted timelines take `swipe` deltas per frame.

### Patch Changes

- 2b0fb7e: Add `Game.Condition.check(name, access, predicate)` (types in `@typeonce/bevy-ts/Condition`): a run condition computed by ordinary code, so conditions need no growing set of combinators. A check declares its reads like a system and receives them read-only. It may read resources, machines, and queries with no write slots and no `added`/`changed` filters; events, transition events, removed/despawned reads, relation failures, and services are compile errors, as are other games' descriptors and non-boolean predicates. Its reads become requirements of whatever it gates, through `not`/`and`/`or`, a system's `when`, and `Schedule.when`. Checks are evaluated before each gated system against committed values, so they see writes from earlier systems in the same run, and they never advance the world tick or a reader cursor. A throwing predicate propagates like a throwing system. Devtools render checks as `check(name)` and count their reads as the gated system's reads.

  Conditions now carry their requirements in one type-level field, read with `ConditionNeeds` / `ConditionNeedsFromConditions`. `MachineNeedsFromCondition(s)` remain and extract only the machines. `InputCapture.system` and `RenderSync` (`system`, `interpolate`) pass a check's requirements through their `when` option.

- Updated dependencies [2b0fb7e]
- Updated dependencies [c4d1add]
- Updated dependencies [bd9bdd5]
- Updated dependencies [bd9bdd5]
- Updated dependencies [94bdc32]
- Updated dependencies [bd9bdd5]
  - @typeonce/bevy-ts@0.3.0

## 0.2.0

### Minor Changes

- 4b3a312: Add `Pointer`: mouse and pen input over one element, with element-relative position, whether the pointer is over the element, and `primary`/`secondary`/`middle` button states with press/release edges that survive clicks shorter than a frame. It captures the pointer while a button is held, suppresses the context menu by default, and releases buttons on window blur. `Pointer.scripted`, `Pointer.recording`, and `Pointer.parseTimeline` mirror the keyboard timeline helpers for tests and replays.
- 4b3a312: Keyboard bindings can match physical keys: `Keyboard.code("KeyW")` binds by `KeyboardEvent.code`, so a position stays fixed across layouts (WASD on AZERTY) and modifiers cannot change the match (Option+W typing "∑" on macOS, Shift+1 typing "!"). Character and physical bindings mix freely on one action. Character bindings are also more robust: a key released while a modifier changed its character (W pressed, then Option, then W released as "∑") now releases its action instead of staying held. `KeyEvent` gains an optional `code`; the module docs list browser-reserved shortcuts (Ctrl/Cmd+W) that pages cannot block.
- 4b3a312: `InputCapture.system(...)` and `RenderSync.system(...)` accept `when`, run conditions like a system's own. A gated capture takes no snapshots meanwhile, so presses stay in the device until it resumes (pauses, hit-stop); a gated render sync catches up on additions, changes, and removals when it runs again. The machines the conditions read are requirements of the generated system.

### Patch Changes

- Updated dependencies [4b3a312]
- Updated dependencies [4b3a312]
- Updated dependencies [4b3a312]
  - @typeonce/bevy-ts@0.2.0

## 0.1.1

### Patch Changes

- c95a102: First release published from CI through npm trusted publishing, with provenance attestations. Declarations are now verified against consumers on both TypeScript 7 and TypeScript 6. No API or output changes.
- Updated dependencies [c95a102]
  - @typeonce/bevy-ts@0.1.1

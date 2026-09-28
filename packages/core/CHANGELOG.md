# @typeonce/bevy-ts

## 0.2.0

### Minor Changes

- 4b3a312: Removed-component and despawned-entity records are now kept until every system that reads them has run, like events. A render schedule ticked once after several fixed updates sees every despawn instead of only those from the last two `tick(...)` calls, so renderer mirrors such as `RenderSync` no longer leak nodes when the simulation catches up. A system skipped by its run conditions keeps its position and sees the removals when it runs again, matching `added`/`changed`. Each log is capped at `Runtime.streamCapacity` entries; the debug trace reports a `missed` read only when entries were dropped at that cap.
- 4b3a312: Add `Game.Schedule.when(conditions, ...entries)` (and `Schedule.when`): a schedule whose systems run only while every condition passes, in addition to their own `when`. It gates a whole group, nested schedules included, so a game-wide mode (playing, paused, hit-stop) no longer has to be repeated on each system. Marker steps in the group still run. The machines the conditions read become requirements of the schedule, so a runtime without them is rejected at compile time. A gated system shares change detection and event cursors with the original (`SystemDefinition.base`), so it is still one reader.

### Patch Changes

- 4b3a312: Building a schedule with an entry that is not a system, a schedule, or a marker step (for example an import that is `undefined` at runtime) now throws `Schedule entry N is not a system, a schedule, or a marker step: got …` instead of failing deep inside with `Cannot read properties of undefined`. The docs also show typing helpers that receive `get()` values as `ReadonlyValue<T>`, so they need no casts.

## 0.1.1

### Patch Changes

- c95a102: First release published from CI through npm trusted publishing, with provenance attestations. Declarations are now verified against consumers on both TypeScript 7 and TypeScript 6. No API or output changes.

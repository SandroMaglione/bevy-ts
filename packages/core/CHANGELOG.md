# @typeonce/bevy-ts

## 0.3.0

### Minor Changes

- 2b0fb7e: Add `Game.Condition.check(name, access, predicate)` (types in `@typeonce/bevy-ts/Condition`): a run condition computed by ordinary code, so conditions need no growing set of combinators. A check declares its reads like a system and receives them read-only. It may read resources, machines, and queries with no write slots and no `added`/`changed` filters; events, transition events, removed/despawned reads, relation failures, and services are compile errors, as are other games' descriptors and non-boolean predicates. Its reads become requirements of whatever it gates, through `not`/`and`/`or`, a system's `when`, and `Schedule.when`. Checks are evaluated before each gated system against committed values, so they see writes from earlier systems in the same run, and they never advance the world tick or a reader cursor. A throwing predicate propagates like a throwing system. Devtools render checks as `check(name)` and count their reads as the gated system's reads.

  Conditions now carry their requirements in one type-level field, read with `ConditionNeeds` / `ConditionNeedsFromConditions`. `MachineNeedsFromCondition(s)` remain and extract only the machines. `InputCapture.system` and `RenderSync` (`system`, `interpolate`) pass a check's requirements through their `when` option.

- c4d1add: Debug visibility for risks that types cannot rule out.

  - `Debug.Handle.population()` returns the live entity count and the number of entities per component. It is cheap enough to sample every frame.
  - A new info lint, `read-before-write`, names systems that read a component, resource, or event earlier in a schedule than the first system that writes it there, so they see the previous run's value (for events, one run late).
  - Devtools sessions warn with `non-finite-value` when any traced component write, resource write, event, spawn, or insert contains NaN or an infinity. The warning names the system, the entity, and the path.
  - Runs sample the population every frame. They return `entities` (start, peak, end) and `growing`, and warn with `population-growing` when a component's lowest count rises through every quarter of a run of at least 60 frames.
  - `run()` lists the warnings it raised, both as text and in `warnings`. `report()` ends with the current population.

- 94bdc32: Add `Descriptor.State(name, states, { transitions? })`: a component whose value is one of a closed set of states. It behaves like any other component (queries, change detection, rollback), and its constructor validates the value, so `setRaw` and snapshot restore reject unknown states. Its write cell adds `transition(from, to)`, a compare-and-set that writes `to` only while the state is still `from` and otherwise returns a `StateMismatch` failure (`Query.StateMismatchError`) without writing. With a `transitions` graph, which must list every state, a pair the graph does not allow is a compile error. Without a graph, any pair of states is accepted.

### Patch Changes

- bd9bdd5: `Result.all([a, b])` now infers a tuple, so the success value keeps each position's type (`readonly [number, string]` instead of `readonly (string | number)[]`).
- bd9bdd5: Fix spawn and insert entries accepting a value of the wrong component. In a schema with two or more components, `spawn([Health, "a name"])` compiled because entries were typed as "any schema descriptor with any schema value". Each descriptor is now paired with its own value type, so these entries are compile errors. Code that compiled only because of this hole now reports the mismatch.
- bd9bdd5: Declare the supported TypeScript range: an optional `typescript >=5.9` peer dependency. The type tests now run on every TypeScript version from 5.9 up.

## 0.2.0

### Minor Changes

- 4b3a312: Removed-component and despawned-entity records are now kept until every system that reads them has run, like events. A render schedule ticked once after several fixed updates sees every despawn instead of only those from the last two `tick(...)` calls, so renderer mirrors such as `RenderSync` no longer leak nodes when the simulation catches up. A system skipped by its run conditions keeps its position and sees the removals when it runs again, matching `added`/`changed`. Each log is capped at `Runtime.streamCapacity` entries; the debug trace reports a `missed` read only when entries were dropped at that cap.
- 4b3a312: Add `Game.Schedule.when(conditions, ...entries)` (and `Schedule.when`): a schedule whose systems run only while every condition passes, in addition to their own `when`. It gates a whole group, nested schedules included, so a game-wide mode (playing, paused, hit-stop) no longer has to be repeated on each system. Marker steps in the group still run. The machines the conditions read become requirements of the schedule, so a runtime without them is rejected at compile time. A gated system shares change detection and event cursors with the original (`SystemDefinition.base`), so it is still one reader.

### Patch Changes

- 4b3a312: Building a schedule with an entry that is not a system, a schedule, or a marker step (for example an import that is `undefined` at runtime) now throws `Schedule entry N is not a system, a schedule, or a marker step: got …` instead of failing deep inside with `Cannot read properties of undefined`. The docs also show typing helpers that receive `get()` values as `ReadonlyValue<T>`, so they need no casts.

## 0.1.1

### Patch Changes

- c95a102: First release published from CI through npm trusted publishing, with provenance attestations. Declarations are now verified against consumers on both TypeScript 7 and TypeScript 6. No API or output changes.

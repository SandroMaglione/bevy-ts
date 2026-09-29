# @typeonce/bevy-ts-devtools

## 0.3.0

### Minor Changes

- de2a112: Add `Monitor.attach(runtime, { schedules, pick?, locate? })`: a live browser panel that shows how a running game works, toggled with the backslash key or a corner button.

  - **Overview:** schedule tick times, the busiest systems, entity counts per component with sparklines, state machines, and alerts (failed systems, NaN or infinite writes, discarded messages).
  - **Systems:** each schedule's systems in order, grouped by run conditions. Each one shows its writes, events, spawns (learned while running), and reads, with a live working/idle/skipped status. Hover a name to highlight its writers and readers.
  - **Entity:** pick an entity on screen, by id, or by component, and follow its components and changes live.

  The monitor observes the runtime only while it is open. `Monitor.Collector` exposes the same data without DOM.

- c4d1add: Debug visibility for risks that types cannot rule out.

  - `Debug.Handle.population()` returns the live entity count and the number of entities per component. It is cheap enough to sample every frame.
  - A new info lint, `read-before-write`, names systems that read a component, resource, or event earlier in a schedule than the first system that writes it there, so they see the previous run's value (for events, one run late).
  - Devtools sessions warn with `non-finite-value` when any traced component write, resource write, event, spawn, or insert contains NaN or an infinity. The warning names the system, the entity, and the path.
  - Runs sample the population every frame. They return `entities` (start, peak, end) and `growing`, and warn with `population-growing` when a component's lowest count rises through every quarter of a run of at least 60 frames.
  - `run()` lists the warnings it raised, both as text and in `warnings`. `report()` ends with the current population.

### Patch Changes

- Updated dependencies [2b0fb7e]
- Updated dependencies [c4d1add]
- Updated dependencies [bd9bdd5]
- Updated dependencies [bd9bdd5]
- Updated dependencies [94bdc32]
- Updated dependencies [bd9bdd5]
  - @typeonce/bevy-ts@0.3.0

## 0.2.0

### Minor Changes

- 4b3a312: `Session.make(runtime, { schedules, describe })`: `describe` names more schedules for `describe()`, its lints, and the access maps without making them runnable. A headless session can now include a game's render schedule (which needs services the headless runtime lacks), so events and components only rendering reads are no longer reported as never read.

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

# @typeonce/bevy-ts-devtools

## 0.4.0

### Minor Changes

- e2b2275: New package `@typeonce/bevy-ts-render`: the renderer-agnostic part of `@typeonce/bevy-ts-pixi`, the entity-keyed node registry (`NodeRegistry.make`) and the render sync systems (`RenderSync.system`, `RenderSync.interpolate`), for games drawn with Three.js, the DOM, or any other renderer.

  **Breaking:** import `NodeRegistry` and `RenderSync` from `@typeonce/bevy-ts-render`. Pixi exports only `PixiNodeRegistry`, with `make(container)` replacing `NodeRegistry.inContainer(container)`. The platform-prefixed adapter implements the generic registry contract and is provided through the existing typed runtime service API. The old Pixi modules and re-exports are removed immediately. Pixi depends only on the render package, dropping its unused browser and core dependencies.

  This combines the four planned steps into one 0.4.0 release of the fixed package group.

  - `Game.Schedule.pauseWhen` retains event-reader cursors during a pause. Ordinary `when` gates still discard messages across mode changes and take precedence over pause gates in either nesting order. Stream capacity bounds retention, and debug traces expose whether a skipped run held messages.
  - A system's optional `local` factory owns scratch state per runtime, shared by gated copies. Locals are neither rolled back nor snapshotted and are rebuilt after successful restore. Debug descriptions show which systems declare them.
  - Optional and conditional local factories preserve `undefined` in the callback type. Factories allocate fresh scratch state without side effects; mode changes preserve locals, and values needing cleanup belong in host-managed services.
  - `runtime.send` immediately publishes a schema event from the host at a fresh tick. Calls during a tick or with unknown descriptors throw. Unread host messages survive restore without replaying to readers that already consumed them. Devtools trace sends and include external producers in event lints.
  - **Breaking:** `EntityId` and `Handle` are branded numbers. Replace `id.value` and `handle.value` with `id` and `handle`. Handles now compare by numeric identity and work as `Set` keys without allocating objects. `decodeHandle` and `Decode.handle` accept only positive integer numbers. Object-shaped handles are rejected, including inside snapshots; snapshots write numbers.
  - The guides cover fallible lookups, inspector machine reads, `Query.Cells`, shared access objects, simulation-owned time, and seeded random state. `Feature` remains supported and is documented in the package-authoring guide.

### Patch Changes

- Updated dependencies [e2b2275]
  - @typeonce/bevy-ts@0.4.0

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

---
"@typeonce/bevy-ts-render": minor
"@typeonce/bevy-ts-pixi": minor
"@typeonce/bevy-ts": minor
"@typeonce/bevy-ts-devtools": minor
---

New package `@typeonce/bevy-ts-render`: the renderer-agnostic part of `@typeonce/bevy-ts-pixi`, the entity-keyed node registry (`NodeRegistry.make`) and the render sync systems (`RenderSync.system`, `RenderSync.interpolate`), for games drawn with Three.js, the DOM, or any other renderer.

**Breaking:** import `NodeRegistry` and `RenderSync` from `@typeonce/bevy-ts-render`. Pixi exports only `PixiNodeRegistry`, with `make(container)` replacing `NodeRegistry.inContainer(container)`. The platform-prefixed adapter implements the generic registry contract and is provided through the existing typed runtime service API. The old Pixi modules and re-exports are removed immediately. Pixi depends only on the render package, dropping its unused browser and core dependencies.

This combines the four planned steps into one 0.4.0 release of the fixed package group.

- `Game.Schedule.pauseWhen` retains event-reader cursors during a pause. Ordinary `when` gates still discard messages across mode changes and take precedence over pause gates in either nesting order. Stream capacity bounds retention, and debug traces expose whether a skipped run held messages.
- A system's optional `local` factory owns scratch state per runtime, shared by gated copies. Locals are neither rolled back nor snapshotted and are rebuilt after successful restore. Debug descriptions show which systems declare them.
- Optional and conditional local factories preserve `undefined` in the callback type. Factories allocate fresh scratch state without side effects; mode changes preserve locals, and values needing cleanup belong in host-managed services.
- `runtime.send` immediately publishes a schema event from the host at a fresh tick. Calls during a tick or with unknown descriptors throw. Unread host messages survive restore without replaying to readers that already consumed them. Devtools trace sends and include external producers in event lints.
- **Breaking:** `EntityId` and `Handle` are branded numbers. Replace `id.value` and `handle.value` with `id` and `handle`. Handles now compare by numeric identity and work as `Set` keys without allocating objects. `decodeHandle` and `Decode.handle` accept only positive integer numbers. Object-shaped handles are rejected, including inside snapshots; snapshots write numbers.
- The guides cover fallible lookups, inspector machine reads, `Query.Cells`, shared access objects, simulation-owned time, and seeded random state. `Feature` remains supported and is documented in the package-authoring guide.

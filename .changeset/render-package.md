---
"@typeonce/bevy-ts-render": minor
"@typeonce/bevy-ts-pixi": minor
"@typeonce/bevy-ts": minor
"@typeonce/bevy-ts-devtools": minor
---

New package `@typeonce/bevy-ts-render`: the renderer-agnostic part of `@typeonce/bevy-ts-pixi`, the entity-keyed node registry (`NodeRegistry.make`) and the render sync systems (`RenderSync.system`, `RenderSync.interpolate`), with no Pixi in its names or docs, for games drawn with Three.js, the DOM, or any other renderer. `@typeonce/bevy-ts-pixi` now builds on it: it re-exports `NodeRegistry` and `RenderSync` unchanged, so existing imports keep working, and keeps only what is Pixi-shaped (`NodeRegistry.inContainer`, `ContainerLike`, `Destroyable`). It also no longer depends on `@typeonce/bevy-ts-browser`, which it never imported.

This combines the four planned steps into one 0.4.0 release of the fixed package group.

- `Game.Schedule.pauseWhen` retains event-reader cursors during a pause. Ordinary `when` gates still discard messages across mode changes and take precedence over pause gates in either nesting order. Stream capacity bounds retention, and debug traces expose whether a skipped run held messages.
- A system's optional `local` factory owns scratch state per runtime, shared by gated copies. Locals are neither rolled back nor snapshotted and are rebuilt after successful restore. Debug descriptions show which systems declare them.
- `runtime.send` immediately publishes a schema event from the host at a fresh tick. Calls during a tick or with unknown descriptors throw. Unread host messages survive restore without replaying to readers that already consumed them. Devtools trace sends and include external producers in event lints.
- **Breaking:** `EntityId` and `Handle` are branded numbers. Replace `id.value` and `handle.value` with `id` and `handle`. Handles now compare by numeric identity and work as `Set` keys without allocating objects. `decodeHandle` and `Decode.handle` accept numbers and legacy `{ kind: "EntityHandle", value }` saves for this release; new snapshots write numbers.
- The guides cover fallible lookups, inspector machine reads, `Query.Cells`, shared access objects, simulation-owned time, and seeded random state. `Feature` remains supported and is documented in the package-authoring guide.

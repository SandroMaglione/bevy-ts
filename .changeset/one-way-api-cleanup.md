---
"@typeonce/bevy-ts": minor
"@typeonce/bevy-ts-devtools": minor
---

One way to do each thing. Breaking changes, with no deprecated aliases:

- **Systems fail with `Result.failure(error)`.** The `Fx` module is removed (`Fx.fail`, `succeed`, `sync`, `map`, `flatMap`, `access`, `accessService`, `provide`, `runSync`). A system returns nothing or a `Result`; returning `Result.failure(error)` rolls back its ECS writes, drops its commands and events, and types `error` into the tick result exactly like `Fx.fail` did. Replace `return Fx.fail(e)` with `return Result.failure(e)`; a returned lookup failure (`if (!found.ok) return found`) also works. `SystemDefinition` and `Schema.BoundSystem` lose their success type parameter: `SystemDefinition<Spec, E, Root, Name, Needs>`, `BoundSystem<S, Root, Spec, E, Name, Needs>`.
- **`Feature` is removed** (`Schema.Feature.define` / `compose`). A plugin is a function `(Game, options) => System | Schedule`, like `RenderSync.system(Game, ...)`; list every fragment in one `Schema.bind(...)`.
- **`Schema.merge` is removed**: use `Schema.bind(A, B, ...)`.
- **A descriptor owns its validator.** `Definition` is removed: validate through the constructed descriptor (`Game.Command.entryRaw(Position, raw)`, for example in a draft built once at module load) or call the constructor (`Vector2.result(raw)`). `Command.entryResult` is removed: `entryRaw` is the one way to validate raw input at spawn. `setResult` / `updateResult` are removed from write cells: use `setRaw` / `updateRaw` on constructed descriptors. `Brand` is documented as a tool for packages that author validated value types.
- **`Descriptor.State` is renamed `Descriptor.EntityState`** (per-entity state, not to be confused with the game-wide `Game.StateMachine`). Related names follow: `EntityStateDescriptor`, `EntityStateValue`, `EntityStateTransitions`, `isEntityState`, `EntityStateWriteCell`, and the transition failure `EntityStateMismatchError` with `_tag: "EntityStateMismatch"` and `component` (was `state`) naming the component.
- **Silent failures are loud.** `RemovedReadView` and `DespawnedReadView` gain `lagged()`, like event readers. `describe()` reports a `relation-failure-never-read` warning for a relation that commands have related or reordered while no described system reads its failures.
- **Devtools invariants are typed.** `Invariant.make(name, () => ...)` is replaced by `Invariant.fromInspector(Game.Inspector(name, access, check))`, where `check` returns a violation message or `undefined`. `Session.make` rejects at compile time an invariant that reads a resource, service, or machine the runtime does not provide. `Runtime.ValidateInspector` is exported for tools like this.
- JSDoc now states when to use each of `EntityScope` / `Hierarchy`, `when` / `pauseWhen` (on a system and on `Schedule.when` / `Schedule.pauseWhen`), `tryTick` / `tick`, and `Game.StateMachine` / `Descriptor.EntityState`.

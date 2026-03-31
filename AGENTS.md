## Core Principles
- Type safety is the first and absolute priority.
- Public APIs must be as strict as possible.
- If a runtime failure can be made impossible by types, it must be.
- If a guarantee depends on runtime state, that uncertainty must be explicit in the type surface.
- Prefer explicit APIs over overloaded, implicit, heuristic, or convenience-first APIs.
- Build APIs as small composable lego blocks that remain independently type-safe.

## Public API Rules
- Do not require user-facing casts.
- Do not require explicit generic arguments for normal usage.
- Do not require users to split schedules, features, or flows into pieces only to satisfy the compiler.
- Do not hide normal failure behind exceptions.
- Do not make the wrong call easy through broad overloads or ambiguous semantics.

## Internal Type Rules
- Validate exact structure at the constructor boundary.
- Derive normalized carried types once, then reuse them.
- Relax only internal post-validation precision when that precision is not user-meaningful.
- Never trade away root safety, requirement safety, or explicit runtime-failure semantics for compiler performance.
- Internal type optimization is allowed only when the user-facing API stays unchanged and requires no casts or scaffolding.

```ts
const A = Game.System.define("A", { schema }, ...)
const B = Game.System.define("B", { schema, after: [A] }, ...)

const schedule = Game.Schedule.define({
  systems: [A, B],
  steps: [A, Game.Schedule.applyDeferred(), B]
})

// Acceptable internal strategy:
// 1. Validate exact references here.
// 2. Carry a cheaper normalized schedule type afterward.
// 3. Keep the same public guarantees.
```

## Explicit Runtime Semantics
- Long-lived references are storage-safe handles, not proof of liveness.
- Lookups and dynamic reads must stay explicit and typed as fallible when they depend on current runtime state.
- Schedule boundaries stay explicit: deferred commands, lifecycle visibility, events, and state transitions are advanced only by explicit schedule markers.

```ts
const target = lookup.getHandle(handle, query)
if (!target.ok) {
  return
}
```

## Design References
- [`bevy`](./.agents/bevy/): ECS concepts, scheduling, states, and relationships. Reference for the problem space, not a mandate to copy engine-owned ergonomics.
- [`effect-smol`](./.agents/effect-smol/): explicit dependencies, canonical carried types, derive-once/carry-later type architecture.
- [`arktype`](./.agents/arktype/): TypeScript performance patterns, normalization strategy, merge-over-intersection when valid, and avoidance of reflective type machinery.

Use these references to guide design decisions, but preserve this library's stricter rule: user-facing safety and explicitness come first.

# Type architecture

The compiler should reject an invalid ECS program without making ordinary code hard to infer. That rules out carrying every query slot and access record through the whole program.

The current design has one rule: validate detailed input where the user creates it, then carry a smaller type.

## Descriptors and machines

Resources, states, services, and state machines are runtime requirement tokens. A system stores the actual tokens it needs in `requirements`.

Descriptor identity is `(kind, name)`, and that is deliberate: descriptor types are structural over the same pair, so runtime identity has to match what the compiler can distinguish. Two declarations with the same kind, name, and value type are the same descriptor.

The rules that keep this sound:

- A schema rejects two descriptors of one kind with the same name, and two entries with the same registry key, at compile time (`ValidateFragments` in `schema.ts`) and again at runtime for erased types.
- The descriptor value type is invariant, so a look-alike descriptor with a narrower or wider value type is not accepted where the registered one is expected.
- Machine names are unique per bound `Game`, checked when `Game.StateMachine(...)` runs.

Systems are different: they own no storage, so each `Game.System(...)` value has its own identity and two systems may share a display name. Only the same system value twice in one schedule is rejected.

## Systems

`Game.System(...)` infers the complete access declaration once. The callback context comes from that exact declaration, so an undeclared query, resource, service, state, or machine is unavailable.

The resulting system carries two different views:

- `spec` keeps the exact access declaration for execution.
- `requirements` keeps only the union of resource, state, service, and machine tokens needed for provisioning.

Schedules never reconstruct requirement maps from `spec`.

## Schedules

A schedule contains normalized `steps`, the systems in those steps, and a deduplicated requirement-token array. Fragments, phases, nested schedules, and transition bundles all use the same shape.

Composition is a union operation. Adding a system adds its requirement tokens to the carried union. It does not intersect object maps or recursively fold the full system specification.

Visibility changes are explicit, and only markers advance them:

- `applyDeferred()` applies queued world commands.
- `updateEvents()` advances event buffers.
- `updateLifecycle()` advances lifecycle buffers.
- `updateRelationFailures()` advances relation-failure buffers.
- `applyStateTransitions()` applies queued commands, then commits queued machine transitions.

Nothing is flushed when a schedule ends. Pending work stays in the runtime, across schedule runs, until a marker advances it.

## Runtimes

`runSchedule`, `initialize`, and `tick` are the static path. TypeScript compares the schedule's token union with the services, resources, states, and machines supplied to the runtime. Missing or incompatible provisions fail compilation.

`tryRunSchedule` is the dynamic path for schedules whose exact type has been erased, such as schedules loaded through a plugin boundary. It checks the real tokens before execution and returns `MissingRuntimeRequirements` as data. It does not throw for missing provisions.

Runtime-dependent entity lookups stay fallible. An entity handle is safe to store, but it is not proof that the entity still exists.

## Storage

The runtime lives in `packages/core/src/internal/`:

- `world.ts` stores every live entity as one record with component values in a dense array indexed by a per-world component ordinal. Each ordinal keeps the set of records that have it, and a membership version that changes on add or remove. Relations keep source-to-target and target-to-sources maps with their own versions.
- `queries.ts` compiles each query spec once per world. It caches the ordered match set and recomputes it only when a component or relation it depends on changed membership. The recompute walks the smallest required component set. Match objects (entity view plus cells) are created once per entity and query and reused. Cells read live storage, so reuse never exposes stale values. Results are in ascending entity id, which is spawn order.
- Lifecycle records (`added`, `changed`, `removed`) are per-ordinal id lists deduplicated through per-record epoch marks. `updateLifecycle()` swaps pending into readable and advances the epoch.
- `cells.ts` holds the prototype-based cell objects used by query slots, resources, and states.

System contexts are built once per system and runtime, then reused.

## Performance baseline

`pnpm bench` runs `packages/core/bench`: runtime cases timed against an in-process calibration workload, and checker metrics (types, instantiations) for the generated `bench/types/stress.ts` program. `packages/core/bench/baseline.json` is the committed reference. CI compares each pull request with its base commit on the same runner. Update the baseline with `pnpm bench:update` when a change intentionally shifts the numbers.

## Extension rule

New system access categories should answer one question before they become public: does the runtime need a provision for this access?

If yes, add one nominal requirement token and teach the runtime how to validate it. If no, keep the access local to `SystemSpec`. Do not add another schedule-level object map or a recursive type fold.

## Verification

`pnpm run check` runs the TypeScript 7 native compiler, type assertions through TSTyche's supported TypeScript API, and runtime tests. `packages/core/dtslint/Architecture.tst.ts` composes a wide schedule to guard against the dependency-depth failures that stopped earlier development. `pnpm bench:check` guards runtime and checker performance.

# Type architecture

The compiler should reject an invalid ECS program without making ordinary code hard to infer. That rules out carrying every query slot and access record through the whole program.

The current design has one rule: validate detailed input where the user creates it, then carry a smaller type.

## Descriptors and machines

Resources, states, services, and state machines are runtime requirement tokens. Their runtime identity comes from their kind and name. A system stores the actual tokens it needs in `requirements`.

Descriptor and machine names must be unique within their kind. Constructors use the global symbol registry so two declarations with the same kind and name resolve to the same runtime identity.

## Systems

`Game.System(...)` infers the complete access declaration once. The callback context comes from that exact declaration, so an undeclared query, resource, service, state, or machine is unavailable.

The resulting system carries two different views:

- `spec` keeps the exact access declaration for execution.
- `requirements` keeps only the union of resource, state, service, and machine tokens needed for provisioning.

Schedules never reconstruct requirement maps from `spec`.

## Schedules

A schedule contains normalized `steps`, the systems in those steps, and a deduplicated requirement-token array. Fragments, phases, nested schedules, and transition bundles all use the same shape.

Composition is a union operation. Adding a system adds its requirement tokens to the carried union. It does not intersect object maps or recursively fold the full system specification.

Visibility changes remain explicit:

- `applyDeferred()` applies queued world commands.
- `updateEvents()` advances event buffers.
- `updateLifecycle()` advances lifecycle buffers.
- `updateRelationFailures()` advances relation-failure buffers.
- `applyStateTransitions()` commits queued machine transitions.

## Runtimes

`runSchedule`, `initialize`, and `tick` are the static path. TypeScript compares the schedule's token union with the services, resources, states, and machines supplied to the runtime. Missing or incompatible provisions fail compilation.

`tryRunSchedule` is the dynamic path for schedules whose exact type has been erased, such as schedules loaded through a plugin boundary. It checks the real tokens before execution and returns `MissingRuntimeRequirements` as data. It does not throw for missing provisions.

Runtime-dependent entity lookups stay fallible. An entity handle is safe to store, but it is not proof that the entity still exists.

## Extension rule

New system access categories should answer one question before they become public: does the runtime need a provision for this access?

If yes, add one nominal requirement token and teach the runtime how to validate it. If no, keep the access local to `SystemSpec`. Do not add another schedule-level object map or a recursive type fold.

## Verification

`pnpm run check` runs the TypeScript 7 native compiler, type assertions through TSTyche's supported TypeScript API, and runtime tests. `packages/core/dtslint/Architecture.tst.ts` composes a wide schedule to guard against the dependency-depth failures that stopped earlier development.

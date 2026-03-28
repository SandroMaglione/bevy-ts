# `bevy-ts`

A type-safe, game-loop-agnostic ECS runtime for TypeScript.

It keeps Bevy-style ECS concepts, but the structure is closer to Effect:

- closed schemas
- explicit system specs
- deferred mutation
- typed service dependencies
- proof-oriented entity access

The main rule of the codebase is simple: if TypeScript cannot prove something honestly, the public API should not pretend it can.

This is still an early implementation scaffold. The runtime is intentionally simple for now, but the public type model is already the main design surface.

## Status

Current implementation includes:

- branded descriptors for components, resources, events, states, and services
- closed schema fragments and schema merging
- typed query specs with explicit read/write access
- proof-oriented entity values (`EntityId`, `EntityDraft`, `EntityRef`, `EntityMut`)
- explicit system specs and derived typed execution contexts
- deferred commands
- named schedules
- a loop-agnostic runtime
- a minimal `Fx<A, E, R>` abstraction for typed service dependencies

Current implementation does **not** try to be complete Bevy parity. It is still missing many ECS and engine features, including:

- system ordering constraints and schedule graph validation
- richer event lifecycle semantics
- validated entity lookup APIs
- typed command flushing phases
- removals / bundle-like composition / observers / state transitions
- performance-oriented storage strategies
- parallel scheduling

## Design Goals

This codebase optimizes for the most type-safe public API that is practical in TypeScript.

That leads to a few deliberate choices:

- systems are defined from explicit specs, not inferred callback parameters
- mutation is deferred through commands, not done ad hoc inside systems
- entity ids are opaque
- precise entity structure is tracked only in trusted places, such as drafts and query results
- service dependencies are tracked separately from ECS access
- internals may use `any` or casts where needed, but those should not leak through the external API

## Mental Model

There are two worlds in the codebase:

1. The **public type world**
   - branded descriptors
   - closed schemas
   - typed query and system specs
   - proof-carrying entity handles
   - typed service environments

2. The **runtime implementation world**
   - mutable maps
   - descriptor-keyed storage
   - internal command application
   - type erasure where necessary

This is intentional and follows the same spirit as Effect:

- the user-facing API should be strict, explicit, and composable
- the runtime should be simple enough to evolve without breaking the public type model

## Module Structure

### [`src/descriptor.ts`](./src/descriptor.ts)

Defines branded nominal identities:

- `defineComponent`
- `defineResource`
- `defineEvent`
- `defineState`
- `defineService`

These are the foundation of the entire type model. Users should never use raw strings where a descriptor exists.

### [`src/schema.ts`](./src/schema.ts)

Defines the closed schema model:

- `Schema.fragment(...)`
- `Schema.merge(...)`
- `Schema.build(...)`

Each module should expose a schema fragment. The application composes fragments into one final schema. The runtime and all systems are parameterized by that final schema.

### [`src/entity.ts`](./src/entity.ts)

Defines proof-oriented entity types:

- `EntityId<S>`: opaque identity only
- `EntityDraft<S, P>`: exact staged component proof before flush
- `EntityRef<S, P>`: read capability with proof
- `EntityMut<S, P, W>`: read/write capability with proof

Important rule:

- `EntityId` does not prove component presence
- exact component proofs are local and temporary, not global and permanent

### [`src/query.ts`](./src/query.ts)

Defines explicit query access:

- `Query.read(...)`
- `Query.write(...)`
- `Query.define(...)`

Queries are the main constructors of typed entity proofs during runtime execution. A query does not just describe filtering; it also describes the exact typed access surface exposed to the system.

### [`src/system.ts`](./src/system.ts)

Defines the public system API:

- service requirements
- resource/event/state access declarations
- `System.define(spec, implementation)`

This is the central user entrypoint.

The system implementation receives a typed context derived from the spec:

- `queries`
- `resources`
- `events`
- `states`
- `services`
- `commands`

Nothing else should be available.

### [`src/command.ts`](./src/command.ts)

Defines deferred mutation:

- `Command.spawn()`
- `Command.insert(...)`
- `CommandsApi`

Systems do not mutate the runtime directly. They queue commands, and the runtime flushes them after the system effect completes.

### [`src/fx.ts`](./src/fx.ts)

Defines a minimal Effect-like abstraction:

- `Fx<A, E, R>`
- `Fx.sync`
- `Fx.succeed`
- `Fx.flatMap`
- `Fx.provide`

The goal here is not to replace Effect. The goal is to keep the current system/runtime model explicitly typed around required services.

### [`src/schedule.ts`](./src/schedule.ts)

Defines named collections of systems:

- `Schedule.define(...)`

Schedules are the units the runtime executes.

### [`src/runtime.ts`](./src/runtime.ts)

Defines the actual in-memory runtime:

- entity/component storage
- resources
- states
- events
- schedule execution
- command flushing

The runtime is intentionally loop-agnostic. It does not own rendering, windowing, or the main loop.

### [`src/app.ts`](./src/app.ts)

Defines a small convenience wrapper:

- `App.makeApp(runtime)`

This gives you a Bevy-like `app.update(schedule)` style without turning the engine into a monolithic loop owner.

## How It Works

The current flow is:

1. Define descriptors
2. Group them into schema fragments
3. Build one final schema
4. Define systems against that schema
5. Group systems into schedules
6. Create a runtime with the schema and external services
7. Call `runtime.runSchedule(...)` or `app.update(...)` from your own loop

At execution time:

1. the runtime builds the typed system context from the system spec
2. queries scan the in-memory entity store
3. resources, states, and events are exposed as typed views
4. the system returns an `Fx`
5. the runtime provides the declared services to that `Fx`
6. the system runs
7. queued commands are flushed into world state

## Usage

## Defining Descriptors

```ts
import { Descriptor } from "./src/index.ts"

// Per-entity data
const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")

// World-level singleton data
const Time = Descriptor.defineResource<number>()("Time")

// Append-only messages between systems
const TickEvent = Descriptor.defineEvent<{ readonly dt: number }>()("TickEvent")

// Coarse application/gameplay mode
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")

// External dependency provided by the host runtime
const Logger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("Logger")
```

## Building a Closed Schema

```ts
import { Schema } from "./src/index.ts"

// A feature module exposes the ECS pieces it owns.
const movement = Schema.fragment({
  components: { Position, Velocity },
  resources: { Time }
})

// Another module can contribute events and states.
const flow = Schema.fragment({
  events: { TickEvent },
  states: { Phase }
})

// The final runtime schema is closed and built explicitly.
const schema = Schema.build(movement, flow)
```

## Defining a System

```ts
import { Fx, Query, System } from "./src/index.ts"

const MoveSystem = System.define(
  {
    id: "MoveSystem",
    schema,
    queries: {
      moving: Query.define({
        selection: {
          // This system can mutate Position...
          position: Query.write(Position),
          // ...but only read Velocity.
          velocity: Query.read(Velocity)
        }
      })
    },
    resources: {
      time: System.readResource(Time)
    },
    services: {
      logger: System.service(Logger)
    },
    states: {
      phase: System.readState(Phase)
    }
  },
  ({ queries, resources, services, states }) =>
    Fx.sync(() => {
      // State access is explicit and typed.
      if (states.phase.get() !== "Running") {
        return
      }

      // Resources are exposed through narrow read/write views.
      const dt = resources.time.get()
      for (const match of queries.moving.each()) {
        // Query results carry typed entity proofs and typed cells.
        const position = match.data.position.get()
        const velocity = match.data.velocity.get()

        match.data.position.set({
          x: position.x + velocity.x * dt,
          y: position.y + velocity.y * dt
        })
      }

      services.logger.log("movement step completed")
    })
)
```

## Spawning Through Deferred Commands

```ts
import { Command, Fx, System } from "./src/index.ts"

const SpawnProjectileSystem = System.define(
  {
    id: "SpawnProjectileSystem",
    schema,
    services: {
      logger: System.service(Logger)
    }
  },
  ({ commands, services }) =>
    Fx.sync(() => {
      // Build a draft with an exact staged component proof.
      const projectile = Command.insert(
        Command.insert(Command.spawn<typeof schema>(), Position, { x: 0, y: 0 }),
        Velocity,
        { x: 4, y: 0 }
      )

      // The runtime turns the draft into a deferred spawn command.
      commands.spawn(projectile)
      services.logger.log("queued projectile spawn")
    })
)
```

## Creating a Runtime

```ts
import { App, Runtime, Schedule } from "./src/index.ts"

// Group systems into a named unit of execution.
const update = Schedule.define({
  label: "Update",
  schema,
  systems: [MoveSystem]
})

// The host application provides external services and initial world data.
const runtime = Runtime.makeRuntime({
  schema,
  services: {
    Logger: {
      log(message: string) {
        console.log(message)
      }
    }
  },
  resources: {
    Time: 1 / 60
  },
  states: {
    Phase: "Running"
  }
})

// The app wrapper is optional convenience over the runtime.
const app = App.makeApp(runtime)
app.update(update)
```

## Concrete Game Examples

These are example patterns the current architecture is already suited for, even though the runtime is still minimal.

### 1. Asteroids-like Movement

Schema:

- `Position`
- `Velocity`
- `Rotation`
- `AngularVelocity`
- `Time`

Systems:

- `IntegrateLinearMotion`
- `IntegrateAngularMotion`
- `WrapAroundScreen`
- `SpawnAsteroids`

Why this fits:

- movement systems are simple explicit queries
- world mutation can be deferred for spawning and despawning
- no engine-owned loop is required

### 2. Vampire Survivors-style Bullet Hell

Schema:

- `Position`
- `Velocity`
- `Health`
- `EnemyTag`
- `ProjectileTag`
- `DamageEvent`
- `GamePhase`

Systems:

- `MoveProjectiles`
- `MoveEnemies`
- `DetectProjectileHits`
- `ApplyDamage`
- `DespawnDeadEnemies`

Why this fits:

- events model damage flow cleanly
- systems can be kept small and isolated
- game phase can gate behavior through typed state access

### 3. Turn-Based Tactical Game

Schema:

- `GridPosition`
- `MovementPoints`
- `SelectedUnit`
- `TurnState`
- `CommandIssued`

Systems:

- `SelectUnit`
- `IssueMoveCommand`
- `ApplyMoveCommand`
- `AdvanceTurn`

Why this fits:

- explicit state types are useful for phase-based logic
- deferred commands fit turn resolution well
- loop agnosticism is a natural fit for turn-based apps

### 4. Factory / Automation Simulation

Schema:

- `Inventory`
- `ProductionRule`
- `PowerState`
- `TickRate`
- `SimulationPhase`

Systems:

- `ConsumeInputs`
- `ProduceOutputs`
- `RouteItems`
- `UpdatePowerState`

Why this fits:

- simulation can be driven by any external clock
- deterministic step-based scheduling is straightforward
- resources and states work well for global simulation control

### 5. Card / Board Game Backend

Schema:

- `CardOwner`
- `CardLocation`
- `Health`
- `Mana`
- `Turn`
- `Phase`
- `GameLogEvent`

Systems:

- `DrawCard`
- `PlayCard`
- `ResolveCombat`
- `AdvancePhase`

Why this fits:

- no rendering assumptions
- easy to embed in server, CLI, or test environments
- type-safe phases and resources help avoid illegal action shapes

## Guidance For AI Agents

If you are an AI agent modifying this repository, keep these rules in mind:

1. Preserve the separation between public type precision and internal runtime looseness.
2. Prefer explicit descriptors, specs, and branded values over structural shortcuts.
3. Do not introduce untyped string-based access paths where a descriptor already exists.
4. Keep service dependencies separate from ECS data access.
5. If exact entity structure cannot be proven honestly, widen back to `EntityId` or a less precise proof.
6. Prefer adding public JSDoc when new exports are introduced.
7. When adding features, start from the type model first, then implement runtime support second.

A safe extension workflow is usually:

1. add or refine descriptor-level types
2. update schema typing
3. update system/query/command public APIs
4. only then update runtime internals

## Guidance For Maintainers

When extending this implementation, the most important invariant is:

> the public API should never claim a proof the runtime cannot justify

Examples:

- good: `Query.define(...)` returns typed read/write cells because the runtime validates membership while iterating
- good: `Command.spawn()` returns a typed draft because the structure is known before flush
- bad: exposing an `EntityId` API that pretends to know exact runtime component membership without validation
- bad: allowing arbitrary direct world mutation from system implementations if the type system cannot track it

## Running The Current Prototype

Install dependencies:

```bash
pnpm install
```

Run the typechecker:

```bash
npm run typecheck
```

Run the smoke example:

```bash
npm run smoke
```

## Current Limitations

The current runtime is intentionally simple:

- storage is map-based
- query execution is linear over entities
- there is no schedule conflict analysis yet
- command flushing is immediate after each system
- effect execution is synchronous

That is acceptable for now because the current priority is validating the public type model and module boundaries.

## Next Good Directions

The next high-value implementation steps are:

- add typed validated entity lookup APIs
- add component removal and richer command types
- add schedule ordering and access metadata validation
- separate command staging phases more explicitly
- add tests that assert type failures with example misuse cases
- add richer examples as real source files instead of README-only snippets

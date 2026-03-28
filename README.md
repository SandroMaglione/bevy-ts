# `bevy-ts`

A type-safe, game-loop-agnostic ECS runtime for TypeScript.

It keeps Bevy-style ECS concepts, but the public API is shaped more like Effect: explicit schemas, explicit system access, deferred mutation, and typed service dependencies. The runtime is still early, but the type model is already the main design surface.

## Quick start

Define descriptors:

```ts
import { Descriptor } from "./src/index.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const Time = Descriptor.defineResource<number>()("Time")
const Logger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("Logger")
```

Build a closed schema:

```ts
import { Schema } from "./src/index.ts"

const movement = Schema.fragment({
  components: { Position, Velocity },
  resources: { Time }
})

const schema = Schema.build(movement)
```

Define a system:

```ts
import { Fx, Query, System } from "./src/index.ts"

const MoveSystem = System.define(
  "MoveSystem",
  {
    schema,
    queries: {
      moving: Query.define({
        selection: {
          position: Query.write(Position),
          velocity: Query.read(Velocity)
        }
      })
    },
    resources: {
      time: System.readResource(Time)
    },
    services: {
      logger: System.service(Logger)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      const dt = resources.time.get()
      for (const match of queries.moving.each()) {
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

Create a schedule and runtime:

```ts
import { App, Label, Runtime, Schedule } from "./src/index.ts"

const UpdateScheduleLabel = Label.defineScheduleLabel("Update")

const update = Schedule.define({
  label: UpdateScheduleLabel,
  schema,
  systems: [MoveSystem]
})

const runtime = Runtime.makeRuntime({
  schema,
  services: {
    [Logger.name]: {
      log(message: string) {
        console.log(message)
      }
    }
  },
  resources: {
    Time: 1 / 60
  }
})

const app = App.makeApp(runtime)
app.update(update)
```

## Core flow

The normal flow is simple: define descriptors, group them into schema fragments, build one final schema, define systems against that schema, group systems into schedules, then run those schedules from your own loop. Rendering, input, physics, and timing stay outside the runtime unless you explicitly model them as resources or services.

Systems only see what they declare. Queries describe read and write access up front. Resources, events, states, and services are exposed as typed views. Mutation goes through deferred commands instead of direct world writes.

## Spawning entities

Use `Command.spawnWith(...)` as the default way to create typed drafts without nested insert chains:

```ts
import { Command, Fx, System } from "./src/index.ts"

const SpawnProjectileSystem = System.define(
  "SpawnProjectileSystem",
  {
    schema,
    services: {
      logger: System.service(Logger)
    }
  },
  ({ commands, services }) =>
    Fx.sync(() => {
      const projectile = Command.spawnWith<typeof schema>(
        [Position, { x: 0, y: 0 }],
        [Velocity, { x: 4, y: 0 }]
      )

      commands.spawn(projectile)
      services.logger.log("queued projectile spawn")
    })
)
```

`Command.spawn()` and single-step `Command.insert(...)` still exist, but `spawnWith(...)` is the intended authoring path.

## Ordering systems

Direct system references are the default ordering mechanism. Reusable sets stay explicit and typed.

```ts
import { Label, Schedule, System } from "./src/index.ts"

const MovementSet = Label.defineSystemSetLabel("Movement")
const UpdateScheduleLabel = Label.defineScheduleLabel("Update")

const InputSystem = System.define("Input", {
  schema,
  inSets: [MovementSet]
}, ({}) => Fx.sync(() => {}))

const MoveSystem = System.define("Move", {
  schema,
  inSets: [MovementSet],
  after: [InputSystem]
}, ({}) => Fx.sync(() => {}))

const update = Schedule.define({
  label: UpdateScheduleLabel,
  schema,
  systems: [InputSystem, MoveSystem],
  sets: [
    Schedule.configureSet({
      label: MovementSet,
      chain: true
    })
  ]
})
```

No runtime-relevant references are open strings. Systems are referenced directly. Schedules and reusable sets use typed labels.

## Renderer integration

The intended renderer pattern is to keep host objects outside ECS, inject them as services, and synchronize ECS data into them from a dedicated system.

```ts
const PixiHost = Descriptor.defineService<{
  readonly application: Application
  readonly sprites: Map<number, Sprite>
}>()("PixiHost")

const SyncPixiSceneSystem = System.define(
  "SyncPixiSceneSystem",
  {
    schema,
    queries: {
      renderables: Query.define({
        selection: {
          position: Query.read(Position),
          renderable: Query.read(Renderable)
        }
      })
    },
    services: {
      pixi: System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.renderables.each()) {
        const entityId = match.entity.id.value

        let sprite = services.pixi.sprites.get(entityId)
        if (!sprite) {
          sprite = new Sprite(Texture.WHITE)
          services.pixi.application.stage.addChild(sprite)
          services.pixi.sprites.set(entityId, sprite)
        }

        const position = match.data.position.get()
        sprite.position.set(position.x, position.y)
      }
    })
)
```

This is the same pattern used in [`src/examples/pixi.ts`](./src/examples/pixi.ts).

## Architecture

Descriptors define nominal identities for components, resources, events, states, and services. Schemas close the world. Systems declare ECS access and service dependencies explicitly. Schedules order execution and define apply/event phases. The runtime owns world state, but not the outer loop.

The important rule is simple: if TypeScript cannot prove something honestly, the public API should not pretend it can. Internals may erase types when needed, but that should not leak through the external surface.

## Examples

The repo currently includes:

- [`src/examples/smoke.ts`](./src/examples/smoke.ts) for the smallest end-to-end setup
- [`src/examples/pokemon.ts`](./src/examples/pokemon.ts) for ordered movement and collision
- [`src/examples/snake.ts`](./src/examples/snake.ts) for events, lookup, spawn, and despawn flow
- [`src/examples/pixi.ts`](./src/examples/pixi.ts) for renderer/service integration

## Current limits

This is still an early implementation. The public types are stricter than the runtime internals, and the project is not aiming for full Bevy parity yet. Performance-oriented storage, observers, richer state transitions, and parallel scheduling are not the current focus.

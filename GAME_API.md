# Building a game with `bevy-ts`

The library now has a small, renderer-independent gameplay core. A game is a
closed schema, systems with declared capabilities, explicit schedules, and one
runtime. Browser timing and rendering stay outside the ECS.

## 1. Define the world

```ts
import { Descriptor, Fx, Result, Schema } from "@bevy-ts/core"

const Position = Descriptor.Component<{ x: number; y: number }>()("Game/Position")
const Velocity = Descriptor.Component<{ x: number; y: number }>()("Game/Velocity")
const Health = Descriptor.Component<number>()("Game/Health")
const DeltaTime = Descriptor.Resource<number>()("Game/DeltaTime")
const Damage = Descriptor.Event<{ target: number; amount: number }>()("Game/Damage")

const Game = Schema.bind(Schema.fragment({
  components: { Position, Velocity, Health },
  resources: { DeltaTime },
  events: { Damage }
}))
```

The bound `Game` value is the authoring boundary. Queries, systems, schedules,
entity scopes, inspectors, and runtimes made from a different root do not fit.

## 2. Write systems with exact capabilities

```ts
const Moving = Game.Query({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.read(Velocity)
  }
})

const Move = Game.System(
  "Game/Move",
  {
    queries: { moving: Moving },
    resources: { dt: Game.System.readResource(DeltaTime) }
  },
  ({ queries, resources }) => Fx.sync(() => {
    const dt = resources.dt.get()
    for (const { data } of queries.moving.each()) {
      const position = data.position.get()
      const velocity = data.velocity.get()
      data.position.set({
        x: position.x + velocity.x * dt,
        y: position.y + velocity.y * dt
      })
    }
  })
)
```

The callback cannot access undeclared world data. A write query exposes writable
cells; a read query does not. Values returned by `get()` are deeply readonly;
changes go through `set`, `update`, or a validated write helper.

## 3. Keep expected failures in the type

```ts
const SpendHealth = Game.System(
  "Game/SpendHealth",
  {
    queries: {
      target: Game.Query({
        selection: { health: Game.Query.write(Health) }
      })
    }
  },
  ({ queries }) => {
    const target = queries.target.single()
    if (!target.ok) {
      return Fx.fail("TargetMissing" as const)
    }

    const health = target.value.data.health.get()
    if (health <= 0) {
      return Fx.fail("AlreadyDead" as const)
    }

    return Fx.sync(() => target.value.data.health.set(health - 1))
  }
)

const gameplay = Game.Schedule(Move, SpendHealth)
const runtime = Game.Runtime.make({
  services: Game.Runtime.services(),
  resources: { DeltaTime: 1 / 60 }
})

const update = runtime.runSchedule(gameplay)
if (!update.ok) {
  // update.error is the exact named-system failure union:
  // SystemFailure<"Game/SpendHealth", "TargetMissing" | "AlreadyDead">
  console.error(update.error.system, update.error.error)
}
```

Component, resource, state, event, queued-machine, and deferred-command writes
from the failing system are rolled back or discarded. Earlier successful
systems remain committed. External service effects, such as network or audio
calls, cannot be rolled back by the ECS.

Thrown exceptions remain defects and are rethrown after ECS writes from that
system are rolled back. `Fx.fail` is for expected game outcomes.

## 4. Own scene entities as a group

Marker components are useful gameplay data, but they should not be required
only to delete a level. Entity scopes model ownership directly.

```ts
const Level = Game.EntityScope("Game/Level")

const LoadLevel = Game.System("Game/LoadLevel", {}, ({ commands }) =>
  Fx.sync(() => {
    commands.spawnIn(Level, Game.Command.spawnWith(
      Game.Command.entry(Position, { x: 10, y: 20 }),
      Game.Command.entry(Health, 3)
    ))
  })
)

const UnloadLevel = Game.System("Game/UnloadLevel", {}, ({ commands }) =>
  Fx.sync(() => commands.despawnScope(Level))
)
```

Persistent entities can still use `commands.spawn(...)`. Scope cleanup uses the
normal deferred-command boundary, so lifecycle readers and renderer cleanup
systems see the same despawns as any other entity removal.

## 5. Read the world without making a diagnostic system

Inspectors are reusable read-only projections for tests, saves, debugging, UI
bridges, and host code.

```ts
const WorldSummary = Game.Inspector(
  "Game/WorldSummary",
  {
    queries: {
      actors: Game.Query({
        selection: {
          position: Game.Query.read(Position),
          health: Game.Query.read(Health)
        }
      })
    }
  },
  ({ queries }) => queries.actors.each().map(({ entity, data }) => ({
    id: entity.id,
    position: data.position.get(),
    health: data.health.get()
  }))
)

const summary = runtime.inspect(WorldSummary)
```

An inspector cannot declare write queries, write resources, commands, event
writers, or state-transition writers. Runtime provisioning is checked at the
call, and inspection does not advance events or lifecycle buffers.

## 6. Drive fixed updates from any renderer

`@bevy-ts/browser` supplies timing policy without owning the ECS or renderer.

```ts
import { FixedLoop } from "@bevy-ts/browser"

const source = FixedLoop.animationFrames(window)
const loop = FixedLoop.start({
  source,
  stepSeconds: 1 / 60,
  maxFrameSeconds: 0.1,
  maxStepsPerFrame: 5,
  update: (stepSeconds) => {
    // A capture system can copy this host value into DeltaTime first.
    hostClock.deltaSeconds = stepSeconds
    return runtime.runSchedule(gameplay)
  },
  render: ({ alpha, droppedSeconds }) => {
    renderer.render({ alpha })
    if (droppedSeconds > 0) {
      metrics.recordDroppedTime(droppedSeconds)
    }
  },
  onFailure: (failure) => {
    if (failure.kind === "UpdateFailure") {
      showGameError(failure.error)
    }
  }
})

if (!loop.ok) {
  throw new Error(`Invalid timing option: ${loop.error.field}`)
}

// Later:
loop.value.stop()
```

Pixi, Three, Canvas, DOM, tests, and server simulations can provide another
`TickSource`. The gameplay schedules do not change.

## What remains adapter code

The core deliberately does not choose an asset loader, renderer, audio engine,
physics engine, networking stack, or save format. Those integrations should be
small packages built from services, systems, lifecycle readers, and inspectors.
The next renderer package should be based on at least two real games so its API
captures a repeated pattern instead of one demo's object model.

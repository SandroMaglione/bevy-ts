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

Build a closed schema and bind it once:

```ts
import { Schema } from "./src/index.ts"

const movement = Schema.fragment({
  components: { Position, Velocity },
  resources: { Time }
})

const schema = Schema.build(movement)
const Game = Schema.bind(schema)
```

Define a system:

```ts
import { Fx, Query, System } from "./src/index.ts"

const MoveSystem = Game.System.define(
  "MoveSystem",
  {
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
import { App, Runtime } from "./src/index.ts"

const update = Game.Schedule.define({
  systems: [MoveSystem]
})

const runtime = Game.Runtime.make({
  services: Runtime.services(
    // Services are provided through their descriptors.
    Runtime.service(Logger, {
      log(message) {
        console.log(message)
      }
    })
  ),
  resources: {
    // Resources are initialized by schema key.
    Time: 1 / 60
  }
})

const app = App.makeApp(runtime)
// This only type-checks if the runtime satisfies everything `update` requires.
app.update(update)
```

## Core flow

The normal flow is simple: define descriptors, group them into schema fragments, build one final schema, define systems against that schema, group systems into schedules, then run those schedules from your own loop. Rendering, input, physics, and timing stay outside the runtime unless you explicitly model them as resources or services.

Systems only see what they declare. Queries describe read and write access up front. Resources, events, states, and services are exposed as typed views. Mutation goes through deferred commands instead of direct world writes.

## Runtime requirements

Schedules now carry the runtime requirements implied by their systems. A runtime records which services it provides and which resources and states it initialized. You can only run a schedule when those two sides match.

```ts
const TickSystem = Game.System.define(
  "TickSystem",
  {
    resources: {
      time: System.readResource(Time)
    },
    states: {
      phase: System.readState(Phase)
    },
    services: {
      logger: System.service(Logger)
    }
  },
  ({ resources, states, services }) =>
    Fx.sync(() => {
      services.logger.log(`${states.phase.get()}: ${resources.time.get()}`)
    })
)

const tick = Game.Schedule.define({ systems: [TickSystem] })

const runtime = Game.Runtime.make({
  services: Runtime.services(
    // Services use their descriptors.
    Runtime.service(Logger, {
      log(message) {
        console.log(message)
      }
    })
  ),
  resources: {
    // Resources use schema keys.
    Time: 1 / 60
  },
  states: {
    // States also use schema keys.
    Phase: "Running"
  }
})

App.makeApp(runtime).update(tick)
```

If one of those inputs is missing, the schedule should fail in typecheck before it can fail at runtime.

Services are provisioned through descriptors so runtime lookup follows the same
identity the system spec declared. Resources and states stay keyed by schema
property names because they come from the closed schema registry.

## State machines

Finite state machines are a dedicated API, separate from generic `states`. They follow the useful part of Bevy's state model: systems queue the next state, the current state stays stable until an explicit transition marker runs, and enter/exit/transition schedules are registered separately.

Define one machine from the bound schema root:

```ts
const AppState = Game.StateMachine.define(
  "AppState",
  ["Menu", "Playing", "Paused"] as const
)
```

Read the current state, queue the next one, and gate systems with typed conditions:

```ts
const PauseInputSystem = Game.System.define(
  "PauseInput",
  {
    nextMachines: {
      app: System.nextState(AppState)
    }
  },
  ({ nextMachines }) =>
    Fx.sync(() => {
      nextMachines.app.set("Paused")
    })
)

const GameplaySystem = Game.System.define(
  "Gameplay",
  {
    when: [Game.Condition.inState(AppState, "Playing")]
  },
  () => Fx.sync(() => {
    // Runs only while the committed state is "Playing".
  })
)
```

Apply transitions explicitly inside the schedule:

```ts
const update = Game.Schedule.define({
  systems: [PauseInputSystem, GameplaySystem],
  steps: [
    PauseInputSystem,
    Game.Schedule.applyStateTransitions(),
    GameplaySystem
  ]
})
```

This means a queued `set("Paused")` is invisible before `applyStateTransitions()`, and visible after it. That makes same-schedule behavior predictable.

You can also attach explicit transition schedules:

```ts
const OnEnterPaused = Game.System.define(
  "OnEnterPaused",
  {
    transitions: {
      app: System.transition(AppState)
    }
  },
  ({ transitions }) =>
    Fx.sync(() => {
      const { from, to } = transitions.app.get()
      console.log(`entered ${to} from ${from}`)
    })
)

Game.Schedule.onExit(AppState, "Playing", {
  systems: [StopGameplayAudioSystem]
})

Game.Schedule.onTransition(AppState, { from: "Playing", to: "Paused" }, {
  systems: [PersistCheckpointSystem]
})

Game.Schedule.onEnter(AppState, "Paused", {
  systems: [OnEnterPaused]
})
```

The current order is:

1. `onExit(previous)`
2. `onTransition({ from, to })`
3. commit the new current state
4. `onEnter(current)`

This unlocks the common orchestration cases that are awkward without a typed FSM layer: menus, pause screens, turn phases, battle phases, cutscenes, and editor vs play mode.

## Spawning entities

Use `Command.spawnWith(...)` as the default way to create typed drafts without nested insert chains:

```ts
import { Command, Fx, System } from "./src/index.ts"

const SpawnProjectileSystem = Game.System.define(
  "SpawnProjectileSystem",
  {
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
import { Label, System } from "./src/index.ts"

const MovementSet = Label.defineSystemSetLabel("Movement")

const InputSystem = Game.System.define("Input", {
  inSets: [MovementSet]
}, ({}) => Fx.sync(() => {}))

const MoveSystem = Game.System.define("Move", {
  inSets: [MovementSet],
  after: [InputSystem]
}, ({}) => Fx.sync(() => {}))

const update = Game.Schedule.define({
  systems: [InputSystem, MoveSystem],
  sets: [
    Game.Schedule.configureSet({
      label: MovementSet,
      chain: true
    })
  ]
})
```

No runtime-relevant references are open strings. Systems are referenced directly. Reusable sets use typed labels. Schedules only need labels when some other API must refer to them externally.

## Renderer integration

The intended renderer pattern is to keep host objects outside ECS, inject them as services, and synchronize ECS data into them from a dedicated system.

```ts
const PixiHost = Descriptor.defineService<{
  readonly application: Application
  readonly sprites: Map<number, Sprite>
}>()("PixiHost")

const SyncPixiSceneSystem = Game.System.define(
  "SyncPixiSceneSystem",
  {
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

        // The Pixi host has to be present in the runtime before this schedule can run.
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

Descriptors define nominal identities for components, resources, events, states, and services. Schemas close the world. Systems declare ECS access and service dependencies explicitly. Schedules order execution, define apply/event phases, and carry their runtime requirements. The runtime owns world state, but not the outer loop, and the app/runtime execution boundary is where those requirements are checked.

The important rule is simple: if TypeScript cannot prove something honestly, the public API should not pretend it can. Internals may erase types when needed, but that should not leak through the external surface.

## Examples

The repo currently includes:

- [`src/examples/smoke.ts`](./src/examples/smoke.ts) for the smallest end-to-end setup
- [`src/examples/pokemon.ts`](./src/examples/pokemon.ts) for ordered movement and collision
- [`src/examples/snake.ts`](./src/examples/snake.ts) for events, lookup, spawn, and despawn flow
- [`src/examples/pixi.ts`](./src/examples/pixi.ts) for renderer/service integration
- [`src/examples/space-invaders.ts`](./src/examples/space-invaders.ts) for a larger browser example with Pixi rendering and headless Matter-backed collision

## Current limits

This is still an early implementation. The public types are stricter than the runtime internals, and the project is not aiming for full Bevy parity yet. Dependency closure happens at the runtime and app execution boundary, not through Effect-style local `provide` or layer graphs. Performance-oriented storage, observers, richer state transitions, and parallel scheduling are not the current focus.

## Roadmap

The next meaningful additions are the ones that unlock broader classes of games, not just convenience. The order below is based on feature reach, not implementation ease.

### 1. Run conditions and typed state transitions

This is now the dedicated state-machine layer shown above. The API keeps the useful Bevy semantics around `run_if`-style gating and `OnEnter` / `OnExit` / `OnTransition`, but uses explicit schema-bound machine definitions and an explicit `applyStateTransitions()` marker instead of engine-owned global phases.

It covers things like:

```ts
const PlayingSystems = Game.Schedule.define({
  systems: [MovementSystem, CombatSystem],
  steps: [
    InputSystem,
    Game.Schedule.applyStateTransitions(),
    MovementSystem,
    CombatSystem
  ]
})

Game.Schedule.onEnter(AppState, "Paused", {
  systems: [ShowPauseOverlaySystem]
})
```

### 2. Entity relationships and hierarchy

This is the main structural gap after orchestration. It would unlock scene graphs, ownership, attachments, card zones, UI trees, equipment, and simulation-style graphs. Bevy's parent/children and newer relationship APIs are the right reference space, but this runtime would want descriptor-driven and fully typed relations.

It would unlock things like:

```ts
const EquippedBy = Descriptor.defineRelation<Entity.EntityId<typeof schema>>("EquippedBy")
const ChildOf = Descriptor.defineRelation<Entity.EntityId<typeof schema>>("ChildOf")

commands.spawn(
  Command.spawnWith<typeof schema>(
    [Sword, {}],
    [EquippedBy, playerId],
    [ChildOf, playerId]
  )
)
```

### 3. Change detection and lifecycle signals

Renderer sync, replication, dirty tracking, and reactive gameplay systems all get easier once systems can express added, changed, removed, or despawned data directly. Bevy's `Added`, `Changed`, removals, hooks, and observers are the reference space, though the likely starting point here would be a smaller typed query/filter surface instead of full observer parity.

It would unlock things like:

```ts
const SpawnHealthBarSystem = Game.System.define(
  "SpawnHealthBar",
  {
    queries: {
      spawnedEnemies: Query.define({
        selection: {
          enemy: Query.read(Enemy),
          health: Query.read(Health)
        },
        filters: [Query.added(Enemy)]
      })
    }
  },
  ({ queries }) => Fx.sync(() => {
    for (const enemy of queries.spawnedEnemies.each()) {
      // Create UI only for newly spawned enemies.
    }
  })
)
```

### 4. Richer query and filter semantics

This matters even more once relationships and lifecycle signals exist. Optional component access, lifecycle-aware filters, and relation-aware queries would make strategy, sim, RPG, and tooling-heavy code much more expressive without pushing logic into custom lookup helpers.

It would unlock things like:

```ts
const InteractableQuery = Query.define({
  selection: {
    position: Query.read(Position),
    npc: Query.optional(Npc),
    item: Query.optional(Item)
  },
  filters: [
    Query.with(Interactable),
    Query.without(Hidden)
  ]
})
```

### 5. Typed feature or module composition

This is the longer-term architectural piece. Larger games eventually need a first-class way to assemble optional gameplay features, server/client/editor variants, and reusable modules. Bevy plugins are the reference for the problem being solved, not the intended API shape.

It would unlock things like:

```ts
const Combat = Game.Feature.define({
  schema: combatFragment,
  schedules: [combatUpdate],
  services: [DamageResolver]
})

const app = Game.App.make({
  features: [Core, Combat, Dialogue]
})
```

### Out of scope for now

Some additions are intentionally not near-term because they do not match the current goals.

Built-in time, timers, fixed-step helpers, and engine-owned loop phases are out of scope because cadence is meant to stay owned by external hosts like Pixi or Matter, not by the ECS runtime.

Full Effect-style local `provide` or layer graphs are also out of scope because dependency closure currently belongs at the runtime and app boundary, not at arbitrary local execution sites.

Full Bevy plugin parity, full observer parity, asset pipeline abstractions, and advanced parallel scheduler work remain useful future references, but they are not current priorities.

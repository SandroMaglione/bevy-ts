# `bevy-ts`

A type-safe, game-loop-agnostic ECS runtime for TypeScript.

It keeps Bevy-style ECS concepts, but the public API is shaped more like Effect: explicit schemas, explicit system access, deferred mutation, and typed service dependencies. The runtime is still early, but the type model is already the main design surface.

## Quick start

The smallest recommended shape is:

1. define descriptors
2. build one closed schema and bind `Game`
3. define one `bootstrap` schedule for initial spawning
4. define one `update` schedule for per-frame simulation
5. use a `StateMachine` only when the phase boundary itself matters
6. keep the outer loop outside ECS and call `app.bootstrap(...)` once, then `app.update(...)`

Define descriptors first:

```ts
import { Descriptor } from "./src/index.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const Time = Descriptor.defineResource<number>()("Time")
const Logger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("Logger")
```

Build one closed schema and bind it once:

```ts
import { Schema } from "./src/index.ts"

const movement = Schema.fragment({
  components: { Position, Velocity },
  resources: { Time }
})

const schema = Schema.build(movement)
// `Game` is the only authoring surface for runtime-connected code.
const Game = Schema.bind(schema)
```

If the gameplay phase boundary matters, define a machine on the bound root:

```ts
const Phase = Game.StateMachine.define("Phase", ["Running", "Paused"])
```

Define one setup system and one update system against that bound root:

```ts
import { Fx } from "./src/index.ts"

const SetupSystem = Game.System.define(
  "SetupSystem",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      commands.spawn(
        Game.Command.spawnWith(
          [Position, { x: 0, y: 0 }],
          [Velocity, { x: 1, y: 0.5 }]
        )
      )
    })
)

const MoveSystem = Game.System.define(
  "MoveSystem",
  {
    when: [Game.Condition.inState(Phase, "Running")],
    queries: {
      moving: Game.Query.define({
        selection: {
          position: Game.Query.write(Position),
          velocity: Game.Query.read(Velocity)
        }
      })
    },
    resources: {
      time: Game.System.readResource(Time)
    },
    services: {
      logger: Game.System.service(Logger)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      // Systems only see the access they declared in the spec above.
      const dt = resources.time.get()
      for (const match of queries.moving.each()) {
        const velocity = match.data.velocity.get()
        match.data.position.update((position) => ({
          x: position.x + velocity.x * dt,
          y: position.y + velocity.y * dt
        }))
      }

      services.logger.log("movement step completed")
    })
)
```

Run those systems through explicit `bootstrap` and `update` schedules:

```ts
import { App } from "./src/index.ts"

const bootstrap = Game.Schedule.define({
  systems: [SetupSystem]
})

const update = Game.Schedule.define({
  systems: [MoveSystem],
  steps: [
    MoveSystem,
    Game.Schedule.applyDeferred()
  ]
})

const runtime = Game.Runtime.make({
  services: Game.Runtime.services(
    // Services are provided through their descriptors so runtime lookup
    // uses the same identity the system declared.
    Game.Runtime.service(Logger, {
      log(message) {
        console.log(message)
      }
    })
  ),
  resources: {
    // Resources are initialized by schema key from the closed schema.
    Time: 1 / 60
  },
  machines: Game.Runtime.machines(
    Game.Runtime.machine(Phase, "Running")
  }
})

const app = App.makeApp(runtime)
// This only type-checks if the runtime satisfies everything `update` requires.
app.bootstrap(bootstrap)
app.update(update)
```

The important runtime rule is that deferred writes are still queued inside the
system callback. They only become visible after explicit schedule markers like
`Game.Schedule.applyDeferred()` and `Game.Schedule.updateEvents()` run.

## Core flow

The normal flow is: define descriptors, group them into schema fragments, build one final schema, define systems, group them into schedules, then run those schedules from your own loop. Rendering, input, physics, and timing stay outside the runtime unless you model them explicitly as resources or services.

When choosing between the main ECS surfaces, the intended split is:

- resources for continuous world values such as delta time, counters, or animation clocks
- state machines for discrete phases where the transition boundary itself matters
- events for transient cross-system messages
- lifecycle reads for structural world changes that become visible only after `updateLifecycle()`

In practice, let runtime construction own initial resource and machine values, and keep setup systems focused on spawning world content.

## Smallest recommended structure

For the smallest modern app, prefer this shape:

- one schema block or one `schema.ts` that defines descriptors and binds `Game`
- one `bootstrap` schedule that only prepares initial world content
- one `update` schedule that owns the per-frame simulation flow
- one `StateMachine` when discrete phases need a queued commit boundary
- one external host loop that calls `app.update(...)`

This is the shape used by [`src/examples/smoke.ts`](./src/examples/smoke.ts), and
it is the best default starting point before adding renderer or browser
integration.

## Choosing between resources, states, and machines

Use the three singleton world surfaces for different jobs:

- resources for continuous world values such as time, scores, camera positions, counters, or cached host snapshots
- `StateMachine` for discrete phases where the transition boundary itself matters
- descriptor-backed `states` for singleton schema values that do not need queued transitions, transition events, or enter/exit behavior

If you want any of these, the answer is almost certainly `StateMachine`, not plain state descriptors:

- `Game.Condition.inState(...)`
- `Game.System.nextState(...)`
- `Game.Schedule.applyStateTransitions(...)`
- enter / exit / transition handlers
- committed transition events later in the same schedule

Use plain `states` when the value is just a singleton world slot and there is
no meaningful transition boundary.

```ts
const Session = Game.StateMachine.define("Session", ["Menu", "Playing", "Paused"])

const ActiveLocale = Descriptor.defineState<"en" | "it">()("ActiveLocale")
```

`Session` is a machine because the queued transition boundary matters.
`ActiveLocale` is just one current singleton value.

## Runtime requirements

Schedules now carry the runtime requirements implied by their systems. A runtime records which services it provides and which resources and states it initialized. You can only run a schedule when those two sides match.

```ts
const Phase = Game.StateMachine.define("Phase", ["Running", "Paused"])

const TickSystem = Game.System.define(
  "TickSystem",
  {
    resources: {
      time: Game.System.readResource(Time)
    },
    machines: {
      phase: Game.System.machine(Phase)
    },
    services: {
      logger: Game.System.service(Logger)
    }
  },
  ({ resources, machines, services }) =>
    Fx.sync(() => {
      services.logger.log(`${machines.phase.get()}: ${resources.time.get()}`)
    })
)

const tick = Game.Schedule.define({ systems: [TickSystem] })

const runtime = Game.Runtime.make({
  services: Game.Runtime.services(
    // Services use their descriptors.
    Game.Runtime.service(Logger, {
      log(message) {
        console.log(message)
      }
    })
  ),
  resources: {
    // Resources use schema keys.
    Time: 1 / 60
  },
  machines: Game.Runtime.machines(
    Game.Runtime.machine(Phase, "Running")
  )
})

App.makeApp(runtime).update(tick)
```

If one of those inputs is missing, the schedule should fail in typecheck before it can fail at runtime. Services use descriptors, resources stay keyed by schema property names, and machines are provided explicitly through `Game.Runtime.machines(...)`.

For gameplay modes or phase machines, prefer `StateMachine` instead of plain `states`. Plain `states` are best used as schema-owned singleton values without queued transition semantics.

## Spawning entities

Use `Game.Command.spawnWith(...)` as the default way to create typed drafts without nested insert chains:

```ts
import { Fx } from "./src/index.ts"

const SpawnProjectileSystem = Game.System.define(
  "SpawnProjectileSystem",
  {
    services: {
      logger: Game.System.service(Logger)
    }
  },
  ({ commands, services }) =>
    Fx.sync(() => {
      const projectile = Game.Command.spawnWith(
        [Position, { x: 0, y: 0 }],
        [Velocity, { x: 4, y: 0 }]
      )

      // Commands are deferred. The world changes after the schedule reaches
      // its apply phase, not immediately in this callback.
      commands.spawn(projectile)
      services.logger.log("queued projectile spawn")
    })
)
```

`Game.Command.spawn()` and single-step `Game.Command.insert(...)` still exist, but `spawnWith(...)` is the default authoring path.

## Reusable typed drafts

Keep `spawnWith(...)` inline for one-off entities. When the same shape appears
more than once, extract a small local factory function that returns the draft
and keep the actual spawn explicit.

```ts
const makeTailDraft = (parent: Entity.Handle<typeof Root>, position: GridPosition) =>
  Game.Command.spawnWith(
    [Position, position],
    [PreviousPosition, position],
    [SnakeBody, { parent, isTail: true }]
  )

commands.spawn(makeTailDraft(Game.Entity.handle(headId), { x: 4, y: 5 }))
```

This is the recommended scaling path:

- inline `spawnWith(...)` when the draft is truly one-off
- extract `makeXDraft(...)` when the same tuple shape repeats
- keep factories as ordinary functions, not schema registrations
- keep `commands.spawn(...)` explicit so schedule boundaries stay obvious

Reference examples:

- [`src/examples/top-down/drafts.ts`](./src/examples/top-down/drafts.ts)
- [`src/examples/snake.ts`](./src/examples/snake.ts)
- [`src/examples/pokemon.ts`](./src/examples/pokemon.ts)

## Ordering systems

Direct system references are the default ordering mechanism. Reusable sets stay explicit and typed.

```ts
import { Label } from "./src/index.ts"

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

No runtime-relevant references are open strings. Systems are referenced directly, and reusable sets use typed labels.

## State machines

Finite state machines are a dedicated API for discrete state with explicit transition boundaries. Systems queue the next state, the current state stays stable until `applyStateTransitions(...)`, and continuous values such as timers or animation elapsed time still stay in resources. When some local resource needs to react to machine changes, prefer `Game.Condition.stateChanged(...)` or transition handlers over storing "last state" fields manually.

This is the default gameplay-phase tool. If the meaning of the state depends on
when the transition commits, use a machine.

### Define machines

Define machines from the bound schema root:

```ts
const AppState = Game.StateMachine.define(
  "AppState",
  ["Menu", "Playing", "Paused"]
)

const ModalState = Game.StateMachine.define(
  "ModalState",
  ["None", "Inventory", "Map"]
)
```

### Read and queue state

Read the current state, queue the next one, and gate systems with typed conditions:

```ts
const PauseInputSystem = Game.System.define(
  "PauseInput",
  {
    nextMachines: {
      app: Game.System.nextState(AppState)
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
    when: [
      Game.Condition.and(
        Game.Condition.inState(AppState, "Playing"),
        Game.Condition.inState(ModalState, "None")
      )
    ]
  },
  () => Fx.sync(() => {
    // Runs only while the committed state is "Playing".
  })
)
```

### When to use more than one machine

Prefer multiple smaller machines when they model different boundary axes.

The canonical pattern is:

- one machine for session flow such as title, countdown, round, or game over
- one machine for round-local flow such as playing, paused, victory, or defeat
- explicit `inState(...)` gating across both when behavior depends on both axes
- transition bundles on the machine whose boundary owns the reset or entry work
- later observation through `readTransitionEvent(...)`

That is the pattern used in [`src/examples/state-machine.ts`](./src/examples/state-machine.ts):

```ts
const SessionState = Game.StateMachine.define(
  "SessionState",
  ["Title", "Countdown", "Round"]
)

const RoundState = Game.StateMachine.define(
  "RoundState",
  ["Playing", "Paused", "Victory", "Defeat"]
)
```

This is usually clearer than one large machine with unrelated combined values.

## Reset and restart flow

The canonical reset pattern is transition-driven:

1. queue restart intent with `Game.System.nextState(...)`
2. commit it at `Game.Schedule.applyStateTransitions(...)`
3. run reset work from `Game.Schedule.onEnter(...)`, `onExit(...)`, or `onTransition(...)`
4. keep the reset work explicit: reset resources, despawn stale entities, and respawn fresh gameplay content in ordinary systems

This keeps restart behavior aligned with the same explicit schedule boundaries
as the rest of the library.

```ts
const Phase = Game.StateMachine.define("Phase", ["Playing", "GameOver"])

const QueueRestartSystem = Game.System.define(
  "QueueRestart",
  {
    when: [Game.Condition.inState(Phase, "GameOver")],
    nextMachines: {
      phase: Game.System.nextState(Phase)
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumeRestart()) {
        nextMachines.phase.set("Playing")
      }
    })
)

const ResetWorldSystem = Game.System.define(
  "ResetWorld",
  {
    resources: {
      score: Game.System.writeResource(Score)
    }
  },
  ({ resources, commands }) =>
    Fx.sync(() => {
      resources.score.set(0)
      commands.spawn(
        Game.Command.spawnWith([Player, {}], [Position, { x: 0, y: 0 }])
      )
    })
)

const phaseTransitions = Game.Schedule.transitions(
  Game.Schedule.onEnter(Phase, "Playing", {
    systems: [ResetWorldSystem]
  })
)

const update = Game.Schedule.define({
  systems: [QueueRestartSystem, GameplaySystem],
  steps: [
    QueueRestartSystem,
    GameplaySystem,
    Game.Schedule.applyDeferred(),
    Game.Schedule.applyStateTransitions(phaseTransitions)
  ]
})
```

The important behavior is that restart is not immediate when input is pressed.
The intent is queued first, then committed at the explicit transition boundary,
and only then does the reset system run.

### Why this stays explicit

Bevy also explores state-scoped cleanup patterns such as automatic despawn on
state enter or exit. That is useful in an engine-owned app model, but this
library intentionally keeps restart work explicit in systems and transition
bundles.

The reason is to preserve:

- explicit schedule boundaries
- explicit resource reset
- explicit despawn and respawn topology
- no hidden cleanup behavior that runs outside the declared system flow

Reference examples:

- [`src/examples/snake.ts`](./src/examples/snake.ts)
- [`src/examples/state-machine.ts`](./src/examples/state-machine.ts)

### Apply transitions explicitly

Bundle transition handlers explicitly and attach them to the transition marker:

```ts
const appTransitions = Game.Schedule.transitions(
  Game.Schedule.onExit(AppState, "Playing", {
    systems: [StopGameplayAudioSystem]
  }),
  Game.Schedule.onTransition(AppState, { from: "Playing", to: "Paused" }, {
    systems: [PersistCheckpointSystem]
  }),
  Game.Schedule.onEnter(AppState, "Paused", {
    systems: [ShowPauseOverlaySystem]
  })
)

const update = Game.Schedule.define({
  systems: [PauseInputSystem, GameplaySystem],
  steps: [
    PauseInputSystem,
    // Pending state only becomes committed at this exact marker.
    Game.Schedule.applyStateTransitions(appTransitions),
    GameplaySystem
  ]
})
```

Queued state is invisible before `applyStateTransitions()` and visible after it.

The three main explicit schedule boundaries are:

- `applyStateTransitions()` for queued machine state
- `updateEvents()` for emitted events
- `updateLifecycle()` for added / changed / removed / despawned visibility

Transition schedules are pure values and only run when bundled into the exact marker that should execute them:

```ts
const OnEnterPaused = Game.System.define(
  "OnEnterPaused",
  {
    transitions: {
      app: Game.System.transition(AppState)
    }
  },
  ({ transitions }) =>
    Fx.sync(() => {
      const { from, to } = transitions.app.get()
      console.log(`entered ${to} from ${from}`)
    })
)

const pauseTransitions = Game.Schedule.transitions(
  Game.Schedule.onExit(AppState, "Playing", {
    systems: [StopGameplayAudioSystem]
  }),
  Game.Schedule.onTransition(AppState, { from: "Playing", to: "Paused" }, {
    systems: [PersistCheckpointSystem]
  }),
  Game.Schedule.onEnter(AppState, "Paused", {
    systems: [OnEnterPaused]
  })
)
```

The current order is:

1. `onExit(previous)`
2. `onTransition({ from, to })`
3. commit the new current state
4. `onEnter(current)`

### React later through transition events

If code outside the transition bundle needs to react later, read the machine's committed transition events after `updateEvents()`:

```ts
const ObserveTransitions = Game.System.define(
  "ObserveTransitions",
  {
    transitionEvents: {
      app: Game.System.readTransitionEvent(AppState)
    }
  },
  ({ transitionEvents }) =>
    Fx.sync(() => {
      for (const event of transitionEvents.app.all()) {
        console.log(`${event.from} -> ${event.to}`)
      }
    })
)

const update = Game.Schedule.define({
  systems: [PauseInputSystem, ObserveTransitions],
  steps: [
    PauseInputSystem,
    Game.Schedule.applyStateTransitions(appTransitions),
    Game.Schedule.updateEvents(),
    ObserveTransitions
  ]
})
```

This covers the common orchestration cases that are awkward without a typed FSM layer: menus, pause screens, turn phases, and similar mode-driven flows.

## Relationships and hierarchy

Relationships are explicit schema entries. General relations and hierarchy use separate paired constructors so the relation kind stays typed through commands, queries, and lookup.

```ts
const { relation: ChildOf } = Descriptor.defineHierarchy("ChildOf", "Children")
const { relation: Targeting } = Descriptor.defineRelation("Targeting", "TargetedBy")

const schema = Schema.build(Schema.fragment({
  components: {
    Position,
    Unit
  },
  relations: {
    ChildOf,
    Targeting
  }
}))

const Game = Schema.bind(schema)

const RelationQuery = Game.Query.define({
  selection: {
    parent: Game.Query.optionalRelation(ChildOf),
    children: Game.Query.optionalRelated(ChildOf)
  }
})
```

Hierarchy traversal is only available for hierarchy relations and stays explicit through `lookup`:

```ts
const result = lookup.descendants(rootId, ChildOf, { order: "depth" })
if (result.ok) {
  for (const childId of result.value) {
    // ...
  }
}
```

Relationships model current world structure and ownership. They are not a substitute for durable handles, which are for storing long-lived targets across frames and resolving them later through checked lookup. For single-target gameplay state such as a focused interactable, a durable handle in a resource is usually the simpler model.

## Renderer integration

The intended renderer pattern is to keep host objects outside ECS, inject them as services, and synchronize ECS data into them from dedicated host-sync systems.

```ts
const PixiHost = Descriptor.defineService<{
  readonly application: Application
  readonly sprites: Map<number, Sprite>
}>()("PixiHost")

const SyncPixiSceneSystem = Game.System.define(
  "SyncPixiSceneSystem",
  {
    queries: {
      renderables: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          renderable: Game.Query.read(Renderable)
        }
      })
    },
    services: {
      pixi: Game.System.service(PixiHost)
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

This is the same pattern used in [`src/examples/pixi.ts`](./src/examples/pixi.ts). For richer browser examples:

- keep host objects like Pixi sprites, textures, and containers outside ECS
- use `Game.Query.optional(...)` when several renderable kinds genuinely fit one sync loop
- use lifecycle reads to create and destroy host-owned objects incrementally
- place lifecycle-driven host sync only after `Game.Schedule.updateLifecycle()`

For larger scenes, it is often clearer to split host sync into a few small systems:

- one system to apply camera or world-container transforms
- one lifecycle-driven system to create host nodes
- one lifecycle-driven system to destroy host nodes
- one or more narrow sync systems for transforms, sprite frame selection, or host-only presentation

`optional(...)` is useful, but it should not force everything back into one mixed render pass if smaller changed- or lifecycle-driven systems are easier to reason about.

### Host sync boundary

The important runtime rule is simple: lifecycle-driven host sync is only valid
after `Game.Schedule.updateLifecycle()`.

That boundary commits the readable lifecycle buffers used by:

- `Game.Query.added(...)`
- `Game.Query.changed(...)`
- `Game.System.readRemoved(...)`
- `Game.System.readDespawned()`

If host create/destroy/update systems run before that boundary, they observe
stale structural data from the previous lifecycle commit.

### Canonical host-sync patterns

There are two endorsed host-sync patterns.

#### Incremental host sync

Use this when host objects are mostly stable and only need incremental create
plus narrow update passes. This is the smallest pattern and is the right
default for many renderer bridges.

```ts
const browserUpdate = Game.Schedule.define({
  systems: [
    simulateSystem,
    createNodesSystem,
    syncTransformsSystem
  ],
  steps: [
    simulateSystem,
    Game.Schedule.applyDeferred(),
    Game.Schedule.updateLifecycle(),
    createNodesSystem,
    syncTransformsSystem
  ]
})
```

Typical pieces:

- `added(...)` query for host-node creation
- one or more narrow `changed(...)` or plain read queries for transforms or presentation
- optional `readRemoved(...)` / `readDespawned()` cleanup if entities can disappear

Reference examples:

- [`src/examples/pixi.ts`](./src/examples/pixi.ts)
- [`src/examples/pokemon.ts`](./src/examples/pokemon.ts)

#### Authoritative host mirror

Use this when the host representation needs explicit destroy, create, sync, and
optional reconcile phases. This is clearer when the host can drift or when
multiple render-side structures must stay in sync.

```ts
const browserUpdate = Game.Schedule.define({
  systems: [
    simulateSystem,
    destroyNodesSystem,
    createNodesSystem,
    syncTransformsSystem,
    reconcileNodesSystem
  ],
  steps: [
    simulateSystem,
    Game.Schedule.applyDeferred(),
    Game.Schedule.updateLifecycle(),
    destroyNodesSystem,
    createNodesSystem,
    syncTransformsSystem,
    reconcileNodesSystem
  ]
})
```

Typical pieces:

- `readRemoved(...)` and `readDespawned()` for cleanup
- `added(...)` for creation
- one or more sync systems for transforms or appearance
- optional reconcile pass when host-owned collections can drift

Reference examples:

- [`src/examples/snake.ts`](./src/examples/snake.ts)
- [`src/examples/space-invaders.ts`](./src/examples/space-invaders.ts)
- [`src/examples/state-machine.ts`](./src/examples/state-machine.ts)

### Browser loop walkthrough

The practical browser shape is:

1. run one setup/bootstrap schedule that spawns initial world state
2. each frame, update host-owned clocks or input services
3. run one update schedule that keeps simulation and host sync in explicit phases

```ts
const updateSchedule = Game.Schedule.define({
  systems: [
    captureInputSystem,
    simulationSystem,
    commitTransitionEffectsSystem,
    destroyNodesSystem,
    createNodesSystem,
    syncTransformsSystem
  ],
  steps: [
    captureInputSystem,
    simulationSystem,
    Game.Schedule.applyDeferred(),
    Game.Schedule.applyStateTransitions(transitions),
    Game.Schedule.updateEvents(),
    Game.Schedule.updateLifecycle(),
    commitTransitionEffectsSystem,
    destroyNodesSystem,
    createNodesSystem,
    syncTransformsSystem
  ]
})

const tick = () => {
  runtime.runSchedule(updateSchedule)
}
```

This keeps the phases explicit:

- simulation writes commands, events, and next-state changes
- `applyDeferred()` commits structural changes
- `applyStateTransitions(...)` commits queued machine state changes
- `updateEvents()` makes committed events readable later in the same schedule
- `updateLifecycle()` makes `added`, `changed`, `removed`, and `despawned` readable
- host sync runs only after those visibility boundaries are committed

If host create/destroy systems are moved before `updateLifecycle()`, the
renderer sees the previous lifecycle state instead of the current one.

### Transient entity references across deferred boundaries

When an entity reference must cross a deferred boundary like
`Game.Schedule.updateEvents()`, store a durable `Handle` and re-resolve it
later through checked lookup.

The rule is explicit:

- `EntityId` is the current-runtime identity for the world you are in now
- `Handle` is the storage-safe reference form for events, resources, or components
- crossing `updateEvents()` means liveness is no longer guaranteed
- later code must call `lookup.getHandle(...)` and handle failure explicitly

```ts
const DetectCollisionSystem = Game.System.define(
  "DetectCollision",
  {
    events: {
      destroyEnemy: Game.System.writeEvent(DestroyEnemy)
    }
  },
  ({ events }) =>
    Fx.sync(() => {
      events.destroyEnemy.emit({
        bullet: Game.Entity.handleAs(Bullet, bulletId),
        enemy: Game.Entity.handleAs(Enemy, enemyId)
      })
    })
)

const DestroyEnemySystem = Game.System.define(
  "DestroyEnemy",
  {
    events: {
      destroyEnemy: Game.System.readEvent(DestroyEnemy)
    }
  },
  ({ events, lookup, commands }) =>
    Fx.sync(() => {
      for (const event of events.destroyEnemy.all()) {
        const bullet = lookup.getHandle(event.bullet, BulletQuery)
        if (bullet.ok) {
          commands.despawn(bullet.value.entity.id)
        }
      }
    })
)
```

The later system runs after `updateEvents()`, so the event itself is now
readable, but the referenced entity may already have changed or disappeared.
That is why re-resolution is required and why stale handles remain a normal
typed failure instead of an exception.

### When `Schedule.extend(...)` is the right tool

If the browser or renderer work is only a pure prefix or suffix around one
headless gameplay schedule, prefer `Game.Schedule.extend(...)` over restating
the gameplay steps manually.

That is the right tool for:

- frame input capture before gameplay
- host destroy/create/sync slices after gameplay
- browser-only setup wrapping a headless setup schedule

Keep using a normal `Game.Schedule.define(...)` when host work must be
interleaved in the middle of gameplay phases.

## Feature Composition

Typed feature composition is now implemented as a strict pre-bind layer under `Schema.Feature`.

```ts
const Root = Schema.defineRoot("Game")

const Core = Schema.Feature.define("Core", {
  schema: coreFragment,
  build: (Game) => ({
    bootstrap: [coreBootstrap]
  })
})

const Combat = Schema.Feature.define("Combat", {
  schema: combatFragment,
  requires: [Core],
  build: (Game) => ({
    update: [combatUpdate]
  })
})

const project = Schema.Feature.compose({
  root: Root,
  features: [Core, Combat]
})

const app = project.App.make({
  services: project.Game.Runtime.services(...)
})

app.bootstrap()
app.update()
```

The important constraints are:

- features are pure typed values, not imperative plugins
- composition happens before `Schema.bind(...)`
- dependencies are structural only: a feature can require another feature's schema slice, but does not receive that feature's built outputs directly
- runtime requirements still come from schedules, so there is no second dependency declaration surface to keep in sync

This keeps modular gameplay assembly inside the same guarantees as the rest of the library: schema closure, root flow, runtime requirements, and no user-facing casts or compiler-workaround scaffolding.

## Architecture

Descriptors define nominal identities for components, resources, events, states, and services. Schemas close the world. Systems declare ECS access and service dependencies explicitly. Schedules order execution, define apply/event phases, and carry their runtime requirements. The runtime owns world state, but not the outer loop, and the app/runtime execution boundary is where those requirements are checked.

The important rule is simple: if TypeScript cannot prove something honestly, the public API should not pretend it can. Internals may erase types when needed, but that should not leak through the external surface.

## Project organization

For a larger game, the most readable structure so far is the same one used by [`src/examples/top-down/`](./src/examples/top-down/):

- keep `schema.ts` as the single place for descriptors, bound `Game`, and state machines
- keep authored content and constants separate from systems, for example in `content.ts` and `constants.ts`
- group systems by behavior such as input, movement, interaction, animation, camera, and HUD instead of keeping one large file
- keep queries in one module when several systems share them, so query semantics stay easy to inspect
- keep renderer and browser host code outside ECS in dedicated modules like `host.ts` and `render/*`
- keep `main.ts` thin: create the host, create the runtime, boot schedules, connect the outer loop
- keep `runtime.ts` as the single source of initial resources and machine values
- keep schedules explicit even when the project is modular; composition should not hide `applyDeferred()`, `applyStateTransitions()`, or `updateLifecycle()`
- when a browser or host loop only needs to wrap a headless gameplay schedule with prefix or suffix phases, prefer `Game.Schedule.extend(...)` over restating the full gameplay schedule

This keeps the ECS side focused on simulation and orchestration, and the host side focused on rendering, input, assets, and browser lifecycle.

## Examples

The repo currently includes:

- [`src/examples/smoke.ts`](./src/examples/smoke.ts) for the smallest end-to-end setup
- [`src/examples/state-machine.ts`](./src/examples/state-machine.ts) for multiple machines, explicit transition bundles, and transition events
- [`src/examples/top-down.ts`](./src/examples/top-down.ts) for a browser proof of concept with free movement, wall collision, camera follow, and proximity-based collection
- [`src/examples/pixi.ts`](./src/examples/pixi.ts) for renderer/service integration
- [`src/examples/pokemon.ts`](./src/examples/pokemon.ts) for ordered movement and collision
- [`src/examples/snake.ts`](./src/examples/snake.ts) for events, lookup, spawn, and despawn flow
- [`src/examples/space-invaders.ts`](./src/examples/space-invaders.ts) for a larger browser example with Pixi rendering and headless Matter-backed collision

## Current limits

This is still an early implementation. The public types are stricter than the runtime internals, and the project is not aiming for full Bevy parity yet. Dependency closure happens at the runtime and app execution boundary, not through Effect-style local `provide` or layer graphs. Performance-oriented storage, observers, richer state transitions, and parallel scheduling are not the current focus.

At this point the main pressure is less "missing ECS capability" and more "choosing the right existing abstraction clearly" as the public API grows.

One important implementation rule is how type optimization works. The public API stays strict, root-bound, and explicit, but TypeScript and `tsgo` do have practical instantiation limits on very large composed values.

The current codebase follows this rule:

1. validate exact structure at the constructor boundary
2. derive and carry the normalized runtime-facing type once
3. widen only internal post-validation structure when that precision is no longer user-meaningful
4. keep the public guarantees exact

Concretely, the tradeoff looks like this:

```ts
const A = Game.System.define("A", { schema }, ...)
const B = Game.System.define("B", { schema, after: [A] }, ...)

const schedule = Game.Schedule.define({
  systems: [A, B, /* many more systems */],
  steps: [A, Game.Schedule.applyDeferred(), B, /* many more steps */]
})
```

After optimization, the important guarantees still need to hold:

- `B` really points to the exact `A` value in `after: [A]`
- invalid direct references are rejected when defining the schedule
- carried requirements stay correct
- the bound root stays correct
- runtime compatibility is still checked later on

The main thing allowed to relax internally is that a schedule value does not need to preserve the full tuple-exact identity of every system and step forever through every internal layer.

If a similar compiler hotspot appears again, the acceptable fix is:

- keep exact validation at the edge where the value is created
- collapse the carried value to a cheaper normalized shape immediately afterward
- preserve root safety, requirement safety, and explicit runtime failure semantics

What is not an acceptable fix:

- requiring user-facing casts
- requiring explicit generic arguments in normal examples
- requiring users to split schedules or features into pieces only to satisfy the compiler
- weakening cross-root rejection or runtime requirement validation

This is an internal compiler-cost tradeoff, not a user-meaningful loss of safety.

## Roadmap

1. Schedule execution still needs a cheaper carried type shape after validation. Refactoring [`src/examples/smoke.ts`](./src/examples/smoke.ts) to the current explicit API worked cleanly at the system and schedule-definition level, but the direct `app.update(update)` / `runtime.runSchedule(update)` path can still hit TypeScript instantiation limits in a minimal example. That is a direct violation of the library's main user-facing constraint: users should not need casts, explicit generics, or artificial schedule splitting just to execute a valid schedule. The execution boundary should preserve exact validation, root safety, and runtime-requirement safety while carrying a much cheaper normalized schedule type into `App` and `Runtime`.

2. A first-class randomness story is still a worthwhile feature addition. The snake example currently carries its own seed resource and local stepping logic in [`src/examples/snake.ts#L679-L739`](./src/examples/snake.ts#L679-L739), which keeps failure explicit but still leaves each gameplay example to invent its own RNG shape. A canonical typed RNG service, with one endorsed runtime-provisioning path, would make procedural gameplay code easier to author without weakening explicit dependencies.

3. Some gameplay code needs explicit stable traversal ordering, and today that is awkward to express directly. The snake example keeps ordering safe by storing parent handles and previous positions in [`MoveBodySystem`](./src/examples/snake.ts#L492-L512) and [`GrowSnakeSystem`](./src/examples/snake.ts#L576-L634), which is valid but indirect. A small ordered-query or ordered-iteration helper would keep order-dependent logic explicit instead of forcing users into structural workarounds whenever gameplay correctness depends on processing order.

## Out of scope for now

Some additions are intentionally not near-term because they do not match the current goals.

Built-in time, timers, fixed-step helpers, and engine-owned loop phases are out of scope because cadence is meant to stay owned by external hosts like Pixi or Matter, not by the ECS runtime.

Built-in camera systems, renderer scene graphs, asset pipelines, or sprite management layers are also out of scope. The ECS should model simulation state and explicit orchestration; host libraries should continue to own rendering, camera transforms, and asset concerns.

Full Effect-style local `provide` or layer graphs are also out of scope because dependency closure currently belongs at the runtime and app boundary, not at arbitrary local execution sites.

Full Bevy plugin parity, full observer parity, asset pipeline abstractions, and advanced parallel scheduler work remain useful future references, but they are not current priorities.

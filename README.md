# `bevy-ts`

A type-safe, game-loop-agnostic ECS runtime for TypeScript.

It keeps Bevy-style ECS concepts, but the public API is shaped more like Effect: explicit schemas, explicit system access, deferred mutation, and typed service dependencies. The runtime is still early, but the type model is already the main design surface.

## Quick start

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

Define one system against that bound root:

```ts
import { Fx } from "./src/index.ts"

const MoveSystem = Game.System.define(
  "MoveSystem",
  {
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

Run that system through a schedule and a runtime:

```ts
import { App } from "./src/index.ts"

const update = Game.Schedule.define({
  systems: [MoveSystem]
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
      time: Game.System.readResource(Time)
    },
    states: {
      phase: Game.System.readState(Phase)
    },
    services: {
      logger: Game.System.service(Logger)
    }
  },
  ({ resources, states, services }) =>
    Fx.sync(() => {
      services.logger.log(`${states.phase.get()}: ${resources.time.get()}`)
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

`Game.Command.spawn()` and single-step `Game.Command.insert(...)` still exist, but `spawnWith(...)` is the intended authoring path.

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

No runtime-relevant references are open strings. Systems are referenced directly. Reusable sets use typed labels. Schedules only need labels when some other API must refer to them externally.

## State machines

Finite state machines are a dedicated API, separate from generic `states`. They follow the useful part of Bevy's `States` model, but keep the transition boundary explicit in user schedules: systems queue the next state, the current state stays stable until an explicit transition marker runs, and enter/exit/transition handlers are attached locally to that marker.

### Define machines

Define machines from the bound schema root:

```ts
const AppState = Game.StateMachine.define(
  "AppState",
  ["Menu", "Playing", "Paused"] as const
)

const ModalState = Game.StateMachine.define(
  "ModalState",
  ["None", "Inventory", "Map"] as const
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

This means a queued `set("Paused")` is invisible before `applyStateTransitions()`, and visible after it. That makes same-schedule behavior predictable.

Transition schedules are pure values. They only run when bundled into the exact marker that should execute them:

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

This unlocks the common orchestration cases that are awkward without a typed FSM layer: menus, pause screens, turn phases, battle phases, cutscenes, and editor vs play mode.

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

This is the same pattern used in [`src/examples/pixi.ts`](./src/examples/pixi.ts).

## Architecture

Descriptors define nominal identities for components, resources, events, states, and services. Schemas close the world. Systems declare ECS access and service dependencies explicitly. Schedules order execution, define apply/event phases, and carry their runtime requirements. The runtime owns world state, but not the outer loop, and the app/runtime execution boundary is where those requirements are checked.

The important rule is simple: if TypeScript cannot prove something honestly, the public API should not pretend it can. Internals may erase types when needed, but that should not leak through the external surface.

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

## Roadmap

The next meaningful additions are the ones that improve type safety, explicitness, and feature reach without turning the runtime into an engine. If TypeScript cannot prove a behavior honestly, the public API should not pretend it can.

The browser examples, especially the top-down proof of concept, confirmed that the current ECS core is already enough to drive real gameplay loops. They also exposed the next pressure points clearly: query ergonomics, lifecycle-aware sync, and safer ways to carry entity references across frames while still forcing honest revalidation.

The order below is based on how much each addition strengthens the ECS authoring model, not on implementation ease.

### 1. Richer query and filter semantics

The structural part of this is now in place: queries can express required reads and writes, maybe-present component slots through `Game.Query.optional(...)`, and explicit structural matching through `with` and `without`.

The next step here is broadening the filter language without weakening type safety. Optional access already removed some duplicated render-sync queries in the top-down example, but lifecycle-aware filters and later relation-aware filters still belong here as the remaining gap.

Concretely, this roadmap item should include:

- lifecycle-aware filters like `added`, `changed`, `removed`, and `despawned` as typed query/filter semantics, not generic observers
- later relation-aware filters only once relationships exist

The intended semantics should stay explicit:

- `read(Component)` means the entity must match that component and the system only gets read access
- `write(Component)` means the entity must match that component and the system gets explicit write access
- `optional(Component)` does not affect whether the entity matches; it only changes the result shape so the system must branch explicitly before using that component
- `with(Component)` and `without(Component)` change matching only; they do not add selected data slots
- lifecycle filters should describe what changed since an explicit readable boundary, similar in spirit to `updateEvents()`, rather than behaving like hidden reactive magic
- the intended query shape is one explicit selection plus separate matching clauses: structural matching through `with` / `without`, and lifecycle-oriented matching through a dedicated `filters` surface

For optional access specifically, the query result should not pretend that the entity definitely has the component. The slot should stay explicitly uncertain in the result type, whether that ends up as a small result object or another equally explicit representation. The important invariant is that optional access must not silently widen entity proofs.

The remaining work would unlock things like:

```ts
const InteractableQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable),
    npc: Game.Query.optional(Npc),
    item: Game.Query.optional(Item)
  },
  with: [Interactable],
  without: [Hidden]
})
```

Or renderer sync that does not need one query per specialized subtype:

```ts
const RenderQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    sprite: Game.Query.read(SpriteView),
    pickup: Game.Query.optional(Pickup),
    player: Game.Query.optional(Player)
  }
})
```

That is the specific pressure point in the top-down example's render sync loop in [`SyncSceneSystem`](./src/examples/top-down.ts#L697), which currently has to iterate separate player, wall, and collectable queries and then merge the results manually.

This feature should stay scoped to ECS query semantics. It should not try to absorb engine-specific concerns such as camera-visible queries, sprite-layer filters, arbitrary callback predicates, or geometric matching like distance/radius checks. For example, the nearest-pickup selection logic in [`UpdateFocusedCollectableSystem`](./src/examples/top-down.ts#L435) should remain normal system logic even after query/filter semantics improve.

### 2. Change detection and lifecycle signals

Renderer sync, replication, dirty tracking, and reactive gameplay systems all get easier once systems can express added, changed, removed, or despawned data directly. The main goal is not reactive magic; it is a more explicit and type-safe way to say which entities a system should care about right now.

The top-down example currently has to rescan the whole visible ECS world and maintain an `alive` set manually to keep Pixi nodes in sync in [`SyncSceneSystem`](./src/examples/top-down.ts#L697). Typed lifecycle signals would make that integration smaller, clearer, and harder to get wrong while still keeping rendering itself outside ECS.

The intended semantics here should be precise:

- `added(Component)` means the component became present since the last lifecycle-readable boundary, including spawn-with-component and insert
- `changed(Component)` should be write-based, not deep-equality-based: if a system performed an explicit write, the component changed
- `removed(Component)` and `despawned()` likely need a dedicated lifecycle-facing read shape rather than pretending the entity still matches a normal current-world query
- these signals should be explicit schedule-visible data, not always-on background observers

It would unlock things like:

```ts
const SpawnSpritesSystem = Game.System.define(
  "SpawnSprites",
  {
    queries: {
      addedRenderables: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          renderable: Game.Query.read(Renderable)
        },
        with: [Renderable],
        filters: [Game.Query.added(Renderable)]
      })
    }
  },
  ({ queries }) => Fx.sync(() => {
    for (const entity of queries.addedRenderables.each()) {
      // Create host-owned nodes only for newly visible entities.
    }
  })
)

const SyncMovedSpritesSystem = Game.System.define(
  "SyncMovedSprites",
  {
    queries: {
      moved: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          renderable: Game.Query.read(Renderable)
        },
        with: [Renderable],
        filters: [Game.Query.changed(Position)]
      })
    }
  },
  ({ queries }) => Fx.sync(() => {
    for (const entity of queries.moved.each()) {
      // Update only host objects whose transform actually changed.
    }
  })
)
```

### 3. Entity relationships and hierarchy

This remains the main structural gap once query and lifecycle ergonomics improve. It would unlock scene graphs, ownership, attachments, card zones, equipment, UI trees, and simulation-style graphs without pulling renderer trees or engine concerns into the ECS itself.

The important constraint is that relations should stay descriptor-driven, explicit, and fully typed. The ECS may model that one entity follows or owns another; Pixi or another host library would still own the actual render tree.

It would unlock things like:

```ts
const EquippedBy = Descriptor.defineRelation<Entity.EntityId<typeof schema>>("EquippedBy")
const ChildOf = Descriptor.defineRelation<Entity.EntityId<typeof schema>>("ChildOf")

commands.spawn(
  Game.Command.spawnWith(
    [Sword, {}],
    [EquippedBy, playerId],
    [ChildOf, playerId]
  )
)
```

Or more explicit gameplay ownership:

```ts
const PromptFor = Descriptor.defineRelation<Entity.EntityId<typeof schema>>("PromptFor")

commands.spawn(
  Game.Command.spawnWith(
    [InteractionPrompt, { text: "Press E" }],
    [PromptFor, focusedEntity]
  )
)
```

### 4. Safer long-lived entity references

Current `EntityId` values are intentionally honest: they prove schema identity, not liveness or component shape. That part is correct. The missing piece is a clearer, safer story for references that live in resources, events, or components across multiple frames.

The top-down example stores the currently focused collectable as a numeric id inside a resource because there is no more expressive durable reference shape yet. Other examples widen and narrow ids manually when they need to carry them through events or example-owned components. A future addition here should improve safety and intent without pretending that dynamic world membership is statically knowable.

That likely means a typed reference or handle API that remains schema-bound and still forces checked lookup before a system can rely on the target's current component set.

It would unlock things like:

```ts
const FocusedTarget = Descriptor.defineResource<{
  current: Game.Entity.handle(Pickup) | null
}>()("FocusedTarget")

const ResolveFocusedTargetSystem = Game.System.define(
  "ResolveFocusedTarget",
  {
    resources: {
      focused: Game.System.readResource(FocusedTarget)
    }
  },
  ({ resources, lookup }) => Fx.sync(() => {
    const current = resources.focused.get().current
    if (!current) {
      return
    }

    const result = lookup.get(current.entityId, Game.Query.define({
      selection: {
        pickup: Game.Query.read(Pickup),
        position: Game.Query.read(Position)
      }
    }))

    if (!result.ok) {
      // The target disappeared or no longer satisfies the expected shape.
    }
  })
)
```

The exact API shape is still open, but the invariant should stay fixed: long-lived references can become stale, and the type system should make that revalidation boundary explicit.

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

Built-in camera systems, renderer scene graphs, asset pipelines, or sprite management layers are also out of scope. The ECS should model simulation state and explicit orchestration; host libraries should continue to own rendering, camera transforms, and asset concerns.

Full Effect-style local `provide` or layer graphs are also out of scope because dependency closure currently belongs at the runtime and app boundary, not at arbitrary local execution sites.

Full Bevy plugin parity, full observer parity, asset pipeline abstractions, and advanced parallel scheduler work remain useful future references, but they are not current priorities.

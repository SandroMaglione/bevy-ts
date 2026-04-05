# Build The Pixi Example

This walkthrough rebuilds [`examples/pixi/main.ts`](../examples/pixi/main.ts) from zero to a complete app.

The goal is to show the normal `bevy-ts` flow in order:

1. define descriptors
2. build one closed schema and bind `Game`
3. define queries
4. define systems with explicit access
5. define schedules with explicit boundaries
6. create the runtime and host bridge
7. run the app from your outer loop

## 1. Define the world shape

Start by defining the ECS data you want to store. Components hold per-entity data. Resources hold singleton world values. Services expose host-owned capabilities, such as a renderer or clock.

```ts
import { App, Descriptor, Fx, Schema } from "../src/index.ts"
import { Application, Container, Sprite, Texture } from "pixi.js"

const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.Component<{ x: number; y: number }>()("Velocity")
const Renderable = Descriptor.Component<{ size: number }>()("Renderable")
const Tint = Descriptor.Component<{ value: number }>()("Tint")

const DeltaTime = Descriptor.Resource<number>()("DeltaTime")
const Viewport = Descriptor.Resource<{ width: number; height: number }>()("Viewport")

const PixiHost = Descriptor.Service<{
  readonly application: Application
  readonly scene: Container
  readonly sprites: Map<number, Sprite>
  readonly clock: { deltaSeconds: number }
}>()("PixiHost")
```

This split is the first important API rule:

- ECS simulation state belongs in components and resources.
- Renderer objects stay outside ECS and are exposed through a typed service.
- Long-lived renderer references are host data, not proof that the ECS entity is still alive.

## 2. Build one closed schema and bind `Game`

Once the descriptors exist, assemble the schema and bind a single authoring surface.

```ts
const pixiSchema = Schema.fragment({
  components: { Position, Velocity, Renderable, Tint },
  resources: { DeltaTime, Viewport }
})

const Game = Schema.bind(pixiSchema)
```

`Schema.bind(...)` is what gives you the runtime-connected API family:

- `Game.Query`
- `Game.System`
- `Game.Command`
- `Game.Schedule`
- `Game.Runtime`

Everything defined after this point is checked against the same closed world.

## 3. Define queries for the exact reads you need

Queries are explicit. You declare exactly which components are read or written, then optionally add lifecycle filters.

```ts
const AddedRenderableQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable),
    tint: Game.Query.read(Tint)
  },
  filters: [Game.Query.added(Renderable)]
})

const ChangedPositionQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position)
  },
  filters: [Game.Query.changed(Position)]
})
```

These two queries drive rendering:

- `added(Renderable)` finds entities that need a Pixi sprite created.
- `changed(Position)` finds entities whose rendered transform needs syncing.

That only works after an explicit lifecycle boundary, which matters later when the schedule is assembled.

## 4. Define systems with explicit declared access

A system declares its entire dependency surface up front. The callback only receives what the spec asked for.

Start with setup. This system reads the Pixi screen size through the service and queues entity spawns.

```ts
const SetupSceneSystem = Game.System(
  "SetupSceneSystem",
  {
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ commands, services }) =>
    Fx.sync(() => {
      const { width, height } = services.pixi.application.screen

      commands.spawn(
        Game.Command.spawnWith(
          [Position, { x: width * 0.5, y: height * 0.5 }],
          [Velocity, { x: 80, y: 60 }],
          [Renderable, { size: 24 }],
          [Tint, { value: 0xff6b35 }]
        )
      )
    })
)
```

Now capture frame input from the host into ECS resources.

```ts
const CaptureFrameInputSystem = Game.System(
  "CaptureFrameInputSystem",
  {
    resources: {
      deltaTime: Game.System.writeResource(DeltaTime),
      viewport: Game.System.writeResource(Viewport)
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      resources.deltaTime.set(services.pixi.clock.deltaSeconds)
      resources.viewport.set({
        width: services.pixi.application.screen.width,
        height: services.pixi.application.screen.height
      })
    })
)
```

Then define pure simulation systems. They only touch ECS data, so they do not need direct renderer access.

```ts
const IntegrateMotionSystem = Game.System(
  "IntegrateMotionSystem",
  {
    queries: {
      moving: Game.Query({
        selection: {
          position: Game.Query.write(Position),
          velocity: Game.Query.read(Velocity)
        }
      })
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const dt = resources.deltaTime.get()

      for (const match of queries.moving.each()) {
        const position = match.data.position.get()
        const velocity = match.data.velocity.get()

        match.data.position.set({
          x: position.x + velocity.x * dt,
          y: position.y + velocity.y * dt
        })
      }
    })
)
```

The full example adds a `BounceWithinViewportSystem` as the next simulation step. It reads `Viewport`, writes `Position` and `Velocity`, and clamps or flips movement at the edges.

## 5. Bridge ECS changes back into Pixi

Rendering systems stay explicit too. One system creates Pixi sprites when ECS renderables appear. Another system syncs transforms when positions change.

```ts
const CreatePixiSpritesSystem = Game.System(
  "CreatePixiSpritesSystem",
  {
    queries: {
      renderables: AddedRenderableQuery
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.renderables.each()) {
        const entityId = match.entity.id.value
        let sprite = services.pixi.sprites.get(entityId)

        if (!sprite) {
          sprite = new Sprite(Texture.WHITE)
          sprite.anchor.set(0.5)
          services.pixi.scene.addChild(sprite)
          services.pixi.sprites.set(entityId, sprite)
        }

        const position = match.data.position.get()
        const renderable = match.data.renderable.get()
        const tint = match.data.tint.get()

        sprite.width = renderable.size
        sprite.height = renderable.size
        sprite.tint = tint.value
        sprite.position.set(position.x, position.y)
      }
    })
)
```

The important part is not the constructor detail. The important part is the boundary:

- ECS owns the intent to render.
- Pixi owns the actual renderer object.
- The bridge is the `PixiHost` service plus explicit lifecycle and change queries.

## 6. Make schedule boundaries visible

Schedules define when deferred writes and lifecycle signals become visible.

```ts
const setupSchedule = Game.Schedule(
  SetupSceneSystem,
  Game.Schedule.applyDeferred(),
  Game.Schedule.updateLifecycle(),
  CreatePixiSpritesSystem
)

const updateSchedule = Game.Schedule(
  CaptureFrameInputSystem,
  IntegrateMotionSystem,
  BounceWithinViewportSystem,
  Game.Schedule.updateLifecycle(),
  SyncPixiTransformsSystem
)
```

This is why the walkthrough builds in this order:

- `SetupSceneSystem` queues entity spawns.
- `applyDeferred()` commits those queued commands.
- `updateLifecycle()` makes `added(...)` and `changed(...)` filters see the new world state.
- only then can `CreatePixiSpritesSystem` react to `added(Renderable)`.

The same rule applies every frame. Schedule markers are explicit runtime semantics, not hidden engine magic.

## 7. Build the runtime and start the app

Create the host objects first, then inject them into the runtime through typed services and resources.

```ts
const runtime = Game.Runtime.make({
  services: Game.Runtime.services(Game.Runtime.service(PixiHost, host)),
  resources: {
    DeltaTime: host.clock.deltaSeconds,
    Viewport: {
      width: application.screen.width,
      height: application.screen.height
    }
  }
})

const app = App.makeApp(runtime)
app.bootstrap(setupSchedule)
app.update(updateSchedule)
```

Finally, keep the outer loop outside ECS and call `app.update(...)` yourself.

```ts
const tick = (ticker: { readonly deltaMS: number }) => {
  host.clock.deltaSeconds = ticker.deltaMS / 1000
  app.update(updateSchedule)
}

application.ticker.add(tick)
```

That is the core `bevy-ts` shape:

- host loop outside the ECS
- runtime values injected explicitly
- systems with declared access only
- schedule markers controlling visibility and timing

## Read the full source

The complete version, including sprite creation and viewport bounce logic, is in [`examples/pixi/main.ts`](../examples/pixi/main.ts).

From here, the API reference pages are the next step if you want exact definitions for the surfaces used above:

- `App`
- `Descriptor`
- `Schema`
- `Query`
- `System`
- `Schedule`
- `Runtime`

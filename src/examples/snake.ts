/**
 * Minimal `snake`-style example.
 *
 * This example exercises the feature set missing from the initial scaffold:
 * - ordered systems
 * - required queries
 * - typed event polling
 * - validated entity lookup by id
 * - deferred despawn/spawn in response to gameplay events
 */
import { Application, Container, Graphics } from "pixi.js"

import { App, Descriptor, Entity, Fx, Label, Schema } from "../index.ts"
import type { BrowserExampleHandle } from "./pixi.ts"

const Root = Schema.defineRoot("Snake")

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Snake/Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Snake/Velocity")
const SnakeHead = Descriptor.defineComponent<{}>()("Snake/Head")
const SnakeBody = Descriptor.defineComponent<{ parent: Entity.Handle<typeof Root>; isTail: boolean }>()("Snake/Body")
const Food = Descriptor.defineComponent<{}>()("Snake/Food")
const FollowTarget = Descriptor.defineComponent<{ x: number; y: number }>()("Snake/FollowTarget")

const FoodEaten = Descriptor.defineEvent<{ entity: Entity.Handle<typeof Root, typeof Food> }>()("Snake/FoodEaten")
const DirectionInput = Descriptor.defineService<{
  readonly consume: () => { x: number; y: number } | null
}>()("Snake/DirectionInput")

const PixiHost = Descriptor.defineService<{
  readonly scene: Container
  readonly nodes: Map<number, Graphics>
  readonly tileSize: number
}>()("Snake/PixiHost")

const SNAKE_BOARD_WIDTH = 12
const SNAKE_BOARD_HEIGHT = 12

const schema = Schema.build(
  Schema.fragment({
    components: {
      Position,
      Velocity,
      SnakeHead,
      SnakeBody,
      Food,
      FollowTarget
    },
    events: {
      FoodEaten
    }
  })
)
const Game = Schema.bind(schema, Root)

const MovementSetLabel = Label.defineSystemSetLabel("Snake/Movement")
const GrowthSetLabel = Label.defineSystemSetLabel("Snake/Growth")

const HeadQuery = Game.Query.define({
  selection: {
    head: Game.Query.read(SnakeHead),
    position: Game.Query.write(Position),
    velocity: Game.Query.read(Velocity)
  }
})

const FoodQuery = Game.Query.define({
  selection: {
    food: Game.Query.read(Food),
    position: Game.Query.read(Position)
  }
})

const BodyQuery = Game.Query.define({
  selection: {
    body: Game.Query.write(SnakeBody),
    position: Game.Query.write(Position),
    followTarget: Game.Query.write(FollowTarget)
  }
})

const SetupSystem = Game.System.define(
  "Snake/Setup",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      const headId = commands.spawn(
        Game.Command.spawnWith(
          [Position, { x: 5, y: 5 }],
          [Velocity, { x: 1, y: 0 }],
          [SnakeHead, {}]
        )
      )

      commands.spawn(
        Game.Command.spawnWith(
          [Position, { x: 4, y: 5 }],
          [SnakeBody, { parent: headId, isTail: true }],
          [FollowTarget, { x: 5, y: 5 }]
        )
      )

      commands.spawn(
        Game.Command.spawnWith(
          [Position, { x: 8, y: 5 }],
          [Food, {}]
        )
      )
    })
)

const MovementSystem = Game.System.define(
  "Snake/Movement",
  {
    inSets: [MovementSetLabel],
    queries: {
      head: HeadQuery
    }
  },
  ({ queries }) =>
    Fx.sync(() => {
      const head = queries.head.single()
      if (!head.ok) {
        return
      }

      const position = head.value.data.position.get()
      const velocity = head.value.data.velocity.get()
      head.value.data.position.set({
        x: position.x + velocity.x,
        y: position.y + velocity.y
      })
    })
)

const BrowserInputSystem = Game.System.define(
  "Snake/BrowserInput",
  {
    inSets: [MovementSetLabel],
    queries: {
      head: Game.Query.define({
        selection: {
          head: Game.Query.read(SnakeHead),
          velocity: Game.Query.write(Velocity)
        }
      })
    },
    services: {
      input: Game.System.service(DirectionInput)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const next = services.input.consume()
      if (!next) {
        return
      }

      const head = queries.head.single()
      if (!head.ok) {
        return
      }

      const current = head.value.data.velocity.get()
      const reversing = current.x === next.x * -1 && current.y === next.y * -1
      if (reversing) {
        return
      }

      head.value.data.velocity.set(next)
    })
)

const BrowserWrapSystem = Game.System.define(
  "Snake/BrowserWrap",
  {
    inSets: [MovementSetLabel],
    queries: {
      head: HeadQuery
    }
  },
  ({ queries }) =>
    Fx.sync(() => {
      const head = queries.head.single()
      if (!head.ok) {
        return
      }

      const position = head.value.data.position.get()
      head.value.data.position.set({
        x: (position.x + SNAKE_BOARD_WIDTH) % SNAKE_BOARD_WIDTH,
        y: (position.y + SNAKE_BOARD_HEIGHT) % SNAKE_BOARD_HEIGHT
      })
    })
)

const CollisionSystem = Game.System.define(
  "Snake/Collision",
  {
    inSets: [MovementSetLabel],
    queries: {
      head: HeadQuery,
      food: FoodQuery
    },
    events: {
      foodEaten: Game.System.writeEvent(FoodEaten)
    }
  },
  ({ queries, events }) =>
    Fx.sync(() => {
      const head = queries.head.single()
      if (!head.ok) {
        return
      }
      const headPosition = head.value.data.position.get()
      for (const match of queries.food.each()) {
        const foodPosition = match.data.position.get()
        if (foodPosition.x === headPosition.x && foodPosition.y === headPosition.y) {
          events.foodEaten.emit({ entity: Game.Entity.handleAs(Food, match.entity.id) })
        }
      }
    })
)

const GrowSystem = Game.System.define(
  "Snake/Grow",
  {
    inSets: [GrowthSetLabel],
    queries: {
      head: HeadQuery,
      body: BodyQuery
    },
    events: {
      foodEaten: Game.System.readEvent(FoodEaten)
    }
  },
  ({ queries, events, commands, lookup }) =>
    Fx.sync(() => {
      const eaten = events.foodEaten.all()
      if (eaten.length === 0) {
        return
      }

      const head = queries.head.single()
      if (!head.ok) {
        return
      }

      const tail = queries.body.each().find((match) => match.data.body.get().isTail)
      if (tail) {
        tail.data.body.update((body) => ({
          ...body,
          isTail: false
        }))
      }

      for (const event of eaten) {
        const foodEntity = lookup.getHandle(event.entity, FoodQuery)
        if (!foodEntity.ok) {
          continue
        }
        commands.despawn(foodEntity.value.entity.id)
      }

      const parent = tail?.entity.id ?? head.value.entity.id
      const parentLookup = lookup.get(parent, Game.Query.define({
        selection: {
          position: Game.Query.read(Position)
        }
      }))
      if (!parentLookup.ok) {
        return
      }
      const parentPosition = parentLookup.value.data.position.get()

      commands.spawn(
        Game.Command.spawnWith(
          [Position, { x: parentPosition.x - 1, y: parentPosition.y }],
          [SnakeBody, { parent: Game.Entity.handle(parent), isTail: true }],
          [FollowTarget, { x: parentPosition.x, y: parentPosition.y }]
        )
      )

      commands.spawn(
        Game.Command.spawnWith(
          [Position, {
            x: (head.value.data.position.get().x + 3) % SNAKE_BOARD_WIDTH,
            y: head.value.data.position.get().y % SNAKE_BOARD_HEIGHT
          }],
          [Food, {}]
        )
      )
    })
)

const FollowSystem = Game.System.define(
  "Snake/Follow",
  {
    inSets: [GrowthSetLabel],
    queries: {
      body: BodyQuery
    }
  },
  ({ queries, lookup }) =>
    Fx.sync(() => {
      for (const match of queries.body.each()) {
        const body = match.data.body.get()
        const parentLookup = lookup.getHandle(
          body.parent,
          Game.Query.define({
            selection: {
              position: Game.Query.read(Position)
            }
          })
        )
        if (!parentLookup.ok) {
          continue
        }
        const parentPosition = parentLookup.value.data.position.get()

        match.data.followTarget.set(parentPosition)
        match.data.position.set(parentPosition)
      }
    })
)

const makeSnakeNode = (kind: "head" | "body" | "food", tileSize: number): Graphics => {
  const node = new Graphics()
  if (kind === "food") {
    node.circle(tileSize * 0.5, tileSize * 0.5, tileSize * 0.28)
    node.fill(0xff7a59)
    node.stroke({
      color: 0xffcfbf,
      width: 2
    })
    return node
  }

  const inset = kind === "head" ? 3 : 5
  const size = tileSize - inset * 2
  node.roundRect(0, 0, size, size, kind === "head" ? 9 : 6)
  node.fill(kind === "head" ? 0xf7c948 : 0x4ecdc4)
  node.stroke({
    color: kind === "head" ? 0xffefb8 : 0xbef6ef,
    width: 2
  })
  return node
}

const SyncSnakeSceneSystem = Game.System.define(
  "Snake/SyncScene",
  {
    queries: {
      head: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          head: Game.Query.read(SnakeHead)
        }
      }),
      body: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          body: Game.Query.read(SnakeBody)
        }
      }),
      food: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          food: Game.Query.read(Food)
        }
      })
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const seen = new Set<number>()

      const syncNode = (entityId: number, x: number, y: number, kind: "head" | "body" | "food") => {
        let node = services.pixi.nodes.get(entityId)
        if (!node) {
          node = makeSnakeNode(kind, services.pixi.tileSize)
          services.pixi.scene.addChild(node)
          services.pixi.nodes.set(entityId, node)
        }

        seen.add(entityId)
        if (kind === "food") {
          node.position.set(x * services.pixi.tileSize, y * services.pixi.tileSize)
        } else {
          const inset = kind === "head" ? 3 : 5
          node.position.set(
            x * services.pixi.tileSize + inset,
            y * services.pixi.tileSize + inset
          )
        }
      }

      for (const match of queries.head.each()) {
        const position = match.data.position.get()
        syncNode(match.entity.id.value, position.x, position.y, "head")
      }

      for (const match of queries.body.each()) {
        const position = match.data.position.get()
        syncNode(match.entity.id.value, position.x, position.y, "body")
      }

      for (const match of queries.food.each()) {
        const position = match.data.position.get()
        syncNode(match.entity.id.value, position.x, position.y, "food")
      }

      for (const [entityId, node] of services.pixi.nodes) {
        if (seen.has(entityId)) {
          continue
        }
        node.destroy()
        services.pixi.nodes.delete(entityId)
      }
    })
)

const setupSchedule = Game.Schedule.define({
  systems: [SetupSystem]
})

const browserSetupSchedule = Game.Schedule.define({
  systems: [SetupSystem, SyncSnakeSceneSystem],
  steps: [SetupSystem, Game.Schedule.applyDeferred(), SyncSnakeSceneSystem]
})

const updateSchedule = Game.Schedule.define({
  systems: [MovementSystem, CollisionSystem, GrowSystem, FollowSystem],
  sets: [
    Game.Schedule.configureSet({
      label: MovementSetLabel,
      chain: true
    }),
    Game.Schedule.configureSet({
      label: GrowthSetLabel,
      after: [MovementSetLabel],
      chain: true
    })
  ],
  steps: [
    MovementSystem,
    CollisionSystem,
    Game.Schedule.updateEvents(),
    GrowSystem,
    Game.Schedule.applyDeferred(),
    FollowSystem
  ]
})

const browserUpdateSchedule = Game.Schedule.define({
  systems: [BrowserInputSystem, MovementSystem, BrowserWrapSystem, CollisionSystem, GrowSystem, FollowSystem, SyncSnakeSceneSystem],
  sets: [
    Game.Schedule.configureSet({
      label: MovementSetLabel,
      chain: true
    }),
    Game.Schedule.configureSet({
      label: GrowthSetLabel,
      after: [MovementSetLabel],
      chain: true
    })
  ],
  steps: [
    BrowserInputSystem,
    MovementSystem,
    BrowserWrapSystem,
    CollisionSystem,
    Game.Schedule.updateEvents(),
    GrowSystem,
    Game.Schedule.applyDeferred(),
    FollowSystem,
    SyncSnakeSceneSystem
  ]
})

export const createSnakeExample = () => {
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services()
  })

  const app = App.makeApp(runtime)
  app.bootstrap(setupSchedule)

  return {
    runtime,
    app,
    update() {
      runtime.runSchedule(updateSchedule)
    }
  }
}

const renderBoard = (cellsWide: number, cellsHigh: number, tileSize: number): Graphics => {
  const width = cellsWide * tileSize
  const height = cellsHigh * tileSize
  const board = new Graphics()
  board.zIndex = 0

  board.roundRect(0, 0, width, height, 18)
  board.fill(0x101418)

  for (let x = 0; x <= width; x += tileSize) {
    board.moveTo(x, 0)
    board.lineTo(x, height)
  }
  for (let y = 0; y <= height; y += tileSize) {
    board.moveTo(0, y)
    board.lineTo(width, y)
  }
  board.stroke({
    color: 0x24303b,
    width: 1
  })

  return board
}

export const startSnakeExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const tileSize = 32
  const cellsWide = SNAKE_BOARD_WIDTH
  const cellsHigh = SNAKE_BOARD_HEIGHT

  const application = new Application()
  await application.init({
    antialias: false,
    background: "#0c1015",
    width: cellsWide * tileSize,
    height: cellsHigh * tileSize
  })

  const wrapper = document.createElement("section")
  wrapper.className = "pixi-example-shell pixi-example-shell-grid"
  wrapper.appendChild(application.canvas)
  mount.replaceChildren(wrapper)

  const scene = new Container()
  scene.zIndex = 10
  application.stage.sortableChildren = true
  application.stage.addChild(renderBoard(cellsWide, cellsHigh, tileSize))
  application.stage.addChild(scene)

  let pendingVelocity: { x: number; y: number } | null = null
  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowUp":
      case "w":
      case "W":
        pendingVelocity = { x: 0, y: -1 }
        break
      case "ArrowDown":
      case "s":
      case "S":
        pendingVelocity = { x: 0, y: 1 }
        break
      case "ArrowLeft":
      case "a":
      case "A":
        pendingVelocity = { x: -1, y: 0 }
        break
      case "ArrowRight":
      case "d":
      case "D":
        pendingVelocity = { x: 1, y: 0 }
        break
      default:
        return
    }

    event.preventDefault()
  }
  window.addEventListener("keydown", onKeyDown)

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(DirectionInput, {
        consume() {
          const next = pendingVelocity
          pendingVelocity = null
          return next
        }
      }),
      Game.Runtime.service(PixiHost, {
        scene,
        nodes: new Map<number, Graphics>(),
        tileSize
      })
    )
  })

  runtime.initialize(browserSetupSchedule)

  const intervalId = window.setInterval(() => {
    runtime.runSchedule(browserUpdateSchedule)
  }, 240)

  return {
    async destroy() {
      window.clearInterval(intervalId)
      window.removeEventListener("keydown", onKeyDown)
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

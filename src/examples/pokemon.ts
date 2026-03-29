/**
 * Minimal `pokemon`-style example with interpolated tile movement.
 *
 * ECS owns gameplay state:
 * - tile coordinates
 * - movement intent
 * - collision decisions
 * - interpolation progress
 *
 * Pixi owns rendering objects and the outer frame loop.
 */
import { Application, Container, Graphics } from "pixi.js"

import { App, Descriptor, Fx, Label, Schema } from "../index.ts"
import type { BrowserExampleHandle } from "./pixi.ts"

const GRID_COLS = 10
const GRID_ROWS = 10
const TILE_SIZE = 32
const MOVE_DURATION_SECONDS = 0.18

type Direction = "up" | "down" | "left" | "right"
type TilePosition = { col: number; row: number }

const Position = Descriptor.defineComponent<TilePosition>()("Pokemon/Position")
const Movement = Descriptor.defineComponent<{
  direction: Direction | null
  from: TilePosition
  to: TilePosition
  progress: number
  isMoving: boolean
}>()("Pokemon/Movement")
const Player = Descriptor.defineComponent<{}>()("Pokemon/Player")
const Solid = Descriptor.defineComponent<{}>()("Pokemon/Solid")

const GridSize = Descriptor.defineResource<{ cols: number; rows: number; tileSize: number }>()("GridSize")
const DeltaTime = Descriptor.defineResource<number>()("DeltaTime")
const InputManager = Descriptor.defineService<{
  readonly direction: () => Direction | null
}>()("Pokemon/InputManager")
const PixiHost = Descriptor.defineService<{
  readonly application: Application
  readonly scene: Container
  readonly nodes: Map<number, Graphics>
  readonly clock: {
    deltaSeconds: number
  }
}>()("Pokemon/PixiHost")

const schema = Schema.build(
  Schema.fragment({
    components: {
      Position,
      Movement,
      Player,
      Solid
    },
    resources: {
      GridSize,
      DeltaTime
    }
  })
)
const Game = Schema.bind(schema)

const InputPipelineSetLabel = Label.defineSystemSetLabel("Pokemon/InputPipeline")
const ResolveMovementSetLabel = Label.defineSystemSetLabel("Pokemon/ResolveMovement")

const PlayerQuery = Game.Query.define({
  selection: {
    position: Game.Query.write(Position),
    movement: Game.Query.write(Movement),
    player: Game.Query.read(Player)
  }
})

const makePokemonNode = (kind: "player" | "solid", tileSize: number): Graphics => {
  const node = new Graphics()
  if (kind === "player") {
    node.roundRect(0, 0, tileSize - 10, tileSize - 10, 10)
    node.fill(0xff8f3f)
    node.stroke({
      color: 0xffd2a8,
      width: 2
    })
    return node
  }

  node.roundRect(0, 0, tileSize - 8, tileSize - 8, 6)
  node.fill(0x2fb7c8)
  node.stroke({
    color: 0xa7f1ff,
    width: 2
  })
  return node
}

const normalizeDirection = (key: string): Direction | null => {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up"
    case "ArrowDown":
    case "s":
    case "S":
      return "down"
    case "ArrowLeft":
    case "a":
    case "A":
      return "left"
    case "ArrowRight":
    case "d":
    case "D":
      return "right"
    default:
      return null
  }
}

const nextTileFromDirection = (position: TilePosition, direction: Direction): TilePosition =>
  direction === "up" ? { col: position.col, row: position.row - 1 }
  : direction === "down" ? { col: position.col, row: position.row + 1 }
  : direction === "left" ? { col: position.col - 1, row: position.row }
  : { col: position.col + 1, row: position.row }

const SetupSystem = Game.System.define(
  "Pokemon/Setup",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      commands.spawn(
        Game.Command.spawnWith(
          [Position, { col: 3, row: 3 }],
          [Movement, {
            direction: null,
            from: { col: 3, row: 3 },
            to: { col: 3, row: 3 },
            progress: 1,
            isMoving: false
          }],
          [Player, {}]
        )
      )

      const solids = [
        { col: 5, row: 5 },
        { col: 2, row: 6 },
        { col: 7, row: 3 },
        { col: 6, row: 7 }
      ] as const

      for (const solid of solids) {
        commands.spawn(
          Game.Command.spawnWith(
            [Position, solid],
            [Solid, {}]
          )
        )
      }
    })
)

const CaptureFrameInputSystem = Game.System.define(
  "Pokemon/CaptureFrameInput",
  {
    resources: {
      deltaTime: Game.System.writeResource(DeltaTime)
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      resources.deltaTime.set(services.pixi.clock.deltaSeconds)
    })
)

const InputSystem = Game.System.define(
  "Pokemon/Input",
  {
    inSets: [InputPipelineSetLabel],
    queries: {
      player: PlayerQuery
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const direction = services.input.direction()
      if (direction === null) {
        return
      }

      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      player.value.data.movement.update((movement) =>
        movement.isMoving
          ? movement
          : {
              ...movement,
              direction
            }
      )
    })
)

const PlanMovementSystem = Game.System.define(
  "Pokemon/PlanMovement",
  {
    inSets: [InputPipelineSetLabel],
    queries: {
      player: PlayerQuery
    }
  },
  ({ queries }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const match = player.value
      const position = match.data.position.get()
      const movement = match.data.movement.get()
      if (movement.isMoving || movement.direction === null) {
        return
      }

      match.data.movement.set({
        ...movement,
        from: position,
        to: nextTileFromDirection(position, movement.direction),
        progress: 0,
        isMoving: true
      })
    })
)

const CollisionSystem = Game.System.define(
  "Pokemon/Collision",
  {
    inSets: [ResolveMovementSetLabel],
    queries: {
      player: PlayerQuery,
      solids: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          solid: Game.Query.read(Solid)
        }
      })
    },
    resources: {
      grid: Game.System.readResource(GridSize)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const { cols, rows } = resources.grid.get()
      const occupied = new Set(
        queries.solids.each().map((match) => {
          const position = match.data.position.get()
          return `${position.col},${position.row}`
        })
      )

      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const match = player.value
      const movement = match.data.movement.get()
      if (!movement.isMoving) {
        return
      }

      const outOfBounds =
        movement.to.col < 0 ||
        movement.to.row < 0 ||
        movement.to.col >= cols ||
        movement.to.row >= rows
      const occupiedTarget = occupied.has(`${movement.to.col},${movement.to.row}`)
      if (outOfBounds || occupiedTarget) {
        match.data.movement.set({
          ...movement,
          direction: null,
          to: movement.from,
          progress: 1,
          isMoving: false
        })
      }
    })
)

const AdvanceMovementSystem = Game.System.define(
  "Pokemon/AdvanceMovement",
  {
    inSets: [ResolveMovementSetLabel],
    queries: {
      player: PlayerQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const match = player.value
      const movement = match.data.movement.get()
      if (!movement.isMoving) {
        return
      }

      const nextProgress = Math.min(movement.progress + resources.deltaTime.get() / MOVE_DURATION_SECONDS, 1)

      if (nextProgress >= 1) {
        match.data.position.set(movement.to)
        match.data.movement.set({
          direction: null,
          from: movement.to,
          to: movement.to,
          progress: 1,
          isMoving: false
        })
        return
      }

      match.data.movement.set({
        ...movement,
        progress: nextProgress
      })
    })
)

const SyncPixiSceneSystem = Game.System.define(
  "Pokemon/SyncPixiScene",
  {
    queries: {
      player: PlayerQuery,
      solids: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          solid: Game.Query.read(Solid)
        }
      })
    },
    resources: {
      grid: Game.System.readResource(GridSize)
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      const { tileSize } = resources.grid.get()
      const seen = new Set<number>()
      const playerMatches = queries.player.each()
      const solidMatches = queries.solids.each()

      const placeNode = (entityId: number, kind: "player" | "solid", x: number, y: number) => {
        let node = services.pixi.nodes.get(entityId)
        if (!node) {
          node = makePokemonNode(kind, tileSize)
          services.pixi.scene.addChild(node)
          services.pixi.nodes.set(entityId, node)
        }

        seen.add(entityId)
        const inset = kind === "player" ? 5 : 4
        node.position.set(x + inset, y + inset)
      }

      for (const match of playerMatches) {
        const position = match.data.position.get()
        const movement = match.data.movement.get()
        const fromX = movement.from.col * tileSize
        const fromY = movement.from.row * tileSize
        const toX = movement.to.col * tileSize
        const toY = movement.to.row * tileSize
        const renderX = fromX + (toX - fromX) * movement.progress
        const renderY = fromY + (toY - fromY) * movement.progress
        placeNode(match.entity.id.value, "player", renderX, renderY)
      }

      for (const match of solidMatches) {
        const position = match.data.position.get()
        placeNode(
          match.entity.id.value,
          "solid",
          position.col * tileSize,
          position.row * tileSize
        )
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
  systems: [SetupSystem, SyncPixiSceneSystem],
  steps: [SetupSystem, Game.Schedule.applyDeferred(), SyncPixiSceneSystem]
})

const updateSchedule = Game.Schedule.define({
  systems: [InputSystem, PlanMovementSystem, CollisionSystem, AdvanceMovementSystem],
  sets: [
    Game.Schedule.configureSet({
      label: InputPipelineSetLabel,
      chain: true
    }),
    Game.Schedule.configureSet({
      label: ResolveMovementSetLabel,
      after: [InputPipelineSetLabel],
      chain: true
    })
  ] as const
})

const browserUpdateSchedule = Game.Schedule.define({
  systems: [CaptureFrameInputSystem, InputSystem, PlanMovementSystem, CollisionSystem, AdvanceMovementSystem, SyncPixiSceneSystem],
  sets: [
    Game.Schedule.configureSet({
      label: InputPipelineSetLabel,
      chain: true
    }),
    Game.Schedule.configureSet({
      label: ResolveMovementSetLabel,
      after: [InputPipelineSetLabel],
      chain: true
    })
  ] as const,
  steps: [
    CaptureFrameInputSystem,
    InputSystem,
    PlanMovementSystem,
    CollisionSystem,
    AdvanceMovementSystem,
    SyncPixiSceneSystem
  ]
})

export const createPokemonExample = (input: {
  readonly direction: () => Direction | null
}) => {
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(Game.Runtime.service(InputManager, input)),
    resources: {
      GridSize: {
        cols: GRID_COLS,
        rows: GRID_ROWS,
        tileSize: TILE_SIZE
      },
      DeltaTime: 1 / 60
    }
  })

  const app = App.makeApp(runtime)
  app.bootstrap(setupSchedule)

  return {
    runtime,
    app,
    update() {
      app.update(updateSchedule)
    }
  }
}

const renderGrid = (cols: number, rows: number, tileSize: number): Graphics => {
  const width = cols * tileSize
  const height = rows * tileSize
  const grid = new Graphics()
  grid.zIndex = 0

  grid.roundRect(0, 0, width, height, 18)
  grid.fill(0x101418)

  for (let x = 0; x <= width; x += tileSize) {
    grid.moveTo(x, 0)
    grid.lineTo(x, height)
  }
  for (let y = 0; y <= height; y += tileSize) {
    grid.moveTo(0, y)
    grid.lineTo(width, y)
  }
  grid.stroke({
    color: 0x24303b,
    width: 1
  })

  return grid
}

export const startPokemonExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const application = new Application()
  await application.init({
    antialias: false,
    background: "#0c1015",
    width: GRID_COLS * TILE_SIZE,
    height: GRID_ROWS * TILE_SIZE
  })

  const wrapper = document.createElement("section")
  wrapper.className = "pixi-example-shell pixi-example-shell-grid"
  wrapper.appendChild(application.canvas)
  mount.replaceChildren(wrapper)

  const scene = new Container()
  scene.zIndex = 10
  application.stage.sortableChildren = true
  application.stage.addChild(renderGrid(GRID_COLS, GRID_ROWS, TILE_SIZE))
  application.stage.addChild(scene)

  let pendingDirection: Direction | null = null
  const onKeyDown = (event: KeyboardEvent) => {
    const direction = normalizeDirection(event.key)
    if (direction === null) {
      return
    }

    event.preventDefault()
    pendingDirection = direction
  }
  window.addEventListener("keydown", onKeyDown)

  const host = {
    application,
    scene,
    nodes: new Map<number, Graphics>(),
    clock: {
      deltaSeconds: 1 / 60
    }
  }

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, {
        direction() {
          const next = pendingDirection
          pendingDirection = null
          return next
        }
      }),
      Game.Runtime.service(PixiHost, host)
    ),
    resources: {
      GridSize: {
        cols: GRID_COLS,
        rows: GRID_ROWS,
        tileSize: TILE_SIZE
      },
      DeltaTime: host.clock.deltaSeconds
    }
  })

  const app = App.makeApp(runtime)
  app.bootstrap(browserSetupSchedule)
  app.update(browserUpdateSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.05)
    app.update(browserUpdateSchedule)
  }

  application.ticker.add(tick)

  return {
    async destroy() {
      application.ticker.remove(tick)
      window.removeEventListener("keydown", onKeyDown)
      for (const node of host.nodes.values()) {
        node.destroy()
      }
      host.nodes.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

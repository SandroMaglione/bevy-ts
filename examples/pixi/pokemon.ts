/**
 * Minimal `pokemon`-style example with ordered tile movement.
 *
 * ECS owns gameplay state:
 * - tile coordinates
 * - movement intent and interpolation state
 * - collision decisions
 *
 * Pixi owns renderer objects and the outer frame loop.
 */
import { Application, Container, Graphics } from "pixi.js"

import { Keyboard } from "@bevy-ts/browser"
import { Descriptor, Schema } from "@bevy-ts/core"
import { NodeRegistry, RenderSync } from "@bevy-ts/pixi"

interface BrowserExampleHandle {
  destroy(): Promise<void>
}

const Root = Schema.defineRoot("Pokemon")

const GRID_COLS = 10
const GRID_ROWS = 10
const TILE_SIZE = 32
const MOVE_DURATION_SECONDS = 0.18

type Direction = "up" | "down" | "left" | "right"
type TilePosition = { col: number; row: number }

const Position = Descriptor.Component<TilePosition>()("Pokemon/Position")
const Movement = Descriptor.Component<{
  direction: Direction | null
  from: TilePosition
  to: TilePosition
  progress: number
  isMoving: boolean
}>()("Pokemon/Movement")
const Renderable = Descriptor.Component<{
  kind: "player" | "solid"
}>()("Pokemon/Renderable")
const Player = Descriptor.Component<{}>()("Pokemon/Player")
const Solid = Descriptor.Component<{}>()("Pokemon/Solid")

const GridSize = Descriptor.Resource<{ cols: number; rows: number; tileSize: number }>()("Pokemon/GridSize")
const DeltaTime = Descriptor.Resource<number>()("Pokemon/DeltaTime")

const InputManager = Descriptor.Service<{
  readonly direction: () => Direction | null
}>()("Pokemon/InputManager")

const PixiHost = Descriptor.Service<{
  readonly application: Application
  readonly scene: Container
  readonly clock: {
    deltaSeconds: number
  }
}>()("Pokemon/PixiHost")
const PokemonNodes = Descriptor.Service<NodeRegistry.NodeRegistry<Graphics>>()("Pokemon/Nodes")

const Game = Schema.bind(
  Schema.fragment({
    components: {
      Position,
      Movement,
      Renderable,
      Player,
      Solid
    },
    resources: {
      GridSize,
      DeltaTime
    }
  }),
  Root
)
const schema = Game.schema

const PlayerQuery = Game.Query({
  selection: {
    position: Game.Query.write(Position),
    movement: Game.Query.write(Movement),
    player: Game.Query.read(Player)
  }
})

const SolidQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    solid: Game.Query.read(Solid)
  }
})

const PlayerRenderableQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    movement: Game.Query.read(Movement),
    renderable: Game.Query.read(Renderable),
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

const nextTileFromDirection = (position: TilePosition, direction: Direction): TilePosition =>
  direction === "up" ? { col: position.col, row: position.row - 1 }
  : direction === "down" ? { col: position.col, row: position.row + 1 }
  : direction === "left" ? { col: position.col - 1, row: position.row }
  : { col: position.col + 1, row: position.row }

const setNodeTilePosition = (
  node: Graphics,
  kind: "player" | "solid",
  tileSize: number,
  x: number,
  y: number
): void => {
  const inset = kind === "player" ? 5 : 4
  node.position.set(x + inset, y + inset)
}

const INITIAL_PLAYER_POSITION = { col: 3, row: 3 } as const

const makePlayerDraft = () =>
  Game.Command.spawn(
    [Position, INITIAL_PLAYER_POSITION],
    [Movement, {
      direction: null,
      from: INITIAL_PLAYER_POSITION,
      to: INITIAL_PLAYER_POSITION,
      progress: 1,
      isMoving: false
    }],
    [Renderable, {
      kind: "player"
    }],
    [Player, {}]
  )

const makeSolidDraft = (position: TilePosition) =>
  Game.Command.spawn(
    [Position, position],
    [Renderable, {
      kind: "solid"
    }],
    [Solid, {}]
  )

const SetupSystem = Game.System(
  "Pokemon/Setup",
  {},
  ({ commands }) =>
    {
      commands.spawn(makePlayerDraft())

      const solids = [
        { col: 5, row: 5 },
        { col: 2, row: 6 },
        { col: 7, row: 3 },
        { col: 6, row: 7 }
      ] as const

      for (const solid of solids) {
        commands.spawn(makeSolidDraft(solid))
      }
    }
)

const CaptureFrameInputSystem = Game.System(
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
    {
      resources.deltaTime.set(services.pixi.clock.deltaSeconds)
    }
)

const InputSystem = Game.System(
  "Pokemon/Input",
  {
    queries: {
      player: PlayerQuery
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ queries, services }) =>
    {
      const direction = services.input.direction()
      if (direction === null) {
        return
      }

      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
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
    }
)

const PlanMovementSystem = Game.System(
  "Pokemon/PlanMovement",
  {
    queries: {
      player: PlayerQuery
    }
  },
  ({ queries }) =>
    {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
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
    }
)

const CollisionSystem = Game.System(
  "Pokemon/Collision",
  {
    queries: {
      player: PlayerQuery,
      solids: SolidQuery
    },
    resources: {
      grid: Game.System.readResource(GridSize)
    }
  },
  ({ queries, resources }) =>
    {
      const { cols, rows } = resources.grid.get()
      const occupied = new Set(
        queries.solids.each().map((match) => {
          const position = match.data.position.get()
          return `${position.col},${position.row}`
        })
      )

      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
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

      if (outOfBounds || occupied.has(`${movement.to.col},${movement.to.row}`)) {
        match.data.movement.set({
          ...movement,
          direction: null,
          to: movement.from,
          progress: 1,
          isMoving: false
        })
      }
    }
)

const AdvanceMovementSystem = Game.System(
  "Pokemon/AdvanceMovement",
  {
    queries: {
      player: PlayerQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime)
    }
  },
  ({ queries, resources }) =>
    {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const match = player.value
      const movement = match.data.movement.get()
      if (!movement.isMoving) {
        return
      }

      const nextProgress = Math.min(
        movement.progress + resources.deltaTime.get() / MOVE_DURATION_SECONDS,
        1
      )

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
    }
)

// Solids never move, so the tile position applied on creation is final. The
// player is positioned every frame by `SyncPlayerNodeSystem` instead.
const render = RenderSync.systems(Game, {
  name: "Pokemon/Render",
  renderable: Renderable,
  transform: Position,
  registry: PokemonNodes,
  resources: { grid: GridSize },
  create: ({ renderable, resources }) => makePokemonNode(renderable.kind, resources.grid.get().tileSize),
  apply: (node, { renderable, transform, resources }) => {
    const { tileSize } = resources.grid.get()
    setNodeTilePosition(node, renderable.kind, tileSize, transform.col * tileSize, transform.row * tileSize)
  }
})

const SyncPlayerNodeSystem = Game.System(
  "Pokemon/SyncPlayerNode",
  {
    queries: {
      players: PlayerRenderableQuery
    },
    resources: {
      grid: Game.System.readResource(GridSize)
    },
    services: {
      nodes: Game.System.service(PokemonNodes)
    }
  },
  ({ queries, resources, services }) =>
    {
      const { tileSize } = resources.grid.get()

      for (const match of queries.players.each()) {
        const node = services.nodes.get(match.entity.id)
        if (!node) {
          continue
        }

        const movement = match.data.movement.get()
        const fromX = movement.from.col * tileSize
        const fromY = movement.from.row * tileSize
        const toX = movement.to.col * tileSize
        const toY = movement.to.row * tileSize
        const renderX = fromX + (toX - fromX) * movement.progress
        const renderY = fromY + (toY - fromY) * movement.progress

        setNodeTilePosition(
          node,
          match.data.renderable.get().kind,
          tileSize,
          renderX,
          renderY
        )
      }
    }
)

const setupSchedule = Game.Schedule(SetupSystem)

const browserSetupSchedule = Game.Schedule(
  setupSchedule,
  Game.Schedule.applyDeferred(),
  render.create,
  SyncPlayerNodeSystem
)

const updateSchedule = Game.Schedule(
  InputSystem,
  PlanMovementSystem,
  CollisionSystem,
  AdvanceMovementSystem
)

const browserUpdateSchedule = Game.Schedule(
  CaptureFrameInputSystem,
  updateSchedule,
  Game.Schedule.applyDeferred(),
  render.destroy,
  render.create,
  render.sync,
  SyncPlayerNodeSystem
)

export const createPokemonExample = (input: {
  readonly direction: () => Direction | null
}) => {
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, input)
    ),
    resources: {
      GridSize: {
        cols: GRID_COLS,
        rows: GRID_ROWS,
        tileSize: TILE_SIZE
      },
      DeltaTime: 1 / 60
    }
  })
  runtime.tick(setupSchedule)

  return {
    runtime,
    update() {
      runtime.tick(updateSchedule)
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

  const keyboard = Keyboard.actions(window, {
    up: ["ArrowUp", "w"],
    down: ["ArrowDown", "s"],
    left: ["ArrowLeft", "a"],
    right: ["ArrowRight", "d"]
  })
  const directions = ["up", "down", "left", "right"] as const
  const nodes = NodeRegistry.inContainer<Graphics>(scene)

  const host = {
    application,
    scene,
    clock: {
      deltaSeconds: 1 / 60
    }
  }

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, {
        // Holding a direction keeps walking (movement only accepts a new
        // direction once the current step finishes); a quick tap still counts.
        direction() {
          const snapshot = keyboard.snapshot()
          return directions.find((direction) => snapshot[direction].held || snapshot[direction].pressed) ?? null
        }
      }),
      Game.Runtime.service(PixiHost, host),
      Game.Runtime.service(PokemonNodes, nodes)
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
  runtime.tick(browserSetupSchedule)
  runtime.tick(browserUpdateSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.05)
    runtime.tick(browserUpdateSchedule)
  }

  application.ticker.add(tick)

  return {
    async destroy() {
      application.ticker.remove(tick)
      keyboard.dispose()
      nodes.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

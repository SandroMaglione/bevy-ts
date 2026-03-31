import { Application, Container, Graphics } from "pixi.js"

import { App, Descriptor, Entity, Fx, Schema } from "../index.ts"
import type { BrowserExampleHandle } from "./pixi.ts"

const Root = Schema.defineRoot("Snake")

type GridPosition = {
  x: number
  y: number
}

type GameOverReasonValue = "Collision" | "Victory" | null

type SnakeHud = {
  readonly root: HTMLDivElement
  readonly score: HTMLSpanElement
  readonly state: HTMLSpanElement
  readonly scrim: HTMLDivElement
  readonly overlay: HTMLDivElement
  readonly title: HTMLHeadingElement
  readonly subtitle: HTMLParagraphElement
  readonly footer: HTMLParagraphElement
}

const Position = Descriptor.defineComponent<GridPosition>()("Snake/Position")
const PreviousPosition = Descriptor.defineComponent<GridPosition>()("Snake/PreviousPosition")
const Velocity = Descriptor.defineComponent<GridPosition>()("Snake/Velocity")
const SnakeHead = Descriptor.defineComponent<{}>()("Snake/Head")
const SnakeBody = Descriptor.defineComponent<{ parent: Entity.Handle<typeof Root>; isTail: boolean }>()("Snake/Body")
const Food = Descriptor.defineComponent<{}>()("Snake/Food")

const FoodEaten = Descriptor.defineEvent<{ entity: Entity.Handle<typeof Root, typeof Food> }>()("Snake/FoodEaten")

const Score = Descriptor.defineResource<number>()("Snake/Score")
const PendingGrowth = Descriptor.defineResource<number>()("Snake/PendingGrowth")
const SpawnSeed = Descriptor.defineResource<number>()("Snake/SpawnSeed")
const GameOverReason = Descriptor.defineResource<GameOverReasonValue>()("Snake/GameOverReason")

const InputManager = Descriptor.defineService<{
  readonly consumeDirection: () => GridPosition | null
  readonly consumeRestart: () => boolean
}>()("Snake/InputManager")

const PixiHost = Descriptor.defineService<{
  readonly scene: Container
  readonly nodes: Map<number, Graphics>
  readonly tileSize: number
  readonly ui: SnakeHud
}>()("Snake/PixiHost")

const SNAKE_BOARD_WIDTH = 12
const SNAKE_BOARD_HEIGHT = 12
const INITIAL_HEAD_POSITION: GridPosition = { x: 5, y: 5 }
const INITIAL_VELOCITY: GridPosition = { x: 1, y: 0 }
const INITIAL_TAIL_POSITION: GridPosition = { x: 4, y: 5 }

const schema = Schema.build(
  Schema.fragment({
    components: {
      Position,
      PreviousPosition,
      Velocity,
      SnakeHead,
      SnakeBody,
      Food
    },
    resources: {
      Score,
      PendingGrowth,
      SpawnSeed,
      GameOverReason
    },
    events: {
      FoodEaten
    }
  })
)

const Game = Schema.bind(schema, Root)
const GamePhase = Game.StateMachine.define("Phase", ["Playing", "GameOver"])

const HeadQuery = Game.Query.define({
  selection: {
    position: Game.Query.write(Position),
    previousPosition: Game.Query.write(PreviousPosition),
    velocity: Game.Query.write(Velocity),
    head: Game.Query.read(SnakeHead)
  }
})

const BodyQuery = Game.Query.define({
  selection: {
    position: Game.Query.write(Position),
    previousPosition: Game.Query.write(PreviousPosition),
    body: Game.Query.write(SnakeBody)
  }
})

const FoodQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    food: Game.Query.read(Food)
  }
})

const ParentPreviousPositionQuery = Game.Query.define({
  selection: {
    previousPosition: Game.Query.read(PreviousPosition)
  }
})

const OccupiedCellQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    head: Game.Query.optional(SnakeHead),
    body: Game.Query.optional(SnakeBody),
    food: Game.Query.optional(Food)
  }
})

const AddedRenderNodeQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    head: Game.Query.optional(SnakeHead),
    body: Game.Query.optional(SnakeBody),
    food: Game.Query.optional(Food)
  },
  filters: [Game.Query.added(Position)]
})

const ChangedRenderNodeQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    head: Game.Query.optional(SnakeHead),
    body: Game.Query.optional(SnakeBody),
    food: Game.Query.optional(Food)
  },
  filters: [Game.Query.changed(Position)]
})

const sameCell = (left: GridPosition, right: GridPosition): boolean =>
  left.x === right.x && left.y === right.y

const wrapPosition = (position: GridPosition): GridPosition => ({
  x: (position.x + SNAKE_BOARD_WIDTH) % SNAKE_BOARD_WIDTH,
  y: (position.y + SNAKE_BOARD_HEIGHT) % SNAKE_BOARD_HEIGHT
})

const nextSeed = (seed: number): number =>
  (Math.imul(seed, 1664525) + 1013904223) >>> 0

const randomSeedFromNow = (): number => {
  const seed = Date.now() >>> 0
  return seed === 0 ? 1 : seed
}

const makeHud = (): SnakeHud => {
  const root = document.createElement("div")
  root.style.position = "absolute"
  root.style.inset = "0"
  root.style.display = "grid"
  root.style.gridTemplateRows = "auto 1fr"
  root.style.pointerEvents = "none"

  const topBar = document.createElement("div")
  topBar.style.display = "flex"
  topBar.style.justifyContent = "space-between"
  topBar.style.gap = "12px"
  topBar.style.padding = "14px 16px 0"

  const makePill = (): HTMLSpanElement => {
    const node = document.createElement("span")
    node.style.display = "inline-flex"
    node.style.alignItems = "center"
    node.style.padding = "8px 12px"
    node.style.borderRadius = "999px"
    node.style.background = "rgba(6, 10, 14, 0.78)"
    node.style.border = "1px solid rgba(255,255,255,0.08)"
    node.style.color = "#f2f5f7"
    node.style.fontFamily = "\"IBM Plex Mono\", monospace"
    node.style.fontSize = "12px"
    node.style.letterSpacing = "0.08em"
    node.style.textTransform = "uppercase"
    return node
  }

  const score = makePill()
  const state = makePill()
  topBar.append(score, state)

  const center = document.createElement("div")
  center.style.position = "relative"
  center.style.display = "grid"
  center.style.placeItems = "center"
  center.style.padding = "20px"

  const scrim = document.createElement("div")
  scrim.style.position = "absolute"
  scrim.style.inset = "0"
  scrim.style.background = "linear-gradient(180deg, rgba(4, 7, 10, 0.1), rgba(4, 7, 10, 0.72))"
  scrim.style.opacity = "0"
  scrim.style.transition = "opacity 120ms ease"

  const overlay = document.createElement("div")
  overlay.style.position = "relative"
  overlay.style.display = "grid"
  overlay.style.gap = "10px"
  overlay.style.justifyItems = "center"
  overlay.style.maxWidth = "320px"
  overlay.style.padding = "18px 22px"
  overlay.style.borderRadius = "22px"
  overlay.style.background = "rgba(7, 11, 15, 0.72)"
  overlay.style.border = "1px solid rgba(255,255,255,0.08)"
  overlay.style.backdropFilter = "blur(8px)"
  overlay.style.opacity = "0"
  overlay.style.transition = "opacity 120ms ease"

  const title = document.createElement("h2")
  title.style.margin = "0"
  title.style.fontSize = "36px"
  title.style.lineHeight = "0.95"
  title.style.letterSpacing = "-0.04em"

  const subtitle = document.createElement("p")
  subtitle.style.margin = "0"
  subtitle.style.color = "#bfd0dc"
  subtitle.style.fontSize = "14px"
  subtitle.style.lineHeight = "1.5"
  subtitle.style.textAlign = "center"

  const footer = document.createElement("p")
  footer.style.margin = "0"
  footer.style.color = "#84e0d2"
  footer.style.fontFamily = "\"IBM Plex Mono\", monospace"
  footer.style.fontSize = "12px"
  footer.style.letterSpacing = "0.05em"
  footer.style.textTransform = "uppercase"
  footer.style.textAlign = "center"

  overlay.append(title, subtitle, footer)
  center.append(scrim, overlay)
  root.append(topBar, center)

  return { root, score, state, scrim, overlay, title, subtitle, footer }
}

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

const snakeNodeKindForMatch = (match: { readonly data: {
  readonly head: { readonly present: boolean }
  readonly body: { readonly present: boolean }
  readonly food: { readonly present: boolean }
} }): "head" | "body" | "food" | null => {
  if (match.data.head.present) {
    return "head"
  }
  if (match.data.body.present) {
    return "body"
  }
  if (match.data.food.present) {
    return "food"
  }
  return null
}

const placeNode = (
  node: Graphics,
  kind: "head" | "body" | "food",
  tileSize: number,
  position: GridPosition
): void => {
  if (kind === "food") {
    node.position.set(position.x * tileSize, position.y * tileSize)
    return
  }

  const inset = kind === "head" ? 3 : 5
  node.position.set(
    position.x * tileSize + inset,
    position.y * tileSize + inset
  )
}

const ResetGameSystem = Game.System.define(
  "Snake/ResetGame",
  {
    queries: {
      head: Game.Query.define({
        selection: {
          head: Game.Query.read(SnakeHead)
        }
      }),
      body: Game.Query.define({
        selection: {
          body: Game.Query.read(SnakeBody)
        }
      }),
      food: FoodQuery
    },
    resources: {
      score: Game.System.writeResource(Score),
      pendingGrowth: Game.System.writeResource(PendingGrowth),
      reason: Game.System.writeResource(GameOverReason)
    }
  },
  ({ queries, resources, commands }) =>
    Fx.sync(() => {
      resources.score.set(0)
      resources.pendingGrowth.set(0)
      resources.reason.set(null)

      for (const match of queries.head.each()) {
        commands.despawn(match.entity.id)
      }
      for (const match of queries.body.each()) {
        commands.despawn(match.entity.id)
      }
      for (const match of queries.food.each()) {
        commands.despawn(match.entity.id)
      }

      const headId = commands.spawn(
        Game.Command.spawnWith(
          [Position, INITIAL_HEAD_POSITION],
          [PreviousPosition, INITIAL_HEAD_POSITION],
          [Velocity, INITIAL_VELOCITY],
          [SnakeHead, {}]
        )
      )

      commands.spawn(
        Game.Command.spawnWith(
          [Position, INITIAL_TAIL_POSITION],
          [PreviousPosition, INITIAL_TAIL_POSITION],
          [SnakeBody, {
            parent: headId,
            isTail: true
          }]
        )
      )
    })
)

const QueueRestartSystem = Game.System.define(
  "Snake/QueueRestart",
  {
    when: [Game.Condition.inState(GamePhase, "GameOver")],
    nextMachines: {
      phase: Game.System.nextState(GamePhase)
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumeRestart()) {
        // Restart is queued here and becomes real only at applyStateTransitions().
        nextMachines.phase.set("Playing")
      }
    })
)

const CapturePreviousPositionsSystem = Game.System.define(
  "Snake/CapturePreviousPositions",
  {
    when: [Game.Condition.inState(GamePhase, "Playing")],
    queries: {
      head: HeadQuery,
      body: BodyQuery
    }
  },
  ({ queries }) =>
    Fx.sync(() => {
      const head = queries.head.single()
      if (!head.ok) {
        return
      }

      const headPosition = head.value.data.position.get()
      head.value.data.previousPosition.set(headPosition)

      for (const match of queries.body.each()) {
        match.data.previousPosition.set(match.data.position.get())
      }
    })
)

const BrowserInputSystem = Game.System.define(
  "Snake/BrowserInput",
  {
    when: [Game.Condition.inState(GamePhase, "Playing")],
    queries: {
      head: HeadQuery
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const next = services.input.consumeDirection()
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

const MoveHeadSystem = Game.System.define(
  "Snake/MoveHead",
  {
    when: [Game.Condition.inState(GamePhase, "Playing")],
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
      head.value.data.position.set(wrapPosition({
        x: position.x + velocity.x,
        y: position.y + velocity.y
      }))
    })
)

const MoveBodySystem = Game.System.define(
  "Snake/MoveBody",
  {
    when: [Game.Condition.inState(GamePhase, "Playing")],
    queries: {
      body: BodyQuery
    }
  },
  ({ queries, lookup }) =>
    Fx.sync(() => {
      for (const match of queries.body.each()) {
        const parent = match.data.body.get().parent
        const parentLookup = lookup.getHandle(parent, ParentPreviousPositionQuery)
        if (!parentLookup.ok) {
          continue
        }

        match.data.position.set(parentLookup.value.data.previousPosition.get())
      }
    })
)

const DetectFoodCollisionSystem = Game.System.define(
  "Snake/DetectFoodCollision",
  {
    when: [Game.Condition.inState(GamePhase, "Playing")],
    queries: {
      head: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          head: Game.Query.read(SnakeHead)
        }
      }),
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
        if (sameCell(headPosition, match.data.position.get())) {
          events.foodEaten.emit({
            entity: Game.Entity.handleAs(Food, match.entity.id)
          })
        }
      }
    })
)

const ResolveFoodEatenSystem = Game.System.define(
  "Snake/ResolveFoodEaten",
  {
    when: [Game.Condition.inState(GamePhase, "Playing")],
    events: {
      foodEaten: Game.System.readEvent(FoodEaten)
    },
    resources: {
      score: Game.System.writeResource(Score),
      pendingGrowth: Game.System.writeResource(PendingGrowth)
    }
  },
  ({ events, resources, commands, lookup }) =>
    Fx.sync(() => {
      for (const event of events.foodEaten.all()) {
        const food = lookup.getHandle(event.entity, FoodQuery)
        if (!food.ok) {
          continue
        }

        commands.despawn(food.value.entity.id)
        resources.score.update((score) => score + 1)
        resources.pendingGrowth.update((growth) => growth + 1)
      }
    })
)

const GrowSnakeSystem = Game.System.define(
  "Snake/Grow",
  {
    when: [Game.Condition.inState(GamePhase, "Playing")],
    queries: {
      head: HeadQuery,
      body: BodyQuery
    },
    resources: {
      pendingGrowth: Game.System.writeResource(PendingGrowth)
    }
  },
  ({ queries, resources, commands }) =>
    Fx.sync(() => {
      const pendingGrowth = resources.pendingGrowth.get()
      if (pendingGrowth <= 0) {
        return
      }

      const tail = queries.body.each().find((match) => match.data.body.get().isTail)
      if (tail) {
        const tailPrevious = tail.data.previousPosition.get()
        tail.data.body.update((body) => ({
          ...body,
          isTail: false
        }))

        commands.spawn(
          Game.Command.spawnWith(
            [Position, tailPrevious],
            [PreviousPosition, tailPrevious],
            [SnakeBody, {
              parent: Game.Entity.handle(tail.entity.id),
              isTail: true
            }]
          )
        )
      } else {
        const head = queries.head.single()
        if (!head.ok) {
          return
        }

        const headPrevious = head.value.data.previousPosition.get()
        commands.spawn(
          Game.Command.spawnWith(
            [Position, headPrevious],
            [PreviousPosition, headPrevious],
            [SnakeBody, {
              parent: Game.Entity.handle(head.value.entity.id),
              isTail: true
            }]
          )
        )
      }

      resources.pendingGrowth.set(pendingGrowth - 1)
    })
)

const DetectSelfCollisionSystem = Game.System.define(
  "Snake/DetectSelfCollision",
  {
    when: [Game.Condition.inState(GamePhase, "Playing")],
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
      })
    },
    resources: {
      reason: Game.System.writeResource(GameOverReason)
    },
    nextMachines: {
      phase: Game.System.nextState(GamePhase)
    }
  },
  ({ queries, resources, nextMachines }) =>
    Fx.sync(() => {
      const head = queries.head.single()
      if (!head.ok) {
        return
      }

      const headPosition = head.value.data.position.get()
      for (const match of queries.body.each()) {
        if (sameCell(headPosition, match.data.position.get())) {
          resources.reason.set("Collision")
          nextMachines.phase.set("GameOver")
          return
        }
      }
    })
)

const EnsureFoodSystem = Game.System.define(
  "Snake/EnsureFood",
  {
    when: [Game.Condition.inState(GamePhase, "Playing")],
    queries: {
      food: FoodQuery,
      occupied: OccupiedCellQuery
    },
    resources: {
      seed: Game.System.writeResource(SpawnSeed),
      reason: Game.System.writeResource(GameOverReason)
    },
    nextMachines: {
      phase: Game.System.nextState(GamePhase)
    }
  },
  ({ queries, resources, nextMachines, commands }) =>
    Fx.sync(() => {
      if (resources.reason.get() !== null) {
        return
      }

      if (queries.food.each().length > 0) {
        return
      }

      const occupied = new Set<string>()
      for (const match of queries.occupied.each()) {
        occupied.add(`${match.data.position.get().x}:${match.data.position.get().y}`)
      }

      const freeCells: Array<GridPosition> = []
      for (let y = 0; y < SNAKE_BOARD_HEIGHT; y += 1) {
        for (let x = 0; x < SNAKE_BOARD_WIDTH; x += 1) {
          if (!occupied.has(`${x}:${y}`)) {
            freeCells.push({ x, y })
          }
        }
      }

      if (freeCells.length === 0) {
        resources.reason.set("Victory")
        nextMachines.phase.set("GameOver")
        return
      }

      const seed = nextSeed(resources.seed.get())
      resources.seed.set(seed)
      const spawnAt = freeCells[seed % freeCells.length]
      if (!spawnAt) {
        return
      }

      commands.spawn(
        Game.Command.spawnWith(
          [Position, spawnAt],
          [PreviousPosition, spawnAt],
          [Food, {}]
        )
      )
    })
)

const DestroySnakeNodesSystem = Game.System.define(
  "Snake/DestroyRenderNodes",
  {
    despawned: {
      entities: Game.System.readDespawned()
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ despawned, services }) =>
    Fx.sync(() => {
      for (const entityId of despawned.entities.all()) {
        const node = services.pixi.nodes.get(entityId.value)
        if (!node) {
          continue
        }

        services.pixi.scene.removeChild(node)
        node.destroy()
        services.pixi.nodes.delete(entityId.value)
      }
    })
)

const CreateSnakeNodesSystem = Game.System.define(
  "Snake/CreateRenderNodes",
  {
    queries: {
      added: AddedRenderNodeQuery
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.added.each()) {
        const kind = snakeNodeKindForMatch(match)
        if (!kind) {
          continue
        }

        const entityId = match.entity.id.value
        let node = services.pixi.nodes.get(entityId)
        if (!node) {
          node = makeSnakeNode(kind, services.pixi.tileSize)
          services.pixi.scene.addChild(node)
          services.pixi.nodes.set(entityId, node)
        }

        placeNode(node, kind, services.pixi.tileSize, match.data.position.get())
      }
    })
)

const SyncSnakeNodeTransformsSystem = Game.System.define(
  "Snake/SyncRenderNodeTransforms",
  {
    queries: {
      moved: ChangedRenderNodeQuery
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.moved.each()) {
        const kind = snakeNodeKindForMatch(match)
        if (!kind) {
          continue
        }

        const entityId = match.entity.id.value
        let node = services.pixi.nodes.get(entityId)
        if (!node) {
          node = makeSnakeNode(kind, services.pixi.tileSize)
          services.pixi.scene.addChild(node)
          services.pixi.nodes.set(entityId, node)
        }

        placeNode(node, kind, services.pixi.tileSize, match.data.position.get())
      }
    })
)

const ReconcileSnakeNodesSystem = Game.System.define(
  "Snake/ReconcileRenderNodes",
  {
    queries: {
      live: OccupiedCellQuery
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const liveEntityIds = new Set<number>()
      for (const match of queries.live.each()) {
        liveEntityIds.add(match.entity.id.value)
      }

      for (const [entityId, node] of services.pixi.nodes) {
        if (liveEntityIds.has(entityId)) {
          continue
        }

        services.pixi.scene.removeChild(node)
        node.destroy()
        services.pixi.nodes.delete(entityId)
      }
    })
)

const SyncHudSystem = Game.System.define(
  "Snake/SyncHud",
  {
    resources: {
      score: Game.System.readResource(Score),
      reason: Game.System.readResource(GameOverReason)
    },
    machines: {
      phase: Game.System.machine(GamePhase)
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ resources, machines, services }) =>
    Fx.sync(() => {
      const hud = services.pixi.ui
      const score = resources.score.get()
      const reason = resources.reason.get()
      const phase = machines.phase.get()

      hud.score.textContent = `Score ${score}`
      hud.state.textContent = phase === "Playing" ? "Playing" : "Game Over"

      if (phase === "Playing") {
        hud.scrim.style.opacity = "0"
        hud.overlay.style.opacity = "0"
        hud.title.textContent = "Snake"
        hud.subtitle.textContent = "Wrap the board, eat food, and avoid your own body."
        hud.footer.textContent = "Arrows or WASD to steer"
        return
      }

      hud.scrim.style.opacity = "0.62"
      hud.overlay.style.opacity = "1"
      hud.title.textContent = reason === "Victory" ? "Board Cleared" : "Game Over"
      hud.subtitle.textContent = reason === "Victory"
        ? `You filled all ${SNAKE_BOARD_WIDTH * SNAKE_BOARD_HEIGHT} cells. Final score ${score}.`
        : `The snake collided with itself. Final score ${score}.`
      hud.footer.textContent = "Press Space or Enter to restart"
    })
)

const setupSchedule = Game.Schedule.define({
  systems: [ResetGameSystem, EnsureFoodSystem],
  steps: [
    ResetGameSystem,
    Game.Schedule.applyDeferred(),
    EnsureFoodSystem,
    Game.Schedule.applyDeferred()
  ]
})

const browserSetupSchedule = Game.Schedule.extend(setupSchedule, {
  after: [
    Game.Schedule.updateLifecycle(),
    CreateSnakeNodesSystem,
    SyncSnakeNodeTransformsSystem,
    ReconcileSnakeNodesSystem,
    SyncHudSystem
  ]
})

const phaseTransitions = Game.Schedule.transitions(
  Game.Schedule.onEnter(GamePhase, "Playing", {
    // Reset work stays explicit and runs only once the new phase is committed.
    systems: [ResetGameSystem]
  })
)

const updateSchedule = Game.Schedule.define({
  systems: [
    CapturePreviousPositionsSystem,
    MoveHeadSystem,
    MoveBodySystem,
    DetectFoodCollisionSystem,
    ResolveFoodEatenSystem,
    GrowSnakeSystem,
    DetectSelfCollisionSystem,
    EnsureFoodSystem
  ],
  steps: [
    CapturePreviousPositionsSystem,
    MoveHeadSystem,
    MoveBodySystem,
    DetectFoodCollisionSystem,
    Game.Schedule.updateEvents(),
    ResolveFoodEatenSystem,
    Game.Schedule.applyDeferred(),
    GrowSnakeSystem,
    Game.Schedule.applyDeferred(),
    DetectSelfCollisionSystem,
    EnsureFoodSystem,
    Game.Schedule.applyDeferred(),
    Game.Schedule.applyStateTransitions(phaseTransitions)
  ]
})

const browserUpdateSchedule = Game.Schedule.extend(updateSchedule, {
  before: [
    QueueRestartSystem,
    BrowserInputSystem
  ],
  after: [
    Game.Schedule.applyDeferred(),
    Game.Schedule.updateLifecycle(),
    DestroySnakeNodesSystem,
    CreateSnakeNodesSystem,
    SyncSnakeNodeTransformsSystem,
    ReconcileSnakeNodesSystem,
    SyncHudSystem
  ]
})

export const createSnakeExample = () => {
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(),
    resources: {
      Score: 0,
      PendingGrowth: 0,
      SpawnSeed: 1,
      GameOverReason: null
    },
    machines: Game.Runtime.machines(
      Game.Runtime.machine(GamePhase, "Playing")
    )
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
  wrapper.style.position = "relative"
  wrapper.style.overflow = "hidden"
  wrapper.style.borderRadius = "24px"
  wrapper.appendChild(application.canvas)

  const hud = makeHud()
  wrapper.appendChild(hud.root)
  mount.replaceChildren(wrapper)

  const scene = new Container()
  scene.zIndex = 10
  application.stage.sortableChildren = true
  application.stage.addChild(renderBoard(cellsWide, cellsHigh, tileSize))
  application.stage.addChild(scene)

  let pendingDirection: GridPosition | null = null
  let restartQueued = false

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowUp":
      case "w":
      case "W":
        pendingDirection = { x: 0, y: -1 }
        event.preventDefault()
        return
      case "ArrowDown":
      case "s":
      case "S":
        pendingDirection = { x: 0, y: 1 }
        event.preventDefault()
        return
      case "ArrowLeft":
      case "a":
      case "A":
        pendingDirection = { x: -1, y: 0 }
        event.preventDefault()
        return
      case "ArrowRight":
      case "d":
      case "D":
        pendingDirection = { x: 1, y: 0 }
        event.preventDefault()
        return
      case " ":
      case "Enter":
        restartQueued = true
        event.preventDefault()
        return
    }
  }

  window.addEventListener("keydown", onKeyDown)

  const host = {
    scene,
    nodes: new Map<number, Graphics>(),
    tileSize,
    ui: hud
  }

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, {
        consumeDirection() {
          const next = pendingDirection
          pendingDirection = null
          return next
        },
        consumeRestart() {
          const next = restartQueued
          restartQueued = false
          return next
        }
      }),
      Game.Runtime.service(PixiHost, host)
    ),
    resources: {
      Score: 0,
      PendingGrowth: 0,
      SpawnSeed: randomSeedFromNow(),
      GameOverReason: null
    },
    machines: Game.Runtime.machines(
      Game.Runtime.machine(GamePhase, "Playing")
    )
  })

  runtime.initialize(browserSetupSchedule)

  const intervalId = window.setInterval(() => {
    runtime.runSchedule(browserUpdateSchedule)
  }, 140)

  return {
    async destroy() {
      window.clearInterval(intervalId)
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

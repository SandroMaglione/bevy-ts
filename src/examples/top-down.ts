import { Application, Container, Graphics } from "pixi.js"

import { App, Descriptor, Fx, Schema } from "../index.ts"
import type { BrowserExampleHandle } from "./pixi.ts"

const WORLD_WIDTH = 2200
const WORLD_HEIGHT = 1600
const PLAYER_SPEED = 280
const PLAYER_SIZE = 36
const PLAYER_INTERACT_RADIUS = 72
const MAX_DELTA_SECONDS = 0.05

type Vector2 = { x: number; y: number }
type InputStateValue = {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  interactPressed: boolean
  interactJustPressed: boolean
}
type FocusedCollectableValue = {
  targetId: number | null
  label: string | null
  distance: number | null
}
type HudRefs = {
  prompt: HTMLElement
  stats: HTMLElement
  hint: HTMLElement
}
type TopDownHostValue = {
  application: Application
  world: Container
  actorLayer: Container
  nodes: Map<number, Container>
  hud: HudRefs
  clock: {
    deltaSeconds: number
  }
}

const Position = Descriptor.defineComponent<Vector2>()("TopDown/Position")
const Velocity = Descriptor.defineComponent<Vector2>()("TopDown/Velocity")
const Collider = Descriptor.defineComponent<{ width: number; height: number }>()("TopDown/Collider")
const Renderable = Descriptor.defineComponent<{
  kind: "player" | "wall" | "pickup"
  width: number
  height: number
  color: number
  accent: number
}>()("TopDown/Renderable")
const Player = Descriptor.defineComponent<{}>()("TopDown/Player")
const Wall = Descriptor.defineComponent<{}>()("TopDown/Wall")
const Collectable = Descriptor.defineComponent<{
  label: string
  radius: number
}>()("TopDown/Collectable")

const DeltaTime = Descriptor.defineResource<number>()("TopDown/DeltaTime")
const Viewport = Descriptor.defineResource<{ width: number; height: number }>()("TopDown/Viewport")
const Camera = Descriptor.defineResource<Vector2>()("TopDown/Camera")
const InputState = Descriptor.defineResource<InputStateValue>()("TopDown/InputState")
const FocusedCollectable = Descriptor.defineResource<FocusedCollectableValue>()("TopDown/FocusedCollectable")
const CollectedCount = Descriptor.defineResource<number>()("TopDown/CollectedCount")
const TotalCollectables = Descriptor.defineResource<number>()("TopDown/TotalCollectables")

const InputManager = Descriptor.defineService<{
  readonly snapshot: () => InputStateValue
}>()("TopDown/InputManager")
const TopDownHost = Descriptor.defineService<TopDownHostValue>()("TopDown/Host")

const schema = Schema.build(
  Schema.fragment({
    components: {
      Position,
      Velocity,
      Collider,
      Renderable,
      Player,
      Wall,
      Collectable
    },
    resources: {
      DeltaTime,
      Viewport,
      Camera,
      InputState,
      FocusedCollectable,
      CollectedCount,
      TotalCollectables
    }
  })
)
const Game = Schema.bind(schema)

const PlayerMovementQuery = Game.Query.define({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.write(Velocity),
    collider: Game.Query.read(Collider),
    player: Game.Query.read(Player)
  }
})

const PlayerCameraQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    player: Game.Query.read(Player)
  }
})

const WallCollisionQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    collider: Game.Query.read(Collider),
    wall: Game.Query.read(Wall)
  }
})

const CollectableQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    collider: Game.Query.read(Collider),
    collectable: Game.Query.read(Collectable),
    renderable: Game.Query.read(Renderable)
  }
})

const WallRenderQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    collider: Game.Query.read(Collider),
    renderable: Game.Query.read(Renderable),
    wall: Game.Query.read(Wall)
  }
})

const PlayerRenderQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    velocity: Game.Query.read(Velocity),
    collider: Game.Query.read(Collider),
    renderable: Game.Query.read(Renderable),
    player: Game.Query.read(Player)
  }
})

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const lengthSquared = (vector: Vector2): number =>
  vector.x * vector.x + vector.y * vector.y

const normalizeMovement = (input: InputStateValue): Vector2 => {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  const magnitudeSquared = x * x + y * y
  if (magnitudeSquared === 0) {
    return { x: 0, y: 0 }
  }

  const magnitude = Math.sqrt(magnitudeSquared)
  return {
    x: x / magnitude,
    y: y / magnitude
  }
}

const intersects = (
  firstPosition: Vector2,
  firstCollider: { width: number; height: number },
  secondPosition: Vector2,
  secondCollider: { width: number; height: number }
): boolean =>
  Math.abs(firstPosition.x - secondPosition.x) * 2 < firstCollider.width + secondCollider.width &&
  Math.abs(firstPosition.y - secondPosition.y) * 2 < firstCollider.height + secondCollider.height

const resolveHorizontalMovement = (
  position: Vector2,
  deltaX: number,
  collider: { width: number; height: number },
  walls: ReadonlyArray<{ position: Vector2; collider: { width: number; height: number } }>
): number => {
  if (deltaX === 0) {
    return position.x
  }

  const halfWidth = collider.width * 0.5
  let nextX = clamp(position.x + deltaX, halfWidth, WORLD_WIDTH - halfWidth)

  for (const wall of walls) {
    const candidate = {
      x: nextX,
      y: position.y
    }
    if (!intersects(candidate, collider, wall.position, wall.collider)) {
      continue
    }

    const wallHalfWidth = wall.collider.width * 0.5
    nextX =
      deltaX > 0
        ? wall.position.x - wallHalfWidth - halfWidth
        : wall.position.x + wallHalfWidth + halfWidth
  }

  return clamp(nextX, halfWidth, WORLD_WIDTH - halfWidth)
}

const resolveVerticalMovement = (
  position: Vector2,
  deltaY: number,
  collider: { width: number; height: number },
  walls: ReadonlyArray<{ position: Vector2; collider: { width: number; height: number } }>
): number => {
  if (deltaY === 0) {
    return position.y
  }

  const halfHeight = collider.height * 0.5
  let nextY = clamp(position.y + deltaY, halfHeight, WORLD_HEIGHT - halfHeight)

  for (const wall of walls) {
    const candidate = {
      x: position.x,
      y: nextY
    }
    if (!intersects(candidate, collider, wall.position, wall.collider)) {
      continue
    }

    const wallHalfHeight = wall.collider.height * 0.5
    nextY =
      deltaY > 0
        ? wall.position.y - wallHalfHeight - halfHeight
        : wall.position.y + wallHalfHeight + halfHeight
  }

  return clamp(nextY, halfHeight, WORLD_HEIGHT - halfHeight)
}

const makeWallDraft = (x: number, y: number, width: number, height: number) =>
  Game.Command.spawnWith(
    [Position, { x, y }],
    [Collider, { width, height }],
    [Renderable, {
      kind: "wall",
      width,
      height,
      color: 0x24303b,
      accent: 0x87d6ff
    }],
    [Wall, {}]
  )

const makePickupDraft = (x: number, y: number, label: string) =>
  Game.Command.spawnWith(
    [Position, { x, y }],
    [Collider, { width: 28, height: 28 }],
    [Renderable, {
      kind: "pickup",
      width: 28,
      height: 28,
      color: 0xf7c948,
      accent: 0xfff1b8
    }],
    [Collectable, {
      label,
      radius: PLAYER_INTERACT_RADIUS
    }]
  )

const wallLayout = [
  { x: 1100, y: 48, width: 2200, height: 96 },
  { x: 1100, y: 1552, width: 2200, height: 96 },
  { x: 48, y: 800, width: 96, height: 1600 },
  { x: 2152, y: 800, width: 96, height: 1600 },
  { x: 500, y: 400, width: 520, height: 80 },
  { x: 900, y: 820, width: 80, height: 520 },
  { x: 1380, y: 620, width: 620, height: 80 },
  { x: 1580, y: 1080, width: 80, height: 520 },
  { x: 760, y: 1220, width: 640, height: 80 },
  { x: 1280, y: 1320, width: 460, height: 80 }
] as const

const pickupLayout = [
  { x: 240, y: 240, label: "Map Fragment" },
  { x: 1740, y: 220, label: "Ancient Gear" },
  { x: 470, y: 1040, label: "Blue Crystal" },
  { x: 1880, y: 1310, label: "Signal Battery" },
  { x: 1110, y: 1460, label: "Compass Core" }
] as const

const SetupWorldSystem = Game.System.define(
  "TopDown/SetupWorld",
  {
    resources: {
      totalCollectables: Game.System.writeResource(TotalCollectables),
      collectedCount: Game.System.writeResource(CollectedCount),
      focused: Game.System.writeResource(FocusedCollectable)
    }
  },
  ({ commands, resources }) =>
    Fx.sync(() => {
      commands.spawn(
        Game.Command.spawnWith(
          [Position, { x: 180, y: 180 }],
          [Velocity, { x: 0, y: 0 }],
          [Collider, { width: PLAYER_SIZE, height: PLAYER_SIZE }],
          [Renderable, {
            kind: "player",
            width: PLAYER_SIZE,
            height: PLAYER_SIZE,
            color: 0x4ecdc4,
            accent: 0xd9fffb
          }],
          [Player, {}]
        )
      )

      for (const wall of wallLayout) {
        commands.spawn(makeWallDraft(wall.x, wall.y, wall.width, wall.height))
      }

      for (const pickup of pickupLayout) {
        commands.spawn(makePickupDraft(pickup.x, pickup.y, pickup.label))
      }

      resources.totalCollectables.set(pickupLayout.length)
      resources.collectedCount.set(0)
      resources.focused.set({
        targetId: null,
        label: null,
        distance: null
      })
    })
)

const CaptureFrameContextSystem = Game.System.define(
  "TopDown/CaptureFrameContext",
  {
    resources: {
      deltaTime: Game.System.writeResource(DeltaTime),
      viewport: Game.System.writeResource(Viewport),
      input: Game.System.writeResource(InputState)
    },
    services: {
      host: Game.System.service(TopDownHost),
      inputManager: Game.System.service(InputManager)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      resources.deltaTime.set(services.host.clock.deltaSeconds)
      resources.viewport.set({
        width: services.host.application.screen.width,
        height: services.host.application.screen.height
      })
      resources.input.set(services.inputManager.snapshot())
    })
)

const PlanPlayerVelocitySystem = Game.System.define(
  "TopDown/PlanPlayerVelocity",
  {
    queries: {
      player: PlayerMovementQuery
    },
    resources: {
      input: Game.System.readResource(InputState)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const direction = normalizeMovement(resources.input.get())
      player.value.data.velocity.set({
        x: direction.x * PLAYER_SPEED,
        y: direction.y * PLAYER_SPEED
      })
    })
)

const MovePlayerSystem = Game.System.define(
  "TopDown/MovePlayer",
  {
    queries: {
      player: PlayerMovementQuery,
      walls: WallCollisionQuery
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

      const dt = resources.deltaTime.get()
      const velocity = player.value.data.velocity.get()
      if (velocity.x === 0 && velocity.y === 0) {
        return
      }

      const walls = queries.walls.each().map((match) => ({
        position: match.data.position.get(),
        collider: match.data.collider.get()
      }))

      const position = player.value.data.position.get()
      const collider = player.value.data.collider.get()

      const nextX = resolveHorizontalMovement(position, velocity.x * dt, collider, walls)
      const nextPosition = {
        x: nextX,
        y: position.y
      }
      const nextY = resolveVerticalMovement(nextPosition, velocity.y * dt, collider, walls)

      player.value.data.position.set({
        x: nextX,
        y: nextY
      })
    })
)

const UpdateFocusedCollectableSystem = Game.System.define(
  "TopDown/UpdateFocusedCollectable",
  {
    queries: {
      player: PlayerCameraQuery,
      collectables: CollectableQuery
    },
    resources: {
      focused: Game.System.writeResource(FocusedCollectable)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const playerPosition = player.value.data.position.get()
      let targetId: number | null = null
      let label: string | null = null
      let bestDistanceSquared = Number.POSITIVE_INFINITY

      for (const collectable of queries.collectables.each()) {
        const position = collectable.data.position.get()
        const data = collectable.data.collectable.get()
        const interactionDistance = data.radius
        const dx = position.x - playerPosition.x
        const dy = position.y - playerPosition.y
        const distanceSquared = dx * dx + dy * dy

        if (distanceSquared > interactionDistance * interactionDistance) {
          continue
        }

        if (distanceSquared >= bestDistanceSquared) {
          continue
        }

        bestDistanceSquared = distanceSquared
        targetId = collectable.entity.id.value
        label = data.label
      }

      resources.focused.set({
        targetId,
        label,
        distance: targetId === null ? null : Math.sqrt(bestDistanceSquared)
      })
    })
)

const CollectFocusedCollectableSystem = Game.System.define(
  "TopDown/CollectFocusedCollectable",
  {
    queries: {
      collectables: CollectableQuery
    },
    resources: {
      input: Game.System.readResource(InputState),
      focused: Game.System.writeResource(FocusedCollectable),
      collectedCount: Game.System.writeResource(CollectedCount)
    }
  },
  ({ queries, resources, commands }) =>
    Fx.sync(() => {
      if (!resources.input.get().interactJustPressed) {
        return
      }

      const focused = resources.focused.get()
      if (focused.targetId === null) {
        return
      }

      for (const collectable of queries.collectables.each()) {
        if (collectable.entity.id.value !== focused.targetId) {
          continue
        }

        commands.despawn(collectable.entity.id)
        resources.collectedCount.update((value) => value + 1)
        resources.focused.set({
          targetId: null,
          label: null,
          distance: null
        })
        return
      }
    })
)

const SyncCameraSystem = Game.System.define(
  "TopDown/SyncCamera",
  {
    queries: {
      player: PlayerCameraQuery
    },
    resources: {
      viewport: Game.System.readResource(Viewport),
      camera: Game.System.writeResource(Camera)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const playerPosition = player.value.data.position.get()
      const viewport = resources.viewport.get()
      const halfViewWidth = viewport.width * 0.5
      const halfViewHeight = viewport.height * 0.5
      const minCameraX = halfViewWidth
      const maxCameraX = WORLD_WIDTH - halfViewWidth
      const minCameraY = halfViewHeight
      const maxCameraY = WORLD_HEIGHT - halfViewHeight

      resources.camera.set({
        x: minCameraX > maxCameraX ? WORLD_WIDTH * 0.5 : clamp(playerPosition.x, minCameraX, maxCameraX),
        y: minCameraY > maxCameraY ? WORLD_HEIGHT * 0.5 : clamp(playerPosition.y, minCameraY, maxCameraY)
      })
    })
)

const createPlayerNode = (renderable: {
  width: number
  height: number
  color: number
  accent: number
}): Container => {
  const node = new Container()

  const body = new Graphics()
  body.circle(0, 0, renderable.width * 0.44)
  body.fill(renderable.color)
  body.stroke({
    color: renderable.accent,
    width: 3
  })

  const facing = new Graphics()
  facing.moveTo(0, -renderable.height * 0.62)
  facing.lineTo(renderable.width * 0.18, -renderable.height * 0.16)
  facing.lineTo(-renderable.width * 0.18, -renderable.height * 0.16)
  facing.closePath()
  facing.fill(renderable.accent)

  const shadow = new Graphics()
  shadow.ellipse(0, renderable.height * 0.42, renderable.width * 0.28, renderable.height * 0.12)
  shadow.fill({
    color: 0x000000,
    alpha: 0.22
  })

  node.addChild(shadow)
  node.addChild(body)
  node.addChild(facing)
  return node
}

const createWallNode = (renderable: {
  width: number
  height: number
  color: number
  accent: number
}): Container => {
  const node = new Container()

  const body = new Graphics()
  body.roundRect(
    -renderable.width * 0.5,
    -renderable.height * 0.5,
    renderable.width,
    renderable.height,
    18
  )
  body.fill(renderable.color)
  body.stroke({
    color: renderable.accent,
    width: 2,
    alpha: 0.45
  })

  const inset = new Graphics()
  inset.roundRect(
    -renderable.width * 0.5 + 10,
    -renderable.height * 0.5 + 10,
    Math.max(renderable.width - 20, 0),
    Math.max(renderable.height - 20, 0),
    12
  )
  inset.stroke({
    color: 0x10181f,
    width: 2,
    alpha: 0.42
  })

  node.addChild(body)
  node.addChild(inset)
  return node
}

const createPickupNode = (renderable: {
  width: number
  height: number
  color: number
  accent: number
}): Container => {
  const node = new Container()

  const glow = new Graphics()
  glow.circle(0, 0, renderable.width * 0.82)
  glow.fill({
    color: renderable.color,
    alpha: 0.14
  })

  const crystal = new Graphics()
  crystal.moveTo(0, -renderable.height * 0.5)
  crystal.lineTo(renderable.width * 0.42, 0)
  crystal.lineTo(0, renderable.height * 0.5)
  crystal.lineTo(-renderable.width * 0.42, 0)
  crystal.closePath()
  crystal.fill(renderable.color)
  crystal.stroke({
    color: renderable.accent,
    width: 2
  })

  node.addChild(glow)
  node.addChild(crystal)
  return node
}

const ensureNode = (
  host: TopDownHostValue,
  entityId: number,
  renderable: {
    kind: "player" | "wall" | "pickup"
    width: number
    height: number
    color: number
    accent: number
  }
): Container => {
  const existing = host.nodes.get(entityId)
  if (existing) {
    return existing
  }

  const node =
    renderable.kind === "player" ? createPlayerNode(renderable)
    : renderable.kind === "wall" ? createWallNode(renderable)
    : createPickupNode(renderable)

  host.actorLayer.addChild(node)
  host.nodes.set(entityId, node)
  return node
}

const SyncSceneSystem = Game.System.define(
  "TopDown/SyncScene",
  {
    queries: {
      player: PlayerRenderQuery,
      walls: WallRenderQuery,
      collectables: CollectableQuery
    },
    resources: {
      viewport: Game.System.readResource(Viewport),
      camera: Game.System.readResource(Camera),
      focused: Game.System.readResource(FocusedCollectable)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      const host = services.host
      const alive = new Set<number>()
      const focusedId = resources.focused.get().targetId

      host.world.position.set(
        resources.viewport.get().width * 0.5 - resources.camera.get().x,
        resources.viewport.get().height * 0.5 - resources.camera.get().y
      )

      for (const match of queries.walls.each()) {
        const entityId = match.entity.id.value
        const renderable = match.data.renderable.get()
        const position = match.data.position.get()
        const node = ensureNode(host, entityId, renderable)
        node.position.set(position.x, position.y)
        node.rotation = 0
        node.scale.set(1)
        node.alpha = 1
        alive.add(entityId)
      }

      for (const match of queries.collectables.each()) {
        const entityId = match.entity.id.value
        const renderable = match.data.renderable.get()
        const position = match.data.position.get()
        const node = ensureNode(host, entityId, renderable)
        const isFocused = entityId === focusedId
        node.position.set(position.x, position.y)
        node.rotation += 0.01
        node.scale.set(isFocused ? 1.12 : 1)
        node.alpha = isFocused ? 1 : 0.86
        alive.add(entityId)
      }

      for (const match of queries.player.each()) {
        const entityId = match.entity.id.value
        const renderable = match.data.renderable.get()
        const position = match.data.position.get()
        const velocity = match.data.velocity.get()
        const node = ensureNode(host, entityId, renderable)
        node.position.set(position.x, position.y)
        node.alpha = 1
        node.scale.set(1)

        if (lengthSquared(velocity) > 1) {
          node.rotation = Math.atan2(velocity.y, velocity.x) + Math.PI * 0.5
        }

        alive.add(entityId)
      }

      for (const [entityId, node] of host.nodes) {
        if (alive.has(entityId)) {
          continue
        }

        host.actorLayer.removeChild(node)
        node.destroy({
          children: true
        })
        host.nodes.delete(entityId)
      }
    })
)

const SyncHudSystem = Game.System.define(
  "TopDown/SyncHud",
  {
    resources: {
      focused: Game.System.readResource(FocusedCollectable),
      collectedCount: Game.System.readResource(CollectedCount),
      totalCollectables: Game.System.readResource(TotalCollectables)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      const focused = resources.focused.get()
      const collectedCount = resources.collectedCount.get()
      const totalCollectables = resources.totalCollectables.get()
      const remaining = Math.max(totalCollectables - collectedCount, 0)

      services.host.hud.stats.textContent = `Collected ${collectedCount}/${totalCollectables}  |  Remaining ${remaining}`
      services.host.hud.prompt.textContent =
        focused.label === null
          ? "Move with WASD or Arrow keys. Reach a relic and press E."
          : `Press E to collect ${focused.label}`
      services.host.hud.hint.textContent =
        remaining === 0
          ? "Every collectable has been picked up. The ECS world is now empty except for the player and walls."
          : "Camera, collision, interaction, and scene sync all stay outside the game loop host and inside ECS systems."
    })
)

const setupSchedule = Game.Schedule.define({
  systems: [SetupWorldSystem, SyncCameraSystem, SyncSceneSystem, SyncHudSystem],
  steps: [
    SetupWorldSystem,
    Game.Schedule.applyDeferred(),
    SyncCameraSystem,
    SyncSceneSystem,
    SyncHudSystem
  ]
})

const updateSchedule = Game.Schedule.define({
  systems: [
    CaptureFrameContextSystem,
    PlanPlayerVelocitySystem,
    MovePlayerSystem,
    UpdateFocusedCollectableSystem,
    CollectFocusedCollectableSystem,
    SyncCameraSystem,
    SyncSceneSystem,
    SyncHudSystem
  ],
  steps: [
    CaptureFrameContextSystem,
    PlanPlayerVelocitySystem,
    MovePlayerSystem,
    UpdateFocusedCollectableSystem,
    CollectFocusedCollectableSystem,
    Game.Schedule.applyDeferred(),
    SyncCameraSystem,
    SyncSceneSystem,
    SyncHudSystem
  ]
})

const createWorldBackdrop = (): Graphics => {
  const backdrop = new Graphics()

  backdrop.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
  backdrop.fill(0x0f1720)

  for (let x = 0; x <= WORLD_WIDTH; x += 120) {
    backdrop.moveTo(x, 0)
    backdrop.lineTo(x, WORLD_HEIGHT)
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += 120) {
    backdrop.moveTo(0, y)
    backdrop.lineTo(WORLD_WIDTH, y)
  }
  backdrop.stroke({
    color: 0x1a2731,
    width: 1
  })

  backdrop.roundRect(14, 14, WORLD_WIDTH - 28, WORLD_HEIGHT - 28, 24)
  backdrop.stroke({
    color: 0x2e4658,
    width: 4
  })

  return backdrop
}

const createHud = (): {
  root: HTMLElement
  refs: HudRefs
} => {
  const root = document.createElement("section")
  root.className = "top-down-hud"

  const badge = document.createElement("div")
  badge.className = "top-down-hud__badge"
  badge.textContent = "bevy-ts proof of concept"

  const title = document.createElement("h1")
  title.className = "top-down-hud__title"
  title.textContent = "Top-down collection run"

  const prompt = document.createElement("p")
  prompt.className = "top-down-hud__prompt"

  const stats = document.createElement("p")
  stats.className = "top-down-hud__stats"

  const hint = document.createElement("p")
  hint.className = "top-down-hud__hint"

  root.appendChild(badge)
  root.appendChild(title)
  root.appendChild(prompt)
  root.appendChild(stats)
  root.appendChild(hint)

  return {
    root,
    refs: {
      prompt,
      stats,
      hint
    }
  }
}

const makeEmptyInputState = (): InputStateValue => ({
  up: false,
  down: false,
  left: false,
  right: false,
  interactPressed: false,
  interactJustPressed: false
})

export const startTopDownExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const application = new Application()
  await application.init({
    antialias: true,
    backgroundAlpha: 0,
    resizeTo: mount
  })

  const shell = document.createElement("section")
  shell.className = "top-down-shell"

  const viewport = document.createElement("div")
  viewport.className = "top-down-shell__viewport"
  viewport.appendChild(application.canvas)

  const hud = createHud()
  shell.appendChild(viewport)
  shell.appendChild(hud.root)
  mount.replaceChildren(shell)

  const world = new Container()
  const actorLayer = new Container()
  world.addChild(createWorldBackdrop())
  world.addChild(actorLayer)
  application.stage.addChild(world)

  const pressedKeys = new Set<string>()
  let previousInteractPressed = false

  const normalizeKey = (key: string): string => {
    if (key.length === 1) {
      return key.toLowerCase()
    }
    return key
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const key = normalizeKey(event.key)
    if (key === " " || key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "w" || key === "a" || key === "s" || key === "d" || key === "e") {
      event.preventDefault()
    }
    pressedKeys.add(key)
  }

  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(normalizeKey(event.key))
  }

  const clearKeys = () => {
    pressedKeys.clear()
    previousInteractPressed = false
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("blur", clearKeys)

  const host: TopDownHostValue = {
    application,
    world,
    actorLayer,
    nodes: new Map<number, Container>(),
    hud: hud.refs,
    clock: {
      deltaSeconds: 1 / 60
    }
  }

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, {
        snapshot() {
          const interactPressed = pressedKeys.has("e") || pressedKeys.has(" ")
          const nextState = {
            up: pressedKeys.has("ArrowUp") || pressedKeys.has("w"),
            down: pressedKeys.has("ArrowDown") || pressedKeys.has("s"),
            left: pressedKeys.has("ArrowLeft") || pressedKeys.has("a"),
            right: pressedKeys.has("ArrowRight") || pressedKeys.has("d"),
            interactPressed,
            interactJustPressed: interactPressed && !previousInteractPressed
          }
          previousInteractPressed = interactPressed
          return nextState
        }
      }),
      Game.Runtime.service(TopDownHost, host)
    ),
    resources: {
      DeltaTime: host.clock.deltaSeconds,
      Viewport: {
        width: application.screen.width,
        height: application.screen.height
      },
      Camera: {
        x: WORLD_WIDTH * 0.5,
        y: WORLD_HEIGHT * 0.5
      },
      InputState: makeEmptyInputState(),
      FocusedCollectable: {
        targetId: null,
        label: null,
        distance: null
      },
      CollectedCount: 0,
      TotalCollectables: pickupLayout.length
    }
  })

  const app = App.makeApp(runtime)
  app.bootstrap(setupSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, MAX_DELTA_SECONDS)
    app.update(updateSchedule)
  }

  application.ticker.add(tick)

  return {
    async destroy() {
      application.ticker.remove(tick)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", clearKeys)

      for (const node of host.nodes.values()) {
        node.destroy({
          children: true
        })
      }

      host.nodes.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

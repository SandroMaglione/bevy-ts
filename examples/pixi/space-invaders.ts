import { Application, Container, Graphics } from "pixi.js"
import * as Matter from "matter-js"

import { Descriptor, Entity, Fx, Schema } from "../../src/index.ts"

interface BrowserExampleHandle {
  destroy(): Promise<void>
}

const MAX_WIDTH = 800
const MAX_HEIGHT = 520
const PLAYER_WIDTH = 40
const PLAYER_HEIGHT = 20
const PLAYER_START_Y = MAX_HEIGHT - PLAYER_HEIGHT - 18
const ENEMY_SIZE = 40
const BULLET_WIDTH = 5
const BULLET_HEIGHT = 10
const ENEMY_SPAWN_COOLDOWN = 100
const SHOOT_COOLDOWN = 300
const MATTER_MAX_STEP_MS = 1000 / 60

const Root = Schema.defineRoot("SpaceInvaders")

type RenderKind = "player" | "enemy" | "bullet"

type RenderBodyValue = {
  kind: RenderKind
  width: number
  height: number
  color: number
  stroke: number
  anchorX: number
  anchorY: number
}

type DescentPatternValue = {
  pattern: (time: number) => { dx: number; dy: number }
}

type PixiHostValue = {
  application: Application
  scene: Container
  nodes: Map<number, Graphics>
  clock: {
    deltaFrames: number
    deltaMilliseconds: number
  }
}

type MatterHostValue = {
  engine: Matter.Engine
  bodies: Map<number, Matter.Body>
}

const Position = Descriptor.Component<{ x: number; y: number }>()("SpaceInvaders/Position")
const Velocity = Descriptor.Component<{ vx: number; vy: number; speed: number }>()("SpaceInvaders/Velocity")
const RenderBody = Descriptor.Component<RenderBodyValue>()("SpaceInvaders/RenderBody")
const Player = Descriptor.Component<{}>()("SpaceInvaders/Player")
const Enemy = Descriptor.Component<{ health: number }>()("SpaceInvaders/Enemy")
const Bullet = Descriptor.Component<{ damage: number }>()("SpaceInvaders/Bullet")
const DescentPattern = Descriptor.Component<DescentPatternValue>()("SpaceInvaders/DescentPattern")

const FrameDelta = Descriptor.Resource<number>()("SpaceInvaders/FrameDelta")
const DeltaMilliseconds = Descriptor.Resource<number>()("SpaceInvaders/DeltaMilliseconds")
const ElapsedFrames = Descriptor.Resource<number>()("SpaceInvaders/ElapsedFrames")
const EnemySpawnProgress = Descriptor.Resource<number>()("SpaceInvaders/EnemySpawnProgress")
const ShootCooldown = Descriptor.Resource<number>()("SpaceInvaders/ShootCooldown")

const DestroyEnemy = Descriptor.Event<{
  bullet: Entity.Handle<typeof Root, typeof Bullet>
  enemy: Entity.Handle<typeof Root, typeof Enemy>
}>()("SpaceInvaders/DestroyEnemy")

const InputManager = Descriptor.Service<{
  readonly isKeyPressed: (keyCode: "ArrowLeft" | "ArrowRight" | "Space") => boolean
}>()("SpaceInvaders/InputManager")

const PixiHost = Descriptor.Service<PixiHostValue>()("SpaceInvaders/PixiHost")
const MatterHost = Descriptor.Service<MatterHostValue>()("SpaceInvaders/MatterHost")

const Game = Schema.bind(
  Schema.fragment({
    components: {
      Position,
      Velocity,
      RenderBody,
      Player,
      Enemy,
      Bullet,
      DescentPattern
    },
    resources: {
      FrameDelta,
      DeltaMilliseconds,
      ElapsedFrames,
      EnemySpawnProgress,
      ShootCooldown
    },
    events: {
      DestroyEnemy
    }
  }),
  Root
)
const schema = Game.schema

const PlayerVelocityQuery = Game.Query({
  selection: {
    player: Game.Query.read(Player),
    velocity: Game.Query.write(Velocity)
  }
})

const PlayerPositionQuery = Game.Query({
  selection: {
    player: Game.Query.read(Player),
    position: Game.Query.read(Position)
  }
})

const MovingQuery = Game.Query({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.read(Velocity)
  }
})

const EnemyDescentQuery = Game.Query({
  selection: {
    enemy: Game.Query.read(Enemy),
    position: Game.Query.write(Position),
    descentPattern: Game.Query.read(DescentPattern)
  }
})

const PlayerClampQuery = Game.Query({
  selection: {
    player: Game.Query.read(Player),
    position: Game.Query.write(Position),
    renderBody: Game.Query.read(RenderBody)
  }
})

const ColliderQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderBody: Game.Query.read(RenderBody)
  }
})

const BulletCollisionQuery = Game.Query({
  selection: {
    bullet: Game.Query.read(Bullet)
  }
})

const EnemyCollisionQuery = Game.Query({
  selection: {
    enemy: Game.Query.read(Enemy)
  }
})

const BulletCullingQuery = Game.Query({
  selection: {
    bullet: Game.Query.read(Bullet),
    position: Game.Query.read(Position)
  }
})

const EnemyCullingQuery = Game.Query({
  selection: {
    enemy: Game.Query.read(Enemy),
    position: Game.Query.read(Position)
  }
})

const AddedRenderableQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderBody: Game.Query.read(RenderBody)
  },
  filters: [Game.Query.added(RenderBody)]
})

const ChangedRenderableTransformQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderBody: Game.Query.read(RenderBody)
  },
  filters: [Game.Query.changed(Position)]
})

const idleVelocity = { vx: 0, vy: 0, speed: 6 } as const
const shootUpVelocity = { vx: 0, vy: -10, speed: 6 } as const

const makePlayerDraft = () =>
  Game.Command.spawnWith(
    [Position, { x: 400, y: PLAYER_START_Y }],
    [Velocity, idleVelocity],
    [RenderBody, {
      kind: "player",
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      color: 0xf7c948,
      stroke: 0xffefb8,
      anchorX: 0.5,
      anchorY: 0
    }],
    [Player, {}]
  )

const makeBulletDraft = (position: { x: number; y: number }) =>
  Game.Command.spawnWith(
    [Position, position],
    [Velocity, shootUpVelocity],
    [RenderBody, {
      kind: "bullet",
      width: BULLET_WIDTH,
      height: BULLET_HEIGHT,
      color: 0xf5f5f5,
      stroke: 0xffffff,
      anchorX: 0.5,
      anchorY: 0.5
    }],
    [Bullet, { damage: 10 }]
  )

const makeEnemyDraft = (position: { x: number; y: number }, pattern: DescentPatternValue) =>
  Game.Command.spawnWith(
    [Position, position],
    [RenderBody, {
      kind: "enemy",
      width: ENEMY_SIZE,
      height: ENEMY_SIZE,
      color: 0x4ecb71,
      stroke: 0xb7ffcb,
      anchorX: 0.5,
      anchorY: 0.5
    }],
    [Enemy, { health: 3 }],
    [DescentPattern, pattern]
  )

const DescentPatterns = {
  sin: (amplitude: number, frequency: number, speed: number): DescentPatternValue => ({
    pattern: (time: number) => ({
      dx: Math.sin(time * frequency) * amplitude,
      dy: speed
    })
  }),
  oscillatingArc: (amplitude: number, frequency: number, speed: number): DescentPatternValue => ({
    pattern: (time: number) => ({
      dx: Math.cos(time * frequency) * amplitude,
      dy: speed
    })
  }),
  zigZag: {
    pattern: (time: number) => ({
      dx: Math.sin(time * 0.05) > 0 ? 2 : -2,
      dy: 1
    })
  } satisfies DescentPatternValue,
  fastDown: {
    pattern: (time: number) => ({
      dx: 0,
      dy: 1 + time * 0.001
    })
  } satisfies DescentPatternValue,
  spiral: (radiusStep: number, angularSpeed: number, speed: number): DescentPatternValue => ({
    pattern: (time: number) => {
      const angle = time * angularSpeed
      return {
        dx: Math.cos(angle) * radiusStep,
        dy: Math.sin(angle) * radiusStep + speed
      }
    }
  })
} as const

const randomEnemyPattern = (): DescentPatternValue => {
  const roll = Math.random()
  if (roll < 0.15) {
    return DescentPatterns.zigZag
  }
  if (roll < 0.3) {
    return DescentPatterns.sin(Math.random() * 2 + 2, 0.1, 0.5)
  }
  if (roll < 0.45) {
    return DescentPatterns.oscillatingArc(Math.random() * 2 + 2, 0.05, 0.25)
  }
  if (roll < 0.6) {
    return DescentPatterns.spiral(Math.random() * 2 + 2, 0.05, 0.25)
  }
  return DescentPatterns.fastDown
}

const bodyCenterFromPosition = (
  position: { x: number; y: number },
  renderBody: RenderBodyValue
) => ({
  x: position.x + renderBody.width * (0.5 - renderBody.anchorX),
  y: position.y + renderBody.height * (0.5 - renderBody.anchorY)
})

const destroyPixiNode = (
  entityId: Entity.EntityId<typeof schema>,
  pixi: PixiHostValue
) => {
  const node = pixi.nodes.get(entityId.value)
  if (!node) {
    return
  }

  pixi.scene.removeChild(node)
  node.destroy()
  pixi.nodes.delete(entityId.value)
}

const ensureMatterBody = (
  entityId: Entity.EntityId<typeof schema>,
  position: { x: number; y: number },
  renderBody: RenderBodyValue,
  matter: MatterHostValue
): Matter.Body => {
  const existing = matter.bodies.get(entityId.value)
  if (existing) {
    return existing
  }

  const center = bodyCenterFromPosition(position, renderBody)
  const body = Matter.Bodies.rectangle(
    center.x,
    center.y,
    renderBody.width,
    renderBody.height,
    { isSensor: true }
  )
  Matter.World.add(matter.engine.world, body)
  matter.bodies.set(entityId.value, body)
  return body
}

const destroyMatterBody = (
  entityId: Entity.EntityId<typeof schema>,
  matter: MatterHostValue
) => {
  const body = matter.bodies.get(entityId.value)
  if (!body) {
    return
  }

  Matter.World.remove(matter.engine.world, body)
  matter.bodies.delete(entityId.value)
}

const renderBackdrop = (): Container => {
  const backdrop = new Container()

  const panel = new Graphics()
  panel.roundRect(0, 0, MAX_WIDTH, MAX_HEIGHT, 28)
  panel.fill(0x091017)
  panel.stroke({
    color: 0x24303b,
    width: 2
  })
  backdrop.addChild(panel)

  const horizon = new Graphics()
  horizon.rect(0, MAX_HEIGHT - 76, MAX_WIDTH, 76)
  horizon.fill(0x101922)
  horizon.stroke({
    color: 0x2d4052,
    width: 1
  })
  backdrop.addChild(horizon)

  for (let index = 0; index < 48; index += 1) {
    const star = new Graphics()
    const size = index % 3 === 0 ? 2.4 : 1.4
    star.circle(0, 0, size)
    star.fill(index % 5 === 0 ? 0xf7c948 : 0xc8e6ff)
    star.alpha = index % 5 === 0 ? 0.9 : 0.55
    star.position.set(
      ((index * 137) % (MAX_WIDTH - 40)) + 20,
      ((index * 89) % 300) + 20
    )
    backdrop.addChild(star)
  }

  return backdrop
}

const createNode = (renderBody: RenderBodyValue): Graphics => {
  const node = new Graphics()

  if (renderBody.kind === "player") {
    node.roundRect(0, 0, renderBody.width, renderBody.height, 8)
    node.fill(renderBody.color)
    node.stroke({
      color: renderBody.stroke,
      width: 2
    })

    node.moveTo(renderBody.width * 0.5 - 7, 0)
    node.lineTo(renderBody.width * 0.5, -10)
    node.lineTo(renderBody.width * 0.5 + 7, 0)
    node.fill(renderBody.color)
  } else if (renderBody.kind === "enemy") {
    node.roundRect(0, 0, renderBody.width, renderBody.height, 10)
    node.fill(renderBody.color)
    node.stroke({
      color: renderBody.stroke,
      width: 2
    })

    node.circle(renderBody.width * 0.3, renderBody.height * 0.35, 3)
    node.circle(renderBody.width * 0.7, renderBody.height * 0.35, 3)
    node.fill(0x091017)
    node.rect(renderBody.width * 0.2, renderBody.height * 0.68, renderBody.width * 0.6, 4)
    node.fill(0x091017)
  } else {
    node.roundRect(0, 0, renderBody.width, renderBody.height, 3)
    node.fill(renderBody.color)
    node.stroke({
      color: renderBody.stroke,
      width: 1
    })
  }

  node.pivot.set(renderBody.width * renderBody.anchorX, renderBody.height * renderBody.anchorY)
  return node
}

const SpawnPlayerSystem = Game.System(
  "SpaceInvaders/SpawnPlayer",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      commands.spawn(makePlayerDraft())
    })
)

const CaptureFrameInputSystem = Game.System(
  "SpaceInvaders/CaptureFrameInput",
  {
    resources: {
      frameDelta: Game.System.writeResource(FrameDelta),
      deltaMilliseconds: Game.System.writeResource(DeltaMilliseconds),
      elapsedFrames: Game.System.writeResource(ElapsedFrames)
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      resources.frameDelta.set(services.pixi.clock.deltaFrames)
      resources.deltaMilliseconds.set(services.pixi.clock.deltaMilliseconds)
      resources.elapsedFrames.update((elapsed) => elapsed + services.pixi.clock.deltaFrames)
    })
)

const PlayerInputSystem = Game.System(
  "SpaceInvaders/PlayerInput",
  {
    queries: {
      player: PlayerVelocityQuery
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      player.value.data.velocity.update((velocity) => ({
        ...velocity,
        vx: services.input.isKeyPressed("ArrowLeft")
          ? -velocity.speed
          : services.input.isKeyPressed("ArrowRight")
            ? velocity.speed
            : 0
      }))
    })
)

const ShootingSystem = Game.System(
  "SpaceInvaders/Shooting",
  {
    queries: {
      player: PlayerPositionQuery
    },
    resources: {
      deltaMilliseconds: Game.System.readResource(DeltaMilliseconds),
      shootCooldown: Game.System.writeResource(ShootCooldown)
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ queries, resources, services, commands }) =>
    Fx.sync(() => {
      resources.shootCooldown.update((cooldown) =>
        Math.max(0, cooldown - resources.deltaMilliseconds.get())
      )

      const player = queries.player.singleOptional()
      if (!player.ok || !player.value || !services.input.isKeyPressed("Space")) {
        return
      }

      if (resources.shootCooldown.get() > 0) {
        return
      }

      const position = player.value.data.position.get()
      commands.spawn(
        makeBulletDraft({
          x: position.x,
          y: position.y - 10
        })
      )
      resources.shootCooldown.set(SHOOT_COOLDOWN)
    })
)

const EnemySpawnSystem = Game.System(
  "SpaceInvaders/EnemySpawn",
  {
    resources: {
      frameDelta: Game.System.readResource(FrameDelta),
      enemySpawnProgress: Game.System.writeResource(EnemySpawnProgress)
    }
  },
  ({ resources, commands }) =>
    Fx.sync(() => {
      resources.enemySpawnProgress.update((progress) => progress + resources.frameDelta.get())
      if (resources.enemySpawnProgress.get() < ENEMY_SPAWN_COOLDOWN) {
        return
      }

      resources.enemySpawnProgress.set(0)
      commands.spawn(
        makeEnemyDraft(
          {
            x: Math.random() * (MAX_WIDTH - 100),
            y: 0
          },
          randomEnemyPattern()
        )
      )
    })
)

const MovementSystem = Game.System(
  "SpaceInvaders/Movement",
  {
    queries: {
      moving: MovingQuery
    },
    resources: {
      frameDelta: Game.System.readResource(FrameDelta)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const delta = resources.frameDelta.get()
      for (const match of queries.moving.each()) {
        const velocity = match.data.velocity.get()
        match.data.position.update((position) => ({
          x: position.x + velocity.vx * delta,
          y: position.y + velocity.vy * delta
        }))
      }
    })
)

const ClampPlayerBoundsSystem = Game.System(
  "SpaceInvaders/ClampPlayerBounds",
  {
    queries: {
      player: PlayerClampQuery
    }
  },
  ({ queries }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const renderBody = player.value.data.renderBody.get()
      const minX = renderBody.width * renderBody.anchorX
      const maxX = MAX_WIDTH - renderBody.width * (1 - renderBody.anchorX)

      player.value.data.position.update((position) => ({
        x: Math.min(maxX, Math.max(minX, position.x)),
        y: position.y
      }))
    })
)

const EnemyDescentSystem = Game.System(
  "SpaceInvaders/EnemyDescent",
  {
    queries: {
      enemies: EnemyDescentQuery
    },
    resources: {
      frameDelta: Game.System.readResource(FrameDelta),
      elapsedFrames: Game.System.readResource(ElapsedFrames)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const delta = resources.frameDelta.get()
      const elapsed = resources.elapsedFrames.get()

      for (const match of queries.enemies.each()) {
        const { dx, dy } = match.data.descentPattern.get().pattern(elapsed)
        match.data.position.update((position) => ({
          x: Math.min(MAX_WIDTH - 20, Math.max(20, position.x + dx * delta)),
          y: position.y + dy * delta
        }))
      }
    })
)

const CreateMatterBodiesSystem = Game.System(
  "SpaceInvaders/CreateMatterBodies",
  {
    queries: {
      addedRenderables: AddedRenderableQuery
    },
    services: {
      matter: Game.System.service(MatterHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.addedRenderables.each()) {
        ensureMatterBody(
          match.entity.id,
          match.data.position.get(),
          match.data.renderBody.get(),
          services.matter
        )
      }
    })
)

const SyncMatterBodyTransformsSystem = Game.System(
  "SpaceInvaders/SyncMatterBodyTransforms",
  {
    queries: {
      colliders: ColliderQuery
    },
    resources: {
      deltaMilliseconds: Game.System.readResource(DeltaMilliseconds)
    },
    services: {
      matter: Game.System.service(MatterHost)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      Matter.Engine.update(
        services.matter.engine,
        Math.min(resources.deltaMilliseconds.get(), MATTER_MAX_STEP_MS)
      )

      for (const match of queries.colliders.each()) {
        const body = ensureMatterBody(
          match.entity.id,
          match.data.position.get(),
          match.data.renderBody.get(),
          services.matter
        )
        const center = bodyCenterFromPosition(
          match.data.position.get(),
          match.data.renderBody.get()
        )
        Matter.Body.setPosition(body, center)
      }
    })
)

const DestroyMatterBodiesSystem = Game.System(
  "SpaceInvaders/DestroyMatterBodies",
  {
    removed: {
      renderables: Game.System.readRemoved(RenderBody)
    },
    despawned: {
      entities: Game.System.readDespawned()
    },
    services: {
      matter: Game.System.service(MatterHost)
    }
  },
  ({ removed, despawned, services }) =>
    Fx.sync(() => {
      for (const entityId of removed.renderables.all()) {
        destroyMatterBody(entityId, services.matter)
      }

      for (const entityId of despawned.entities.all()) {
        destroyMatterBody(entityId, services.matter)
      }
    })
)

const EnemyBulletCollisionSystem = Game.System(
  "SpaceInvaders/EnemyBulletCollision",
  {
    queries: {
      bullets: BulletCollisionQuery,
      enemies: EnemyCollisionQuery
    },
    events: {
      destroyEnemy: Game.System.writeEvent(DestroyEnemy)
    },
    services: {
      matter: Game.System.service(MatterHost)
    }
  },
  ({ queries, events, services }) =>
    Fx.sync(() => {
      const consumedBullets = new Set<number>()
      const consumedEnemies = new Set<number>()

      for (const bullet of queries.bullets.each()) {
        const bulletId = bullet.entity.id
        if (consumedBullets.has(bulletId.value)) {
          continue
        }

        const bulletBody = services.matter.bodies.get(bulletId.value)
        if (!bulletBody) {
          continue
        }

        for (const enemy of queries.enemies.each()) {
          const enemyId = enemy.entity.id
          if (consumedEnemies.has(enemyId.value)) {
            continue
          }

          const enemyBody = services.matter.bodies.get(enemyId.value)
          if (!enemyBody) {
            continue
          }

          if (Matter.Collision.collides(bulletBody, enemyBody)?.collided ?? false) {
            consumedBullets.add(bulletId.value)
            consumedEnemies.add(enemyId.value)
            // The destroy event is read only after updateEvents(), so emit
            // storage-safe handles and re-resolve them later.
            events.destroyEnemy.emit({
              bullet: Game.Entity.handleAs(Bullet, bulletId),
              enemy: Game.Entity.handleAs(Enemy, enemyId)
            })
            break
          }
        }
      }
    })
)

const EnemyDestroySystem = Game.System(
  "SpaceInvaders/EnemyDestroy",
  {
    events: {
      destroyEnemy: Game.System.readEvent(DestroyEnemy)
    }
  },
  ({ events, commands, lookup }) =>
    Fx.sync(() => {
      const despawned = new Set<number>()

      for (const event of events.destroyEnemy.all()) {
        // The event is readable now, but either entity may already be stale.
        // Re-resolution keeps that failure explicit and typed.
        const bullet = lookup.getHandle(event.bullet, BulletCollisionQuery)
        if (bullet.ok && !despawned.has(bullet.value.entity.id.value)) {
          commands.despawn(bullet.value.entity.id)
          despawned.add(bullet.value.entity.id.value)
        }

        const enemy = lookup.getHandle(event.enemy, EnemyCollisionQuery)
        if (enemy.ok && !despawned.has(enemy.value.entity.id.value)) {
          commands.despawn(enemy.value.entity.id)
          despawned.add(enemy.value.entity.id.value)
        }
      }
    })
)

const CullingSystem = Game.System(
  "SpaceInvaders/Culling",
  {
    queries: {
      bullets: BulletCullingQuery,
      enemies: EnemyCullingQuery
    }
  },
  ({ queries, commands }) =>
    Fx.sync(() => {
      for (const match of queries.bullets.each()) {
        if (match.data.position.get().y >= -40) {
          continue
        }

        commands.despawn(match.entity.id)
      }

      for (const match of queries.enemies.each()) {
        if (match.data.position.get().y <= MAX_HEIGHT + 80) {
          continue
        }

        commands.despawn(match.entity.id)
      }
    })
)

const CreatePixiNodesSystem = Game.System(
  "SpaceInvaders/CreatePixiNodes",
  {
    queries: {
      addedRenderables: AddedRenderableQuery
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.addedRenderables.each()) {
        const entityId = match.entity.id.value
        let node = services.pixi.nodes.get(entityId)
        if (!node) {
          node = createNode(match.data.renderBody.get())
          services.pixi.scene.addChild(node)
          services.pixi.nodes.set(entityId, node)
        }

        const position = match.data.position.get()
        node.position.set(position.x, position.y)
      }
    })
)

const SyncPixiTransformsSystem = Game.System(
  "SpaceInvaders/SyncPixiTransforms",
  {
    queries: {
      movedRenderables: ChangedRenderableTransformQuery
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.movedRenderables.each()) {
        const entityId = match.entity.id.value
        let node = services.pixi.nodes.get(entityId)
        if (!node) {
          node = createNode(match.data.renderBody.get())
          services.pixi.scene.addChild(node)
          services.pixi.nodes.set(entityId, node)
        }

        const position = match.data.position.get()
        node.position.set(position.x, position.y)
      }
    })
)

const DestroyPixiNodesSystem = Game.System(
  "SpaceInvaders/DestroyPixiNodes",
  {
    removed: {
      renderables: Game.System.readRemoved(RenderBody)
    },
    despawned: {
      entities: Game.System.readDespawned()
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ removed, despawned, services }) =>
    Fx.sync(() => {
      for (const entityId of removed.renderables.all()) {
        destroyPixiNode(entityId, services.pixi)
      }

      for (const entityId of despawned.entities.all()) {
        destroyPixiNode(entityId, services.pixi)
      }
    })
)

const gameplaySetupSchedule = Game.Schedule(SpawnPlayerSystem)

const setupSchedule = Game.Schedule(
  gameplaySetupSchedule,
  CreateMatterBodiesSystem,
  CreatePixiNodesSystem
)

const updateSchedule = Game.Schedule(
  CaptureFrameInputSystem,
  PlayerInputSystem,
  ShootingSystem,
  EnemySpawnSystem,
  Game.Schedule.applyDeferred(),
  Game.Schedule.updateLifecycle(),
  CreateMatterBodiesSystem,
  CreatePixiNodesSystem,
  MovementSystem,
  ClampPlayerBoundsSystem,
  EnemyDescentSystem,
  SyncMatterBodyTransformsSystem,
  EnemyBulletCollisionSystem,
  // DestroyEnemy becomes readable only after this explicit event boundary.
  Game.Schedule.updateEvents(),
  EnemyDestroySystem,
  CullingSystem,
  Game.Schedule.applyDeferred(),
  Game.Schedule.updateLifecycle(),
  DestroyMatterBodiesSystem,
  DestroyPixiNodesSystem,
  SyncPixiTransformsSystem
)

export const startSpaceInvadersExample = async (
  mount: HTMLElement
): Promise<BrowserExampleHandle> => {
  const application = new Application()
  await application.init({
    antialias: true,
    background: "#05080c",
    width: MAX_WIDTH,
    height: MAX_HEIGHT
  })

  const wrapper = document.createElement("section")
  wrapper.className = "pixi-example-shell"
  wrapper.appendChild(application.canvas)
  mount.replaceChildren(wrapper)

  const scene = new Container()
  application.stage.addChild(renderBackdrop())
  application.stage.addChild(scene)

  const keyStates = new Map<string, boolean>()

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "Space") {
      event.preventDefault()
      keyStates.set(event.code, true)
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "Space") {
      event.preventDefault()
      keyStates.set(event.code, false)
    }
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)

  const pixiHost: PixiHostValue = {
    application,
    scene,
    nodes: new Map<number, Graphics>(),
    clock: {
      deltaFrames: 1,
      deltaMilliseconds: 1000 / 60
    }
  }

  const matterHost: MatterHostValue = {
    engine: Matter.Engine.create({
      gravity: { scale: 0 }
    }),
    bodies: new Map<number, Matter.Body>()
  }

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, {
        isKeyPressed(keyCode) {
          return keyStates.get(keyCode) ?? false
        }
      }),
      Game.Runtime.service(PixiHost, pixiHost),
      Game.Runtime.service(MatterHost, matterHost)
    ),
    resources: {
      FrameDelta: pixiHost.clock.deltaFrames,
      DeltaMilliseconds: pixiHost.clock.deltaMilliseconds,
      ElapsedFrames: 0,
      EnemySpawnProgress: ENEMY_SPAWN_COOLDOWN,
      ShootCooldown: 0
    }
  })

  runtime.initialize(setupSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    pixiHost.clock.deltaMilliseconds = ticker.deltaMS
    pixiHost.clock.deltaFrames = ticker.deltaMS / (1000 / 60)
    runtime.runSchedule(updateSchedule)
  }

  application.ticker.add(tick)

  return {
    async destroy() {
      application.ticker.remove(tick)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)

      for (const node of pixiHost.nodes.values()) {
        scene.removeChild(node)
        node.destroy()
      }
      pixiHost.nodes.clear()

      for (const body of matterHost.bodies.values()) {
        Matter.World.remove(matterHost.engine.world, body)
      }
      matterHost.bodies.clear()
      Matter.Engine.clear(matterHost.engine)

      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

import { Application, Container, Graphics } from "pixi.js"
import * as Matter from "matter-js"

import { App, Descriptor, Entity, Fx, Schema } from "../index.ts"
import type { BrowserExampleHandle } from "./pixi.ts"

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

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("SpaceInvaders/Position")
const Velocity = Descriptor.defineComponent<{ vx: number; vy: number; speed: number }>()("SpaceInvaders/Velocity")
const RenderBody = Descriptor.defineComponent<{
  kind: RenderKind
  width: number
  height: number
  color: number
  stroke: number
  anchorX: number
  anchorY: number
}>()("SpaceInvaders/RenderBody")
const Player = Descriptor.defineComponent<{}>()("SpaceInvaders/Player")
const Enemy = Descriptor.defineComponent<{ health: number }>()("SpaceInvaders/Enemy")
const Bullet = Descriptor.defineComponent<{ damage: number }>()("SpaceInvaders/Bullet")
const DescentPattern = Descriptor.defineComponent<{
  pattern: (time: number) => { dx: number; dy: number }
}>()("SpaceInvaders/DescentPattern")

const FrameDelta = Descriptor.defineResource<number>()("SpaceInvaders/FrameDelta")
const DeltaMilliseconds = Descriptor.defineResource<number>()("SpaceInvaders/DeltaMilliseconds")
const ElapsedFrames = Descriptor.defineResource<number>()("SpaceInvaders/ElapsedFrames")
const EnemySpawnProgress = Descriptor.defineResource<number>()("SpaceInvaders/EnemySpawnProgress")
const ShootCooldown = Descriptor.defineResource<number>()("SpaceInvaders/ShootCooldown")

const DestroyEnemy = Descriptor.defineEvent<{
  bullet: Entity.Handle<typeof Root, typeof Bullet>
  enemy: Entity.Handle<typeof Root, typeof Enemy>
}>()("SpaceInvaders/DestroyEnemy")

const InputManager = Descriptor.defineService<{
  readonly isKeyPressed: (keyCode: "ArrowLeft" | "ArrowRight" | "Space") => boolean
}>()("SpaceInvaders/InputManager")
const PixiHost = Descriptor.defineService<{
  readonly application: Application
  readonly scene: Container
  readonly nodes: Map<number, Graphics>
  readonly clock: {
    deltaFrames: number
    deltaMilliseconds: number
  }
}>()("SpaceInvaders/PixiHost")
const MatterHost = Descriptor.defineService<{
  readonly engine: Matter.Engine
  readonly bodies: Map<number, Matter.Body>
}>()("SpaceInvaders/MatterHost")

const schema = Schema.build(
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
  })
)
const Game = Schema.bind(schema, Root)

const playerVelocityQuery = Game.Query.define({
  selection: {
    player: Game.Query.read(Player),
    velocity: Game.Query.write(Velocity)
  }
})

const playerPositionQuery = Game.Query.define({
  selection: {
    player: Game.Query.read(Player),
    position: Game.Query.read(Position)
  }
})

const movingQuery = Game.Query.define({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.read(Velocity)
  }
})

const enemyDescentQuery = Game.Query.define({
  selection: {
    enemy: Game.Query.read(Enemy),
    position: Game.Query.write(Position),
    descentPattern: Game.Query.read(DescentPattern)
  }
})

const bodySyncQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    renderBody: Game.Query.read(RenderBody)
  }
})

const enemyCollisionQuery = Game.Query.define({
  selection: {
    enemy: Game.Query.read(Enemy),
    renderBody: Game.Query.read(RenderBody)
  }
})

const bulletCollisionQuery = Game.Query.define({
  selection: {
    bullet: Game.Query.read(Bullet),
    renderBody: Game.Query.read(RenderBody)
  }
})

const renderQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    renderBody: Game.Query.read(RenderBody)
  }
})

const enemyCullingQuery = Game.Query.define({
  selection: {
    enemy: Game.Query.read(Enemy),
    position: Game.Query.read(Position),
    renderBody: Game.Query.read(RenderBody)
  }
})

const bulletCullingQuery = Game.Query.define({
  selection: {
    bullet: Game.Query.read(Bullet),
    position: Game.Query.read(Position),
    renderBody: Game.Query.read(RenderBody)
  }
})

const bulletEntityQuery = Game.Query.define({
  selection: {
    bullet: Game.Query.read(Bullet)
  }
})

const enemyEntityQuery = Game.Query.define({
  selection: {
    enemy: Game.Query.read(Enemy)
  }
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

const removeEntityArtifacts = (
  entityId: Entity.EntityId<typeof schema>,
  pixi: PixiHostValue,
  matter: MatterHostValue
) => {
  const node = pixi.nodes.get(entityId.value)
  if (node) {
    node.destroy()
    pixi.nodes.delete(entityId.value)
  }

  const body = matter.bodies.get(entityId.value)
  if (body) {
    Matter.World.remove(matter.engine.world, body)
    matter.bodies.delete(entityId.value)
  }
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

const SetupSystem = Game.System.define(
  "SpaceInvaders/Setup",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      commands.spawn(makePlayerDraft())
    })
)

const CaptureFrameInputSystem = Game.System.define(
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

const PlayerInputSystem = Game.System.define(
  "SpaceInvaders/PlayerInput",
  {
    queries: {
      player: playerVelocityQuery
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const velocity = player.value.data.velocity.get()
      if (services.input.isKeyPressed("ArrowLeft")) {
        player.value.data.velocity.set({
          ...velocity,
          vx: -velocity.speed
        })
      } else if (services.input.isKeyPressed("ArrowRight")) {
        player.value.data.velocity.set({
          ...velocity,
          vx: velocity.speed
        })
      } else if (velocity.vx !== 0) {
        player.value.data.velocity.set({
          ...velocity,
          vx: 0
        })
      }
    })
)

const ShootingSystem = Game.System.define(
  "SpaceInvaders/Shooting",
  {
    queries: {
      player: playerPositionQuery
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

      const player = queries.player.single()
      if (!player.ok || !services.input.isKeyPressed("Space")) {
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

const EnemySpawnSystem = Game.System.define(
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

const MovementSystem = Game.System.define(
  "SpaceInvaders/Movement",
  {
    queries: {
      moving: movingQuery
    },
    resources: {
      frameDelta: Game.System.readResource(FrameDelta)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const delta = resources.frameDelta.get()
      for (const match of queries.moving.each()) {
        const position = match.data.position.get()
        const velocity = match.data.velocity.get()
        match.data.position.set({
          x: position.x + velocity.vx * delta,
          y: position.y + velocity.vy * delta
        })
      }
    })
)

const ClampPlayerBoundsSystem = Game.System.define(
  "SpaceInvaders/ClampPlayerBounds",
  {
    queries: {
      player: Game.Query.define({
        selection: {
          player: Game.Query.read(Player),
          position: Game.Query.write(Position),
          renderBody: Game.Query.read(RenderBody)
        }
      })
    }
  },
  ({ queries }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const position = player.value.data.position.get()
      const renderBody = player.value.data.renderBody.get()
      const minX = renderBody.width * renderBody.anchorX
      const maxX = MAX_WIDTH - renderBody.width * (1 - renderBody.anchorX)
      player.value.data.position.set({
        x: Math.min(maxX, Math.max(minX, position.x)),
        y: position.y
      })
    })
)

const EnemyDescentSystem = Game.System.define(
  "SpaceInvaders/EnemyDescent",
  {
    queries: {
      enemies: enemyDescentQuery
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
        const position = match.data.position.get()
        const { dx, dy } = match.data.descentPattern.get().pattern(elapsed)
        match.data.position.set({
          x: Math.min(MAX_WIDTH - 20, Math.max(20, position.x + dx * delta)),
          y: position.y + dy * delta
        })
      }
    })
)

const SyncMatterBodiesSystem = Game.System.define(
  "SpaceInvaders/SyncMatterBodies",
  {
    queries: {
      colliders: bodySyncQuery
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

      const seen = new Set<number>()
      for (const match of queries.colliders.each()) {
        const entityId = match.entity.id.value
        const position = match.data.position.get()
        const renderBody = match.data.renderBody.get()
        const center = bodyCenterFromPosition(position, renderBody)

        let body = services.matter.bodies.get(entityId)
        if (!body) {
          body = Matter.Bodies.rectangle(
            center.x,
            center.y,
            renderBody.width,
            renderBody.height,
            { isSensor: true }
          )
          Matter.World.add(services.matter.engine.world, body)
          services.matter.bodies.set(entityId, body)
        } else {
          Matter.Body.setPosition(body, center)
        }

        seen.add(entityId)
      }

      for (const [entityId, body] of services.matter.bodies) {
        if (seen.has(entityId)) {
          continue
        }
        Matter.World.remove(services.matter.engine.world, body)
        services.matter.bodies.delete(entityId)
      }
    })
)

const EnemyBulletCollisionSystem = Game.System.define(
  "SpaceInvaders/EnemyBulletCollision",
  {
    queries: {
      bullets: bulletCollisionQuery,
      enemies: enemyCollisionQuery
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
        const bulletId = bullet.entity.id.value
        if (consumedBullets.has(bulletId)) {
          continue
        }

        const bulletBody = services.matter.bodies.get(bulletId)
        if (!bulletBody) {
          continue
        }

        for (const enemy of queries.enemies.each()) {
          const enemyId = enemy.entity.id.value
          if (consumedEnemies.has(enemyId)) {
            continue
          }

          const enemyBody = services.matter.bodies.get(enemyId)
          if (!enemyBody) {
            continue
          }

          if (Matter.Collision.collides(bulletBody, enemyBody)?.collided ?? false) {
            consumedBullets.add(bulletId)
            consumedEnemies.add(enemyId)
            events.destroyEnemy.emit({
              bullet: Game.Entity.handleAs(Bullet, bullet.entity.id),
              enemy: Game.Entity.handleAs(Enemy, enemy.entity.id)
            })
            break
          }
        }
      }
    })
)

const EnemyDestroySystem = Game.System.define(
  "SpaceInvaders/EnemyDestroy",
  {
    events: {
      destroyEnemy: Game.System.readEvent(DestroyEnemy)
    },
    services: {
      pixi: Game.System.service(PixiHost),
      matter: Game.System.service(MatterHost)
    }
  },
  ({ events, services, commands, lookup }) =>
    Fx.sync(() => {
      const despawned = new Set<number>()
      for (const event of events.destroyEnemy.all()) {
        const bulletEntity = lookup.getHandle(event.bullet, bulletEntityQuery)
        const enemyEntity = lookup.getHandle(event.enemy, enemyEntityQuery)

        if (!bulletEntity.ok || !enemyEntity.ok) {
          continue
        }

        const bulletId = bulletEntity.value.entity.id
        const enemyId = enemyEntity.value.entity.id

        if (!despawned.has(bulletId.value)) {
          removeEntityArtifacts(bulletId, services.pixi, services.matter)
          commands.despawn(bulletId)
          despawned.add(bulletId.value)
        }

        if (!despawned.has(enemyId.value)) {
          removeEntityArtifacts(enemyId, services.pixi, services.matter)
          commands.despawn(enemyId)
          despawned.add(enemyId.value)
        }
      }
    })
)

const CullingSystem = Game.System.define(
  "SpaceInvaders/Culling",
  {
    queries: {
      bullets: bulletCullingQuery,
      enemies: enemyCullingQuery
    },
    services: {
      pixi: Game.System.service(PixiHost),
      matter: Game.System.service(MatterHost)
    }
  },
  ({ queries, services, commands }) =>
    Fx.sync(() => {
      for (const match of queries.bullets.each()) {
        const position = match.data.position.get()
        if (position.y >= -40) {
          continue
        }

        removeEntityArtifacts(match.entity.id, services.pixi, services.matter)
        commands.despawn(match.entity.id)
      }

      for (const match of queries.enemies.each()) {
        const position = match.data.position.get()
        if (position.y <= MAX_HEIGHT + 80) {
          continue
        }

        removeEntityArtifacts(match.entity.id, services.pixi, services.matter)
        commands.despawn(match.entity.id)
      }
    })
)

const SyncPixiSceneSystem = Game.System.define(
  "SpaceInvaders/SyncPixiScene",
  {
    queries: {
      renderables: renderQuery
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const seen = new Set<number>()

      for (const match of queries.renderables.each()) {
        const entityId = match.entity.id.value
        const position = match.data.position.get()
        const renderBody = match.data.renderBody.get()

        let node = services.pixi.nodes.get(entityId)
        if (!node) {
          node = createNode(renderBody)
          services.pixi.scene.addChild(node)
          services.pixi.nodes.set(entityId, node)
        }

        node.position.set(position.x, position.y)
        seen.add(entityId)
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
  systems: [SetupSystem, SyncMatterBodiesSystem, SyncPixiSceneSystem],
  steps: [
    SetupSystem,
    Game.Schedule.applyDeferred(),
    SyncMatterBodiesSystem,
    SyncPixiSceneSystem
  ]
})

const updateSchedule = Game.Schedule.define({
  systems: [
    CaptureFrameInputSystem,
    PlayerInputSystem,
    ShootingSystem,
    EnemySpawnSystem,
    MovementSystem,
    ClampPlayerBoundsSystem,
    EnemyDescentSystem,
    SyncMatterBodiesSystem,
    EnemyBulletCollisionSystem,
    EnemyDestroySystem,
    CullingSystem,
    SyncPixiSceneSystem
  ],
  steps: [
    CaptureFrameInputSystem,
    PlayerInputSystem,
    ShootingSystem,
    EnemySpawnSystem,
    Game.Schedule.applyDeferred(),
    MovementSystem,
    ClampPlayerBoundsSystem,
    EnemyDescentSystem,
    SyncMatterBodiesSystem,
    EnemyBulletCollisionSystem,
    Game.Schedule.updateEvents(),
    EnemyDestroySystem,
    CullingSystem,
    Game.Schedule.applyDeferred(),
    SyncPixiSceneSystem
  ]
})

export const startSpaceInvadersExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
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

  const pixiHost = {
    application,
    scene,
    nodes: new Map<number, Graphics>(),
    clock: {
      deltaFrames: 1,
      deltaMilliseconds: 1000 / 60
    }
  }

  const matterHost = {
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

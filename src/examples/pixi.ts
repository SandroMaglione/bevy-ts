import { Application, Sprite, Texture } from "pixi.js"

import { App, Descriptor, Fx, Label, Schema } from "../index.ts"

export interface BrowserExampleHandle {
  destroy(): Promise<void>
}

// ECS-owned simulation data.
const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const Renderable = Descriptor.defineComponent<{ size: number }>()("Renderable")
const Tint = Descriptor.defineComponent<{ value: number }>()("Tint")

// Per-frame world data captured from the host renderer.
const DeltaTime = Descriptor.defineResource<number>()("DeltaTime")
const Viewport = Descriptor.defineResource<{ width: number; height: number }>()("Viewport")

// Coarse simulation lifecycle state.
const SimulationPhase = Descriptor.defineState<"Booting" | "Running">()("SimulationPhase")

// Host-side renderer bridge. ECS owns simulation state; Pixi owns renderer objects.
const PixiHost = Descriptor.defineService<{
  readonly application: Application
  readonly sprites: Map<number, Sprite>
  readonly clock: {
    deltaSeconds: number
  }
}>()("PixiHost")

const pixiSchema = Schema.fragment({
  components: {
    Position,
    Velocity,
    Renderable,
    Tint
  },
  resources: {
    DeltaTime,
    Viewport
  },
  states: {
    SimulationPhase
  }
})

const schema = Schema.build(pixiSchema)
const Game = Schema.bind(schema)

const SetupSceneSystem = Game.System.define(
  "SetupSceneSystem",
  {
    states: {
      phase: Game.System.writeState(SimulationPhase)
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ commands, services, states }) =>
    Fx.sync(() => {
      if (states.phase.get() === "Running") {
        return
      }

      const { width, height } = services.pixi.application.screen
      const palette = [0xff6b35, 0xf7c948, 0x4ecdc4, 0x2d6cdf, 0xf25f5c, 0x7bd389] as const

      for (let index = 0; index < 12; index += 1) {
        const angle = (Math.PI * 2 * index) / 12
        const speed = 70 + index * 8
        const size = 18 + (index % 4) * 6
        const tint = palette[index % palette.length] ?? palette[0]

        commands.spawn(
          Game.Command.spawnWith(
            [Position, {
              x: width * 0.5 + Math.cos(angle) * 140,
              y: height * 0.5 + Math.sin(angle) * 90
            }],
            [Velocity, {
              x: Math.cos(angle) * speed,
              y: Math.sin(angle) * speed
            }],
            [Renderable, {
              size
            }],
            [Tint, {
              value: tint
            }]
          )
        )
      }

      states.phase.set("Running")
    })
)

const CaptureFrameInputSystem = Game.System.define(
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

const IntegrateMotionSystem = Game.System.define(
  "IntegrateMotionSystem",
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
      deltaTime: Game.System.readResource(DeltaTime)
    },
    states: {
      phase: Game.System.readState(SimulationPhase)
    }
  },
  ({ queries, resources, states }) =>
    Fx.sync(() => {
      if (states.phase.get() !== "Running") {
        return
      }

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

const BounceWithinViewportSystem = Game.System.define(
  "BounceWithinViewportSystem",
  {
    after: [IntegrateMotionSystem],
    queries: {
      moving: Game.Query.define({
        selection: {
          position: Game.Query.write(Position),
          velocity: Game.Query.write(Velocity),
          renderable: Game.Query.read(Renderable)
        }
      })
    },
    resources: {
      viewport: Game.System.readResource(Viewport)
    },
    states: {
      phase: Game.System.readState(SimulationPhase)
    }
  },
  ({ queries, resources, states }) =>
    Fx.sync(() => {
      if (states.phase.get() !== "Running") {
        return
      }

      const viewport = resources.viewport.get()
      for (const match of queries.moving.each()) {
        const position = match.data.position.get()
        const velocity = match.data.velocity.get()
        const { size } = match.data.renderable.get()

        let nextPosition = position
        let nextVelocity = velocity

        if (position.x <= size * 0.5 || position.x >= viewport.width - size * 0.5) {
          nextVelocity = {
            x: velocity.x * -1,
            y: velocity.y
          }
          nextPosition = {
            x: Math.min(Math.max(position.x, size * 0.5), viewport.width - size * 0.5),
            y: position.y
          }
        }

        if (position.y <= size * 0.5 || position.y >= viewport.height - size * 0.5) {
          nextVelocity = {
            x: nextVelocity.x,
            y: velocity.y * -1
          }
          nextPosition = {
            x: nextPosition.x,
            y: Math.min(Math.max(position.y, size * 0.5), viewport.height - size * 0.5)
          }
        }

        if (nextPosition !== position) {
          match.data.position.set(nextPosition)
        }

        if (nextVelocity !== velocity) {
          match.data.velocity.set(nextVelocity)
        }
      }
    })
)

const SyncPixiSceneSystem = Game.System.define(
  "SyncPixiSceneSystem",
  {
    after: [BounceWithinViewportSystem],
    queries: {
      renderables: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          renderable: Game.Query.read(Renderable),
          tint: Game.Query.read(Tint)
        }
      })
    },
    services: {
      pixi: Game.System.service(PixiHost)
    },
    states: {
      phase: Game.System.readState(SimulationPhase)
    }
  },
  ({ queries, services, states }) =>
    Fx.sync(() => {
      if (states.phase.get() !== "Running") {
        return
      }

      for (const match of queries.renderables.each()) {
        const entityId = match.entity.id.value
        const position = match.data.position.get()
        const renderable = match.data.renderable.get()
        const tint = match.data.tint.get()

        let sprite = services.pixi.sprites.get(entityId)
        if (!sprite) {
          sprite = new Sprite(Texture.WHITE)
          sprite.anchor.set(0.5)
          services.pixi.application.stage.addChild(sprite)
          services.pixi.sprites.set(entityId, sprite)
        }

        sprite.width = renderable.size
        sprite.height = renderable.size
        sprite.tint = tint.value
        sprite.position.set(position.x, position.y)
      }
    })
)

const setupSchedule = Game.Schedule.define({
  systems: [SetupSceneSystem]
})

const updateSchedule = Game.Schedule.define({
  systems: [CaptureFrameInputSystem, IntegrateMotionSystem, BounceWithinViewportSystem, SyncPixiSceneSystem]
})

/**
 * Starts the bouncing Pixi integration demo inside a host container.
 */
export const startPixiExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const application = new Application()
  await application.init({
    antialias: true,
    background: "#101418",
    resizeTo: mount
  })

  const wrapper = document.createElement("section")
  wrapper.className = "pixi-example-shell"
  wrapper.appendChild(application.canvas)
  mount.replaceChildren(wrapper)

  const host = {
    application,
    sprites: new Map<number, Sprite>(),
    clock: {
      deltaSeconds: 1 / 60
    }
  }

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(Game.Runtime.service(PixiHost, host)),
    resources: {
      DeltaTime: host.clock.deltaSeconds,
      Viewport: {
        width: application.screen.width,
        height: application.screen.height
      }
    },
    states: {
      SimulationPhase: "Booting"
    }
  })

  const app = App.makeApp(runtime)
  app.bootstrap(setupSchedule)
  app.update(updateSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    host.clock.deltaSeconds = ticker.deltaMS / 1000
    app.update(updateSchedule)
  }

  application.ticker.add(tick)

  return {
    async destroy() {
      application.ticker.remove(tick)
      host.sprites.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

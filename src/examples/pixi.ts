import { Application, Sprite, Texture } from "pixi.js"

import { App, Command, Descriptor, Fx, Query, Runtime, Schedule, Schema, System } from "../index.ts"

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

// Bootstraps the ECS world once by spawning renderable entities and flipping
// the simulation phase to Running.
const SetupSceneSystem = System.define(
  {
    id: "SetupSceneSystem",
    schema,
    states: {
      phase: System.writeState(SimulationPhase)
    },
    services: {
      pixi: System.service(PixiHost)
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

        const draft = Command.insert(
          Command.insert(
            Command.insert(
              Command.insert(Command.spawn<typeof schema>(), Position, {
                x: width * 0.5 + Math.cos(angle) * 140,
                y: height * 0.5 + Math.sin(angle) * 90
              }),
              Velocity,
              {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
              }
            ),
            Renderable,
            {
              size
            }
          ),
          Tint,
          {
            value: tint
          }
        )

        commands.spawn(draft)
      }

      states.phase.set("Running")
    })
)

// Copies frame-local inputs from the Pixi host into ECS resources before the
// simulation systems run.
const CaptureFrameInputSystem = System.define(
  {
    id: "CaptureFrameInputSystem",
    schema,
    resources: {
      deltaTime: System.writeResource(DeltaTime),
      viewport: System.writeResource(Viewport)
    },
    services: {
      pixi: System.service(PixiHost)
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

// Pure simulation step: integrates positions from velocity and delta time.
const IntegrateMotionSystem = System.define(
  {
    id: "IntegrateMotionSystem",
    schema,
    queries: {
      moving: Query.define({
        selection: {
          position: Query.write(Position),
          velocity: Query.read(Velocity)
        }
      })
    },
    resources: {
      deltaTime: System.readResource(DeltaTime)
    },
    states: {
      phase: System.readState(SimulationPhase)
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

// Applies simple screen-bounds collision using ECS-only data.
const BounceWithinViewportSystem = System.define(
  {
    id: "BounceWithinViewportSystem",
    schema,
    queries: {
      moving: Query.define({
        selection: {
          position: Query.write(Position),
          velocity: Query.write(Velocity),
          renderable: Query.read(Renderable)
        }
      })
    },
    resources: {
      viewport: System.readResource(Viewport)
    },
    states: {
      phase: System.readState(SimulationPhase)
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

// Projects ECS render data into Pixi renderer objects.
//
// `match.entity.id.value` is used as the stable per-runtime integration key so
// the host can keep a sprite map outside the ECS world.
const SyncPixiSceneSystem = System.define(
  {
    id: "SyncPixiSceneSystem",
    schema,
    queries: {
      renderables: Query.define({
        selection: {
          position: Query.read(Position),
          renderable: Query.read(Renderable),
          tint: Query.read(Tint)
        }
      })
    },
    services: {
      pixi: System.service(PixiHost)
    },
    states: {
      phase: System.readState(SimulationPhase)
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

// Setup runs once before the repeating update schedule.
const setupSchedule = Schedule.define({
  label: "Setup",
  schema,
  systems: [SetupSceneSystem]
})

// Update runs every frame and is intentionally ordered.
const updateSchedule = Schedule.define({
  label: "Update",
  schema,
  systems: [CaptureFrameInputSystem, IntegrateMotionSystem, BounceWithinViewportSystem, SyncPixiSceneSystem]
})

/**
 * Starts the Pixi integration demo.
 *
 * This example is intentionally browser-side and self-running. It demonstrates
 * the intended host-bridge pattern:
 * - Pixi stays outside the ECS runtime
 * - ECS state drives simulation
 * - a sync system projects ECS data into Pixi objects
 * - the Pixi ticker owns the outer game loop
 */
export const startPixiExample = async (mount = document.body): Promise<void> => {
  const application = new Application()
  await application.init({
    antialias: true,
    background: "#101418",
    resizeTo: window
  })

  const wrapper = document.createElement("section")
  wrapper.className = "pixi-example-shell"
  wrapper.appendChild(application.canvas)
  mount.appendChild(wrapper)

  const host = {
    application,
    sprites: new Map<number, Sprite>(),
    clock: {
      deltaSeconds: 1 / 60
    }
  }

  const runtime = Runtime.makeRuntime({
    schema,
    services: {
      PixiHost: host
    },
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
  // The initial update runs setup first, then update. This works because the
  // runtime flushes commands after each system and schedule.
  app.update(setupSchedule, updateSchedule)

  application.ticker.add((ticker) => {
    host.clock.deltaSeconds = ticker.deltaMS / 1000
    app.update(updateSchedule)
  })
}

// This example auto-starts when loaded in a browser so it behaves as a runnable
// demo, not just an imported code snippet.
const mount = document.querySelector<HTMLElement>("[data-pixi-example-root]") ?? document.body
void startPixiExample(mount)

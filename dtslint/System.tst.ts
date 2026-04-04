import { Descriptor, Fx, Result, Schema } from "../src/index.ts"
import * as Size2 from "../src/Size2.ts"
import * as Vector2 from "../src/Vector2.ts"
import * as Query from "../src/query.ts"
import * as System from "../src/system.ts"
import type { Query as QueryTypes } from "../src/query.ts"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.Component<{ x: number; y: number }>()("Velocity")
const Time = Descriptor.Resource<number>()("Time")
const TickEvent = Descriptor.Event<{ dt: number }>()("TickEvent")
const Phase = Descriptor.State<"Running" | "Paused">()("Phase")
const Logger = Descriptor.Service<{ log: (message: string) => void }>()("Logger")
const SafePosition = Descriptor.ConstructedComponent(Vector2)("SafePosition")
const Viewport = Descriptor.ConstructedResource(Size2)("Viewport")
const Camera = Descriptor.ConstructedState(Vector2)("Camera")

const schema = Schema.build(Schema.fragment({
  components: {
    Position,
    Velocity,
    SafePosition
  },
  resources: {
    Time,
    Viewport
  },
  events: {
    TickEvent
  },
  states: {
    Phase,
    Camera
  }
}))

describe("System", () => {
  it("derives context from the explicit spec", () => {
    const query = Query.Query({
      selection: {
        position: Query.write(SafePosition),
        velocity: Query.read(Velocity)
      }
    })

    const system = System.System(
      "Move",
      {
        schema,
        queries: {
          moving: query
        },
        resources: {
          time: System.readResource(Time),
          viewport: System.writeResource(Viewport)
        },
        events: {
          tick: System.writeEvent(TickEvent)
        },
        services: {
          logger: System.service(Logger)
        },
        states: {
          phase: System.writeState(Phase),
          camera: System.writeState(Camera)
        }
      },
      ({ queries, resources, events, services, states }) =>
        Fx.sync(() => {
          expect(queries.moving.each()).type.toBe<ReadonlyArray<{
            readonly entity: import("../src/entity.ts").EntityMut<typeof schema, {
              readonly position: Vector2.Vector2
              readonly velocity: { x: number; y: number }
            }, {
              readonly position: Vector2.Vector2
            }>
            readonly data: QueryTypes.Cells<typeof query>
          }>>()

          expect(resources.time.get()).type.toBe<number>()
          expect(states.phase.get()).type.toBe<"Running" | "Paused">()
          expect(resources.viewport.setRaw({ width: 320, height: 180 })).type.toBe<Result.Result<void, Size2.Error>>()
          expect(resources.viewport.updateRaw((viewport) => ({
            width: viewport.width,
            height: viewport.height
          }))).type.toBe<Result.Result<void, Size2.Error>>()
          expect(services.logger).type.toBe<{ log: (message: string) => void }>()
          expect(events.tick.emit).type.toBe<(value: { dt: number }) => void>()
          expect(states.phase.setResult(Result.success("Running"))).type.toBe<Result.Result<void, unknown>>()
          expect(states.phase.updateResult(() => Result.success("Paused" as const))).type.toBe<Result.Result<void, unknown>>()
          expect(states.camera.setRaw({ x: 0, y: 0 })).type.toBe<Result.Result<void, Vector2.Error>>()
          expect(states.camera.updateRaw((camera) => ({
            x: camera.x + 1,
            y: camera.y + 1
          }))).type.toBe<Result.Result<void, Vector2.Error>>()

          // @ts-expect-error!
          resources.missing
          // @ts-expect-error!
          resources.time.setRaw(1)
        })
    )

    expect(system).type.toBeAssignableTo<import("../src/system.ts").SystemDefinition<any, void, never>>()
  })

  it("accepts reusable plain object access fragments without a wrapper", () => {
    const query = Query.Query({
      selection: {
        position: Query.write(SafePosition),
        velocity: Query.read(Velocity)
      }
    })

    const movementAccess = {
      queries: {
        moving: query
      },
      resources: {
        time: System.readResource(Time),
        viewport: System.writeResource(Viewport)
      },
      services: {
        logger: System.service(Logger)
      }
    } satisfies System.SystemAccessSpec

    System.System(
      "MoveA",
      {
        schema,
        ...movementAccess
      },
      ({ queries, resources, services }) =>
        Fx.sync(() => {
          expect(queries.moving.each()).type.toBe<ReadonlyArray<{
            readonly entity: import("../src/entity.ts").EntityMut<typeof schema, {
              readonly position: Vector2.Vector2
              readonly velocity: { x: number; y: number }
            }, {
              readonly position: Vector2.Vector2
            }>
            readonly data: QueryTypes.Cells<typeof query>
          }>>()

          expect(resources.time.get()).type.toBe<number>()
          expect(resources.viewport.setRaw({ width: 320, height: 180 })).type.toBe<Result.Result<void, Size2.Error>>()
          expect(services.logger).type.toBe<{ log: (message: string) => void }>()

          // @ts-expect-error!
          resources.missing
        })
    )

    System.System(
      "MoveB",
      {
        schema,
        ...movementAccess
      },
      ({ resources, services }) =>
        Fx.sync(() => {
          expect(resources.time.get()).type.toBe<number>()
          expect(services.logger.log).type.toBe<(message: string) => void>()

          // @ts-expect-error!
          services.missing
        })
    )
  })
})

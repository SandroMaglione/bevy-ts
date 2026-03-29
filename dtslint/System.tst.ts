import { Descriptor, Fx, Schema } from "../src/index.ts"
import * as Query from "../src/query.ts"
import * as System from "../src/system.ts"
import type { Query as QueryTypes } from "../src/query.ts"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const Time = Descriptor.defineResource<number>()("Time")
const TickEvent = Descriptor.defineEvent<{ dt: number }>()("TickEvent")
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")
const Logger = Descriptor.defineService<{ log: (message: string) => void }>()("Logger")

const schema = Schema.build(Schema.fragment({
  components: {
    Position,
    Velocity
  },
  resources: {
    Time
  },
  events: {
    TickEvent
  },
  states: {
    Phase
  }
}))

describe("System", () => {
  it("derives context from the explicit spec", () => {
    const query = Query.define({
      selection: {
        position: Query.write(Position),
        velocity: Query.read(Velocity)
      }
    })

    const system = System.define(
      "Move",
      {
        schema,
        queries: {
          moving: query
        },
        resources: {
          time: System.readResource(Time)
        },
        events: {
          tick: System.writeEvent(TickEvent)
        },
        services: {
          logger: System.service(Logger)
        },
        states: {
          phase: System.writeState(Phase)
        }
      },
      ({ queries, resources, events, services, states }) =>
        Fx.sync(() => {
          expect(queries.moving.each()).type.toBe<ReadonlyArray<{
            readonly entity: import("../src/entity.ts").EntityMut<typeof schema, {
              readonly position: { x: number; y: number }
              readonly velocity: { x: number; y: number }
            }, {
              readonly position: { x: number; y: number }
            }>
            readonly data: QueryTypes.Cells<typeof query>
          }>>()

          expect(resources.time.get()).type.toBe<number>()
          expect(states.phase.get()).type.toBe<"Running" | "Paused">()
          expect(services.logger).type.toBe<{ log: (message: string) => void }>()
          expect(events.tick.emit).type.toBe<(value: { dt: number }) => void>()

          // @ts-expect-error!
          resources.missing
        })
    )

    expect(system).type.toBeAssignableTo<import("../src/system.ts").SystemDefinition<any, void, never>>()
  })
})

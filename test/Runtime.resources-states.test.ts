import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Label, Runtime, Schedule, Schema, System } from "../src/index.ts"
import { readResourceValue, readStateValue } from "./utils/fixtures.ts"

const Time = Descriptor.defineResource<number>()("Time")
const Counter = Descriptor.defineResource<number>()("Counter")
const Phase = Descriptor.defineState<"Boot" | "Running">()("Phase")

const schema = Schema.build(Schema.fragment({
  resources: {
    DeltaTime: Time,
    Counter
  },
  states: {
    CurrentPhase: Phase
  }
}))

const makeRuntime = () =>
  Runtime.makeRuntime({
    schema,
    services: {},
    resources: {
      DeltaTime: 0.5,
      Counter: 0
    },
    states: {
      CurrentPhase: "Boot"
    }
  })

describe("Runtime resources and states", () => {
  it("reads initial resource and state seeding on the first update", () => {
    const runtime = makeRuntime()

    expect(readResourceValue(runtime, schema, Time)).toBe(0.5)
    expect(readStateValue(runtime, schema, Phase)).toBe("Boot")
  })

  it("persists resource writes across updates", () => {
    const increment = System.define(
      "RuntimeResources/Increment",
      {
        schema,
        resources: {
          counter: System.writeResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.counter.update((value) => value + 1)
        })
    )

    const schedule = Schedule.define({
      label: Label.defineScheduleLabel("RuntimeResources/IncrementSchedule"),
      schema,
      systems: [increment]
    })

    const runtime = makeRuntime()
    runtime.runSchedule(schedule)
    runtime.runSchedule(schedule)

    expect(readResourceValue(runtime, schema, Counter)).toBe(2)
  })

  it("persists state writes across updates", () => {
    const setRunning = System.define(
      "RuntimeResources/SetRunning",
      {
        schema,
        states: {
          phase: System.writeState(Phase)
        }
      },
      ({ states }) =>
        Fx.sync(() => {
          states.phase.set("Running")
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      label: Label.defineScheduleLabel("RuntimeResources/SetRunningSchedule"),
      schema,
      systems: [setRunning]
    }))

    expect(readStateValue(runtime, schema, Phase)).toBe("Running")
  })

  it("supports schema-key initialization when the descriptor name differs from the schema key", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: {},
      resources: {
        DeltaTime: 0.25,
        Counter: 3
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    expect(readResourceValue(runtime, schema, Time)).toBe(0.25)
    expect(readStateValue(runtime, schema, Phase)).toBe("Running")
  })

  it("lets one system read state and write resources in the same update", () => {
    const syncFromPhase = System.define(
      "RuntimeResources/SyncFromPhase",
      {
        schema,
        resources: {
          counter: System.writeResource(Counter)
        },
        states: {
          phase: System.readState(Phase)
        }
      },
      ({ resources, states }) =>
        Fx.sync(() => {
          resources.counter.set(states.phase.get() === "Running" ? 1 : 0)
        })
    )

    const runtime = Runtime.makeRuntime({
      schema,
      services: {},
      resources: {
        DeltaTime: 0.5,
        Counter: 0
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    runtime.runSchedule(Schedule.define({
      label: Label.defineScheduleLabel("RuntimeResources/SyncFromPhaseSchedule"),
      schema,
      systems: [syncFromPhase]
    }))

    expect(readResourceValue(runtime, schema, Counter)).toBe(1)
  })
})

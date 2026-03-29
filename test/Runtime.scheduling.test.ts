import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Label, Schema } from "../src/index.ts"
import * as Runtime from "../src/runtime.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Counter = Descriptor.defineResource<number>()("Counter")
const Log = Descriptor.defineResource<ReadonlyArray<string>>()("Log")

const schema = Schema.build(Schema.fragment({
  resources: {
    Counter,
    Log
  }
}))

const makeRuntime = () =>
  Runtime.makeRuntime({
    schema,
    services: Runtime.services(),
    resources: {
      Counter: 0,
      Log: []
    }
  })

describe("Runtime scheduling", () => {
  it("runSchedule executes only the provided schedule", () => {
    const increment = System.define(
      "RuntimeScheduling/Increment",
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

    const append = System.define(
      "RuntimeScheduling/AppendLog",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "ran"])
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [increment]
    }))

    expect(readResourceValue(runtime, schema, Counter)).toBe(1)
    expect(readResourceValue(runtime, schema, Log)).toEqual([])
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [append]
    }))
    expect(readResourceValue(runtime, schema, Log)).toEqual(["ran"])
  })

  it("tick executes schedules in the order provided", () => {
    const first = System.define(
      "RuntimeScheduling/First",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "first"])
        })
    )

    const second = System.define(
      "RuntimeScheduling/Second",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "second"])
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        systems: [first]
      }),
      Schedule.define({
        schema,
        systems: [second]
      })
    )

    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("orders systems by direct system references", () => {
    const first = System.define(
      "RuntimeScheduling/DirectFirst",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "first"])
        })
    )

    const second = System.define(
      "RuntimeScheduling/DirectSecond",
      {
        schema,
        after: [first],
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "second"])
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [second, first]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("orders systems in chained sets by declaration order", () => {
    const movement = Label.defineSystemSetLabel("RuntimeScheduling/Movement")

    const first = System.define(
      "RuntimeScheduling/ChainedFirst",
      {
        schema,
        inSets: [movement],
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "first"])
        })
    )

    const second = System.define(
      "RuntimeScheduling/ChainedSecond",
      {
        schema,
        inSets: [movement],
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "second"])
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [first, second],
      sets: [
        Schedule.configureSet({
          label: movement,
          chain: true
        })
      ] as const
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })
})

import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "../src/index.ts"
import * as Runtime from "../src/runtime.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Counter = Descriptor.Resource<number>()("Counter")
const Log = Descriptor.Resource<ReadonlyArray<string>>()("Log")

const Game = Schema.bind(Schema.fragment({
  resources: {
    Counter,
    Log
  }
}))
const schema = Game.schema

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
    const increment = System.System(
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

    const append = System.System(
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
    runtime.runSchedule(Schedule.Schedule(increment))

    expect(readResourceValue(runtime, schema, Counter)).toBe(1)
    expect(readResourceValue(runtime, schema, Log)).toEqual([])
    runtime.runSchedule(Schedule.Schedule(append))
    expect(readResourceValue(runtime, schema, Log)).toEqual(["ran"])
  })

  it("tick executes schedules in the order provided", () => {
    const first = System.System(
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

    const second = System.System(
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
      Schedule.Schedule(first),
      Schedule.Schedule(second)
    )

    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("preserves authored system order exactly", () => {
    const first = System.System(
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

    const second = System.System(
      "RuntimeScheduling/DirectSecond",
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
    runtime.runSchedule(Schedule.Schedule(second, first))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["second", "first"])
  })

  it("preserves authored order across multiple systems with no implicit grouping", () => {
    const first = System.System(
      "RuntimeScheduling/ChainedFirst",
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

    const second = System.System(
      "RuntimeScheduling/ChainedSecond",
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
    runtime.runSchedule(Schedule.Schedule(first, second))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("keeps explicit marker boundaries while preserving authored order", () => {
    const first = System.System(
      "RuntimeScheduling/BoundaryFirst",
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

    const second = System.System(
      "RuntimeScheduling/BoundarySecond",
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
    runtime.runSchedule(Schedule.Schedule(first, Schedule.updateLifecycle(), second))
    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("composes reusable final schedules into one flattened explicit schedule", () => {
    const first = System.System(
      "RuntimeScheduling/ComposeFirst",
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

    const second = System.System(
      "RuntimeScheduling/ComposeSecond",
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

    const hostMirror = Schedule.Schedule(
      Schedule.updateLifecycle(),
      second
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.Schedule(
      first,
      Schedule.applyDeferred(),
      hostMirror
    ))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("rejects duplicate systems reused across composed entries", () => {
    const duplicate = System.System(
      "RuntimeScheduling/ComposeDuplicate",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "duplicate"])
        })
    )

    const phase = Schedule.Schedule(duplicate)

    expect(() =>
      Schedule.Schedule(duplicate, phase)
    ).toThrow("Duplicate system step in schedule")
  })
})

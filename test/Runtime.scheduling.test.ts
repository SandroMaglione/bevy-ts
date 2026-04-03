import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "../src/index.ts"
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
    runtime.runSchedule(Schedule.define([increment]))

    expect(readResourceValue(runtime, schema, Counter)).toBe(1)
    expect(readResourceValue(runtime, schema, Log)).toEqual([])
    runtime.runSchedule(Schedule.define([append]))
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
      Schedule.define([first]),
      Schedule.define([second])
    )

    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("preserves authored system order exactly", () => {
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
    runtime.runSchedule(Schedule.define([second, first]))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["second", "first"])
  })

  it("preserves authored order across multiple systems with no implicit grouping", () => {
    const first = System.define(
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

    const second = System.define(
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
    runtime.runSchedule(Schedule.define([first, second]))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("keeps explicit marker boundaries while preserving authored order", () => {
    const first = System.define(
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

    const second = System.define(
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
    runtime.runSchedule(Schedule.define([first, Schedule.updateLifecycle(), second]))
    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("composes reusable final schedules into one flattened explicit schedule", () => {
    const first = System.define(
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

    const second = System.define(
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

    const hostMirror = Schedule.define([
        Schedule.updateLifecycle(),
        second
      ])

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define([
        first,
        Schedule.applyDeferred(),
        hostMirror
      ]))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["first", "second"])
  })

  it("rejects duplicate systems reused across composed entries", () => {
    const duplicate = System.define(
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

    const phase = Schedule.define([duplicate])

    expect(() =>
      Schedule.define([duplicate, phase])
    ).toThrow("Duplicate system step in schedule")
  })
})

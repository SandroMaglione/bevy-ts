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

  it("throws a descriptive error for circular system dependencies", () => {
    const First = System.define(
      "RuntimeScheduling/CycleFirst",
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

    const Second = System.define(
      "RuntimeScheduling/CycleSecond",
      {
        schema,
        after: [First],
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "second"])
        })
    )

    const CyclicFirst = System.define(
      "RuntimeScheduling/CycleFirst",
      {
        schema,
        after: [Second],
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "cycle"])
        })
    )

    const runtime = makeRuntime()
    expect(() =>
      runtime.runSchedule(Schedule.define({
        schema,
        systems: [CyclicFirst, Second]
      } as never) as never)
    ).toThrow("Circular system dependency detected")
  })

  it("extends one base schedule with prefix and suffix steps in exact order", () => {
    const before = System.define(
      "RuntimeScheduling/Before",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "before"])
        })
    )

    const base = System.define(
      "RuntimeScheduling/Base",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "base"])
        })
    )

    const after = System.define(
      "RuntimeScheduling/After",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "after"])
        })
    )

    const runtime = makeRuntime()
    const baseSchedule = Schedule.define({
      schema,
      systems: [base]
    })
    const extended = Schedule.extend(baseSchedule, {
      before: [before],
      after: [after]
    })

    runtime.runSchedule(extended)

    expect(readResourceValue(runtime, schema, Log)).toEqual(["before", "base", "after"])
  })

  it("throws when extension steps reuse a base schedule system", () => {
    const base = System.define(
      "RuntimeScheduling/ExtendedBase",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "base"])
        })
    )

    const baseSchedule = Schedule.define({
      schema,
      systems: [base]
    })

    expect(() =>
      Schedule.extend(baseSchedule as never, {
        before: [base]
      } as never)
    ).toThrow("Extended schedule reuses base system")
  })

  it("composes reusable phases into one flattened explicit schedule", () => {
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

    const hostMirror = Schedule.phase({
      schema,
      steps: [
        Schedule.updateLifecycle(),
        second
      ]
    })

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      ...Schedule.compose({
        entries: [
          first,
          Schedule.applyDeferred(),
          hostMirror
        ]
      })
    }))

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

    const phase = Schedule.phase({
      schema,
      steps: [duplicate]
    })

    expect(() =>
      Schedule.compose({
        entries: [duplicate, phase]
      })
    ).toThrow("Duplicate system step in schedule composition")
  })
})

import { describe, expect, it } from "vitest"
import { App, Descriptor, Fx, Schema } from "../src/index.ts"
import * as Runtime from "../src/runtime.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"

const Counter = Descriptor.defineResource<number>()("Counter")
const Log = Descriptor.defineResource<ReadonlyArray<string>>()("Log")

const schema = Schema.build(Schema.fragment({
  resources: {
    Counter,
    Log
  }
}))

describe("App", () => {
  it("runs one schedule once through update", () => {
    let captured = -1

    const increment = System.define(
      "AppTest/Increment",
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

    const read = System.define(
      "AppTest/ReadCounter",
      {
        schema,
        resources: {
          counter: System.readResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          captured = resources.counter.get()
        })
    )

    const updateSchedule = Schedule.define({
      schema,
      systems: [increment]
    })

    const readSchedule = Schedule.define({
      schema,
      systems: [read]
    })

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        Counter: 0,
        Log: []
      }
    })

    const app = App.makeApp(runtime)
    app.update(updateSchedule)
    app.update(readSchedule)

    expect(captured).toBe(1)
  })

  it("runs multiple schedules in order within one update call", () => {
    let captured: ReadonlyArray<string> = []

    const first = System.define(
      "AppTest/First",
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
      "AppTest/Second",
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

    const read = System.define(
      "AppTest/CaptureLog",
      {
        schema,
        resources: {
          log: System.readResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          captured = resources.log.get()
        })
    )

    const firstSchedule = Schedule.define({
      schema,
      systems: [first]
    })

    const secondSchedule = Schedule.define({
      schema,
      systems: [second]
    })

    const readSchedule = Schedule.define({
      schema,
      systems: [read]
    })

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        Counter: 0,
        Log: []
      }
    })

    const app = App.makeApp(runtime)
    app.update(firstSchedule, secondSchedule, readSchedule)

    expect(captured).toEqual(["first", "second"])
  })

  it("runs bootstrap schedules through the runtime initialization path", () => {
    let captured = -1

    const setup = System.define(
      "AppTest/BootstrapSetup",
      {
        schema,
        resources: {
          counter: System.writeResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.counter.set(42)
        })
    )

    const read = System.define(
      "AppTest/BootstrapRead",
      {
        schema,
        resources: {
          counter: System.readResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          captured = resources.counter.get()
        })
    )

    const setupSchedule = Schedule.define({
      schema,
      systems: [setup]
    })

    const readSchedule = Schedule.define({
      schema,
      systems: [read]
    })

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        Counter: 0,
        Log: []
      }
    })

    const app = App.makeApp(runtime)
    app.bootstrap(setupSchedule)
    app.update(readSchedule)

    expect(captured).toBe(42)
  })

  it("repeated update calls accumulate world changes", () => {
    const increment = System.define(
      "AppTest/RepeatedIncrement",
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

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        Counter: 0,
        Log: []
      }
    })

    const app = App.makeApp(runtime)
    const schedule = Schedule.define({
      schema,
      systems: [increment]
    })

    app.update(schedule)
    app.update(schedule)
    app.update(schedule)

    const captured = readCounter(runtime)
    expect(captured).toBe(3)
  })
})

const readCounter = (
  runtime: Runtime.Runtime<
    typeof schema,
    {},
    {
      readonly Counter: number
      readonly Log: ReadonlyArray<string>
    }
  >
): number => {
  let captured = -1
  runtime.runSchedule(Schedule.define({
    schema,
    systems: [System.define(
      "AppTest/ReadCounterHelperSystem",
      {
        schema,
        resources: {
          counter: System.readResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          captured = resources.counter.get()
        })
    )]
  }))
  return captured
}

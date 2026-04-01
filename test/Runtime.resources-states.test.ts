import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "../src/index.ts"
import * as Runtime from "../src/runtime.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { readResourceValue, readStateValue } from "./utils/fixtures.ts"
import * as Result from "../src/Result.ts"

const Time = Descriptor.defineResource<number>()("Time")
const Counter = Descriptor.defineResource<number>()("Counter")
const Phase = Descriptor.defineState<"Boot" | "Running">()("Phase")
const Logger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("Logger")
const PrefixedLogger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("RuntimeResources/Logger")

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
    services: Runtime.services(),
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
      schema,
      systems: [setRunning]
    }))

    expect(readStateValue(runtime, schema, Phase)).toBe("Running")
  })

  it("setResult and updateResult only write successful values", () => {
    const applyValidatedWrites = System.define(
      "RuntimeResources/ApplyValidatedWrites",
      {
        schema,
        resources: {
          counter: System.writeResource(Counter)
        },
        states: {
          phase: System.writeState(Phase)
        }
      },
      ({ resources, states }) =>
        Fx.sync(() => {
          const failedSet = resources.counter.setResult(Result.failure("invalid"))
          expect(failedSet).toEqual(Result.failure("invalid"))

          const successfulSet = resources.counter.setResult(Result.success(3))
          expect(successfulSet).toEqual(Result.success(undefined))

          const failedUpdate = states.phase.updateResult(() => Result.failure("blocked"))
          expect(failedUpdate).toEqual(Result.failure("blocked"))

          const successfulUpdate = states.phase.updateResult(() => Result.success("Running" as const))
          expect(successfulUpdate).toEqual(Result.success(undefined))
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [applyValidatedWrites]
    }))

    expect(readResourceValue(runtime, schema, Counter)).toBe(3)
    expect(readStateValue(runtime, schema, Phase)).toBe("Running")
  })

  it("supports schema-key initialization when the descriptor name differs from the schema key", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
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

  it("makeRuntimeResult unwraps validated seeds and returns keyed failures", () => {
    const runtime = Runtime.makeRuntimeResult({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: Result.success(0.25),
        Counter: Result.failure("bad-counter")
      },
      states: {
        CurrentPhase: Result.failure("bad-phase")
      }
    })

    expect(runtime).toEqual(Result.failure({
      resources: {
        Counter: "bad-counter"
      },
      states: {
        CurrentPhase: "bad-phase"
      }
    }))
  })

  it("makeRuntimeResult succeeds with validated seeds", () => {
    const runtime = Runtime.makeRuntimeResult({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: Result.success(0.75),
        Counter: Result.success(2)
      },
      states: {
        CurrentPhase: Result.success("Running" as const)
      }
    })

    expect(runtime.ok).toBe(true)
    if (!runtime.ok) {
      return
    }

    expect(readResourceValue(runtime.value, schema, Time)).toBe(0.75)
    expect(readResourceValue(runtime.value, schema, Counter)).toBe(2)
    expect(readStateValue(runtime.value, schema, Phase)).toBe("Running")
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
      services: Runtime.services(),
      resources: {
        DeltaTime: 0.5,
        Counter: 0
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    runtime.runSchedule(Schedule.define({
      schema,
      systems: [syncFromPhase]
    }))

    expect(readResourceValue(runtime, schema, Counter)).toBe(1)
  })

  it("reads a provided service during schedule execution", () => {
    const seen: Array<string> = []

    const logTime = System.define(
      "RuntimeResources/LogTime",
      {
        schema,
        resources: {
          time: System.readResource(Time)
        },
        services: {
          logger: System.service(Logger)
        }
      },
      ({ resources, services }) =>
        Fx.sync(() => {
          services.logger.log(`dt=${resources.time.get()}`)
        })
    )

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(
        Runtime.service(Logger, {
          log(message) {
            seen.push(message)
          }
        })
      ),
      resources: {
        DeltaTime: 0.25,
        Counter: 0
      },
      states: {
        CurrentPhase: "Boot"
      }
    })

    runtime.runSchedule(Schedule.define({
      schema,
      systems: [logTime]
    }))

    expect(seen).toEqual(["dt=0.25"])
  })

  it("resolves provided services from descriptor identity even when the service name is prefixed", () => {
    const seen: Array<string> = []

    const logTime = System.define(
      "RuntimeResources/LogTimePrefixed",
      {
        schema,
        resources: {
          time: System.readResource(Time)
        },
        services: {
          logger: System.service(PrefixedLogger)
        }
      },
      ({ resources, services }) =>
        Fx.sync(() => {
          services.logger.log(`dt=${resources.time.get()}`)
        })
    )

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(
        Runtime.service(PrefixedLogger, {
          log(message) {
            seen.push(message)
          }
        })
      ),
      resources: {
        DeltaTime: 0.125,
        Counter: 0
      },
      states: {
        CurrentPhase: "Boot"
      }
    })

    runtime.runSchedule(Schedule.define({
      schema,
      systems: [logTime]
    }))

    expect(seen).toEqual(["dt=0.125"])
  })
})

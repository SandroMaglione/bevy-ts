import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "../src/index.ts"
import * as Size2 from "../src/Size2.ts"
import * as Vector2 from "../src/Vector2.ts"
import * as Runtime from "../src/runtime.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { readResourceValue, readStateValue } from "./utils/fixtures.ts"
import * as Result from "../src/Result.ts"

const Time = Descriptor.Resource<number>()("Time")
const Counter = Descriptor.Resource<number>()("Counter")
const Phase = Descriptor.State<"Boot" | "Running">()("Phase")
const Logger = Descriptor.Service<{ readonly log: (message: string) => void }>()("Logger")
const PrefixedLogger = Descriptor.Service<{ readonly log: (message: string) => void }>()("RuntimeResources/Logger")
const Viewport = Descriptor.ConstructedResource(Size2)("Viewport")
const Camera = Descriptor.ConstructedState(Vector2)("Camera")

const schema = Schema.build(Schema.fragment({
  resources: {
    DeltaTime: Time,
    Counter,
    Viewport
  },
  states: {
    CurrentPhase: Phase,
    Camera
  }
}))

const makeRuntime = () => {
  const runtime = Runtime.makeRuntimeConstructed({
    schema,
    services: Runtime.services(),
    resources: {
      DeltaTime: 0.5,
      Counter: 0,
      Viewport: { width: 640, height: 360 }
    },
    states: {
      CurrentPhase: "Boot",
      Camera: { x: 0, y: 0 }
    }
  })

  if (!runtime.ok) {
    throw new Error("expected constructed runtime test fixture to be valid")
  }

  return runtime.value
}

describe("Runtime resources and states", () => {
  it("reads initial resource and state seeding on the first update", () => {
    const runtime = makeRuntime()

    expect(readResourceValue(runtime, schema, Time)).toBe(0.5)
    expect(readStateValue(runtime, schema, Phase)).toBe("Boot")
    expect(readResourceValue(runtime, schema, Viewport)).toEqual({ width: 640, height: 360 })
    expect(readStateValue(runtime, schema, Camera)).toEqual({ x: 0, y: 0 })
  })

  it("persists resource writes across updates", () => {
    const increment = System.System(
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

    const schedule = Schedule.Schedule(increment)

    const runtime = makeRuntime()
    runtime.runSchedule(schedule)
    runtime.runSchedule(schedule)

    expect(readResourceValue(runtime, schema, Counter)).toBe(2)
  })

  it("persists state writes across updates", () => {
    const setRunning = System.System(
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
    runtime.runSchedule(Schedule.Schedule(setRunning))

    expect(readStateValue(runtime, schema, Phase)).toBe("Running")
  })

  it("setResult and updateResult only write successful values", () => {
    const applyValidatedWrites = System.System(
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
    runtime.runSchedule(Schedule.Schedule(applyValidatedWrites))

    expect(readResourceValue(runtime, schema, Counter)).toBe(3)
    expect(readStateValue(runtime, schema, Phase)).toBe("Running")
  })

  it("setRaw and updateRaw only write successful constructed values", () => {
    const applyConstructedWrites = System.System(
      "RuntimeResources/ApplyConstructedWrites",
      {
        schema,
        resources: {
          viewport: System.writeResource(Viewport)
        },
        states: {
          camera: System.writeState(Camera)
        }
      },
      ({ resources, states }) =>
        Fx.sync(() => {
          const failedSet = resources.viewport.setRaw({
            width: Number.NaN,
            height: 360
          })
          expect(failedSet.ok).toBe(false)

          const successfulSet = resources.viewport.setRaw({
            width: 800,
            height: 450
          })
          expect(successfulSet).toEqual(Result.success(undefined))

          const failedUpdate = states.camera.updateRaw(() => ({
            x: Number.POSITIVE_INFINITY,
            y: 4
          }))
          expect(failedUpdate.ok).toBe(false)

          const successfulUpdate = states.camera.updateRaw((camera) => ({
            x: camera.x + 5,
            y: camera.y + 7
          }))
          expect(successfulUpdate).toEqual(Result.success(undefined))
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.Schedule(applyConstructedWrites))

    expect(readResourceValue(runtime, schema, Viewport)).toEqual({ width: 800, height: 450 })
    expect(readStateValue(runtime, schema, Camera)).toEqual({ x: 5, y: 7 })
  })

  it("supports schema-key initialization when the descriptor name differs from the schema key", () => {
    const runtime = Runtime.makeRuntimeConstructed({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 0.25,
        Counter: 3,
        Viewport: { width: 400, height: 240 }
      },
      states: {
        CurrentPhase: "Running",
        Camera: { x: 0, y: 0 }
      }
    })

    if (!runtime.ok) {
      throw new Error("expected schema-key constructed runtime seeds to be valid")
    }

    expect(readResourceValue(runtime.value, schema, Time)).toBe(0.25)
    expect(readStateValue(runtime.value, schema, Phase)).toBe("Running")
  })

  it("makeRuntimeResult unwraps validated seeds and returns keyed failures", () => {
    const runtime = Runtime.makeRuntimeResult({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: Result.success(0.25),
        Counter: Result.failure("bad-counter"),
        Viewport: Size2.result({ width: 400, height: 240 })
      },
      states: {
        CurrentPhase: Result.failure("bad-phase"),
        Camera: Vector2.result({ x: 0, y: 0 })
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
        Counter: Result.success(2),
        Viewport: Size2.result({ width: 320, height: 180 })
      },
      states: {
        CurrentPhase: Result.success("Running" as const),
        Camera: Vector2.result({ x: 12, y: 24 })
      }
    })

    expect(runtime.ok).toBe(true)
    if (!runtime.ok) {
      return
    }

    expect(runtime.value).toBeDefined()
  })

  it("makeRuntimeConstructed validates raw constructed seeds and returns keyed failures", () => {
    const runtime = Runtime.makeRuntimeConstructed({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 0.25,
        Counter: 1,
        Viewport: {
          width: Number.NaN,
          height: 360
        }
      },
      states: {
        CurrentPhase: "Running",
        Camera: {
          x: Number.POSITIVE_INFINITY,
          y: 0
        }
      }
    })

    expect(runtime.ok).toBe(false)
    if (runtime.ok) {
      return
    }

    expect(runtime.error.resources.Viewport).toBeDefined()
    expect(runtime.error.states.Camera).toBeDefined()
  })

  it("lets one system read state and write resources in the same update", () => {
    const syncFromPhase = System.System(
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

    const runtime = Runtime.makeRuntimeConstructed({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 0.5,
        Counter: 0,
        Viewport: { width: 320, height: 180 }
      },
      states: {
        CurrentPhase: "Running",
        Camera: { x: 0, y: 0 }
      }
    })

    if (!runtime.ok) {
      throw new Error("expected syncFromPhase runtime seeds to be valid")
    }

    runtime.value.runSchedule(Schedule.Schedule(syncFromPhase))

    expect(readResourceValue(runtime.value, schema, Counter)).toBe(1)
  })

  it("reads a provided service during schedule execution", () => {
    const seen: Array<string> = []

    const logTime = System.System(
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

    const runtime = Runtime.makeRuntimeConstructed({
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
        Counter: 0,
        Viewport: { width: 320, height: 180 }
      },
      states: {
        CurrentPhase: "Boot",
        Camera: { x: 0, y: 0 }
      }
    })

    if (!runtime.ok) {
      throw new Error("expected logger runtime seeds to be valid")
    }

    runtime.value.runSchedule(Schedule.Schedule(logTime))

    expect(seen).toEqual(["dt=0.25"])
  })

  it("resolves provided services from descriptor identity even when the service name is prefixed", () => {
    const seen: Array<string> = []

    const logTime = System.System(
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

    const runtime = Runtime.makeRuntimeConstructed({
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
        Counter: 0,
        Viewport: { width: 320, height: 180 }
      },
      states: {
        CurrentPhase: "Boot",
        Camera: { x: 0, y: 0 }
      }
    })

    if (!runtime.ok) {
      throw new Error("expected prefixed logger runtime seeds to be valid")
    }

    runtime.value.runSchedule(Schedule.Schedule(logTime))

    expect(seen).toEqual(["dt=0.125"])
  })
})

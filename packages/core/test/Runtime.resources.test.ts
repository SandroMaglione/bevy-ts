import { describe, expect, it } from "vitest"
import { Descriptor, Schema } from "@bevy-ts/core"
import * as Size2 from "@bevy-ts/math/Size2"
import * as Vector2 from "@bevy-ts/math/Vector2"
import * as Runtime from "@bevy-ts/core/Runtime"
import * as Schedule from "@bevy-ts/core/Schedule"
import * as System from "@bevy-ts/core/System"
import { readResourceValue } from "./utils/fixtures.ts"
import * as Result from "@bevy-ts/core/Result"

const Time = Descriptor.Resource<number>()("Time")
const Counter = Descriptor.Resource<number>()("Counter")
const Phase = Descriptor.Resource<"Boot" | "Running">()("Phase")
const Logger = Descriptor.Service<{ readonly log: (message: string) => void }>()("Logger")
const PrefixedLogger = Descriptor.Service<{ readonly log: (message: string) => void }>()("RuntimeResources/Logger")
const Viewport = Descriptor.ConstructedResource(Size2)("Viewport")
const Camera = Descriptor.ConstructedResource(Vector2)("Camera")

const Game = Schema.bind(Schema.fragment({
  resources: {
    DeltaTime: Time,
    Counter,
    Viewport,
    CurrentPhase: Phase,
    Camera
  }
}))
const schema = Game.schema

const makeRuntime = () => {
  const runtime = Runtime.make({
    schema,
    services: Runtime.services(),
    resources: {
      DeltaTime: 0.5,
      Counter: 0,
      Viewport: { width: 640, height: 360 },
      CurrentPhase: "Boot",
      Camera: { x: 0, y: 0 }
    }
  })

  if (!runtime.ok) {
    throw new Error("expected constructed runtime test fixture to be valid")
  }

  return runtime.value
}

describe("Runtime resources", () => {
  it("reads initial resource seeding on the first update", () => {
    const runtime = makeRuntime()

    expect(readResourceValue(runtime, schema, Time)).toBe(0.5)
    expect(readResourceValue(runtime, schema, Phase)).toBe("Boot")
    expect(readResourceValue(runtime, schema, Viewport)).toEqual({ width: 640, height: 360 })
    expect(readResourceValue(runtime, schema, Camera)).toEqual({ x: 0, y: 0 })
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
        {
          resources.counter.update((value) => value + 1)
        }
    )

    const schedule = Schedule.Schedule(increment)

    const runtime = makeRuntime()
    runtime.tick(schedule)
    runtime.tick(schedule)

    expect(readResourceValue(runtime, schema, Counter)).toBe(2)
  })

  it("persists writes to a union-valued resource across updates", () => {
    const setRunning = System.System(
      "RuntimeResources/SetRunning",
      {
        schema,
        resources: {
          phase: System.writeResource(Phase)
        }
      },
      ({ resources }) =>
        {
          resources.phase.set("Running")
        }
    )

    const runtime = makeRuntime()
    runtime.tick(Schedule.Schedule(setRunning))

    expect(readResourceValue(runtime, schema, Phase)).toBe("Running")
  })

  it("setResult and updateResult only write successful values", () => {
    const applyValidatedWrites = System.System(
      "RuntimeResources/ApplyValidatedWrites",
      {
        schema,
        resources: {
          counter: System.writeResource(Counter),
          phase: System.writeResource(Phase)
        }
      },
      ({ resources }) =>
        {
          const failedSet = resources.counter.setResult(Result.failure("invalid"))
          expect(failedSet).toEqual(Result.failure("invalid"))

          const successfulSet = resources.counter.setResult(Result.success(3))
          expect(successfulSet).toEqual(Result.success(undefined))

          const failedUpdate = resources.phase.updateResult(() => Result.failure("blocked"))
          expect(failedUpdate).toEqual(Result.failure("blocked"))

          const successfulUpdate = resources.phase.updateResult(() => Result.success("Running" as const))
          expect(successfulUpdate).toEqual(Result.success(undefined))
        }
    )

    const runtime = makeRuntime()
    runtime.tick(Schedule.Schedule(applyValidatedWrites))

    expect(readResourceValue(runtime, schema, Counter)).toBe(3)
    expect(readResourceValue(runtime, schema, Phase)).toBe("Running")
  })

  it("setRaw and updateRaw only write successful constructed values", () => {
    const applyConstructedWrites = System.System(
      "RuntimeResources/ApplyConstructedWrites",
      {
        schema,
        resources: {
          viewport: System.writeResource(Viewport),
          camera: System.writeResource(Camera)
        }
      },
      ({ resources }) =>
        {
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

          const failedUpdate = resources.camera.updateRaw(() => ({
            x: Number.POSITIVE_INFINITY,
            y: 4
          }))
          expect(failedUpdate.ok).toBe(false)

          const successfulUpdate = resources.camera.updateRaw((camera) => ({
            x: camera.x + 5,
            y: camera.y + 7
          }))
          expect(successfulUpdate).toEqual(Result.success(undefined))
        }
    )

    const runtime = makeRuntime()
    runtime.tick(Schedule.Schedule(applyConstructedWrites))

    expect(readResourceValue(runtime, schema, Viewport)).toEqual({ width: 800, height: 450 })
    expect(readResourceValue(runtime, schema, Camera)).toEqual({ x: 5, y: 7 })
  })

  it("supports schema-key initialization when the descriptor name differs from the schema key", () => {
    const runtime = Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 0.25,
        Counter: 3,
        Viewport: { width: 400, height: 240 },
        CurrentPhase: "Running",
        Camera: { x: 0, y: 0 }
      }
    })

    if (!runtime.ok) {
      throw new Error("expected schema-key constructed runtime seeds to be valid")
    }

    expect(readResourceValue(runtime.value, schema, Time)).toBe(0.25)
    expect(readResourceValue(runtime.value, schema, Phase)).toBe("Running")
  })

  it("make returns the runtime directly when no provided resource can fail", () => {
    const runtime = Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 0.75,
        Counter: 2
      }
    })

    expect(readResourceValue(runtime, schema, Counter)).toBe(2)
  })

  it("make validates constructed resources and returns keyed failures", () => {
    const runtime = Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 0.25,
        Counter: 1,
        Viewport: {
          width: Number.NaN,
          height: 360
        },
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
    expect(runtime.error.resources.Camera).toBeDefined()
  })

  it("lets one system read one resource and write another in the same update", () => {
    const syncFromPhase = System.System(
      "RuntimeResources/SyncFromPhase",
      {
        schema,
        resources: {
          counter: System.writeResource(Counter),
          phase: System.readResource(Phase)
        }
      },
      ({ resources }) =>
        {
          resources.counter.set(resources.phase.get() === "Running" ? 1 : 0)
        }
    )

    const runtime = Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 0.5,
        Counter: 0,
        Viewport: { width: 320, height: 180 },
        CurrentPhase: "Running",
        Camera: { x: 0, y: 0 }
      }
    })

    if (!runtime.ok) {
      throw new Error("expected syncFromPhase runtime seeds to be valid")
    }

    runtime.value.tick(Schedule.Schedule(syncFromPhase))

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
        {
          services.logger.log(`dt=${resources.time.get()}`)
        }
    )

    const runtime = Runtime.make({
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
        Viewport: { width: 320, height: 180 },
        CurrentPhase: "Boot",
        Camera: { x: 0, y: 0 }
      }
    })

    if (!runtime.ok) {
      throw new Error("expected logger runtime seeds to be valid")
    }

    runtime.value.tick(Schedule.Schedule(logTime))

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
        {
          services.logger.log(`dt=${resources.time.get()}`)
        }
    )

    const runtime = Runtime.make({
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
        Viewport: { width: 320, height: 180 },
        CurrentPhase: "Boot",
        Camera: { x: 0, y: 0 }
      }
    })

    if (!runtime.ok) {
      throw new Error("expected prefixed logger runtime seeds to be valid")
    }

    runtime.value.tick(Schedule.Schedule(logTime))

    expect(seen).toEqual(["dt=0.125"])
  })
})

import { describe, expect, it } from "vitest"
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import * as Runtime from "@typeonce/bevy-ts/Runtime"
import * as Schedule from "@typeonce/bevy-ts/Schedule"
import * as System from "@typeonce/bevy-ts/System"
import { readResourceValue } from "./utils/fixtures.ts"

const Counter = Descriptor.Resource<number>()("Counter")
const Log = Descriptor.Resource<ReadonlyArray<string>>()("Log")
const Health = Descriptor.Component<{ current: number }>()("Health")
const BootCount = Descriptor.Resource<number>()("BootCount")

const Game = Schema.bind(Schema.fragment({
  resources: {
    Counter,
    Log
  }
}))
const schema = Game.schema

describe("Features", () => {
  it("composes typed features before bind and runs their aggregated schedules", () => {
    const Root = Schema.defineRoot("FeatureApp")

    const Core = Schema.Feature.define("Core", {
      schema: Schema.fragment({
        resources: {
          Counter,
          Log,
          BootCount
        }
      }),
      build: (Game) => {
        const bootstrap = Game.System(
          "Feature/CoreBootstrap",
          {
            resources: {
              bootCount: Game.System.writeResource(BootCount),
              log: Game.System.writeResource(Log)
            }
          },
          ({ resources }) =>
            {
              resources.bootCount.update((value) => value + 1)
              resources.log.update((entries) => [...entries, "bootstrap"])
            }
        )

        return {
          bootstrap: [Game.Schedule(bootstrap)]
        }
      }
    })

    const Combat = Schema.Feature.define("Combat", {
      schema: Schema.fragment({
        components: {
          Health
        }
      }),
      requires: [Core] as const,
      build: (Game) => {
        const increment = Game.System(
          "Feature/CombatIncrement",
          {
            resources: {
              counter: Game.System.writeResource(Counter),
              log: Game.System.writeResource(Log)
            }
          },
          ({ resources }) =>
            {
              resources.counter.update((value) => value + 1)
              resources.log.update((entries) => [...entries, "combat"])
            }
        )

        const capture = Game.System(
          "Feature/CombatCapture",
          {
            resources: {
              counter: Game.System.readResource(Counter),
              bootCount: Game.System.readResource(BootCount),
              log: Game.System.readResource(Log)
            }
          },
          ({ resources }) =>
            {
              capturedCounter = resources.counter.get()
              capturedBootCount = resources.bootCount.get()
              capturedLog = resources.log.get()
            }
        )

        return {
          update: [
            Game.Schedule(increment),
            Game.Schedule(capture)
          ]
        }
      }
    })

    let capturedCounter = -1
    let capturedBootCount = -1
    let capturedLog: ReadonlyArray<string> = []

    const project = Schema.Feature.compose({
      root: Root,
      features: [Core, Combat] as const
    })

    const runtime = project.Game.Runtime.make({
      services: project.Game.Runtime.services(),
      resources: {
        Counter: 0,
        Log: [],
        BootCount: 0
      }
    })

    runtime.tick(...project.schedules.bootstrap)
    runtime.tick(...project.schedules.update)

    expect(capturedCounter).toBe(1)
    expect(capturedBootCount).toBe(1)
    expect(capturedLog).toEqual(["bootstrap", "combat"])
  })

  it("uses selected feature order for aggregated schedules", () => {
    const Root = Schema.defineRoot("FeatureOrderApp")
    const Trace = Descriptor.Resource<ReadonlyArray<string>>()("FeatureOrder/Trace")

    const Core = Schema.Feature.define("Core", {
      schema: Schema.fragment({
        resources: {
          Trace
        }
      }),
      build: (Game) => {
        const bootstrap = Game.System(
          "FeatureOrder/CoreBootstrap",
          {
            resources: {
              trace: Game.System.writeResource(Trace)
            }
          },
          ({ resources }) =>
            {
              resources.trace.update((entries) => [...entries, "core-bootstrap"])
            }
        )

        const update = Game.System(
          "FeatureOrder/CoreUpdate",
          {
            resources: {
              trace: Game.System.writeResource(Trace)
            }
          },
          ({ resources }) =>
            {
              resources.trace.update((entries) => [...entries, "core-update"])
            }
        )

        return {
          bootstrap: [Game.Schedule(bootstrap)],
          update: [Game.Schedule(update)]
        }
      }
    })

    const Combat = Schema.Feature.define("Combat", {
      schema: Schema.fragment({}),
      requires: [Core] as const,
      build: (Game) => {
        const bootstrap = Game.System(
          "FeatureOrder/CombatBootstrap",
          {
            resources: {
              trace: Game.System.writeResource(Trace)
            }
          },
          ({ resources }) =>
            {
              resources.trace.update((entries) => [...entries, "combat-bootstrap"])
            }
        )

        const update = Game.System(
          "FeatureOrder/CombatUpdate",
          {
            resources: {
              trace: Game.System.writeResource(Trace)
            }
          },
          ({ resources }) =>
            {
              resources.trace.update((entries) => [...entries, "combat-update"])
            }
        )

        return {
          bootstrap: [Game.Schedule(bootstrap)],
          update: [Game.Schedule(update)]
        }
      }
    })

    const Empty = Schema.Feature.define("Empty", {
      schema: Schema.fragment({}),
      build: () => ({})
    })

    const project = Schema.Feature.compose({
      root: Root,
      features: [Combat, Core, Empty] as const
    })

    const manualRuntime = project.Game.Runtime.make({
      services: project.Game.Runtime.services(),
      resources: {
        Trace: []
      }
    })

    manualRuntime.tick(...project.schedules.bootstrap, ...project.schedules.update)

    expect(readResourceValue(manualRuntime, project.schema, Trace)).toEqual([
      "combat-bootstrap",
      "core-bootstrap",
      "combat-update",
      "core-update"
    ])
    expect(project.features.Empty.bootstrap).toEqual([])
    expect(project.features.Empty.update).toEqual([])
  })

  it("throws deterministically for duplicate or missing features when type checks are bypassed", () => {
    const Root = Schema.defineRoot("FeatureRuntimeChecks")

    const Core = Schema.Feature.define("Core", {
      schema: Schema.fragment({}),
      build: () => ({})
    })

    const Combat = Schema.Feature.define("Combat", {
      schema: Schema.fragment({}),
      requires: [Core] as const,
      build: () => ({})
    })

    expect(() =>
      Schema.Feature.compose({
        root: Root,
        features: [Core, Core]
      } as never)
    ).toThrow("Duplicate feature name: Core")

    expect(() =>
      Schema.Feature.compose({
        root: Root,
        features: [Combat]
      } as never)
    ).toThrow("Missing required feature: Core")
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
  runtime.tick(Schedule.Schedule(System.System(
      "AppTest/ReadCounterHelperSystem",
      {
        schema,
        resources: {
          counter: System.readResource(Counter)
        }
      },
      ({ resources }) =>
        {
          captured = resources.counter.get()
        }
    )))
  return captured
}

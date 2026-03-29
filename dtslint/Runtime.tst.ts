import { Descriptor, Runtime, Schema } from "../src/index.ts"
import { describe, expect, it } from "tstyche"

const Time = Descriptor.defineResource<number>()("Time")
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")

const schema = Schema.build(Schema.fragment({
  resources: {
    DeltaTime: Time
  },
  states: {
    CurrentPhase: Phase
  }
}))

describe("Runtime", () => {
  it("accepts initialization keyed by schema property names", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: {},
      resources: {
        DeltaTime: 1 / 60
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    expect(runtime).type.toBe<Runtime.Runtime<typeof schema, {}>>()
  })

  it("rejects descriptor-name keys that are not schema keys", () => {
    Runtime.makeRuntime({
      schema,
      services: {},
      resources: {
        // @ts-expect-error!
        Time: 1 / 60
      }
    })
  })

  it("rejects descriptor-name state keys that are not schema keys", () => {
    Runtime.makeRuntime({
      schema,
      services: {},
      states: {
        // @ts-expect-error!
        Phase: "Running"
      }
    })
  })
})

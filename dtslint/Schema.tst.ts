import { Descriptor, Schema } from "../src/index.ts"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Time = Descriptor.defineResource<number>()("Time")
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")
const TickEvent = Descriptor.defineEvent<{ dt: number }>()("TickEvent")

describe("Schema", () => {
  it("preserves exact fragment registries", () => {
    const fragment = Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      },
      events: {
        Tick: TickEvent
      },
      states: {
        CurrentPhase: Phase
      }
    })

    expect(fragment).type.toBe<Schema.SchemaDefinition<
      { readonly Position: typeof Position },
      { readonly DeltaTime: typeof Time },
      { readonly Tick: typeof TickEvent },
      { readonly CurrentPhase: typeof Phase }
    >>()
  })

  it("build merges fragment registries into one final schema", () => {
    const left = Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    })

    const right = Schema.fragment({
      events: {
        Tick: TickEvent
      },
      states: {
        CurrentPhase: Phase
      }
    })

    const schema = Schema.build(left, right)

    expect(schema).type.toBe<Schema.SchemaDefinition<
      { readonly Position: typeof Position },
      { readonly DeltaTime: typeof Time },
      { readonly Tick: typeof TickEvent },
      { readonly CurrentPhase: typeof Phase }
    >>()
  })

  it("rejects duplicate schema keys", () => {
    const left = Schema.fragment({
      resources: {
        DeltaTime: Time
      }
    })

    const right = Schema.fragment({
      resources: {
        DeltaTime: Descriptor.defineResource<number>()("OtherTime")
      }
    })

    // @ts-expect-error!
    Schema.merge(left, right)
  })
})

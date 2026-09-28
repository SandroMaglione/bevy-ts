import { Descriptor, Schema } from "@typeonce/bevy-ts"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.Component<{ x: number; y: number }>()("Identity/Position")
const Label = Descriptor.Component<string>()("Identity/Position")
const Health = Descriptor.Component<number>()("Identity/Health")
const Score = Descriptor.Resource<number>()("Identity/Position")

describe("descriptor identity", () => {
  it("rejects two descriptors of one kind with the same name in a fragment", () => {
    // @ts-expect-error!
    Schema.fragment({ components: { Position, Label } })
  })

  it("rejects the same descriptor name across bound fragments", () => {
    // @ts-expect-error!
    Schema.bind(Schema.fragment({ components: { Position } }), Schema.fragment({ components: { Label } }))
    // @ts-expect-error!
    Schema.bind(Schema.fragment({ components: { Position } }), Schema.fragment({ components: { Other: Position } }), Schema.defineRoot("Identity"))
  })

  it("rejects the same registry key across bound fragments", () => {
    // @ts-expect-error!
    Schema.bind(Schema.fragment({ components: { Position } }), Schema.fragment({ components: { Position: Health } }))
  })

  it("allows the same name across different descriptor kinds", () => {
    const Game = Schema.bind(Schema.fragment({ components: { Position }, resources: { Score } }))
    expect(Game.schema.resources.Score).type.toBe<typeof Score>()
  })

  it("rejects a look-alike descriptor whose value type differs from the registered one", () => {
    const Game = Schema.bind(Schema.fragment({ components: { Health } }))
    const Narrowed = Descriptor.Component<1>()("Identity/Health")
    const Widened = Descriptor.Component<number | string>()("Identity/Health")
    // @ts-expect-error!
    Game.Query.read(Narrowed)
    // @ts-expect-error!
    Game.Query.read(Widened)
    expect(Game.Query.read(Health).descriptor).type.toBe<typeof Health>()
  })

  it("allows distinct systems that share a display name", () => {
    const Game = Schema.bind(Schema.fragment({ components: { Health } }))
    const First = Game.System("Identity/Same", {}, () => {})
    const Second = Game.System("Identity/Same", {}, () => {})
    expect(Game.Schedule(First, Second).kind).type.toBe<"schedule">()
  })

  it("rejects features whose fragments reuse a descriptor name", () => {
    const Core = Schema.Feature.define("Identity/Core", {
      schema: Schema.fragment({ components: { Position } }),
      build: () => ({})
    })
    const Clash = Schema.Feature.define("Identity/Clash", {
      schema: Schema.fragment({ components: { Label } }),
      build: () => ({})
    })
    // @ts-expect-error!
    Schema.Feature.compose({ root: Schema.defineRoot("Identity/Features"), features: [Core, Clash] as const })
  })
})

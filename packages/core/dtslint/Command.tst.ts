import { Descriptor, Entity, Result, Schema } from "@bevy-ts/core"
import * as Command from "@bevy-ts/core/Command"
import * as Vector2 from "@bevy-ts/math/Vector2"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.Component<{ x: number; y: number }>()("Velocity")
const Time = Descriptor.Resource<number>()("Time")
const SafePosition = Descriptor.ConstructedComponent(Vector2)("SafePosition")

const Game = Schema.bind(Schema.fragment({
  components: {
    Position,
    Velocity,
    SafePosition
  },
  resources: {
    Time
  }
}))
const schema = Game.schema

describe("Command", () => {
  it("bound spawnWith infers the schema without an explicit generic", () => {
    const draft = Game.Command.spawn(
      [Position, { x: 0, y: 0 }],
      [Velocity, { x: 1, y: 1 }]
    )

    expect(draft).type.toBe<Entity.EntityDraft<typeof schema, {
      readonly Position: { x: number; y: number }
      readonly Velocity: { x: number; y: number }
    }, typeof schema>>()
  })

  it("spawn starts with an empty draft proof", () => {
    const draft = Command.spawn<typeof schema>()

    expect(draft).type.toBe<Entity.EntityDraft<typeof schema, {}>>()
  })

  it("insertMany widens an existing draft proof", () => {
    const draft = Command.insert(
      Command.spawn<typeof schema>(),
      [Position, { x: 0, y: 0 }] as const,
      [Velocity, { x: 1, y: 1 }] as const
    )

    expect(draft).type.toBe<Entity.EntityDraft<typeof schema, {
      readonly Position: { x: number; y: number }
      readonly Velocity: { x: number; y: number }
    }>>()
  })

  it("rejects wrong component value types", () => {
    // @ts-expect-error!
    Command.spawnWith<typeof schema>([Position, { x: "0", y: 0 }])
  })

  it("rejects non-component descriptors", () => {
    // @ts-expect-error!
    Command.entry(Time, 1)
  })

  it("entryResult preserves the descriptor-bound value type", () => {
    const entry = Command.entryResult(
      Position,
      Result.success({ x: 0, y: 0 })
    )

    expect(entry).type.toBe<Result.Result<Command.Entry<typeof Position>, unknown>>()
  })

  it("spawnWithMixed preserves proof typing and plain entry slots", () => {
    const Game = Schema.bind(schema)

    const draft = Game.Command.spawn(
      Game.Command.entry(Position, { x: 0, y: 0 }),
      Game.Command.entryResult(Velocity, Result.success({ x: 1, y: 1 }))
    )

    expect(draft).type.toBe<Result.Result<Entity.EntityDraft<typeof schema, {
      readonly Position: { x: number; y: number }
      readonly Velocity: { x: number; y: number }
    }, typeof schema>, readonly [null, unknown]>>()
  })

  it("entryRaw entries make insert return a Result with per-entry errors", () => {
    const Game = Schema.bind(schema)

    const entry = Game.Command.entryRaw(SafePosition, { x: 0, y: 0 })
    expect(entry).type.toBe<Result.Result<Command.Entry<typeof SafePosition>, Vector2.Error>>()

    const inserted = Game.Command.insert(
      Game.Command.spawn([Position, { x: 1, y: 1 }]), Game.Command.entryRaw(SafePosition, { x: 2, y: 3 }))

    expect(inserted).type.toBe<Result.Result<Entity.EntityDraft<typeof schema, {
      readonly Position: { x: number; y: number }
      readonly SafePosition: Vector2.Vector2
    }, typeof schema>, readonly [Vector2.Error | null]>>()
  })

  it("entryRaw rejects plain component descriptors", () => {
    const Game = Schema.bind(schema)

    // @ts-expect-error!
    Game.Command.entryRaw(Position, { x: 0, y: 0 })
  })
})

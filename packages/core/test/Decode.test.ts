import { describe, expect, it } from "vitest"
import { Decode, Descriptor, Entity, Result, Schema } from "@bevy-ts/core"

const Root = Schema.defineRoot("DecodeTest")

const errorOf = (result: Result.Result<unknown, Decode.DecodeError>) => result.ok ? undefined : result.error

describe("Decode", () => {
  it("accepts well-formed values and rejects others with a path", () => {
    expect(Decode.number.decode(1.5)).toEqual(Result.success(1.5))
    expect(errorOf(Decode.number.decode(Number.NaN))?.expected).toBe("finite number")
    expect(errorOf(Decode.integer.decode(1.5))?.expected).toBe("integer")
    expect(Decode.string.decode("a")).toEqual(Result.success("a"))
    expect(Decode.boolean.decode(false)).toEqual(Result.success(false))
    expect(Decode.literal("red", "blue").decode("blue")).toEqual(Result.success("blue"))
    expect(errorOf(Decode.literal("red", "blue").decode("green"))?.expected).toBe("\"red\" | \"blue\"")
    expect(Decode.nullable(Decode.number).decode(null)).toEqual(Result.success(null))

    const Inventory = Decode.struct({
      owner: Decode.string,
      slots: Decode.array(Decode.struct({ item: Decode.string, count: Decode.integer }))
    })
    expect(Inventory.decode({ owner: "a", slots: [{ item: "potion", count: 2, extra: true }], extra: 1 }))
      .toEqual(Result.success({ owner: "a", slots: [{ item: "potion", count: 2 }] }))
    expect(errorOf(Inventory.decode({ owner: "a", slots: [{ item: "potion", count: "2" }] })))
      .toEqual({ _tag: "DecodeError", path: "$.slots[0].count", expected: "integer", actual: "2" })
    expect(errorOf(Inventory.decode(null))?.path).toBe("$")
  })

  it("decodes stored handles", () => {
    const Health = Descriptor.ConstructedComponent(Decode.number)("DecodeTest/Health")
    const codec = Decode.struct({ target: Decode.handle(Root, Health) })
    const decoded = codec.decode(JSON.parse(JSON.stringify({ target: Entity.makeHandle(3) })))
    expect(decoded.ok && decoded.value.target.value).toBe(3)
    expect(errorOf(codec.decode({ target: { kind: "EntityHandle", value: 0 } }))?.path).toBe("$.target")
  })

  it("makes tags and decoded components loadable", () => {
    const Player = Descriptor.Tag("DecodeTest/Player")
    const Score = Descriptor.ConstructedResource(Decode.integer)("DecodeTest/Score")
    const Game = Schema.bind(Schema.fragment({ components: { Player }, resources: { Score } }), Root)
    const made = Game.Runtime.make({ services: Game.Runtime.services(), resources: { Score: 1 } })
    if (!made.ok) throw new Error("invalid fixture")
    const runtime = made.value
    runtime.tick(Game.Schedule(Game.System("DecodeTest/Spawn", {}, ({ commands }) => {
      commands.spawn(Game.Command.spawn([Player, {}]))
    }), Game.Schedule.applyDeferred()))

    const saved = JSON.parse(JSON.stringify(runtime.snapshot()))
    expect(runtime.restore(saved).ok).toBe(true)
    const broken = { ...saved, entities: [{ id: saved.entities[0].id, components: { "DecodeTest/Player": 1 } }] }
    const restored = runtime.restore(broken)
    expect(restored.ok ? undefined : restored.error._tag).toBe("InvalidComponent")
    expect(Game.Runtime.make({ services: Game.Runtime.services(), resources: { Score: 1.5 } }).ok).toBe(false)
  })
})

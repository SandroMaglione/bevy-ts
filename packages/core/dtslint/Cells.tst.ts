import { Decode, Descriptor, Result, Schema } from "@typeonce/bevy-ts"
import type { EntityId } from "@typeonce/bevy-ts/Entity"
import type { Query } from "@typeonce/bevy-ts/Query"
import * as Vector2 from "@typeonce/bevy-ts-math/Vector2"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.Component<{ x: number; y: number }>()("Cells/Position")
const Tags = Descriptor.Component<{ readonly names: Array<string> }>()("Cells/Tags")
const Health = Descriptor.Component<number>()("Cells/Health")
const Safe = Descriptor.ConstructedComponent(Vector2)("Cells/Safe")
const Label = Descriptor.ConstructedComponent(Decode.string)("Cells/Label")
const Frozen = Descriptor.Tag("Cells/Frozen")

const Game = Schema.bind(Schema.fragment({ components: { Position, Tags, Health, Safe, Label, Frozen } }))
const Other = Schema.bind(Schema.fragment({ components: { Health } }))

describe("query cells", () => {
  it("read cells return deeply readonly values and cannot write", () => {
    Game.System("Cells/Read", {
      queries: { items: Game.Query({ selection: { position: Game.Query.read(Position), tags: Game.Query.read(Tags) } }) }
    }, ({ queries }) => {
      for (const { data } of queries.items.each()) {
        expect(data.position.get()).type.toBe<{ readonly x: number; readonly y: number }>()
        expect(data.tags.get()).type.toBe<{ readonly names: ReadonlyArray<string> }>()
        expect(data.position).type.not.toHaveProperty("set")
        // @ts-expect-error Cannot assign to 'x' because it is a read-only property
        data.position.get().x = 1
        // @ts-expect-error Property 'push' does not exist on type 'readonly string[]'
        data.tags.get().names.push("a")
      }
    })
  })

  it("write cells take the component's value; constructed ones also validate raw input", () => {
    Game.System("Cells/Write", {
      queries: {
        items: Game.Query({ selection: { health: Game.Query.write(Health), safe: Game.Query.write(Safe), label: Game.Query.write(Label) } })
      }
    }, ({ queries }) => {
      for (const { data } of queries.items.each()) {
        expect(data.health.set).type.toBeCallableWith(3)
        expect(data.health.set).type.not.toBeCallableWith("3")
        expect(data.health.update).type.toBeCallableWith((health: number) => health + 1)
        expect(data.health).type.not.toHaveProperty("setRaw")
        expect(data.safe.setRaw({ x: 1, y: 2 })).type.toBe<Result.Result<void, Vector2.Error>>()
        // A plain object is not a validated Vector2: go through setRaw.
        expect(data.safe.set).type.not.toBeCallableWith({ x: 1, y: 2 })
        expect(data.label.setRaw).type.toBeCallableWith("name")
        expect(data.label.setRaw).type.not.toBeCallableWith(1)
      }
    })
  })

  it("optional cells must be narrowed before reading", () => {
    Game.System("Cells/Optional", {
      queries: { items: Game.Query({ selection: { health: Game.Query.optional(Health) } }) }
    }, ({ queries }) => {
      for (const { data } of queries.items.each()) {
        expect(data.health.present).type.toBe<boolean>()
        // @ts-expect-error Property 'get' does not exist on type 'AbsentOptionalReadCell'
        data.health.get()
        if (data.health.present) expect(data.health.get()).type.toBe<number>()
      }
    })
  })

  it("filters add no slots, and slots must be declared", () => {
    Game.System("Cells/Filters", {
      queries: {
        items: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Frozen], without: [Position] })
      }
    }, ({ queries }) => {
      for (const { data, entity } of queries.items.each()) {
        expect(data).type.not.toHaveProperty("frozen")
        expect(data).type.not.toHaveProperty("position")
        expect(entity.id).type.toBe<EntityId<typeof Game.schema, typeof Game.schema>>()
      }
      expect(queries.items.single()).type.toBe<Result.Result<(typeof queries.items.each extends () => ReadonlyArray<infer M> ? M : never), Query.SingleError>>()
    })
  })

  it("queries only accept descriptors of their schema", () => {
    // @ts-expect-error Type '"Cells/Frozen"' is not assignable to type '"Cells/Health"'
    Other.Query.read(Frozen)
  })
})

describe("commands", () => {
  it("spawn returns a typed id and insert checks each entry against its descriptor", () => {
    Game.System("Cells/Commands", {}, ({ commands }) => {
      const id = commands.spawn(Game.Command.spawn([Health, 1]))
      expect(id).type.toBe<EntityId<typeof Game.schema, typeof Game.schema>>()
      expect(commands.insert).type.toBeCallableWith(id, [Health, 2], [Position, { x: 0, y: 0 }])
      expect(commands.insert).type.not.toBeCallableWith(id, [Health, "2"])
      expect(commands.insert).type.not.toBeCallableWith(id, [Position, 2])
      expect(commands.remove).type.toBeCallableWith(id, Health)
      expect(commands.despawn).type.not.toBeCallableWith(1)
    })
  })
})

import { Descriptor, Schema } from "@typeonce/bevy-ts"
import { describe, expect, it } from "tstyche"

const Hp = Descriptor.Component<number>()("Entries/Hp")
const Name = Descriptor.Component<string>()("Entries/Name")
const Phase = Descriptor.State("Entries/Phase", ["ready", "windup"] as const)
const Stranger = Descriptor.Component<number>()("Entries/Stranger")

const Game = Schema.bind(Schema.fragment({ components: { Hp, Name, Phase } }))

describe("spawn and insert entries", () => {
  it("accept each descriptor with its own value", () => {
    expect(Game.Command.spawn([Hp, 1], [Name, "n"], [Phase, "ready"])).type.not.toRaiseError()
    expect(Game.Command.insert(Game.Command.spawn([Hp, 1]), [Name, "n"])).type.not.toRaiseError()
  })

  it("reject a value that belongs to another component of the schema", () => {
    // @ts-expect-error Argument of type '[Descriptor<"component", "Entries/Hp", number>, "x"]' is not assignable to parameter of type 'SpawnEntry<
    Game.Command.spawn([Hp, "x"])
    // @ts-expect-error Argument of type '[Descriptor<"component", "Entries/Name", string>, number]' is not assignable to parameter of type 'SpawnEntry<
    Game.Command.spawn([Hp, 1], [Name, 2])
    // @ts-expect-error Argument of type '[StateDescriptor<"Entries/Phase", readonly ["ready", "windup"], undefined>, "a"]' is not assignable to parameter of type 'SpawnEntry<
    Game.Command.spawn([Phase, "a"])
    // @ts-expect-error Argument of type '[Descriptor<"component", "Entries/Name", string>, number]' is not assignable to parameter of type 'SpawnEntry<
    Game.Command.insert(Game.Command.spawn([Hp, 1]), [Name, 3])
  })

  it("reject descriptors outside the schema", () => {
    // @ts-expect-error Argument of type '[Descriptor<"component", "Entries/Stranger", number>, number]' is not assignable to parameter of type 'SpawnEntry<
    Game.Command.spawn([Stranger, 1])
  })
})

import { describe, expect, it } from "vitest"
import { Descriptor, Schema } from "@typeonce/ritmo"

const Position = Descriptor.Component<{ x: number }>()("Requires/Position")
const Velocity = Descriptor.Component<{ x: number }>()("Requires/Velocity")
const Body = Descriptor.Component<{}>()("Requires/Body")
const Player = Descriptor.Component<{}>()("Requires/Player")

const Game = Schema.bind(
  Schema.fragment({ components: { Position, Velocity, Body } }),
  Schema.fragment({
    components: { Player },
    requires: [Schema.requires(Player, Body, Velocity), Schema.requires(Body, Position)]
  })
)

describe("Schema.requires", () => {
  it("merges requirements across fragments", () => {
    expect(Game.schema.requires.map((requirement) => [requirement.component.name, requirement.required.map((d) => d.name)])).toEqual([
      ["Requires/Player", ["Requires/Body", "Requires/Velocity"]],
      ["Requires/Body", ["Requires/Position"]]
    ])
  })

  it("expands spawns(...) to what the components require, transitively", () => {
    expect(Game.System.spawns(Player).values.map((descriptor) => descriptor.name)).toEqual([
      "Requires/Player",
      "Requires/Body",
      "Requires/Position",
      "Requires/Velocity"
    ])
  })

  it("rejects an erased requirement naming an unregistered component", () => {
    const erased = Schema.fragment({ components: { Player }, requires: [Schema.requires(Player, Position)] }) as Schema.Schema.Any
    expect(() => Schema.bind(erased)).toThrow("Requires/Position is named in Schema.requires(...) but no fragment registers it")
  })
})

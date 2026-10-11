import { describe, expect, it } from "tstyche"
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import * as Aabb from "@typeonce/bevy-ts-math/Aabb"
import * as Direction2 from "@typeonce/bevy-ts-math/Direction2"
import * as Scalar from "@typeonce/bevy-ts-math/Scalar"
import * as Vector2 from "@typeonce/bevy-ts-math/Vector2"

describe("canonical shape types", () => {
  it("checks raw AABBs without asserting token-backed constructed identity", () => {
    const raw = { position: { x: 0, y: 0 }, size: { width: 2, height: 2 } }
    expect(Aabb.is(raw)).type.toBe<boolean>()
    if (Aabb.is(raw)) {
      // @ts-expect-error Property '[internal.token]' is missing
      Aabb.left(raw)
    }
    const constructed = Aabb.result(raw)
    if (!constructed.ok) return
    expect(Aabb.left({ ...constructed.value })).type.toBe<Scalar.Finite>()
    expect(Aabb.position({ ...constructed.value })).type.toBe<Vector2.Vector2>()
  })

  it("accepts canonical geometry read through ECS resources", () => {
    const Box = Descriptor.Resource<Aabb.Aabb>()("Canonical/Box")
    const Facing = Descriptor.Resource<Direction2.Direction2>()("Canonical/Facing")
    const Game = Schema.bind(Schema.fragment({ resources: { Box, Facing } }))
    Game.System("Canonical/Read", { resources: { box: Game.System.readResource(Box), facing: Game.System.readResource(Facing) } }, ({ resources }) => {
      expect(Aabb.right(resources.box.get())).type.toBe<Scalar.Finite>()
      expect(Direction2.toVector(resources.facing.get())).type.toBe<Vector2.Vector2>()
      expect(Direction2.normalizeOr(Vector2.zero(), resources.facing.get())).type.toBe<Direction2.Direction2>()
    })
  })
})

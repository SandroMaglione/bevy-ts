import { describe, expect, it } from "vitest"
import * as Aabb from "@typeonce/bevy-ts-math/Aabb"
import * as Direction2 from "@typeonce/bevy-ts-math/Direction2"
import * as Vector2 from "@typeonce/bevy-ts-math/Vector2"
import * as Size2 from "@typeonce/bevy-ts-math/Size2"
import * as Scalar from "@typeonce/bevy-ts-math/Scalar"

describe("canonical geometry identities", () => {
  it("keeps AABB edges and translations tied to constructed data through spreads", () => {
    const box = Aabb.result({ position: { x: 1, y: 2 }, size: { width: 2, height: 4 } })
    const hugePosition = Vector2.result({ x: Number.MAX_VALUE, y: 0 })
    const hugeSize = Size2.result({ width: Number.MAX_VALUE, height: 4 })
    if (!box.ok || !hugePosition.ok || !hugeSize.ok) throw new Error("Fixture failed")
    const copied = { ...box.value, position: hugePosition.value, size: hugeSize.value }
    expect(Aabb.position(copied)).toBe(Aabb.position(box.value))
    expect(Aabb.size(copied)).toBe(Aabb.size(box.value))
    expect(Aabb.left(copied)).toBe(0)
    expect(Aabb.right(copied)).toBe(2)
    expect(Aabb.top(copied)).toBe(0)
    expect(Aabb.bottom(copied)).toBe(4)
    expect(Aabb.intersects(copied, box.value)).toBe(true)
    expect(Aabb.overlapsHorizontally(copied, box.value)).toBe(true)
    expect(Aabb.overlapsVertically(copied, box.value)).toBe(true)
    const moved = Aabb.translate(copied, Vector2.zero())
    expect(moved.ok).toBe(true)
    if (moved.ok) expect(Aabb.right(moved.value)).toBe(2)
    expect(Object.isFrozen(box.value)).toBe(true)
    expect(Object.isFrozen(Aabb.position(box.value))).toBe(true)
    expect(Object.isFrozen(Aabb.size(box.value))).toBe(true)
  })

  it("reconstructs AABB snapshots through JSON decode and leaves raw validation unmodified", () => {
    const raw = Object.freeze({ position: Object.freeze({ x: 3, y: 4 }), size: Object.freeze({ width: 2, height: 6 }) })
    expect(Aabb.is(raw)).toBe(true)
    expect(Aabb.is({ position: { x: 3, y: 4 }, size: { width: -2, height: 6 } })).toBe(false)
    expect(Object.getOwnPropertySymbols(raw)).toHaveLength(0)
    const box = Aabb.option(raw)
    if (box === null) throw new Error("Fixture failed")
    const serialized = JSON.stringify(box)
    expect(JSON.parse(serialized)).toEqual(raw)
    const restored = Aabb.decode(JSON.parse(serialized))
    expect(restored.ok).toBe(true)
    if (restored.ok) {
      expect(Aabb.left(restored.value)).toBe(2)
      expect(Aabb.bottom(restored.value)).toBe(7)
      expect(Aabb.intersects(box, restored.value)).toBe(true)
    }
  })

  it("retains unit directions when copied metadata changes", () => {
    const original = Direction2.result({ x: 3, y: 4 })
    const ten = Scalar.Finite.result(10)
    if (!original.ok || !ten.ok) throw new Error("Fixture failed")
    const copied = { ...original.value, x: ten.value, y: ten.value }
    expect(Direction2.toVector(copied)).toEqual({ x: 0.6, y: 0.8 })
    const fallback = Direction2.normalizeOr(Vector2.zero(), copied)
    expect(fallback).toBe(original.value)
    expect(Math.hypot(fallback.x, fallback.y)).toBeCloseTo(1, 14)
    expect(Object.isFrozen(original.value)).toBe(true)
    const restored = Direction2.decode(JSON.parse(JSON.stringify(original.value)))
    expect(restored.ok).toBe(true)
    if (restored.ok) {
      const vector = Direction2.toVector(restored.value)
      expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1, 14)
      expect(vector.x).toBeCloseTo(0.6, 14)
      expect(vector.y).toBeCloseTo(0.8, 14)
    }
  })
})

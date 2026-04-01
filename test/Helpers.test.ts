import { describe, expect, it } from "vitest"

import { Aabb, InputAxis, Result, Scalar, Size2, Vector2 } from "../src/index.ts"

describe("helpers", () => {
  it("rejects invalid scalar and geometry inputs", () => {
    expect(Scalar.Finite.result(Number.NaN).ok).toBe(false)
    expect(Size2.result({ width: -1, height: 2 }).ok).toBe(false)
    expect(Vector2.result({ x: Number.POSITIVE_INFINITY, y: 0 }).ok).toBe(false)
    expect(Aabb.result({
      position: { x: 0, y: 0 },
      size: { width: -1, height: 1 }
    }).ok).toBe(false)
  })

  it("normalizes movement explicitly and without mutating the source", () => {
    const raw = { x: 3, y: 4 } as const
    const vector = Vector2.result(raw)
    expect(vector.ok).toBe(true)
    if (!vector.ok) {
      return
    }

    const normalized = Vector2.normalize(vector.value)
    expect(normalized.ok).toBe(true)
    if (!normalized.ok) {
      return
    }

    expect(raw).toEqual({ x: 3, y: 4 })
    expect(Vector2.toRaw(vector.value)).toEqual({ x: 3, y: 4 })
    expect(Vector2.length(normalized.value)).toBeCloseTo(1)
  })

  it("returns an explicit failure for zero-length normalization", () => {
    const zero = Vector2.zero()
    const normalized = Vector2.normalize(zero)

    expect(normalized).toEqual(Result.failure({
      tag: "Vector2/ZeroLength"
    }))
    expect(Vector2.normalizeOrZero(zero)).toEqual(zero)
  })

  it("creates immutable raw copies", () => {
    const vector = Vector2.option({ x: 5, y: 7 })
    expect(vector).not.toBeNull()
    if (!vector) {
      return
    }

    const raw = Vector2.toRaw(vector)
    expect(Vector2.toRaw(vector)).toEqual({ x: 5, y: 7 })
    expect(raw).not.toBe(vector)
  })

  it("derives axis-aligned input vectors and AABB intersections", () => {
    const direction = InputAxis.vectorFromAxes({
      left: false,
      right: true,
      up: true,
      down: false
    })
    expect(direction.x).toBeGreaterThan(0)
    expect(direction.y).toBeLessThan(0)

    const first = Aabb.option({
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 }
    })
    const second = Aabb.option({
      position: { x: 4, y: 0 },
      size: { width: 10, height: 10 }
    })

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    if (!first || !second) {
      return
    }

    expect(Aabb.intersects(first, second)).toBe(true)
    expect(Aabb.intersects(first, Aabb.translate(second, Vector2.option({ x: 20, y: 0 })!))).toBe(false)
  })
})

import { describe, expect, it } from "vitest"

import { Definition, Result } from "@typeonce/bevy-ts"
import { Aabb, Angle, Direction2, InputAxis, Scalar, Size2, Vector2 } from "@typeonce/bevy-ts-math"

const checked = <A, E>(result: Result.Result<A, E>): A => {
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.value
}
const finite = (number: number) => checked(Scalar.Finite.result(number))
const nonNegative = (number: number) => checked(Scalar.NonNegative.result(number))
const vector = (x: number, y: number) => checked(Vector2.result({ x, y }))

describe("helpers", () => {
  it("matches explicit success and failure branches", () => {
    expect(Result.match(Result.success(3), {
      onSuccess: (value) => value + 1,
      onFailure: () => 0
    })).toBe(4)

    expect(Result.match(Result.failure("invalid"), {
      onSuccess: () => 0,
      onFailure: (error) => error
    })).toBe("invalid")
  })

  it("aggregates tuple and record results", () => {
    expect(Result.all([
      Result.success(1),
      Result.success("two")
    ] as const)).toEqual(Result.success([1, "two"]))

    expect(Result.all({
      x: Result.success(1),
      y: Result.success("two")
    })).toEqual(Result.success({
      x: 1,
      y: "two"
    }))
  })

  it("returns the first failure while aggregating results", () => {
    expect(Result.all([
      Result.success(1),
      Result.failure("boom"),
      Result.failure("later")
    ] as const)).toEqual(Result.failure("boom"))

    expect(Result.all({
      ok: Result.success(1),
      fail: Result.failure("boom")
    })).toEqual(Result.failure("boom"))
  })

  it("defines reusable validated values with keyed failures", () => {
    expect(Definition.entry(Vector2, { x: 1, y: 2 })).toEqual(
      Vector2.result({ x: 1, y: 2 })
    )

    expect(Definition.all({
      position: Definition.entry(Vector2, { x: 1, y: 2 }),
      size: Definition.entry(Size2, { width: 3, height: 4 })
    })).toEqual(Result.success({
      position: Vector2.option({ x: 1, y: 2 }),
      size: Size2.option({ width: 3, height: 4 })
    }))

    expect(Definition.all({
      position: Definition.entry(Vector2, { x: Number.NaN, y: 2 }),
      size: Definition.entry(Size2, { width: 3, height: 4 })
    })).toEqual(Result.failure({
      position: {
        tag: "Vector2/Invalid",
        x: {
          tag: "Scalar/NotFinite",
          value: Number.NaN
        },
        y: null,
        input: {
          x: Number.NaN,
          y: 2
        }
      },
      size: null
    }))
  })

  it("rejects invalid scalar and geometry inputs", () => {
    expect(Scalar.Finite.result(Number.NaN).ok).toBe(false)
    expect(Size2.result({ width: -1, height: 2 }).ok).toBe(false)
    expect(Vector2.result({ x: Number.POSITIVE_INFINITY, y: 0 }).ok).toBe(false)
    expect(Aabb.result({
      position: { x: 0, y: 0 },
      size: { width: -1, height: 1 }
    }).ok).toBe(false)
  })

  it("interpolates finite scalar values", () => {
    const start = Scalar.Finite.result(10)
    const end = Scalar.Finite.result(20)
    const amount = Scalar.Finite.result(0.25)
    expect(start.ok && end.ok && amount.ok).toBe(true)
    if (!start.ok || !end.ok || !amount.ok) {
      return
    }

    expect(Scalar.lerp(start.value, end.value, amount.value)).toEqual(Result.success(12.5))
  })

  it("computes inverse interpolation and remap explicitly", () => {
    const zero = Scalar.Finite.result(0)
    const ten = Scalar.Finite.result(10)
    const five = Scalar.Finite.result(5)
    const hundred = Scalar.Finite.result(100)
    const twoHundred = Scalar.Finite.result(200)
    expect(zero.ok && ten.ok && five.ok && hundred.ok && twoHundred.ok).toBe(true)
    if (!zero.ok || !ten.ok || !five.ok || !hundred.ok || !twoHundred.ok) {
      return
    }

    expect(Scalar.inverseLerp(zero.value, ten.value, five.value)).toEqual(Result.success(0.5))
    expect(
      Scalar.remap(five.value, zero.value, ten.value, hundred.value, twoHundred.value)
    ).toEqual(Result.success(150))
  })

  it("fails inverse interpolation and remap for zero-sized input ranges", () => {
    const zero = Scalar.Finite.result(0)
    const five = Scalar.Finite.result(5)
    const ten = Scalar.Finite.result(10)
    expect(zero.ok && five.ok && ten.ok).toBe(true)
    if (!zero.ok || !five.ok || !ten.ok) {
      return
    }

    const error = {
      tag: "Scalar/ZeroRange" as const,
      start: 5,
      end: 5
    }

    expect(Scalar.inverseLerp(five.value, five.value, ten.value)).toEqual(Result.failure(error))
    expect(Scalar.remap(ten.value, five.value, five.value, zero.value, ten.value)).toEqual(Result.failure(error))
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
    expect(checked(Vector2.length(normalized.value))).toBeCloseTo(1)
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
    expect(Aabb.intersects(first, checked(Aabb.translate(second, vector(20, 0))))).toBe(false)
  })

  it("decodes untrusted input of any shape", () => {
    expect(Vector2.decode({ x: 1, y: 2 }).ok).toBe(true)
    expect(Size2.decode({ width: 1, height: 2 }).ok).toBe(true)
    expect(Aabb.decode({ position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }).ok).toBe(true)
    for (const raw of [null, 3, "x", [], { x: "1", y: 2 }]) {
      const decoded = Vector2.decode(raw)
      expect(decoded.ok ? undefined : decoded.error.tag).toBe("Vector2/Malformed")
    }
    const invalid = Vector2.decode({ x: Number.NaN, y: 0 })
    expect(invalid.ok ? undefined : invalid.error.tag).toBe("Vector2/Invalid")
    const box = Aabb.decode({ position: null, size: { width: 1, height: 1 } })
    expect(box.ok ? undefined : box.error.tag).toBe("Aabb/Malformed")
    expect(Size2.decode({ width: 1 }).ok).toBe(false)
  })

  it("validates the scalar refinement hierarchy and closed fractions", () => {
    for (const number of [0, 0.5, 1]) expect(Scalar.Fraction.result(number)).toEqual(Result.success(number))
    for (const number of [-0.01, 1.01, NaN, Infinity]) expect(Scalar.Fraction.result(number).ok).toBe(false)
    expect(Scalar.Positive.result(0).ok).toBe(false)
    expect(Scalar.NonNegative.result(-1).ok).toBe(false)
    expect(Scalar.Positive.result(Number.MIN_VALUE).ok).toBe(true)
  })

  it("checks scalar bounds and avoids needless overflow between opposite extremes", () => {
    expect(Scalar.clamp(finite(5), finite(0), finite(3))).toEqual(Result.success(3))
    expect(Scalar.clamp(finite(0), finite(0), finite(0))).toEqual(Result.success(0))
    expect(Scalar.clamp(finite(5), finite(3), finite(0))).toMatchObject({ ok: false, error: { tag: "Scalar/ReversedRange" } })
    const positive = finite(Number.MAX_VALUE)
    const negative = finite(-Number.MAX_VALUE)
    expect(Scalar.lerp(negative, positive, finite(0.5))).toEqual(Result.success(0))
    expect(Scalar.lerp(negative, positive, finite(0))).toEqual(Result.success(-Number.MAX_VALUE))
    expect(Scalar.lerp(negative, positive, finite(1))).toEqual(Result.success(Number.MAX_VALUE))
    expect(Scalar.inverseLerp(negative, positive, finite(0))).toEqual(Result.success(0.5))
    expect(Scalar.remap(finite(0), negative, positive, finite(0), finite(10))).toEqual(Result.success(5))
    expect(Scalar.lerp(finite(0), positive, finite(2))).toMatchObject({ ok: false, error: { tag: "Scalar/Overflow" } })
    expect(Scalar.inverseLerp(finite(0), finite(Number.MIN_VALUE), finite(1)).ok).toBe(false)
    expect(Scalar.remap(finite(2), finite(0), finite(1), finite(0), positive).ok).toBe(false)
    expect(Scalar.approach(negative, positive, nonNegative(Number.MAX_VALUE))).toBe(0)
    expect(Scalar.approach(finite(4), finite(5), nonNegative(2))).toBe(5)
    expect(Scalar.approach(finite(5), finite(4), nonNegative(0))).toBe(5)
  })

  it("computes vector arithmetic, interpolation, rotation, and distances explicitly", () => {
    const left = vector(3, 4)
    const right = vector(1, 2)
    expect(Vector2.add(left, right)).toEqual(Result.success({ x: 4, y: 6 }))
    expect(Vector2.subtract(left, right)).toEqual(Result.success({ x: 2, y: 2 }))
    expect(Vector2.scale(left, finite(2))).toEqual(Result.success({ x: 6, y: 8 }))
    expect(Vector2.lengthSquared(left)).toEqual(Result.success(25))
    expect(Vector2.length(left)).toEqual(Result.success(5))
    expect(Vector2.distanceSquared(left, right)).toEqual(Result.success(8))
    expect(checked(Vector2.distance(left, right))).toBeCloseTo(Math.sqrt(8))
    expect(Vector2.dot(left, right)).toEqual(Result.success(11))
    expect(Vector2.lerp(left, right, finite(0.5))).toEqual(Result.success({ x: 2, y: 3 }))
    const rotated = checked(Vector2.rotate(vector(1, 0), checked(Angle.result(Math.PI / 2))))
    expect(rotated.x).toBeCloseTo(0)
    expect(rotated.y).toBeCloseTo(1)
  })

  it("returns explicit vector overflow instead of invalid finite brands", () => {
    const huge = vector(Number.MAX_VALUE, Number.MAX_VALUE)
    const opposite = vector(-Number.MAX_VALUE, -Number.MAX_VALUE)
    for (const result of [
      Vector2.add(huge, huge), Vector2.subtract(huge, opposite), Vector2.scale(huge, finite(2)),
      Vector2.lengthSquared(huge), Vector2.length(huge), Vector2.distance(huge, opposite),
      Vector2.distanceSquared(huge, opposite), Vector2.dot(huge, huge),
      Vector2.rotate(huge, finite(Math.PI / 4)), Vector2.lerp(Vector2.zero(), huge, finite(2)),
      Vector2.moveToward(huge, opposite, nonNegative(1))
    ]) expect(result).toMatchObject({ ok: false, error: { tag: "Scalar/Overflow" } })
    expect(Vector2.lerp(huge, opposite, finite(0.5))).toEqual(Result.success({ x: 0, y: 0 }))
    expect(Vector2.length(vector(1e200, 0))).toEqual(Result.success(1e200))
    expect(Vector2.lengthSquared(vector(1e200, 0)).ok).toBe(false)
  })

  it("normalizes huge and subnormal inputs without erasing their direction", () => {
    for (const component of [Number.MAX_VALUE, 1e200, 1e-200, Number.MIN_VALUE]) {
      const normalized = checked(Vector2.normalize(vector(component, component)))
      expect(normalized.x).toBeCloseTo(Math.SQRT1_2, 14)
      expect(normalized.y).toBeCloseTo(Math.SQRT1_2, 14)
      expect(Math.hypot(normalized.x, normalized.y)).toBeCloseTo(1, 14)
    }
    const fallback = vector(3, 4)
    expect(Vector2.normalizeOr(Vector2.zero(), fallback)).toBe(fallback)
    expect(Vector2.normalizeOr(vector(0, 10), fallback)).toEqual({ x: 0, y: 1 })
  })

  it("moves and clamps without overshooting or confusing rest with direction", () => {
    expect(Vector2.moveToward(Vector2.zero(), vector(3, 4), nonNegative(2))).toEqual(Result.success({ x: 1.2, y: 1.6 }))
    expect(Vector2.moveToward(Vector2.zero(), vector(3, 4), nonNegative(10))).toEqual(Result.success({ x: 3, y: 4 }))
    expect(Vector2.moveToward(vector(3, 4), vector(3, 4), nonNegative(0))).toEqual(Result.success({ x: 3, y: 4 }))
    expect(Vector2.clampLength(vector(3, 4), nonNegative(2))).toEqual(Result.success({ x: 1.2, y: 1.6 }))
    expect(Vector2.clampLength(Vector2.zero(), nonNegative(0))).toEqual(Result.success({ x: 0, y: 0 }))
    const clamped = checked(Vector2.clampLength(vector(Number.MAX_VALUE, Number.MAX_VALUE), nonNegative(1)))
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(1, 14)
  })

  it("constructs nonzero directions, decodes saved values, and respects the fallback", () => {
    const facing = checked(Direction2.result({ x: 3, y: 4 }))
    expect(Direction2.toVector(facing)).toEqual({ x: 0.6, y: 0.8 })
    expect(Direction2.result({ x: 0, y: 0 })).toEqual(Result.failure({ tag: "Vector2/ZeroLength" }))
    expect(Direction2.result({ x: NaN, y: 1 }).ok).toBe(false)
    expect(Direction2.toVector(checked(Direction2.decode({ x: 0, y: 7 })))).toEqual({ x: 0, y: 1 })
    expect(Direction2.decode(null).ok).toBe(false)
    expect(Direction2.normalizeOr(Vector2.zero(), facing)).toBe(facing)
    expect(Direction2.toVector(Direction2.normalizeOr(vector(0, -1), facing))).toEqual({ x: 0, y: -1 })
    const viewed = Direction2.toVector(facing)
    expect(viewed).toEqual({ x: 0.6, y: 0.8 })
    expect(viewed).not.toBe(facing)
  })

  it("wraps radians and finds the shortest signed turn even across extreme values", () => {
    const radians = (number: number) => checked(Angle.result(number))
    expect(Angle.wrap(radians(Math.PI))).toBe(-Math.PI)
    expect(Angle.wrap(radians(-Math.PI))).toBe(-Math.PI)
    expect(Angle.wrap(radians(5 * Math.PI))).toBeCloseTo(-Math.PI)
    expect(Angle.difference(radians(170 * Math.PI / 180), radians(-170 * Math.PI / 180))).toBeCloseTo(20 * Math.PI / 180)
    expect(Angle.difference(radians(-170 * Math.PI / 180), radians(170 * Math.PI / 180))).toBeCloseTo(-20 * Math.PI / 180)
    expect(Angle.decode("90")).toEqual(Result.failure({ tag: "Angle/Malformed", input: "90" }))
    expect(Angle.result(Infinity).ok).toBe(false)
    for (const angle of [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE]) {
      const wrapped = Angle.wrap(radians(angle))
      expect(Number.isFinite(wrapped)).toBe(true)
      expect(wrapped).toBeGreaterThanOrEqual(-Math.PI)
      expect(wrapped).toBeLessThan(Math.PI)
    }
    expect(Number.isFinite(Angle.difference(radians(-Number.MAX_VALUE), radians(Number.MAX_VALUE)))).toBe(true)
  })

  it("rejects overflowed AABB edges and translation while preserving strict intersections", () => {
    expect(Aabb.result({ position: { x: Number.MAX_VALUE, y: 0 }, size: { width: Number.MAX_VALUE, height: 1 } })).toMatchObject({ ok: false, error: { tag: "Aabb/EdgeOverflow" } })
    const far = checked(Aabb.result({ position: { x: Number.MAX_VALUE, y: 0 }, size: { width: 0, height: 0 } }))
    expect(Aabb.translate(far, vector(Number.MAX_VALUE, 0))).toMatchObject({ ok: false, error: { tag: "Scalar/Overflow" } })
    const first = checked(Aabb.result({ position: { x: 0, y: 0 }, size: { width: 2, height: 2 } }))
    const touching = checked(Aabb.translate(first, vector(2, 0)))
    expect(Aabb.intersects(first, touching)).toBe(false)
    expect(Aabb.overlapsHorizontally(first, touching)).toBe(false)
    expect(Aabb.overlapsVertically(first, touching)).toBe(true)
    expect(Aabb.left(first)).toBe(-1)
    expect(Aabb.right(first)).toBe(1)
    expect(Aabb.top(first)).toBe(-1)
    expect(Aabb.bottom(first)).toBe(1)
  })
})

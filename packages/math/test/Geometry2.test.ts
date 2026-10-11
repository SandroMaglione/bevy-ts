import { describe, expect, it } from "vitest"
import type * as Result from "@typeonce/bevy-ts/Result"
import * as Aabb from "@typeonce/bevy-ts-math/Aabb"
import * as Direction2 from "@typeonce/bevy-ts-math/Direction2"
import * as Geometry2 from "@typeonce/bevy-ts-math/Geometry2"
import * as Vector2 from "@typeonce/bevy-ts-math/Vector2"

const value = <A, E>(result: Result.Result<A, E>): A => {
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.value
}
const vector = (x: number, y: number) => value(Vector2.result({ x, y }))
const circle = (x: number, y: number, radius: number) => value(Geometry2.Circle.result({ center: { x, y }, radius }))
const box = (x: number, y: number, width: number, height: number) => value(Aabb.result({ position: { x, y }, size: { width, height } }))
const unitBox = box(0, 0, 2, 2)

describe("Geometry2", () => {
  it("validates every shape and rejects malformed or nonrepresentable bounds", () => {
    expect(Geometry2.Circle.result({ center: { x: 0, y: 0 }, radius: -1 }).ok).toBe(false)
    expect(Geometry2.Circle.result({ center: { x: Number.MAX_VALUE, y: 0 }, radius: Number.MAX_VALUE }).ok).toBe(false)
    expect(Geometry2.Segment.result({ start: { x: NaN, y: 0 }, end: { x: 1, y: 0 } }).ok).toBe(false)
    expect(Geometry2.Capsule.result({ segment: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, radius: Infinity }).ok).toBe(false)
    expect(Geometry2.Capsule.result({ segment: { start: { x: 0, y: 0 }, end: { x: Number.MAX_VALUE, y: 0 } }, radius: Number.MAX_VALUE }).ok).toBe(false)
    expect(Geometry2.Circle.decode({ center: { x: 1, y: 2 }, radius: 0 }).ok).toBe(true)
    expect(Geometry2.Segment.decode({ start: { x: 1, y: 2 }, end: { x: 1, y: 2 } }).ok).toBe(true)
    expect(Geometry2.Capsule.decode({ segment: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, radius: 1 }).ok).toBe(true)
    for (const malformed of [null, [], 1, { center: { x: "1", y: 2 }, radius: 1 }]) {
      const decoded = Geometry2.Circle.decode(malformed)
      expect(decoded.ok ? undefined : decoded.error.tag).toBe("Geometry2/Malformed")
    }
    expect(Geometry2.Segment.decode({ start: null, end: { x: 1, y: 0 } }).ok).toBe(false)
    expect(Geometry2.Capsule.decode({ segment: {}, radius: 1 }).ok).toBe(false)
  })

  it("includes tangency in circle, box, and capsule overlap", () => {
    expect(value(Geometry2.circleTouchesCircle(circle(0, 0, 1), circle(2, 0, 1)))).toBe(true)
    expect(value(Geometry2.circleTouchesCircle(circle(0, 0, 1), circle(2.01, 0, 1)))).toBe(false)
    expect(value(Geometry2.circleTouchesAabb(circle(2, 0, 1), unitBox))).toBe(true)
    expect(value(Geometry2.circleTouchesAabb(circle(2, 2, 1), unitBox))).toBe(false)
    const capsule = value(Geometry2.Capsule.result({ segment: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 } }, radius: 1 }))
    expect(value(Geometry2.circleTouchesCapsule(circle(1, 2, 1), capsule))).toBe(true)
    expect(value(Geometry2.circleTouchesCapsule(circle(4, 0, 1), capsule))).toBe(true)
    expect(value(Geometry2.circleTouchesCapsule(circle(4.01, 0, 1), capsule))).toBe(false)
  })

  it("projects onto the closed segment and handles a segment reduced to a point", () => {
    const segment = value(Geometry2.Segment.result({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }))
    expect(value(Geometry2.closestPointOnSegment(vector(3, 5), segment))).toEqual({ x: 3, y: 0 })
    expect(value(Geometry2.closestPointOnSegment(vector(-1, 5), segment))).toEqual({ x: 0, y: 0 })
    expect(value(Geometry2.closestPointOnSegment(vector(11, 5), segment))).toEqual({ x: 10, y: 0 })
    const point = value(Geometry2.Segment.result({ start: { x: 2, y: 3 }, end: { x: 2, y: 3 } }))
    expect(value(Geometry2.closestPointOnSegment(vector(3, 5), point))).toEqual({ x: 2, y: 3 })
  })

  it("finds the first circle contact and an outward unit normal", () => {
    const hit = value(Geometry2.sweepCircleCircle(circle(-4, 0, 1), vector(8, 0), circle(0, 0, 1)))
    expect(hit.tag).toBe("Geometry2/Contact")
    if (hit.tag !== "Geometry2/Contact") return
    expect(hit.time).toBeCloseTo(0.25)
    expect(Direction2.toVector(hit.normal)).toEqual({ x: -1, y: 0 })
    expect(value(Geometry2.sweepCircleCircle(circle(-4, 0, 1), vector(-8, 0), circle(0, 0, 1))).tag).toBe("Geometry2/Miss")
    expect(value(Geometry2.sweepCircleCircle(circle(-4, 3, 1), vector(8, 0), circle(0, 0, 1))).tag).toBe("Geometry2/Miss")
    expect(value(Geometry2.sweepCircleCircle(circle(-4, 0, 1), vector(2, 0), circle(0, 0, 1)))).toMatchObject({ tag: "Geometry2/Contact", time: 1 })
  })

  it("finds circle tangency without making it an initial overlap", () => {
    const hit = value(Geometry2.sweepCircleCircle(circle(-3, 2, 1), vector(6, 0), circle(0, 0, 1)))
    expect(hit.tag).toBe("Geometry2/Contact")
    if (hit.tag !== "Geometry2/Contact") return
    expect(hit.time).toBeCloseTo(0.5)
    expect(hit.normal.x).toBeCloseTo(0)
    expect(hit.normal.y).toBeCloseTo(1)
  })

  it("distinguishes initial touch, penetration, and stationary misses", () => {
    for (const delta of [vector(0, 0), vector(-5, 0), vector(5, 0)]) {
      expect(value(Geometry2.sweepCircleCircle(circle(-2, 0, 1), delta, circle(0, 0, 1))).tag).toBe("Geometry2/InitialOverlap")
      expect(value(Geometry2.sweepCircleAabb(circle(-2, 0, 1), delta, unitBox)).tag).toBe("Geometry2/InitialOverlap")
    }
    expect(value(Geometry2.sweepCircleCircle(circle(0, 0, 1), vector(0, 0), circle(0, 0, 1))).tag).toBe("Geometry2/InitialOverlap")
    expect(value(Geometry2.sweepCircleCircle(circle(-4, 0, 1), vector(0, 0), circle(0, 0, 1))).tag).toBe("Geometry2/Miss")
    expect(value(Geometry2.sweepCircleAabb(circle(-4, 0, 1), vector(0, 0), unitBox)).tag).toBe("Geometry2/Miss")
  })

  it("sweeps all box faces and does not tunnel through a wall", () => {
    const cases = [
      [circle(-4, 0, 1), vector(8, 0), -1, 0],
      [circle(4, 0, 1), vector(-8, 0), 1, 0],
      [circle(0, -4, 1), vector(0, 8), 0, -1],
      [circle(0, 4, 1), vector(0, -8), 0, 1]
    ] as const
    for (const [moving, delta, nx, ny] of cases) {
      const hit = value(Geometry2.sweepCircleAabb(moving, delta, unitBox))
      expect(hit).toMatchObject({ tag: "Geometry2/Contact", normal: { x: nx, y: ny } })
      if (hit.tag === "Geometry2/Contact") expect(hit.time).toBeCloseTo(0.25)
    }
    const end = value(Geometry2.sweepCircleAabb(circle(-4, 0, 1), vector(2, 0), unitBox))
    expect(end).toMatchObject({ tag: "Geometry2/Contact", time: 1 })
  })

  it("uses rounded box corners rather than an expanded square", () => {
    const rounded = value(Geometry2.sweepCircleAabb(circle(-4, -1.6, 1), vector(8, 0), unitBox))
    expect(rounded.tag).toBe("Geometry2/Contact")
    if (rounded.tag !== "Geometry2/Contact") return
    expect(rounded.time).toBeCloseTo(0.275)
    expect(rounded.normal.x).toBeCloseTo(-0.8)
    expect(rounded.normal.y).toBeCloseTo(-0.6)
    // This segment enters the expanded square but never reaches its round corner.
    expect(value(Geometry2.sweepCircleAabb(circle(-3, -1.9, 1), vector(1.5, 0), unitBox)).tag).toBe("Geometry2/Miss")
    const tangent = value(Geometry2.sweepCircleAabb(circle(-3, -2, 1), vector(4, 0), unitBox))
    expect(tangent.tag).toBe("Geometry2/Contact")
    if (tangent.tag === "Geometry2/Contact") expect(tangent.time).toBeCloseTo(0.5)
    expect(value(Geometry2.sweepCircleAabb(circle(-3, -2.01, 1), vector(4, 0), unitBox)).tag).toBe("Geometry2/Miss")
  })

  it("supports zero-radius points while reporting an undefined point contact normal", () => {
    expect(value(Geometry2.sweepCircleAabb(circle(-3, -1, 0), vector(4, 0), unitBox))).toMatchObject({ tag: "Geometry2/Contact", time: 0.5, normal: { x: -1, y: 0 } })
    expect(Geometry2.sweepCircleCircle(circle(-2, 0, 0), vector(4, 0), circle(0, 0, 0))).toEqual({ ok: false, error: { tag: "Geometry2/UndefinedNormal" } })
  })

  it("keeps geometrically equivalent very small and very large circle sweeps", () => {
    for (const scale of [1e-200, 1e200]) {
      const hit = value(Geometry2.sweepCircleCircle(circle(-4 * scale, 0, scale), vector(8 * scale, 0), circle(0, 0, scale)))
      expect(hit).toMatchObject({ tag: "Geometry2/Contact", time: 0.25, normal: { x: -1, y: 0 } })
      expect(value(Geometry2.circleTouchesCircle(circle(0, 0, scale), circle(2 * scale, 0, scale)))).toBe(true)
      const scaledBox = box(0, 0, 2 * scale, 2 * scale)
      const corner = value(Geometry2.sweepCircleAabb(circle(-4 * scale, -1.6 * scale, scale), vector(8 * scale, 0), scaledBox))
      expect(corner.tag).toBe("Geometry2/Contact")
      if (corner.tag === "Geometry2/Contact") {
        expect(corner.time).toBeCloseTo(0.275, 12)
        expect(corner.normal.x).toBeCloseTo(-0.8, 12)
        expect(corner.normal.y).toBeCloseTo(-0.6, 12)
      }
    }
  })

  it("does not cancel a distant small-radius entry or a tangent's normal", () => {
    const entry = value(Geometry2.sweepCircleCircle(circle(-1e12, 0, 1), vector(2e12, 0), circle(0, 0, 1)))
    expect(entry.tag).toBe("Geometry2/Contact")
    if (entry.tag === "Geometry2/Contact") {
      expect(entry.time).toBeLessThan(0.5)
      expect(entry.time).toBeCloseTo((1e12 - 2) / 2e12, 15)
      expect(Direction2.toVector(entry.normal)).toEqual({ x: -1, y: 0 })
    }
    const tangent = value(Geometry2.sweepCircleCircle(circle(-1e12, 2, 1), vector(2e12, 0), circle(0, 0, 1)))
    expect(tangent).toMatchObject({ tag: "Geometry2/Contact", time: 0.5, normal: { x: 0, y: 1 } })
  })

  it("matches first entry found independently by convex-distance minimization", () => {
    let state = 1337
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 4294967296
    }
    // This reference evaluates distance at positions and bisects its descending
    // branch; it does not use the production circle roots or face/corner split.
    const reference = (distanceAt: (time: number) => number, radius: number): number | "initial" | undefined => {
      if (distanceAt(0) <= radius) return "initial"
      let lower = 0
      let upper = 1
      for (let i = 0; i < 90; i++) {
        const a = lower + (upper - lower) / 3
        const b = upper - (upper - lower) / 3
        if (distanceAt(a) < distanceAt(b)) upper = b
        else lower = a
      }
      const minimum = (lower + upper) / 2
      if (distanceAt(minimum) > radius && distanceAt(1) > radius) return undefined
      lower = 0
      upper = distanceAt(minimum) <= radius ? minimum : 1
      for (let i = 0; i < 70; i++) {
        const mid = (lower + upper) / 2
        if (distanceAt(mid) <= radius) upper = mid
        else lower = mid
      }
      return upper
    }
    const check = (hit: Geometry2.Sweep, expected: number | "initial" | undefined) => {
      if (expected === undefined) expect(hit.tag).toBe("Geometry2/Miss")
      else if (expected === "initial") expect(hit.tag).toBe("Geometry2/InitialOverlap")
      else {
        expect(hit.tag).toBe("Geometry2/Contact")
        if (hit.tag === "Geometry2/Contact") {
          expect(hit.time).toBeCloseTo(expected, 11)
          expect(Math.hypot(hit.normal.x, hit.normal.y)).toBeCloseTo(1, 12)
        }
      }
    }
    for (let i = 0; i < 500; i++) {
      const x = next() * 16 - 8
      const y = next() * 16 - 8
      const dx = next() * 24 - 12
      const dy = next() * 24 - 12
      const radius = 0.01 + next() * 2
      const targetRadius = 0.01 + next() * 2
      const moving = circle(x, y, radius)
      const delta = vector(dx, dy)
      const circleDistance = (time: number) => Math.hypot(x + dx * time, y + dy * time)
      check(value(Geometry2.sweepCircleCircle(moving, delta, circle(0, 0, targetRadius))), reference(circleDistance, radius + targetRadius))
      const boxDistance = (time: number) => Math.hypot(Math.max(0, Math.abs(x + dx * time) - 1), Math.max(0, Math.abs(y + dy * time) - 1))
      check(value(Geometry2.sweepCircleAabb(moving, delta, unitBox)), reference(boxDistance, radius))
    }
  })

  it("reports nonrepresentable differences, summed radii, or scaled intermediates", () => {
    const far = circle(Number.MAX_VALUE, 0, 0)
    const opposite = circle(-Number.MAX_VALUE, 0, 0)
    expect(Geometry2.circleTouchesCircle(far, opposite).ok).toBe(false)
    expect(Geometry2.sweepCircleCircle(far, vector(1, 0), opposite).ok).toBe(false)
    const huge = circle(0, 0, Number.MAX_VALUE)
    expect(Geometry2.circleTouchesCircle(huge, huge).ok).toBe(false)
    expect(Geometry2.sweepCircleCircle(huge, vector(1, 0), huge).ok).toBe(false)
    expect(Geometry2.sweepCircleCircle(circle(-1e300, 0, 1e-300), vector(1e300, 0), circle(0, 0, 1e-300)).ok).toBe(false)
    const segment = value(Geometry2.Segment.result({ start: { x: -Number.MAX_VALUE, y: 0 }, end: { x: Number.MAX_VALUE, y: 0 } }))
    expect(Geometry2.closestPointOnSegment(vector(0, 0), segment).ok).toBe(false)
  })

  it("builds conservative circle and swept bounds, including both endpoints", () => {
    const bounded = value(Geometry2.circleBounds(circle(10, 20, 3)))
    expect({ position: Aabb.position(bounded), size: Aabb.size(bounded) }).toEqual({ position: { x: 10, y: 20 }, size: { width: 6, height: 6 } })
    const swept = value(Geometry2.sweptCircleBounds(circle(10, 20, 3), vector(-8, 12)))
    expect(Aabb.left(swept)).toBeLessThanOrEqual(-1)
    expect(Aabb.right(swept)).toBeGreaterThanOrEqual(13)
    expect(Aabb.top(swept)).toBeLessThanOrEqual(17)
    expect(Aabb.bottom(swept)).toBeGreaterThanOrEqual(35)
    const pointBounds = value(Geometry2.circleBounds(circle(1, 2, 0)))
    expect({ position: Aabb.position(pointBounds), size: Aabb.size(pointBounds) }).toEqual({ position: { x: 1, y: 2 }, size: { width: 0, height: 0 } })
    expect(value(Geometry2.circleBounds(circle(Number.MIN_VALUE, 0, 0))).position.x).toBe(Number.MIN_VALUE)
  })

  it("expands centered bounds when decimal rounding would discard an endpoint", () => {
    const moving = circle(0.1, 0, 0)
    const bounds = value(Geometry2.sweptCircleBounds(moving, vector(0.1, 0)))
    expect(Aabb.left(bounds)).toBeLessThanOrEqual(0.1)
    expect(Aabb.right(bounds)).toBeGreaterThanOrEqual(0.2)
    const high = value(Geometry2.sweptCircleBounds(circle(1e16, 0, 0), vector(2, 0)))
    expect(Aabb.left(high)).toBeLessThanOrEqual(1e16)
    expect(Aabb.right(high)).toBeGreaterThanOrEqual(1e16 + 2)
    const decimal = circle(0.1, 0.2, 0.05)
    const circular = value(Geometry2.circleBounds(decimal))
    expect(Aabb.left(circular)).toBeLessThanOrEqual(decimal.center.x - decimal.radius)
    expect(Aabb.right(circular)).toBeGreaterThanOrEqual(decimal.center.x + decimal.radius)
    expect(Aabb.top(circular)).toBeLessThanOrEqual(decimal.center.y - decimal.radius)
    expect(Aabb.bottom(circular)).toBeGreaterThanOrEqual(decimal.center.y + decimal.radius)
  })

  it("fails bounds whose centered size, endpoint, or radius extension overflows", () => {
    const giant = circle(0, 0, Number.MAX_VALUE)
    expect(Geometry2.circleBounds(giant)).toMatchObject({ ok: false, error: { tag: "Geometry2/NumericRange" } })
    const edge = circle(Number.MAX_VALUE, 0, 0)
    expect(Geometry2.sweptCircleBounds(edge, vector(Number.MAX_VALUE, 0)).ok).toBe(false)
    const starts = circle(-Number.MAX_VALUE, 0, 0)
    expect(Geometry2.sweptCircleBounds(starts, vector(Number.MAX_VALUE, 0)).ok).toBe(true)
    const extending = circle(0, 0, Number.MAX_VALUE / 2)
    expect(Geometry2.sweptCircleBounds(extending, vector(Number.MAX_VALUE, 0)).ok).toBe(false)
  })
})

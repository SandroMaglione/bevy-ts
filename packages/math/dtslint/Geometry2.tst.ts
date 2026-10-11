import type * as Result from "@typeonce/bevy-ts/Result"
import * as Aabb from "@typeonce/bevy-ts-math/Aabb"
import * as Direction2 from "@typeonce/bevy-ts-math/Direction2"
import * as Geometry2 from "@typeonce/bevy-ts-math/Geometry2"
import * as Scalar from "@typeonce/bevy-ts-math/Scalar"
import * as Vector2 from "@typeonce/bevy-ts-math/Vector2"
import { describe, expect, it } from "tstyche"

describe("Geometry2", () => {
  it("infers validated shape and decoder results", () => {
    const raw = { center: { x: 0, y: 0 }, radius: 1 }
    const segmentRaw = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
    expect(Geometry2.Circle.result(raw)).type.toBe<Result.Result<Geometry2.Circle, Geometry2.Error>>()
    expect(Geometry2.Circle.decode(null)).type.toBe<Result.Result<Geometry2.Circle, Geometry2.Error | Geometry2.DecodeError>>()
    expect(Geometry2.Segment.result(segmentRaw)).type.toBe<Result.Result<Geometry2.Segment, Geometry2.Error>>()
    expect(Geometry2.Segment.decode(null)).type.toBe<Result.Result<Geometry2.Segment, Geometry2.Error | Geometry2.DecodeError>>()
    expect(Geometry2.Capsule.result({ segment: segmentRaw, radius: 1 })).type.toBe<Result.Result<Geometry2.Capsule, Geometry2.Error>>()
    expect(Geometry2.Capsule.decode(null)).type.toBe<Result.Result<Geometry2.Capsule, Geometry2.Error | Geometry2.DecodeError>>()
    expect(Geometry2.Circle.result).type.not.toBeCallableWith({ center: { x: 1 }, radius: 1 })
    expect(Geometry2.Segment.result).type.not.toBeCallableWith({ start: { x: 0, y: 0 } })
    expect(Geometry2.Capsule.result).type.not.toBeCallableWith({ segment: segmentRaw, radius: "1" })
  })

  it("requires branded query inputs and carries query uncertainty", () => {
    const circle = Geometry2.Circle.result({ center: { x: 0, y: 0 }, radius: 1 })
    const segment = Geometry2.Segment.result({ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } })
    const capsule = Geometry2.Capsule.result({ segment: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, radius: 1 })
    const box = Aabb.result({ position: { x: 0, y: 0 }, size: { width: 2, height: 2 } })
    const delta = Vector2.zero()
    if (!circle.ok || !segment.ok || !capsule.ok || !box.ok) return
    expect(Geometry2.circleTouchesCircle(circle.value, circle.value)).type.toBe<Result.Result<boolean, Geometry2.QueryError>>()
    expect(Geometry2.circleTouchesAabb(circle.value, box.value)).type.toBe<Result.Result<boolean, Geometry2.QueryError>>()
    expect(Geometry2.circleTouchesCapsule(circle.value, capsule.value)).type.toBe<Result.Result<boolean, Geometry2.QueryError>>()
    expect(Geometry2.closestPointOnSegment(delta, segment.value)).type.toBe<Result.Result<Vector2.Vector2, Geometry2.QueryError>>()
    expect(Geometry2.sweepCircleCircle(circle.value, delta, circle.value)).type.toBe<Result.Result<Geometry2.Sweep, Geometry2.QueryError>>()
    expect(Geometry2.sweepCircleAabb(circle.value, delta, box.value)).type.toBe<Result.Result<Geometry2.Sweep, Geometry2.QueryError>>()
    expect(Geometry2.circleBounds(circle.value)).type.toBe<Result.Result<Aabb.Aabb, Geometry2.QueryError>>()
    expect(Geometry2.sweptCircleBounds(circle.value, delta)).type.toBe<Result.Result<Aabb.Aabb, Geometry2.QueryError>>()
    expect(Geometry2.circleBounds).type.not.toBeCallableWith({ center: delta, radius: circle.value.radius })
    expect(Geometry2.sweptCircleBounds).type.not.toBeCallableWith(circle.value, { x: 1, y: 0 })
    expect(Geometry2.circleTouchesCircle).type.not.toBeCallableWith({ center: delta, radius: circle.value.radius }, circle.value)
    expect(Geometry2.circleTouchesAabb).type.not.toBeCallableWith(circle.value, { position: delta, size: box.value.size })
    expect(Geometry2.circleTouchesCapsule).type.not.toBeCallableWith(circle.value, { segment: segment.value, radius: circle.value.radius })
    expect(Geometry2.closestPointOnSegment).type.not.toBeCallableWith({ x: 0, y: 0 }, segment.value)
    expect(Geometry2.sweepCircleCircle).type.not.toBeCallableWith(circle.value, { x: 0, y: 0 }, circle.value)
    expect(Geometry2.sweepCircleAabb).type.not.toBeCallableWith(circle.value, delta, { position: delta, size: box.value.size })
    const sweep = Geometry2.sweepCircleAabb(circle.value, delta, box.value)
    if (sweep.ok && sweep.value.tag === "Geometry2/Contact") {
      expect(sweep.value.time).type.toBe<Scalar.Fraction>()
      expect(sweep.value.normal).type.toBe<Direction2.Direction2>()
    }
  })
})

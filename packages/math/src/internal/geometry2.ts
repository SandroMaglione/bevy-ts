import * as Result from "@typeonce/bevy-ts/Result"
import * as Aabb from "../Aabb.ts"
import * as Direction2 from "../Direction2.ts"
import * as Scalar from "../Scalar.ts"
import * as Vector2 from "../Vector2.ts"
import type * as Geometry2 from "../Geometry2.ts"

const numeric = (operation: string): Result.Result<never, Geometry2.QueryError> =>
  Result.failure({ tag: "Geometry2/NumericRange", operation })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isVector = (value: unknown): value is Vector2.Raw =>
  isRecord(value) && typeof value["x"] === "number" && typeof value["y"] === "number"

const isCircle = (value: unknown): value is Geometry2.CircleRaw =>
  isRecord(value) && isVector(value["center"]) && typeof value["radius"] === "number"

const isSegment = (value: unknown): value is Geometry2.SegmentRaw =>
  isRecord(value) && isVector(value["start"]) && isVector(value["end"])

const isCapsule = (value: unknown): value is Geometry2.CapsuleRaw =>
  isRecord(value) && isSegment(value["segment"]) && typeof value["radius"] === "number"

const finiteBounds = (point: Vector2.Raw, radius: number): boolean =>
  Number.isFinite(point.x - radius) && Number.isFinite(point.x + radius) &&
  Number.isFinite(point.y - radius) && Number.isFinite(point.y + radius)

export const circleResult = (raw: Geometry2.CircleRaw): Result.Result<Geometry2.Circle, Geometry2.Error> => {
  const center = Vector2.result(raw.center)
  const radius = Scalar.NonNegative.result(raw.radius)
  if (!center.ok || !radius.ok || !finiteBounds(raw.center, raw.radius)) {
    return Result.failure({ tag: "Geometry2/InvalidCircle", input: raw })
  }
  return Result.success({ center: center.value, radius: radius.value } as Geometry2.Circle)
}

export const segmentResult = (raw: Geometry2.SegmentRaw): Result.Result<Geometry2.Segment, Geometry2.Error> => {
  const start = Vector2.result(raw.start)
  const end = Vector2.result(raw.end)
  if (!start.ok || !end.ok) return Result.failure({ tag: "Geometry2/InvalidSegment", input: raw })
  return Result.success({ start: start.value, end: end.value } as Geometry2.Segment)
}

export const capsuleResult = (raw: Geometry2.CapsuleRaw): Result.Result<Geometry2.Capsule, Geometry2.Error> => {
  const segment = segmentResult(raw.segment)
  const radius = Scalar.NonNegative.result(raw.radius)
  if (!segment.ok || !radius.ok || !finiteBounds(raw.segment.start, raw.radius) || !finiteBounds(raw.segment.end, raw.radius)) {
    return Result.failure({ tag: "Geometry2/InvalidCapsule", input: raw })
  }
  return Result.success({ segment: segment.value, radius: radius.value } as Geometry2.Capsule)
}

export const circleDecode = (raw: unknown): Result.Result<Geometry2.Circle, Geometry2.Error | Geometry2.DecodeError> =>
  isCircle(raw) ? circleResult(raw) : Result.failure({ tag: "Geometry2/Malformed", input: raw })
export const segmentDecode = (raw: unknown): Result.Result<Geometry2.Segment, Geometry2.Error | Geometry2.DecodeError> =>
  isSegment(raw) ? segmentResult(raw) : Result.failure({ tag: "Geometry2/Malformed", input: raw })
export const capsuleDecode = (raw: unknown): Result.Result<Geometry2.Capsule, Geometry2.Error | Geometry2.DecodeError> =>
  isCapsule(raw) ? capsuleResult(raw) : Result.failure({ tag: "Geometry2/Malformed", input: raw })

const touches = (left: Vector2.Vector2, right: Vector2.Vector2, radius: number): Result.Result<boolean, Geometry2.QueryError> => {
  const dx = left.x - right.x
  const dy = left.y - right.y
  const distance = Math.hypot(dx, dy)
  return Number.isFinite(distance) && Number.isFinite(radius)
    ? Result.success(distance <= radius)
    : numeric("overlap")
}

export const circleTouchesCircle = (left: Geometry2.Circle, right: Geometry2.Circle): Result.Result<boolean, Geometry2.QueryError> =>
  touches(left.center, right.center, left.radius + right.radius)

export const circleTouchesAabb = (circle: Geometry2.Circle, box: Aabb.Aabb): Result.Result<boolean, Geometry2.QueryError> => {
  const x = Math.max(Aabb.left(box), Math.min(circle.center.x, Aabb.right(box)))
  const y = Math.max(Aabb.top(box), Math.min(circle.center.y, Aabb.bottom(box)))
  const distance = Math.hypot(circle.center.x - x, circle.center.y - y)
  return Number.isFinite(distance) ? Result.success(distance <= circle.radius) : numeric("circle/AABB overlap")
}

export const closestPointOnSegment = (point: Vector2.Vector2, segment: Geometry2.Segment): Result.Result<Vector2.Vector2, Geometry2.QueryError> => {
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  if (dx === 0 && dy === 0) return Result.success(segment.start)
  const px = point.x - segment.start.x
  const py = point.y - segment.start.y
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || !Number.isFinite(px) || !Number.isFinite(py)) return numeric("segment projection")
  const sx = dx / length
  const sy = dy / length
  const xProjection = px * sx
  const yProjection = py * sy
  const along = xProjection + yProjection
  if (!Number.isFinite(along) || (dx !== 0 && sx === 0) || (dy !== 0 && sy === 0) || (px !== 0 && sx !== 0 && xProjection === 0) || (py !== 0 && sy !== 0 && yProjection === 0)) return numeric("segment projection")
  if (along <= 0) return Result.success(segment.start)
  if (along >= length) return Result.success(segment.end)
  const time = along / length
  if (time === 0) return numeric("segment projection fraction")
  const projected = Vector2.result({
    x: (1 - time) * segment.start.x + time * segment.end.x,
    y: (1 - time) * segment.start.y + time * segment.end.y
  })
  return projected.ok ? projected : numeric("segment projection")
}

export const circleTouchesCapsule = (circle: Geometry2.Circle, capsule: Geometry2.Capsule): Result.Result<boolean, Geometry2.QueryError> => {
  const nearest = closestPointOnSegment(circle.center, capsule.segment)
  return nearest.ok ? touches(circle.center, nearest.value, circle.radius + capsule.radius) : nearest
}

const miss: Geometry2.Sweep = { tag: "Geometry2/Miss" }
const initial: Geometry2.Sweep = { tag: "Geometry2/InitialOverlap" }

const contact = (time: number, nx: number, ny: number): Result.Result<Geometry2.Sweep, Geometry2.QueryError> => {
  const fraction = Scalar.Fraction.result(time)
  if (!fraction.ok) return numeric("contact fraction")
  const normal = Direction2.result({ x: nx === 0 ? 0 : nx, y: ny === 0 ? 0 : ny })
  return normal.ok
    ? Result.success({ tag: "Geometry2/Contact", time: fraction.value, normal: normal.value })
    : Result.failure({ tag: "Geometry2/UndefinedNormal" })
}

/** Stable entry root after scaling, using the perpendicular distance to the line. */
const sweepPointCircle = (
  origin: Vector2.Vector2,
  delta: Vector2.Vector2,
  center: Vector2.Vector2,
  radius: number
): Result.Result<Geometry2.Sweep, Geometry2.QueryError> => {
  const qx = origin.x - center.x
  const qy = origin.y - center.y
  const originalDistance = Math.hypot(qx, qy)
  if (!Number.isFinite(originalDistance) || !Number.isFinite(radius)) return numeric("circle sweep")
  if (originalDistance <= radius) return Result.success(initial)
  if (delta.x === 0 && delta.y === 0) return Result.success(miss)
  const scale = Math.max(Math.abs(qx), Math.abs(qy), Math.abs(delta.x), Math.abs(delta.y), radius)
  if (!Number.isFinite(scale) || radius < 0) return numeric("circle sweep")
  if (scale === 0) return Result.success(initial)
  const x = qx / scale
  const y = qy / scale
  const vx = delta.x / scale
  const vy = delta.y / scale
  const r = radius / scale
  // Scaling must not erase a non-zero input before it can affect the query.
  if ((qx !== 0 && x === 0) || (qy !== 0 && y === 0) || (delta.x !== 0 && vx === 0) || (delta.y !== 0 && vy === 0) || (radius !== 0 && r === 0)) {
    return numeric("circle sweep scaling")
  }
  const distance = Math.hypot(x, y)
  // The original inputs were strictly separate. If scaling loses that
  // distinction, do not turn the uncertainty into an initial overlap.
  if (distance <= r) return numeric("circle sweep scaling")
  const speed = Math.hypot(vx, vy)
  const ux = vx / speed
  const uy = vy / speed
  const along = x * ux + y * uy
  if (along >= 0) return Result.success(miss)
  const signedPerpendicular = x * uy - y * ux
  const perpendicular = Math.abs(signedPerpendicular)
  if (perpendicular > r) return Result.success(miss)
  const radialSquared = (r - perpendicular) * (r + perpendicular)
  if (radialSquared === 0 && r !== perpendicular) return numeric("circle sweep root")
  const radial = Math.sqrt(radialSquared)
  // c / (-b + sqrt(discriminant)) avoids subtracting nearly equal roots.
  const numerator = (distance - r) * (distance + r)
  const denominator = speed * (-along + radial)
  if (numerator === 0 || denominator === 0) return numeric("circle sweep root")
  const time = numerator / denominator
  if (!Number.isFinite(time)) return numeric("circle sweep fraction")
  if (time < 0 || time > 1) return Result.success(miss)
  // Reconstruct from the line's perpendicular and the entry offset. Using
  // q + v*t loses the zero component at an exact tangent through cancellation,
  // which can put an AABB corner contact in the wrong quadrant.
  return contact(time, signedPerpendicular * uy - radial * ux, -signedPerpendicular * ux - radial * uy)
}

export const sweepCircleCircle = (circle: Geometry2.Circle, delta: Vector2.Vector2, target: Geometry2.Circle): Result.Result<Geometry2.Sweep, Geometry2.QueryError> =>
  sweepPointCircle(circle.center, delta, target.center, circle.radius + target.radius)

export const sweepCircleAabb = (circle: Geometry2.Circle, delta: Vector2.Vector2, box: Aabb.Aabb): Result.Result<Geometry2.Sweep, Geometry2.QueryError> => {
  const overlapping = circleTouchesAabb(circle, box)
  if (!overlapping.ok) return overlapping
  if (overlapping.value) return Result.success(initial)
  if (delta.x === 0 && delta.y === 0) return Result.success(miss)
  const left = Aabb.left(box)
  const right = Aabb.right(box)
  const top = Aabb.top(box)
  const bottom = Aabb.bottom(box)
  const minX = left - circle.radius
  const maxX = right + circle.radius
  const minY = top - circle.radius
  const maxY = bottom + circle.radius
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return numeric("AABB sweep bounds")
  let best: Geometry2.Sweep = miss
  const choose = (candidate: Geometry2.Sweep): void => {
    if (candidate.tag === "Geometry2/Contact" && (best.tag !== "Geometry2/Contact" || candidate.time < best.time)) best = candidate
  }
  const faces: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [minX, circle.center.x, delta.x, -1, 0, delta.x > 0 ? 1 : 0],
    [maxX, circle.center.x, delta.x, 1, 0, delta.x < 0 ? 1 : 0],
    [minY, circle.center.y, delta.y, 0, -1, delta.y > 0 ? 1 : 0],
    [maxY, circle.center.y, delta.y, 0, 1, delta.y < 0 ? 1 : 0]
  ]
  for (const [edge, start, displacement, nx, ny, approaches] of faces) {
    if (approaches === 0) continue
    const difference = edge - start
    const time = difference / displacement
    if (!Number.isFinite(difference) || !Number.isFinite(time)) return numeric("AABB face sweep")
    if (time < 0 || time > 1) continue
    const cross = nx === 0 ? circle.center.x + delta.x * time : circle.center.y + delta.y * time
    if (!Number.isFinite(cross)) return numeric("AABB face contact")
    if (nx === 0 ? cross < left || cross > right : cross < top || cross > bottom) continue
    const hit = contact(time, nx, ny)
    if (!hit.ok) return hit
    choose(hit.value)
  }
  if (circle.radius === 0) return Result.success(best)
  const corners: ReadonlyArray<readonly [number, number, number, number]> = [
    [left, top, -1, -1], [left, bottom, -1, 1], [right, top, 1, -1], [right, bottom, 1, 1]
  ]
  for (const [x, y, sideX, sideY] of corners) {
    const center = Vector2.result({ x, y })
    if (!center.ok) return numeric("AABB corner")
    const candidate = sweepPointCircle(circle.center, delta, center.value, circle.radius)
    if (!candidate.ok) return candidate
    if (candidate.value.tag !== "Geometry2/Contact") continue
    const normal = candidate.value.normal
    if (normal.x * sideX < 0 || normal.y * sideY < 0) continue
    choose(candidate.value)
  }
  return Result.success(best)
}

const enclosingBounds = (minX: number, maxX: number, minY: number, maxY: number): Result.Result<Aabb.Aabb, Geometry2.QueryError> => {
  let width = maxX - minX
  let height = maxY - minY
  const position = { x: minX + width / 2, y: minY + height / 2 }
  // Outward rounding prevents centered-box reconstruction from dropping an
  // endpoint and incorrectly discarding a broad-phase candidate.
  for (let attempt = 0; attempt < 8; attempt++) {
    const box = Aabb.result({ position, size: { width, height } })
    if (!box.ok) return numeric("circle bounds")
    const xCovered = Aabb.left(box.value) <= minX && Aabb.right(box.value) >= maxX
    const yCovered = Aabb.top(box.value) <= minY && Aabb.bottom(box.value) >= maxY
    if (xCovered && yCovered) return box
    if (!xCovered) width += Math.max(Number.MIN_VALUE, width * Number.EPSILON)
    if (!yCovered) height += Math.max(Number.MIN_VALUE, height * Number.EPSILON)
  }
  return numeric("circle bounds")
}

export const circleBounds = (circle: Geometry2.Circle): Result.Result<Aabb.Aabb, Geometry2.QueryError> =>
  enclosingBounds(circle.center.x - circle.radius, circle.center.x + circle.radius, circle.center.y - circle.radius, circle.center.y + circle.radius)

export const sweptCircleBounds = (circle: Geometry2.Circle, delta: Vector2.Vector2): Result.Result<Aabb.Aabb, Geometry2.QueryError> => {
  const endX = circle.center.x + delta.x
  const endY = circle.center.y + delta.y
  if (!Number.isFinite(endX) || !Number.isFinite(endY)) return numeric("swept circle bounds")
  return enclosingBounds(Math.min(circle.center.x, endX) - circle.radius, Math.max(circle.center.x, endX) + circle.radius, Math.min(circle.center.y, endY) - circle.radius, Math.max(circle.center.y, endY) + circle.radius)
}

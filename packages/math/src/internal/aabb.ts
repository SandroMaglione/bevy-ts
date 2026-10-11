import * as Result from "@typeonce/bevy-ts/Result"
import * as Size2 from "../Size2.ts"
import * as Vector2 from "../Vector2.ts"
import type * as Aabb from "../Aabb.ts"
import type * as Scalar from "../Scalar.ts"
import { isRawShape as isSize2Shape } from "./size2.ts"
import { isRawShape as isVector2Shape } from "./vector2.ts"

export const token: unique symbol = Symbol("Aabb/Canonical")
interface Snapshot {
  readonly position: Vector2.Vector2
  readonly size: Size2.Size2
}
const snapshots = new WeakMap<() => void, Snapshot>()
const snapshot = (aabb: Aabb.Aabb): Snapshot => snapshots.get(aabb[token])!

const make = (position: Vector2.Vector2, size: Size2.Size2): Aabb.Aabb => {
  // These values were constructed from raw input, so freezing them never
  // changes caller-owned vectors or size objects.
  Object.freeze(position)
  Object.freeze(size)
  const identity = () => {}
  const aabb = Object.freeze({ position, size, [token]: identity }) as Aabb.Aabb
  snapshots.set(identity, { position, size })
  return aabb
}

export const result = (raw: Aabb.Raw): Result.Result<Aabb.Aabb, Aabb.Error> => {
  const position = Vector2.result(raw.position)
  if (!position.ok) {
    return Result.failure({
      tag: "Aabb/InvalidPosition",
      error: position.error,
      input: raw
    })
  }

  const size = Size2.result(raw.size)
  if (!size.ok) {
    return Result.failure({
      tag: "Aabb/InvalidSize",
      error: size.error,
      input: raw
    })
  }

  const { x, y } = position.value
  const { width, height } = size.value
  if (![x - width / 2, x + width / 2, y - height / 2, y + height / 2].every(Number.isFinite)) {
    return Result.failure({ tag: "Aabb/EdgeOverflow", input: raw })
  }
  return Result.success(make(position.value, size.value))
}

export const option = (raw: Aabb.Raw): Aabb.Aabb | null => {
  const next = result(raw)
  return next.ok ? next.value : null
}

export const is = (raw: Aabb.Raw): boolean => result(raw).ok

export const position = (aabb: Aabb.Aabb): Vector2.Vector2 => snapshot(aabb).position
export const size = (aabb: Aabb.Aabb): Size2.Size2 => snapshot(aabb).size

export const left = (aabb: Aabb.Aabb): Scalar.Finite =>
  (position(aabb).x - size(aabb).width * 0.5) as Scalar.Finite

export const right = (aabb: Aabb.Aabb): Scalar.Finite =>
  (position(aabb).x + size(aabb).width * 0.5) as Scalar.Finite

export const top = (aabb: Aabb.Aabb): Scalar.Finite =>
  (position(aabb).y - size(aabb).height * 0.5) as Scalar.Finite

export const bottom = (aabb: Aabb.Aabb): Scalar.Finite =>
  (position(aabb).y + size(aabb).height * 0.5) as Scalar.Finite

export const intersects = (first: Aabb.Aabb, second: Aabb.Aabb): boolean =>
  overlapsHorizontally(first, second) && overlapsVertically(first, second)

export const overlapsHorizontally = (first: Aabb.Aabb, second: Aabb.Aabb): boolean =>
  right(first) > left(second) && left(first) < right(second)

export const overlapsVertically = (first: Aabb.Aabb, second: Aabb.Aabb): boolean =>
  bottom(first) > top(second) && top(first) < bottom(second)

export const translate = (aabb: Aabb.Aabb, delta: Vector2.Vector2): Result.Result<Aabb.Aabb, Aabb.Error | Scalar.ArithmeticError> => {
  const moved = Vector2.add(position(aabb), delta)
  return moved.ok ? result({ position: moved.value, size: size(aabb) }) : moved
}

export const decode = (raw: unknown): Result.Result<Aabb.Aabb, Aabb.Error | Aabb.DecodeError> => {
  if (typeof raw !== "object" || raw === null) return Result.failure({ tag: "Aabb/Malformed", input: raw })
  const { position, size } = raw as Record<string, unknown>
  return isVector2Shape(position) && isSize2Shape(size)
    ? result({ position, size })
    : Result.failure({ tag: "Aabb/Malformed", input: raw })
}

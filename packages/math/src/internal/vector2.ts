import * as Result from "@typeonce/bevy-ts/Result"
import * as Scalar from "../Scalar.ts"
import { checked, interpolate } from "./scalar.ts"
import type * as Vector2 from "../Vector2.ts"

const make = (x: Scalar.Finite, y: Scalar.Finite): Vector2.Vector2 => ({ x, y }) as Vector2.Vector2

export const result = (raw: Vector2.Raw): Result.Result<Vector2.Vector2, Vector2.Error> => {
  const x = Scalar.Finite.result(raw.x)
  const y = Scalar.Finite.result(raw.y)
  if (!x.ok || !y.ok) {
    return Result.failure({
      tag: "Vector2/Invalid",
      x: x.ok ? null : x.error,
      y: y.ok ? null : y.error,
      input: {
        x: raw.x,
        y: raw.y
      }
    })
  }

  return Result.success(make(x.value, y.value))
}

export const option = (raw: Vector2.Raw): Vector2.Vector2 | null => {
  const next = result(raw)
  return next.ok ? next.value : null
}

export const is = (raw: Vector2.Raw): raw is Vector2.Raw & Vector2.Vector2 => result(raw).ok

export const toRaw = (vector: Vector2.Vector2): Vector2.Raw => ({
  x: vector.x,
  y: vector.y
})

export const components = (vector: Vector2.Vector2) => ({
  x: vector.x,
  y: vector.y
})

export const x = (vector: Vector2.Vector2): Scalar.Finite => vector.x
export const y = (vector: Vector2.Vector2): Scalar.Finite => vector.y

export const zero = (): Vector2.Vector2 => make(0 as Scalar.Finite, 0 as Scalar.Finite)

const arithmetic = (x: number, y: number, operation: string): Result.Result<Vector2.Vector2, Scalar.ArithmeticError> => {
  const cx = checked(x, operation)
  const cy = checked(y, operation)
  if (!cx.ok) return cx
  if (!cy.ok) return cy
  return Result.success(make(cx.value, cy.value))
}
export const add = (left: Vector2.Vector2, right: Vector2.Vector2) => arithmetic(left.x + right.x, left.y + right.y, "Vector2.add")
export const subtract = (left: Vector2.Vector2, right: Vector2.Vector2) => arithmetic(left.x - right.x, left.y - right.y, "Vector2.subtract")
export const scale = (vector: Vector2.Vector2, scalar: Scalar.Finite) => arithmetic(vector.x * scalar, vector.y * scalar, "Vector2.scale")

const nonNegative = (value: number, operation: string): Result.Result<Scalar.NonNegative, Scalar.ArithmeticError> => {
  const checkedValue = checked(value, operation)
  return checkedValue.ok ? Result.success(checkedValue.value as Scalar.NonNegative) : checkedValue
}
export const lengthSquared = (vector: Vector2.Vector2) => nonNegative(vector.x * vector.x + vector.y * vector.y, "Vector2.lengthSquared")
export const length = (vector: Vector2.Vector2) => nonNegative(Math.hypot(vector.x, vector.y), "Vector2.length")
export const distance = (left: Vector2.Vector2, right: Vector2.Vector2) => nonNegative(Math.hypot(left.x - right.x, left.y - right.y), "Vector2.distance")
export const distanceSquared = (left: Vector2.Vector2, right: Vector2.Vector2) => {
  const dx = left.x - right.x
  const dy = left.y - right.y
  return nonNegative(dx * dx + dy * dy, "Vector2.distanceSquared")
}
export const dot = (left: Vector2.Vector2, right: Vector2.Vector2) => checked(left.x * right.x + left.y * right.y, "Vector2.dot")

export const normalize = (vector: Vector2.Vector2): Result.Result<Vector2.Vector2, Vector2.NormalizeError> => {
  const magnitude = Math.max(Math.abs(vector.x), Math.abs(vector.y))
  if (magnitude === 0) return Result.failure({ tag: "Vector2/ZeroLength" })
  // Scaling before computing length preserves subnormal and huge vectors.
  const x = vector.x / magnitude
  const y = vector.y / magnitude
  const length = Math.hypot(x, y)
  return Result.success(make((x / length) as Scalar.Finite, (y / length) as Scalar.Finite))
}
export const normalizeOrZero = (vector: Vector2.Vector2): Vector2.Vector2 => {
  const normalized = normalize(vector)
  return normalized.ok ? normalized.value : zero()
}
export const normalizeOr = (vector: Vector2.Vector2, fallback: Vector2.Vector2): Vector2.Vector2 => {
  const normalized = normalize(vector)
  return normalized.ok ? normalized.value : fallback
}
export const rotate = (vector: Vector2.Vector2, radians: Scalar.Finite) => {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return arithmetic(vector.x * cos - vector.y * sin, vector.x * sin + vector.y * cos, "Vector2.rotate")
}
export const lerp = (left: Vector2.Vector2, right: Vector2.Vector2, amount: Scalar.Finite) =>
  arithmetic(interpolate(left.x, right.x, amount), interpolate(left.y, right.y, amount), "Vector2.lerp")
export const clampLength = (vector: Vector2.Vector2, max: Scalar.NonNegative): Result.Result<Vector2.Vector2, Scalar.ArithmeticError> => {
  if (Math.hypot(vector.x, vector.y) <= max) return Result.success(vector)
  return scale(normalizeOrZero(vector), max)
}
export const moveToward = (current: Vector2.Vector2, target: Vector2.Vector2, maxDelta: Scalar.NonNegative): Result.Result<Vector2.Vector2, Scalar.ArithmeticError> => {
  const delta = subtract(target, current)
  if (!delta.ok) return delta
  if (Math.hypot(delta.value.x, delta.value.y) <= maxDelta) return Result.success(target)
  const step = scale(normalizeOrZero(delta.value), maxDelta)
  return step.ok ? add(current, step.value) : step
}

/**
 * Shape check for untrusted input; values are validated by `result`.
 */
export const isRawShape = (raw: unknown): raw is Vector2.Raw =>
  typeof raw === "object" && raw !== null && typeof (raw as Record<string, unknown>)["x"] === "number" && typeof (raw as Record<string, unknown>)["y"] === "number"

export const decode = (raw: unknown): Result.Result<Vector2.Vector2, Vector2.Error | Vector2.DecodeError> =>
  isRawShape(raw) ? result(raw) : Result.failure({ tag: "Vector2/Malformed", input: raw })

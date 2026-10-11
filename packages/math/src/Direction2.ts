/**
 * Nonzero normalized directions for facing, ray axes, and contact normals.
 *
 * Construction normalizes finite input using scaled arithmetic. A direction
 * has unit length within floating-point precision; zero is an explicit failure.
 * Operations use a canonical snapshot. Spreading preserves it, and replacing
 * copied components does not change the direction; construct a new direction
 * to change its heading. JSON saves components and `decode` normalizes them.
 *
 * @module Direction2
 * @docGroup data-structures
 */
import type * as Brand from "@typeonce/bevy-ts/Brand"
import * as Result from "@typeonce/bevy-ts/Result"
import * as Vector2 from "./Vector2.ts"
import type * as Scalar from "./Scalar.ts"

/** A normalized direction; positions and velocities remain Vector2 values. */
const token: unique symbol = Symbol("Direction2/Canonical")
export type Direction2 = Brand.Branded<{
  readonly x: Scalar.Finite
  readonly y: Scalar.Finite
  readonly [token]: () => void
}, "Direction2">
/** Raw finite components, not required to be normalized. */
export type Raw = Vector2.Raw
/** Invalid components or a zero-length input. */
export type Error = Vector2.Error | Vector2.NormalizeError
/** Malformed untrusted data. */
export type DecodeError = Vector2.DecodeError

interface Snapshot { readonly direction: Direction2; readonly x: Scalar.Finite; readonly y: Scalar.Finite }
const snapshots = new WeakMap<() => void, Snapshot>()
const snapshot = (direction: Direction2): Snapshot => snapshots.get(direction[token])!
const make = (vector: Vector2.Vector2): Direction2 => {
  const identity = () => {}
  const direction = Object.freeze({ x: vector.x, y: vector.y, [token]: identity }) as Direction2
  snapshots.set(identity, { direction, x: vector.x, y: vector.y })
  return direction
}

/** Validates components, then normalizes. */
export const result = (raw: Raw): Result.Result<Direction2, Error> => {
  const vector = Vector2.result(raw)
  if (!vector.ok) return vector
  const normalized = Vector2.normalize(vector.value)
  return normalized.ok ? Result.success(make(normalized.value)) : normalized
}
/** Restores a direction from untrusted data, validating and normalizing again. */
export const decode = (raw: unknown): Result.Result<Direction2, Error | DecodeError> => {
  const vector = Vector2.decode(raw)
  return vector.ok ? result(vector.value) : vector
}
/** A fresh finite vector view. */
export const toVector = (direction: Direction2): Vector2.Vector2 => {
  const stored = snapshot(direction)
  return ({ x: stored.x, y: stored.y }) as Vector2.Vector2
}
/** Normalizes a validated vector or retains a validated direction on zero. */
export const normalizeOr = (vector: Vector2.Vector2, fallback: Direction2): Direction2 => {
  const normalized = Vector2.normalize(vector)
  return normalized.ok ? make(normalized.value) : snapshot(fallback).direction
}

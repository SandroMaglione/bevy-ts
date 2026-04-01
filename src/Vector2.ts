/**
 * Branded two-dimensional vectors with explicit validation.
 *
 * Raw `{ x, y }` input is validated once at the constructor boundary. All
 * other helpers work on branded vectors only and remain pure and immutable.
 */
import type * as Brand from "./Brand.ts"
import * as internal from "./internal/vector2.ts"
import type * as Result from "./Result.ts"
import type * as Scalar from "./Scalar.ts"

/**
 * Raw vector input accepted by the public constructors.
 */
export type Raw = {
  readonly x: number
  readonly y: number
}

/**
 * Validated two-dimensional vector.
 */
export type Vector2 = Brand.Branded<{
  readonly x: Scalar.Finite
  readonly y: Scalar.Finite
}, "Vector2">

/**
 * Structured vector-construction failure.
 */
export type Error = {
  readonly tag: "Vector2/Invalid"
  readonly x: Scalar.Error | null
  readonly y: Scalar.Error | null
  readonly input: Raw
}

/**
 * Explicit failure produced when a zero-length vector cannot be normalized.
 */
export type NormalizeError = {
  readonly tag: "Vector2/ZeroLength"
}

/**
 * Validates one raw vector and returns an explicit result.
 *
 * @example
 * ```ts
 * const position = Vector2.result({ x: 16, y: 24 })
 * ```
 */
export const result: (raw: Raw) => Result.Result<Vector2, Error> = internal.result
/**
 * Validates one raw vector and returns `null` on failure.
 */
export const option: (raw: Raw) => Vector2 | null = internal.option
/**
 * Checks whether one raw vector already satisfies the vector invariants.
 */
export const is: (raw: Raw) => raw is Raw & Vector2 = internal.is
/**
 * Converts one branded vector back to a fresh raw object.
 */
export const toRaw: (vector: Vector2) => Raw = internal.toRaw
/**
 * Exposes the branded components of one vector.
 */
export const components: (vector: Vector2) => { readonly x: Scalar.Finite; readonly y: Scalar.Finite } = internal.components
/**
 * Reads the `x` component of one branded vector.
 */
export const x: (vector: Vector2) => Scalar.Finite = internal.x
/**
 * Reads the `y` component of one branded vector.
 */
export const y: (vector: Vector2) => Scalar.Finite = internal.y
/**
 * Returns the canonical zero vector.
 */
export const zero: () => Vector2 = internal.zero
/**
 * Returns the sum of two branded vectors.
 */
export const add: (left: Vector2, right: Vector2) => Vector2 = internal.add
/**
 * Returns the component-wise difference between two branded vectors.
 */
export const subtract: (left: Vector2, right: Vector2) => Vector2 = internal.subtract
/**
 * Scales one vector by one validated finite scalar.
 */
export const scale: (vector: Vector2, scalar: Scalar.Finite) => Vector2 = internal.scale
/**
 * Returns the squared length of one vector.
 */
export const lengthSquared: (vector: Vector2) => Scalar.NonNegative = internal.lengthSquared
/**
 * Returns the length of one vector.
 */
export const length: (vector: Vector2) => Scalar.NonNegative = internal.length
/**
 * Returns the normalized vector when its length is non-zero.
 *
 * @example
 * ```ts
 * const direction = Vector2.normalize(Vector2.zero())
 * if (!direction.ok) {
 *   return
 * }
 * ```
 */
export const normalize: (vector: Vector2) => Result.Result<Vector2, NormalizeError> = internal.normalize
/**
 * Returns the normalized vector or the canonical zero vector when the input
 * length is zero.
 */
export const normalizeOrZero: (vector: Vector2) => Vector2 = internal.normalizeOrZero

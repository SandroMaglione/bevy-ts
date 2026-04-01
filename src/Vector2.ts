import type * as Brand from "./Brand.ts"
import * as internal from "./internal/vector2.ts"
import type * as Result from "./Result.ts"
import type * as Scalar from "./Scalar.ts"

export type Raw = {
  readonly x: number
  readonly y: number
}

export type Vector2 = Brand.Branded<{
  readonly x: Scalar.Finite
  readonly y: Scalar.Finite
}, "Vector2">

export type Error = {
  readonly tag: "Vector2/Invalid"
  readonly x: Scalar.Error | null
  readonly y: Scalar.Error | null
  readonly input: Raw
}

export type NormalizeError = {
  readonly tag: "Vector2/ZeroLength"
}

export const result: (raw: Raw) => Result.Result<Vector2, Error> = internal.result
export const option: (raw: Raw) => Vector2 | null = internal.option
export const is: (raw: Raw) => raw is Raw & Vector2 = internal.is
export const toRaw: (vector: Vector2) => Raw = internal.toRaw
export const components: (vector: Vector2) => { readonly x: Scalar.Finite; readonly y: Scalar.Finite } = internal.components
export const x: (vector: Vector2) => Scalar.Finite = internal.x
export const y: (vector: Vector2) => Scalar.Finite = internal.y
export const zero: () => Vector2 = internal.zero
export const add: (left: Vector2, right: Vector2) => Vector2 = internal.add
export const subtract: (left: Vector2, right: Vector2) => Vector2 = internal.subtract
export const scale: (vector: Vector2, scalar: Scalar.Finite) => Vector2 = internal.scale
export const lengthSquared: (vector: Vector2) => Scalar.NonNegative = internal.lengthSquared
export const length: (vector: Vector2) => Scalar.NonNegative = internal.length
export const normalize: (vector: Vector2) => Result.Result<Vector2, NormalizeError> = internal.normalize
export const normalizeOrZero: (vector: Vector2) => Vector2 = internal.normalizeOrZero

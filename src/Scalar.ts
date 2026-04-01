import type * as Brand from "./Brand.ts"
import * as internal from "./internal/scalar.ts"
import type * as Result from "./Result.ts"

export type Finite = Brand.Branded<number, "Scalar/Finite">
export type NonNegative = Brand.Branded<number, "Scalar/NonNegative">
export type Positive = Brand.Branded<number, "Scalar/Positive">

export type Error =
  | { readonly tag: "Scalar/NotFinite"; readonly value: number }
  | { readonly tag: "Scalar/Negative"; readonly value: number }
  | { readonly tag: "Scalar/NonPositive"; readonly value: number }

export const Finite = internal.Finite
export const NonNegative = internal.NonNegative
export const Positive = internal.Positive

export const clamp: (value: Finite, min: Finite, max: Finite) => Finite = internal.clamp
export const approach: (current: Finite, target: Finite, maxDelta: NonNegative) => Finite = internal.approach

export type FiniteResult = Result.Result<Finite, Error>

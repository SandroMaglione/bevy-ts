/**
 * Validated scalar brands and pure scalar helpers.
 *
 * This module is the numeric foundation for the branded geometry helpers.
 * Plain `number` values enter through explicit constructors such as
 * {@link Finite} and {@link NonNegative}. Once validated, downstream helpers
 * operate only on branded values.
 */
import type * as Brand from "./Brand.ts"
import * as internal from "./internal/scalar.ts"
import type * as Result from "./Result.ts"

/**
 * Finite number brand.
 *
 * Values of this type are guaranteed not to be `NaN`, `Infinity`, or
 * `-Infinity`.
 */
export type Finite = Brand.Branded<number, "Scalar/Finite">
/**
 * Finite number brand constrained to `>= 0`.
 */
export type NonNegative = Brand.Branded<number, "Scalar/NonNegative">
/**
 * Finite number brand constrained to `> 0`.
 */
export type Positive = Brand.Branded<number, "Scalar/Positive">

/**
 * Structured scalar validation failures.
 */
export type Error =
  | { readonly tag: "Scalar/NotFinite"; readonly value: number }
  | { readonly tag: "Scalar/Negative"; readonly value: number }
  | { readonly tag: "Scalar/NonPositive"; readonly value: number }

/**
 * Constructor for {@link Finite}.
 */
export const Finite = internal.Finite
/**
 * Constructor for {@link NonNegative}.
 */
export const NonNegative = internal.NonNegative
/**
 * Constructor for {@link Positive}.
 */
export const Positive = internal.Positive

/**
 * Clamps one finite value between two finite bounds.
 *
 * The result stays branded because valid branded scalar input cannot produce an
 * invalid scalar output.
 */
export const clamp: (value: Finite, min: Finite, max: Finite) => Finite = internal.clamp
/**
 * Moves one finite value toward a target by at most one non-negative delta.
 *
 * Use this for explicit interpolation-style updates where overshooting the
 * target should be impossible.
 */
export const approach: (current: Finite, target: Finite, maxDelta: NonNegative) => Finite = internal.approach

/**
 * Common result shape returned by the scalar constructors.
 */
export type FiniteResult = Result.Result<Finite, Error>

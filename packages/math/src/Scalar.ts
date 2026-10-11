/**
 * Validated scalar brands and pure scalar helpers.
 *
 * This module is the numeric foundation for the branded geometry helpers.
 * Plain `number` values enter through explicit constructors such as
 * {@link Finite} and {@link NonNegative}. Once validated, downstream helpers
 * operate only on branded values.
 *
 * In game code this is useful whenever "just a number" is too weak: viewport
 * sizes, speeds, distances, durations, and geometry values often need explicit
 * non-negative or finite guarantees before they should be stored in the world.
 *
 * @example
 * ```ts
 * // Validate raw numbers before geometry or gameplay code relies on them.
 * const speed = Scalar.Finite.result(12)
 * const limit = Scalar.Finite.result(8)
 * if (!speed.ok || !limit.ok) return
 *
 * // Operate on the branded values after the boundary has been crossed.
 * const clamped = Scalar.clamp(speed.value, limit.value, speed.value)
 * ```
 *
 * @module Scalar
 * @docGroup data-structures
 *
 * @categoryDescription Scalar Types
 * Branded numeric shapes and shared scalar validation errors.
 *
 * @categoryDescription Constructors
 * Non-throwing validation boundaries for finite and constrained scalar values.
 *
 * @categoryDescription Operations
 * Pure scalar combinators that preserve branding after validation.
 */
import type * as Brand from "@typeonce/bevy-ts/Brand"
import * as internal from "./internal/scalar.ts"
import type * as Result from "@typeonce/bevy-ts/Result"

/**
 * Finite number brand.
 *
 * Values of this type are guaranteed not to be `NaN`, `Infinity`, or
 * `-Infinity`.
 *
 * @category Scalar Types
 */
export type Finite = Brand.Branded<number, "Scalar/Finite">

declare const nonNegative: unique symbol
declare const positive: unique symbol
declare const fraction: unique symbol
/**
 * Finite number brand constrained to `>= 0`.
 *
 * @category Scalar Types
 */
export type NonNegative = Finite & { readonly [nonNegative]: true }
/**
 * Finite number brand constrained to `> 0`.
 *
 * @category Scalar Types
 */
export type Positive = NonNegative & { readonly [positive]: true }

/** A finite fraction in the closed interval [0, 1]. @category Scalar Types */
export type Fraction = NonNegative & { readonly [fraction]: true }

/** An arithmetic result cannot be represented as a finite number. @category Scalar Types */
export type ArithmeticError = { readonly tag: "Scalar/Overflow"; readonly operation: string }

/** Ordered bounds are a runtime requirement. @category Scalar Types */
export type RangeError = { readonly tag: "Scalar/ReversedRange"; readonly min: number; readonly max: number }

/**
 * Structured scalar validation failures.
 *
 * @category Scalar Types
 */
export type Error =
  | { readonly tag: "Scalar/NotFinite"; readonly value: number }
  | { readonly tag: "Scalar/Negative"; readonly value: number }
  | { readonly tag: "Scalar/NonPositive"; readonly value: number }
  | { readonly tag: "Scalar/OutsideFraction"; readonly value: number }

/**
 * Structured interpolation failure.
 *
 * @category Scalar Types
 */
export type InterpolationError = {
  readonly tag: "Scalar/ZeroRange"
  readonly start: number
  readonly end: number
}

/**
 * Constructor for {@link Finite}.
 *
 * @category Constructors
 */
export const Finite = internal.Finite
/**
 * Constructor for {@link NonNegative}.
 *
 * @category Constructors
 */
export const NonNegative = internal.NonNegative
/**
 * Constructor for {@link Positive}.
 *
 * @category Constructors
 */
export const Positive = internal.Positive

/** Validates a closed fraction. @category Constructors */
export const Fraction = internal.Fraction

/**
 * Clamps one finite value between two finite bounds.
 *
 * Reversed bounds fail explicitly. Successful output remains finite.
 *
 * @category Operations
 */
export const clamp: (value: Finite, min: Finite, max: Finite) => Result.Result<Finite, RangeError> = internal.clamp
/**
 * Interpolates between two finite values by one finite amount.
 *
 * The amount is not clamped. This stays a pure interpolation primitive rather
 * than mixing interpolation with policy.
 *
 * @category Operations
 */
export const lerp: (start: Finite, end: Finite, amount: Finite) => Result.Result<Finite, ArithmeticError> = internal.lerp
/**
 * Moves one finite value toward a target by at most one non-negative delta.
 *
 * Use this for explicit interpolation-style updates where overshooting the
 * target should be impossible.
 *
 * @category Operations
 */
export const approach: (current: Finite, target: Finite, maxDelta: NonNegative) => Finite = internal.approach
/**
 * Returns the interpolation amount of one value within a finite input range.
 *
 * Fails explicitly when the input range has zero size or arithmetic overflows.
 *
 * @category Operations
 */
export const inverseLerp: (
  start: Finite,
  end: Finite,
  value: Finite
) => Result.Result<Finite, InterpolationError | ArithmeticError> = internal.inverseLerp
/**
 * Remaps one finite value from one input range to one output range.
 *
 * Fails explicitly when the input range has zero size.
 *
 * @category Operations
 */
export const remap: (
  value: Finite,
  inputStart: Finite,
  inputEnd: Finite,
  outputStart: Finite,
  outputEnd: Finite
) => Result.Result<Finite, InterpolationError | ArithmeticError> = internal.remap

/**
 * Common result shape returned by the scalar constructors.
 *
 * @category Scalar Types
 */
export type FiniteResult = Result.Result<Finite, Error>

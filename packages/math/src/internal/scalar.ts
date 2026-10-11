import * as Brand from "@typeonce/bevy-ts/Brand"
import * as Result from "@typeonce/bevy-ts/Result"
import type * as Scalar from "../Scalar.ts"

const finiteBrand = Brand.refine<Scalar.Finite, number, Scalar.Error>((value) =>
  Number.isFinite(value)
    ? Result.success(value as Scalar.Finite)
    : Result.failure({
        tag: "Scalar/NotFinite",
        value
      })
)

const nonNegativeBrand = Brand.refine<Scalar.NonNegative, number, Scalar.Error>((value) => {
  const finite = finiteBrand.result(value)
  if (!finite.ok) {
    return finite
  }

  return value >= 0
    ? Result.success(value as Scalar.NonNegative)
    : Result.failure({
        tag: "Scalar/Negative",
        value
      })
})

const positiveBrand = Brand.refine<Scalar.Positive, number, Scalar.Error>((value) => {
  const finite = finiteBrand.result(value)
  if (!finite.ok) {
    return finite
  }

  return value > 0
    ? Result.success(value as Scalar.Positive)
    : Result.failure({
        tag: "Scalar/NonPositive",
        value
      })
})

export const Finite = finiteBrand
export const NonNegative = nonNegativeBrand
export const Positive = positiveBrand

/** Checks an arithmetic output, never treating a cast as validation. */
export const checked = (value: number, operation: string): Result.Result<Scalar.Finite, Scalar.ArithmeticError> =>
  Number.isFinite(value)
    ? Result.success(value as Scalar.Finite)
    : Result.failure({ tag: "Scalar/Overflow", operation })

export const Fraction = Brand.refine<Scalar.Fraction, number, Scalar.Error>((value) => {
  const finite = finiteBrand.result(value)
  if (!finite.ok) return finite
  return value >= 0 && value <= 1
    ? Result.success(value as Scalar.Fraction)
    : Result.failure({ tag: "Scalar/OutsideFraction", value })
})

export const clamp = (value: Scalar.Finite, min: Scalar.Finite, max: Scalar.Finite): Result.Result<Scalar.Finite, Scalar.RangeError> =>
  min > max
    ? Result.failure({ tag: "Scalar/ReversedRange", min, max })
    : Result.success(Math.min(Math.max(value, min), max) as Scalar.Finite)

/** Avoid overflowing end-start when interpolating opposite extremes. */
export const interpolate = (start: number, end: number, amount: number): number => {
  if (amount === 0 || start === end) return start
  if (amount === 1) return end
  if (amount >= 0 && amount <= 1 && (start < 0) !== (end < 0)) return start * (1 - amount) + end * amount
  return start + (end - start) * amount
}
export const lerp = (start: Scalar.Finite, end: Scalar.Finite, amount: Scalar.Finite): Result.Result<Scalar.Finite, Scalar.ArithmeticError> =>
  checked(interpolate(start, end, amount), "lerp")

export const approach = (current: Scalar.Finite, target: Scalar.Finite, maxDelta: Scalar.NonNegative): Scalar.Finite =>
  (current < target ? Math.min(current + maxDelta, target) : Math.max(current - maxDelta, target)) as Scalar.Finite

export const inverseLerp = (start: Scalar.Finite, end: Scalar.Finite, value: Scalar.Finite): Result.Result<Scalar.Finite, Scalar.InterpolationError | Scalar.ArithmeticError> => {
  if (start === end) return Result.failure({ tag: "Scalar/ZeroRange", start, end })
  const numerator = value - start
  const denominator = end - start
  if (Number.isFinite(numerator) && Number.isFinite(denominator)) return checked(numerator / denominator, "inverseLerp")
  // Scale all operands equally when subtraction exceeds the numeric range.
  const magnitude = Math.max(Math.abs(start), Math.abs(end), Math.abs(value))
  return checked((value / magnitude - start / magnitude) / (end / magnitude - start / magnitude), "inverseLerp")
}
export const remap = (value: Scalar.Finite, inputStart: Scalar.Finite, inputEnd: Scalar.Finite, outputStart: Scalar.Finite, outputEnd: Scalar.Finite): Result.Result<Scalar.Finite, Scalar.InterpolationError | Scalar.ArithmeticError> => {
  const amount = inverseLerp(inputStart, inputEnd, value)
  return amount.ok ? lerp(outputStart, outputEnd, amount.value) : amount
}

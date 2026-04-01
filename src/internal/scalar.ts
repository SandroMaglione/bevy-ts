import * as Brand from "../Brand.ts"
import * as Result from "../Result.ts"
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

export const clamp = (value: Scalar.Finite, min: Scalar.Finite, max: Scalar.Finite): Scalar.Finite =>
  Math.min(Math.max(value, min), max) as Scalar.Finite

export const approach = (
  current: Scalar.Finite,
  target: Scalar.Finite,
  maxDelta: Scalar.NonNegative
): Scalar.Finite => {
  if (current < target) {
    return Math.min(current + maxDelta, target) as Scalar.Finite
  }

  return Math.max(current - maxDelta, target) as Scalar.Finite
}

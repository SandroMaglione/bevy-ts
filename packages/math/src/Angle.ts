/**
 * Radians and signed angle wrapping, independent of a coordinate system.
 *
 * @module Angle
 * @docGroup data-structures
 */
import * as Result from "@typeonce/bevy-ts/Result"
import * as Scalar from "./Scalar.ts"

declare const radians: unique symbol
/** Finite radians. */
export type Radians = Scalar.Finite & { readonly [radians]: true }
/** A number failed validation. */
export type Error = Scalar.Error
/** An untrusted value is not a number. */
export type DecodeError = { readonly tag: "Angle/Malformed"; readonly input: unknown }

/** Validates radians without clamping or wrapping. */
export const result = (raw: number): Result.Result<Radians, Error> => {
  const finite = Scalar.Finite.result(raw)
  return finite.ok ? Result.success(finite.value as Radians) : finite
}
/** Decodes saved or authored radians. */
export const decode = (raw: unknown): Result.Result<Radians, Error | DecodeError> =>
  typeof raw === "number" ? result(raw) : Result.failure({ tag: "Angle/Malformed", input: raw })
/** Wraps to [-PI, PI). */
export const wrap = (angle: Radians): Radians => {
  const turn = Math.PI * 2
  const remainder = angle % turn
  return (remainder >= Math.PI ? remainder - turn : remainder < -Math.PI ? remainder + turn : remainder) as Radians
}
/** Shortest signed turn from one angle to another, in [-PI, PI). */
export const difference = (from: Radians, to: Radians): Radians =>
  wrap((wrap(to) - wrap(from)) as Radians)

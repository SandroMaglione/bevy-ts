/**
 * Versioned mulberry32 draws with explicit, serializable state.
 *
 * No seed comes from a clock or global random source. Every successful draw
 * carries its next state. Invalid ranges and empty choices leave state intact.
 * This generator is for gameplay and replay, not cryptographic use.
 *
 * @module Random
 * @docGroup data-structures
 */
import type * as Brand from "@typeonce/bevy-ts/Brand"
import * as Result from "@typeonce/bevy-ts/Result"
import type * as Scalar from "./Scalar.ts"
import * as Weighted from "./Weighted.ts"

/** Plain saved state uses a versioned algorithm and unsigned 32-bit counter. */
export type Raw = { readonly algorithm: "mulberry32-v1"; readonly seed: number }
/** Validated generator state. */
export type State = Brand.Branded<Raw, "Random/State">
declare const unitInterval: unique symbol
/** A finite draw in [0, 1), distinct from geometry's closed fraction. */
export type UnitInterval = Scalar.Fraction & { readonly [unitInterval]: true }
/** A draw and the state that follows it. */
export interface Draw<A> { readonly value: A; readonly state: State }
/** Invalid seed or saved algorithm. */
export type SeedError = { readonly tag: "Random/InvalidSeed"; readonly seed: number }
/** Untrusted state did not match the supported saved shape. */
export type DecodeError = { readonly tag: "Random/Malformed"; readonly input: unknown }
/** Integer sampling accepts safe integer bounds and a span at most 2^32. */
export type IntegerRangeError = { readonly tag: "Random/InvalidIntegerRange"; readonly min: number; readonly maxExclusive: number }
/** Float sampling uses a finite, ordered closed range; rounding can reach max. */
export type RangeError = { readonly tag: "Random/InvalidRange"; readonly min: number; readonly max: number }
/** A dynamic choice has no items. */
export type EmptyCollection = { readonly tag: "Random/EmptyCollection" }

const uint32 = 0x100000000
const state = (seed: number): State => Object.freeze({ algorithm: "mulberry32-v1", seed }) as State

/** Constructs the supported generator from an unsigned 32-bit seed. */
export const result = (seed: number): Result.Result<State, SeedError> =>
  Number.isInteger(seed) && seed >= 0 && seed < uint32
    ? Result.success(state(seed))
    : Result.failure({ tag: "Random/InvalidSeed", seed })
/** Validates saved state, rejecting unknown algorithm versions. */
export const decode = (raw: unknown): Result.Result<State, SeedError | DecodeError> => {
  if (typeof raw !== "object" || raw === null || !("algorithm" in raw) || raw.algorithm !== "mulberry32-v1" || !("seed" in raw) || typeof raw.seed !== "number") {
    return Result.failure({ tag: "Random/Malformed", input: raw })
  }
  return result(raw.seed)
}
/** One [0, 1) draw. Algorithm and counter advancement match the shooter. */
export const next = (current: State): Draw<UnitInterval> => {
  const seed = (current.seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { state: state(seed), value: (((t ^ (t >>> 14)) >>> 0) / uint32) as UnitInterval }
}

/** Uniform integer in [min, maxExclusive), using rejection to avoid modulo bias. */
export const integer = (current: State, bounds: { readonly min: number; readonly maxExclusive: number }): Result.Result<Draw<number>, IntegerRangeError> => {
  const { min, maxExclusive } = bounds
  const span = maxExclusive - min
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(maxExclusive) || !Number.isSafeInteger(span) || span <= 0 || span > uint32) {
    return Result.failure({ tag: "Random/InvalidIntegerRange", min, maxExclusive })
  }
  const limit = uint32 - uint32 % span
  let cursor = current
  for (;;) {
    const draw = next(cursor)
    cursor = draw.state
    const value = draw.value * uint32
    if (value < limit) return Result.success({ state: cursor, value: min + value % span })
  }
}
/** Finite float range. The upper endpoint may be reached by rounding. */
export const range = (current: State, bounds: { readonly min: Scalar.Finite; readonly max: Scalar.Finite }): Result.Result<Draw<Scalar.Finite>, RangeError> => {
  const { min, max } = bounds
  if (min > max) return Result.failure({ tag: "Random/InvalidRange", min, max })
  const draw = next(current)
  // Opposite signs can make max-min overflow despite a finite result.
  const value = (min < 0) !== (max < 0)
    ? min * (1 - draw.value) + max * draw.value
    : min + (max - min) * draw.value
  return Result.success({ state: draw.state, value: value as Scalar.Finite })
}
/** Dynamic arrays are checked; failed choices consume no state. */
export const pick = <A>(current: State, items: readonly A[]): Result.Result<Draw<A>, EmptyCollection> => {
  if (items.length === 0) return Result.failure({ tag: "Random/EmptyCollection" })
  // Keep float-based choice compatible with the shooter's existing sequence.
  const draw = next(current)
  return Result.success({ state: draw.state, value: items[Math.floor(draw.value * items.length)]! })
}
/** Fisher-Yates shuffle of a fresh array, using unbiased integer draws. */
export const shuffle = <A>(current: State, items: readonly A[]): Draw<readonly A[]> => {
  const shuffled = [...items]
  let cursor = current
  for (let i = shuffled.length - 1; i > 0; i--) {
    const draw = integer(cursor, { min: 0, maxExclusive: i + 1 })
    // Array lengths always meet integer's range constraints.
    if (!draw.ok) continue
    cursor = draw.value.state
    const j = draw.value.value
    const swap = shuffled[i]!
    shuffled[i] = shuffled[j]!
    shuffled[j] = swap
  }
  return { state: cursor, value: shuffled }
}
/** One draw from a validated positive-total table, in its authored order. */
export const weighted = <A>(current: State, table: Weighted.Table<A>): Draw<A> => {
  const draw = next(current)
  return { state: draw.state, value: Weighted.sample(table, draw.value) }
}

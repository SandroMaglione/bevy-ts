/**
 * Validated, ordered weighted choices. Gameplay decides which items qualify.
 *
 * Zero weights are never selected. Positive weights are sampled at the
 * generator's finite resolution, with cumulative floating-point sums. Weights
 * are snapshotted; generic values retain their application-owned references.
 *
 * @module Weighted
 * @docGroup data-structures
 */
import * as Result from "@typeonce/bevy-ts/Result"
import type * as Scalar from "./Scalar.ts"

/** Validated immutable choice table. Value types are inferred from entries. */
declare const valueType: unique symbol
const token: unique symbol = Symbol("Weighted/Table")
export type Table<A> = {
  readonly size: number
  readonly [token]: () => void
  readonly [valueType]: A
}
/** Raw authored weights. */
export interface Entry<A> { readonly value: A; readonly weight: number }
/** A table must have finite nonnegative weights and a finite positive total. */
export type Error =
  | { readonly tag: "Weighted/Empty" }
  | { readonly tag: "Weighted/InvalidWeight"; readonly index: number; readonly weight: number }
  | { readonly tag: "Weighted/ZeroTotal" }
  | { readonly tag: "Weighted/Overflow" }

type Data<A> = { readonly entries: readonly { readonly value: A; readonly through: number }[]; readonly total: number }
// Copying a table preserves its function token. Readonly ECS projections also
// preserve functions, so both views resolve the same private authored data.
const data = new WeakMap<() => void, Data<unknown>>()
/** Snapshots weights, preserving order and excluding zero-weight entries. */
export const result = <A>(items: readonly Entry<A>[]): Result.Result<Table<A>, Error> => {
  if (items.length === 0) return Result.failure({ tag: "Weighted/Empty" })
  const entries: { value: A; through: number }[] = []
  let total = 0
  for (let index = 0; index < items.length; index++) {
    const entry = items[index]!
    if (!Number.isFinite(entry.weight) || entry.weight < 0) return Result.failure({ tag: "Weighted/InvalidWeight", index, weight: entry.weight })
    if (entry.weight === 0) continue
    total += entry.weight
    if (!Number.isFinite(total)) return Result.failure({ tag: "Weighted/Overflow" })
    entries.push({ value: entry.value, through: total })
  }
  if (total === 0) return Result.failure({ tag: "Weighted/ZeroTotal" })
  const identity = () => {}
  const table = Object.freeze({ size: items.length, [token]: identity }) as Table<A>
  data.set(identity, { entries, total })
  return Result.success(table)
}
/** Samples a closed fraction; fraction 1 selects the last positive entry. */
export const sample = <A>(table: Table<A>, fraction: Scalar.Fraction): A => {
  const stored = data.get(table[token])! as Data<A>
  if (fraction === 0) return stored.entries[0]!.value
  if (fraction === 1) return stored.entries[stored.entries.length - 1]!.value
  let lower = 0
  let upper = stored.entries.length - 1
  while (lower < upper) {
    const middle = (lower + upper) >>> 1
    // Comparing normalized boundaries avoids rounding a tiny total's roll up
    // to the next subnormal bucket, which biases even equal-weight choices.
    if (fraction < stored.entries[middle]!.through / stored.total) upper = middle
    else lower = middle + 1
  }
  return stored.entries[lower]!.value
}

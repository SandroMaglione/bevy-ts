/**
 * A bounded, rebuildable uniform spatial hash over validated AABBs.
 *
 * Queries visit candidate keys once, in input order. Candidates are a broad
 * phase: run the exact shape predicate and resolve live entity handles yourself.
 * Rebuilds publish atomically, and callbacks see the query's key snapshot even
 * when they clear, rebuild, or query the index again.
 *
 * @module SpatialHash2
 * @docGroup data-structures
 */
import * as Result from "@typeonce/bevy-ts/Result"
import * as Aabb from "@typeonce/bevy-ts-math/Aabb"
import type * as Scalar from "@typeonce/bevy-ts-math/Scalar"

/** Primitive identity; equality follows JavaScript Map's SameValueZero rule. */
export type Key = string | number | bigint | symbol

/** Explicit work and storage limits. All supplied limits must be positive safe integers. */
export interface Limits {
  readonly maxEntries?: number
  readonly maxCells?: number
  readonly maxCellsPerEntry?: number
  readonly maxMemberships?: number
  readonly maxQueryCells?: number
}

/** Adapters are inferred from the initial items and reused by rebuild. */
export interface Options<Item, Id extends Key> {
  readonly cellSize: Scalar.Positive
  readonly key: (item: Item) => Id
  readonly bounds: (item: Item) => Aabb.Aabb
  readonly limits?: Limits
}

export type ConfigError = {
  readonly tag: "SpatialHash2/InvalidLimit"
  readonly name: keyof Limits
  readonly value: number
}

export type BuildError<Id extends Key> =
  | { readonly tag: "SpatialHash2/DuplicateKey"; readonly key: Id }
  | { readonly tag: "SpatialHash2/EntryLimit"; readonly limit: number }
  | { readonly tag: "SpatialHash2/CellLimit"; readonly limit: number }
  | { readonly tag: "SpatialHash2/MembershipLimit"; readonly limit: number }
  | { readonly tag: "SpatialHash2/EntryCoverage"; readonly key: Id; readonly limit: number }
  | { readonly tag: "SpatialHash2/EntryCoordinates"; readonly key: Id }

export type QueryError =
  | { readonly tag: "SpatialHash2/QueryCoverage"; readonly limit: number }
  | { readonly tag: "SpatialHash2/QueryCoordinates" }

/** Rebuild may fail; a failure leaves the previous contents intact. */
export interface Index<Item, Id extends Key> {
  readonly cellSize: Scalar.Positive
  rebuild(items: Iterable<Item>): Result.Result<void, BuildError<Id>>
  clear(): void
  size(): number
  forEachCandidate(bounds: Aabb.Aabb, visit: (key: Id) => void): Result.Result<void, QueryError>
}

type CellRange = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly count: number }
type Buckets = Map<number, Map<number, number[]>>
type ResolvedLimits = Required<Limits>

const defaults: ResolvedLimits = {
  maxEntries: 100_000,
  maxCells: 65_536,
  maxCellsPerEntry: 1_024,
  maxMemberships: 1_000_000,
  maxQueryCells: 4_096
}

const resolveLimits = (limits: Limits | undefined): Result.Result<ResolvedLimits, ConfigError> => {
  const next = { ...defaults, ...limits }
  for (const name of Object.keys(defaults) as Array<keyof Limits>) {
    const value = next[name]
    if (!Number.isSafeInteger(value) || value <= 0) {
      return Result.failure({ tag: "SpatialHash2/InvalidLimit", name, value })
    }
  }
  return Result.success(next)
}

const rangeOf = (bounds: Aabb.Aabb, cellSize: Scalar.Positive): CellRange | null => {
  const x0 = Math.floor(Aabb.left(bounds) / cellSize)
  const y0 = Math.floor(Aabb.top(bounds) / cellSize)
  const x1 = Math.floor(Aabb.right(bounds) / cellSize)
  const y1 = Math.floor(Aabb.bottom(bounds) / cellSize)
  if (![x0, y0, x1, y1].every(Number.isSafeInteger)) return null
  const count = (x1 - x0 + 1) * (y1 - y0 + 1)
  // Unsafe counts cannot fit any accepted safe-integer work limit.
  return { x0, y0, x1, y1, count }
}

class Hash<Item, Id extends Key> implements Index<Item, Id> {
  readonly cellSize: Scalar.Positive
  private readonly options: Options<Item, Id>
  private readonly limits: ResolvedLimits
  private buckets: Buckets = new Map()
  private keys: Id[] = []
  // Keep only modest buckets, so moving through new cells does not retain an
  // ever-growing history of cells or the largest arrays ever encountered.
  private readonly pool: number[][] = []

  constructor(options: Options<Item, Id>, limits: ResolvedLimits) {
    this.options = { cellSize: options.cellSize, key: options.key, bounds: options.bounds }
    this.cellSize = options.cellSize
    this.limits = limits
  }

  private release(buckets: Buckets): void {
    for (const column of buckets.values()) {
      for (const bucket of column.values()) {
        if (bucket.length <= 256 && this.pool.length < 256) {
          bucket.length = 0
          this.pool.push(bucket)
        }
      }
    }
  }

  rebuild(items: Iterable<Item>): Result.Result<void, BuildError<Id>> {
    const keys: Id[] = []
    const seen = new Set<Id>()
    const prepared: Array<{ readonly range: CellRange; readonly slot: number }> = []
    let memberships = 0
    // Validate before borrowing pooled storage or publishing any contents.
    for (const item of items) {
      if (keys.length >= this.limits.maxEntries) return Result.failure({ tag: "SpatialHash2/EntryLimit", limit: this.limits.maxEntries })
      const key = this.options.key(item)
      if (seen.has(key)) return Result.failure({ tag: "SpatialHash2/DuplicateKey", key })
      seen.add(key)
      const range = rangeOf(this.options.bounds(item), this.cellSize)
      if (range === null) return Result.failure({ tag: "SpatialHash2/EntryCoordinates", key })
      if (!Number.isSafeInteger(range.count) || range.count > this.limits.maxCellsPerEntry) return Result.failure({ tag: "SpatialHash2/EntryCoverage", key, limit: this.limits.maxCellsPerEntry })
      if (range.count > this.limits.maxMemberships - memberships) return Result.failure({ tag: "SpatialHash2/MembershipLimit", limit: this.limits.maxMemberships })
      memberships += range.count
      prepared.push({ range, slot: keys.length })
      keys.push(key)
    }

    const buckets: Buckets = new Map()
    let cells = 0
    for (const { range, slot } of prepared) {
      for (let x = range.x0; x <= range.x1; x++) {
        let column = buckets.get(x)
        if (column === undefined) {
          column = new Map()
          buckets.set(x, column)
        }
        for (let y = range.y0; y <= range.y1; y++) {
          let bucket = column.get(y)
          if (bucket === undefined) {
            if (cells >= this.limits.maxCells) {
              this.release(buckets)
              return Result.failure({ tag: "SpatialHash2/CellLimit", limit: this.limits.maxCells })
            }
            cells += 1
            bucket = this.pool.pop() ?? []
            column.set(y, bucket)
          }
          bucket.push(slot)
        }
      }
    }
    this.release(this.buckets)
    this.buckets = buckets
    this.keys = keys
    return Result.success(undefined)
  }

  clear(): void {
    this.release(this.buckets)
    this.buckets = new Map()
    this.keys = []
  }

  size(): number { return this.keys.length }

  forEachCandidate(bounds: Aabb.Aabb, visit: (key: Id) => void): Result.Result<void, QueryError> {
    const range = rangeOf(bounds, this.cellSize)
    if (range === null) return Result.failure({ tag: "SpatialHash2/QueryCoordinates" })
    if (!Number.isSafeInteger(range.count) || range.count > this.limits.maxQueryCells) return Result.failure({ tag: "SpatialHash2/QueryCoverage", limit: this.limits.maxQueryCells })
    const slots = new Set<number>()
    for (let x = range.x0; x <= range.x1; x++) {
      const column = this.buckets.get(x)
      if (column === undefined) continue
      for (let y = range.y0; y <= range.y1; y++) {
        const bucket = column.get(y)
        if (bucket !== undefined) for (const slot of bucket) slots.add(slot)
      }
    }
    const keys = this.keys
    for (const slot of [...slots].sort((a, b) => a - b)) visit(keys[slot]!)
    return Result.success(undefined)
  }
}

/**
 * Builds an index; item and key types come from the inputs, with no explicit
 * generic arguments. Inclusive bounds include touching edges and zero-size
 * boxes. Query callbacks run only after the query has passed all work limits.
 */
export const from = <Item, Id extends Key>(items: Iterable<Item>, options: Options<Item, Id>): Result.Result<Index<Item, Id>, ConfigError | BuildError<Id>> => {
  const limits = resolveLimits(options.limits)
  if (!limits.ok) return limits
  const index = new Hash(options, limits.value)
  const built = index.rebuild(items)
  if (!built.ok) return built
  // Public methods capture the index rather than depending on `this`. The
  // wrapper also seals metadata without freezing the private rebuild state.
  return Result.success(Object.freeze({
    cellSize: index.cellSize,
    rebuild: (next: Iterable<Item>) => index.rebuild(next),
    clear: () => index.clear(),
    size: () => index.size(),
    forEachCandidate: (bounds: Aabb.Aabb, visit: (key: Id) => void) => index.forEachCandidate(bounds, visit)
  }))
}

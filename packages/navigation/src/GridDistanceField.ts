/**
 * Multi-goal Dijkstra fields over immutable grids.
 *
 * Reverse traversal reads predecessor-to-current costs, so asymmetric costs
 * still describe travel toward the goals. A visit budget returns an explicit
 * failure without exposing a partial field as if its unvisited cells were
 * unreachable. Equal distances settle in row-major cell order.
 *
 * @module GridDistanceField
 * @docGroup helpers
 */
import * as Result from "@typeonce/bevy-ts/Result"
import type * as Grid2 from "./Grid2.ts"
import * as internal from "./internal/grid.ts"

/** A completed field tied to its original immutable grid snapshot. */
const fieldToken: unique symbol = Symbol("Navigation/FieldSnapshot")

export interface GridDistanceField {
  readonly grid: Grid2.Grid2
  readonly visited: number

  readonly [fieldToken]: () => void
}

/** At least one goal is required. Dynamic goal lists are checked at runtime. */
export interface Config {
  readonly goals: ReadonlyArray<Grid2.Cell>
  /** Maximum settled cells. Stale heap entries do not consume the budget. */
  readonly maxVisited: number
}

/** Invalid goals, exhausted work budgets, and overflow stay explicit. */
export type Error =
  | { readonly tag: "GridDistanceField/NoGoals" }
  | { readonly tag: "GridDistanceField/GoalOutside"; readonly goal: Grid2.Cell }
  | { readonly tag: "GridDistanceField/GoalBlocked"; readonly goal: Grid2.Cell }
  | { readonly tag: "GridDistanceField/InvalidBudget"; readonly value: number }
  | { readonly tag: "GridDistanceField/BudgetExceeded"; readonly maxVisited: number; readonly visited: number }
  | { readonly tag: "GridDistanceField/DistanceOverflow"; readonly from: Grid2.Cell; readonly to: Grid2.Cell }

/** Results distinguish map constraints from having reached a goal. */
export type Step =
  | { readonly kind: "next"; readonly cell: Grid2.Cell; readonly distance: number; readonly cost: number }
  | { readonly kind: "arrived" }
  | { readonly kind: "unreachable" }
  | { readonly kind: "blocked" }
  | { readonly kind: "outside" }

/** Distance to the cheapest goal, or the reason there is no distance. */
export type Distance =
  | { readonly kind: "reachable"; readonly distance: number }
  | { readonly kind: "blocked" }
  | { readonly kind: "outside" }
  | { readonly kind: "unreachable" }

interface State {
  readonly grid: Grid2.Grid2
  readonly distance: Float64Array
  readonly next: Int32Array
  readonly nextCost: Float64Array
}

const states = new WeakMap<() => void, State>()

interface Entry { readonly index: number; readonly cost: number }

/** One live entry per cell keeps the heap bounded by the grid's cell count. */
class Heap {
  private readonly entries: Array<Entry> = []
  private readonly positions: Int32Array

  constructor(cells: number) { this.positions = new Int32Array(cells).fill(-1) }

  get length(): number { return this.entries.length }

  private before(a: Entry, b: Entry): boolean { return a.cost < b.cost || (a.cost === b.cost && a.index < b.index) }

  push(index: number, cost: number): void {
    const entry = { index, cost }
    let at = this.positions[index]!
    if (at < 0) {
      at = this.entries.length
      this.entries.push(entry)
    }
    while (at > 0) {
      const parent = (at - 1) >> 1
      const other = this.entries[parent]!
      if (!this.before(entry, other)) break
      this.entries[at] = other
      this.positions[other.index] = at
      at = parent
    }
    this.entries[at] = entry
    this.positions[index] = at
  }

  pop(): Entry {
    const first = this.entries[0]!
    const last = this.entries.pop()!
    this.positions[first.index] = -1
    if (this.entries.length === 0) return first
    let at = 0
    for (;;) {
      const left = at * 2 + 1
      if (left >= this.entries.length) break
      const right = left + 1
      const child = right < this.entries.length && this.before(this.entries[right]!, this.entries[left]!) ? right : left
      const other = this.entries[child]!
      if (!this.before(other, last)) break
      this.entries[at] = other
      this.positions[other.index] = at
      at = child
    }
    this.entries[at] = last
    this.positions[last.index] = at
    return first
  }
}

const cellOf = (grid: Grid2.Grid2, index: number): Grid2.Cell => ({ column: index % grid.columns, row: Math.floor(index / grid.columns) })

/** Builds a complete field. Goals must be open, inside cells. Duplicate goals are harmless. */
export const build = (grid: Grid2.Grid2, config: Config): Result.Result<GridDistanceField, Error> => {
  if (!Number.isSafeInteger(config.maxVisited) || config.maxVisited < 0) {
    return Result.failure({ tag: "GridDistanceField/InvalidBudget", value: config.maxVisited })
  }
  if (config.goals.length === 0) return Result.failure({ tag: "GridDistanceField/NoGoals" })
  const data = internal.snapshot(grid)
  grid = data.grid
  const cells = grid.columns * grid.rows
  const goals: Array<number> = []
  for (const goal of config.goals) {
    const index = internal.indexOf(grid, goal.column, goal.row)
    if (index === undefined) return Result.failure({ tag: "GridDistanceField/GoalOutside", goal: { ...goal } })
    if (data.walkable[index] === 0) return Result.failure({ tag: "GridDistanceField/GoalBlocked", goal: { ...goal } })
    goals.push(index)
  }
  const distance = new Float64Array(cells).fill(Infinity)
  const next = new Int32Array(cells).fill(-1)
  const nextCost = new Float64Array(cells)
  const settled = new Uint8Array(cells)
  const heap = new Heap(cells)
  for (const index of goals) {
    if (distance[index] === 0) continue
    distance[index] = 0
    heap.push(index, 0)
  }
  let visited = 0
  while (heap.length > 0) {
    if (visited >= config.maxVisited) {
      return Result.failure({ tag: "GridDistanceField/BudgetExceeded", maxVisited: config.maxVisited, visited })
    }
    const { index, cost } = heap.pop()
    settled[index] = 1
    visited++
    const current = cellOf(grid, index)
    for (let direction = 0; direction < data.neighbors; direction++) {
      const [dx, dy] = internal.offsets[direction]!
      const predecessor = internal.indexOf(grid, current.column + dx, current.row + dy)
      if (predecessor === undefined || settled[predecessor] === 1) continue
      const edge = data.costs[predecessor * data.neighbors + internal.opposite[direction]!]!
      if (edge === Infinity) continue
      const through = cost + edge
      if (!Number.isFinite(through)) {
        return Result.failure({ tag: "GridDistanceField/DistanceOverflow", from: cellOf(grid, predecessor), to: current })
      }
      if (through >= distance[predecessor]!) continue
      distance[predecessor] = through
      next[predecessor] = index
      nextCost[predecessor] = edge
      heap.push(predecessor, through)
    }
  }
  const field: GridDistanceField = Object.freeze({ grid, visited, [fieldToken]: () => {} })
  states.set(field[fieldToken], { grid, distance, next, nextCost })
  return Result.success(field)
}

/** Returns the first step on a shortest path. Zero-cost paths do not form cycles. */
export const nextCell = (field: GridDistanceField, cell: Grid2.Cell): Step => {
  const state = states.get(field[fieldToken])!
  const grid = state.grid
  const index = internal.indexOf(grid, cell.column, cell.row)
  if (index === undefined) return { kind: "outside" }
  if (internal.snapshot(grid).walkable[index] === 0) return { kind: "blocked" }
  const distance = state.distance[index]!
  if (distance === Infinity) return { kind: "unreachable" }
  const next = state.next[index]!
  return next < 0 ? { kind: "arrived" } : { kind: "next", cell: cellOf(grid, next), distance, cost: state.nextCost[index]! }
}

/** Reads a cell's complete shortest-path distance to any goal. */
export const distance = (field: GridDistanceField, cell: Grid2.Cell): Distance => {
  const state = states.get(field[fieldToken])!
  const grid = state.grid
  const index = internal.indexOf(grid, cell.column, cell.row)
  if (index === undefined) return { kind: "outside" }
  if (internal.snapshot(grid).walkable[index] === 0) return { kind: "blocked" }
  const distance = state.distance[index]!
  return distance === Infinity ? { kind: "unreachable" } : { kind: "reachable", distance }
}

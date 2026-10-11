/**
 * Immutable grid snapshots with explicit directed movement costs.
 *
 * Construction evaluates walkability and each legal edge once. Searches do
 * not call back into changing game state. Rebuild the grid when walls or costs
 * change. Eight-neighbor movement never cuts through a blocked corner.
 *
 * @module Grid2
 * @docGroup data-structures
 */
import * as Result from "@typeonce/bevy-ts/Result"
import * as internal from "./internal/grid.ts"

/** A grid coordinate. Inputs are checked for safe integers and grid bounds. */
export interface Cell {
  readonly column: number
  readonly row: number
}

/** Validated, immutable grid metadata. Cell and edge storage stays private. */
export interface Grid2 {
  readonly columns: number
  readonly rows: number
  readonly connectivity: "four" | "eight"

  readonly [internal.gridToken]: () => void
}

/** Hard allocation ceiling. A caller must also supply its own `maxCells`. */
export const maximumCells = 1_000_000

/** Construction inputs. Costs describe the complete directed step, including diagonals. */
export interface Config {
  readonly columns: number
  readonly rows: number
  readonly connectivity: "four" | "eight"
  readonly maxCells: number
  readonly walkable: (cell: Cell) => boolean
  /** `null` forbids a directed step. A number includes its full diagonal cost. */
  readonly cost: (from: Cell, to: Cell) => number | null
}

/** Ordinary construction failures are returned, including invalid callback results. */
export type Error =
  | { readonly tag: "Grid2/InvalidDimension"; readonly dimension: "columns" | "rows"; readonly value: number }
  | { readonly tag: "Grid2/InvalidConnectivity"; readonly value: unknown }
  | { readonly tag: "Grid2/InvalidLimit"; readonly value: number }
  | { readonly tag: "Grid2/CellLimit"; readonly cells: number; readonly maxCells: number }
  | { readonly tag: "Grid2/InvalidWalkability"; readonly cell: Cell; readonly value: unknown }
  | { readonly tag: "Grid2/InvalidCost"; readonly from: Cell; readonly to: Cell; readonly value: number }

/** A cell lookup distinguishes an open cell, a blocked cell, and outside coordinates. */
export type CellState =
  | { readonly kind: "open" }
  | { readonly kind: "blocked" }
  | { readonly kind: "outside" }

/**
 * Takes a snapshot of cells and legal directed edges. Finite nonnegative
 * costs include zero. User callback exceptions propagate as programmer errors.
 */
export const result = (config: Config): Result.Result<Grid2, Error> => {
  for (const dimension of ["columns", "rows"] as const) {
    const value = config[dimension]
    if (!Number.isSafeInteger(value) || value <= 0) {
      return Result.failure({ tag: "Grid2/InvalidDimension", dimension, value })
    }
  }
  if (config.connectivity !== "four" && config.connectivity !== "eight") {
    return Result.failure({ tag: "Grid2/InvalidConnectivity", value: config.connectivity })
  }
  if (!Number.isSafeInteger(config.maxCells) || config.maxCells <= 0 || config.maxCells > maximumCells) {
    return Result.failure({ tag: "Grid2/InvalidLimit", value: config.maxCells })
  }
  const cells = config.columns * config.rows
  if (!Number.isSafeInteger(cells) || cells > config.maxCells) {
    return Result.failure({ tag: "Grid2/CellLimit", cells, maxCells: config.maxCells })
  }
  const grid: Grid2 = Object.freeze({ columns: config.columns, rows: config.rows, connectivity: config.connectivity, [internal.gridToken]: () => {} })
  const readWalkable = config.walkable
  const readCost = config.cost
  const neighbors = config.connectivity === "four" ? 4 : 8
  const walkable = new Uint8Array(cells)
  const costs = new Float64Array(cells * neighbors).fill(Infinity)
  internal.store(grid, { grid, walkable, costs, neighbors })
  for (let index = 0; index < cells; index++) {
    const cell = Object.freeze({ column: index % grid.columns, row: Math.floor(index / grid.columns) })
    const value = readWalkable(cell)
    if (typeof value !== "boolean") return Result.failure({ tag: "Grid2/InvalidWalkability", cell, value })
    walkable[index] = value ? 1 : 0
  }
  for (let index = 0; index < cells; index++) {
    if (walkable[index] === 0) continue
    const from = Object.freeze({ column: index % grid.columns, row: Math.floor(index / grid.columns) })
    for (let direction = 0; direction < neighbors; direction++) {
      const [dx, dy] = internal.offsets[direction]!
      const column = from.column + dx
      const row = from.row + dy
      const next = internal.indexOf(grid, column, row)
      if (next === undefined || walkable[next] === 0) continue
      if (dx !== 0 && dy !== 0 && (
        walkable[from.row * grid.columns + column] === 0 ||
        walkable[row * grid.columns + from.column] === 0
      )) continue
      const to = Object.freeze({ column, row })
      const value = readCost(from, to)
      if (value === null) continue
      if (!Number.isFinite(value) || value < 0) {
        return Result.failure({ tag: "Grid2/InvalidCost", from, to, value })
      }
      costs[index * neighbors + direction] = value
    }
  }
  return Result.success(grid)
}

/** Reads walkability without invoking the constructor's callback again. */
export const cellState = (grid: Grid2, cell: Cell): CellState => {
  const index = internal.indexOf(grid, cell.column, cell.row)
  return index === undefined ? { kind: "outside" } : internal.snapshot(grid).walkable[index] === 0 ? { kind: "blocked" } : { kind: "open" }
}

import type { Grid2 } from "../Grid2.ts"

export const offsets: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [-1, 1], [-1, -1], [1, -1]
]

export const opposite = [2, 3, 0, 1, 6, 7, 4, 5] as const

export interface Snapshot {
  /** Canonical metadata is owned by the token, never by a caller's spread. */
  readonly grid: Grid2
  readonly walkable: Uint8Array
  /** One outgoing directed cost per cell and neighbor. Infinity means no edge. */
  readonly costs: Float64Array
  readonly neighbors: 4 | 8
}

/** The copied function token keeps spreads and ECS read projections valid. */
export const gridToken: unique symbol = Symbol("Navigation/GridSnapshot")

const snapshots = new WeakMap<() => void, Snapshot>()

export const store = (grid: Grid2, snapshot: Snapshot): void => { snapshots.set(grid[gridToken], snapshot) }

export const snapshot = (grid: Grid2): Snapshot => snapshots.get(grid[gridToken])!

export const indexOf = (input: Grid2, column: number, row: number): number | undefined => {
  const grid = snapshot(input).grid
  return Number.isSafeInteger(column) && Number.isSafeInteger(row) && column >= 0 && row >= 0 && column < grid.columns && row < grid.rows
    ? row * grid.columns + column
    : undefined
}

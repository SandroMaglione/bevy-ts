import { describe, expect, it } from "vitest"
import { Grid2, GridDistanceField } from "@typeonce/bevy-ts-navigation"

const cell = (column: number, row: number): Grid2.Cell => ({ column, row })

const config = (overrides: Partial<Grid2.Config> = {}): Grid2.Config => ({
  columns: 3,
  rows: 3,
  maxCells: 9,
  connectivity: "four",
  walkable: () => true,
  cost: () => 1,
  ...overrides
})

const gridOf = (overrides: Partial<Grid2.Config> = {}): Grid2.Grid2 => {
  const grid = Grid2.result(config(overrides))
  if (!grid.ok) throw new Error(JSON.stringify(grid.error))
  return grid.value
}

const fieldOf = (grid: Grid2.Grid2, goals = [cell(2, 2)]): GridDistanceField.GridDistanceField => {
  const field = GridDistanceField.build(grid, { goals, maxVisited: grid.columns * grid.rows })
  if (!field.ok) throw new Error(JSON.stringify(field.error))
  return field.value
}

describe("grid construction", () => {
  it("validates dimensions and allocation limits before callbacks", () => {
    const never = () => { throw new Error("must not run") }
    for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(Grid2.result(config({ columns: value, walkable: never }))).toMatchObject({ ok: false, error: { tag: "Grid2/InvalidDimension" } })
      expect(Grid2.result(config({ rows: value, walkable: never }))).toMatchObject({ ok: false, error: { tag: "Grid2/InvalidDimension" } })
    }
    for (const maxCells of [0, -1, 0.5, Infinity, Grid2.maximumCells + 1]) {
      expect(Grid2.result(config({ maxCells, walkable: never }))).toMatchObject({ ok: false, error: { tag: "Grid2/InvalidLimit" } })
    }
    expect(Grid2.result(config({ maxCells: 8, walkable: never }))).toMatchObject({ ok: false, error: { tag: "Grid2/CellLimit", cells: 9 } })
    expect(Grid2.result(config({ columns: Number.MAX_SAFE_INTEGER, rows: 2, walkable: never }))).toMatchObject({ ok: false, error: { tag: "Grid2/CellLimit" } })
  })

  it("rejects invalid edge costs and malformed runtime callback values", () => {
    for (const value of [-1, NaN, Infinity, -Infinity]) {
      expect(Grid2.result(config({ cost: () => value }))).toMatchObject({ ok: false, error: { tag: "Grid2/InvalidCost", from: cell(0, 0), to: cell(1, 0) } })
    }
    // Untyped authored inputs still cross the same runtime checks.
    const malformed = { ...config(), connectivity: "six" } as unknown as Grid2.Config
    expect(Grid2.result(malformed)).toMatchObject({ ok: false, error: { tag: "Grid2/InvalidConnectivity" } })
    const malformedWalkability = { ...config(), walkable: () => 1 } as unknown as Grid2.Config
    expect(Grid2.result(malformedWalkability)).toMatchObject({ ok: false, error: { tag: "Grid2/InvalidWalkability" } })
  })

  it("takes an immutable snapshot and invokes no callbacks during search", () => {
    let blocked = false
    let price = 1
    let calls = 0
    const grid = gridOf({ walkable: () => { calls++; return !blocked }, cost: () => { calls++; return price } })
    const snapshotCalls = calls
    blocked = true
    price = 100
    const field = fieldOf(grid)
    expect(GridDistanceField.distance(field, cell(0, 0))).toEqual({ kind: "reachable", distance: 4 })
    expect(Grid2.cellState(grid, cell(0, 0))).toEqual({ kind: "open" })
    expect(calls).toBe(snapshotCalls)
    expect(Object.isFrozen(grid)).toBe(true)
    expect(Object.isFrozen(field)).toBe(true)
    const newGrid = gridOf({ walkable: () => false })
    expect(Grid2.cellState(newGrid, cell(0, 0))).toEqual({ kind: "blocked" })
    expect(GridDistanceField.distance(field, cell(0, 0))).toEqual({ kind: "reachable", distance: 4 })
  })

  it("captures callback references before invoking user adapters", () => {
    const configuration = {
      ...config(),
      walkable: (_cell: Grid2.Cell) => {
        configuration.walkable = () => false
        configuration.cost = () => 100
        return true
      },
      cost: (_from: Grid2.Cell, _to: Grid2.Cell): number => 1
    }
    const made = Grid2.result(configuration)
    if (!made.ok) throw new Error(made.error.tag)
    expect(GridDistanceField.distance(fieldOf(made.value), cell(0, 0))).toEqual({ kind: "reachable", distance: 4 })
  })
})

describe("distance fields", () => {
  it("preserves private snapshots through typed metadata spreads", () => {
    const grid = gridOf()
    const field = fieldOf({ ...grid })
    expect(Grid2.cellState({ ...grid }, cell(0, 0))).toEqual({ kind: "open" })
    expect(GridDistanceField.distance({ ...field }, cell(0, 0))).toEqual({ kind: "reachable", distance: 4 })
    expect(GridDistanceField.nextCell({ ...field }, cell(2, 2))).toEqual({ kind: "arrived" })
    const metadataCopy = { ...grid, columns: 999, rows: 999, connectivity: "eight" as const }
    expect(Grid2.cellState(metadataCopy, cell(3, 0))).toEqual({ kind: "outside" })
    expect(GridDistanceField.distance(fieldOf(metadataCopy), cell(0, 0))).toEqual({ kind: "reachable", distance: 4 })
    const otherGrid = gridOf({ columns: 1, rows: 1, maxCells: 1, walkable: () => false })
    const fieldCopy = { ...field, grid: otherGrid, visited: -1 }
    expect(GridDistanceField.distance(fieldCopy, cell(0, 0))).toEqual({ kind: "reachable", distance: 4 })
    expect(GridDistanceField.nextCell(fieldCopy, cell(2, 2))).toEqual({ kind: "arrived" })
  })
  it("distinguishes arrival, blocked cells, outside coordinates, and unreachable cells", () => {
    const grid = gridOf({ walkable: ({ column }) => column !== 1 })
    const field = fieldOf(grid)
    expect(GridDistanceField.nextCell(field, cell(2, 2))).toEqual({ kind: "arrived" })
    expect(GridDistanceField.nextCell(field, cell(0, 0))).toEqual({ kind: "unreachable" })
    expect(GridDistanceField.nextCell(field, cell(1, 0))).toEqual({ kind: "blocked" })
    expect(GridDistanceField.distance(field, cell(1, 0))).toEqual({ kind: "blocked" })
    expect(GridDistanceField.distance(field, cell(0, 0))).toEqual({ kind: "unreachable" })
    for (const outside of [cell(-1, 0), cell(3, 0), cell(0, 3), cell(0.5, 0), cell(NaN, 0), cell(0, Infinity)]) {
      expect(GridDistanceField.nextCell(field, outside)).toEqual({ kind: "outside" })
      expect(GridDistanceField.distance(field, outside)).toEqual({ kind: "outside" })
      expect(Grid2.cellState(grid, outside)).toEqual({ kind: "outside" })
    }
  })

  it("uses diagonal costs and never cuts blocked corners", () => {
    const cost: Grid2.Config["cost"] = (from, to) => from.column !== to.column && from.row !== to.row ? Math.SQRT2 : 1
    const open = fieldOf(gridOf({ connectivity: "eight", cost }))
    expect(GridDistanceField.distance(open, cell(0, 0))).toEqual({ kind: "reachable", distance: 2 * Math.SQRT2 })
    expect(GridDistanceField.nextCell(open, cell(0, 0))).toEqual({ kind: "next", cell: cell(1, 1), distance: 2 * Math.SQRT2, cost: Math.SQRT2 })
    const closed = fieldOf(gridOf({ connectivity: "eight", cost, walkable: ({ column, row }) => !(column === 1 && row === 0) && !(column === 0 && row === 1) }))
    expect(GridDistanceField.nextCell(closed, cell(0, 0))).toEqual({ kind: "unreachable" })
    const oneSide = fieldOf(gridOf({ connectivity: "eight", cost, walkable: ({ column, row }) => !(column === 1 && row === 0) }))
    expect(GridDistanceField.nextCell(oneSide, cell(0, 0))).toMatchObject({ kind: "next", cell: cell(0, 1) })
  })

  it("finds cheapest multi-goal routes independently of goal order", () => {
    const grid = gridOf()
    const goals = [cell(2, 0), cell(0, 2), cell(2, 0)]
    const first = fieldOf(grid, goals)
    const second = fieldOf(grid, [...goals].reverse())
    expect(first.visited).toBe(9)
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        expect(GridDistanceField.nextCell(first, cell(column, row))).toEqual(GridDistanceField.nextCell(second, cell(column, row)))
      }
    }
    expect(GridDistanceField.nextCell(first, cell(1, 1))).toEqual({ kind: "next", cell: cell(1, 0), distance: 2, cost: 1 })
  })

  it("reads asymmetric costs in the forward travel direction and supports one-way edges", () => {
    const grid = gridOf({ columns: 3, rows: 1, maxCells: 3, cost: (from, to) => to.column > from.column ? 2 : 10 })
    const right = fieldOf(grid, [cell(2, 0)])
    const left = fieldOf(grid, [cell(0, 0)])
    expect(GridDistanceField.distance(right, cell(0, 0))).toEqual({ kind: "reachable", distance: 4 })
    expect(GridDistanceField.distance(left, cell(2, 0))).toEqual({ kind: "reachable", distance: 20 })
    const directed = gridOf({ columns: 3, rows: 1, maxCells: 3, cost: (from, to) => to.column > from.column ? 2 : null })
    expect(GridDistanceField.distance(fieldOf(directed, [cell(0, 0)]), cell(2, 0))).toEqual({ kind: "unreachable" })
    expect(GridDistanceField.distance(fieldOf(directed, [cell(2, 0)]), cell(0, 0))).toEqual({ kind: "reachable", distance: 4 })
  })

  it("chooses longer routes when their weighted cost is lower", () => {
    const grid = gridOf({ cost: (from, to) => from.row === 1 && to.row === 1 ? 100 : 1 })
    const field = fieldOf(grid, [cell(2, 1)])
    expect(GridDistanceField.distance(field, cell(0, 1))).toEqual({ kind: "reachable", distance: 4 })
    expect(GridDistanceField.nextCell(field, cell(0, 1))).toMatchObject({ kind: "next", cell: cell(0, 0) })
  })

  it("constructs zero-cost paths without cycles", () => {
    const grid = gridOf({ cost: () => 0 })
    const field = fieldOf(grid)
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        let current = cell(column, row)
        const seen = new Set<string>()
        for (;;) {
          const key = `${current.column},${current.row}`
          expect(seen.has(key)).toBe(false)
          seen.add(key)
          const next = GridDistanceField.nextCell(field, current)
          if (next.kind === "arrived") break
          if (next.kind !== "next") throw new Error(next.kind)
          expect(next.cost).toBe(0)
          current = next.cell
        }
        expect(current).toEqual(cell(2, 2))
      }
    }
  })

  it("returns failures for invalid goals and budgets without a partial field", () => {
    const grid = gridOf({ walkable: ({ column, row }) => !(column === 1 && row === 1) })
    expect(GridDistanceField.build(grid, { goals: [], maxVisited: 9 })).toEqual({ ok: false, error: { tag: "GridDistanceField/NoGoals" } })
    expect(GridDistanceField.build(grid, { goals: [cell(1, 1)], maxVisited: 9 })).toEqual({ ok: false, error: { tag: "GridDistanceField/GoalBlocked", goal: cell(1, 1) } })
    expect(GridDistanceField.build(grid, { goals: [cell(-1, 0)], maxVisited: 9 })).toEqual({ ok: false, error: { tag: "GridDistanceField/GoalOutside", goal: cell(-1, 0) } })
    for (const maxVisited of [-1, 0.5, NaN, Infinity]) {
      expect(GridDistanceField.build(grid, { goals: [cell(2, 2)], maxVisited })).toMatchObject({ ok: false, error: { tag: "GridDistanceField/InvalidBudget" } })
    }
    for (const maxVisited of [0, 1, 7]) {
      expect(GridDistanceField.build(grid, { goals: [cell(2, 2)], maxVisited })).toEqual({ ok: false, error: { tag: "GridDistanceField/BudgetExceeded", maxVisited, visited: maxVisited } })
    }
    expect(GridDistanceField.build(grid, { goals: [cell(2, 2)], maxVisited: 8 })).toMatchObject({ ok: true, value: { visited: 8 } })
  })

  it("reports accumulated distance overflow instead of labeling a route unreachable", () => {
    const grid = gridOf({ columns: 3, rows: 1, maxCells: 3, cost: () => Number.MAX_VALUE })
    expect(GridDistanceField.build(grid, { goals: [cell(2, 0)], maxVisited: 3 })).toEqual({ ok: false, error: { tag: "GridDistanceField/DistanceOverflow", from: cell(0, 0), to: cell(1, 0) } })
  })
})

/** Independent forward Bellman-Ford oracle, one search per starting cell. */
const referenceDistance = (configuration: Grid2.Config, start: Grid2.Cell, goals: ReadonlyArray<Grid2.Cell>): number => {
  const size = configuration.columns * configuration.rows
  const distances = Array<number>(size).fill(Infinity)
  distances[start.row * configuration.columns + start.column] = 0
  const directions = configuration.connectivity === "four"
    ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  const inside = (c: Grid2.Cell) => c.column >= 0 && c.row >= 0 && c.column < configuration.columns && c.row < configuration.rows
  for (let round = 0; round < size - 1; round++) {
    let changed = false
    for (let index = 0; index < size; index++) {
      const from = cell(index % configuration.columns, Math.floor(index / configuration.columns))
      if (!configuration.walkable(from) || distances[index] === Infinity) continue
      for (const [dx, dy] of directions) {
        const to = cell(from.column + dx!, from.row + dy!)
        if (!inside(to) || !configuration.walkable(to)) continue
        if (dx !== 0 && dy !== 0 && (!configuration.walkable(cell(to.column, from.row)) || !configuration.walkable(cell(from.column, to.row)))) continue
        const cost = configuration.cost(from, to)
        if (cost === null) continue
        const next = to.row * configuration.columns + to.column
        const through = distances[index]! + cost
        if (through < distances[next]!) { distances[next] = through; changed = true }
      }
    }
    if (!changed) break
  }
  return Math.min(...goals.map((goal) => distances[goal.row * configuration.columns + goal.column]!))
}

it("matches an independent forward search on varied weighted directed maps", () => {
  for (let seed = 0; seed < 24; seed++) {
    const goals = [cell(5, 4), cell(0, 4)]
    const configuration = config({
      columns: 6,
      rows: 5,
      maxCells: 30,
      connectivity: seed % 2 === 0 ? "four" : "eight",
      walkable: ({ column, row }) => row === 4 || (column * 17 + row * 7 + seed * 13) % 11 !== 0,
      cost: (from, to) => {
        const value = (from.column * 3 + from.row * 7 + to.column * 11 + to.row * 17 + seed) % 13
        return value === 12 ? null : value / 2
      }
    })
    const made = Grid2.result(configuration)
    if (!made.ok) throw new Error(JSON.stringify(made.error))
    const field = fieldOf(made.value, goals)
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 6; column++) {
        const from = cell(column, row)
        if (!configuration.walkable(from)) continue
        const expected = referenceDistance(configuration, from, goals)
        const actual = GridDistanceField.distance(field, from)
        if (expected === Infinity) {
          expect(actual).toEqual({ kind: "unreachable" })
          continue
        }
        expect(actual).toEqual({ kind: "reachable", distance: expected })
        let current = from
        let cost = 0
        const seen = new Set<string>()
        for (;;) {
          const key = `${current.column},${current.row}`
          expect(seen.has(key)).toBe(false)
          seen.add(key)
          const next = GridDistanceField.nextCell(field, current)
          if (next.kind === "arrived") break
          if (next.kind !== "next") throw new Error(next.kind)
          cost += next.cost
          expect(configuration.cost(current, next.cell)).toBe(next.cost)
          current = next.cell
        }
        expect(cost).toBe(expected)
        expect(goals.some((goal) => goal.column === current.column && goal.row === current.row)).toBe(true)
      }
    }
  }
})

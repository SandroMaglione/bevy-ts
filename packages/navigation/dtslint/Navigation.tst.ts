import type { Result } from "@typeonce/bevy-ts"
import type { ReadonlyValue } from "@typeonce/bevy-ts/Query"
import { Grid2, GridDistanceField } from "@typeonce/bevy-ts-navigation"
import { describe, expect, it } from "tstyche"

describe("navigation", () => {
  it("infers grid callbacks and explicit constructor results", () => {
    const made = Grid2.result({
      columns: 4,
      rows: 4,
      connectivity: "eight",
      maxCells: 16,
      walkable: (cell) => {
        expect(cell).type.toBe<Grid2.Cell>()
        return true
      },
      cost: (from, to) => {
        expect(from).type.toBe<Grid2.Cell>()
        expect(to).type.toBe<Grid2.Cell>()
        return from.row === to.row ? 1 : null
      }
    })
    expect(made).type.toBe<Result.Result<Grid2.Grid2, Grid2.Error>>()
    expect(Grid2.maximumCells).type.toBe<1_000_000>()
    if (!made.ok) return
    expect(Grid2.cellState(made.value, { column: 0, row: 0 })).type.toBe<Grid2.CellState>()
    const input = { columns: 4, rows: 4, connectivity: "eight" as const }
    expect(Grid2.cellState).type.not.toBeCallableWith(input, { column: 0, row: 0 })
    expect(Grid2.cellState({ ...made.value }, { column: 0, row: 0 })).type.toBe<Grid2.CellState>()
    const view: ReadonlyValue<Grid2.Grid2> = made.value
    expect(Grid2.cellState(view, { column: 0, row: 0 })).type.toBe<Grid2.CellState>()
    // @ts-expect-error Cannot assign to 'columns' because it is a read-only property.
    made.value.columns = 5
  })

  it("requires explicit connectivity, limits, and typed coordinate values", () => {
    const common = { columns: 4, rows: 4, maxCells: 16, walkable: () => true, cost: () => 1 }
    expect(Grid2.result({ ...common, connectivity: "four" })).type.toBe<Result.Result<Grid2.Grid2, Grid2.Error>>()
    expect(Grid2.result).type.not.toBeCallableWith(common)
    expect(Grid2.result).type.not.toBeCallableWith({ ...common, connectivity: "six" })
    expect(Grid2.result).type.not.toBeCallableWith({ ...common, connectivity: "four", cost: () => "cheap" })
    expect(Grid2.result).type.not.toBeCallableWith({ ...common, connectivity: "four", walkable: () => 1 })
  })

  it("preserves field failures and each distinct lookup result", () => {
    const grid = Grid2.result({ columns: 4, rows: 4, connectivity: "four", maxCells: 16, walkable: () => true, cost: () => 1 })
    if (!grid.ok) return
    const config = { goals: [{ column: 3, row: 3 }], maxVisited: 16 }
    const field = GridDistanceField.build(grid.value, config)
    expect(field).type.toBe<Result.Result<GridDistanceField.GridDistanceField, GridDistanceField.Error>>()
    expect(GridDistanceField.build).type.not.toBeCallableWith({ columns: 4, rows: 4, connectivity: "four" }, config)
    expect(GridDistanceField.build).type.not.toBeCallableWith(grid.value, { goals: [{ x: 0, y: 0 }], maxVisited: 16 })
    expect(GridDistanceField.build).type.not.toBeCallableWith(grid.value, { goals: [{ column: 0, row: 0 }] })
    if (!field.ok) return
    const cell = { column: 0, row: 0 }
    expect(GridDistanceField.nextCell(field.value, cell)).type.toBe<GridDistanceField.Step>()
    expect(GridDistanceField.distance(field.value, cell)).type.toBe<GridDistanceField.Distance>()
    expect(GridDistanceField.build({ ...grid.value }, config)).type.toBe<Result.Result<GridDistanceField.GridDistanceField, GridDistanceField.Error>>()
    expect(GridDistanceField.nextCell({ ...field.value }, cell)).type.toBe<GridDistanceField.Step>()
    const view: ReadonlyValue<GridDistanceField.GridDistanceField> = field.value
    expect(GridDistanceField.distance(view, cell)).type.toBe<GridDistanceField.Distance>()
    expect(GridDistanceField.nextCell).type.not.toBeCallableWith({ grid: grid.value, visited: 1 }, cell)
    expect(GridDistanceField.distance).type.not.toBeCallableWith(field.value, { column: "0", row: 0 })
    const step = GridDistanceField.nextCell(field.value, cell)
    if (step.kind === "next") {
      expect(step.cell).type.toBe<Grid2.Cell>()
      expect(step.distance).type.toBe<number>()
      expect(step.cost).type.toBe<number>()
    }
    // @ts-expect-error Cannot assign to 'visited' because it is a read-only property.
    field.value.visited = 2
  })
})

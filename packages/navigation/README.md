# @typeonce/bevy-ts-navigation

Build one shortest-path field for many bodies moving toward the same goals.
The package provides immutable grid snapshots and multi-goal Dijkstra search.
It works headlessly and owns no ECS components or movement systems.

```ts
import { Grid2, GridDistanceField } from "@typeonce/bevy-ts-navigation"

const grid = Grid2.result({
  columns: 60,
  rows: 60,
  connectivity: "eight",
  maxCells: 3_600,
  walkable: ({ column, row }) => !walls.has(`${column},${row}`),
  cost: (from, to) =>
    from.column !== to.column && from.row !== to.row ? Math.SQRT2 : 1,
})
if (!grid.ok) return

const field = GridDistanceField.build(grid.value, {
  goals: [{ column: 30, row: 30 }],
  maxVisited: 3_600,
})
if (!field.ok) return

const step = GridDistanceField.nextCell(field.value, { column: 12, row: 7 })
if (step.kind === "next") {
  // Convert step.cell to a world-space target and steer using the game's rules.
}
```

Columns and rows must be positive safe integers. `maxCells` is a caller-owned
allocation limit, at most `Grid2.maximumCells`, which is 1,000,000. Construction
checks dimensions before allocating or invoking callbacks. A grid stores at
most eight directed edges per cell. Four-neighbor movement uses cardinal
steps; eight-neighbor movement also uses diagonals. Diagonals never cross a
blocked corner.

`cost(from, to)` returns the full directed step cost, including any diagonal
factor or terrain weight. Finite nonnegative values, including zero, are
accepted. Return `null` for a forbidden step, such as a one-way passage.
Walkability and costs are evaluated once during construction and copied into
private storage. User callback exceptions propagate. Invalid returned values
produce a `Result` failure.

Search runs backward from the goals using predecessor-to-current costs.
Asymmetric costs and one-way edges therefore describe movement toward a goal.
Multiple goals select the cheapest reachable one. Goal order does not change
ties. Equal distances settle in row-major cell order; equal-cost paths keep
the first settled successor. Zero-cost paths still reach a goal without
cycles.

`maxVisited` bounds the number of settled cells. Zero is valid and produces
`GridDistanceField/BudgetExceeded` before the first visit. Search returns a
complete field or an explicit failure, never a partial field with unknown
cells mislabeled as unreachable. Invalid, outside, or blocked goals and
nonfinite accumulated distances also return failures. The budget limits the
search, not construction or allocation. The heap stores at most one entry per
cell.

`nextCell` distinguishes `next`, `arrived`, `unreachable`, `blocked`, and
`outside`. Its `distance` is the full cost from the queried cell; `cost` is
the first step's cost. `distance` reports a reachable cost or the same map
constraints. `Grid2.cellState` reads `open`, `blocked`, or `outside` directly.

Rebuild the grid when walkability or costs change and build a new field when
goals change. Old fields remain valid for their original snapshots. Spreading
metadata retains the original private snapshot token. Editing the copy's
metadata does not change the snapshot used by queries or search. World
bounds, agent clearance, hazard immunity, fallback steering, collision
response, and gameplay priorities belong to the game.

Grid and field objects carry opaque in-memory snapshot tokens. Copied metadata does not change their underlying snapshot. Persist the source map and goals, then rebuild after loading; these tokens are not a JSON serialization format.

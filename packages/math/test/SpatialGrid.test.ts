import { describe, expect, it } from "vitest"

import { Random, Scalar, SpatialGrid } from "@typeonce/bevy-ts-math"

const cellSize = (value: number): Scalar.Positive => {
  const size = Scalar.Positive.result(value)
  if (!size.ok) throw new Error("test cell size")
  return size.value
}

describe("SpatialGrid", () => {
  it("visits every circle overlapping the query box exactly once, matching brute force", () => {
    const random = Random.make(11)
    const grid = SpatialGrid.make(cellSize(32))
    for (let round = 0; round < 20; round++) {
      // Rebuilt each round, as each step does.
      grid.clear()
      const circles = Array.from({ length: 300 }, () => ({ x: random.range(-500, 500), y: random.range(-500, 500), r: random.range(1, 60) }))
      circles.forEach((circle, index) => grid.insert(index, circle.x, circle.y, circle.r))
      for (let query = 0; query < 50; query++) {
        const x = random.range(-600, 600)
        const y = random.range(-600, 600)
        const half = random.range(0, 150)
        const visited: Array<number> = []
        grid.forEachIn(x - half, y - half, x + half, y + half, (index) => visited.push(index))
        expect(new Set(visited).size).toBe(visited.length)
        const overlapping = circles.flatMap((circle, index) =>
          circle.x + circle.r >= x - half && circle.x - circle.r <= x + half && circle.y + circle.r >= y - half && circle.y - circle.r <= y + half ? [index] : [])
        for (const index of overlapping) expect(visited).toContain(index)
      }
    }
  })

  it("forgets circles on clear", () => {
    const grid = SpatialGrid.make(cellSize(10))
    grid.insert(0, 5, 5, 1)
    grid.clear()
    grid.insert(1, 50, 50, 1)
    const visited: Array<number> = []
    grid.forEachIn(-100, -100, 100, 100, (index) => visited.push(index))
    expect(visited).toEqual([1])
  })
})

import { describe, expect, it } from "vitest"
import * as Aabb from "@typeonce/bevy-ts-math/Aabb"
import * as Scalar from "@typeonce/bevy-ts-math/Scalar"
import * as SpatialHash2 from "@typeonce/bevy-ts-spatial/SpatialHash2"

const box = (x: number, y: number, width = 0, height = width): Aabb.Aabb => {
  const made = Aabb.result({ position: { x, y }, size: { width, height } })
  if (!made.ok) throw new Error("Invalid test box")
  return made.value
}
const positive = (value: number): Scalar.Positive => {
  const made = Scalar.Positive.result(value)
  if (!made.ok) throw new Error("Invalid test cell size")
  return made.value
}
type Item = { readonly id: number; readonly bounds: Aabb.Aabb }
const make = (items: readonly Item[], limits?: SpatialHash2.Limits, cellSize = 10): SpatialHash2.Index<Item, number> => {
  const made = SpatialHash2.from(items, {
    cellSize: positive(cellSize),
    key: item => item.id,
    bounds: item => item.bounds,
    ...(limits === undefined ? {} : { limits })
  })
  if (!made.ok) throw new Error(`Invalid test index: ${made.error.tag}`)
  return made.value
}
const candidates = (index: SpatialHash2.Index<Item, number>, bounds: Aabb.Aabb): number[] => {
  const keys: number[] = []
  const found = index.forEachCandidate(bounds, key => keys.push(key))
  if (!found.ok) throw new Error(`Invalid test query: ${found.error.tag}`)
  return keys
}

describe("SpatialHash2", () => {
  it("seals metadata and keeps destructured methods attached to the index", () => {
    const index = make([{ id: 1, bounds: box(0, 0) }])
    expect(Object.isFrozen(index)).toBe(true)
    expect(Reflect.set(index, "cellSize", positive(1))).toBe(false)
    const { rebuild, clear, size, forEachCandidate } = index
    const found: number[] = []
    expect(forEachCandidate(box(0, 0), id => found.push(id)).ok).toBe(true)
    expect(found).toEqual([1])
    expect(rebuild([{ id: 2, bounds: box(0, 0) }]).ok).toBe(true)
    expect(size()).toBe(1)
    clear()
    expect(size()).toBe(0)
  })

  it("deduplicates overlapping cells and visits in input order", () => {
    const index = make([
      { id: 2 ** 45, bounds: box(8, 8, 25) },
      { id: -700, bounds: box(-4, -4, 20) },
      { id: 0, bounds: box(0, 0, 30) }
    ])
    expect(candidates(index, box(0, 0, 30))).toEqual([2 ** 45, -700, 0])
    expect(index.size()).toBe(3)
    expect(index.cellSize).toBe(10)
  })

  it("includes touching edges and zero-size boxes", () => {
    const index = make([{ id: 1, bounds: box(5, 5, 10) }, { id: 2, bounds: box(10, 10) }])
    expect(candidates(index, box(10, 10))).toEqual([1, 2])
    expect(candidates(index, box(-0.1, -0.1))).toEqual([])
  })

  it("does not wrap distant cells into the same fixed-width key", () => {
    const index = make([
      { id: 1, bounds: box(0, 0) },
      { id: 2, bounds: box(65536, 0) },
      { id: 3, bounds: box(-65536, 0) },
      { id: 4, bounds: box(0, 65536) }
    ], undefined, 1)
    expect(candidates(index, box(0, 0))).toEqual([1])
    expect(candidates(index, box(65536, 0))).toEqual([2])
    expect(candidates(index, box(-65536, 0))).toEqual([3])
    expect(candidates(index, box(0, 65536))).toEqual([4])
  })

  it("preserves the old contents when duplicate keys prevent a rebuild", () => {
    const index = make([{ id: 9, bounds: box(0, 0) }])
    expect(index.rebuild([{ id: 1, bounds: box(50, 50) }, { id: 1, bounds: box(60, 60) }])).toEqual({ ok: false, error: { tag: "SpatialHash2/DuplicateKey", key: 1 } })
    expect(index.size()).toBe(1)
    expect(candidates(index, box(0, 0))).toEqual([9])
    expect(candidates(index, box(50, 50))).toEqual([])
  })

  it("preserves old buckets after a staged rebuild exceeds the cell limit", () => {
    const index = make([{ id: 9, bounds: box(0, 0) }], { maxCells: 2 })
    index.clear()
    expect(index.rebuild([{ id: 9, bounds: box(0, 0) }]).ok).toBe(true)
    expect(index.rebuild([
      { id: 1, bounds: box(10, 10) },
      { id: 2, bounds: box(20, 20) },
      { id: 3, bounds: box(30, 30) }
    ])).toEqual({ ok: false, error: { tag: "SpatialHash2/CellLimit", limit: 2 } })
    expect(candidates(index, box(0, 0))).toEqual([9])
    expect(index.rebuild([{ id: 4, bounds: box(10, 10) }]).ok).toBe(true)
    expect(candidates(index, box(10, 10))).toEqual([4])
    expect(candidates(index, box(0, 0))).toEqual([])
  })

  it("keeps query visits stable through nested queries, clear, and rebuild", () => {
    const index = make([{ id: 1, bounds: box(0, 0) }, { id: 2, bounds: box(0, 0) }])
    const visited: number[] = []
    const result = index.forEachCandidate(box(0, 0), id => {
      visited.push(id)
      if (id === 1) {
        expect(candidates(index, box(0, 0))).toEqual([1, 2])
        index.clear()
        expect(index.rebuild([{ id: 3, bounds: box(0, 0) }]).ok).toBe(true)
      }
    })
    expect(result).toEqual({ ok: true, value: undefined })
    expect(visited).toEqual([1, 2])
    expect(candidates(index, box(0, 0))).toEqual([3])
  })

  it("resets entries and can rebuild repeatedly while crossing new cells", () => {
    const index = make([])
    for (let step = 0; step < 500; step++) {
      expect(index.rebuild([{ id: step, bounds: box(step * 20, -step * 20) }]).ok).toBe(true)
      expect(candidates(index, box(step * 20, -step * 20))).toEqual([step])
      if (step > 0) expect(candidates(index, box((step - 1) * 20, -(step - 1) * 20))).toEqual([])
    }
    index.clear()
    expect(index.size()).toBe(0)
    expect(candidates(index, box(9980, -9980))).toEqual([])
  })

  it("bounds entries, coverage, and total memberships before publication", () => {
    const old = { id: 1, bounds: box(0, 0) }
    const entries = make([old], { maxEntries: 1 })
    expect(entries.rebuild([old, { id: 2, bounds: box(0, 0) }])).toEqual({ ok: false, error: { tag: "SpatialHash2/EntryLimit", limit: 1 } })
    const coverage = make([old], { maxCellsPerEntry: 2 })
    expect(coverage.rebuild([{ id: 2, bounds: box(15, 15, 10) }])).toEqual({ ok: false, error: { tag: "SpatialHash2/EntryCoverage", key: 2, limit: 2 } })
    const total = make([old], { maxMemberships: 2 })
    expect(total.rebuild([old, { id: 2, bounds: box(0, 0) }, { id: 3, bounds: box(0, 0) }])).toEqual({ ok: false, error: { tag: "SpatialHash2/MembershipLimit", limit: 2 } })
    for (const index of [entries, coverage, total]) expect(candidates(index, box(0, 0))).toEqual([1])
  })

  it("rejects unsafe cell coordinates and query coverage without visiting", () => {
    const index = make([{ id: 1, bounds: box(0, 0) }], { maxQueryCells: 1 }, 1)
    expect(index.rebuild([{ id: 2, bounds: box(1e20, 0) }])).toEqual({ ok: false, error: { tag: "SpatialHash2/EntryCoordinates", key: 2 } })
    let visits = 0
    expect(index.forEachCandidate(box(1e20, 0), () => visits++)).toEqual({ ok: false, error: { tag: "SpatialHash2/QueryCoordinates" } })
    expect(index.forEachCandidate(box(0, 0, 10), () => visits++)).toEqual({ ok: false, error: { tag: "SpatialHash2/QueryCoverage", limit: 1 } })
    expect(visits).toBe(0)
    expect(candidates(index, box(0, 0))).toEqual([1])
    const tiny = SpatialHash2.from([{ id: 1, bounds: box(1, 1) }], { cellSize: positive(Number.MIN_VALUE), key: item => item.id, bounds: item => item.bounds })
    expect(tiny).toEqual({ ok: false, error: { tag: "SpatialHash2/EntryCoordinates", key: 1 } })
  })

  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid limits: %s", value => {
    const made = SpatialHash2.from([], { cellSize: positive(10), key: () => "unused", bounds: () => box(0, 0), limits: { maxCells: value } })
    expect(made).toEqual({ ok: false, error: { tag: "SpatialHash2/InvalidLimit", name: "maxCells", value } })
  })

  it("supports bigint and symbol keys and uses Map key equality", () => {
    const symbol = Symbol("body")
    const made = SpatialHash2.from([{ id: 1n }, { id: symbol }], { cellSize: positive(10), key: item => item.id, bounds: () => box(0, 0) })
    if (!made.ok) throw new Error("Index failed")
    const found: SpatialHash2.Key[] = []
    made.value.forEachCandidate(box(0, 0), key => found.push(key))
    expect(found).toEqual([1n, symbol])
    const duplicate = SpatialHash2.from([{ id: 0 }, { id: -0 }], { cellSize: positive(10), key: item => item.id, bounds: () => box(0, 0) })
    expect(duplicate.ok).toBe(false)
  })

  it("captures adapters and does not expose partially prepared items when an adapter throws", () => {
    let fail = false
    const options = {
      cellSize: positive(10),
      key: (item: Item) => item.id,
      bounds: (item: Item) => {
        if (fail && item.id === 3) throw new Error("Application adapter failed")
        return item.bounds
      }
    }
    const made = SpatialHash2.from([{ id: 1, bounds: box(0, 0) }], options)
    if (!made.ok) throw new Error("Index failed")
    options.key = () => 99
    fail = true
    expect(() => made.value.rebuild([{ id: 2, bounds: box(0, 0) }, { id: 3, bounds: box(0, 0) }])).toThrow("Application adapter failed")
    expect(candidates(made.value, box(0, 0))).toEqual([1])
    fail = false
    expect(made.value.rebuild([{ id: 2, bounds: box(0, 0) }]).ok).toBe(true)
    expect(candidates(made.value, box(0, 0))).toEqual([2])
  })

  it("matches cell-range enumeration and includes every brute-force intersection", () => {
    let seed = 12345
    const draw = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const cellSize = 17
    const items = Array.from({ length: 150 }, (_, id) => ({ id, bounds: box(draw() * 1000 - 500, draw() * 1000 - 500, draw() * 70, draw() * 70) }))
    const index = make(items, undefined, cellSize)
    for (let query = 0; query < 200; query++) {
      const bounds = box(draw() * 1000 - 500, draw() * 1000 - 500, draw() * 150, draw() * 150)
      const found = candidates(index, bounds)
      const sharing = items.filter(item =>
        Math.floor(Aabb.left(item.bounds) / cellSize) <= Math.floor(Aabb.right(bounds) / cellSize) &&
        Math.floor(Aabb.right(item.bounds) / cellSize) >= Math.floor(Aabb.left(bounds) / cellSize) &&
        Math.floor(Aabb.top(item.bounds) / cellSize) <= Math.floor(Aabb.bottom(bounds) / cellSize) &&
        Math.floor(Aabb.bottom(item.bounds) / cellSize) >= Math.floor(Aabb.top(bounds) / cellSize)
      ).map(item => item.id)
      expect(found).toEqual(sharing)
      for (const item of items) if (Aabb.intersects(item.bounds, bounds)) expect(found).toContain(item.id)
    }
  })
})

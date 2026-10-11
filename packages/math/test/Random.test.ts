import { describe, expect, it } from "vitest"

import { Random } from "@typeonce/bevy-ts-math"

describe("Random", () => {
  it("draws the mulberry32 sequence, continuing exactly from a stored state", () => {
    const random = Random.make(42)
    expect([random.next(), random.next(), random.next()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099])
    const resumed = Random.make(random.state)
    expect(resumed.next()).toBe(random.next())
    expect(Random.make(-1).state).toBe(0xffffffff)
  })

  it("stays in range", () => {
    const random = Random.make(1)
    for (let draw = 0; draw < 10_000; draw++) {
      const unit = random.next()
      expect(unit >= 0 && unit < 1).toBe(true)
      const value = random.range(-3, 5)
      expect(value >= -3 && value < 5).toBe(true)
      const integer = random.integer(-2, 3)
      expect(Number.isInteger(integer) && integer >= -2 && integer < 3).toBe(true)
    }
  })

  it("picks every element, and nothing from an empty list without drawing", () => {
    const random = Random.make(3)
    const seen = new Set<string>()
    for (let draw = 0; draw < 200; draw++) seen.add(random.pick(["a", "b", "c"])!)
    expect([...seen].sort()).toEqual(["a", "b", "c"])
    const state = random.state
    expect(random.pick([])).toBeUndefined()
    expect(random.state).toBe(state)
  })

  it("shuffles into a permutation, leaving the input alone", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = Random.make(9).shuffle(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items)
    expect(shuffled).not.toEqual(items)
  })

  it("chooses by weight, never an unusable weight", () => {
    const random = Random.make(5)
    const items = [{ id: "rare", weight: 1 }, { id: "never", weight: 0 }, { id: "bad", weight: Number.NaN }, { id: "common", weight: 3 }]
    const counts = new Map<string, number>()
    for (let draw = 0; draw < 40_000; draw++) {
      const chosen = random.weighted(items, (item) => item.weight)!
      counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + 1)
    }
    expect(counts.get("never")).toBeUndefined()
    expect(counts.get("bad")).toBeUndefined()
    expect(counts.get("common")! / 40_000).toBeCloseTo(0.75, 1)
    const state = random.state
    expect(random.weighted(items, () => 0)).toBeUndefined()
    expect(random.weighted([], () => 1)).toBeUndefined()
    expect(random.state).toBe(state)
  })
})

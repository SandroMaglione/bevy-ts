import { describe, expect, it } from "vitest"
import * as Random from "@typeonce/bevy-ts-math/Random"
import * as Weighted from "@typeonce/bevy-ts-math/Weighted"
import * as Scalar from "@typeonce/bevy-ts-math/Scalar"

const state = (seed = 42): Random.State => {
  const made = Random.result(seed)
  if (!made.ok) throw new Error("Invalid test seed")
  return made.value
}
const finite = (value: number): Scalar.Finite => {
  const made = Scalar.Finite.result(value)
  if (!made.ok) throw new Error("Invalid test number")
  return made.value
}
const fraction = (value: number): Scalar.Fraction => {
  const made = Scalar.Fraction.result(value)
  if (!made.ok) throw new Error("Invalid test fraction")
  return made.value
}
const table = <A>(entries: readonly Weighted.Entry<A>[]): Weighted.Table<A> => {
  const made = Weighted.result(entries)
  if (!made.ok) throw new Error(`Invalid test weights: ${made.error.tag}`)
  return made.value
}

describe("Random", () => {
  it("validates unsigned 32-bit seeds and freezes saved state", () => {
    for (const seed of [0, 1, 4294967295]) {
      const made = Random.result(seed)
      expect(made).toEqual({ ok: true, value: { algorithm: "mulberry32-v1", seed } })
      if (made.ok) expect(Object.isFrozen(made.value)).toBe(true)
    }
    for (const seed of [-1, 4294967296, 1.5, NaN, Infinity, -Infinity]) {
      expect(Random.result(seed)).toEqual({ ok: false, error: { tag: "Random/InvalidSeed", seed } })
    }
  })

  it("decodes a serialized counter without restarting its sequence", () => {
    const saved = Random.next(state()).state
    const raw = JSON.parse(JSON.stringify(saved))
    const restored = Random.decode(raw)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.value).not.toBe(raw)
    expect(Random.next(restored.value)).toEqual(Random.next(saved))
    for (const invalid of [null, 42, {}, { seed: 1 }, { algorithm: "mulberry32-v2", seed: 1 }, { algorithm: "mulberry32-v1", seed: "1" }]) {
      expect(Random.decode(invalid)).toEqual({ ok: false, error: { tag: "Random/Malformed", input: invalid } })
    }
    expect(Random.decode({ algorithm: "mulberry32-v1", seed: -1 })).toEqual({ ok: false, error: { tag: "Random/InvalidSeed", seed: -1 } })
  })

  // Reference values captured from the shooter's original mulberry32 Random,
  // before replacing it with this package. These lock replay compatibility.
  it.each([
    { seed: 0, end: 567894473, values: [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111, 0.46732782293111086] },
    { seed: 1, end: 567894474, values: [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849] },
    { seed: 42, end: 567894515, values: [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423] },
    { seed: 4294967295, end: 567894472, values: [0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677, 0.8452364315744489] }
  ])("matches the shooter reference sequence for seed $seed", reference => {
    let cursor = state(reference.seed)
    for (const expected of reference.values) {
      const draw = Random.next(cursor)
      expect(draw.value).toBe(expected)
      cursor = draw.state
    }
    expect(cursor.seed).toBe(reference.end)
  })

  it("draws only finite unit fractions and unsigned counters", () => {
    let cursor = state(0xffffffff)
    for (let sample = 0; sample < 1_000; sample++) {
      const draw = Random.next(cursor)
      expect(draw.value).toBeGreaterThanOrEqual(0)
      expect(draw.value).toBeLessThan(1)
      expect(Number.isInteger(draw.state.seed)).toBe(true)
      expect(draw.state.seed).toBeGreaterThanOrEqual(0)
      expect(draw.state.seed).toBeLessThan(4294967296)
      cursor = draw.state
    }
  })

  it("invalid choices and ranges consume no state", () => {
    const original = state()
    const expected = Random.next(original)
    expect(Random.pick(original, [])).toEqual({ ok: false, error: { tag: "Random/EmptyCollection" } })
    expect(Random.range(original, { min: finite(5), max: finite(4) })).toEqual({ ok: false, error: { tag: "Random/InvalidRange", min: 5, max: 4 } })
    expect(Random.integer(original, { min: 3, maxExclusive: 3 })).toEqual({ ok: false, error: { tag: "Random/InvalidIntegerRange", min: 3, maxExclusive: 3 } })
    expect(original.seed).toBe(42)
    expect(Random.next(original)).toEqual(expected)
  })

  it("rejects unsuitable integer bounds and spans", () => {
    const invalid = [
      { min: 1.5, maxExclusive: 3 },
      { min: 0, maxExclusive: 1.5 },
      { min: 0, maxExclusive: Infinity },
      { min: NaN, maxExclusive: 1 },
      { min: 4, maxExclusive: 3 },
      { min: 0, maxExclusive: 4294967297 },
      { min: Number.MIN_SAFE_INTEGER, maxExclusive: Number.MAX_SAFE_INTEGER }
    ]
    for (const bounds of invalid) expect(Random.integer(state(), bounds)).toEqual({ ok: false, error: { tag: "Random/InvalidIntegerRange", ...bounds } })
  })

  it("uses rejection sampling and reports every consumed counter", () => {
    // First raw draw 2581720956 is outside the acceptance interval; the
    // second is 1925393290. A modulo-only implementation fails this case.
    expect(Random.integer(state(), { min: 0, maxExclusive: 2147483649 })).toEqual({
      ok: true,
      value: { value: 1925393290, state: { algorithm: "mulberry32-v1", seed: 3663131668 } }
    })
    expect(Random.integer(state(), { min: 0, maxExclusive: 4294967296 })).toEqual({
      ok: true,
      value: { value: 2581720956, state: { algorithm: "mulberry32-v1", seed: 1831565855 } }
    })
  })

  it("supports safe integer offsets and singleton intervals", () => {
    const original = state()
    for (const bounds of [
      { min: -10, maxExclusive: -3 },
      { min: Number.MIN_SAFE_INTEGER, maxExclusive: Number.MIN_SAFE_INTEGER + 7 },
      { min: Number.MAX_SAFE_INTEGER - 4294967296, maxExclusive: Number.MAX_SAFE_INTEGER }
    ]) {
      const draw = Random.integer(original, bounds)
      expect(draw.ok).toBe(true)
      if (!draw.ok) continue
      expect(Number.isSafeInteger(draw.value.value)).toBe(true)
      expect(draw.value.value).toBeGreaterThanOrEqual(bounds.min)
      expect(draw.value.value).toBeLessThan(bounds.maxExclusive)
    }
    const singleton = Random.integer(original, { min: 12, maxExclusive: 13 })
    expect(singleton.ok).toBe(true)
    if (singleton.ok) {
      expect(singleton.value.value).toBe(12)
      expect(singleton.value.state).toEqual(Random.next(original).state)
    }
  })

  it("keeps extreme floating ranges finite and within their closed bounds", () => {
    const original = state()
    for (const [min, max] of [
      [-Number.MAX_VALUE, Number.MAX_VALUE],
      [Number.MAX_VALUE / 2, Number.MAX_VALUE],
      [-Number.MAX_VALUE, -Number.MAX_VALUE / 2],
      [Number.MIN_VALUE, Number.MIN_VALUE],
      [-Number.MIN_VALUE, Number.MIN_VALUE],
      [5, 5]
    ]) {
      const sampled = Random.range(original, { min: finite(min!), max: finite(max!) })
      expect(sampled.ok).toBe(true)
      if (!sampled.ok) continue
      expect(Number.isFinite(sampled.value.value)).toBe(true)
      expect(sampled.value.value).toBeGreaterThanOrEqual(min!)
      expect(sampled.value.value).toBeLessThanOrEqual(max!)
      expect(sampled.value.state).toEqual(Random.next(original).state)
    }
  })

  it("keeps float-based picking compatible and leaves the input unchanged", () => {
    const items = Object.freeze(["a", "b", "c", "d", "e"])
    const picked = Random.pick(state(), items)
    expect(picked).toEqual({ ok: true, value: { value: "d", state: { algorithm: "mulberry32-v1", seed: 1831565855 } } })
    expect(items).toEqual(["a", "b", "c", "d", "e"])
  })

  it("shuffles a fresh permutation deterministically with unbiased integer draws", () => {
    const original = state()
    const items = Object.freeze(["a", "b", "c", "d", "e"])
    const shuffled = Random.shuffle(original, items)
    expect(shuffled).toEqual({ value: ["d", "e", "a", "c", "b"], state: { algorithm: "mulberry32-v1", seed: 3031295998 } })
    expect(Random.shuffle(original, items)).toEqual(shuffled)
    expect(shuffled.value).not.toBe(items)
    expect([...shuffled.value].sort()).toEqual([...items].sort())
    expect(items).toEqual(["a", "b", "c", "d", "e"])
    expect(Random.shuffle(original, []).state).toBe(original)
    expect(Random.shuffle(original, ["only"]).state).toBe(original)
  })

  it("weighted choices consume one draw and never select zero weights", () => {
    const choices = table([{ value: "zero", weight: 0 }, { value: "a", weight: 1 }, { value: "b", weight: 3 }, { value: "zero", weight: 0 }])
    const sampled = Random.weighted(state(), choices)
    expect(sampled.value).toBe("b")
    expect(sampled.state).toEqual(Random.next(state()).state)
  })
})

describe("Weighted", () => {
  it("preserves authored data through safe spreads and retains generic value references", () => {
    const value = { name: "wolf" }
    const choices = table([{ value, weight: 1 }])
    const copy = { ...choices, size: 99 }
    expect(Weighted.sample(copy, fraction(0.5))).toBe(value)
    expect(Random.weighted(state(), copy).value).toBe(value)
    value.name = "bat"
    expect(Weighted.sample(choices, fraction(0)).name).toBe("bat")
  })

  it("rejects empty, invalid, zero-total, and overflowing tables", () => {
    expect(Weighted.result([])).toEqual({ ok: false, error: { tag: "Weighted/Empty" } })
    expect(Weighted.result([{ value: "a", weight: 0 }, { value: "b", weight: 0 }])).toEqual({ ok: false, error: { tag: "Weighted/ZeroTotal" } })
    for (const weight of [-1, NaN, Infinity, -Infinity]) expect(Weighted.result([{ value: "a", weight: 1 }, { value: "b", weight }])).toEqual({ ok: false, error: { tag: "Weighted/InvalidWeight", index: 1, weight } })
    expect(Weighted.result([{ value: "a", weight: Number.MAX_VALUE }, { value: "b", weight: Number.MAX_VALUE }])).toEqual({ ok: false, error: { tag: "Weighted/Overflow" } })
  })

  it("samples ordered boundaries, including closed endpoints, and snapshots weights", () => {
    const entries = [{ value: "zero", weight: 0 }, { value: "a", weight: 1 }, { value: "b", weight: 3 }, { value: "zero", weight: 0 }]
    const choices = table(entries)
    expect(choices.size).toBe(4)
    expect(Object.isFrozen(choices)).toBe(true)
    entries[1]!.weight = 1000
    entries[2]!.value = "changed"
    for (const [amount, expected] of [[0, "a"], [0.249, "a"], [0.25, "b"], [0.75, "b"], [1, "b"]] as const) expect(Weighted.sample(choices, fraction(amount))).toBe(expected)
  })

  it("keeps equal subnormal and large weights evenly partitioned", () => {
    for (const weight of [Number.MIN_VALUE, Number.MAX_VALUE / 4]) {
      const choices = table([{ value: "a", weight }, { value: "b", weight }])
      expect(Weighted.sample(choices, fraction(0.3))).toBe("a")
      expect(Weighted.sample(choices, fraction(0.5))).toBe("b")
      expect(Weighted.sample(choices, fraction(0.7))).toBe("b")
    }
  })

  it("preserves closed endpoints when cumulative fractions underflow or weights round away", () => {
    const tinyFirst = table([{ value: "tiny", weight: Number.MIN_VALUE }, { value: "large", weight: Number.MAX_VALUE }])
    expect(Weighted.sample(tinyFirst, fraction(0))).toBe("tiny")
    expect(Weighted.sample(tinyFirst, fraction(Number.MIN_VALUE))).toBe("large")
    const tinyLast = table([{ value: "large", weight: Number.MAX_VALUE }, { value: "tiny", weight: Number.MIN_VALUE }])
    expect(Weighted.sample(tinyLast, fraction(1 - Number.EPSILON))).toBe("large")
    expect(Weighted.sample(tinyLast, fraction(1))).toBe("tiny")
  })
})

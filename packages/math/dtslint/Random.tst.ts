import { describe, expect, it } from "tstyche"
import type * as Result from "@typeonce/bevy-ts/Result"
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import * as Random from "@typeonce/bevy-ts-math/Random"
import * as Scalar from "@typeonce/bevy-ts-math/Scalar"
import * as Weighted from "@typeonce/bevy-ts-math/Weighted"

describe("Random", () => {
  it("constructs and restores explicit state and preserves refinement on draws", () => {
    const made = Random.result(42)
    expect(made).type.toBe<Result.Result<Random.State, Random.SeedError>>()
    expect(Random.decode({ algorithm: "mulberry32-v1", seed: 42 })).type.toBe<Result.Result<Random.State, Random.SeedError | Random.DecodeError>>()
    // @ts-expect-error Argument of type 'string' is not assignable to parameter of type 'number'.
    Random.result("42")
    if (!made.ok) return
    const draw = Random.next(made.value)
    expect(draw).type.toBe<Random.Draw<Random.UnitInterval>>()
    expect(draw.value).type.toBeAssignableTo<Scalar.Fraction>()
    expect(draw.state).type.toBe<Random.State>()
    // @ts-expect-error Property '__publicBrand' is missing
    Random.next({ algorithm: "mulberry32-v1", seed: 42 })
    // @ts-expect-error Cannot assign to 'seed' because it is a read-only property.
    draw.state.seed = 5
    const closed = Scalar.Fraction.result(1)
    if (closed.ok) expect(closed.value).type.not.toBeAssignableTo<Random.UnitInterval>()
  })

  it("integer and floating draws keep explicit failures and require the right bounds", () => {
    const made = Random.result(42)
    const low = Scalar.Finite.result(-10)
    const high = Scalar.Finite.result(10)
    if (!made.ok || !low.ok || !high.ok) return
    expect(Random.integer(made.value, { min: 0, maxExclusive: 10 })).type.toBe<Result.Result<Random.Draw<number>, Random.IntegerRangeError>>()
    expect(Random.range(made.value, { min: low.value, max: high.value })).type.toBe<Result.Result<Random.Draw<Scalar.Finite>, Random.RangeError>>()
    // @ts-expect-error Property 'maxExclusive' is missing
    Random.integer(made.value, { min: 0 })
    // @ts-expect-error Type 'string' is not assignable to type 'number'.
    Random.integer(made.value, { min: 0, maxExclusive: "10" })
    // @ts-expect-error Type 'number' is not assignable to type 'Finite'.
    Random.range(made.value, { min: 0, max: high.value })
  })

  it("infers choices and shuffled arrays without explicit generic arguments", () => {
    const made = Random.result(42)
    if (!made.ok) return
    const choices = [{ id: "wolf", hp: 12 }, { id: "bat", hp: 6 }]
    expect(Random.pick(made.value, choices)).type.toBe<Result.Result<Random.Draw<{ id: string; hp: number }>, Random.EmptyCollection>>()
    const names = ["wolf", "bat"] as const
    expect(Random.shuffle(made.value, names)).type.toBe<Random.Draw<readonly ("wolf" | "bat")[]>>()
    expect(Random.pick).type.not.toBeCallableWith(made.value, new Set(["wolf"]))
    expect(Random.shuffle).type.not.toBeCallableWith(made.value, new Set(["wolf"]))
    // @ts-expect-error Property '__publicBrand' is missing
    Random.pick({ algorithm: "mulberry32-v1", seed: 42 }, choices)
    // @ts-expect-error Property '__publicBrand' is missing
    Random.shuffle({ algorithm: "mulberry32-v1", seed: 42 }, choices)
  })
})

describe("Weighted", () => {
  it("infers dynamic table values and samples only validated fractions", () => {
    const items = [{ value: { id: "wolf", hp: 12 }, weight: 4 }, { value: { id: "bat", hp: 6 }, weight: 1 }]
    const choices = Weighted.result(items)
    expect(choices).type.toBe<Result.Result<Weighted.Table<{ id: string; hp: number }>, Weighted.Error>>()
    const fraction = Scalar.Fraction.result(0.5)
    const made = Random.result(42)
    if (!choices.ok || !fraction.ok || !made.ok) return
    expect(choices.value.size).type.toBe<number>()
    expect(Weighted.sample(choices.value, fraction.value)).type.toBe<{ id: string; hp: number }>()
    expect(Random.weighted(made.value, choices.value)).type.toBe<Random.Draw<{ id: string; hp: number }>>()
    expect(Weighted.sample(choices.value, Random.next(made.value).value)).type.toBe<{ id: string; hp: number }>()
    // @ts-expect-error Argument of type 'number' is not assignable to parameter of type 'Fraction'.
    Weighted.sample(choices.value, 0.5)
    expect(Weighted.sample({ ...choices.value }, fraction.value)).type.toBe<{ id: string; hp: number }>()
    expect(Random.weighted(made.value, { ...choices.value })).type.toBe<Random.Draw<{ id: string; hp: number }>>()
    expect(Weighted.sample).type.not.toBeCallableWith({ size: 2 }, fraction.value)
    // @ts-expect-error Property '__publicBrand' is missing
    Random.weighted({ algorithm: "mulberry32-v1", seed: 42 }, choices.value)
    // @ts-expect-error Cannot assign to 'size' because it is a read-only property.
    choices.value.size = 2
  })

  it("infers literal unions and rejects malformed authored entries", () => {
    const choices = Weighted.result([{ value: "wolf", weight: 1 }, { value: "bat", weight: 2 }] as const)
    expect(choices).type.toBe<Result.Result<Weighted.Table<"wolf" | "bat">, Weighted.Error>>()
    // @ts-expect-error Type 'string' is not assignable to type 'number'.
    Weighted.result([{ value: "wolf", weight: "1" }])
    // @ts-expect-error Property 'weight' is missing
    Weighted.result([{ value: "wolf" }])
  })

  it("samples tables read through an ECS resource without casts", () => {
    const Choices = Descriptor.Resource<Weighted.Table<{ id: string }>>() ("Random/Choices")
    const Game = Schema.bind(Schema.fragment({ resources: { Choices } }))
    const fraction = Scalar.Fraction.result(0.5)
    const seed = Random.result(42)
    if (!fraction.ok || !seed.ok) return
    Game.System("Random/ReadChoices", { resources: { choices: Game.System.readResource(Choices) } }, ({ resources }) => {
      const table = resources.choices.get()
      expect(Weighted.sample(table, fraction.value)).type.toBe<{ readonly id: string }>()
      expect(Random.weighted(seed.value, table)).type.toBe<Random.Draw<{ readonly id: string }>>()
      // @ts-expect-error Cannot assign to 'id' because it is a read-only property.
      Weighted.sample(table, fraction.value).id = "bat"
    })
  })
})

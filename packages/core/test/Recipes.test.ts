import { describe, expect, it } from "vitest"
import { runRecipes } from "../../../examples/recipes.ts"

describe("GAME_API.md recipes", () => {
  it("replays simulation time and random state from a snapshot", () => {
    const { after, replay } = runRecipes()
    expect(after).toEqual(replay)
    expect(after.resources).toEqual({ "Recipes/Time": { step: 1, elapsed: 1 / 60, dt: 1 / 60 }, "Recipes/Random": 1083814273 })
  })
})

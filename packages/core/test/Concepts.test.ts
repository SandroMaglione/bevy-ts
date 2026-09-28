import { describe, expect, it } from "vitest"

import { runConcepts } from "../../../examples/concepts.ts"

describe("CONCEPTS.md program", () => {
  it("runs as the guide describes", () => {
    expect(runConcepts(4)).toEqual({
      log: ["Playing: 2 moved", "Playing: 1 moved", "Won: 1 moved", "Won: 1 moved"],
      failure: undefined
    })
  })
})

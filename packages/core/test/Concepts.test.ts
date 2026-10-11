import { describe, expect, it } from "vitest"

import { runConcepts, runLookups } from "../../../examples/concepts.ts"

describe("CONCEPTS.md program", () => {
  it("shares query access and reads entities and machine state explicitly", () => {
    expect(runLookups()).toEqual({ found: true, only: true, position: [{ x: 0, y: 0 }], flow: "Playing" })
  })
  it("runs as the guide describes", () => {
    expect(runConcepts(4)).toEqual({
      log: ["Playing: 2 moved", "Playing: 1 moved", "Won: 1 moved", "Won: 1 moved"],
      failure: undefined
    })
  })
})

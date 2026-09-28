import { Keyboard } from "@bevy-ts/browser"
import { describe, expect, it } from "vitest"

import { createTopDownSimulation } from "../simulation.ts"
import { PlayerCameraQuery } from "../queries.ts"
import { Game } from "../schema.ts"
import { inputBindings } from "../types.ts"

const start = (timeline: Keyboard.Timeline<typeof inputBindings>) => {
  const simulation = createTopDownSimulation({ keyboard: Keyboard.scripted(inputBindings, timeline) })
  if (!simulation.ok) throw new Error(simulation.error.message)
  const { runtime, setup, update } = simulation.value
  expect(runtime.tick(setup).ok).toBe(true)
  return { runtime, update }
}

const PlayerPosition = Game.Inspector("Test/PlayerPosition", { queries: { player: PlayerCameraQuery } }, ({ queries }) =>
  queries.player.each().map((match) => match.data.position.get()))

describe("top-down simulation", () => {
  it("runs headless and moves the player with scripted input", () => {
    const { runtime, update } = start([{ frame: 0, press: ["right"] }, { frame: 30, release: ["right"] }])
    for (let frame = 0; frame < 60; frame++) expect(runtime.tick(update).ok).toBe(true)
    const [position] = runtime.inspect(PlayerPosition)
    expect(position?.x).toBeCloseTo(640 + 280 * 30 / 60)
    expect(position?.y).toBe(260)
    expect(runtime.debug.dump().machines).toEqual({
      "TopDown/Facing": { current: "Right", previous: "Down" },
      "TopDown/Locomotion": { current: "Idle", previous: "Walking" }
    })
  })

  it("describes the simulation schedules without lint warnings", () => {
    const { runtime } = start([])
    const description = runtime.debug.describe()
    expect(description.schedules.map((schedule) => schedule.name)).toEqual(["setup", "update"])
    expect(description.lints.filter((lint) => lint.severity === "warning")).toEqual([])
  })
})

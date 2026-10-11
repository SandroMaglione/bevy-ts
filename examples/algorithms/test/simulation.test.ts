import { describe, expect, it } from "vitest"

import { Box2 } from "@typeonce/bevy-ts-math"
import { makeSimulation, ReadWorld, room } from "../simulation.ts"

const run = (seed: number, steps: number) => {
  const simulation = makeSimulation(seed)
  const frames = []
  for (let step = 0; step < steps; step++) {
    simulation.step(1 / 60)
    frames.push(simulation.runtime.inspect(ReadWorld))
  }
  return { simulation, frames }
}

describe("algorithms example", () => {
  it("replays exactly from the same seed, and differs for another", () => {
    expect(run(1337, 120).frames).toEqual(run(1337, 120).frames)
    expect(run(1338, 1).frames[0]!.chasers).not.toEqual(run(1337, 1).frames[0]!.chasers)
  })

  it("brings every chaser around the middle wall to the player, never through a wall", () => {
    const { frames } = run(1337, 60 * 12)
    for (const frame of frames) {
      for (const at of frame.chasers) expect(room.some((wall) => Box2.overlapsCircle(wall, at, 10 - 0.05))).toBe(false)
    }
    const last = frames[frames.length - 1]!
    for (const at of last.chasers) expect(Math.hypot(at.x - last.player.x, at.y - last.player.y)).toBeLessThan(80)
  })

  it("stops a fast shot at the first thing on its path", () => {
    const simulation = makeSimulation(1337)
    // 4000 units per second: 67 per step, far more than a wall is thick.
    // Above the chasers into the middle wall, and below them through the opening into the far wall.
    simulation.fire({ x: 20, y: 10 }, { x: 4000, y: 0 })
    simulation.fire({ x: 20, y: 380 }, { x: 4000, y: 0 })
    // At a chaser, from straight above it.
    const target = simulation.runtime.inspect(ReadWorld).chasers[0]!
    simulation.fire({ x: target.x, y: 10 }, { x: 0, y: 4000 })
    for (let step = 0; step < 30; step++) simulation.step(1 / 60)
    const hits = simulation.runtime.inspect(ReadWorld).hits
    expect(hits.map((hit) => hit.kind).sort()).toEqual(["chaser", "wall", "wall"])
    expect(hits.every((hit) => hit.time >= 0 && hit.time <= 1)).toBe(true)
  })
})

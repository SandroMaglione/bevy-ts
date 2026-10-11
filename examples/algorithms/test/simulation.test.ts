import { describe, expect, it } from "vitest"
import { makeSimulation, step } from "../simulation.ts"
import type { Simulation } from "../simulation.ts"

const make = (seed = 1337): Simulation => {
  const made = makeSimulation({ seed })
  if (!made.ok) throw new Error(made.error.message)
  return made.value
}

const advance = (simulation: Simulation, dt = 0.1, pursue = true) => {
  const result = step(simulation, { dt, pursue })
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

describe("headless algorithms example", () => {
  it("replays seeded spawns, movement, indices, and exact contact results", () => {
    const first = make()
    const second = make()
    expect(first.snapshot()).toEqual(second.snapshot())
    for (let frame = 0; frame < 160; frame++) expect(advance(first)).toEqual(advance(second))
    expect(first.snapshot().actors.filter((actor) => actor.role === "pursuer").every((actor) => actor.arrived)).toBe(true)
    expect(first.snapshot().crowdNeighbors).toBeGreaterThan(0)
    expect(make(1338).snapshot().seed).not.toBe(make(1337).snapshot().seed)
  })

  it("builds crowd positions before movement and collision positions afterward", () => {
    const simulation = make()
    const start = simulation.snapshot().actors.filter((actor) => actor.role === "pursuer")
      .map(({ label, position }) => ({ label, position }))
    const frame = advance(simulation)
    expect(frame.crowdSnapshot).toEqual(start)
    expect(frame.collisionSnapshot).toEqual(frame.actors.filter((actor) => actor.role === "pursuer").map(({ label, position }) => ({ label, position })))
    expect(frame.collisionSnapshot).not.toEqual(frame.crowdSnapshot)
  })

  it("takes both pursuers around the finite wall to their shared goal", () => {
    const simulation = make()
    const routed = new Set<string>()
    const previous = new Map(simulation.snapshot().actors.filter((actor) => actor.role === "pursuer")
      .map((actor) => [actor.label, actor.position]))
    for (let frame = 0; frame < 160; frame++) {
      const state = advance(simulation)
      for (const actor of state.actors.filter((actor) => actor.role === "pursuer")) {
        const { x, y } = actor.position
        const from = previous.get(actor.label)
        if (from === undefined) throw new Error(`Missing previous position for ${actor.label}`)
        // Four-neighbor pursuit moves along one axis. The segment's interval gaps
        // give its exact distance from [5,6] x [1,6], independently of Geometry2.
        expect(from.x === x || from.y === y).toBe(true)
        const gapX = Math.max(5 - Math.max(from.x, x), Math.min(from.x, x) - 6, 0)
        const gapY = Math.max(1 - Math.max(from.y, y), Math.min(from.y, y) - 6, 0)
        expect(Math.hypot(gapX, gapY)).toBeGreaterThanOrEqual(0.25)
        previous.set(actor.label, actor.position)
        if (x >= 4.5 && x <= 6.5 && (y < 1 || y >= 6)) routed.add(actor.label)
      }
    }
    const pursuers = simulation.snapshot().actors.filter((actor) => actor.role === "pursuer")
    expect(pursuers).toHaveLength(2)
    for (const actor of pursuers) {
      expect(routed.has(actor.label)).toBe(true)
      expect(actor.position).toEqual({ x: 10.5, y: 3.5 })
      expect(actor.arrived).toBe(true)
    }
  })

  it("stops a fast shot at a thin wall before a farther actor and hits an open-lane actor", () => {
    const state = advance(make())
    // Each shot would travel 12 units in this frame, beyond both targets.
    expect(state.contacts).toEqual([
      { shot: "blocked-shot", time: 3.25 / 12, kind: "wall", actor: null },
      { shot: "open-shot", time: 2.5 / 12, kind: "actor", actor: "open-lane" }
    ])
    expect(state.contacts.some((contact) => contact.actor === "behind-wall")).toBe(false)
    expect(state.shotsRemaining).toBe(0)
  })

  it("keeps clocks and scripted input independent when simulations interleave", () => {
    const first = make()
    const baseline = make()
    const other = make(42)
    const start = first.snapshot().actors
    expect(advance(first, 0.1, false).actors).toEqual(start)
    expect(advance(baseline, 0.1, false)).toEqual(first.snapshot())
    for (let frame = 0; frame < 40; frame++) {
      advance(other, 0.25, frame % 2 === 0)
      const pursue = frame % 3 !== 0
      expect(advance(first, 0.1, pursue)).toEqual(advance(baseline, 0.1, pursue))
    }
  })

  it("rejects invalid seeds and frame clocks before advancing", () => {
    expect(makeSimulation({ seed: -1 })).toMatchObject({ ok: false, error: { message: "Random/InvalidSeed" } })
    const simulation = make()
    const before = simulation.snapshot()
    for (const dt of [-1, NaN, Infinity]) {
      expect(step(simulation, { dt })).toMatchObject({ ok: false, error: { tag: "Algorithms/Failure" } })
      expect(simulation.snapshot()).toEqual(before)
    }
  })
})

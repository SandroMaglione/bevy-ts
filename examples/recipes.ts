/** Simulation-owned time and random state. No clock or host capture is needed. */
import { Decode, Descriptor, Schema } from "@typeonce/ritmo"

const Time = Descriptor.ConstructedResource(Decode.struct({ step: Decode.integer, elapsed: Decode.number, dt: Decode.number }))("Recipes/Time")
const Random = Descriptor.ConstructedResource(Decode.integer)("Recipes/Random")
const Game = Schema.bind(Schema.fragment({ resources: { Time, Random } }))

const AdvanceTime = Game.System("Recipes/AdvanceTime", {
  resources: { time: Game.System.writeResource(Time) }
}, ({ resources }) => {
  resources.time.update((time) => ({ ...time, step: time.step + 1, elapsed: time.elapsed + time.dt }))
})

/** A pure 32-bit generator: the returned seed is the next world value. */
const next = (seed: number): { readonly seed: number; readonly value: number } => {
  const state = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return { seed: state, value: state / 4294967296 }
}

const Roll = Game.System("Recipes/Roll", {
  resources: { random: Game.System.writeResource(Random) }
}, ({ resources }) => {
  const rolled = next(resources.random.get())
  resources.random.set(rolled.seed)
  // Use rolled.value for this system's random decision.
})

export const runRecipes = () => {
  const made = Game.Runtime.make({ services: Game.Runtime.services(), resources: { Time: { step: 0, elapsed: 0, dt: 1 / 60 }, Random: 42 } })
  if (!made.ok) throw new Error("invalid fixture")
  const runtime = made.value
  const update = Game.Schedule(AdvanceTime, Roll)
  const before = runtime.snapshot()
  runtime.tick(update)
  const after = runtime.snapshot()
  runtime.restore(before)
  runtime.tick(update)
  return { after, replay: runtime.snapshot() }
}

import { makeSimulation, ReadWorld } from "./simulation.ts"

const simulation = makeSimulation(1337)
// A shot fired at the middle wall, and one through the opening below it.
simulation.fire({ x: 20, y: 10 }, { x: 4000, y: 0 })
simulation.fire({ x: 20, y: 380 }, { x: 4000, y: 0 })
for (let step = 0; step < 300; step++) simulation.step(1 / 60)
console.log(JSON.stringify(simulation.runtime.inspect(ReadWorld), null, 2))

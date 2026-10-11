import { makeSimulation, step } from "./simulation.ts"

const made = makeSimulation({ seed: 1337 })
if (!made.ok) throw new Error(made.error.message)
for (let frame = 0; frame < 160; frame++) {
  const advanced = step(made.value, { dt: 0.1 })
  if (!advanced.ok) throw new Error(advanced.error.message)
}
console.log(JSON.stringify(made.value.snapshot(), null, 2))

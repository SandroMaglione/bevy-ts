/**
 * A warm Node benchmark: 400 bodies, one rebuild and 400 queries per step.
 * Run with node --import tsx packages/spatial/bench/SpatialHash2.ts.
 * This measures a synthetic workload, not browser or phone performance.
 */
import { performance } from "node:perf_hooks"
import * as Aabb from "@typeonce/bevy-ts-math/Aabb"
import * as Scalar from "@typeonce/bevy-ts-math/Scalar"
import * as SpatialHash2 from "@typeonce/bevy-ts-spatial/SpatialHash2"

const cellSize = Scalar.Positive.result(64)
if (!cellSize.ok) throw new Error("Invalid benchmark cell size")
const items = Array.from({ length: 400 }, (_, id) => {
  const bounds = Aabb.result({
    position: { x: (id % 20) * 40, y: Math.floor(id / 20) * 40 },
    size: { width: 32, height: 32 }
  })
  if (!bounds.ok) throw new Error("Invalid benchmark bounds")
  return { id, bounds: bounds.value }
})
const made = SpatialHash2.from(items, {
  cellSize: cellSize.value,
  key: item => item.id,
  bounds: item => item.bounds
})
if (!made.ok) throw new Error(made.error.tag)
const index = made.value
let visited = 0
const step = (): void => {
  const rebuilt = index.rebuild(items)
  if (!rebuilt.ok) throw new Error(rebuilt.error.tag)
  for (const item of items) {
    const queried = index.forEachCandidate(item.bounds, () => { visited += 1 })
    if (!queried.ok) throw new Error(queried.error.tag)
  }
}
for (let warmup = 0; warmup < 30; warmup++) step()
const times: number[] = []
for (let sample = 0; sample < 100; sample++) {
  const start = performance.now()
  step()
  times.push(performance.now() - start)
}
times.sort((a, b) => a - b)
console.log(JSON.stringify({
  bodies: items.length,
  rebuildsPerStep: 1,
  queriesPerStep: items.length,
  measuredSteps: times.length,
  medianMs: times[50],
  p95Ms: times[95],
  visited
}, null, 2))

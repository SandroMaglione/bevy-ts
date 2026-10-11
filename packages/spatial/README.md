# `@typeonce/bevy-ts-spatial`

`SpatialHash2` indexes validated AABBs by application keys. Use it to narrow
nearby-body, trigger, and targeting checks before running the exact shape test.
It works without an ECS world.

```ts
import { SpatialHash2 } from "@typeonce/bevy-ts-spatial"
import { Aabb, Scalar } from "@typeonce/bevy-ts-math"

const cellSize = Scalar.Positive.result(64)
const bounds = Aabb.result({
  position: { x: 120, y: 80 },
  size: { width: 20, height: 20 }
})
if (cellSize.ok && bounds.ok) {
  const bodies = [{ id: "player", bounds: bounds.value }]
  const made = SpatialHash2.from(bodies, {
    cellSize: cellSize.value,
    key: body => body.id,
    bounds: body => body.bounds
  })
  if (made.ok) {
    const found = made.value.forEachCandidate(bounds.value, id => {
      console.log(id) // inferred as string
    })
    if (!found.ok) console.error(found.error)
  }
}
```

`rebuild(items)` uses the original adapters and replaces the index only on
success. A failed rebuild preserves the previous keys and cells. `clear()`
removes every entry; `size()` reports the number of indexed keys.

Queries include touching edges and zero-size boxes. They visit each candidate
once, in the input order of the last successful rebuild. A candidate shares a
cell with the query and may lie outside the query box. Run an exact geometry
test after candidate lookup. Keys identify application data; they do not prove
that an entity is still alive. Key equality follows `Map`, including `NaN` and
signed zero.

Each query collects a snapshot before invoking callbacks. A callback can query,
clear, or rebuild the same index without changing the remaining visits of that
query. Queries allocate temporary deduplication storage; rebuilds reuse a capped
pool of small bucket arrays. Callbacks and adapters are application code, and
their exceptions propagate.

Limits bound the work of a rebuild or query. Defaults are 100,000 entries,
65,536 occupied cells, 1,024 cells per entry, 1,000,000 entry-to-cell memberships,
and 4,096 cells per query. Override these through `limits`; each supplied limit
must be a positive safe integer. Failures are explicit Results and query-limit
failures invoke no callbacks. Cell coordinates must be safe integers after
dividing by the cell size. Coordinates use separate map keys on each axis and
never wrap into a fixed-width hash.

Released cells do not remain in the index. The pool retains at most 256 buckets
with at most 256 memberships each, so travelling through new areas does not
retain every previously visited cell.

Released with `@typeonce/bevy-ts` at the same version.

Run the synthetic Node benchmark from the repository root with
`node --import tsx packages/spatial/bench/SpatialHash2.ts`. It reports the median
and 95th percentile for one rebuild and 400 queries over 400 bodies per step.
It does not establish browser or phone performance.

import { describe, expect, it } from "tstyche"
import * as Aabb from "@typeonce/bevy-ts-math/Aabb"
import * as Scalar from "@typeonce/bevy-ts-math/Scalar"
import type { Result } from "@typeonce/bevy-ts"
import * as SpatialHash2 from "@typeonce/bevy-ts-spatial/SpatialHash2"

describe("SpatialHash2", () => {
  it("infers items and keys, and carries the adapters through rebuild", () => {
    const cellSize = Scalar.Positive.result(64)
    const bounds = Aabb.result({ position: { x: 0, y: 0 }, size: { width: 10, height: 10 } })
    if (!cellSize.ok || !bounds.ok) return
    const items = [{ id: "enemy", bounds: bounds.value }]
    const made = SpatialHash2.from(items, { cellSize: cellSize.value, key: item => item.id, bounds: item => item.bounds })
    expect(made).type.toBe<Result.Result<SpatialHash2.Index<{ id: string; bounds: Aabb.Aabb }, string>, SpatialHash2.ConfigError | SpatialHash2.BuildError<string>>>()
    if (!made.ok) return
    expect(made.value.cellSize).type.toBe<Scalar.Positive>()
    expect(made.value.size()).type.toBe<number>()
    expect(made.value.clear()).type.toBe<void>()
    expect(made.value.rebuild(items)).type.toBe<Result.Result<void, SpatialHash2.BuildError<string>>>()
    expect(made.value.forEachCandidate(bounds.value, key => { expect(key).type.toBe<string>() })).type.toBe<Result.Result<void, SpatialHash2.QueryError>>()

    // @ts-expect-error Type 'number' is not assignable to type 'string'.
    made.value.rebuild([{ id: 12, bounds: bounds.value }])
    // @ts-expect-error Property '[internal.token]' is missing
    made.value.forEachCandidate({ position: bounds.value.position, size: bounds.value.size }, () => {})
    // @ts-expect-error Type 'string' is not assignable to type 'number'.
    made.value.forEachCandidate(bounds.value, (key: number) => {})
    // @ts-expect-error Cannot assign to 'cellSize' because it is a read-only property.
    made.value.cellSize = cellSize.value
  })

  it("requires validated sizes and bounds and primitive identity", () => {
    const cellSize = Scalar.Positive.result(10)
    const bounds = Aabb.result({ position: { x: 0, y: 0 }, size: { width: 1, height: 1 } })
    if (!cellSize.ok || !bounds.ok) return
    const items = [{ id: 100n }]
    expect(SpatialHash2.from(items, { cellSize: cellSize.value, key: item => item.id, bounds: () => bounds.value })).type.toBe<Result.Result<SpatialHash2.Index<{ id: bigint }, bigint>, SpatialHash2.ConfigError | SpatialHash2.BuildError<bigint>>>()
    // @ts-expect-error Type 'number' is not assignable to type 'Positive'.
    SpatialHash2.from(items, { cellSize: 10, key: item => item.id, bounds: () => bounds.value })
    // @ts-expect-error Property '[internal.token]' is missing
    SpatialHash2.from(items, { cellSize: cellSize.value, key: item => item.id, bounds: () => ({ position: bounds.value.position, size: bounds.value.size }) })
    // @ts-expect-error Type '{ id: bigint; }' is not assignable to type 'Key'.
    SpatialHash2.from(items, { cellSize: cellSize.value, key: item => item, bounds: () => bounds.value })
  })
})

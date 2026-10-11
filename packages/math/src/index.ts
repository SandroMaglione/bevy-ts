/**
 * Validated math values for game code: scalars, 2D vectors, sizes, and
 * axis-aligned boxes, plus directional input normalization.
 *
 * Each value type exposes a Result-returning constructor, so it plugs into
 * `Descriptor.ConstructedComponent(...)` / `ConstructedResource(...)` and is
 * validated once at the boundary.
 */
export * as Aabb from "./Aabb.ts"
export * as InputAxis from "./InputAxis.ts"
export * as Scalar from "./Scalar.ts"
export * as Size2 from "./Size2.ts"
export * as Vector2 from "./Vector2.ts"

export * as Angle from "./Angle.ts"
export * as Direction2 from "./Direction2.ts"
export * as Geometry2 from "./Geometry2.ts"
export * as Random from "./Random.ts"
export * as Weighted from "./Weighted.ts"

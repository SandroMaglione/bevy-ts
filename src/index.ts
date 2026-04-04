/**
 * Root barrel for the public library surface.
 *
 * Consumers should typically import from this file so the package presents a
 * small number of stable namespaces instead of many deep internal paths.
 */
/**
 * Application facade helpers.
 */
export * as App from "./app.ts"
/**
 * Axis-aligned bounding box helpers.
 */
export * as Aabb from "./Aabb.ts"
/**
 * Branding helpers for validated values.
 */
export * as Brand from "./Brand.ts"
/**
 * Descriptor authoring helpers.
 */
export * as Descriptor from "./descriptor.ts"
/**
 * Reusable validated authored definitions.
 */
export * as Definition from "./Definition.ts"
/**
 * Entity identity and proof helpers.
 */
export * as Entity from "./entity.ts"
/**
 * Minimal effect-style computation type.
 */
export * as Fx from "./fx.ts"
/**
 * Directional input normalization helpers.
 */
export * as InputAxis from "./InputAxis.ts"
/**
 * Explicit success/failure helpers.
 */
export * as Result from "./Result.ts"
/**
 * Validated scalar brands and scalar combinators.
 */
export * as Scalar from "./Scalar.ts"
/**
 * Schema authoring and binding helpers.
 */
export * as Schema from "./schema.ts"
/**
 * Validated size helpers.
 */
export * as Size2 from "./Size2.ts"
/**
 * Validated vector helpers.
 */
export * as Vector2 from "./Vector2.ts"

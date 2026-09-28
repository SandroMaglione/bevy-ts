/**
 * Root barrel for the public library surface.
 *
 * Consumers should typically import from this file so the package presents a
 * small number of stable namespaces instead of many deep internal paths.
 */
/**
 * Branding helpers for validated values.
 */
export * as Brand from "./Brand.ts"
/**
 * Descriptor authoring helpers.
 */
export * as Descriptor from "./Descriptor.ts"
/**
 * Reusable validated authored definitions.
 */
export * as Definition from "./Definition.ts"
/**
 * Entity identity and proof helpers.
 */
export * as Entity from "./Entity.ts"
/**
 * Entity lifetime scopes used by scene and level ownership patterns.
 */
export * as EntityScope from "./EntityScope.ts"
/**
 * Minimal effect-style computation type.
 */
export * as Fx from "./Fx.ts"
/**
 * Read-only typed world projections.
 */
export * as Inspector from "./Inspector.ts"
/**
 * Explicit success/failure helpers.
 */
export * as Result from "./Result.ts"
/**
 * Runtime requirement tokens and normalization helpers.
 */
export * as Requirement from "./Requirement.ts"
/**
 * Save and load the world as plain data.
 */
export * as Snapshot from "./Snapshot.ts"
/**
 * Schema authoring and binding helpers.
 */
export * as Schema from "./Schema.ts"

/**
 * Root barrel for the public library surface.
 *
 * Consumers should typically import from this file so the package presents a
 * small number of stable namespaces instead of many deep internal paths.
 */
/**
 * Branding helpers for packages that author validated value types (like
 * `@typeonce/ritmo-math`). Game code validates through descriptors instead.
 */
export * as Brand from "./Brand.ts"
/**
 * Ready-made validators for descriptor values.
 */
export * as Decode from "./Decode.ts"
/**
 * Opt-in runtime introspection for tools and agents.
 */
export * as Debug from "./Debug.ts"
/**
 * Simulation time: the fixed step, the clock resource, durations in whole steps.
 */
export * as Clock from "./Clock.ts"
/**
 * Descriptor authoring helpers.
 */
export * as Descriptor from "./Descriptor.ts"
/**
 * Entity identity and proof helpers.
 */
export * as Entity from "./Entity.ts"
/**
 * Entity lifetime scopes used by scene and level ownership patterns.
 */
export * as EntityScope from "./EntityScope.ts"
/**
 * The host's wall clock as an injected contract (`standard`, `test()`).
 */
export * as HostClock from "./HostClock.ts"
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

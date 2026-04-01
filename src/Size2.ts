/**
 * Branded two-dimensional sizes with explicit validation.
 *
 * Sizes model non-negative width/height pairs and are commonly used for
 * colliders, viewports, and AABB dimensions.
 */
import type * as Brand from "./Brand.ts"
import * as internal from "./internal/size2.ts"
import type * as Result from "./Result.ts"
import type * as Scalar from "./Scalar.ts"

/**
 * Raw size input accepted by the public constructors.
 */
export type Raw = {
  readonly width: number
  readonly height: number
}

/**
 * Validated non-negative width/height pair.
 */
export type Size2 = Brand.Branded<{
  readonly width: Scalar.NonNegative
  readonly height: Scalar.NonNegative
}, "Size2">

/**
 * Structured size-construction failure.
 */
export type Error = {
  readonly tag: "Size2/Invalid"
  readonly width: Scalar.Error | null
  readonly height: Scalar.Error | null
  readonly input: Raw
}

/**
 * Validates one raw size and returns an explicit result.
 */
export const result: (raw: Raw) => Result.Result<Size2, Error> = internal.result
/**
 * Validates one raw size and returns `null` on failure.
 */
export const option: (raw: Raw) => Size2 | null = internal.option
/**
 * Checks whether one raw size already satisfies the size invariants.
 */
export const is: (raw: Raw) => raw is Raw & Size2 = internal.is
/**
 * Converts one branded size back to a fresh raw object.
 */
export const toRaw: (size: Size2) => Raw = internal.toRaw
/**
 * Reads the width component of one branded size.
 */
export const width: (size: Size2) => Scalar.NonNegative = internal.width
/**
 * Reads the height component of one branded size.
 */
export const height: (size: Size2) => Scalar.NonNegative = internal.height

/**
 * Branded axis-aligned bounding boxes built from validated vectors and sizes.
 *
 * The public shape is centered: each AABB is described by a center position and
 * a non-negative size. Geometry helpers derive edges and overlap relationships
 * without mutating the original value.
 */
import type * as Brand from "./Brand.ts"
import * as internal from "./internal/aabb.ts"
import type * as Result from "./Result.ts"
import type * as Scalar from "./Scalar.ts"
import type * as Size2 from "./Size2.ts"
import type * as Vector2 from "./Vector2.ts"

/**
 * Raw AABB input accepted by the public constructors.
 */
export type Raw = {
  readonly position: Vector2.Raw
  readonly size: Size2.Raw
}

/**
 * Validated centered axis-aligned bounding box.
 */
export type Aabb = Brand.Branded<{
  readonly position: Vector2.Vector2
  readonly size: Size2.Size2
}, "Aabb">

/**
 * Structured AABB-construction failure.
 */
export type Error =
  | { readonly tag: "Aabb/InvalidPosition"; readonly error: Vector2.Error; readonly input: Raw }
  | { readonly tag: "Aabb/InvalidSize"; readonly error: Size2.Error; readonly input: Raw }

/**
 * Validates one raw AABB and returns an explicit result.
 *
 * @example
 * ```ts
 * const playerBox = Aabb.result({
 *   position: { x: 24, y: 24 },
 *   size: { width: 16, height: 16 }
 * })
 * ```
 */
export const result: (raw: Raw) => Result.Result<Aabb, Error> = internal.result
/**
 * Validates one raw AABB and returns `null` on failure.
 */
export const option: (raw: Raw) => Aabb | null = internal.option
/**
 * Checks whether one raw value already satisfies the AABB invariants.
 */
export const is: (raw: Raw) => raw is Raw & Aabb = internal.is
/**
 * Reads the center position of one AABB.
 */
export const position: (aabb: Aabb) => Vector2.Vector2 = internal.position
/**
 * Reads the size of one AABB.
 */
export const size: (aabb: Aabb) => Size2.Size2 = internal.size
/**
 * Returns the left edge of one centered AABB.
 */
export const left: (aabb: Aabb) => Scalar.Finite = internal.left
/**
 * Returns the right edge of one centered AABB.
 */
export const right: (aabb: Aabb) => Scalar.Finite = internal.right
/**
 * Returns the top edge of one centered AABB.
 */
export const top: (aabb: Aabb) => Scalar.Finite = internal.top
/**
 * Returns the bottom edge of one centered AABB.
 */
export const bottom: (aabb: Aabb) => Scalar.Finite = internal.bottom
/**
 * Checks whether two AABBs overlap on both axes.
 *
 * @example
 * ```ts
 * const overlaps = Aabb.intersects(playerBox, wallBox)
 * ```
 */
export const intersects: (first: Aabb, second: Aabb) => boolean = internal.intersects
/**
 * Checks whether two AABBs overlap on the horizontal axis.
 */
export const overlapsHorizontally: (first: Aabb, second: Aabb) => boolean = internal.overlapsHorizontally
/**
 * Checks whether two AABBs overlap on the vertical axis.
 */
export const overlapsVertically: (first: Aabb, second: Aabb) => boolean = internal.overlapsVertically
/**
 * Returns a translated copy of one AABB.
 */
export const translate: (aabb: Aabb, delta: Vector2.Vector2) => Aabb = internal.translate

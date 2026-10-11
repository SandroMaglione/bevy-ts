/**
 * Validated 2D shapes and pure contact queries.
 *
 * Touching counts as overlap. Sweeps take a displacement, not a direction or
 * velocity, and test its closed interval [0, 1]. Initial overlap (including
 * initial touching) is separate from a later contact. These queries neither
 * move bodies nor choose a collision response.
 *
 * Queries use JavaScript floating-point arithmetic. An unrepresentable
 * intermediate is an explicit failure, never a branded infinity or a miss.
 *
 * @module Geometry2
 * @docGroup data-structures
 */
import type * as Brand from "@typeonce/bevy-ts/Brand"
import type * as Result from "@typeonce/bevy-ts/Result"
import type * as Aabb from "./Aabb.ts"
import type * as Direction2 from "./Direction2.ts"
import type * as Scalar from "./Scalar.ts"
import type * as Vector2 from "./Vector2.ts"
import * as internal from "./internal/geometry2.ts"

/** Circle constructor input, in world coordinates. */
export type CircleRaw = { readonly center: Vector2.Raw; readonly radius: number }
/** A circle with finite bounds and a non-negative radius. */
export type Circle = Brand.Branded<{
  readonly center: Vector2.Vector2
  readonly radius: Scalar.NonNegative
}, "Geometry2/Circle">
/** Segment constructor input. A zero-length segment is valid. */
export type SegmentRaw = { readonly start: Vector2.Raw; readonly end: Vector2.Raw }
/** A finite segment, including a segment reduced to a point. */
export type Segment = Brand.Branded<{
  readonly start: Vector2.Vector2
  readonly end: Vector2.Vector2
}, "Geometry2/Segment">
/** Capsule constructor input. */
export type CapsuleRaw = { readonly segment: SegmentRaw; readonly radius: number }
/** All points within `radius` of the segment. Zero radius is valid. */
export type Capsule = Brand.Branded<{
  readonly segment: Segment
  readonly radius: Scalar.NonNegative
}, "Geometry2/Capsule">

/** A query cannot represent a required intermediate or a contact normal. */
export type QueryError =
  | { readonly tag: "Geometry2/NumericRange"; readonly operation: string }
  | { readonly tag: "Geometry2/UndefinedNormal" }
/** Constructor input is malformed or violates a shape's invariants. */
export type Error =
  | { readonly tag: "Geometry2/InvalidCircle"; readonly input: CircleRaw }
  | { readonly tag: "Geometry2/InvalidSegment"; readonly input: SegmentRaw }
  | { readonly tag: "Geometry2/InvalidCapsule"; readonly input: CapsuleRaw }
/** Untrusted input is not the requested shape. */
export type DecodeError = { readonly tag: "Geometry2/Malformed"; readonly input: unknown }

/** Validate or decode circles before storing or querying them. */
export const Circle: {
  readonly result: (raw: CircleRaw) => Result.Result<Circle, Error>
  readonly decode: (raw: unknown) => Result.Result<Circle, Error | DecodeError>
} = { result: internal.circleResult, decode: internal.circleDecode }
/** Validate or decode segments before storing or querying them. */
export const Segment: {
  readonly result: (raw: SegmentRaw) => Result.Result<Segment, Error>
  readonly decode: (raw: unknown) => Result.Result<Segment, Error | DecodeError>
} = { result: internal.segmentResult, decode: internal.segmentDecode }
/** Validate or decode capsules before storing or querying them. */
export const Capsule: {
  readonly result: (raw: CapsuleRaw) => Result.Result<Capsule, Error>
  readonly decode: (raw: unknown) => Result.Result<Capsule, Error | DecodeError>
} = { result: internal.capsuleResult, decode: internal.capsuleDecode }

/** The first contact along a displacement, or its distinct initial state. */
export type Sweep =
  | { readonly tag: "Geometry2/Miss" }
  | { readonly tag: "Geometry2/InitialOverlap" }
  | {
    readonly tag: "Geometry2/Contact"
    readonly time: Scalar.Fraction
    /** Unit normal pointing from the stationary shape toward the moving circle. */
    readonly normal: Direction2.Direction2
  }

/** Whether circles overlap or touch. */
export const circleTouchesCircle: (left: Circle, right: Circle) => Result.Result<boolean, QueryError> = internal.circleTouchesCircle
/** Whether a circle overlaps or touches a centered AABB, including its corners. */
export const circleTouchesAabb: (circle: Circle, box: Aabb.Aabb) => Result.Result<boolean, QueryError> = internal.circleTouchesAabb
/** The closest point on a closed segment. A zero-length segment returns its point. */
export const closestPointOnSegment: (point: Vector2.Vector2, segment: Segment) => Result.Result<Vector2.Vector2, QueryError> = internal.closestPointOnSegment
/** Whether a circle overlaps or touches a capsule, including its round ends. */
export const circleTouchesCapsule: (circle: Circle, capsule: Capsule) => Result.Result<boolean, QueryError> = internal.circleTouchesCapsule
/** Sweep against a stationary circle. A later point-on-point contact has no normal and fails explicitly. */
export const sweepCircleCircle: (circle: Circle, delta: Vector2.Vector2, target: Circle) => Result.Result<Sweep, QueryError> = internal.sweepCircleCircle
/**
 * Sweep against a stationary AABB's faces and rounded corners. This is the
 * circle/AABB Minkowski sum, rather than an expanded square approximation.
 * Equal-time contacts choose faces left, right, top, bottom, then corners in
 * that order. No skin distance, depenetration, or sliding is applied.
 */
export const sweepCircleAabb: (circle: Circle, delta: Vector2.Vector2, box: Aabb.Aabb) => Result.Result<Sweep, QueryError> = internal.sweepCircleAabb

/** Conservative centered bounds of a circle, including a zero-radius point. */
export const circleBounds: (circle: Circle) => Result.Result<Aabb.Aabb, QueryError> = internal.circleBounds
/** Conservative bounds of the full closed displacement. Unrepresentable bounds fail explicitly. */
export const sweptCircleBounds: (circle: Circle, delta: Vector2.Vector2) => Result.Result<Aabb.Aabb, QueryError> = internal.sweptCircleBounds

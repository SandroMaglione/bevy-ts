import type * as Brand from "./Brand.ts"
import * as internal from "./internal/aabb.ts"
import type * as Result from "./Result.ts"
import type * as Scalar from "./Scalar.ts"
import type * as Size2 from "./Size2.ts"
import type * as Vector2 from "./Vector2.ts"

export type Raw = {
  readonly position: Vector2.Raw
  readonly size: Size2.Raw
}

export type Aabb = Brand.Branded<{
  readonly position: Vector2.Vector2
  readonly size: Size2.Size2
}, "Aabb">

export type Error =
  | { readonly tag: "Aabb/InvalidPosition"; readonly error: Vector2.Error; readonly input: Raw }
  | { readonly tag: "Aabb/InvalidSize"; readonly error: Size2.Error; readonly input: Raw }

export const result: (raw: Raw) => Result.Result<Aabb, Error> = internal.result
export const option: (raw: Raw) => Aabb | null = internal.option
export const is: (raw: Raw) => raw is Raw & Aabb = internal.is
export const position: (aabb: Aabb) => Vector2.Vector2 = internal.position
export const size: (aabb: Aabb) => Size2.Size2 = internal.size
export const left: (aabb: Aabb) => Scalar.Finite = internal.left
export const right: (aabb: Aabb) => Scalar.Finite = internal.right
export const top: (aabb: Aabb) => Scalar.Finite = internal.top
export const bottom: (aabb: Aabb) => Scalar.Finite = internal.bottom
export const intersects: (first: Aabb, second: Aabb) => boolean = internal.intersects
export const overlapsHorizontally: (first: Aabb, second: Aabb) => boolean = internal.overlapsHorizontally
export const overlapsVertically: (first: Aabb, second: Aabb) => boolean = internal.overlapsVertically
export const translate: (aabb: Aabb, delta: Vector2.Vector2) => Aabb = internal.translate

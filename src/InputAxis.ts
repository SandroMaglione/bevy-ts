import * as internal from "./internal/inputAxis.ts"
import type * as Vector2 from "./Vector2.ts"

export type Axis = -1 | 0 | 1

export const axis: (negativePressed: boolean, positivePressed: boolean) => Axis = internal.axis
export const vectorFromAxes: (
  input: { readonly left: boolean; readonly right: boolean; readonly up: boolean; readonly down: boolean }
) => Vector2.Vector2 = internal.vectorFromAxes
export const vectorFromAxisValues: (horizontal: Axis, vertical: Axis) => Vector2.Vector2 = internal.vectorFromAxisValues

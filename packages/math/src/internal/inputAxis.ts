import * as Vector2 from "../Vector2.ts"
import type { Axis } from "../InputAxis.ts"

export const axis = (negativePressed: boolean, positivePressed: boolean): Axis => {
  if (negativePressed === positivePressed) {
    return 0
  }

  return negativePressed ? -1 : 1
}

export const vectorFromAxisValues = (horizontal: Axis, vertical: Axis): Vector2.Vector2 =>
  Vector2.normalizeOrZero({
    x: horizontal,
    y: vertical
  } as Vector2.Vector2)

export const vectorFromAxes = (
  input: { readonly left: boolean; readonly right: boolean; readonly up: boolean; readonly down: boolean }
): Vector2.Vector2 =>
  vectorFromAxisValues(axis(input.left, input.right), axis(input.up, input.down))

/**
 * Pure helpers for normalizing boolean directional input into typed axes and
 * movement vectors.
 *
 * This module is runtime-agnostic: it does not know about keyboard events,
 * gamepads, or host APIs. It only translates already-sampled booleans into the
 * compact movement values used by the examples.
 *
 * Reach for it in the gap between host input sampling and ECS simulation:
 * capture raw button state in the host, normalize it here, then write the
 * resulting axes or vectors into resources/components for systems to consume.
 *
 * @example
 * ```ts
 * // Normalize one sampled host input snapshot into a movement vector.
 * const movement = InputAxis.vectorFromAxes({
 *   left: false,
 *   right: true,
 *   up: false,
 *   down: false
 * })
 * ```
 *
 * @module InputAxis
 * @docGroup helpers
 *
 * @categoryDescription Input Types
 * Small shared types that describe normalized axis values.
 *
 * @categoryDescription Axis Helpers
 * Pure helpers that reduce opposing booleans to one explicit signed movement axis.
 *
 * @categoryDescription Vector Helpers
 * Runtime-agnostic helpers that derive branded movement vectors from normalized input.
 */
import * as internal from "./internal/inputAxis.ts"
import type * as Vector2 from "./Vector2.ts"

/**
 * Canonical one-dimensional movement axis.
 *
 * @category Input Types
 */
export type Axis = -1 | 0 | 1

/**
 * Derives one signed axis from two opposing booleans.
 *
 * @category Axis Helpers
 */
export const axis: (negativePressed: boolean, positivePressed: boolean) => Axis = internal.axis
/**
 * Builds a normalized movement vector from four directional booleans.
 *
 * @example
 * ```ts
 * const direction = InputAxis.vectorFromAxes({
 *   left: false,
 *   right: true,
 *   up: false,
 *   down: true
 * })
 * ```
 *
 * @category Vector Helpers
 */
export const vectorFromAxes: (
  input: { readonly left: boolean; readonly right: boolean; readonly up: boolean; readonly down: boolean }
) => Vector2.Vector2 = internal.vectorFromAxes
/**
 * Builds a normalized movement vector from two explicit axis values.
 *
 * @category Vector Helpers
 */
export const vectorFromAxisValues: (horizontal: Axis, vertical: Axis) => Vector2.Vector2 = internal.vectorFromAxisValues

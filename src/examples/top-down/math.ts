import * as Aabb from "../../Aabb.ts"
import * as InputAxis from "../../InputAxis.ts"
import * as Scalar from "../../Scalar.ts"
import * as Vector2Module from "../../Vector2.ts"
import { WORLD_HEIGHT, WORLD_WIDTH } from "./constants.ts"
import type { AnimationFrameIndex, InputStateValue, Vector2 } from "./types.ts"

export const clamp = (value: number, min: number, max: number): number => {
  const nextValue = Scalar.Finite.option(value)
  const nextMin = Scalar.Finite.option(min)
  const nextMax = Scalar.Finite.option(max)
  if (!nextValue || !nextMin || !nextMax) {
    return value
  }

  return Scalar.clamp(nextValue, nextMin, nextMax)
}

export const lengthSquared = (vector: Vector2): number => Vector2Module.lengthSquared(vector)

export const normalizeMovement = (input: InputStateValue): Vector2 => InputAxis.vectorFromAxes(input)

export const advanceFrameIndex = (frameIndex: AnimationFrameIndex): AnimationFrameIndex =>
  frameIndex === 5 ? 0 : (frameIndex + 1) as AnimationFrameIndex

export const intersects = (
  firstPosition: Vector2,
  firstCollider: { width: number; height: number },
  secondPosition: Vector2,
  secondCollider: { width: number; height: number }
): boolean => {
  const first = Aabb.option({
    position: firstPosition,
    size: firstCollider
  })
  const second = Aabb.option({
    position: secondPosition,
    size: secondCollider
  })

  return !!first && !!second && Aabb.intersects(first, second)
}

export const resolveHorizontalMovement = (
  position: Vector2,
  deltaX: number,
  collider: { width: number; height: number },
  walls: ReadonlyArray<{ position: Vector2; collider: { width: number; height: number } }>
): number => {
  if (deltaX === 0) {
    return position.x
  }

  const halfWidth = collider.width * 0.5
  let nextX = clamp(position.x + deltaX, halfWidth, WORLD_WIDTH - halfWidth)

  for (const wall of walls) {
    const candidate = Vector2Module.option({
      x: nextX,
      y: position.y
    })
    if (!candidate) {
      continue
    }
    if (!intersects(candidate, collider, wall.position, wall.collider)) {
      continue
    }

    const wallHalfWidth = wall.collider.width * 0.5
    nextX =
      deltaX > 0
        ? wall.position.x - wallHalfWidth - halfWidth
        : wall.position.x + wallHalfWidth + halfWidth
  }

  return clamp(nextX, halfWidth, WORLD_WIDTH - halfWidth)
}

export const resolveVerticalMovement = (
  position: Vector2,
  deltaY: number,
  collider: { width: number; height: number },
  walls: ReadonlyArray<{ position: Vector2; collider: { width: number; height: number } }>
): number => {
  if (deltaY === 0) {
    return position.y
  }

  const halfHeight = collider.height * 0.5
  let nextY = clamp(position.y + deltaY, halfHeight, WORLD_HEIGHT - halfHeight)

  for (const wall of walls) {
    const candidate = Vector2Module.option({
      x: position.x,
      y: nextY
    })
    if (!candidate) {
      continue
    }
    if (!intersects(candidate, collider, wall.position, wall.collider)) {
      continue
    }

    const wallHalfHeight = wall.collider.height * 0.5
    nextY =
      deltaY > 0
        ? wall.position.y - wallHalfHeight - halfHeight
        : wall.position.y + wallHalfHeight + halfHeight
  }

  return clamp(nextY, halfHeight, WORLD_HEIGHT - halfHeight)
}

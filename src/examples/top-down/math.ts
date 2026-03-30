import { WORLD_HEIGHT, WORLD_WIDTH } from "./constants.ts"
import type { AnimationFrameIndex, InputStateValue, Vector2 } from "./types.ts"

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export const lengthSquared = (vector: Vector2): number =>
  vector.x * vector.x + vector.y * vector.y

export const normalizeMovement = (input: InputStateValue): Vector2 => {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  const magnitudeSquared = x * x + y * y
  if (magnitudeSquared === 0) {
    return { x: 0, y: 0 }
  }

  const magnitude = Math.sqrt(magnitudeSquared)
  return {
    x: x / magnitude,
    y: y / magnitude
  }
}

export const advanceFrameIndex = (frameIndex: AnimationFrameIndex): AnimationFrameIndex =>
  frameIndex === 5 ? 0 : (frameIndex + 1) as AnimationFrameIndex

export const intersects = (
  firstPosition: Vector2,
  firstCollider: { width: number; height: number },
  secondPosition: Vector2,
  secondCollider: { width: number; height: number }
): boolean =>
  Math.abs(firstPosition.x - secondPosition.x) * 2 < firstCollider.width + secondCollider.width &&
  Math.abs(firstPosition.y - secondPosition.y) * 2 < firstCollider.height + secondCollider.height

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
    const candidate = {
      x: nextX,
      y: position.y
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
    const candidate = {
      x: position.x,
      y: nextY
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

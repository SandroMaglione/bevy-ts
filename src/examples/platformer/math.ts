import {
  AIR_ACCELERATION,
  GROUND_ACCELERATION,
  GROUND_DECELERATION,
  RUN_SPEED,
  WALK_SPEED
} from "./constants.ts"
import type {
  CollisionBody,
  HorizontalCollisionResult,
  InputStateValue,
  VerticalCollisionResult,
  Vector2
} from "./types.ts"

const leftOf = (body: CollisionBody): number => body.position.x - body.collider.width * 0.5
const rightOf = (body: CollisionBody): number => body.position.x + body.collider.width * 0.5
const topOf = (body: CollisionBody): number => body.position.y - body.collider.height * 0.5
const bottomOf = (body: CollisionBody): number => body.position.y + body.collider.height * 0.5

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export const approachScalar = (current: number, target: number, maxDelta: number): number => {
  if (current < target) {
    return Math.min(current + maxDelta, target)
  }

  return Math.max(current - maxDelta, target)
}

export const horizontalIntent = (input: InputStateValue): -1 | 0 | 1 => {
  if (input.left === input.right) {
    return 0
  }

  return input.left ? -1 : 1
}

export const targetHorizontalSpeed = (input: InputStateValue): number =>
  horizontalIntent(input) * (input.runPressed ? RUN_SPEED : WALK_SPEED)

export const resolveHorizontalSpeed = (
  currentVelocityX: number,
  input: InputStateValue,
  dt: number,
  grounded: boolean
): number => {
  const target = targetHorizontalSpeed(input)
  const acceleration =
    target === 0 && grounded ? GROUND_DECELERATION
    : grounded ? GROUND_ACCELERATION
    : AIR_ACCELERATION

  return approachScalar(currentVelocityX, target, acceleration * dt)
}

const overlapsVertically = (
  movingPosition: Vector2,
  movingCollider: { width: number; height: number },
  solid: CollisionBody
): boolean => {
  const movingTop = movingPosition.y - movingCollider.height * 0.5
  const movingBottom = movingPosition.y + movingCollider.height * 0.5
  return movingBottom > topOf(solid) && movingTop < bottomOf(solid)
}

const overlapsHorizontally = (
  movingPosition: Vector2,
  movingCollider: { width: number; height: number },
  solid: CollisionBody
): boolean => {
  const movingLeft = movingPosition.x - movingCollider.width * 0.5
  const movingRight = movingPosition.x + movingCollider.width * 0.5
  return movingRight > leftOf(solid) && movingLeft < rightOf(solid)
}

export const resolveHorizontalMovement = (
  position: Vector2,
  deltaX: number,
  collider: { width: number; height: number },
  solids: ReadonlyArray<CollisionBody>
): HorizontalCollisionResult => {
  if (deltaX === 0) {
    return {
      nextX: position.x,
      blockedLeft: false,
      blockedRight: false
    }
  }

  let nextX = position.x + deltaX
  let blockedLeft = false
  let blockedRight = false

  for (const solid of solids) {
    if (!overlapsVertically(position, collider, solid)) {
      continue
    }

    if (deltaX > 0) {
      const movingRightNow = position.x + collider.width * 0.5
      const movingRightNext = nextX + collider.width * 0.5
      const solidLeft = leftOf(solid)
      if (movingRightNow <= solidLeft && movingRightNext > solidLeft) {
        nextX = Math.min(nextX, solidLeft - collider.width * 0.5)
        blockedRight = true
      }
      continue
    }

    const movingLeftNow = position.x - collider.width * 0.5
    const movingLeftNext = nextX - collider.width * 0.5
    const solidRight = rightOf(solid)
    if (movingLeftNow >= solidRight && movingLeftNext < solidRight) {
      nextX = Math.max(nextX, solidRight + collider.width * 0.5)
      blockedLeft = true
    }
  }

  return {
    nextX: nextX as HorizontalCollisionResult["nextX"],
    blockedLeft,
    blockedRight
  }
}

export const resolveVerticalMovement = (
  position: Vector2,
  deltaY: number,
  collider: { width: number; height: number },
  solids: ReadonlyArray<CollisionBody>
): VerticalCollisionResult => {
  if (deltaY === 0) {
    return {
      nextY: position.y,
      grounded: false,
      hitCeiling: false
    }
  }

  let nextY = position.y + deltaY
  let grounded = false
  let hitCeiling = false

  for (const solid of solids) {
    if (!overlapsHorizontally(position, collider, solid)) {
      continue
    }

    if (deltaY > 0) {
      const movingBottomNow = position.y + collider.height * 0.5
      const movingBottomNext = nextY + collider.height * 0.5
      const solidTop = topOf(solid)
      if (movingBottomNow <= solidTop && movingBottomNext > solidTop) {
        nextY = Math.min(nextY, solidTop - collider.height * 0.5)
        grounded = true
      }
      continue
    }

    const movingTopNow = position.y - collider.height * 0.5
    const movingTopNext = nextY - collider.height * 0.5
    const solidBottom = bottomOf(solid)
    if (movingTopNow >= solidBottom && movingTopNext < solidBottom) {
      nextY = Math.max(nextY, solidBottom + collider.height * 0.5)
      hitCeiling = true
    }
  }

  return {
    nextY: nextY as VerticalCollisionResult["nextY"],
    grounded,
    hitCeiling
  }
}

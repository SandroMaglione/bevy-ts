import * as Definition from "@typeonce/bevy-ts/Definition"
import * as Size2 from "@typeonce/bevy-ts-math/Size2"
import * as Vector2 from "@typeonce/bevy-ts-math/Vector2"
import { PLAYER_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from "./constants.ts"

export const playerSpawn = Definition.entry(Vector2, { x: 640, y: 260 })
export const playerZeroVelocity = Definition.entry(Vector2, { x: 0, y: 0 })
export const playerCollider = Definition.entry(Size2, {
  width: PLAYER_SIZE,
  height: PLAYER_SIZE
})
export const pickupCollider = Definition.entry(Size2, {
  width: 28,
  height: 28
})
export const initialCamera = Definition.entry(Vector2, {
  x: WORLD_WIDTH * 0.5,
  y: WORLD_HEIGHT * 0.5
})

export const playerDefinitions = Definition.all({
  spawn: playerSpawn,
  zeroVelocity: playerZeroVelocity,
  collider: playerCollider
})

export const pickupDefinitions = Definition.all({
  collider: pickupCollider
})

export const runtimeDefinitions = Definition.all({
  initialCamera
})

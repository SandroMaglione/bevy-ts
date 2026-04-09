import * as Definition from "@bevy-ts/core/Definition"
import * as Size2 from "@bevy-ts/core/Size2"
import * as Vector2 from "@bevy-ts/core/Vector2"
import { PLAYER_HEIGHT, PLAYER_WIDTH } from "./constants.ts"
import { playerSpawn as rawPlayerSpawn } from "./content.ts"

export const playerSpawn = Definition.entry(Vector2, rawPlayerSpawn)
export const playerZeroVelocity = Definition.entry(Vector2, { x: 0, y: 0 })
export const playerCollider = Definition.entry(Size2, {
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT
})

export const playerDefinitions = Definition.all({
  spawn: playerSpawn,
  zeroVelocity: playerZeroVelocity,
  collider: playerCollider
})

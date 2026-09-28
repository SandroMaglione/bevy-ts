import * as Definition from "@typeonce/bevy-ts/Definition"
import * as Size2 from "@typeonce/bevy-ts-math/Size2"
import * as Vector2 from "@typeonce/bevy-ts-math/Vector2"
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

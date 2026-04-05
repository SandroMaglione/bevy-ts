import * as Definition from "../../src/Definition.ts"
import * as Size2 from "../../src/Size2.ts"
import * as Vector2 from "../../src/Vector2.ts"
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

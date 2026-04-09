import * as Definition from "@bevy-ts/core/Definition"
import * as Size2 from "@bevy-ts/core/Size2"
import * as Vector2 from "@bevy-ts/core/Vector2"
import { STAGE_HEIGHT, STAGE_WIDTH } from "./constants.ts"

export const arena = Definition.entry(Size2, {
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT
})

export const playerSpawn = Definition.entry(Vector2, {
  x: STAGE_WIDTH * 0.5,
  y: STAGE_HEIGHT * 0.5
})

export const runtimeDefinitions = Definition.all({
  arena
})

export const playerDefinitions = Definition.all({
  spawn: playerSpawn
})

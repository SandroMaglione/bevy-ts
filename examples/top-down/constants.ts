import type { FacingValue } from "./types.ts"

export const WORLD_WIDTH = 2200
export const WORLD_HEIGHT = 1600
export const PLAYER_SPEED = 280
export const PLAYER_SIZE = 36
export const PLAYER_INTERACT_RADIUS = 72
export const PLAYER_FRAME_SECONDS = 0.1
export const PLAYER_FRAME_SIZE = 16
export const MAX_DELTA_SECONDS = 0.05
export const PLAYER_SHEET_URL = new URL("../../../assets/spr_player.png", import.meta.url).href

export const facingRows: Readonly<Record<FacingValue, 1 | 2 | 3 | 4>> = {
  Down: 1,
  Left: 2,
  Right: 3,
  Up: 4
}

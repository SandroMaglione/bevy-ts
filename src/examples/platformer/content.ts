import { GROUND_HEIGHT, KILL_PLANE_Y, PLAYER_HEIGHT, WORLD_HEIGHT, WORLD_WIDTH } from "./constants.ts"

export type LevelSolidLayout = {
  x: number
  y: number
  width: number
  height: number
  kind: "ground" | "block" | "pipe"
}

const groundCenterY = WORLD_HEIGHT - GROUND_HEIGHT * 0.5

export const playerSpawn = {
  x: 180,
  y: groundCenterY - GROUND_HEIGHT * 0.5 - PLAYER_HEIGHT * 0.5
} as const

export const levelBounds = {
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  killPlaneY: KILL_PLANE_Y
} as const

export const levelSolids: ReadonlyArray<LevelSolidLayout> = [
  { kind: "ground", x: 288, y: groundCenterY, width: 576, height: GROUND_HEIGHT },
  { kind: "ground", x: 1088, y: groundCenterY, width: 640, height: GROUND_HEIGHT },
  { kind: "ground", x: 1824, y: groundCenterY, width: 384, height: GROUND_HEIGHT },
  { kind: "ground", x: 2216, y: groundCenterY, width: 176, height: GROUND_HEIGHT },
  { kind: "block", x: 660, y: 772, width: 128, height: 32 },
  { kind: "block", x: 860, y: 708, width: 128, height: 32 },
  { kind: "block", x: 1030, y: 648, width: 128, height: 32 },
  { kind: "block", x: 1210, y: 708, width: 160, height: 32 },
  { kind: "pipe", x: 1470, y: 792, width: 96, height: 240 },
  { kind: "block", x: 1690, y: 736, width: 192, height: 32 },
  { kind: "block", x: 1910, y: 676, width: 128, height: 32 }
] as const

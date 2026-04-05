import { Rectangle, Texture } from "pixi.js"

import { PLAYER_FRAME_SIZE } from "../constants.ts"
import type { PlayerFrameAtlas } from "../types.ts"

const createFrameRow = (sheet: Texture, row: 1 | 2 | 3 | 4) =>
  [
    new Texture({
      source: sheet.source,
      frame: new Rectangle(PLAYER_FRAME_SIZE, row * PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE)
    }),
    new Texture({
      source: sheet.source,
      frame: new Rectangle(2 * PLAYER_FRAME_SIZE, row * PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE)
    }),
    new Texture({
      source: sheet.source,
      frame: new Rectangle(3 * PLAYER_FRAME_SIZE, row * PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE)
    }),
    new Texture({
      source: sheet.source,
      frame: new Rectangle(4 * PLAYER_FRAME_SIZE, row * PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE)
    }),
    new Texture({
      source: sheet.source,
      frame: new Rectangle(5 * PLAYER_FRAME_SIZE, row * PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE)
    }),
    new Texture({
      source: sheet.source,
      frame: new Rectangle(6 * PLAYER_FRAME_SIZE, row * PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE)
    })
  ] as const

export const createPlayerFrameAtlas = (sheet: Texture): PlayerFrameAtlas => ({
  Down: createFrameRow(sheet, 1),
  Left: createFrameRow(sheet, 2),
  Right: createFrameRow(sheet, 3),
  Up: createFrameRow(sheet, 4)
})

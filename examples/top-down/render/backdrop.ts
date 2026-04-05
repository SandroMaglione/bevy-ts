import { Graphics } from "pixi.js"

import { WORLD_HEIGHT, WORLD_WIDTH } from "../constants.ts"

export const createWorldBackdrop = (): Graphics => {
  const backdrop = new Graphics()

  backdrop.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
  backdrop.fill(0x0f1720)

  for (let x = 0; x <= WORLD_WIDTH; x += 120) {
    backdrop.moveTo(x, 0)
    backdrop.lineTo(x, WORLD_HEIGHT)
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += 120) {
    backdrop.moveTo(0, y)
    backdrop.lineTo(WORLD_WIDTH, y)
  }
  backdrop.stroke({
    color: 0x1a2731,
    width: 1
  })

  backdrop.roundRect(14, 14, WORLD_WIDTH - 28, WORLD_HEIGHT - 28, 24)
  backdrop.stroke({
    color: 0x2e4658,
    width: 4
  })

  return backdrop
}

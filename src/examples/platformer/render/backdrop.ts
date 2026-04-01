import { Container, Graphics } from "pixi.js"

import { WORLD_HEIGHT, WORLD_WIDTH } from "../constants.ts"

export const createWorldBackdrop = (): Container => {
  const root = new Container()

  const sky = new Graphics()
  sky.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
  sky.fill(0x6dc8ff)

  const cloudA = new Graphics()
  cloudA.roundRect(220, 120, 220, 64, 26)
  cloudA.fill({ color: 0xffffff, alpha: 0.75 })
  cloudA.roundRect(340, 92, 150, 58, 24)
  cloudA.fill({ color: 0xffffff, alpha: 0.82 })

  const cloudB = new Graphics()
  cloudB.roundRect(1180, 160, 210, 56, 24)
  cloudB.fill({ color: 0xffffff, alpha: 0.72 })
  cloudB.roundRect(1288, 132, 136, 52, 22)
  cloudB.fill({ color: 0xffffff, alpha: 0.8 })

  const hillBack = new Graphics()
  hillBack.ellipse(340, WORLD_HEIGHT - 90, 210, 150)
  hillBack.fill(0x61bc67)
  hillBack.ellipse(860, WORLD_HEIGHT - 110, 280, 165)
  hillBack.fill(0x61bc67)
  hillBack.ellipse(1710, WORLD_HEIGHT - 100, 250, 158)
  hillBack.fill(0x61bc67)

  const hillFront = new Graphics()
  hillFront.ellipse(520, WORLD_HEIGHT - 58, 250, 110)
  hillFront.fill(0x44a84b)
  hillFront.ellipse(1350, WORLD_HEIGHT - 48, 320, 120)
  hillFront.fill(0x44a84b)
  hillFront.ellipse(2070, WORLD_HEIGHT - 56, 180, 100)
  hillFront.fill(0x44a84b)

  root.addChild(sky)
  root.addChild(cloudA)
  root.addChild(cloudB)
  root.addChild(hillBack)
  root.addChild(hillFront)
  return root
}

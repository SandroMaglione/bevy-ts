import { Graphics } from "pixi.js"

import type { ShapeKind } from "../types.ts"

export const makeAgentNode = (
  renderable: {
    shape: ShapeKind
    color: number
    accent: number
    alpha: number
  },
  size: number
): Graphics => {
  const node = new Graphics()
  const radius = size

  if (renderable.shape === "circle") {
    node.circle(0, 0, radius)
  } else if (renderable.shape === "square") {
    node.roundRect(-radius, -radius, radius * 2, radius * 2, radius * 0.5)
  } else if (renderable.shape === "spike") {
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8 - Math.PI / 2
      const pointRadius = index % 2 === 0 ? radius * 1.34 : radius * 0.5
      const x = Math.cos(angle) * pointRadius
      const y = Math.sin(angle) * pointRadius
      if (index === 0) {
        node.moveTo(x, y)
      } else {
        node.lineTo(x, y)
      }
    }
    node.closePath()
  } else if (renderable.shape === "triangle") {
    node.moveTo(0, -radius * 1.2)
    node.lineTo(radius * 1.1, radius * 0.95)
    node.lineTo(-radius * 1.1, radius * 0.95)
    node.closePath()
  } else {
    node.moveTo(0, -radius * 1.2)
    node.lineTo(radius * 1.1, 0)
    node.lineTo(0, radius * 1.2)
    node.lineTo(-radius * 1.1, 0)
    node.closePath()
  }

  node.fill(renderable.color)
  node.stroke({
    color: renderable.accent,
    width: Math.max(2, radius * 0.22),
    alpha: 0.95
  })
  node.alpha = renderable.alpha
  return node
}

export const makeFoodNode = (renderable: { color: number; accent: number; alpha: number }): Graphics => {
  const node = new Graphics()
  node.circle(0, 0, 4)
  node.fill(renderable.color)
  node.stroke({
    color: renderable.accent,
    width: 2,
    alpha: 0.9
  })
  node.alpha = renderable.alpha
  return node
}

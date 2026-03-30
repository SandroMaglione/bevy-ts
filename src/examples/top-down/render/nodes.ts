import { Container, Graphics, Sprite, Texture } from "pixi.js"

import type {
  CurrentPlayerFrameValue,
  PlayerFrameAtlas,
  RenderNode,
  TopDownHostValue
} from "../types.ts"

const createPlayerNode = (
  renderable: {
    width: number
    height: number
  },
  texture: Texture
): Sprite => {
  const sprite = new Sprite(texture)
  sprite.anchor.set(0.5)
  sprite.width = renderable.width
  sprite.height = renderable.height
  return sprite
}

const createWallNode = (renderable: {
  width: number
  height: number
  color: number
  accent: number
}): Container => {
  const node = new Container()

  const body = new Graphics()
  body.roundRect(
    -renderable.width * 0.5,
    -renderable.height * 0.5,
    renderable.width,
    renderable.height,
    18
  )
  body.fill(renderable.color)
  body.stroke({
    color: renderable.accent,
    width: 2,
    alpha: 0.45
  })

  const inset = new Graphics()
  inset.roundRect(
    -renderable.width * 0.5 + 10,
    -renderable.height * 0.5 + 10,
    Math.max(renderable.width - 20, 0),
    Math.max(renderable.height - 20, 0),
    12
  )
  inset.stroke({
    color: 0x10181f,
    width: 2,
    alpha: 0.42
  })

  node.addChild(body)
  node.addChild(inset)
  return node
}

const createPickupNode = (renderable: {
  width: number
  height: number
  color: number
  accent: number
}): Container => {
  const node = new Container()

  const glow = new Graphics()
  glow.circle(0, 0, renderable.width * 0.82)
  glow.fill({
    color: renderable.color,
    alpha: 0.14
  })

  const crystal = new Graphics()
  crystal.moveTo(0, -renderable.height * 0.5)
  crystal.lineTo(renderable.width * 0.42, 0)
  crystal.lineTo(0, renderable.height * 0.5)
  crystal.lineTo(-renderable.width * 0.42, 0)
  crystal.closePath()
  crystal.fill(renderable.color)
  crystal.stroke({
    color: renderable.accent,
    width: 2
  })

  node.addChild(glow)
  node.addChild(crystal)
  return node
}

export const textureForCurrentFrame = (
  frames: PlayerFrameAtlas,
  frame: CurrentPlayerFrameValue
): Texture => {
  const facing =
    frame.row === 1 ? "Down"
    : frame.row === 2 ? "Left"
    : frame.row === 3 ? "Right"
    : "Up"
  return frames[facing][frame.column - 1]!
}

export const destroyRenderNode = (renderNode: RenderNode): void => {
  renderNode.node.destroy({
    children: true
  })
}

export const ensureNode = (
  host: TopDownHostValue,
  entityId: number,
  renderable: {
    kind: "player" | "wall" | "pickup"
    width: number
    height: number
    color: number
    accent: number
  },
  frame: CurrentPlayerFrameValue
): RenderNode => {
  const existing = host.nodes.get(entityId)
  if (existing) {
    return existing
  }

  const node =
    renderable.kind === "player"
      ? {
          kind: "player" as const,
          node: createPlayerNode(renderable, textureForCurrentFrame(host.playerFrames, frame))
        }
    : renderable.kind === "wall"
      ? {
          kind: "wall" as const,
          node: createWallNode(renderable)
        }
      : {
          kind: "pickup" as const,
          node: createPickupNode(renderable)
        }

  host.actorLayer.addChild(node.node)
  host.nodes.set(entityId, node)
  return node
}

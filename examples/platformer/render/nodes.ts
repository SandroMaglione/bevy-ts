import { Container, Graphics } from "pixi.js"

import type { PlatformerHostValue, RenderNode } from "../types.ts"

type AnyRenderable = {
  kind: "player" | "ground" | "block" | "pipe"
  width: number
  height: number
  color: number
  accent: number
}

type SolidRenderable = {
  kind: "ground" | "block" | "pipe"
  width: number
  height: number
  color: number
  accent: number
}

const createPlayerNode = (renderable: {
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
    12
  )
  body.fill(renderable.color)
  body.stroke({
    color: 0x3c1c1b,
    width: 3
  })

  const cap = new Graphics()
  cap.roundRect(
    -renderable.width * 0.5,
    -renderable.height * 0.5,
    renderable.width,
    renderable.height * 0.28,
    10
  )
  cap.fill(renderable.accent)

  const eyes = new Graphics()
  eyes.circle(-8, -6, 3)
  eyes.circle(8, -6, 3)
  eyes.fill(0x16202b)

  node.addChild(body)
  node.addChild(cap)
  node.addChild(eyes)
  return node
}

const createSolidNode = (renderable: {
  kind: "ground" | "block" | "pipe"
  width: number
  height: number
  color: number
  accent: number
}): Container => {
  const node = new Container()
  const body = new Graphics()

  if (renderable.kind === "pipe") {
    body.roundRect(
      -renderable.width * 0.5,
      -renderable.height * 0.5,
      renderable.width,
      renderable.height,
      10
    )
    body.fill(renderable.color)
    body.stroke({
      color: renderable.accent,
      width: 3,
      alpha: 0.55
    })

    const lip = new Graphics()
    lip.roundRect(
      -renderable.width * 0.5 - 10,
      -renderable.height * 0.5,
      renderable.width + 20,
      28,
      10
    )
    lip.fill(0x34a66d)
    lip.stroke({
      color: renderable.accent,
      width: 3
    })

    node.addChild(body)
    node.addChild(lip)
    return node
  }

  body.roundRect(
    -renderable.width * 0.5,
    -renderable.height * 0.5,
    renderable.width,
    renderable.height,
    renderable.kind === "ground" ? 14 : 8
  )
  body.fill(renderable.color)
  body.stroke({
    color: renderable.accent,
    width: 2.5,
    alpha: 0.48
  })

  const trim = new Graphics()
  trim.rect(
    -renderable.width * 0.5 + 10,
    -renderable.height * 0.5 + 10,
    Math.max(renderable.width - 20, 0),
    Math.max(renderable.height - 20, 0)
  )
  trim.stroke({
    color: 0x4b2b1e,
    width: 2,
    alpha: 0.28
  })

  node.addChild(body)
  node.addChild(trim)
  return node
}

export const destroyRenderNode = (renderNode: RenderNode): void => {
  renderNode.node.destroy({
    children: true
  })
}

export const ensureNode = (
  host: PlatformerHostValue,
  entityId: number,
  renderable: AnyRenderable
): RenderNode => {
  const existing = host.nodes.get(entityId)
  if (existing) {
    return existing
  }

  if (renderable.kind === "player") {
    const node = {
      kind: "player" as const,
      node: createPlayerNode(renderable)
    }

    host.actorLayer.addChild(node.node)
    host.nodes.set(entityId, node)
    return node
  }

  const solidRenderable: SolidRenderable = {
    kind: renderable.kind,
    width: renderable.width,
    height: renderable.height,
    color: renderable.color,
    accent: renderable.accent
  }

  const node = {
    kind: solidRenderable.kind,
    node: createSolidNode(solidRenderable)
  }

  host.actorLayer.addChild(node.node)
  host.nodes.set(entityId, node)
  return node
}

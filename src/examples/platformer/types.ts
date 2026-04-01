import type { Application, Container } from "pixi.js"

export type Vector2 = {
  x: number
  y: number
}

export type InputStateValue = {
  left: boolean
  right: boolean
  jumpPressed: boolean
  jumpJustPressed: boolean
  runPressed: boolean
  restartJustPressed: boolean
}

export type PlayerContactsValue = {
  grounded: boolean
  hitCeiling: boolean
  blockedLeft: boolean
  blockedRight: boolean
}

export type HudRefs = {
  prompt: HTMLElement
  stats: HTMLElement
  hint: HTMLElement
  overlay: HTMLElement
  overlayTitle: HTMLElement
  overlaySubtitle: HTMLElement
  overlayHint: HTMLElement
}

export type RenderNode = {
  kind: "player" | "ground" | "block" | "pipe"
  node: Container
}

export type PlatformerHostValue = {
  application: Application
  world: Container
  actorLayer: Container
  nodes: Map<number, RenderNode>
  hud: HudRefs
  clock: {
    deltaSeconds: number
  }
}

export type PlatformerInputManager = {
  readonly snapshot: () => InputStateValue
}

export type CollisionBody = {
  position: Vector2
  collider: {
    width: number
    height: number
  }
}

export type HorizontalCollisionResult = {
  nextX: number
  blockedLeft: boolean
  blockedRight: boolean
}

export type VerticalCollisionResult = {
  nextY: number
  grounded: boolean
  hitCeiling: boolean
}

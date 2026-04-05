import type { Application, Container } from "pixi.js"
import type * as Scalar from "../../src/Scalar.ts"
import type * as Size2Value from "../../src/Size2.ts"
import type * as Vector2Value from "../../src/Vector2.ts"

export type Vector2 = Vector2Value.Vector2
export type Size2 = Size2Value.Size2

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
  collider: Size2
}

export type HorizontalCollisionResult = {
  nextX: Scalar.Finite
  blockedLeft: boolean
  blockedRight: boolean
}

export type VerticalCollisionResult = {
  nextY: Scalar.Finite
  grounded: boolean
  hitCeiling: boolean
}

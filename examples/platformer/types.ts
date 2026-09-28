import type { NodeRegistry } from "@typeonce/bevy-ts-pixi"
import type { Application, Container } from "pixi.js"
import type * as Scalar from "@typeonce/bevy-ts-math/Scalar"
import type * as Size2Value from "@typeonce/bevy-ts-math/Size2"
import type * as Vector2Value from "@typeonce/bevy-ts-math/Vector2"

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

export type PlatformerHostValue = {
  application: Application
  world: Container
  actorLayer: Container
  nodes: NodeRegistry.NodeRegistry<Container>
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

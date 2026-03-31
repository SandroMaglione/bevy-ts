import type { Application, Container, Sprite, Texture } from "pixi.js"

export type Vector2 = { x: number; y: number }
export type FacingValue = "Down" | "Left" | "Right" | "Up"
export type LocomotionValue = "Idle" | "Walking"
export type AnimationFrameIndex = 0 | 1 | 2 | 3 | 4 | 5
export type CurrentPlayerFrameValue = {
  row: 1 | 2 | 3 | 4
  column: 1 | 2 | 3 | 4 | 5 | 6
}
export type AnimationClockValue = {
  frameIndex: AnimationFrameIndex
  elapsed: number
}
export type InputStateValue = {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  interactPressed: boolean
  interactJustPressed: boolean
}
export type HudRefs = {
  prompt: HTMLElement
  stats: HTMLElement
  hint: HTMLElement
}
export type PlayerSpriteNode = {
  kind: "player"
  node: Sprite
}
export type StaticNode = {
  kind: "wall" | "pickup"
  node: Container
}
export type RenderNode = PlayerSpriteNode | StaticNode
export type PlayerFrameAtlas = Readonly<Record<FacingValue, readonly [
  Texture,
  Texture,
  Texture,
  Texture,
  Texture,
  Texture
]>>
export type TopDownHostValue = {
  application: Application
  world: Container
  actorLayer: Container
  nodes: Map<number, RenderNode>
  playerFrames: PlayerFrameAtlas
  hud: HudRefs
  clock: {
    deltaSeconds: number
  }
}

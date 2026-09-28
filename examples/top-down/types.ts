import type { Keyboard } from "@bevy-ts/browser"
import type { NodeRegistry } from "@bevy-ts/pixi"
import type { Application, Container, Sprite, Texture } from "pixi.js"
import type * as Size2Value from "@bevy-ts/math/Size2"
import type * as Vector2Value from "@bevy-ts/math/Vector2"

export type Vector2 = Vector2Value.Vector2
export type Size2 = Size2Value.Size2
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
export const inputBindings = {
  up: ["ArrowUp", "w"],
  down: ["ArrowDown", "s"],
  left: ["ArrowLeft", "a"],
  right: ["ArrowRight", "d"],
  interact: ["e", " "]
} as const
export type InputStateValue = Keyboard.Snapshot<typeof inputBindings>
export type KeyboardInput = Keyboard.Actions<typeof inputBindings>
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
/**
 * What one fixed update needs from the host: the step length and the
 * current viewport size. The browser reads them from Pixi; a headless
 * simulation passes constants.
 */
export type FrameContextValue = {
  readonly deltaSeconds: number
  readonly viewport: {
    readonly width: number
    readonly height: number
  }
}
export type TopDownHostValue = {
  application: Application
  world: Container
  actorLayer: Container
  nodes: NodeRegistry.NodeRegistry<RenderNode>
  playerFrames: PlayerFrameAtlas
  hud: HudRefs
  clock: {
    deltaSeconds: number
  }
}

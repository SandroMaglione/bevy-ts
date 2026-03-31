import type { Application, Container, Graphics } from "pixi.js"

export type Vector = {
  x: number
  y: number
}

export type NoticeValue = {
  text: string
  ttl: number
}

export type ActorKind = "player" | "pickup"

export type StateMachineHud = {
  readonly scrim: HTMLDivElement
  readonly overlay: HTMLDivElement
  readonly title: HTMLHeadingElement
  readonly subtitle: HTMLParagraphElement
  readonly score: HTMLSpanElement
  readonly timer: HTMLSpanElement
  readonly footer: HTMLParagraphElement
  readonly notice: HTMLParagraphElement
}

export type BrowserHostValue = {
  readonly application: Application
  readonly scene: Container
  readonly nodes: Map<number, Graphics>
  readonly clock: {
    deltaSeconds: number
  }
  readonly ui: StateMachineHud
}

export type StateMachineInputManager = {
  readonly movement: () => Vector
  readonly consumeStart: () => boolean
  readonly consumePause: () => boolean
}

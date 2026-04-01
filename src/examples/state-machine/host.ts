import { Application, Container, Graphics } from "pixi.js"
import * as InputAxis from "../../InputAxis.ts"

import {
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  STAGE_HEIGHT,
  STAGE_WIDTH
} from "./constants.ts"
import type {
  ActorKind,
  BrowserHostValue,
  StateMachineHud,
  StateMachineInputManager,
  Vector
} from "./types.ts"

const createBoard = (width: number, height: number): Graphics => {
  const board = new Graphics()
  board.roundRect(0, 0, width, height, 22)
  board.fill(0x0f151c)

  for (let x = 0; x <= width; x += 32) {
    board.moveTo(x, 0)
    board.lineTo(x, height)
  }

  for (let y = 0; y <= height; y += 32) {
    board.moveTo(0, y)
    board.lineTo(width, y)
  }

  board.stroke({
    color: 0x24303b,
    width: 1
  })
  board.roundRect(0, 0, width, height, 22)
  board.stroke({
    color: 0x5bc0be,
    width: 2,
    alpha: 0.55
  })
  return board
}

export const createActorNode = (kind: ActorKind): Graphics => {
  const node = new Graphics()

  if (kind === "player") {
    node.circle(0, 0, PLAYER_RADIUS)
    node.fill(0xf7c948)
    node.stroke({
      color: 0xffefb8,
      width: 3
    })
    return node
  }

  node.moveTo(0, -PICKUP_RADIUS)
  node.lineTo(PICKUP_RADIUS, 0)
  node.lineTo(0, PICKUP_RADIUS)
  node.lineTo(-PICKUP_RADIUS, 0)
  node.closePath()
  node.fill(0x5bc0be)
  node.stroke({
    color: 0xbff7f2,
    width: 2
  })
  return node
}

const makeHud = () => {
  const root = document.createElement("div")
  root.style.position = "absolute"
  root.style.inset = "0"
  root.style.display = "grid"
  root.style.gridTemplateRows = "auto 1fr auto"
  root.style.pointerEvents = "none"

  const topBar = document.createElement("div")
  topBar.style.display = "flex"
  topBar.style.justifyContent = "space-between"
  topBar.style.gap = "12px"
  topBar.style.padding = "16px 18px 0"

  const score = document.createElement("span")
  score.style.padding = "8px 12px"
  score.style.borderRadius = "999px"
  score.style.background = "rgba(7, 12, 16, 0.72)"
  score.style.border = "1px solid rgba(255,255,255,0.08)"
  score.style.fontFamily = "\"IBM Plex Mono\", monospace"
  score.style.fontSize = "12px"
  score.style.letterSpacing = "0.08em"
  score.style.textTransform = "uppercase"

  const timer = score.cloneNode() as HTMLSpanElement
  topBar.append(score, timer)

  const center = document.createElement("div")
  center.style.position = "relative"
  center.style.display = "grid"
  center.style.placeItems = "center"
  center.style.padding = "22px"

  const scrim = document.createElement("div")
  scrim.style.position = "absolute"
  scrim.style.inset = "0"
  scrim.style.background = "linear-gradient(180deg, rgba(6, 9, 12, 0.2), rgba(6, 9, 12, 0.62))"
  scrim.style.opacity = "0"
  scrim.style.transition = "opacity 140ms ease"

  const overlay = document.createElement("div")
  overlay.style.position = "relative"
  overlay.style.display = "grid"
  overlay.style.gap = "10px"
  overlay.style.justifyItems = "center"
  overlay.style.textAlign = "center"
  overlay.style.maxWidth = "420px"
  overlay.style.padding = "20px 24px"
  overlay.style.borderRadius = "22px"
  overlay.style.background = "rgba(8, 12, 16, 0.52)"
  overlay.style.border = "1px solid rgba(255,255,255,0.08)"
  overlay.style.backdropFilter = "blur(8px)"
  overlay.style.opacity = "1"
  overlay.style.transition = "opacity 140ms ease"

  const title = document.createElement("h2")
  title.style.margin = "0"
  title.style.fontSize = "42px"
  title.style.lineHeight = "0.96"
  title.style.letterSpacing = "-0.04em"

  const subtitle = document.createElement("p")
  subtitle.style.margin = "0"
  subtitle.style.color = "#bfd0dc"
  subtitle.style.fontSize = "15px"
  subtitle.style.lineHeight = "1.55"

  overlay.append(title, subtitle)
  center.append(scrim, overlay)

  const footer = document.createElement("p")
  footer.style.margin = "0"
  footer.style.padding = "0 18px 18px"
  footer.style.color = "#9ab0bf"
  footer.style.fontSize = "13px"
  footer.style.letterSpacing = "0.02em"

  const notice = document.createElement("p")
  notice.style.margin = "0"
  notice.style.padding = "0 18px 18px"
  notice.style.color = "#f7c948"
  notice.style.fontFamily = "\"IBM Plex Mono\", monospace"
  notice.style.fontSize = "13px"
  notice.style.letterSpacing = "0.06em"
  notice.style.textTransform = "uppercase"

  const bottom = document.createElement("div")
  bottom.style.display = "grid"
  bottom.style.gap = "8px"
  bottom.append(notice, footer)

  root.append(topBar, center, bottom)

  return {
    root,
    ui: {
      scrim,
      overlay,
      title,
      subtitle,
      score,
      timer,
      footer,
      notice
    } satisfies StateMachineHud
  }
}

const normalizeMovement = (keys: Set<string>): Vector => {
  return InputAxis.vectorFromAxisValues(
    InputAxis.axis(
      keys.has("ArrowLeft") || keys.has("a") || keys.has("A"),
      keys.has("ArrowRight") || keys.has("d") || keys.has("D")
    ),
    InputAxis.axis(
      keys.has("ArrowUp") || keys.has("w") || keys.has("W"),
      keys.has("ArrowDown") || keys.has("s") || keys.has("S")
    )
  )
}

export const createStateMachineBrowserHost = async (mount: HTMLElement) => {
  const application = new Application()
  await application.init({
    antialias: true,
    background: "#0b1117",
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT
  })

  const wrapper = document.createElement("section")
  wrapper.className = "pixi-example-shell"
  wrapper.style.position = "relative"
  wrapper.style.overflow = "hidden"
  wrapper.style.borderRadius = "24px"
  wrapper.style.minHeight = `${STAGE_HEIGHT}px`
  wrapper.appendChild(application.canvas)

  const { root, ui } = makeHud()
  wrapper.appendChild(root)
  mount.replaceChildren(wrapper)

  application.canvas.style.display = "block"

  const scene = new Container()
  application.stage.addChild(createBoard(STAGE_WIDTH, STAGE_HEIGHT))
  application.stage.addChild(scene)

  const pressedKeys = new Set<string>()
  let startQueued = false
  let pauseQueued = false

  const onKeyDown = (event: KeyboardEvent) => {
    pressedKeys.add(event.key)

    if (event.key === "Enter") {
      startQueued = true
      event.preventDefault()
      return
    }

    if (event.key === "p" || event.key === "P") {
      pauseQueued = true
      event.preventDefault()
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(event.key)
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)

  const host: BrowserHostValue = {
    application,
    scene,
    nodes: new Map<number, Graphics>(),
    clock: {
      deltaSeconds: 1 / 60
    },
    ui
  }

  const inputManager: StateMachineInputManager = {
    movement() {
      return normalizeMovement(pressedKeys)
    },
    consumeStart() {
      const next = startQueued
      startQueued = false
      return next
    },
    consumePause() {
      const next = pauseQueued
      pauseQueued = false
      return next
    }
  }

  return {
    host,
    inputManager,
    async destroy() {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      for (const node of host.nodes.values()) {
        node.destroy()
      }
      host.nodes.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

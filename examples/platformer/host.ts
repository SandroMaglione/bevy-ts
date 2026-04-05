import { Application, Container } from "pixi.js"

import { createHud } from "./render/hud.ts"
import { createWorldBackdrop } from "./render/backdrop.ts"
import { destroyRenderNode } from "./render/nodes.ts"
import type { InputStateValue, PlatformerHostValue } from "./types.ts"

const normalizeKey = (key: string): string => {
  if (key.length === 1) {
    return key.toLowerCase()
  }

  return key
}

export type PlatformerBrowserHost = {
  readonly host: PlatformerHostValue
  readonly inputManager: {
    readonly snapshot: () => InputStateValue
  }
  destroy(): Promise<void>
}

export const createPlatformerBrowserHost = async (
  mount: HTMLElement
): Promise<PlatformerBrowserHost> => {
  const application = new Application()
  await application.init({
    antialias: true,
    backgroundAlpha: 0,
    resizeTo: mount
  })

  const shell = document.createElement("section")
  shell.className = "platformer-shell"

  const viewport = document.createElement("div")
  viewport.className = "platformer-shell__viewport"
  viewport.appendChild(application.canvas)

  const hud = createHud()
  shell.appendChild(viewport)
  shell.appendChild(hud.root)
  mount.replaceChildren(shell)

  const world = new Container()
  const actorLayer = new Container()
  world.addChild(createWorldBackdrop())
  world.addChild(actorLayer)
  application.stage.addChild(world)

  const pressedKeys = new Set<string>()
  let previousJumpPressed = false
  let restartQueued = false

  const onKeyDown = (event: KeyboardEvent) => {
    const key = normalizeKey(event.key)
    if (
      key === " " ||
      key === "ArrowUp" ||
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "w" ||
      key === "a" ||
      key === "d" ||
      key === "Shift" ||
      key === "Enter"
    ) {
      event.preventDefault()
    }

    if (key === "Enter") {
      restartQueued = true
      return
    }

    pressedKeys.add(key)
  }

  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(normalizeKey(event.key))
  }

  const onPointerDown = () => {
    restartQueued = true
  }

  const clearInput = () => {
    pressedKeys.clear()
    previousJumpPressed = false
    restartQueued = false
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("pointerdown", onPointerDown)
  window.addEventListener("blur", clearInput)

  const host: PlatformerHostValue = {
    application,
    world,
    actorLayer,
    nodes: new Map(),
    hud: hud.refs,
    clock: {
      deltaSeconds: 1 / 60
    }
  }

  return {
    host,
    inputManager: {
      snapshot() {
        const jumpPressed =
          pressedKeys.has(" ") ||
          pressedKeys.has("ArrowUp") ||
          pressedKeys.has("w")

        const nextState: InputStateValue = {
          left: pressedKeys.has("ArrowLeft") || pressedKeys.has("a"),
          right: pressedKeys.has("ArrowRight") || pressedKeys.has("d"),
          jumpPressed,
          jumpJustPressed: jumpPressed && !previousJumpPressed,
          runPressed: pressedKeys.has("Shift"),
          restartJustPressed: restartQueued
        }

        previousJumpPressed = jumpPressed
        restartQueued = false
        return nextState
      }
    },
    async destroy() {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("blur", clearInput)

      for (const renderNode of host.nodes.values()) {
        destroyRenderNode(renderNode)
      }

      host.nodes.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

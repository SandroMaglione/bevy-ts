import { Application, Assets, Container, Texture } from "pixi.js"

import { PLAYER_SHEET_URL } from "./constants.ts"
import { createWorldBackdrop } from "./render/backdrop.ts"
import { createHud } from "./render/hud.ts"
import { destroyRenderNode } from "./render/nodes.ts"
import { createPlayerFrameAtlas } from "./render/player-sheet.ts"
import type { InputStateValue, RenderNode, TopDownHostValue } from "./types.ts"

const normalizeKey = (key: string): string => {
  if (key.length === 1) {
    return key.toLowerCase()
  }

  return key
}

export type TopDownBrowserHost = {
  readonly host: TopDownHostValue
  readonly inputManager: {
    readonly snapshot: () => InputStateValue
  }
  destroy(): Promise<void>
}

export const createTopDownBrowserHost = async (
  mount: HTMLElement
): Promise<TopDownBrowserHost> => {
  const [application, playerSheet] = await Promise.all([
    (async () => {
      const app = new Application()
      await app.init({
        antialias: true,
        backgroundAlpha: 0,
        resizeTo: mount
      })
      return app
    })(),
    Assets.load<Texture>(PLAYER_SHEET_URL)
  ])

  const shell = document.createElement("section")
  shell.className = "top-down-shell"

  const viewport = document.createElement("div")
  viewport.className = "top-down-shell__viewport"
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
  let previousInteractPressed = false

  const onKeyDown = (event: KeyboardEvent) => {
    const key = normalizeKey(event.key)

    if (
      key === " " ||
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "w" ||
      key === "a" ||
      key === "s" ||
      key === "d" ||
      key === "e"
    ) {
      event.preventDefault()
    }

    pressedKeys.add(key)
  }

  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(normalizeKey(event.key))
  }

  const clearKeys = () => {
    pressedKeys.clear()
    previousInteractPressed = false
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("blur", clearKeys)

  const host: TopDownHostValue = {
    application,
    world,
    actorLayer,
    nodes: new Map<number, RenderNode>(),
    playerFrames: createPlayerFrameAtlas(playerSheet),
    hud: hud.refs,
    clock: {
      deltaSeconds: 1 / 60
    }
  }

  return {
    host,
    inputManager: {
      snapshot() {
        const interactPressed = pressedKeys.has("e") || pressedKeys.has(" ")
        const nextState = {
          up: pressedKeys.has("ArrowUp") || pressedKeys.has("w"),
          down: pressedKeys.has("ArrowDown") || pressedKeys.has("s"),
          left: pressedKeys.has("ArrowLeft") || pressedKeys.has("a"),
          right: pressedKeys.has("ArrowRight") || pressedKeys.has("d"),
          interactPressed,
          interactJustPressed: interactPressed && !previousInteractPressed
        }

        previousInteractPressed = interactPressed
        return nextState
      }
    },
    async destroy() {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", clearKeys)

      for (const renderNode of host.nodes.values()) {
        destroyRenderNode(renderNode)
      }

      host.nodes.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

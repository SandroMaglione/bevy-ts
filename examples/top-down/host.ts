import { Keyboard } from "@bevy-ts/browser"
import { Application, Assets, Container, Texture } from "pixi.js"

import { PLAYER_SHEET_URL } from "./constants.ts"
import { createWorldBackdrop } from "./render/backdrop.ts"
import { createHud } from "./render/hud.ts"
import { destroyRenderNode } from "./render/nodes.ts"
import { createPlayerFrameAtlas } from "./render/player-sheet.ts"
import type { InputStateValue, RenderNode, TopDownHostValue } from "./types.ts"

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

  const keyboard = Keyboard.actions(window, {
    up: ["ArrowUp", "w"],
    down: ["ArrowDown", "s"],
    left: ["ArrowLeft", "a"],
    right: ["ArrowRight", "d"],
    interact: ["e", " "]
  })

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
        const input = keyboard.snapshot()
        return {
          up: input.up.held,
          down: input.down.held,
          left: input.left.held,
          right: input.right.held,
          interactPressed: input.interact.held,
          interactJustPressed: input.interact.pressed
        }
      }
    },
    async destroy() {
      keyboard.dispose()

      for (const renderNode of host.nodes.values()) {
        destroyRenderNode(renderNode)
      }

      host.nodes.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

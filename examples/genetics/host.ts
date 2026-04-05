import { Application, Container, Graphics } from "pixi.js"

import { drawBoard } from "./render/board.ts"
import { createHud } from "./render/hud.ts"
import type { BrowserHostValue } from "./types.ts"

export type GeneticsBrowserHost = {
  readonly host: BrowserHostValue
  destroy(): Promise<void>
}

export const createGeneticsBrowserHost = async (
  mount: HTMLElement
): Promise<GeneticsBrowserHost> => {
  const application = new Application()

  const shell = document.createElement("section")
  shell.className = "genetics-shell"

  const viewport = document.createElement("div")
  viewport.className = "genetics-shell__viewport"
  shell.appendChild(viewport)

  await application.init({
    antialias: true,
    backgroundAlpha: 0,
    resizeTo: viewport
  })

  viewport.appendChild(application.canvas)

  const board = new Graphics()
  const scene = new Container()
  application.stage.addChild(board)
  application.stage.addChild(scene)

  const syncBoard = () => {
    drawBoard(board, application.screen.width, application.screen.height)
  }

  const resizeObserver = new ResizeObserver(() => {
    syncBoard()
  })

  resizeObserver.observe(viewport)
  syncBoard()

  const { root, hud } = createHud()
  shell.appendChild(root)
  mount.replaceChildren(shell)

  return {
    host: {
      application,
      scene,
      nodes: new Map<number, Graphics>(),
      clock: {
        deltaSeconds: 1 / 60
      },
      hud
    },
    async destroy() {
      resizeObserver.disconnect()
      for (const node of scene.children) {
        if (node instanceof Graphics) {
          node.destroy()
        }
      }
      board.destroy()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

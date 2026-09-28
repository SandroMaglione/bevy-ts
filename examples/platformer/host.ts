import { Keyboard } from "@typeonce/bevy-ts-browser"
import { NodeRegistry } from "@typeonce/bevy-ts-pixi"
import { Application, Container } from "pixi.js"

import { createHud } from "./render/hud.ts"
import { createWorldBackdrop } from "./render/backdrop.ts"
import type { InputStateValue, PlatformerHostValue } from "./types.ts"

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

  const keyboard = Keyboard.actions(window, {
    left: ["ArrowLeft", "a"],
    right: ["ArrowRight", "d"],
    jump: [" ", "ArrowUp", "w"],
    run: ["Shift"],
    restart: ["Enter"]
  })
  let pointerRestartQueued = false
  const onPointerDown = () => {
    pointerRestartQueued = true
  }
  window.addEventListener("pointerdown", onPointerDown)

  const host: PlatformerHostValue = {
    application,
    world,
    actorLayer,
    nodes: NodeRegistry.inContainer(actorLayer),
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
        const nextState: InputStateValue = {
          left: input.left.held,
          right: input.right.held,
          jumpPressed: input.jump.held,
          jumpJustPressed: input.jump.pressed,
          runPressed: input.run.held,
          restartJustPressed: input.restart.pressed || pointerRestartQueued
        }
        pointerRestartQueued = false
        return nextState
      }
    },
    async destroy() {
      keyboard.dispose()
      window.removeEventListener("pointerdown", onPointerDown)

      host.nodes.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

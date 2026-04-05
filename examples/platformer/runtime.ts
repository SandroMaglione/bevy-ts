import * as Result from "../../src/Result.ts"
import { levelBounds } from "./content.ts"
import { Camera, DeltaTime, Game, InputManager, InputState, LoseMessage, PlatformerHost, PlayerContacts, SessionState, Viewport } from "./schema.ts"
import type { InputStateValue, PlatformerHostValue, PlatformerInputManager, PlayerContactsValue } from "./types.ts"

export const makeEmptyInputState = (): InputStateValue => ({
  left: false,
  right: false,
  jumpPressed: false,
  jumpJustPressed: false,
  runPressed: false,
  restartJustPressed: false
})

export const makeInitialPlayerContacts = (): PlayerContactsValue => ({
  grounded: false,
  hitCeiling: false,
  blockedLeft: false,
  blockedRight: false
})

const makeRuntime = (
  host: PlatformerHostValue,
  inputManager: PlatformerInputManager
) =>
  Game.Runtime.makeConstructed({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, inputManager),
      Game.Runtime.service(PlatformerHost, host)
    ),
    resources: {
      DeltaTime: host.clock.deltaSeconds,
      Viewport: {
        width: host.application.screen.width,
        height: host.application.screen.height
      },
      Camera: {
        x: Math.min(host.application.screen.width * 0.5, levelBounds.width * 0.5),
        y: Math.min(host.application.screen.height * 0.5, levelBounds.height * 0.5)
      },
      InputState: makeEmptyInputState(),
      PlayerContacts: makeInitialPlayerContacts(),
      LoseMessage: "You fell into a hole."
    },
    machines: Game.Runtime.machines(
      Game.Runtime.machine(SessionState, "Playing")
    )
  })

export const createPlatformerRuntime = (
  host: PlatformerHostValue,
  inputManager: PlatformerInputManager
) =>
  Result.match(makeRuntime(host, inputManager), {
    onSuccess: Result.success,
    onFailure: (error) =>
      Result.failure({
        message: error.resources.Viewport
          ? "Invalid platformer viewport."
          : error.resources.Camera
            ? "Invalid platformer camera."
            : "Invalid platformer runtime resources."
      })
  })

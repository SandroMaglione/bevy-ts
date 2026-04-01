import * as Result from "../../Result.ts"
import * as Size2 from "../../Size2.ts"
import * as Vector2 from "../../Vector2.ts"
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
  Game.Runtime.makeResult({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, inputManager),
      Game.Runtime.service(PlatformerHost, host)
    ),
    resources: {
      DeltaTime: Result.success(host.clock.deltaSeconds),
      Viewport: Size2.result({
        width: host.application.screen.width,
        height: host.application.screen.height
      }),
      Camera: Vector2.result({
        x: Math.min(host.application.screen.width * 0.5, levelBounds.width * 0.5),
        y: Math.min(host.application.screen.height * 0.5, levelBounds.height * 0.5)
      }),
      InputState: Result.success(makeEmptyInputState()),
      PlayerContacts: Result.success(makeInitialPlayerContacts()),
      LoseMessage: Result.success("You fell into a hole.")
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
          : "Invalid platformer camera."
      })
  })

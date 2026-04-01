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

export const createPlatformerRuntime = (
  host: PlatformerHostValue,
  inputManager: PlatformerInputManager
) =>
  Game.Runtime.make({
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

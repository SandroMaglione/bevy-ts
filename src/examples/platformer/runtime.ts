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
  inputManager: PlatformerInputManager,
  viewport: Size2.Size2,
  camera: Vector2.Vector2
) =>
  Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, inputManager),
      Game.Runtime.service(PlatformerHost, host)
    ),
    resources: {
      DeltaTime: host.clock.deltaSeconds,
      Viewport: viewport,
      Camera: camera,
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
): Result.Result<ReturnType<typeof makeRuntime>, { readonly message: string }> => {
  const viewport = Size2.result({
    width: host.application.screen.width,
    height: host.application.screen.height
  })
  if (!viewport.ok) {
    return Result.failure({
      message: "Invalid platformer viewport."
    })
  }

  const camera = Vector2.result({
    x: Math.min(host.application.screen.width * 0.5, levelBounds.width * 0.5),
    y: Math.min(host.application.screen.height * 0.5, levelBounds.height * 0.5)
  })
  if (!camera.ok) {
    return Result.failure({
      message: "Invalid platformer camera."
    })
  }

  return Result.success(makeRuntime(host, inputManager, viewport.value, camera.value))
}

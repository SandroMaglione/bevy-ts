import { Fx } from "../../../src/index.ts"
import {
  DeltaTime,
  Game,
  InputManager,
  InputState,
  TopDownHost,
  Viewport
} from "../schema.ts"

export const CaptureFrameContextSystem = Game.System(
  "TopDown/CaptureFrameContext",
  {
    resources: {
      deltaTime: Game.System.writeResource(DeltaTime),
      viewport: Game.System.writeResource(Viewport),
      input: Game.System.writeResource(InputState)
    },
    services: {
      host: Game.System.service(TopDownHost),
      inputManager: Game.System.service(InputManager)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      resources.deltaTime.set(services.host.clock.deltaSeconds)
      resources.viewport.setRaw({
        width: services.host.application.screen.width,
        height: services.host.application.screen.height
      })
      resources.input.set(services.inputManager.snapshot())
    })
)

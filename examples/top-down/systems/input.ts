import { InputCapture } from "@bevy-ts/browser"
import {
  DeltaTime,
  Game,
  InputState,
  KeyboardInput,
  TopDownHost,
  Viewport
} from "../schema.ts"

export const CaptureInputSystem = InputCapture.system(Game, {
  name: "TopDown/CaptureInput",
  source: KeyboardInput,
  resource: InputState
})

export const CaptureFrameContextSystem = Game.System(
  "TopDown/CaptureFrameContext",
  {
    resources: {
      deltaTime: Game.System.writeResource(DeltaTime),
      viewport: Game.System.writeResource(Viewport)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ resources, services }) =>
    {
      resources.deltaTime.set(services.host.clock.deltaSeconds)
      resources.viewport.setRaw({
        width: services.host.application.screen.width,
        height: services.host.application.screen.height
      })
    }
)

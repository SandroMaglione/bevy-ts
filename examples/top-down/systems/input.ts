import { InputCapture } from "@typeonce/bevy-ts-browser"
import {
  DeltaTime,
  FrameContext,
  Game,
  InputState,
  KeyboardInput,
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
      frame: Game.System.service(FrameContext)
    }
  },
  ({ resources, services }) =>
    {
      resources.deltaTime.set(services.frame.deltaSeconds)
      resources.viewport.setRaw(services.frame.viewport)
    }
)

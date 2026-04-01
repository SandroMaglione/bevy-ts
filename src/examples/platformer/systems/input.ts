import { Fx } from "../../../index.ts"
import { DeltaTime, Game, InputManager, InputState, PlatformerHost, Viewport } from "../schema.ts"

export const CaptureFrameContextSystem = Game.System.define(
  "Platformer/CaptureFrameContext",
  {
    resources: {
      deltaTime: Game.System.writeResource(DeltaTime),
      viewport: Game.System.writeResource(Viewport),
      input: Game.System.writeResource(InputState)
    },
    services: {
      host: Game.System.service(PlatformerHost),
      input: Game.System.service(InputManager)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      resources.deltaTime.set(services.host.clock.deltaSeconds)
      resources.viewport.setRaw({
        width: services.host.application.screen.width,
        height: services.host.application.screen.height
      })
      resources.input.set(services.input.snapshot())
    })
)

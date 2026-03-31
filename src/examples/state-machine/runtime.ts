import {
  Arena,
  BrowserHost,
  CountdownRemaining,
  DeltaTime,
  Game,
  InputManager,
  PickupGoal,
  RoundState,
  RoundTimeRemaining,
  Score,
  SessionState,
  SpawnCursor,
  TransitionNotice
} from "./schema.ts"
import {
  COUNTDOWN_DURATION_SECONDS,
  PICKUP_GOAL,
  ROUND_DURATION_SECONDS,
  STAGE_HEIGHT,
  STAGE_WIDTH
} from "./constants.ts"
import type { BrowserHostValue, StateMachineInputManager } from "./types.ts"

export const createStateMachineRuntime = (
  host: BrowserHostValue,
  inputManager: StateMachineInputManager
) =>
  Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, inputManager),
      Game.Runtime.service(BrowserHost, host)
    ),
    resources: {
      Arena: {
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT
      },
      DeltaTime: host.clock.deltaSeconds,
      Score: 0,
      PickupGoal: PICKUP_GOAL,
      RoundTimeRemaining: ROUND_DURATION_SECONDS,
      CountdownRemaining: COUNTDOWN_DURATION_SECONDS,
      SpawnCursor: 0,
      TransitionNotice: {
        text: "",
        ttl: 0
      }
    },
    machines: Game.Runtime.machines(
      Game.Runtime.machine(SessionState, "Title"),
      Game.Runtime.machine(RoundState, "Paused")
    )
  })

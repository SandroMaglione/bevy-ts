import * as Result from "../../Result.ts"
import * as Size2 from "../../Size2.ts"
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

const makeRuntime = (
  host: BrowserHostValue,
  inputManager: StateMachineInputManager,
  arena: Size2.Size2
) =>
  Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, inputManager),
      Game.Runtime.service(BrowserHost, host)
    ),
    resources: {
      Arena: arena,
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

export const createStateMachineRuntime = (
  host: BrowserHostValue,
  inputManager: StateMachineInputManager
): Result.Result<ReturnType<typeof makeRuntime>, { readonly message: string }> => {
  const arena = Size2.result({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT
  })
  if (!arena.ok) {
    return Result.failure({
      message: "Invalid state-machine arena."
    })
  }

  return Result.success(makeRuntime(host, inputManager, arena.value))
}

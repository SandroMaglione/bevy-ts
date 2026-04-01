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
  inputManager: StateMachineInputManager
) =>
  Game.Runtime.makeResult({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, inputManager),
      Game.Runtime.service(BrowserHost, host)
    ),
    resources: {
      Arena: Size2.result({
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT
      }),
      DeltaTime: Result.success(host.clock.deltaSeconds),
      Score: Result.success(0),
      PickupGoal: Result.success(PICKUP_GOAL),
      RoundTimeRemaining: Result.success(ROUND_DURATION_SECONDS),
      CountdownRemaining: Result.success(COUNTDOWN_DURATION_SECONDS),
      SpawnCursor: Result.success(0),
      TransitionNotice: Result.success({
        text: "",
        ttl: 0
      })
    },
    machines: Game.Runtime.machines(
      Game.Runtime.machine(SessionState, "Title"),
      Game.Runtime.machine(RoundState, "Paused")
    )
  })

export const createStateMachineRuntime = (
  host: BrowserHostValue,
  inputManager: StateMachineInputManager
) =>
  Result.match(makeRuntime(host, inputManager), {
    onSuccess: Result.success,
    onFailure: () =>
      Result.failure({
        message: "Invalid state-machine arena."
      })
  })

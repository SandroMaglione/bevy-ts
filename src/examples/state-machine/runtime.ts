import * as Result from "../../Result.ts"
import { arena } from "./definitions.ts"
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
  ROUND_DURATION_SECONDS
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
      Arena: arena,
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

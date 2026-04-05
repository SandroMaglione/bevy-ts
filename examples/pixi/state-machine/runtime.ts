import * as Result from "../../../src/Result.ts"
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
) => {
  const machines = Game.Runtime.machines(
    Game.Runtime.machine(SessionState, "Title"),
    Game.Runtime.machine(RoundState, "Paused")
  )

  return Game.Runtime.makeConstructed({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, inputManager),
      Game.Runtime.service(BrowserHost, host)
    ),
    resources: {
      Arena: {
        width: host.application.screen.width,
        height: host.application.screen.height
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
    machines
  })
}

export const createStateMachineRuntime = (
  host: BrowserHostValue,
  inputManager: StateMachineInputManager
) =>
  Result.match(makeRuntime(host, inputManager), {
    onSuccess: Result.success,
    onFailure: (error) =>
      Result.failure({
        message: error.resources.Arena
          ? "Invalid state-machine arena."
          : "Invalid state-machine runtime resources."
      })
  })

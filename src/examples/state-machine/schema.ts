import { Descriptor, Schema } from "../../index.ts"
import * as Size2 from "../../Size2.ts"
import * as Vector2 from "../../Vector2.ts"
import type {
  ActorKind,
  BrowserHostValue,
  NoticeValue,
  StateMachineInputManager,
} from "./types.ts"

export const Position = Descriptor.ConstructedComponent(Vector2)("StateMachineExample/Position")
export const Actor = Descriptor.Component<{ kind: ActorKind }>()("StateMachineExample/Actor")
export const Player = Descriptor.Component<{}>()("StateMachineExample/Player")
export const Pickup = Descriptor.Component<{}>()("StateMachineExample/Pickup")

export const Arena = Descriptor.ConstructedResource(Size2)("StateMachineExample/Arena")
export const DeltaTime = Descriptor.Resource<number>()("StateMachineExample/DeltaTime")
export const Score = Descriptor.Resource<number>()("StateMachineExample/Score")
export const PickupGoal = Descriptor.Resource<number>()("StateMachineExample/PickupGoal")
export const RoundTimeRemaining = Descriptor.Resource<number>()("StateMachineExample/RoundTimeRemaining")
export const CountdownRemaining = Descriptor.Resource<number>()("StateMachineExample/CountdownRemaining")
export const SpawnCursor = Descriptor.Resource<number>()("StateMachineExample/SpawnCursor")
export const TransitionNotice = Descriptor.Resource<NoticeValue>()("StateMachineExample/TransitionNotice")

export const InputManager = Descriptor.Service<StateMachineInputManager>()("StateMachineExample/InputManager")
export const BrowserHost = Descriptor.Service<BrowserHostValue>()("StateMachineExample/BrowserHost")

export const schema = Schema.build(
  Schema.fragment({
    components: {
      Position,
      Actor,
      Player,
      Pickup
    },
    resources: {
      Arena,
      DeltaTime,
      Score,
      PickupGoal,
      RoundTimeRemaining,
      CountdownRemaining,
      SpawnCursor,
      TransitionNotice
    }
  })
)

export const Game = Schema.bind(schema)

export const SessionState = Game.StateMachine(
  "StateMachineExample/SessionState",
  ["Title", "Countdown", "Round"] as const
)

// Two smaller machines are clearer than one larger combined phase union here:
// session flow and round-local flow have different transition boundaries.
export const RoundState = Game.StateMachine(
  "StateMachineExample/RoundState",
  ["Playing", "Paused", "Victory", "Defeat"] as const
)

export const GameplayWhen = [Game.Condition.and(
  Game.Condition.inState(SessionState, "Round"),
  Game.Condition.inState(RoundState, "Playing")
)] as const

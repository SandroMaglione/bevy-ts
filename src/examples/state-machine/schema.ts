import { Descriptor, Label, Schema } from "../../index.ts"
import type {
  ActorKind,
  BrowserHostValue,
  NoticeValue,
  StateMachineInputManager,
  Vector
} from "./types.ts"

export const Position = Descriptor.defineComponent<Vector>()("StateMachineExample/Position")
export const Actor = Descriptor.defineComponent<{ kind: ActorKind }>()("StateMachineExample/Actor")
export const Player = Descriptor.defineComponent<{}>()("StateMachineExample/Player")
export const Pickup = Descriptor.defineComponent<{}>()("StateMachineExample/Pickup")

export const Arena = Descriptor.defineResource<{ width: number; height: number }>()("StateMachineExample/Arena")
export const DeltaTime = Descriptor.defineResource<number>()("StateMachineExample/DeltaTime")
export const Score = Descriptor.defineResource<number>()("StateMachineExample/Score")
export const PickupGoal = Descriptor.defineResource<number>()("StateMachineExample/PickupGoal")
export const RoundTimeRemaining = Descriptor.defineResource<number>()("StateMachineExample/RoundTimeRemaining")
export const CountdownRemaining = Descriptor.defineResource<number>()("StateMachineExample/CountdownRemaining")
export const SpawnCursor = Descriptor.defineResource<number>()("StateMachineExample/SpawnCursor")
export const TransitionNotice = Descriptor.defineResource<NoticeValue>()("StateMachineExample/TransitionNotice")

export const InputManager = Descriptor.defineService<StateMachineInputManager>()("StateMachineExample/InputManager")
export const BrowserHost = Descriptor.defineService<BrowserHostValue>()("StateMachineExample/BrowserHost")

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

export const SessionState = Game.StateMachine.define(
  "StateMachineExample/SessionState",
  ["Title", "Countdown", "Round"] as const
)

// Two smaller machines are clearer than one larger combined phase union here:
// session flow and round-local flow have different transition boundaries.
export const RoundState = Game.StateMachine.define(
  "StateMachineExample/RoundState",
  ["Playing", "Paused", "Victory", "Defeat"] as const
)

export const GameplaySet = Label.defineSystemSetLabel("StateMachineExample/Gameplay")

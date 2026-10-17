import { Descriptor, Schema } from "@typeonce/ritmo"
import * as Size2 from "@typeonce/ritmo-math/Size2"
import * as Vector2 from "@typeonce/ritmo-math/Vector2"
import type {
  ActorKind,
  ActorNodes as ActorNodesValue,
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
export const ActorNodes = Descriptor.Service<ActorNodesValue>()("StateMachineExample/ActorNodes")

export const Game = Schema.bind(
  Schema.fragment({
    components: {
      Position,
      Actor,
      Player,
      Pickup
    },
    requires: [
      Schema.requires(Player, Position, Actor),
      Schema.requires(Pickup, Position, Actor)
    ],
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

export const schema = Game.schema

export const SessionState = Game.StateMachine(
  "StateMachineExample/SessionState",
  ["Title", "Countdown", "Round"] as const
)

// The round's own flow exists only during a round: a sub-state of the session.
// It enters its runtime-provided value (Playing) whenever the session enters
// Round and has no value elsewhere, so inState(RoundState, ...) alone implies
// the session is in Round.
export const RoundState = Game.StateMachine(
  "StateMachineExample/RoundState",
  ["Playing", "Paused", "Victory", "Defeat"] as const,
  { within: [SessionState, "Round"] }
)

export const GameplayWhen = [Game.Condition.inState(RoundState, "Playing")] as const

// Pickups live for one round: entering Countdown (a restart) despawns them,
// before the onEnter reset spawns the next round's.
export const PickupScope = Game.EntityScope("StateMachineExample/Pickups", {
  despawnOnEnter: [SessionState, "Countdown"]
})

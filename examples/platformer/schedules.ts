import {
  ApplyGravitySystem,
  ApplyJumpSystem,
  ApplyWorldCameraTransformSystem,
  CaptureFrameContextSystem,
  RenderNodesSystem,
  DespawnLevelEntitiesOnPlayingEnterSystem,
  MovePlayerSystem,
  QueueLossSystem,
  QueueRestartSystem,
  ResetWorldResourcesOnPlayingEnterSystem,
  ResolveMoveIntentSystem,
  SetupWorldSystem,
  SpawnWorldOnPlayingEnterSystem,
  SyncCameraSystem,
  SyncHudSystem
} from "./systems/index.ts"
import { Game, SessionState } from "./schema.ts"

export const setupSchedule = Game.Schedule(
  SetupWorldSystem,
  Game.Schedule.applyDeferred(),
  SyncCameraSystem,
  ApplyWorldCameraTransformSystem,
  RenderNodesSystem,
  SyncHudSystem
)

const restartOnPlayingEnter = Game.Schedule(
    ResetWorldResourcesOnPlayingEnterSystem,
    DespawnLevelEntitiesOnPlayingEnterSystem,
    Game.Schedule.applyDeferred(),
    SpawnWorldOnPlayingEnterSystem
  )

export const stateTransitions = Game.Schedule.transitions(
  Game.Schedule.onEnter(SessionState, "Playing", [
    restartOnPlayingEnter
  ])
)

export const updateSchedule = Game.Schedule(
  CaptureFrameContextSystem,
  ResolveMoveIntentSystem,
  ApplyJumpSystem,
  ApplyGravitySystem,
  MovePlayerSystem,
  QueueLossSystem,
  QueueRestartSystem,
  Game.Schedule.applyStateTransitions(stateTransitions),
  Game.Schedule.applyDeferred(),
  SyncCameraSystem,
  ApplyWorldCameraTransformSystem,
  RenderNodesSystem,
  SyncHudSystem
)

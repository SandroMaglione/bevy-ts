import {
  ApplyGravitySystem,
  ApplyJumpSystem,
  ApplyWorldCameraTransformSystem,
  CaptureFrameContextSystem,
  CreateRenderNodesSystem,
  DespawnLevelEntitiesOnPlayingEnterSystem,
  DestroyRenderNodesSystem,
  MovePlayerSystem,
  QueueLossSystem,
  QueueRestartSystem,
  ResetWorldResourcesOnPlayingEnterSystem,
  ResolveMoveIntentSystem,
  SetupWorldSystem,
  SpawnWorldOnPlayingEnterSystem,
  SyncCameraSystem,
  SyncHudSystem,
  SyncRenderableTransformsSystem
} from "./systems/index.ts"
import { Game, SessionState } from "./schema.ts"

export const setupSchedule = Game.Schedule(
  SetupWorldSystem,
  Game.Schedule.applyDeferred(),
  SyncCameraSystem,
  ApplyWorldCameraTransformSystem,
  Game.Schedule.updateLifecycle(),
  CreateRenderNodesSystem,
  SyncHudSystem
)

const restartOnPlayingEnter = Game.Schedule.fragment({
  entries: [
    ResetWorldResourcesOnPlayingEnterSystem,
    DespawnLevelEntitiesOnPlayingEnterSystem,
    Game.Schedule.applyDeferred(),
    SpawnWorldOnPlayingEnterSystem
  ]
})

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
  Game.Schedule.updateLifecycle(),
  SyncCameraSystem,
  ApplyWorldCameraTransformSystem,
  DestroyRenderNodesSystem,
  CreateRenderNodesSystem,
  SyncRenderableTransformsSystem,
  SyncHudSystem
)

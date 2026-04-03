import {
  ApplyGravitySystem,
  ApplyJumpSystem,
  ApplyWorldCameraTransformSystem,
  CaptureFrameContextSystem,
  CreateRenderNodesSystem,
  DestroyRenderNodesSystem,
  MovePlayerSystem,
  QueueLossSystem,
  QueueRestartSystem,
  ResetWorldOnPlayingEnterSystem,
  ResolveMoveIntentSystem,
  SetupWorldSystem,
  SyncCameraSystem,
  SyncHudSystem,
  SyncRenderableTransformsSystem
} from "./systems/index.ts"
import { Game, SessionState } from "./schema.ts"

export const setupSchedule = Game.Schedule.define([
    SetupWorldSystem,
    Game.Schedule.applyDeferred(),
    SyncCameraSystem,
    ApplyWorldCameraTransformSystem,
    Game.Schedule.updateLifecycle(),
    CreateRenderNodesSystem,
    SyncHudSystem
  ])

export const stateTransitions = Game.Schedule.transitions(
  Game.Schedule.onEnter(SessionState, "Playing", [
    ResetWorldOnPlayingEnterSystem
  ])
)

export const updateSchedule = Game.Schedule.define([
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
  ])

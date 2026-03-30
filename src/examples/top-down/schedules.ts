import {
  AdvanceAnimationClockSystem,
  CaptureFrameContextSystem,
  CollectFocusedCollectableSystem,
  MovePlayerSystem,
  PlanPlayerVelocitySystem,
  ResolveCurrentPlayerFrameSystem,
  ResolveFacingSystem,
  ResolveLocomotionSystem,
  SetupWorldSystem,
  SyncCameraSystem,
  SyncHudSystem,
  SyncSceneSystem,
  UpdateFocusedCollectableSystem
} from "./systems/index.ts"
import { Game } from "./schema.ts"

export const setupSchedule = Game.Schedule.define({
  systems: [SetupWorldSystem, SyncCameraSystem, ResolveCurrentPlayerFrameSystem, SyncSceneSystem, SyncHudSystem],
  steps: [
    SetupWorldSystem,
    Game.Schedule.applyDeferred(),
    SyncCameraSystem,
    ResolveCurrentPlayerFrameSystem,
    Game.Schedule.updateLifecycle(),
    SyncSceneSystem,
    SyncHudSystem
  ]
})

export const updateSchedule = Game.Schedule.define({
  systems: [
    CaptureFrameContextSystem,
    PlanPlayerVelocitySystem,
    MovePlayerSystem,
    UpdateFocusedCollectableSystem,
    CollectFocusedCollectableSystem,
    ResolveFacingSystem,
    ResolveLocomotionSystem,
    AdvanceAnimationClockSystem,
    ResolveCurrentPlayerFrameSystem,
    SyncCameraSystem,
    SyncSceneSystem,
    SyncHudSystem
  ],
  steps: [
    CaptureFrameContextSystem,
    PlanPlayerVelocitySystem,
    MovePlayerSystem,
    UpdateFocusedCollectableSystem,
    CollectFocusedCollectableSystem,
    ResolveFacingSystem,
    ResolveLocomotionSystem,
    Game.Schedule.applyDeferred(),
    Game.Schedule.applyStateTransitions(),
    AdvanceAnimationClockSystem,
    ResolveCurrentPlayerFrameSystem,
    Game.Schedule.updateLifecycle(),
    SyncCameraSystem,
    SyncSceneSystem,
    SyncHudSystem
  ]
})

import {
  ApplyWorldCameraTransformSystem,
  AdvanceAnimationClockSystem,
  CaptureFrameContextSystem,
  CollectFocusedCollectableSystem,
  CreateRenderNodesSystem,
  DestroyRenderNodesSystem,
  MovePlayerSystem,
  PlanPlayerVelocitySystem,
  ResolveCurrentPlayerFrameSystem,
  ResolveFacingSystem,
  ResolveLocomotionSystem,
  ResetAnimationClockSystem,
  SetupWorldSystem,
  SyncCameraSystem,
  SyncHudSystem,
  SyncPickupPresentationSystem,
  SyncPlayerSpriteSystem,
  SyncRenderableTransformsSystem,
  UpdateFocusedCollectableSystem
} from "./systems/index.ts"
import { Game } from "./schema.ts"

export const setupSchedule = Game.Schedule.define({
  systems: [
    SetupWorldSystem,
    SyncCameraSystem,
    ApplyWorldCameraTransformSystem,
    CreateRenderNodesSystem,
    SyncPlayerSpriteSystem,
    SyncPickupPresentationSystem,
    SyncHudSystem
  ],
  steps: [
    SetupWorldSystem,
    Game.Schedule.applyDeferred(),
    SyncCameraSystem,
    ApplyWorldCameraTransformSystem,
    Game.Schedule.updateLifecycle(),
    CreateRenderNodesSystem,
    SyncPlayerSpriteSystem,
    SyncPickupPresentationSystem,
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
    ResetAnimationClockSystem,
    AdvanceAnimationClockSystem,
    ResolveCurrentPlayerFrameSystem,
    SyncCameraSystem,
    ApplyWorldCameraTransformSystem,
    DestroyRenderNodesSystem,
    CreateRenderNodesSystem,
    SyncRenderableTransformsSystem,
    SyncPlayerSpriteSystem,
    SyncPickupPresentationSystem,
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
    ResetAnimationClockSystem,
    AdvanceAnimationClockSystem,
    ResolveCurrentPlayerFrameSystem,
    Game.Schedule.updateLifecycle(),
    SyncCameraSystem,
    ApplyWorldCameraTransformSystem,
    DestroyRenderNodesSystem,
    CreateRenderNodesSystem,
    SyncRenderableTransformsSystem,
    SyncPlayerSpriteSystem,
    SyncPickupPresentationSystem,
    SyncHudSystem
  ]
})

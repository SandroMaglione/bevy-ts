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

const animationSchedule = Game.Schedule(
  ResetAnimationClockSystem,
  AdvanceAnimationClockSystem,
  ResolveCurrentPlayerFrameSystem
)

const cameraSyncSchedule = Game.Schedule(
  SyncCameraSystem,
  ApplyWorldCameraTransformSystem
)

const renderSyncSchedule = Game.Schedule(
  Game.Schedule.updateLifecycle(),
  DestroyRenderNodesSystem,
  CreateRenderNodesSystem,
  SyncRenderableTransformsSystem,
  SyncPlayerSpriteSystem,
  SyncPickupPresentationSystem,
  SyncHudSystem
)

const gameplaySchedule = Game.Schedule(
  CaptureFrameContextSystem,
  PlanPlayerVelocitySystem,
  MovePlayerSystem,
  UpdateFocusedCollectableSystem,
  CollectFocusedCollectableSystem,
  ResolveFacingSystem,
  ResolveLocomotionSystem,
  Game.Schedule.applyDeferred(),
  Game.Schedule.applyStateTransitions()
)

export const setupSchedule = Game.Schedule(
  SetupWorldSystem,
  Game.Schedule.applyDeferred(),
  SyncCameraSystem,
  ApplyWorldCameraTransformSystem,
  Game.Schedule.updateLifecycle(),
  DestroyRenderNodesSystem,
  CreateRenderNodesSystem,
  SyncRenderableTransformsSystem,
  SyncPlayerSpriteSystem,
  SyncPickupPresentationSystem,
  SyncHudSystem
)

export const updateSchedule = Game.Schedule(
  gameplaySchedule,
  animationSchedule,
  cameraSyncSchedule,
  renderSyncSchedule
)

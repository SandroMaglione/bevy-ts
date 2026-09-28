import {
  ApplyWorldCameraTransformSystem,
  AdvanceAnimationClockSystem,
  CaptureFrameContextSystem,
  CaptureInputSystem,
  CollectFocusedCollectableSystem,
  RenderNodesSystem,
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
  UpdateFocusedCollectableSystem
} from "./systems/index.ts"
import { Game } from "./schema.ts"

const animationSchedule = Game.Schedule(
  ResetAnimationClockSystem,
  AdvanceAnimationClockSystem,
  ResolveCurrentPlayerFrameSystem
)

const gameplaySchedule = Game.Schedule(
  CaptureFrameContextSystem,
  CaptureInputSystem,
  PlanPlayerVelocitySystem,
  MovePlayerSystem,
  UpdateFocusedCollectableSystem,
  CollectFocusedCollectableSystem,
  ResolveFacingSystem,
  ResolveLocomotionSystem,
  Game.Schedule.applyDeferred(),
  Game.Schedule.applyStateTransitions()
)

/**
 * Everything that changes world state. It needs only the keyboard and the
 * frame context, so it also runs headless (see `simulation.ts`).
 */
export const simulationSchedule = Game.Schedule(
  gameplaySchedule,
  animationSchedule,
  SyncCameraSystem
)

/**
 * Mirrors the world into Pixi and the HUD. Reads world state only.
 */
export const presentationSchedule = Game.Schedule(
  ApplyWorldCameraTransformSystem,
  RenderNodesSystem,
  SyncPlayerSpriteSystem,
  SyncPickupPresentationSystem,
  SyncHudSystem
)

export const setupWorldSchedule = Game.Schedule(
  SetupWorldSystem,
  Game.Schedule.applyDeferred(),
  SyncCameraSystem
)

export const setupSchedule = Game.Schedule(
  setupWorldSchedule,
  presentationSchedule
)

export const updateSchedule = Game.Schedule(
  simulationSchedule,
  presentationSchedule
)

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

type SetupSystem =
  | typeof SetupWorldSystem
  | typeof SyncCameraSystem
  | typeof ResolveCurrentPlayerFrameSystem
  | typeof SyncSceneSystem
  | typeof SyncHudSystem

type SetupStep =
  | SetupSystem
  | ReturnType<typeof Game.Schedule.applyDeferred>
  | ReturnType<typeof Game.Schedule.updateLifecycle>

const setupSystems: ReadonlyArray<SetupSystem> = [
  SetupWorldSystem,
  SyncCameraSystem,
  ResolveCurrentPlayerFrameSystem,
  SyncSceneSystem,
  SyncHudSystem
]

const setupSteps: ReadonlyArray<SetupStep> = [
  SetupWorldSystem,
  Game.Schedule.applyDeferred(),
  SyncCameraSystem,
  ResolveCurrentPlayerFrameSystem,
  Game.Schedule.updateLifecycle(),
  SyncSceneSystem,
  SyncHudSystem
]

const setupScheduleOptions = {
  systems: setupSystems,
  steps: setupSteps
}

const defineSetupSchedule = Game.Schedule.define<SetupSystem, never, SetupStep>
export const setupSchedule = defineSetupSchedule(setupScheduleOptions)

type UpdateSystem =
  | typeof CaptureFrameContextSystem
  | typeof PlanPlayerVelocitySystem
  | typeof MovePlayerSystem
  | typeof UpdateFocusedCollectableSystem
  | typeof CollectFocusedCollectableSystem
  | typeof ResolveFacingSystem
  | typeof ResolveLocomotionSystem
  | typeof AdvanceAnimationClockSystem
  | typeof ResolveCurrentPlayerFrameSystem
  | typeof SyncCameraSystem
  | typeof SyncSceneSystem
  | typeof SyncHudSystem

type UpdateStep =
  | UpdateSystem
  | ReturnType<typeof Game.Schedule.applyDeferred>
  | ReturnType<typeof Game.Schedule.applyStateTransitions>
  | ReturnType<typeof Game.Schedule.updateLifecycle>

const updateSystems: ReadonlyArray<UpdateSystem> = [
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
]

const updateSteps: ReadonlyArray<UpdateStep> = [
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

const updateScheduleOptions = {
  systems: updateSystems,
  steps: updateSteps
}

const defineUpdateSchedule = Game.Schedule.define<UpdateSystem, never, UpdateStep>
type UpdateSchedule = ReturnType<typeof defineUpdateSchedule>
export const updateSchedule = defineUpdateSchedule(updateScheduleOptions as never) as UpdateSchedule

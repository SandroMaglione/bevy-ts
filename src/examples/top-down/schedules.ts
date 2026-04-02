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

const animationPhase = Game.Schedule.phase({
  steps: [
    ResetAnimationClockSystem,
    AdvanceAnimationClockSystem,
    ResolveCurrentPlayerFrameSystem
  ]
})

const cameraSyncPhase = Game.Schedule.phase({
  steps: [
    SyncCameraSystem,
    ApplyWorldCameraTransformSystem
  ]
})

const renderSyncPhase = Game.Schedule.phase({
  steps: [
    Game.Schedule.updateLifecycle(),
    DestroyRenderNodesSystem,
    CreateRenderNodesSystem,
    SyncRenderableTransformsSystem,
    SyncPlayerSpriteSystem,
    SyncPickupPresentationSystem,
    SyncHudSystem
  ]
})

const updateTailSystems = [
  ...animationPhase.systems,
  ...cameraSyncPhase.systems,
  ...renderSyncPhase.systems
]

const updateTailSteps = [
  ...animationPhase.steps,
  ...cameraSyncPhase.steps,
  ...renderSyncPhase.steps
]

const gameplaySystems = [
  CaptureFrameContextSystem,
  PlanPlayerVelocitySystem,
  MovePlayerSystem,
  UpdateFocusedCollectableSystem,
  CollectFocusedCollectableSystem,
  ResolveFacingSystem,
  ResolveLocomotionSystem
] as const

const gameplaySteps = [
  CaptureFrameContextSystem,
  PlanPlayerVelocitySystem,
  MovePlayerSystem,
  UpdateFocusedCollectableSystem,
  CollectFocusedCollectableSystem,
  ResolveFacingSystem,
  ResolveLocomotionSystem,
  Game.Schedule.applyDeferred(),
  Game.Schedule.applyStateTransitions()
] as const

export const setupSchedule = Game.Schedule.define({
  systems: [
    SetupWorldSystem,
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
  ]
})

export const updateSchedule = Game.Schedule.define({
  systems: [
    ...gameplaySystems,
    ...updateTailSystems
  ],
  steps: [
    ...gameplaySteps,
    ...updateTailSteps
  ]
})

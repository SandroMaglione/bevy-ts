import {
  CaptureFrameInputSystem,
  CollectPickupsSystem,
  CreateRenderNodesSystem,
  DestroyRenderNodesSystem,
  FadeTransitionNoticeSystem,
  MovePlayerSystem,
  QueueOutcomeSystem,
  QueuePauseSystem,
  QueueRestartSystem,
  QueueResumeSystem,
  QueueStartFromTitleSystem,
  ResetRoundOnCountdownEnterSystem,
  SpawnPlayerSystem,
  SyncHudSystem,
  SyncRenderableTransformsSystem,
  TickCountdownSystem,
  TickRoundClockSystem,
  WriteTransitionNoticeSystem
} from "./systems.ts"
import { Game, SessionState } from "./schema.ts"

export const setupSchedule = Game.Schedule.define([
    SpawnPlayerSystem,
    Game.Schedule.applyDeferred(),
    Game.Schedule.updateLifecycle(),
    CreateRenderNodesSystem,
    SyncHudSystem
  ])

export const stateTransitions = Game.Schedule.transitions(
  Game.Schedule.onEnter(SessionState, "Countdown", [
    // Entering Countdown is the explicit reset boundary for the next round.
    ResetRoundOnCountdownEnterSystem
  ])
)

export const updateSchedule = Game.Schedule.define([
    CaptureFrameInputSystem,
    QueueStartFromTitleSystem,
    QueueRestartSystem,
    QueuePauseSystem,
    QueueResumeSystem,
    TickCountdownSystem,
    MovePlayerSystem,
    CollectPickupsSystem,
    TickRoundClockSystem,
    QueueOutcomeSystem,
    Game.Schedule.applyStateTransitions(stateTransitions),
    Game.Schedule.applyDeferred(),
    Game.Schedule.updateEvents(),
    // Host sync only becomes correct after lifecycle visibility is committed.
    Game.Schedule.updateLifecycle(),
    WriteTransitionNoticeSystem,
    FadeTransitionNoticeSystem,
    DestroyRenderNodesSystem,
    CreateRenderNodesSystem,
    SyncRenderableTransformsSystem,
    SyncHudSystem
  ])

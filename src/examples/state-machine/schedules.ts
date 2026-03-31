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
import { Game, GameplaySet, RoundState, SessionState } from "./schema.ts"

export const setupSchedule = Game.Schedule.define({
  systems: [SpawnPlayerSystem, CreateRenderNodesSystem, SyncHudSystem],
  steps: [
    SpawnPlayerSystem,
    Game.Schedule.applyDeferred(),
    Game.Schedule.updateLifecycle(),
    CreateRenderNodesSystem,
    SyncHudSystem
  ]
})

export const stateTransitions = Game.Schedule.transitions(
  Game.Schedule.onEnter(SessionState, "Countdown", {
    systems: [ResetRoundOnCountdownEnterSystem]
  })
)

export const updateSchedule = Game.Schedule.define({
  systems: [
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
    WriteTransitionNoticeSystem,
    FadeTransitionNoticeSystem,
    DestroyRenderNodesSystem,
    CreateRenderNodesSystem,
    SyncRenderableTransformsSystem,
    SyncHudSystem
  ],
  sets: [
    Game.Schedule.configureSet({
      label: GameplaySet,
      when: [Game.Condition.and(
        Game.Condition.inState(SessionState, "Round"),
        Game.Condition.inState(RoundState, "Playing")
      )]
    })
  ],
  steps: [
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
  ]
})

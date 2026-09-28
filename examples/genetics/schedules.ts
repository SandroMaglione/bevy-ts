import { Game, SimulationPhase } from "./schema.ts"
import {
  CaptureFrameContextSystem,
  CleanupDeadAgentsSystem,
  MaintainFoodSystem,
  ApplyMovementSystem,
  ChooseIntentSystem,
  QueuePhaseOutcomeSystem,
  QueueResumeSystem,
  ResetGenerationOnRunningEnterSystem,
  ResolveAgentInteractionsSystem,
  ResolveFoodAndHazardSystem,
  SetupWorldSystem,
  TickAgentVitalsSystem,
  TickGenerationClockSystem,
  TickTransitionStateSystem
} from "./systems/simulation.ts"
import {
  AnimateAgentNodesSystem,
  CreateRenderNodesSystem,
  DestroyRenderNodesSystem,
  SyncHudSystem,
  SyncRenderNodesSystem
} from "./systems/render.ts"

const runningEntry = Game.Schedule(
    ResetGenerationOnRunningEnterSystem,
    Game.Schedule.applyDeferred(),
    SetupWorldSystem
  )

const stateTransitions = Game.Schedule.transitions(
  Game.Schedule.onEnter(SimulationPhase, "Running", [runningEntry])
)

export const setupSchedule = Game.Schedule(
  SetupWorldSystem,
  Game.Schedule.applyDeferred(),
  CreateRenderNodesSystem,
  AnimateAgentNodesSystem,
  SyncHudSystem
)

export const updateSchedule = Game.Schedule(
  CaptureFrameContextSystem,
  TickGenerationClockSystem,
  TickAgentVitalsSystem,
  ChooseIntentSystem,
  ApplyMovementSystem,
  ResolveFoodAndHazardSystem,
  ResolveAgentInteractionsSystem,
  CleanupDeadAgentsSystem,
  MaintainFoodSystem,
  QueuePhaseOutcomeSystem,
  TickTransitionStateSystem,
  QueueResumeSystem,
  Game.Schedule.applyStateTransitions(stateTransitions),
  Game.Schedule.applyDeferred(),
  DestroyRenderNodesSystem,
  CreateRenderNodesSystem,
  SyncRenderNodesSystem,
  AnimateAgentNodesSystem,
  SyncHudSystem
)

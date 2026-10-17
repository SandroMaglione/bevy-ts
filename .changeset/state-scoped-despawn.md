---
"@typeonce/ritmo": minor
"@typeonce/ritmo-devtools": minor
---

**Scopes despawned by state changes.** `Game.EntityScope(name, { despawnOnExit: [Flow, "Playing"] })` (or `despawnOnEnter`) despawns every member of the scope when `applyStateTransitions(...)` commits that state change: after the `onExit` schedules, which still see the members, and before the `onEnter` schedules, so what they spawn survives. A restart no longer needs a despawn system, a `despawnsScope` permission, and an `applyDeferred()` placed between despawn and respawn. The despawn goes through the normal path (`readDespawned`, `RenderSync`, hierarchy cascades) and appears in the trace as `despawnScope <name>` from `onExit(<machine>=<state>)`.

- Scopes register with the game when defined, so the runtime knows every trigger; scope names are now unique per game (`Duplicate entity scope name`).
- A state that does not exist, or a machine of another game, fails to compile. `Game.Condition.inState` and `stateChanged` now reject another game's machine where the condition is built, with the message `<machine> is a state machine of another game: use a machine defined with this game's Game.StateMachine(...)`.
- New lint `scope-trigger-never-applied`: a trigger whose machine the runtime does not provide, whose next state no described system queues, or that no described schedule applies. `describe()` gains `scopes` (each with its triggers), printed in the text report.

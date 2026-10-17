---
"@typeonce/ritmo": minor
"@typeonce/ritmo-devtools": minor
---

**Sub-states.** `Game.StateMachine(name, values, { within: [Parent, state] })` declares a machine that exists only while `Parent` is in `state`. Each time the parent enters that state, the sub-state enters the value given to `Game.Runtime.machine(...)`; when the parent leaves it, the sub-state's `onExit` schedules run before the parent's and it loses its value. `Game.Condition.inState(Sub, x)` therefore implies the parent's state, replacing an `and(inState(Parent, ...), inState(Sub, ...))` on every system and the `onExit` system that reset the second machine.

- For sub-states only: `machines.x.get()` is `Value | undefined`, `nextMachines.x.set` / `setIfChanged` return a `Result` failing with `SubStateInactive` (nothing is queued) while the parent is elsewhere, and transition snapshots use `undefined` for the side where it does not exist. Top-level machines keep their exact types.
- Snapshots leave out an inactive sub-state; `restore` rejects a saved sub-state value whose parent is elsewhere with the new `InactiveSubState` error, and enters the entry value when a save has the parent in its state but no sub-state value.
- `describe()` machine entries gain `provided` and `within`; the text report and traces print a missing value as `(inactive)`. `Debug.TransitionEvent` `from` / `to` may be `undefined`.
- The unused `Machine.MachineView`, `NextMachineView`, `TransitionView`, and `TransitionEventView` interfaces are removed; system views are `System.MachineReadView`, `NextMachineWriteView`, `TransitionReadView`, and `TransitionEventReadView`.

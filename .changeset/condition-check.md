---
"@typeonce/bevy-ts": minor
"@typeonce/bevy-ts-browser": patch
"@typeonce/bevy-ts-pixi": patch
---

Add `Game.Condition.check(name, access, predicate)` (types in `@typeonce/bevy-ts/Condition`): a run condition computed by ordinary code, so conditions need no growing set of combinators. A check declares its reads like a system and receives them read-only. It may read resources, machines, and queries with no write slots and no `added`/`changed` filters; events, transition events, removed/despawned reads, relation failures, and services are compile errors, as are other games' descriptors and non-boolean predicates. Its reads become requirements of whatever it gates, through `not`/`and`/`or`, a system's `when`, and `Schedule.when`. Checks are evaluated before each gated system against committed values, so they see writes from earlier systems in the same run, and they never advance the world tick or a reader cursor. A throwing predicate propagates like a throwing system. Devtools render checks as `check(name)` and count their reads as the gated system's reads.

Conditions now carry their requirements in one type-level field, read with `ConditionNeeds` / `ConditionNeedsFromConditions`. `MachineNeedsFromCondition(s)` remain and extract only the machines. `InputCapture.system` and `RenderSync` (`system`, `interpolate`) pass a check's requirements through their `when` option.

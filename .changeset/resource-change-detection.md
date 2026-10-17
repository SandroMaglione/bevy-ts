---
"@typeonce/ritmo": minor
"@typeonce/ritmo-devtools": minor
---

**Resource change detection.** `Game.System.changedResource(R)` declares a resource read whose view adds `changed()`: whether a committed write left a different value since this system's previous completed run. Use it for work worth doing only when a value moved, such as rewriting a HUD label, instead of keeping a "last value" in `local`.

- A write of an equal value is not a change: primitives compare with `Object.is`, plain objects and arrays by their entries, other objects by reference. This differs from `Game.Query.changed`, where every component write counts.
- The first run reports `true`. Writes rolled back by a failed system are not changes, a system does not see its own writes as changes, and a reader skipped by a run condition sees the change when it runs again.
- `Game.Condition.check` rejects it ("changedResource consumes a per-reader cursor, which a check does not have: use Game.System.readResource here, and changedResource in the gated system"); writing a resource in a check now names `readResource` too.
- `Game.System.thisTick(changedResource(R))` joins the compile-time and runtime order checks.
- `describe()` lists these reads in `SystemDescription.resources.changed` (they stay in `reads`), the text report prints them as "reads resources when changed", and the new `resource-changed-never-written` lint warns when no described system writes a resource read with `changedResource`.

---
"@typeonce/bevy-ts": patch
---

Building a schedule with an entry that is not a system, a schedule, or a marker step (for example an import that is `undefined` at runtime) now throws `Schedule entry N is not a system, a schedule, or a marker step: got …` instead of failing deep inside with `Cannot read properties of undefined`. The docs also show typing helpers that receive `get()` values as `ReadonlyValue<T>`, so they need no casts.

---
"@typeonce/bevy-ts-devtools": minor
---

`Session.make(runtime, { schedules, describe })`: `describe` names more schedules for `describe()`, its lints, and the access maps without making them runnable. A headless session can now include a game's render schedule (which needs services the headless runtime lacks), so events and components only rendering reads are no longer reported as never read.

---
"@typeonce/ritmo": minor
"@typeonce/ritmo-render": minor
"@typeonce/ritmo-devtools": minor
---

**`Game.Query.anyOf`.** `anyOf(...filters)` takes two or more `added` / `changed` filters and matches an entity once when any of them passes since the reading system's previous run, for example to redraw when either the position or the sprite changed. Filters listed side by side in `filters: [...]` still all have to pass. `anyOf` does not nest, and `Game.Condition.check` rejects it like every other change filter.

- `RenderSync.system` now builds one query per sync system (an `anyOf` of its added and changed filters) instead of one query per trigger plus deduplication.
- `Debug.QueryDescription` gains `anyOf` (one entry per `anyOf` filter, with its `added` and `changed` components); code that builds a `QueryDescription` by hand must add it. The text report prints it as `any of (...)`, and Monitor counts its components as reads.

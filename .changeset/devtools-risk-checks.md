---
"@typeonce/bevy-ts": minor
"@typeonce/bevy-ts-devtools": minor
---

Debug visibility for risks that types cannot rule out.

- `Debug.Handle.population()` returns the live entity count and the number of entities per component. It is cheap enough to sample every frame.
- A new info lint, `read-before-write`, names systems that read a component, resource, or event earlier in a schedule than the first system that writes it there, so they see the previous run's value (for events, one run late).
- Devtools sessions warn with `non-finite-value` when any traced component write, resource write, event, spawn, or insert contains NaN or an infinity. The warning names the system, the entity, and the path.
- Runs sample the population every frame. They return `entities` (start, peak, end) and `growing`, and warn with `population-growing` when a component's lowest count rises through every quarter of a run of at least 60 frames.
- `run()` lists the warnings it raised, both as text and in `warnings`. `report()` ends with the current population.

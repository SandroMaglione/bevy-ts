---
"@typeonce/ritmo": minor
"@typeonce/ritmo-devtools": minor
---

**Breaking: required components; `insert` and `remove` take a query match.** See [MIGRATION.md](https://github.com/typeonce-dev/ritmo/blob/main/MIGRATION.md#upgrading-to-080).

A fragment declares what always comes together: `Schema.fragment({ components: { ... }, requires: [Schema.requires(Player, Position, Velocity)] })`. Requirements chain, may name components of other fragments of the same `Schema.bind` (checked there), and are never filled in with defaults.

- `commands.spawn` / `spawnIn` reject a draft missing a required component, naming the requirer and the missing component. Drafts may be partial while they are built with `Game.Command.extend`.
- `Game.System.spawns(Player)` also allows what `Player` requires, transitively, so hand-kept lists of a draft's components are no longer needed.
- **Breaking:** `commands.remove` takes `match.entity` (or the id `commands.spawn` returned in this run), never a raw id, and removes several components in one call: `commands.remove(match.entity, Player, Velocity)`. Removing a required component compiles only when its requirers are removed in the same call or excluded by the query's `without`.
- `commands.insert` takes `match.entity` (or a spawned id) as well as a raw id: the target's query proof plus the entries inserted together must cover what the inserted components require. A raw id still inserts components without requirements.
- When commands are applied, a spawn, insert, or remove that would break a requirement (a query proof gone stale within one flush, erased types) is skipped whole, traced as a `requirementViolated` effect, and reported by the new `requirement-violated` lint.
- `restore` rejects a saved entity missing a required component with the new `MissingRequiredComponent` error. Requirements on transient components are not checked there, since saves skip them.
- `describe()` component entries gain `requires`. `Command.InternalWorld` now inserts and removes several components per call (`insertComponents`, `removeComponents`), and `spawnEntity` reports whether it spawned.

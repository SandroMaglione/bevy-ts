# Migration guide

## Upgrading to 0.8.0

0.8.0 adds component requirements (`Schema.requires`) and changes how
`commands.insert` and `commands.remove` take their target.

- **`remove` takes a query match, not a raw id.** Pass `match.entity` (or the
  id `commands.spawn` returned in the same run). With only a stored id,
  resolve it first.

  ```diff
  -for (const match of queries.marked.each()) commands.remove(match.entity.id, Marker)
  +for (const match of queries.marked.each()) commands.remove(match.entity, Marker)

  -commands.remove(storedId, Sprite)
  +const found = queries.sprites.get(storedId)
  +if (found.ok) commands.remove(found.value.entity, Sprite)
  ```

  A raw id fails with an error that first prints the id's type (the whole
  schema), then the fix: `remove needs an entity from a query (pass
  match.entity) or the id spawn returned in this run, not a raw id`.

- **`remove` takes several components.** Removing a component together with
  the components that require it must happen in one call:
  `commands.remove(match.entity, Player, Velocity)`.
- **`insert` takes `match.entity` too.** A raw id still works for components
  that require nothing; a component with requirements needs a target whose
  query proves them, or the requirements inserted in the same call.
- **A query's `without` proves absence.** `remove(match.entity, Velocity)`
  compiles when every component that requires `Velocity` is excluded by the
  query (`without: [Player]`) or removed in the same call.
- **Hand-kept part lists can go.** Declare what always comes together in the
  schema, and give `spawns` the main component:

  ```diff
  -export const PlayerParts = [Position, Velocity, Collider, Player] as const
  -commands: Game.System.commands(Game.System.spawns(...PlayerParts))
  +Schema.fragment({ components: { ... }, requires: [Schema.requires(Player, Position, Velocity, Collider)] })
  +commands: Game.System.commands(Game.System.spawns(Player))
  ```

  - Put a requirement on the component that needs it, not on widely shared
    ones. If many components require `Position` or `Renderable`, every
    `remove` of those needs a query with `without` for each requirer.
  - Only `spawns(...)` expands requirements. `inserts(...)`, `removes(...)`,
    and `remove(...)` do not, so a list such as "every part of a body" stays a
    plain array: `removes(...BodyParts)` and `remove(match.entity, ...BodyParts)`.
  - Components a draft may hold that no requirement covers (optional parts)
    are still listed in `spawns(...)` next to the main component.

- **New optional descriptor option.** `{ immutable: true }` on a component
  makes `Game.Query.write` of it a compile error; replace it with `insert`.
- **Debug output.** `describe()` component entries gain `immutable` and
  `requires`; a new effect kind `requirementViolated` and lint
  `requirement-violated` report commands skipped at apply time. Replay schema
  hashes are unchanged.

## Rename from bevy-ts

Ritmo is the new name for bevy-ts. All six packages retain the `@typeonce` scope
and share one version.

| Previous package | Replacement |
| --- | --- |
| `@typeonce/bevy-ts` | `@typeonce/ritmo` |
| `@typeonce/bevy-ts-browser` | `@typeonce/ritmo-browser` |
| `@typeonce/bevy-ts-render` | `@typeonce/ritmo-render` |
| `@typeonce/bevy-ts-pixi` | `@typeonce/ritmo-pixi` |
| `@typeonce/bevy-ts-math` | `@typeonce/ritmo-math` |
| `@typeonce/bevy-ts-devtools` | `@typeonce/ritmo-devtools` |

After the first Ritmo release is available, replace the packages your game uses
in its manifest and update every import, including module paths:

```diff
-import { Descriptor, Schema } from "@typeonce/bevy-ts"
-import * as Result from "@typeonce/bevy-ts/Result"
+import { Descriptor, Schema } from "@typeonce/ritmo"
+import * as Result from "@typeonce/ritmo/Result"
```

Install once to update the lockfile, then run the game's type checks and tests.
Replace the full package family together. There are no compatibility aliases;
old and new packages use different type identity markers.

This guide covers the name change. Review the changelog for other API changes
between your installed version and the Ritmo version you select.

The generated documentation site is retired. Use the [root README](./README.md),
[concepts](./CONCEPTS.md), [game API guide](./GAME_API.md),
[Pixi walkthrough](./examples/pixi/README.md), package READMEs, and source JSDoc.
Existing published bevy-ts versions remain available for pinned installs.

# Migrate from bevy-ts to Ritmo

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

# `@typeonce/ritmo`

Ritmo is the agent-first typed ECS runtime for games.

Closed schemas, declared system access, explicit schedule boundaries, typed
services, and no user-facing casts for normal usage.

```sh
pnpm add @typeonce/ritmo
```

```ts
import { Descriptor, Schema } from "@typeonce/ritmo"

const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
const Game = Schema.bind(Schema.fragment({ components: { Position } }))
```

Modules are also importable by path, for example `@typeonce/ritmo/Result`.

Related packages, released together with the same version:

- [`@typeonce/ritmo-math`](https://www.npmjs.com/package/@typeonce/ritmo-math): validated vectors, sizes, and bounding boxes
- [`@typeonce/ritmo-browser`](https://www.npmjs.com/package/@typeonce/ritmo-browser): fixed-step loop and keyboard actions
- [`@typeonce/ritmo-render`](https://www.npmjs.com/package/@typeonce/ritmo-render): entity-to-node sync for any renderer
- [`@typeonce/ritmo-pixi`](https://www.npmjs.com/package/@typeonce/ritmo-pixi): Pixi container adapter for the render-node registry
- [`@typeonce/ritmo-devtools`](https://www.npmjs.com/package/@typeonce/ritmo-devtools): headless debug sessions and trace reports

Documentation: https://sandromaglione.github.io/bevy-ts/ ·
Source: https://github.com/SandroMaglione/bevy-ts

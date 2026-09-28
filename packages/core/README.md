# `@typeonce/bevy-ts`

A type-safe, game-loop-agnostic ECS runtime for TypeScript, inspired by Bevy.

Closed schemas, declared system access, explicit schedule boundaries, typed
services, and no user-facing casts for normal usage.

```sh
pnpm add @typeonce/bevy-ts
```

```ts
import { Descriptor, Schema } from "@typeonce/bevy-ts"

const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
const Game = Schema.bind(Schema.fragment({ components: { Position } }))
```

Modules are also importable by path, for example `@typeonce/bevy-ts/Result`.

Related packages, released together with the same version:

- [`@typeonce/bevy-ts-math`](https://www.npmjs.com/package/@typeonce/bevy-ts-math): validated vectors, sizes, and bounding boxes
- [`@typeonce/bevy-ts-browser`](https://www.npmjs.com/package/@typeonce/bevy-ts-browser): fixed-step loop and keyboard actions
- [`@typeonce/bevy-ts-pixi`](https://www.npmjs.com/package/@typeonce/bevy-ts-pixi): entity-to-Pixi node sync
- [`@typeonce/bevy-ts-devtools`](https://www.npmjs.com/package/@typeonce/bevy-ts-devtools): headless debug sessions and trace reports

Documentation: https://sandromaglione.github.io/bevy-ts/ ·
Source: https://github.com/SandroMaglione/bevy-ts

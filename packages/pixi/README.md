# `@typeonce/bevy-ts-pixi`

Pixi's implementation of the renderer-independent `NodeRegistry` contract. `PixiNodeRegistry.make` attaches nodes to one Pixi container and detaches and destroys them with their children on removal.

Import the generic `NodeRegistry` contract and `RenderSync` systems from [`@typeonce/bevy-ts-render`](https://www.npmjs.com/package/@typeonce/bevy-ts-render). The Pixi package exports only its adapter; systems depend on the generic registry service, and the host chooses its implementation.

```sh
pnpm add @typeonce/bevy-ts-pixi @typeonce/bevy-ts-render @typeonce/bevy-ts
```

```ts
import { Descriptor } from "@typeonce/bevy-ts"
import { NodeRegistry, RenderSync } from "@typeonce/bevy-ts-render"
import { PixiNodeRegistry } from "@typeonce/bevy-ts-pixi"

const Sprites = Descriptor.Service<NodeRegistry.NodeRegistry<Sprite>>()("Game/Sprites")
// actorLayer is a Pixi Container<Sprite>.
const sprites = PixiNodeRegistry.make(actorLayer)
const services = Game.Runtime.services(Game.Runtime.service(Sprites, sprites))
// Pass Sprites as the registry descriptor to RenderSync.system(Game, ...).
```

Bring your own `pixi.js` application; the package does not import it.

Released together with [`@typeonce/bevy-ts`](https://www.npmjs.com/package/@typeonce/bevy-ts), always with the same version.

Documentation: https://sandromaglione.github.io/bevy-ts/ ·
Source: https://github.com/SandroMaglione/bevy-ts

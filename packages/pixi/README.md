# `@typeonce/ritmo-pixi`

Pixi's implementation of the renderer-independent `NodeRegistry` contract. `PixiNodeRegistry.make` attaches nodes to one Pixi container and detaches and destroys them with their children on removal.

Import the generic `NodeRegistry` contract and `RenderSync` systems from [`@typeonce/ritmo-render`](https://www.npmjs.com/package/@typeonce/ritmo-render). The Pixi package exports only its adapter; systems depend on the generic registry service, and the host chooses its implementation.

```sh
pnpm add @typeonce/ritmo-pixi @typeonce/ritmo-render @typeonce/ritmo
```

```ts
import { Descriptor } from "@typeonce/ritmo"
import { NodeRegistry, RenderSync } from "@typeonce/ritmo-render"
import { PixiNodeRegistry } from "@typeonce/ritmo-pixi"

const Sprites = Descriptor.Service<NodeRegistry.NodeRegistry<Sprite>>()("Game/Sprites")
// actorLayer is a Pixi Container<Sprite>.
const sprites = PixiNodeRegistry.make(actorLayer)
const services = Game.Runtime.services(Game.Runtime.service(Sprites, sprites))
// Pass Sprites as the registry descriptor to RenderSync.system(Game, ...).
```

Bring your own `pixi.js` application; the package does not import it.

Released together with [`@typeonce/ritmo`](https://www.npmjs.com/package/@typeonce/ritmo), always with the same version.

Source: https://github.com/typeonce-dev/ritmo

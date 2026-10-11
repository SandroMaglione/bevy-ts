# `@typeonce/bevy-ts-pixi`

The generic `NodeRegistry` and `RenderSync` re-exports are deprecated for
this minor release. Move generic renderer imports to `@typeonce/bevy-ts-render`;
keep Pixi's `NodeRegistry.inContainer` here. The compatibility re-exports
will be removed in the next minor release.

Pixi integrations for bevy-ts: `NodeRegistry.inContainer`, a render-node registry keyed by entity whose nodes are children of one Pixi container and are destroyed with their children when removed.

The generic parts live in [`@typeonce/bevy-ts-render`](https://www.npmjs.com/package/@typeonce/bevy-ts-render) and are re-exported here: the registry itself (`NodeRegistry.make`), the system that creates, updates, and destroys renderer nodes from ECS entities (`RenderSync.system`), and the system that draws fixed-step movement smoothly between steps (`RenderSync.interpolate`). With another renderer (Three.js, the DOM, a canvas), use `@typeonce/bevy-ts-render` directly.

```sh
pnpm add @typeonce/bevy-ts-pixi @typeonce/bevy-ts
```

```ts
import { NodeRegistry, RenderSync } from "@typeonce/bevy-ts-pixi"

const sprites = NodeRegistry.inContainer<Sprite>(actorLayer)
```

Bring your own `pixi.js` application; the package does not import it.

Released together with [`@typeonce/bevy-ts`](https://www.npmjs.com/package/@typeonce/bevy-ts), always with the same version.

Documentation: https://sandromaglione.github.io/bevy-ts/ ·
Source: https://github.com/SandroMaglione/bevy-ts

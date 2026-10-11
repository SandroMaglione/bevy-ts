# `@typeonce/bevy-ts-render`

Renderer-agnostic entity-to-node mirroring for bevy-ts: a render-node registry keyed by entity (`NodeRegistry`), a system that creates, updates, and destroys renderer nodes from ECS entities (`RenderSync.system`), and a system that draws fixed-step movement smoothly between steps (`RenderSync.interpolate`).

```sh
pnpm add @typeonce/bevy-ts-render @typeonce/bevy-ts
```

The package imports no renderer. You say what attaching and releasing a node means, and what a node looks like; it owns the bookkeeping (one node per entity, created, re-applied, and destroyed in step with the world). For example with Three.js:

```ts
import { Descriptor } from "@typeonce/bevy-ts"
import { NodeRegistry, RenderSync } from "@typeonce/bevy-ts-render"

const Meshes = Descriptor.Service<NodeRegistry.NodeRegistry<Mesh>>()("Game/Meshes")

const Render = RenderSync.system(Game, {
  name: "Game/Render",
  renderable: Renderable,
  transform: Position,
  registry: Meshes,
  create: ({ renderable }) => new Mesh(geometry, materials[renderable.material]),
  apply: (mesh, { transform }) => mesh.position.set(transform.x, 0, transform.y)
})

const runtime = Game.Runtime.make({
  services: Game.Runtime.services(
    Game.Runtime.service(Meshes, NodeRegistry.make<Mesh>({
      attach: (mesh) => scene.add(mesh),
      detach: (mesh) => scene.remove(mesh)
    }))
  )
})
```

For Pixi, [`@typeonce/bevy-ts-pixi`](https://www.npmjs.com/package/@typeonce/bevy-ts-pixi) provides `PixiNodeRegistry.make(container)`, an implementation of the same registry contract. The host provides it with `Game.Runtime.service`; render systems keep depending on the generic service descriptor.

Released together with [`@typeonce/bevy-ts`](https://www.npmjs.com/package/@typeonce/bevy-ts), always with the same version.

Documentation: https://sandromaglione.github.io/bevy-ts/ ·
Source: https://github.com/SandroMaglione/bevy-ts

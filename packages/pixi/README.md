# `@typeonce/bevy-ts-pixi`

Pixi integrations for bevy-ts: a render-node registry keyed by entity (`NodeRegistry`), a system that creates, updates, and destroys renderer nodes from ECS entities (`RenderSync.system`), and a system that draws fixed-step movement smoothly between steps (`RenderSync.interpolate`).

```sh
pnpm add @typeonce/bevy-ts-pixi @typeonce/bevy-ts
```

Bring your own `pixi.js` application; the package does not import it.

Released together with [`@typeonce/bevy-ts`](https://www.npmjs.com/package/@typeonce/bevy-ts), always with the same version.

Documentation: https://sandromaglione.github.io/bevy-ts/ ·
Source: https://github.com/SandroMaglione/bevy-ts

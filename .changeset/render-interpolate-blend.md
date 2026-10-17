---
"@typeonce/ritmo-render": minor
---

`RenderSync.interpolate` takes a `blend` option for values beyond a 2D position (3D positions, angles, scales), and `place` receives what `blend` returns. Without `blend` only `x` and `y` are blended, so `blend` is now required when a component is not `{ x, y }` or holds other numbers: a `{ x, y, z }` position no longer type-checks while its `z` is silently left unblended.

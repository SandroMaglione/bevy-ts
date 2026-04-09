# Platform Packages

`bevy-ts` core stays platform-agnostic and renderer-agnostic.

Extra packages are allowed when they stay platform-specific and encapsulate a stable integration boundary that user code would otherwise have to rewrite in every project. These packages must be composable lego blocks: they own lifecycle and plumbing, while callers keep control over schema, resources, services, schedules, and game semantics.

## Good Packages

### `@bevy-ts/browser`

Own browser-specific infrastructure:

- browser loop and ticker ownership
- mount lifecycle and teardown helpers
- viewport and frame-time capture
- browser input source helpers that produce caller-defined snapshots

This package must not own gameplay resources or feature flow.

### `@bevy-ts/pixi`

Own Pixi-specific infrastructure:

- Pixi application and root container lifecycle
- scene and world host setup primitives
- entity-id render node registry lifecycle
- teardown helpers
- renderer-side sync helpers that remain generic across games

This package must not own sprite conventions, HUD semantics, actor kinds, or camera policy.

## Bad Packages

These do not belong as public platform packages:

- `@bevy-ts/platformer-hud`
- `@bevy-ts/browser-runtime`
- `@bevy-ts/browser-rendered`
- `@bevy-ts/pixi-top-down-player`
- any package that bundles input, rendering, state, and gameplay into one opinionated runtime

Those abstractions are feature-specific, not platform-specific. They stop being composable as soon as a game has slightly different behavior.

## Inclusion Rule

A package is a good fit only if:

1. The owned responsibility is defined by the host platform or integration boundary.
2. The repeated logic is infrastructure, not gameplay.
3. Variation can be expressed through strict typed inputs, descriptors, and callbacks.
4. Users can compose the package without casts, broad overloads, or explicit generic arguments for normal usage.

If an abstraction mainly exists to hide game-specific decisions, it should stay in app code or examples, not in a public package.

/**
 * Pixi-specific integrations for mirroring ECS entities into Pixi nodes.
 *
 * The generic parts (the entity-keyed node registry and the render sync
 * systems) live in `@typeonce/bevy-ts-render` and are re-exported here, so
 * `NodeRegistry` and `RenderSync` keep their whole API. This package adds
 * what is Pixi-shaped: `NodeRegistry.inContainer`, a registry whose nodes are
 * children of one Pixi container.
 *
 * Public APIs here stay renderer-specific and avoid feature-level opinions
 * (sprite conventions, HUDs, cameras) so they remain composable across games.
 */
export * as NodeRegistry from "./NodeRegistry.ts"
export * as RenderSync from "./RenderSync.ts"

export const packageTag = "pixi" as const

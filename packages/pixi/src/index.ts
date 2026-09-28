/**
 * Pixi-specific integrations: entity-keyed node registries and the systems
 * that keep them in sync with the ECS world.
 *
 * Public APIs here stay renderer-specific and avoid feature-level opinions
 * (sprite conventions, HUDs, cameras) so they remain composable across games.
 */
export * as NodeRegistry from "./NodeRegistry.ts"
export * as RenderSync from "./RenderSync.ts"

export const packageTag = "pixi" as const

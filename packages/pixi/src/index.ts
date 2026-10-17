/**
 * Pixi-specific adapters for the renderer-independent ritmo render contracts.
 *
 * `PixiNodeRegistry.make` builds a registry backed by a Pixi container. Provide
 * it as a runtime service to the systems from `@typeonce/ritmo-render`.
 *
 * Public APIs here stay renderer-specific and avoid feature-level opinions
 * (sprite conventions, HUDs, cameras) so they remain composable across games.
 */
export * as PixiNodeRegistry from "./PixiNodeRegistry.ts"

export const packageTag = "pixi" as const

/**
 * Renderer-agnostic integrations: entity-keyed node registries and the
 * systems that keep them in sync with the ECS world.
 *
 * Nothing here imports or assumes a renderer (Pixi, Three.js, the DOM, a
 * canvas): how a node is attached, released, and drawn stays caller-defined,
 * so the same bookkeeping serves every renderer. Renderer packages such as
 * `@typeonce/ritmo-pixi` build on it.
 */
export * as NodeRegistry from "./NodeRegistry.ts"
export * as RenderSync from "./RenderSync.ts"

export const packageTag = "render" as const

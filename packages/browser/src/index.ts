/** Browser host integrations kept outside the renderer-agnostic ECS core. */
export * as FixedLoop from "./FixedLoop.ts"
export * as Keyboard from "./Keyboard.ts"

export const packageTag = "browser" as const

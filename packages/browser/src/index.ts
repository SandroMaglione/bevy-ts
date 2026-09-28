/** Browser host integrations kept outside the renderer-agnostic ECS core. */
export * as FixedLoop from "./FixedLoop.ts"
export * as InputCapture from "./InputCapture.ts"
export * as Keyboard from "./Keyboard.ts"
export * as Pointer from "./Pointer.ts"

export const packageTag = "browser" as const

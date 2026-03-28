import type { ScheduleDefinition } from "./schedule.ts"
import type { Runtime } from "./runtime.ts"
import type { Schema } from "./schema.ts"

/**
 * A thin application wrapper around a loop-agnostic runtime.
 *
 * Use this when you want a Bevy-like entrypoint object without giving up control
 * over the game loop. The app only forwards schedule execution to the runtime.
 */
export interface App<S extends Schema.Any, Services extends Record<string, unknown>> {
  /**
   * The underlying runtime that owns world state and service provisioning.
   */
  readonly runtime: Runtime<S, Services>
  /**
   * Runs one or more initialization schedules before the main loop.
   */
  readonly bootstrap: (...schedules: ReadonlyArray<ScheduleDefinition<S>>) => void
  /**
   * Runs one or more schedules once.
   *
   * Use this from an external loop, test, or host integration whenever you
   * want one ECS update step.
   */
  readonly update: (...schedules: ReadonlyArray<ScheduleDefinition<S>>) => void
}

/**
 * Creates an application facade on top of an existing runtime.
 *
 * This is useful when you want to expose a familiar `app.update(...)` API while
 * still keeping the runtime reusable from any external loop or host.
 */
export const makeApp = <S extends Schema.Any, Services extends Record<string, unknown>>(
  runtime: Runtime<S, Services>
): App<S, Services> => ({
  runtime,
  bootstrap(...schedules) {
    runtime.initialize(...schedules)
  },
  update(...schedules) {
    runtime.tick(...schedules)
  }
})

import type { Runtime, RuntimeResources, RuntimeStates } from "./runtime.ts"
import type { Schema } from "./schema.ts"

export interface App<
  R extends Runtime<any, any, any, any, any>
> {
  /**
   * The underlying runtime that owns world state and service provisioning.
   */
  readonly runtime: R
  /**
   * Runs one or more initialization schedules before the main loop.
   */
  readonly bootstrap: R["initialize"]
  /**
   * Runs one or more schedules once.
   *
   * Use this from an external loop, test, or host integration whenever you
   * want one ECS update step.
   */
  readonly update: R["tick"]
}

/**
 * Creates an application facade on top of an existing runtime.
 *
 * This is useful when you want to expose a familiar `app.update(...)` API while
 * still keeping the runtime reusable from any external loop or host.
 */
export const makeApp = <
  R extends Runtime<any, any, any, any, any>
>(
  runtime: R
): App<R> => ({
  runtime,
  bootstrap: ((...schedules: ReadonlyArray<never>) =>
    runtime.initialize(...schedules as never)) as App<R>["bootstrap"],
  update: ((...schedules: ReadonlyArray<never>) =>
    runtime.tick(...schedules as never)) as App<R>["update"]
})

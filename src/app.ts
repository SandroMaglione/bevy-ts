import type { Runtime, RuntimeResources, RuntimeStates } from "./runtime.ts"
import type { Schema } from "./schema.ts"

export interface App<
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  Resources extends RuntimeResources<S> = {},
  States extends RuntimeStates<S> = {}
> {
  /**
   * The underlying runtime that owns world state and service provisioning.
   */
  readonly runtime: Runtime<S, Services, Resources, States>
  /**
   * Runs one or more initialization schedules before the main loop.
   */
  readonly bootstrap: Runtime<S, Services, Resources, States>["initialize"]
  /**
   * Runs one or more schedules once.
   *
   * Use this from an external loop, test, or host integration whenever you
   * want one ECS update step.
   */
  readonly update: Runtime<S, Services, Resources, States>["tick"]
}

/**
 * Creates an application facade on top of an existing runtime.
 *
 * This is useful when you want to expose a familiar `app.update(...)` API while
 * still keeping the runtime reusable from any external loop or host.
 */
export const makeApp = <
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  Resources extends RuntimeResources<S> = {},
  States extends RuntimeStates<S> = {}
>(
  runtime: Runtime<S, Services, Resources, States>
): App<S, Services, Resources, States> => ({
  runtime,
  bootstrap: ((...schedules: ReadonlyArray<never>) =>
    runtime.initialize(...schedules as never)) as App<S, Services, Resources, States>["bootstrap"],
  update: ((...schedules: ReadonlyArray<never>) =>
    runtime.tick(...schedules as never)) as App<S, Services, Resources, States>["update"]
})

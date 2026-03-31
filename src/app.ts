/**
 * Small application facade over a runtime.
 *
 * `App` does not own game state separately from `Runtime`. It only exposes a
 * familiar `bootstrap(...)` / `update(...)` shape on top of the same runtime
 * value, so host code can stay simple without hiding the underlying ECS model.
 *
 * @example
 * ```ts
 * const runtime = Game.Runtime.make({
 *   services: Game.Runtime.services()
 * })
 *
 * const app = App.makeApp(runtime)
 * app.update(updateSchedule)
 * ```
 */
import type { Runtime } from "./runtime.ts"

export interface App<
  R extends Runtime<any, any, any, any, any, any>
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
 *
 * `bootstrap(...)` is an alias of `runtime.initialize(...)`, and `update(...)`
 * is an alias of `runtime.tick(...)`.
 *
 * @example
 * ```ts
 * const runtime = Game.Runtime.make({
 *   services: Game.Runtime.services()
 * })
 *
 * const app = App.makeApp(runtime)
 * app.bootstrap(setupSchedule)
 * app.update(updateSchedule)
 * ```
 */
export const makeApp = <
  R extends Runtime<any, any, any, any, any, any>
>(
  runtime: R
): App<R> => ({
  runtime,
  bootstrap: runtime.initialize,
  update: runtime.tick
})

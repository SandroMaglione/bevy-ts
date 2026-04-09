/**
 * Small application facade over a runtime.
 *
 * `App` exists for the outermost host layer: browser bootstraps, tests, game
 * loops, engine adapters, or demos that want a familiar `bootstrap(...)` /
 * `update(...)` entrypoint without introducing a second ownership layer for
 * the ECS world.
 *
 * In this library the runtime is still the real owner of world state,
 * services, events, lifecycle buffers, and schedule execution. `App` only
 * gives that runtime an application-shaped shell so integration code can stay
 * simple while ECS semantics remain explicit.
 *
 * Reach for this module when the host should think in terms of "initialize the
 * game once, then advance one frame at a time", but you still want schedules
 * and runtime boundaries to stay visible in the implementation.
 *
 * @module app
 * @docGroup runtime
 *
 * @groupDescription Interfaces
 * Public facade contracts that expose a minimal application-shaped wrapper over one runtime.
 *
 * @groupDescription Functions
 * Helpers that wrap an existing runtime in a small `bootstrap` / `update` facade.
 *
 * @example
 * ```ts
 * // Build the runtime first. `App` wraps it, but does not replace it.
 * const runtime = Game.Runtime.make({
 *   schema: Game,
 *   services: Game.Runtime.services(
 *     Game.Runtime.service(RenderClock, { now: () => performance.now() })
 *   )
 * })
 *
 * // Expose a host-friendly shape to the outer game loop.
 * const app = App.makeApp(runtime)
 *
 * // Run setup schedules once before the frame loop starts.
 * app.bootstrap(setupSchedule)
 *
 * // Advance one explicit ECS frame from the host loop.
 * const frame = () => {
 *   app.update(updateSchedule)
 *   requestAnimationFrame(frame)
 * }
 *
 * requestAnimationFrame(frame)
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
 * Use this at the integration boundary when you want a stable "app" object
 * for a browser host, test harness, or engine adapter, but you do not want to
 * hide the fact that schedules still drive everything underneath.
 *
 * `bootstrap(...)` remains a direct alias of `runtime.initialize(...)`, and
 * `update(...)` remains a direct alias of `runtime.tick(...)`. The wrapper is
 * ergonomic, not semantic.
 *
 * @example
 * ```ts
 * // Construct the ECS runtime with the services the systems declared.
 * const runtime = Game.Runtime.make({
 *   schema: Game,
 *   services: Game.Runtime.services(
 *     Game.Runtime.service(RenderClock, { now: () => performance.now() })
 *   )
 * })
 *
 * // Wrap it once so the outer host deals with a tiny app-shaped contract.
 * const app = App.makeApp(runtime)
 *
 * // Bootstrap setup schedules before starting the steady update loop.
 * app.bootstrap(setupSchedule)
 *
 * // Drive one schedule per host frame or test step.
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

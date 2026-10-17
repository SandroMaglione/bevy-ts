/**
 * The static lints of a game's schedules, as a tool: `describe()`'s lints over
 * a headless runtime, each with its fix, and a verdict (warnings fail, info
 * does not).
 *
 * Run it from a game's `check` script with the CLI:
 *
 * ```sh
 * ritmo-devtools lint src/simulation.ts
 * ```
 *
 * The entry module exports `lintTarget`, a function that builds the game's
 * headless runtime (made with `debug: { hostClock }`) and names its schedules: the
 * ones ticked headless in `schedules`, and the ones that need a renderer or
 * other host services in `describe` (described and linted, never run).
 *
 * Use `Session.make(...).describe()` instead to read the lints while
 * debugging; this module is for the pass/fail check.
 *
 * @module Lint
 * @docGroup devtools
 *
 * @example
 * ```ts
 * // src/simulation.ts
 * export const lintTarget = (): Lint.Target<typeof Game.schema, typeof Game.schema> => {
 *   const sim = createSimulation({ keyboard: Keyboard.scripted(bindings, []) })
 *   return { runtime: sim.runtime, schedules: { setup: sim.setup, update: sim.update }, describe: { render } }
 * }
 * ```
 */
import type * as Debug from "@typeonce/ritmo/Debug"
import type { AnyScheduleOrder, ExecutableScheduleDefinition } from "@typeonce/ritmo/Schedule"
import type { Schema } from "@typeonce/ritmo/Schema"

import * as Rendered from "./Rendered.ts"

type AnySchedule<S extends Schema.Any, Root> = ExecutableScheduleDefinition<S, any, Root, any, any, AnyScheduleOrder>

/** What `lintTarget` returns. */
export interface Target<S extends Schema.Any, Root> {
  /** A runtime made with `debug: { hostClock }`. */
  readonly runtime: { readonly debug: Debug.Handle<S, Root> }
  /** The schedules the game ticks, by name. */
  readonly schedules: Readonly<Record<string, AnySchedule<S, Root>>>
  /** Schedules to describe without running (a render schedule needing a renderer). */
  readonly describe?: Readonly<Record<string, AnySchedule<S, Root>>>
  /** Events the host publishes with `runtime.send` (UI requests, network messages): written, for the lints. */
  readonly hostEvents?: ReadonlyArray<Schema.EventDescriptor<S>>
}

export interface Report {
  readonly lints: ReadonlyArray<Debug.Lint>
  readonly warnings: number
  readonly infos: number
  /** `true` when there is no warning-level lint. */
  readonly ok: boolean
}

/** Lints the target's schedules. */
export const run = <S extends Schema.Any, Root>(target: Target<S, Root>): Rendered.Rendered<Report> => {
  target.runtime.debug.nameSchedules({ ...target.describe, ...target.schedules })
  target.runtime.debug.declareHostEvents(target.hostEvents ?? [])
  const lints = target.runtime.debug.describe().lints
  const warnings = lints.filter((lint) => lint.severity === "warning").length
  const report: Report = { lints, warnings, infos: lints.length - warnings, ok: warnings === 0 }
  const lines = [
    ...lints.flatMap((lint) => [`${lint.severity} ${lint.code} ${lint.subject}: ${lint.message}`, `  fix: ${lint.fix}`]),
    `${warnings} ${warnings === 1 ? "warning" : "warnings"}, ${report.infos} info${warnings > 0 ? " (warnings fail)" : ""}`
  ]
  return Rendered.make(report, lines.join("\n"))
}

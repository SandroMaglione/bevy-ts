/**
 * A debug session around a runtime made with `debug: true`.
 *
 * The session names the schedules it drives, keeps a bounded history of
 * trace events, and answers questions about it as text and data:
 *
 * - `run(name, { frames, until })` ticks a schedule frame by frame and stops
 *   at the first system failure, thrown defect, or violated invariant.
 * - `journal(filter)` lists what happened, one fact per line, filtered by
 *   frames, entity, component, resource, event, machine, system, or kind.
 * - `why(entity, component)` lists the latest changes to one component.
 * - `system(name)` shows one system's declared access and recent activity.
 * - `describe()`, `dump(filter)`, `streams()` render the core debug handle.
 * - `report()` summarizes per-system timing and warnings accumulated while
 *   tracing: missed reads, commands still pending at the end of a frame,
 *   failed transitions, and skipped systems that discarded messages.
 *
 * Everything returns a `Rendered` value that prints as text.
 *
 * @module Session
 * @docGroup devtools
 *
 * @example
 * ```ts
 * const session = Session.make(runtime, {
 *   schedules: { setup: setupSchedule, update: updateSchedule },
 *   invariants: [PlayerInsideWorld]
 * })
 * session.run("setup")
 * console.log(session.run("update", { frames: 300 }))
 * console.log(session.why(1, Position))
 * console.log(session.journal({ frames: [180, 185], entity: 1 }))
 * ```
 */
import type * as Debug from "@typeonce/bevy-ts/Debug"
import type * as Machine from "@typeonce/bevy-ts/Machine"
import type * as Result from "@typeonce/bevy-ts/Result"
import type { ExecutableScheduleDefinition } from "@typeonce/bevy-ts/Schedule"
import type { Schema } from "@typeonce/bevy-ts/Schema"

import * as Format from "./Format.ts"
import type { Invariant } from "./Invariant.ts"
import * as Rendered from "./Rendered.ts"

/**
 * What a session needs from a runtime: its debug handle and the dynamic
 * `tryTick`, which reports missing requirements as data.
 */
export interface Target<S extends Schema.Any, Root> {
  readonly debug: Debug.Handle<S, Root>
  readonly tryTick: (schedule: ExecutableScheduleDefinition<S, any, any, any, any>) => Result.Result<void, unknown>
}

export interface Options<S extends Schema.Any, Root, Names extends string> {
  /** The schedules `run` can drive, by name. Also names them in traces. */
  readonly schedules: Readonly<Record<Names, ExecutableScheduleDefinition<S, any, Root, any, any>>>
  /** Checked after every frame of every run. */
  readonly invariants?: ReadonlyArray<Invariant>
  /** Frames of trace history kept for `journal` and `why`. Defaults to 600. */
  readonly history?: number
  /** Value formatting for all text output. */
  readonly format?: Format.ValueOptions
}

export interface RunOptions {
  /** Frames to run. Defaults to 1. */
  readonly frames?: number
  /** Stops after the first frame for which this returns `true`. */
  readonly until?: (frame: number) => boolean
}

/** Why a run stopped. `completed` and `until` are the successful ones. */
export type Stop =
  | { readonly reason: "completed" }
  | { readonly reason: "until"; readonly frame: number }
  | { readonly reason: "failure"; readonly frame: number; readonly system: string; readonly error: unknown }
  | { readonly reason: "missingRequirements"; readonly frame: number; readonly requirements: unknown }
  | { readonly reason: "defect"; readonly frame: number; readonly error: unknown }
  | { readonly reason: "invariant"; readonly frame: number; readonly invariant: string; readonly message: string }

export interface RunResult {
  readonly schedule: string
  /** Whether the run completed or reached `until`. */
  readonly ok: boolean
  readonly frames: number
  /** First and last frame numbers run, or `undefined` when none ran. */
  readonly range: readonly [number, number] | undefined
  readonly stop: Stop
  readonly ms: number
  /** Warning-level lints over the named schedules; details in `describe()`. */
  readonly lintWarnings: number
}

export interface JournalFilter<S extends Schema.Any> {
  /** One frame or an inclusive `[from, to]` range. */
  readonly frames?: number | readonly [number, number]
  /** Only the last `n` frames of history. */
  readonly last?: number
  readonly entity?: number
  readonly component?: Schema.ComponentDescriptor<S>
  readonly resource?: Schema.ResourceDescriptor<S>
  readonly event?: Schema.EventDescriptor<S>
  readonly machine?: Machine.StateMachine.Any
  /** System name. */
  readonly system?: string
  /** Schedule path prefix, for example `update`. */
  readonly schedule?: string
  readonly kinds?: ReadonlyArray<Format.LineKind>
  /** Keep only the most recent `n` lines. */
  readonly limit?: number
  /**
   * Include lines that record no change (equal-value writes, transitions to
   * the current state, skips that discarded nothing). Defaults to `false`.
   */
  readonly verbose?: boolean
}

export interface SystemStats {
  readonly system: string
  readonly runs: number
  readonly failures: number
  readonly skips: number
  readonly totalMs: number
  readonly maxMs: number
}

export interface Warning {
  readonly code:
    | "missed-read"
    | "pending-commands"
    | "pending-next-state"
    | "transition-failed"
    | "discarded-messages"
    | "system-failed"
  readonly message: string
  readonly count: number
  readonly firstFrame: number
  readonly lastFrame: number
}

export interface Report {
  readonly frames: number
  readonly history: readonly [number, number] | undefined
  readonly systems: ReadonlyArray<SystemStats>
  readonly warnings: ReadonlyArray<Warning>
  /** Streams held past the two-frame window by a reader, or with lagged readers. */
  readonly streams: ReadonlyArray<Debug.StreamStatus>
  /** Static lints over the named schedules (see `describe()`). */
  readonly lints: ReadonlyArray<Debug.Lint>
}

export interface SystemActivity {
  readonly description: Debug.SystemDescription | undefined
  readonly stats: SystemStats | undefined
  readonly recent: ReadonlyArray<Format.Line>
}

export interface Session<S extends Schema.Any, Names extends string> {
  readonly run: (name: Names, options?: RunOptions) => Rendered.Rendered<RunResult>
  readonly journal: (filter?: JournalFilter<S>) => Rendered.Rendered<ReadonlyArray<Format.Line>>
  readonly why: (entity: number, component: Schema.ComponentDescriptor<S>, options?: { readonly limit?: number }) => Rendered.Rendered<ReadonlyArray<Format.Line>>
  /** Latest changes to one resource and the systems that made them. */
  readonly whyResource: (resource: Schema.ResourceDescriptor<S>, options?: { readonly limit?: number }) => Rendered.Rendered<ReadonlyArray<Format.Line>>
  readonly system: (name: string, options?: { readonly limit?: number }) => Rendered.Rendered<SystemActivity>
  readonly describe: () => Rendered.Rendered<Debug.Description>
  readonly dump: (filter?: Debug.DumpFilter<S>) => Rendered.Rendered<Debug.WorldDump>
  readonly streams: () => Rendered.Rendered<ReadonlyArray<Debug.StreamStatus>>
  readonly report: () => Rendered.Rendered<Report>
  /** Frames run by the runtime so far. */
  readonly frame: () => number
  /** Stops tracing. Queries keep working on the history recorded so far. */
  readonly close: () => void
}

interface FrameRecord {
  readonly frame: number
  readonly events: Array<Debug.TraceEvent>
}

const inRange = (frame: number, frames: number | readonly [number, number] | undefined): boolean =>
  frames === undefined ? true
  : typeof frames === "number" ? frame === frames
  : frame >= frames[0] && frame <= frames[1]

const describeError = (error: unknown): { readonly kind?: unknown; readonly system?: unknown; readonly error?: unknown; readonly requirements?: unknown } =>
  typeof error === "object" && error !== null ? error : {}

export const make = <S extends Schema.Any, Root, const Names extends string>(
  runtime: Target<S, Root>,
  options: Options<S, Root, Names>
): Session<S, Names> => {
  const debug = runtime.debug
  const capacity = options.history ?? 600
  const format = options.format ?? {}
  const schedules = options.schedules as Readonly<Record<string, ExecutableScheduleDefinition<S, any, Root, any, any>>>
  debug.nameSchedules(schedules)

  const history: Array<FrameRecord> = []
  let current: FrameRecord = { frame: debug.frame(), events: [] }
  history.push(current)

  const stats = new Map<string, { runs: number; failures: number; skips: number; totalMs: number; maxMs: number }>()
  const statsOf = (system: string) => {
    let entry = stats.get(system)
    if (!entry) {
      entry = { runs: 0, failures: 0, skips: 0, totalMs: 0, maxMs: 0 }
      stats.set(system, entry)
    }
    return entry
  }
  const warnings = new Map<string, { code: Warning["code"]; message: string; count: number; firstFrame: number; lastFrame: number }>()
  const warn = (code: Warning["code"], key: string, message: string, frame: number) => {
    const existing = warnings.get(key)
    if (existing) {
      existing.count += 1
      existing.lastFrame = frame
    } else {
      warnings.set(key, { code, message, count: 1, firstFrame: frame, lastFrame: frame })
    }
  }

  /** Commands queued and not yet applied, by queuing system. */
  const pending = new Map<string, number>()
  /** Next states queued and not yet applied, by machine, with the queuing system. */
  const pendingStates = new Map<string, string>()
  const checkPending = (frame: number) => {
    for (const [machine, system] of pendingStates) {
      warn(
        "pending-next-state",
        `pending-state:${machine}`,
        `a next state of ${machine} queued by ${system} was still pending at the end of a frame; only an applyStateTransitions() marker applies it`,
        frame
      )
    }
    if (pending.size === 0) return
    const systems = [...pending.keys()].sort()
    const count = [...pending.values()].reduce((total, value) => total + value, 0)
    warn(
      "pending-commands",
      `pending:${systems.join(",")}`,
      `commands queued by ${systems.join(", ")} were still pending at the end of a frame (${count} at first); the next applyDeferred() applies them`,
      frame
    )
  }

  const record = (event: Debug.TraceEvent) => {
    if (event.type === "frame") {
      checkPending(current.frame)
      current = { frame: event.frame, events: [] }
      history.push(current)
      if (history.length > capacity) history.shift()
    }
    current.events.push(event)
    switch (event.type) {
      case "system": {
        const entry = statsOf(event.system)
        entry.runs += 1
        entry.totalMs += event.ms
        entry.maxMs = Math.max(entry.maxMs, event.ms)
        if (event.outcome !== "ok") {
          entry.failures += 1
          warn("system-failed", `failed:${event.system}`, `${event.system} ${event.outcome === "defect" ? "threw" : "failed"}: ${Format.value(event.error, format)}`, event.frame)
        } else {
          if (event.commands.length > 0) pending.set(event.system, (pending.get(event.system) ?? 0) + event.commands.length)
          for (const next of event.nextStates) {
            if (next.value === undefined) pendingStates.delete(next.machine)
            else pendingStates.set(next.machine, event.system)
          }
        }
        for (const missed of event.missed) {
          warn("missed-read", `missed:${event.system}:${missed.kind}:${missed.stream}`, `${event.system} missed ${missed.kind} ${missed.stream}: entries were dropped before it ran`, event.frame)
        }
        break
      }
      case "system.skipped": {
        statsOf(event.system).skips += 1
        for (const discarded of event.discarded) {
          warn(
            "discarded-messages",
            `discarded:${event.system}:${discarded.stream}`,
            `${event.system} was skipped (${event.condition} is false) and discarded ${discarded.stream} entries published meanwhile`,
            event.frame
          )
        }
        break
      }
      case "deferred":
        pending.clear()
        break
      case "transition":
        if (event.outcome !== "failed") pendingStates.delete(event.machine)
        if (event.outcome === "failed" || event.outcome === "enterFailed") {
          warn("transition-failed", `transition:${event.machine}:${String(event.from)}:${String(event.to)}`, `transition ${event.machine} ${String(event.from)} -> ${String(event.to)} ${event.outcome}`, event.frame)
        }
        break
    }
  }
  const stopObserving = debug.observe(record)

  const historyRange = (): readonly [number, number] | undefined => {
    const first = history.find((entry) => entry.events.length > 0)
    return first === undefined ? undefined : [first.frame, history[history.length - 1]!.frame]
  }

  const run = (name: Names, runOptions: RunOptions = {}): Rendered.Rendered<RunResult> => {
    const schedule = schedules[name]!
    const frames = runOptions.frames ?? 1
    const started = performance.now()
    let first: number | undefined
    let last: number | undefined
    let stop: Stop = { reason: "completed" }
    for (let index = 0; index < frames; index++) {
      let result: Result.Result<void, unknown>
      try {
        result = runtime.tryTick(schedule)
      } catch (defect) {
        const frame = debug.frame()
        first ??= frame
        last = frame
        stop = { reason: "defect", frame, error: defect }
        break
      }
      const frame = debug.frame()
      first ??= frame
      last = frame
      if (!result.ok) {
        const error = describeError(result.error)
        stop = error.kind === "MissingRuntimeRequirements"
          ? { reason: "missingRequirements", frame, requirements: error.requirements }
          : { reason: "failure", frame, system: typeof error.system === "string" ? error.system : "(unknown)", error: error.error }
        break
      }
      const violation = (options.invariants ?? []).reduce<{ readonly invariant: string; readonly message: string } | undefined>(
        (found, invariant) => {
          if (found) return found
          const message = invariant.check()
          return message === undefined ? undefined : { invariant: invariant.name, message }
        },
        undefined
      )
      if (violation) {
        stop = { reason: "invariant", frame, ...violation }
        break
      }
      if (runOptions.until?.(frame)) {
        stop = { reason: "until", frame }
        break
      }
    }
    checkPending(debug.frame())
    const lintWarnings = debug.describe().lints.filter((lint) => lint.severity === "warning")
    const data: RunResult = {
      schedule: name,
      ok: stop.reason === "completed" || stop.reason === "until",
      frames: first === undefined || last === undefined ? 0 : last - first + 1,
      range: first === undefined || last === undefined ? undefined : [first, last],
      stop,
      ms: performance.now() - started,
      lintWarnings: lintWarnings.length
    }
    const lintText = lintWarnings.length === 0
      ? ""
      : `\n${lintWarnings.length} lint warnings (see describe() or report()): ${lintWarnings.map((lint) => `${lint.code} ${lint.subject}`).join(", ")}`
    return Rendered.make(data, renderRun(data, format) + lintText)
  }

  /** Lines hidden by the last `collectLines` call because they record no change. */
  let hidden = 0

  const collectLines = (filter: JournalFilter<S>): Array<Format.Line> => {
    hidden = 0
    const subject = filter.component?.name ?? filter.resource?.name ?? filter.event?.name ?? filter.machine?.name
    const records = filter.last === undefined ? history : history.slice(-filter.last)
    const result: Array<Format.Line> = []
    for (const entry of records) {
      if (!inRange(entry.frame, filter.frames)) continue
      for (const event of entry.events) {
        for (const line of Format.lines(event, format)) {
          if (filter.entity !== undefined && line.entity !== filter.entity) continue
          if (subject !== undefined && line.subject !== subject && !(line.kind === "effect" && line.subject === undefined && filter.entity !== undefined)) continue
          if (filter.system !== undefined && line.system !== filter.system) continue
          if (filter.schedule !== undefined && !line.schedule.startsWith(filter.schedule)) continue
          if (filter.kinds !== undefined && !filter.kinds.includes(line.kind)) continue
          if (line.noop && filter.verbose !== true) {
            hidden += 1
            continue
          }
          result.push(line)
        }
      }
    }
    return filter.limit === undefined ? result : result.slice(-filter.limit)
  }

  const renderLines = (header: string, lines: ReadonlyArray<Format.Line>): string =>
    [header, ...lines.map(Format.line)].join("\n")

  const rangeText = () => {
    const range = historyRange()
    return range === undefined ? "empty history" : `history f${range[0]}-f${range[1]}`
  }

  const journal = (filter: JournalFilter<S> = {}) => {
    const lines = collectLines(filter)
    const hiddenText = hidden > 0 ? `, ${hidden} no-change lines hidden (verbose: true shows them)` : ""
    return Rendered.make(lines, renderLines(`journal: ${lines.length} lines (${rangeText()}${hiddenText})`, lines))
  }

  const why = (entity: number, component: Schema.ComponentDescriptor<S>, whyOptions: { readonly limit?: number } = {}) => {
    const lines = collectLines({ entity, component, kinds: ["write", "effect"], limit: whyOptions.limit ?? 5 })
    const currentValue = debug.dump({ entities: [entity] }).entities[0]
    const now = currentValue === undefined
      ? `e${entity} is not alive`
      : component.name in currentValue.components
        ? `e${entity} ${component.name} is now ${Format.value(currentValue.components[component.name], format)}`
        : `e${entity} has no ${component.name} now`
    const header = lines.length === 0
      ? `${now}; no change to it in ${rangeText()}`
      : `${now}; last ${lines.length} changes (oldest first):`
    return Rendered.make(lines, renderLines(header, lines))
  }

  const whyResource = (resource: Schema.ResourceDescriptor<S>, whyOptions: { readonly limit?: number } = {}) => {
    const lines = collectLines({ resource, kinds: ["resource"], limit: whyOptions.limit ?? 5 })
    const resources = debug.dump({ limit: 0 }).resources
    const now = resource.name in resources
      ? `${resource.name} is now ${Format.value(resources[resource.name], format)}`
      : `${resource.name} has no value now`
    const header = lines.length === 0
      ? `${now}; no change to it in ${rangeText()}`
      : `${now}; last ${lines.length} changes (oldest first):`
    return Rendered.make(lines, renderLines(header, lines))
  }

  const statsFor = (system: string): SystemStats | undefined => {
    const entry = stats.get(system)
    return entry === undefined ? undefined : { system, ...entry }
  }

  const system = (name: string, systemOptions: { readonly limit?: number } = {}) => {
    const description = debug.describe().systems.find((entry) => entry.name === name)
    const recent = collectLines({ system: name, limit: systemOptions.limit ?? 20 })
    const data: SystemActivity = { description, stats: statsFor(name), recent }
    const lines: Array<string> = []
    if (description === undefined) {
      lines.push(`${name} is not in any named schedule`)
    } else {
      lines.push(Format.system(description))
    }
    const entry = data.stats
    lines.push(entry === undefined
      ? "no traced runs"
      : `${entry.runs} runs, ${entry.failures} failures, ${entry.skips} skips, avg ${Format.value(entry.runs === 0 ? 0 : entry.totalMs / entry.runs)}ms, max ${Format.value(entry.maxMs)}ms`)
    lines.push(`recent (${rangeText()}${hidden > 0 ? `, ${hidden} no-change lines hidden` : ""}):`)
    lines.push(...(recent.length === 0 ? ["(no changes recorded; journal({ system, verbose: true }) shows every line)"] : recent.map(Format.line)))
    return Rendered.make(data, lines.join("\n"))
  }

  const report = () => {
    const systems = [...stats.keys()].map((name) => statsFor(name)!).sort((left, right) => right.totalMs - left.totalMs)
    const data: Report = {
      frames: debug.frame(),
      history: historyRange(),
      systems,
      warnings: [...warnings.values()].map((warning) => ({ ...warning })),
      streams: debug.streams().filter((stream) => stream.heldBy !== undefined || stream.readers.some((reader) => reader.lagged)),
      lints: debug.describe().lints
    }
    const lines = [`${data.frames} frames run (${rangeText()})`, "", ...Format.lintLines(data.lints), "", "# Systems (by total time)"]
    for (const entry of systems) {
      lines.push(`${entry.system}: ${entry.runs} runs, avg ${Format.value(entry.runs === 0 ? 0 : entry.totalMs / entry.runs)}ms, max ${Format.value(entry.maxMs)}ms${entry.failures > 0 ? `, ${entry.failures} failures` : ""}${entry.skips > 0 ? `, ${entry.skips} skips` : ""}`)
    }
    lines.push("", "# Warnings")
    if (data.warnings.length === 0) lines.push("(none)")
    for (const warning of data.warnings) {
      lines.push(`${warning.code}: ${warning.message} (x${warning.count}, f${warning.firstFrame}-f${warning.lastFrame})`)
    }
    if (data.streams.length > 0) {
      lines.push("", "# Streams held by readers", Format.streams(data.streams))
    }
    return Rendered.make(data, lines.join("\n"))
  }

  return {
    run,
    journal,
    why,
    whyResource,
    system,
    describe: () => {
      const description = debug.describe()
      return Rendered.make(description, Format.description(description))
    },
    dump: (filter) => {
      const dumped = debug.dump(filter)
      return Rendered.make(dumped, Format.dump(dumped, format))
    },
    streams: () => {
      const status = debug.streams()
      return Rendered.make(status, Format.streams(status))
    },
    report,
    frame: () => debug.frame(),
    close: stopObserving
  }
}

const renderRun = (result: RunResult, format: Format.ValueOptions): string => {
  const frames = result.range === undefined ? "no frames" : `f${result.range[0]}-f${result.range[1]}`
  const head = `run ${result.schedule}: ${result.frames} frames (${frames}) in ${Format.value(result.ms)}ms`
  const stop = result.stop
  switch (stop.reason) {
    case "completed":
      return `${head}, completed`
    case "until":
      return `${head}, stopped at f${stop.frame}: until() returned true`
    case "failure":
      return `${head}, FAILED at f${stop.frame}: ${stop.system} returned ${Format.value(stop.error, format)}`
    case "missingRequirements":
      return `${head}, FAILED at f${stop.frame}: missing runtime requirements ${Format.value(stop.requirements, format)}`
    case "defect":
      return `${head}, DEFECT at f${stop.frame}: ${stop.error instanceof Error ? stop.error.stack ?? stop.error.message : Format.value(stop.error, format)}`
    case "invariant":
      return `${head}, INVARIANT "${stop.invariant}" violated at f${stop.frame}: ${stop.message}`
  }
}

/**
 * Opt-in runtime introspection for tools, tests, and coding agents.
 *
 * A runtime made with `debug: true` carries a `debug` handle. Runtimes made
 * without it have no handle at all, so production code cannot reach into
 * internals by accident and pays nothing for them.
 *
 * The handle is read-only: it describes the schema and schedules, dumps the
 * current world as plain data, reports stream retention, and streams trace
 * events while schedules run. Nothing it returns can change the world.
 *
 * - `describe()` is static: every component, resource, event, relation,
 *   machine, and service, each named schedule's steps, each system's declared
 *   access, who reads and writes what, and lints over that graph.
 * - `dump(filter?)` is the current world: entities with component values and
 *   relation targets, resources, machine values, and pending commands. It
 *   works even when `snapshot()` is gated, because a dump is never restored.
 * - `observe(listener)` delivers one `TraceEvent` per frame start, schedule
 *   boundary, system run or skip, applied marker, and machine transition.
 *   System runs carry every component, resource, event, and next-state write
 *   with before/after values; applied markers carry every command with the
 *   system that queued it and its structural effects.
 * - `streams()` reports each event, transition-event, and relation-failure
 *   stream: its size, and each reader's unread count and loss.
 *
 * Values in descriptions, dumps, and traces are shared with the world, not
 * copied. World values are immutable by contract, so they stay valid as a
 * history, but serialize them before sending them elsewhere.
 *
 * `@typeonce/bevy-ts-devtools` builds sessions, histories, formatting, and invariants
 * on top of this handle.
 *
 * @module Debug
 * @docGroup runtime
 *
 * @example
 * ```ts
 * const runtime = Game.Runtime.make({ services, resources, debug: true })
 * runtime.debug.nameSchedules({ setup: setupSchedule, update: updateSchedule })
 *
 * const stop = runtime.debug.observe((event) => {
 *   if (event.type === "system" && event.outcome !== "ok") console.log(event)
 * })
 * runtime.tick(setupSchedule)
 * console.log(runtime.debug.dump({ with: [Player] }))
 * stop()
 * ```
 */
import type * as Machine from "./Machine.ts"
import type { ExecutableScheduleDefinition } from "./Schedule.ts"
import type { Schema } from "./Schema.ts"

/** Version of the description, dump, and trace formats. */
export const formatVersion = 1 as const

/**
 * The debug handle of a runtime made with `debug: true`.
 */
export interface Handle<S extends Schema.Any = Schema.Any, Root = unknown> {
  /**
   * Names schedules for `describe()` and traces. Schedules that were never
   * named appear as `schedule#N` in traces and are not described. Transition
   * schedules are named after their transition, for example
   * `onEnter(Game/Flow=Playing)`. Naming again replaces earlier names.
   */
  readonly nameSchedules: (
    schedules: Readonly<Record<string, ExecutableScheduleDefinition<S, any, Root, any, any>>>
  ) => void
  /** The static description of the schema and the named schedules. */
  readonly describe: () => Description
  /** The current world as plain data. */
  readonly dump: (filter?: DumpFilter<S>) => WorldDump
  /**
   * Delivers trace events until the returned function is called. Tracing is
   * active only while at least one listener is registered.
   */
  readonly observe: (listener: (event: TraceEvent) => void) => () => void
  /** Retention and reader state of every stream that has readers or entries. */
  readonly streams: () => ReadonlyArray<StreamStatus>
  /** Live entity count and, per component, how many entities have it. Cheap enough to sample every frame. */
  readonly population: () => Population
  /** Number of frames (`tick`/`tryTick` calls) run so far. */
  readonly frame: () => number
}

/**
 * How a component or resource descriptor treats its values: `constructed`
 * values go through the descriptor's constructor, `transient` ones are left
 * out of snapshots, `plain` ones are neither.
 */
export type Storage = "constructed" | "transient" | "plain"

export interface ComponentDescription {
  readonly name: string
  readonly storage: Storage
}

export interface ResourceDescription {
  readonly name: string
  readonly storage: Storage
  /** Whether the resource currently has a value. */
  readonly present: boolean
}

export interface RelationDescription {
  readonly name: string
  readonly relatedName: string
  readonly kind: "hierarchy" | "relation"
  readonly linkedDespawn: boolean
  readonly ordered: boolean
}

export interface MachineDescription {
  readonly name: string
  readonly states: ReadonlyArray<Machine.StateValue>
  /** The committed value, or `undefined` when the runtime does not provide the machine. */
  readonly current: Machine.StateValue | undefined
}

export interface ServiceDescription {
  readonly name: string
  readonly provided: boolean
}

/** One query slot of a system, as component and relation names. */
export interface QueryDescription {
  readonly slot: string
  readonly reads: ReadonlyArray<string>
  readonly writes: ReadonlyArray<string>
  readonly optional: ReadonlyArray<string>
  readonly with: ReadonlyArray<string>
  readonly without: ReadonlyArray<string>
  readonly added: ReadonlyArray<string>
  readonly changed: ReadonlyArray<string>
  /** Relation filters and reads, for example `with ChildOf` or `read Children`. */
  readonly relations: ReadonlyArray<string>
}

/** Everything one system declares, by name. */
export interface SystemDescription {
  readonly name: string
  /** Where the system runs, as `schedule#step`. */
  readonly placements: ReadonlyArray<string>
  readonly queries: ReadonlyArray<QueryDescription>
  readonly resources: { readonly reads: ReadonlyArray<string>; readonly writes: ReadonlyArray<string> }
  readonly events: { readonly reads: ReadonlyArray<string>; readonly writes: ReadonlyArray<string> }
  readonly machines: {
    readonly reads: ReadonlyArray<string>
    readonly next: ReadonlyArray<string>
    readonly transitions: ReadonlyArray<string>
    readonly transitionEvents: ReadonlyArray<string>
  }
  readonly removed: ReadonlyArray<string>
  readonly despawned: boolean
  readonly relationFailures: ReadonlyArray<string>
  readonly services: ReadonlyArray<string>
  /** Run conditions, rendered, for example `stateChanged(Game/Flow)`. */
  readonly when: ReadonlyArray<string>
}

export type StepDescription =
  | { readonly kind: "system"; readonly system: string }
  | { readonly kind: "applyDeferred" }
  | { readonly kind: "applyStateTransitions"; readonly schedules: ReadonlyArray<string> }

export interface ScheduleDescription {
  readonly name: string
  readonly steps: ReadonlyArray<StepDescription>
}

/**
 * A finding about the described schedules. `warning` is almost certainly a
 * bug; `info` is worth a look but can be intentional.
 */
export interface Lint {
  readonly severity: "warning" | "info"
  readonly code:
    | "event-never-read"
    | "event-never-written"
    | "next-state-never-applied"
    | "component-never-read"
    | "read-before-write"
  readonly message: string
  readonly subject: string
}

/** Readers and writers of one component, resource, or event. */
export interface AccessIndexEntry {
  readonly name: string
  readonly readers: ReadonlyArray<string>
  readonly writers: ReadonlyArray<string>
}

export interface Description {
  readonly version: typeof formatVersion
  readonly components: ReadonlyArray<ComponentDescription>
  readonly resources: ReadonlyArray<ResourceDescription>
  readonly events: ReadonlyArray<{ readonly name: string }>
  readonly relations: ReadonlyArray<RelationDescription>
  readonly machines: ReadonlyArray<MachineDescription>
  readonly services: ReadonlyArray<ServiceDescription>
  readonly schedules: ReadonlyArray<ScheduleDescription>
  readonly systems: ReadonlyArray<SystemDescription>
  /**
   * Readers and writers across the named schedules. Component writers are
   * systems with a write query slot; command inserts are not static.
   */
  readonly access: {
    readonly components: ReadonlyArray<AccessIndexEntry>
    readonly resources: ReadonlyArray<AccessIndexEntry>
    readonly events: ReadonlyArray<AccessIndexEntry>
  }
  readonly lints: ReadonlyArray<Lint>
}

/** How many entities are alive, and how many have each component. */
export interface Population {
  readonly entities: number
  /** Entities per component, by descriptor name, for every schema component. */
  readonly components: Readonly<Record<string, number>>
}

/**
 * Narrows a dump. Entity ids are the raw numbers printed in dumps and traces.
 */
export interface DumpFilter<S extends Schema.Any = Schema.Any> {
  /** Only these entities. */
  readonly entities?: ReadonlyArray<number>
  /** Only entities that have every one of these components. */
  readonly with?: ReadonlyArray<Schema.ComponentDescriptor<S>>
  /** At most this many entities, lowest ids first. */
  readonly limit?: number
}

export interface EntityDump {
  readonly id: number
  /** Component values by descriptor name, transient ones included. */
  readonly components: Readonly<Record<string, unknown>>
  /** Relation targets by relation name. */
  readonly relations: Readonly<Record<string, number>>
}

export interface MachineDump {
  readonly current: Machine.StateValue
  /** The queued next value, applied at the next `applyStateTransitions`. */
  readonly pending?: Machine.StateValue
  readonly previous?: Machine.StateValue
}

export interface PendingCommand {
  readonly tag: string
  /** The system that queued the command. */
  readonly system: string
}

export interface WorldDump {
  readonly version: typeof formatVersion
  readonly frame: number
  readonly tick: number
  /** Live entities before filtering. */
  readonly entityCount: number
  readonly entities: ReadonlyArray<EntityDump>
  readonly resources: Readonly<Record<string, unknown>>
  readonly machines: Readonly<Record<string, MachineDump>>
  /** Commands queued and not yet applied by a marker. */
  readonly pendingCommands: ReadonlyArray<PendingCommand>
}

/** One reader of a stream. */
export interface StreamReaderStatus {
  readonly system: string
  /** Entries published after the reader's previous run. */
  readonly unread: number
  /** Whether entries the reader never saw were dropped at capacity. */
  readonly lagged: boolean
}

export interface StreamStatus {
  readonly kind: "event" | "transitionEvent" | "relationFailure"
  /** The event, machine, or relation name. */
  readonly stream: string
  /** Retained entries. */
  readonly size: number
  readonly capacity: number
  readonly readers: ReadonlyArray<StreamReaderStatus>
  /**
   * The reader whose unread entries keep the oldest batch alive, when a
   * reader (not the two-frame window) is what holds it.
   */
  readonly heldBy: string | undefined
}

/** A component written in place by a system's write query slot. */
export interface ComponentWrite {
  readonly entity: number
  readonly component: string
  readonly before: unknown
  readonly after: unknown
}

export interface ResourceWrite {
  readonly resource: string
  /** `undefined` when the resource had no value. */
  readonly before: unknown
  /** `undefined` when the system removed the value. */
  readonly after: unknown
}

export interface EventEmit {
  readonly event: string
  readonly values: ReadonlyArray<unknown>
}

export interface NextStateWrite {
  readonly machine: string
  /** `undefined` when the system cleared the queued value. */
  readonly value: Machine.StateValue | undefined
}

/**
 * A read the system could not fully see: stream, removed, or despawned
 * entries dropped at capacity before the system read them.
 */
export interface MissedRead {
  readonly kind: "event" | "transitionEvent" | "relationFailure" | "removed" | "despawned"
  readonly stream: string
}

/** A structural change made while a command was applied. */
export type Effect =
  | { readonly kind: "spawn"; readonly entity: number; readonly components: Readonly<Record<string, unknown>> }
  | { readonly kind: "despawn"; readonly entity: number }
  | { readonly kind: "insert"; readonly entity: number; readonly component: string; readonly value: unknown }
  | { readonly kind: "overwrite"; readonly entity: number; readonly component: string; readonly before: unknown; readonly after: unknown }
  | { readonly kind: "remove"; readonly entity: number; readonly component: string }
  | { readonly kind: "relate"; readonly entity: number; readonly relation: string; readonly target: number }
  | { readonly kind: "unrelate"; readonly entity: number; readonly relation: string }
  | { readonly kind: "relationFailure"; readonly entity: number; readonly relation: string; readonly error: string }

export interface AppliedCommand {
  readonly tag: string
  readonly system: string
  readonly effects: ReadonlyArray<Effect>
}

export interface FrameEvent {
  readonly type: "frame"
  readonly frame: number
  readonly tick: number
}

export interface ScheduleStartEvent {
  readonly type: "schedule.start"
  readonly frame: number
  readonly schedule: string
}

export interface ScheduleEndEvent {
  readonly type: "schedule.end"
  readonly frame: number
  readonly schedule: string
  readonly ok: boolean
  readonly ms: number
}

export interface SystemEvent {
  readonly type: "system"
  readonly frame: number
  readonly tick: number
  /** Schedule path, for example `update` or `update > onEnter(Game/Flow=Playing)`. */
  readonly schedule: string
  readonly system: string
  /**
   * `ok` committed its writes; `failed` returned an expected failure and was
   * rolled back; `defect` threw and was rolled back (the error is rethrown).
   */
  readonly outcome: "ok" | "failed" | "defect"
  readonly error?: unknown
  readonly ms: number
  /** Committed writes; on failure, the writes that were rolled back. */
  readonly writes: ReadonlyArray<ComponentWrite>
  readonly resources: ReadonlyArray<ResourceWrite>
  readonly events: ReadonlyArray<EventEmit>
  readonly nextStates: ReadonlyArray<NextStateWrite>
  /** Tags of the commands queued (dropped on failure). */
  readonly commands: ReadonlyArray<string>
  readonly missed: ReadonlyArray<MissedRead>
}

export interface SystemSkippedEvent {
  readonly type: "system.skipped"
  readonly frame: number
  readonly tick: number
  readonly schedule: string
  readonly system: string
  /** The run condition that did not hold, rendered. */
  readonly condition: string
  /** Stream entries published since the system's previous run, now discarded for it. */
  readonly discarded: ReadonlyArray<{ readonly stream: string; readonly count: number }>
}

export interface DeferredEvent {
  readonly type: "deferred"
  readonly frame: number
  readonly tick: number
  readonly schedule: string
  readonly marker: "applyDeferred" | "applyStateTransitions"
  readonly commands: ReadonlyArray<AppliedCommand>
}

export interface TransitionEvent {
  readonly type: "transition"
  readonly frame: number
  readonly tick: number
  readonly schedule: string
  readonly machine: string
  readonly from: Machine.StateValue
  readonly to: Machine.StateValue
  /**
   * `applied` committed the new value; `unchanged` was a `setIfChanged` to the
   * current value; `failed` stopped in an exit or transition schedule and was
   * queued again; `enterFailed` committed but an enter schedule failed.
   */
  readonly outcome: "applied" | "unchanged" | "failed" | "enterFailed"
}

export interface RestoreEvent {
  readonly type: "restore"
  readonly frame: number
  readonly tick: number
  readonly ok: boolean
}

/** Everything `observe` delivers. */
export type TraceEvent =
  | FrameEvent
  | ScheduleStartEvent
  | ScheduleEndEvent
  | SystemEvent
  | SystemSkippedEvent
  | DeferredEvent
  | TransitionEvent
  | RestoreEvent

/**
 * The `debug` runtime option: `true` attaches a handle.
 */
export type Option = true

/**
 * The member a runtime made with `debug: true` carries.
 */
export interface Member<S extends Schema.Any, Root> {
  readonly debug: Handle<S, Root>
}

/** Resolves the extra runtime member for a `debug` option type. */
export type MemberFor<Enabled, S extends Schema.Any, Root> =
  [Enabled] extends [Option] ? Member<S, Root> : {}

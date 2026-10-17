/**
 * The runtime form of the `Game.System.thisTick` check, for erased schedules
 * (`tryTick`) and the `this-tick-order` lint. The compile-time form lives in
 * `Schedule.ts` (`TickOrderErrors`) and produces the same messages.
 */
import type { Descriptor } from "../Descriptor.ts"
import type * as Query from "../Query.ts"
import * as Schedule from "../Schedule.ts"
import type { SystemDefinition } from "../System.ts"

type AnySystem = SystemDefinition<any, any, any, any, any>
type OrderIssue = Schedule.OrderIssue
type Access = { readonly mode: "read" | "changed" | "write"; readonly descriptor: Descriptor.Any; readonly thisTick?: true }
type QueryAccess = {
  readonly thisTick?: true
  readonly selection: Record<string, { readonly mode?: string; readonly descriptor?: Descriptor.Any }>
  readonly with: ReadonlyArray<Descriptor.Any>
  readonly without: ReadonlyArray<Descriptor.Any>
  readonly filters: ReadonlyArray<Query.Filter<any>>
}
/** Every component a filter names: the one of `added` / `changed`, or each member of `anyOf`. */
const filterNames = (filter: Query.Filter<any>): ReadonlyArray<string> =>
  filter.kind === "anyOf" ? filter.filters.map((member) => member.descriptor.name) : [filter.descriptor.name]
type Permission = { readonly permission: string; readonly values: ReadonlyArray<{ readonly name: string }> }

/** One position of a tick: a system, or a point where queued commands are applied. */
type Item = { readonly kind: "system"; readonly system: AnySystem } | { readonly kind: "flush" }

const accesses = (system: AnySystem): ReadonlyArray<Access> => [
  ...Object.values(system.spec.events as Record<string, Access>),
  ...Object.values(system.spec.resources as Record<string, Access>)
]

const sameData = (left: Descriptor.Any, right: Descriptor.Any): boolean =>
  left.kind === right.kind && left.name === right.name

const sameSystem = (left: AnySystem, right: AnySystem): boolean => (left.base ?? left) === (right.base ?? right)

/**
 * The positions of a tick, flattened: an `applyStateTransitions(...)` step
 * applies queued commands, then runs every schedule of its bundle (as if
 * each may run), markers inside them included.
 */
const flatten = (steps: ReadonlyArray<Schedule.ScheduleStep>): Array<Item> =>
  steps.flatMap((step): Array<Item> => {
    if (Schedule.isSystemStep(step)) return [{ kind: "system", system: step as AnySystem }]
    if (step.kind === "applyDeferred") return [{ kind: "flush" }]
    const bundle = step.bundle as { readonly entries: ReadonlyArray<{ readonly steps: ReadonlyArray<Schedule.ScheduleStep> }> } | undefined
    return [{ kind: "flush" }, ...(bundle?.entries ?? []).flatMap((entry) => flatten(entry.steps))]
  })

const permissionNames = (system: AnySystem, kind: string): Set<string> => {
  const commands = system.spec.commands as { readonly permissions: ReadonlyArray<Permission> } | undefined
  return new Set((commands?.permissions ?? []).filter((p) => p.permission === kind).flatMap((p) => p.values.map((value) => value.name)))
}

/**
 * Whether a system's declared commands can change what a query sees: spawns
 * covering every component it requires, or inserts / removes of any
 * component it names. Despawns never count.
 */
const changesQuery = (system: AnySystem, query: QueryAccess): boolean => {
  const slots = Object.values(query.selection)
  const required = [
    ...slots.filter((slot) => slot.mode === "read" || slot.mode === "write").flatMap((slot) => slot.descriptor ? [slot.descriptor.name] : []),
    ...query.with.map((d) => d.name)
  ]
  const named = new Set([
    ...slots.flatMap((slot) => slot.descriptor ? [slot.descriptor.name] : []),
    ...query.with.map((d) => d.name),
    ...query.without.map((d) => d.name),
    ...query.filters.flatMap((filter) => filterNames(filter))
  ])
  const changes = [...permissionNames(system, "inserts"), ...permissionNames(system, "removes")]
  if (changes.some((name) => named.has(name))) return true
  const spawns = permissionNames(system, "spawns")
  return spawns.size > 0 && required.every((name) => spawns.has(name))
}

/**
 * Checks the systems of one tick, in the order they run. A read with no
 * writer in the tick is fine (a reused reader); `event-never-written` covers
 * a writer missing everywhere.
 */
export const tickOrderIssues = (steps: ReadonlyArray<Schedule.ScheduleStep>): ReadonlyArray<OrderIssue> => {
  // A schedule's steps never change, so `tryTick` checks each schedule once.
  const cached = checked.get(steps)
  if (cached !== undefined) return cached
  const issues = computeIssues(steps)
  checked.set(steps, issues)
  return issues
}

const checked = new WeakMap<ReadonlyArray<Schedule.ScheduleStep>, ReadonlyArray<OrderIssue>>()

const computeIssues = (steps: ReadonlyArray<Schedule.ScheduleStep>): ReadonlyArray<OrderIssue> => {
  const items = flatten(steps)
  const issues: Array<OrderIssue> = []
  const systemsAt = items.flatMap((item, at) => item.kind === "system" ? [{ system: item.system, at }] : [])
  for (const { system: reader, at: index } of systemsAt) {
    for (const read of accesses(reader)) {
      if ((read.mode !== "read" && read.mode !== "changed") || read.thisTick !== true) continue
      const data = read.descriptor.name
      for (const { system, at } of systemsAt) {
        if (at <= index || sameSystem(system, reader)) continue
        if (!accesses(system).some((access) => access.mode === "write" && sameData(access.descriptor, read.descriptor))) continue
        issues.push({
          kind: "lateWriter",
          reader: reader.name,
          data,
          writer: system.name,
          message: `${reader.name} needs ${data} from this tick, but its writer ${system.name} runs after it: move ${system.name} before ${reader.name}, or read ${data} without thisTick`
        })
      }
    }
    for (const [slot, query] of Object.entries(reader.spec.queries as Record<string, QueryAccess>)) {
      if (query.thisTick !== true) continue
      const data = `queries.${slot}`
      let lastFlush = -1
      for (let at = 0; at < index; at++) if (items[at]!.kind === "flush") lastFlush = at
      for (const { system, at } of systemsAt) {
        if (sameSystem(system, reader) || !changesQuery(system, query)) continue
        if (at > index) {
          issues.push({
            kind: "lateWriter",
            reader: reader.name,
            data,
            writer: system.name,
            message: `${system.name} queues commands that ${reader.name} needs this tick (${data}), but it runs after ${reader.name}: move ${system.name} before the applyDeferred() that precedes ${reader.name}, or read ${data} without thisTick`
          })
        } else if (at > lastFlush && at < index) {
          issues.push({
            kind: "unflushedWriter",
            reader: reader.name,
            data,
            writer: system.name,
            message: `${reader.name} needs this tick's commands for ${data}, but ${system.name} queues them with no applyDeferred() in between: add Game.Schedule.applyDeferred() after ${system.name}`
          })
        }
      }
    }
  }
  return issues
}

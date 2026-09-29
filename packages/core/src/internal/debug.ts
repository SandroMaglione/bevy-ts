/**
 * Static parts of the runtime debug handle: naming, schema and schedule
 * descriptions, access indexes, and lints. Everything here reads definitions
 * only; world state is passed in by the runtime.
 */
import type * as Debug from "../Debug.ts"
import * as DescriptorModule from "../Descriptor.ts"
import type { Descriptor } from "../Descriptor.ts"
import type * as Inspector from "../Inspector.ts"
import type * as Machine from "../Machine.ts"
import type * as Query from "../Query.ts"
import type * as Relation from "../Relation.ts"
import * as Schedule from "../Schedule.ts"
import type { Schema } from "../Schema.ts"
import type { SystemDefinition } from "../System.ts"

type AnySystem = SystemDefinition<any, any, any>
type AnySchedule = { readonly steps: ReadonlyArray<Schedule.ScheduleStep> }
type TransitionSchedule = Machine.StateMachine.AnyTransitionSchedule<any, any>

export const storageOf = (descriptor: Descriptor.Any): Debug.Storage =>
  DescriptorModule.isTransient(descriptor) ? "transient"
  : DescriptorModule.hasConstructor(descriptor) ? "constructed"
  : "plain"

export const renderCondition = (condition: Machine.Condition): string => {
  switch (condition.kind) {
    case "inState":
      return `inState(${condition.machine.name}=${String(condition.value)})`
    case "stateChanged":
      return `stateChanged(${condition.machine.name})`
    case "not":
      return `not(${renderCondition(condition.condition)})`
    case "and":
      return condition.conditions.map(renderCondition).join(" and ")
    case "or":
      return `(${condition.conditions.map(renderCondition).join(" or ")})`
    case "check":
      return `check(${condition.name})`
  }
}

/** Every `check` condition inside a condition list, through `not`/`and`/`or`. */
const checksOf = (conditions: ReadonlyArray<Machine.Condition>): Array<Machine.CheckCondition> =>
  conditions.flatMap((condition): Array<Machine.CheckCondition> => {
    switch (condition.kind) {
      case "check":
        return [condition]
      case "not":
        return checksOf([condition.condition])
      case "and":
      case "or":
        return checksOf(condition.conditions)
      default:
        return []
    }
  })

export const transitionScheduleName = (schedule: TransitionSchedule): string => {
  const { machine, phase, state, from, to } = schedule.transition
  switch (phase) {
    case "enter":
      return `onEnter(${machine.name}=${String(state)})`
    case "exit":
      return `onExit(${machine.name}=${String(state)})`
    case "transition":
      return `onTransition(${machine.name}: ${String(from)}->${String(to)})`
  }
}

const names = <A>(record: Record<string, A>, name: (value: A) => string): Array<string> =>
  Object.values(record).map(name)

const describeQuery = (slot: string, query: Query.Query.Any<any>): Debug.QueryDescription => {
  const reads: Array<string> = []
  const writes: Array<string> = []
  const optional: Array<string> = []
  const relations: Array<string> = []
  for (const access of Object.values(query.selection) as ReadonlyArray<{ readonly mode: string; readonly descriptor: { readonly name?: string; readonly relatedName?: string } }>) {
    const name = access.descriptor.name ?? access.descriptor.relatedName ?? "?"
    switch (access.mode) {
      case "read":
        reads.push(name)
        break
      case "write":
        writes.push(name)
        break
      case "optional":
        optional.push(name)
        break
      default:
        relations.push(`${access.mode} ${name}`)
    }
  }
  const relationNames = (list: ReadonlyArray<Relation.Relation.Any>, label: string) =>
    list.map((relation) => `${label} ${relation.name}`)
  return {
    slot,
    reads,
    writes,
    optional,
    with: query.with.map((descriptor) => descriptor.name),
    without: query.without.map((descriptor) => descriptor.name),
    added: query.filters.filter((filter) => filter.kind === "added").map((filter) => filter.descriptor.name),
    changed: query.filters.filter((filter) => filter.kind === "changed").map((filter) => filter.descriptor.name),
    relations: [
      ...relations,
      ...relationNames(query.withRelations, "with"),
      ...relationNames(query.withoutRelations, "without"),
      ...relationNames(query.withRelated, "withRelated"),
      ...relationNames(query.withoutRelated, "withoutRelated")
    ]
  }
}

type Mode = { readonly mode: "read" | "write"; readonly descriptor: Descriptor.Any }

export const describeSystem = (system: AnySystem, placements: ReadonlyArray<string>): Debug.SystemDescription => {
  const spec = system.spec
  const byMode = (record: Record<string, Mode>, mode: "read" | "write") =>
    Object.values(record).filter((access) => access.mode === mode).map((access) => access.descriptor.name)
  const machineName = (access: { readonly machine: Machine.StateMachine.Any }) => access.machine.name
  // A system also reads whatever its `check` conditions read.
  const checks = checksOf(spec.when as ReadonlyArray<Machine.Condition>).map((check) => ({
    name: check.name,
    spec: (check.projection as Inspector.InspectorDefinition).system.spec
  }))
  const unique = (values: ReadonlyArray<string>) => [...new Set(values)]
  return {
    name: system.name,
    placements,
    queries: [
      ...Object.entries(spec.queries as Record<string, Query.Query.Any<any>>).map(([slot, query]) => describeQuery(slot, query)),
      ...checks.flatMap((check) =>
        Object.entries(check.spec.queries as Record<string, Query.Query.Any<any>>).map(([slot, query]) => describeQuery(`check(${check.name}).${slot}`, query)))
    ],
    resources: {
      reads: unique([...byMode(spec.resources, "read"), ...checks.flatMap((check) => byMode(check.spec.resources, "read"))]),
      writes: byMode(spec.resources, "write")
    },
    events: { reads: byMode(spec.events, "read"), writes: byMode(spec.events, "write") },
    machines: {
      reads: unique([...names(spec.machines, machineName), ...checks.flatMap((check) => names(check.spec.machines, machineName))]),
      next: names(spec.nextMachines, machineName),
      transitions: names(spec.transitions, machineName),
      transitionEvents: names(spec.transitionEvents, machineName)
    },
    removed: names(spec.removed as Record<string, { readonly descriptor: Descriptor.Any }>, (access) => access.descriptor.name),
    despawned: Object.keys(spec.despawned).length > 0,
    relationFailures: names(spec.relationFailures as Record<string, { readonly relation: Relation.Relation.Any }>, (access) => access.relation.name),
    services: names(spec.services as Record<string, { readonly descriptor: Descriptor.Any }>, (access) => access.descriptor.name),
    when: (spec.when as ReadonlyArray<Machine.Condition>).map(renderCondition)
  }
}

/**
 * Walks named schedules, including the transition schedules reachable from
 * their `applyStateTransitions` markers.
 */
const collectSchedules = (
  named: ReadonlyArray<readonly [string, AnySchedule]>
): ReadonlyArray<readonly [string, AnySchedule]> => {
  const result: Array<readonly [string, AnySchedule]> = []
  const seen = new Set<AnySchedule>()
  const visit = (name: string, schedule: AnySchedule) => {
    if (seen.has(schedule)) return
    seen.add(schedule)
    result.push([name, schedule])
    for (const step of schedule.steps) {
      if (!Schedule.isSystemStep(step) && step.kind === "applyStateTransitions" && step.bundle) {
        for (const entry of step.bundle.entries as ReadonlyArray<TransitionSchedule>) {
          visit(transitionScheduleName(entry), entry)
        }
      }
    }
  }
  for (const [name, schedule] of named) visit(name, schedule)
  return result
}

const describeStep = (step: Schedule.ScheduleStep): Debug.StepDescription => {
  if (Schedule.isSystemStep(step)) return { kind: "system", system: step.name }
  if (step.kind === "applyDeferred") return { kind: "applyDeferred" }
  return {
    kind: "applyStateTransitions",
    schedules: ((step.bundle?.entries ?? []) as ReadonlyArray<TransitionSchedule>).map(transitionScheduleName)
  }
}

class Index {
  private readonly entries = new Map<string, { readers: Set<string>; writers: Set<string> }>()

  constructor(order: ReadonlyArray<string>) {
    for (const name of order) this.entry(name)
  }

  private entry(name: string) {
    let entry = this.entries.get(name)
    if (!entry) {
      entry = { readers: new Set(), writers: new Set() }
      this.entries.set(name, entry)
    }
    return entry
  }

  read(name: string, system: string) {
    this.entry(name).readers.add(system)
  }

  write(name: string, system: string) {
    this.entry(name).writers.add(system)
  }

  list(): Array<Debug.AccessIndexEntry> {
    return [...this.entries].map(([name, entry]) => ({
      name,
      readers: [...entry.readers],
      writers: [...entry.writers]
    }))
  }
}

export interface DescribeInput {
  readonly schema: Schema.Any
  readonly machines: ReadonlyArray<Machine.StateMachine.Any>
  readonly currentMachine: (machine: Machine.StateMachine.Any) => Machine.StateValue | undefined
  readonly providedServices: ReadonlyArray<string>
  readonly hasResource: (descriptor: Descriptor.Any) => boolean
  readonly schedules: ReadonlyArray<readonly [string, AnySchedule]>
}

export const describe = (input: DescribeInput): Debug.Description => {
  const componentDescriptors = Object.values(input.schema.components) as ReadonlyArray<Descriptor.Any>
  const resourceDescriptors = Object.values(input.schema.resources) as ReadonlyArray<Descriptor.Any>
  const eventDescriptors = Object.values(input.schema.events) as ReadonlyArray<Descriptor.Any>
  const relations = Object.values(input.schema.relations) as ReadonlyArray<Relation.Relation.Any>

  const schedules = collectSchedules(input.schedules)
  const placements = new Map<AnySystem, Array<string>>()
  for (const [name, schedule] of schedules) {
    schedule.steps.forEach((step, index) => {
      if (!Schedule.isSystemStep(step)) return
      const system = step as AnySystem
      const list = placements.get(system)
      const placement = `${name}#${index}`
      if (list) list.push(placement)
      else placements.set(system, [placement])
    })
  }
  const described = new Map([...placements].map(([system, where]) => [system, describeSystem(system, where)] as const))
  const systems = [...described.values()]

  const components = new Index(componentDescriptors.map((descriptor) => descriptor.name))
  const resources = new Index(resourceDescriptors.map((descriptor) => descriptor.name))
  const events = new Index(eventDescriptors.map((descriptor) => descriptor.name))
  const nextStates = new Map<string, Array<string>>()
  for (const system of systems) {
    for (const query of system.queries) {
      for (const name of [...query.reads, ...query.optional, ...query.with, ...query.added, ...query.changed]) {
        components.read(name, system.name)
      }
      for (const name of query.writes) {
        components.read(name, system.name)
        components.write(name, system.name)
      }
    }
    for (const name of system.removed) components.read(name, system.name)
    for (const name of system.resources.reads) resources.read(name, system.name)
    for (const name of system.resources.writes) resources.write(name, system.name)
    for (const name of system.events.reads) events.read(name, system.name)
    for (const name of system.events.writes) events.write(name, system.name)
    for (const name of system.machines.next) {
      const queuers = nextStates.get(name)
      if (queuers) queuers.push(`${system.name} @ ${system.placements.join(", ")}`)
      else nextStates.set(name, [`${system.name} @ ${system.placements.join(", ")}`])
    }
  }

  const appliesTransitions = schedules.some(([, schedule]) =>
    schedule.steps.some((step) => !Schedule.isSystemStep(step) && step.kind === "applyStateTransitions"))

  const lints: Array<Debug.Lint> = []
  if (schedules.length > 0) {
    for (const entry of events.list()) {
      if (entry.writers.length > 0 && entry.readers.length === 0) {
        lints.push({
          severity: "warning",
          code: "event-never-read",
          subject: entry.name,
          message: `${entry.name} is emitted by ${entry.writers.join(", ")} but no described system reads it`
        })
      }
      if (entry.readers.length > 0 && entry.writers.length === 0) {
        lints.push({
          severity: "warning",
          code: "event-never-written",
          subject: entry.name,
          message: `${entry.name} is read by ${entry.readers.join(", ")} but no described system emits it`
        })
      }
    }
    if (!appliesTransitions) {
      for (const [name, queuers] of nextStates) {
        lints.push({
          severity: "warning",
          code: "next-state-never-applied",
          subject: name,
          message: `next states of ${name} are queued by ${queuers.join("; ")}, but no described schedule has an applyStateTransitions() marker, so they never take effect`
        })
      }
    }
    lints.push(...readBeforeWriteLints(schedules, described))
    for (const entry of components.list()) {
      if (entry.writers.length > 0 && entry.readers.every((reader) => entry.writers.includes(reader))) {
        lints.push({
          severity: "info",
          code: "component-never-read",
          subject: entry.name,
          message: `${entry.name} is written by ${entry.writers.join(", ")} but read by no other described system`
        })
      }
    }
  }

  return {
    version: 1,
    components: componentDescriptors.map((descriptor) => ({ name: descriptor.name, storage: storageOf(descriptor) })),
    resources: resourceDescriptors.map((descriptor) => ({
      name: descriptor.name,
      storage: storageOf(descriptor),
      present: input.hasResource(descriptor)
    })),
    events: eventDescriptors.map((descriptor) => ({ name: descriptor.name })),
    relations: relations.map((relation) => ({
      name: relation.name,
      relatedName: relation.relatedName,
      kind: relation.relationKind,
      linkedDespawn: relation.linkedDespawn,
      ordered: relation.ordered
    })),
    machines: input.machines.map((machine) => ({
      name: machine.name,
      states: machine.values,
      current: input.currentMachine(machine)
    })),
    services: describeServices(input.providedServices, systems),
    schedules: schedules.map(([name, schedule]) => ({ name, steps: schedule.steps.map(describeStep) })),
    systems,
    access: {
      components: components.list(),
      resources: resources.list(),
      events: events.list()
    },
    lints
  }
}

type Accesses = { readonly reads: ReadonlyArray<string>; readonly writes: ReadonlyArray<string> }

/** What a system reads and writes, per kind. `with`/`without` filters test presence and are not reads. */
const accessesOf = (system: Debug.SystemDescription): Record<"component" | "resource" | "event", Accesses> => ({
  component: {
    reads: system.queries.flatMap((query) => [...query.reads, ...query.optional, ...query.added, ...query.changed]),
    writes: system.queries.flatMap((query) => query.writes)
  },
  resource: system.resources,
  event: system.events
})

/**
 * Systems that read a component, resource, or event earlier in a schedule
 * than the first system that writes it there: they see the value (or events)
 * from the schedule's previous run. Often intended, so `info`.
 */
const readBeforeWriteLints = (
  schedules: ReadonlyArray<readonly [string, AnySchedule]>,
  described: ReadonlyMap<AnySystem, Debug.SystemDescription>
): Array<Debug.Lint> => {
  const lints: Array<Debug.Lint> = []
  for (const [name, schedule] of schedules) {
    const steps = schedule.steps.flatMap((step) =>
      Schedule.isSystemStep(step) ? [{ system: described.get(step as AnySystem)!, accesses: accessesOf(described.get(step as AnySystem)!) }] : [])
    for (const kind of ["component", "resource", "event"] as const) {
      const firstWriter = new Map<string, number>()
      steps.forEach((step, index) => {
        for (const subject of step.accesses[kind].writes) if (!firstWriter.has(subject)) firstWriter.set(subject, index)
      })
      for (const [subject, writerIndex] of firstWriter) {
        const readers = [...new Set(steps.slice(0, writerIndex)
          .filter((step) => step.accesses[kind].reads.includes(subject) && !step.accesses[kind].writes.includes(subject))
          .map((step) => step.system.name))]
        if (readers.length === 0) continue
        const writer = steps[writerIndex]!.system.name
        const sees = kind === "event" ? `${subject} events one run late` : `the ${subject} value from the previous run`
        lints.push({
          severity: "info",
          code: "read-before-write",
          subject,
          message: `in ${name}, ${readers.join(", ")} ${readers.length === 1 ? "runs" : "run"} before ${writer} writes ${subject}, so ${readers.length === 1 ? "it sees" : "they see"} ${sees}`
        })
      }
    }
  }
  return lints
}

const describeServices = (
  provided: ReadonlyArray<string>,
  systems: ReadonlyArray<Debug.SystemDescription>
): Array<Debug.ServiceDescription> => {
  const all = new Set(provided)
  for (const system of systems) for (const name of system.services) all.add(name)
  return [...all].map((name) => ({ name, provided: provided.includes(name) }))
}

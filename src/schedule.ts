import type { Label } from "./label.ts"
import type { Schema } from "./schema.ts"
import type { OrderTarget, SystemDefinition } from "./system.ts"

/**
 * A typed set-level ordering configuration.
 *
 * This is the Bevy-inspired grouping layer used to order multiple systems as a
 * unit without falling back to string identifiers.
 */
export interface SystemSetConfig {
  /**
   * Nominal identity of the configured system set.
   */
  readonly label: Label.SystemSet
  /**
   * Other systems or sets that must run before this set.
   */
  readonly after: ReadonlyArray<OrderTarget>
  /**
   * Other systems or sets that must run after this set.
   */
  readonly before: ReadonlyArray<OrderTarget>
  /**
   * Whether systems assigned to this set should run in declaration order.
   */
  readonly chain: boolean
}

/**
 * A typed schedule marker that applies all queued commands.
 *
 * This is the explicit deferred-mutation boundary for the runtime.
 */
export interface ApplyDeferredStep {
  readonly kind: "applyDeferred"
}

/**
 * A typed schedule marker that updates the readable event/message buffers.
 *
 * Systems before this point write pending events. Systems after this point read
 * the flushed readable events for the current schedule execution.
 */
export interface EventUpdateStep {
  readonly kind: "eventUpdate"
}

/**
 * Any non-system execution step supported by the schedule runtime.
 */
export type ScheduleMarkerStep = ApplyDeferredStep | EventUpdateStep

/**
 * One executable step in a schedule.
 */
export type ScheduleStep = SystemDefinition<any, any, any> | ScheduleMarkerStep

/**
 * A named collection of systems and explicit execution markers for a schema.
 *
 * Schedules are the unit the runtime executes. They can be called from any
 * external loop in any order you choose.
 */
export interface ScheduleDefinition<S extends Schema.Any> {
  /**
   * Typed schedule label.
   */
  readonly label: Label.Schedule
  /**
   * Explicit execution steps for the schedule.
   */
  readonly steps: ReadonlyArray<ScheduleStep>
  /**
   * Systems included in this schedule, sorted by dependency order.
   */
  readonly systems: ReadonlyArray<SystemDefinition<any, any, any>>
  /**
   * The closed schema all systems in the schedule are expected to target.
   */
  readonly schema: S
}

/**
 * Type-level and value-level helpers for schedule construction.
 */
export namespace Schedule {
  /**
   * Any supported execution step.
   */
  export type Step = ScheduleStep
}

/**
 * Creates a typed system-set configuration.
 */
export const configureSet = (config: {
  readonly label: Label.SystemSet
  readonly after?: ReadonlyArray<OrderTarget>
  readonly before?: ReadonlyArray<OrderTarget>
  readonly chain?: boolean
}): SystemSetConfig => ({
  label: config.label,
  after: config.after ?? [],
  before: config.before ?? [],
  chain: config.chain ?? false
})

/**
 * Creates an explicit command-application marker step.
 */
export const applyDeferred = (): ApplyDeferredStep => ({
  kind: "applyDeferred"
})

/**
 * Creates an explicit event/message update marker step.
 */
export const updateEvents = (): EventUpdateStep => ({
  kind: "eventUpdate"
})

/**
 * Creates a schedule value from a label and an ordered execution plan.
 *
 * When only `systems` are provided, the schedule uses the resolved system order
 * followed by an implicit `applyDeferred()` and `updateEvents()` pair.
 */
export const define = <S extends Schema.Any>(options: {
  readonly label: Label.Schedule
  readonly schema: S
  readonly systems: ReadonlyArray<SystemDefinition<any, any, any>>
  readonly sets?: ReadonlyArray<SystemSetConfig>
  readonly steps?: ReadonlyArray<ScheduleStep>
}): ScheduleDefinition<S> => {
  const orderedSystems = resolveSystems(options.systems, options.sets ?? [])
  const orderedSystemMap = new Map(
    orderedSystems.map((system) => [system.spec.label.key, system] as const)
  )

  const steps = options.steps
    ? options.steps.map((step) => isSystemStep(step)
      ? orderedSystemMap.get(step.spec.label.key) ?? step
      : step)
    : [...orderedSystems, applyDeferred(), updateEvents()]

  return {
    label: options.label,
    steps,
    systems: orderedSystems,
    schema: options.schema
  }
}

/**
 * Runtime check used to distinguish system steps from schedule markers.
 */
export const isSystemStep = (step: ScheduleStep): step is SystemDefinition<any, any, any> =>
  "spec" in step

const resolveSystems = (
  systems: ReadonlyArray<SystemDefinition<any, any, any>>,
  setConfigs: ReadonlyArray<SystemSetConfig>
): ReadonlyArray<SystemDefinition<any, any, any>> => {
  const byKey = new Map<symbol, SystemDefinition<any, any, any>>()
  const inputOrder = new Map<symbol, number>()
  for (const [index, system] of systems.entries()) {
    const key = system.spec.label.key
    if (byKey.has(key)) {
      throw new Error(`Duplicate system label in schedule: ${system.spec.label.name}`)
    }
    byKey.set(key, system)
    inputOrder.set(key, index)
  }

  const setByKey = new Map<symbol, SystemSetConfig>()
  for (const set of setConfigs) {
    if (setByKey.has(set.label.key)) {
      throw new Error(`Duplicate system set label in schedule: ${set.label.name}`)
    }
    setByKey.set(set.label.key, set)
  }

  const systemsInSet = new Map<symbol, Array<SystemDefinition<any, any, any>>>()
  for (const set of setConfigs) {
    systemsInSet.set(set.label.key, [])
  }
  for (const system of systems) {
    for (const set of system.spec.inSets) {
      const members = systemsInSet.get(set.key)
      if (!members) {
        throw new Error(`Missing system set '${set.name}' referenced by '${system.spec.label.name}'`)
      }
      members.push(system)
    }
  }

  const dependencies = new Map<symbol, Set<symbol>>()
  for (const system of systems) {
    dependencies.set(system.spec.label.key, new Set())
  }

  const resolveTargetSystems = (target: OrderTarget, sourceName: string): ReadonlyArray<SystemDefinition<any, any, any>> => {
    if (target.kind === "system") {
      const system = byKey.get(target.key)
      if (!system) {
        throw new Error(`Missing system dependency '${target.name}' referenced by '${sourceName}'`)
      }
      return [system]
    }
    const systems = systemsInSet.get(target.key)
    if (!systems) {
      throw new Error(`Missing system set dependency '${target.name}' referenced by '${sourceName}'`)
    }
    return systems
  }

  const addDependency = (
    dependent: SystemDefinition<any, any, any>,
    dependency: SystemDefinition<any, any, any>
  ): void => {
    if (dependent.spec.label.key === dependency.spec.label.key) {
      return
    }
    dependencies.get(dependent.spec.label.key)?.add(dependency.spec.label.key)
  }

  for (const system of systems) {
    for (const target of system.spec.after) {
      for (const dependency of resolveTargetSystems(target, system.spec.label.name)) {
        addDependency(system, dependency)
      }
    }
    for (const target of system.spec.before) {
      for (const dependent of resolveTargetSystems(target, system.spec.label.name)) {
        addDependency(dependent, system)
      }
    }
  }

  for (const set of setConfigs) {
    const members = systemsInSet.get(set.label.key) ?? []
    if (set.chain) {
      const orderedMembers = [...members].sort((left, right) =>
        (inputOrder.get(left.spec.label.key) ?? 0) - (inputOrder.get(right.spec.label.key) ?? 0)
      )
      for (let index = 1; index < orderedMembers.length; index += 1) {
        addDependency(orderedMembers[index]!, orderedMembers[index - 1]!)
      }
    }

    for (const target of set.after) {
      const targetSystems = resolveTargetSystems(target, set.label.name)
      for (const member of members) {
        for (const dependency of targetSystems) {
          addDependency(member, dependency)
        }
      }
    }

    for (const target of set.before) {
      const targetSystems = resolveTargetSystems(target, set.label.name)
      for (const member of members) {
        for (const dependent of targetSystems) {
          addDependency(dependent, member)
        }
      }
    }
  }

  const order: Array<SystemDefinition<any, any, any>> = []
  const visited = new Set<symbol>()
  const stack = new Set<symbol>()

  const visit = (key: symbol): void => {
    if (stack.has(key)) {
      const system = byKey.get(key)
      throw new Error(`Circular system dependency detected at '${system?.spec.label.name ?? "unknown"}'`)
    }
    if (visited.has(key)) {
      return
    }
    stack.add(key)
    const deps = [...(dependencies.get(key) ?? [])].sort((left, right) =>
      (inputOrder.get(left) ?? 0) - (inputOrder.get(right) ?? 0)
    )
    for (const dep of deps) {
      visit(dep)
    }
    stack.delete(key)
    visited.add(key)
    order.push(byKey.get(key)!)
  }

  const orderedKeys = [...byKey.keys()].sort((left, right) =>
    (inputOrder.get(left) ?? 0) - (inputOrder.get(right) ?? 0)
  )
  for (const key of orderedKeys) {
    visit(key)
  }

  return order
}

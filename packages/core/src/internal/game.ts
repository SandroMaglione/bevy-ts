/**
 * Implementation of the bound `Game` surface returned by `Schema.bind(...)`.
 *
 * Every constructor here is a thin, schema-aware wrapper over the unbound
 * module functions; the precise public types live on `Schema.Game`.
 */
import * as Command from "../Command.ts"
import * as Entity from "../Entity.ts"
import * as EntityScope from "../EntityScope.ts"
import * as Inspector from "../Inspector.ts"
import * as Machine from "../Machine.ts"
import * as QueryModule from "../Query.ts"
import * as Relation from "../Relation.ts"
import * as Runtime from "../Runtime.ts"
import * as Schedule from "../Schedule.ts"
import type { Schema } from "../Schema.ts"
import * as System from "../System.ts"

export const makeGame = <S extends Schema.Any, Root>(schema: S, _root: Root): Schema.Game<S, Root> => {
  const definedMachines: Array<Machine.StateMachine.Any> = []
  const definedMachineNames = new Set<string>()

  const defineMachine = (name: string, values: readonly [Machine.StateValue, ...Machine.StateValue[]]) => {
    if (definedMachineNames.has(name)) {
      throw new Error(`Duplicate state machine name: ${name}`)
    }
    const machine = Machine.StateMachine(name, values)
    definedMachines.push(machine)
    definedMachineNames.add(name)
    return machine
  }

  const transitionSchedule = (
    transition: Machine.TransitionScheduleDefinition["transition"],
    plan: ReadonlyArray<Schedule.ScheduleEntry>
  ) => ({ ...Schedule.make(schema, plan), transition })

  const game = {
    schema,
    EntityScope: (name: string) => EntityScope.make(name),
    Inspector: (name: string, spec: object, read: (context: any) => unknown) =>
      Inspector.make(name, { schema, ...spec } as never, read),
    Entity: {
      handle: Entity.handle
    },
    Query: Object.assign((spec: never) => QueryModule.Query(spec), {
      read: QueryModule.read,
      write: QueryModule.write,
      optional: QueryModule.optional,
      added: QueryModule.added,
      changed: QueryModule.changed,
      readRelation: Relation.read,
      optionalRelation: Relation.optional,
      readRelated: Relation.readRelated,
      optionalRelated: Relation.optionalRelated
    }),
    Command: {
      spawn: Command.spawn,
      insert: Command.insert,
      entry: Command.entry,
      entryResult: Command.entryResult,
      entryRaw: Command.entryRaw,
      relate: Command.relate
    },
    StateMachine: defineMachine,
    Condition: {
      inState: Machine.inState,
      stateChanged: Machine.stateChanged,
      not: Machine.not,
      and: Machine.and,
      or: Machine.or
    },
    System: Object.assign(
      (name: string, spec: object, run: (context: any) => any) =>
        System.System(name, { schema, ...spec } as never, run),
      {
        readResource: System.readResource,
        writeResource: System.writeResource,
        readEvent: System.readEvent,
        writeEvent: System.writeEvent,
        service: System.service,
        machine: System.machine,
        nextState: System.nextState,
        readTransitionEvent: System.readTransitionEvent,
        transition: System.transition,
        readRemoved: System.readRemoved,
        readDespawned: System.readDespawned,
        readRelationFailures: System.readRelationFailures
      }
    ),
    Schedule: Object.assign(
      (...entries: ReadonlyArray<Schedule.ScheduleEntry>) => Schedule.make(schema, entries),
      {
        transitions: Schedule.transitions,
        onEnter: (machine: Machine.StateMachine.Any, state: Machine.StateValue, plan: ReadonlyArray<Schedule.ScheduleEntry>) =>
          transitionSchedule({ machine, phase: "enter", state }, plan),
        onExit: (machine: Machine.StateMachine.Any, state: Machine.StateValue, plan: ReadonlyArray<Schedule.ScheduleEntry>) =>
          transitionSchedule({ machine, phase: "exit", state }, plan),
        onTransition: (
          machine: Machine.StateMachine.Any,
          [from, to]: readonly [Machine.StateValue, Machine.StateValue],
          plan: ReadonlyArray<Schedule.ScheduleEntry>
        ) => transitionSchedule({ machine, phase: "transition", from, to }, plan),
        applyDeferred: Schedule.applyDeferred,
        applyStateTransitions: Schedule.applyStateTransitions
      }
    ),
    Runtime: {
      make: (options: {
        readonly services: Runtime.RuntimeServices<any>
        readonly resources?: object
        readonly machines?: Runtime.RuntimeMachines<any>
        readonly debug?: true
      }) => Runtime.make({ schema, ...options, machineDefinitions: definedMachines } as never),
      service: Runtime.service,
      services: Runtime.services,
      machine: Runtime.machine,
      machines: Runtime.machines
    }
  }

  return game as unknown as Schema.Game<S, Root>
}

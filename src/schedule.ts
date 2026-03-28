import type { Schema } from "./schema.ts"
import type { SystemDefinition } from "./system.ts"

/**
 * A named collection of systems for a specific schema.
 *
 * Schedules are the unit the runtime executes. They can be called from any
 * external loop in any order you choose.
 */
export interface ScheduleDefinition<S extends Schema.Any> {
  /**
   * Human-readable schedule label.
   */
  readonly label: string
  /**
   * Systems executed when the schedule runs.
   */
  readonly systems: ReadonlyArray<SystemDefinition<any, any, any>>
  /**
   * The closed schema all systems in the schedule are expected to target.
   */
  readonly schema: S
}

/**
 * Creates a schedule value from a label and a list of systems.
 */
export const define = <S extends Schema.Any>(options: {
  readonly label: string
  readonly schema: S
  readonly systems: ReadonlyArray<SystemDefinition<any, any, any>>
}): ScheduleDefinition<S> => ({
  label: options.label,
  systems: options.systems,
  schema: options.schema
})

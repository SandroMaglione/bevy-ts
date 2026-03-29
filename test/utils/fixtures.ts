import { Fx, Label, Runtime, Schedule, System } from "../../src/index.ts"
import type { Descriptor } from "../../src/descriptor.ts"
import type { Schema } from "../../src/schema.ts"

/**
 * Reads one resource value from a runtime through the public scheduling API.
 */
export const readResourceValue = <
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  D extends Extract<Schema.Resources<S>[keyof Schema.Resources<S>], Descriptor<"resource", string, any>>
>(
  runtime: Runtime.Runtime<S, Services>,
  schema: S,
  descriptor: D
): Descriptor.Value<D> => {
  let captured!: Descriptor.Value<D>

  const readSystem = System.define(
    `Test/ReadResource/${descriptor.name}`,
    {
      schema,
      resources: {
        value: System.readResource(descriptor)
      }
    },
    ({ resources }) =>
      Fx.sync(() => {
        captured = resources.value.get()
      })
  )

  runtime.runSchedule(Schedule.define({
    label: Label.defineScheduleLabel(`Test/ReadResourceSchedule/${descriptor.name}`),
    schema,
    systems: [readSystem]
  }))

  return captured
}

/**
 * Reads one state value from a runtime through the public scheduling API.
 */
export const readStateValue = <
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  D extends Extract<Schema.States<S>[keyof Schema.States<S>], Descriptor<"state", string, any>>
>(
  runtime: Runtime.Runtime<S, Services>,
  schema: S,
  descriptor: D
): Descriptor.Value<D> => {
  let captured!: Descriptor.Value<D>

  const readSystem = System.define(
    `Test/ReadState/${descriptor.name}`,
    {
      schema,
      states: {
        value: System.readState(descriptor)
      }
    },
    ({ states }) =>
      Fx.sync(() => {
        captured = states.value.get()
      })
  )

  runtime.runSchedule(Schedule.define({
    label: Label.defineScheduleLabel(`Test/ReadStateSchedule/${descriptor.name}`),
    schema,
    systems: [readSystem]
  }))

  return captured
}

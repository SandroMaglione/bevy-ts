import { Fx } from "../../src/index.ts"
import * as Runtime from "../../src/runtime.ts"
import * as Schedule from "../../src/schedule.ts"
import * as System from "../../src/system.ts"
import type { Descriptor } from "../../src/descriptor.ts"
import type { Schema } from "../../src/schema.ts"

/**
 * Reads one resource value from a runtime through the public scheduling API.
 */
export const readResourceValue = <
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  K extends keyof Schema.Resources<S>,
  Resources extends Runtime.RuntimeResources<S> & {
    readonly [P in K]: Schema.ResourceValue<S, P>
  },
  States extends Runtime.RuntimeStates<S>,
  D extends Extract<Schema.Resources<S>[K], Descriptor<"resource", string, any>>
>(
  runtime: Runtime.Runtime<S, Services, Resources, States>,
  schema: S,
  descriptor: D
): Descriptor.Value<D> => {
  let captured!: Descriptor.Value<D>

  const readSystem = System.System(
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

  runtime.runSchedule(Schedule.Schedule(readSystem) as never)

  return captured
}

/**
 * Reads one state value from a runtime through the public scheduling API.
 */
export const readStateValue = <
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  Resources extends Runtime.RuntimeResources<S>,
  K extends keyof Schema.States<S>,
  States extends Runtime.RuntimeStates<S> & {
    readonly [P in K]: Schema.StateValue<S, P>
  },
  D extends Extract<Schema.States<S>[K], Descriptor<"state", string, any>>
>(
  runtime: Runtime.Runtime<S, Services, Resources, States>,
  schema: S,
  descriptor: D
): Descriptor.Value<D> => {
  let captured!: Descriptor.Value<D>

  const readSystem = System.System(
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

  runtime.runSchedule(Schedule.Schedule(readSystem) as never)

  return captured
}

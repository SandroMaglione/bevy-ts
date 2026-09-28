import { Fx } from "@bevy-ts/core"
import * as Runtime from "@bevy-ts/core/runtime"
import * as Schedule from "@bevy-ts/core/schedule"
import * as System from "@bevy-ts/core/system"
import type { Descriptor } from "@bevy-ts/core/descriptor"
import type { Schema } from "@bevy-ts/core/schema"

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
        captured = resources.value.get() as Descriptor.Value<D>
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
        captured = states.value.get() as Descriptor.Value<D>
      })
  )

  runtime.runSchedule(Schedule.Schedule(readSystem) as never)

  return captured
}

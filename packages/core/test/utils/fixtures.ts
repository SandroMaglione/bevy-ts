import * as Runtime from "@bevy-ts/core/Runtime"
import * as Schedule from "@bevy-ts/core/Schedule"
import * as System from "@bevy-ts/core/System"
import type { Descriptor } from "@bevy-ts/core/Descriptor"
import type { Schema } from "@bevy-ts/core/Schema"

/**
 * Reads one resource value from a runtime through the public scheduling API.
 */
export const readResourceValue = <
  S extends Schema.Any,
  D extends Schema.ResourceDescriptor<S>
>(
  runtime: Runtime.Runtime<S, any, any, any, any>,
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
      {
        captured = resources.value.get() as Descriptor.Value<D>
      }
  )

  runtime.tick(Schedule.Schedule(readSystem) as never)

  return captured
}

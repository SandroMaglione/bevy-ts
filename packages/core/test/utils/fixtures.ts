import * as Runtime from "@typeonce/bevy-ts/Runtime"
import * as Schedule from "@typeonce/bevy-ts/Schedule"
import * as System from "@typeonce/bevy-ts/System"
import type { Descriptor } from "@typeonce/bevy-ts/Descriptor"
import type { Schema } from "@typeonce/bevy-ts/Schema"

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

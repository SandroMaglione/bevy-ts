/**
 * A system that copies host input into an ECS resource once per run.
 *
 * Input devices are host capabilities (services), but gameplay should read
 * input as world data: a resource every system can declare, inspect, and test
 * without the host. `InputCapture.system(...)` builds the one system that
 * bridges them. Place it at the start of the schedule that consumes input, so
 * every system in that run reads the same snapshot and press edges are
 * observed exactly once per run.
 *
 * The source is any service with `snapshot()`: `Keyboard.actions(...)`
 * directly, or a game-specific adapter that merges several devices. The
 * resource's value type must be exactly the snapshot type.
 *
 * @module InputCapture
 * @docGroup browser
 *
 * @example
 * ```ts
 * const bindings = { left: ["ArrowLeft", "a"], right: ["ArrowRight", "d"], jump: [" "] } as const
 *
 * const KeyboardInput = Descriptor.Service<Keyboard.Actions<typeof bindings>>()("Game/Keyboard")
 * const Input = Descriptor.TransientResource<Keyboard.Snapshot<typeof bindings>>()("Game/Input")
 *
 * const CaptureInput = InputCapture.system(Game, { name: "Game/CaptureInput", source: KeyboardInput, resource: Input })
 * const update = Game.Schedule(CaptureInput, Move, Jump)
 *
 * const runtime = Game.Runtime.make({
 *   services: Game.Runtime.services(Game.Runtime.service(KeyboardInput, Keyboard.actions(window, bindings))),
 *   resources: { Input: Keyboard.idle(bindings) }
 * })
 * ```
 */
import type { Descriptor } from "@typeonce/bevy-ts/Descriptor"
import type { Schema } from "@typeonce/bevy-ts/Schema"

/**
 * Anything that produces one input snapshot per call.
 */
export interface Source<Value> {
  readonly snapshot: () => Value
}

type ServiceDescriptor = Descriptor<"service", string, any>
type ResourceDescriptor = Descriptor<"resource", string, any>

/**
 * The snapshot type produced by a source service, or `never` when the
 * service has no `snapshot()`.
 */
export type SnapshotOf<Service extends ServiceDescriptor> =
  Descriptor.Value<Service> extends Source<infer Value> ? Value : never

export interface Options<S extends Schema.Any, Service extends ServiceDescriptor, Resource extends Schema.ResourceDescriptor<S>> {
  /** The system name. */
  readonly name: string
  /** The service to read snapshots from; its value must have `snapshot()`. */
  readonly source: Descriptor.Value<Service> extends Source<any> ? Service : "The source service must provide snapshot()"
  /** The resource to write each snapshot into; its value type must be exactly the snapshot type. */
  readonly resource: Resource & Descriptor<"resource", string, SnapshotOf<Service>>
}

/**
 * The generated system. It requires the source service and the resource.
 */
export type CaptureSystem<S extends Schema.Any, Root, Needs extends ServiceDescriptor | ResourceDescriptor> =
  Schema.BoundSystem<S, Root, any, void, never, string, Needs>

/**
 * Builds the system that writes `source.snapshot()` into `resource`.
 */
export const system = <
  S extends Schema.Any,
  Root,
  const Service extends ServiceDescriptor,
  const Resource extends Schema.ResourceDescriptor<S>
>(
  Game: Schema.Game<S, Root>,
  options: Options<S, Service, Resource>
): CaptureSystem<S, Root, Service | Resource> =>
  Game.System(options.name, {
    resources: { input: Game.System.writeResource(options.resource) },
    services: { source: Game.System.service(options.source as Service) }
  }, ({ resources, services }) => {
    resources.input.set(services.source.snapshot() as never)
  }) as unknown as CaptureSystem<S, Root, Service | Resource>

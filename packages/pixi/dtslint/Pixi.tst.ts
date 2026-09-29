import { Descriptor, Result, Schema } from "@typeonce/bevy-ts"
import { NodeRegistry, RenderSync, packageTag } from "@typeonce/bevy-ts-pixi"
import { describe, expect, it } from "tstyche"

interface Node {
  destroy(): void
  x: number
}

const Position = Descriptor.Component<{ x: number }>()("PixiTypes/Position")
const Sprite = Descriptor.Component<{ label: string }>()("PixiTypes/Sprite")
const Health = Descriptor.Component<number>()("PixiTypes/Health")
const Nodes = Descriptor.Service<NodeRegistry.NodeRegistry<Node>>()("PixiTypes/Nodes")
const Game = Schema.bind(Schema.fragment({ components: { Position, Sprite } }))

describe("@typeonce/bevy-ts-pixi", () => {
  it("exposes the package entrypoint type through the workspace", () => {
    expect(packageTag).type.toBe<"pixi">()
  })

  it("types node callbacks from the descriptors and the registry service", () => {
    const render = RenderSync.system(Game, {
      name: "PixiTypes/Render",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      create: ({ renderable }) => {
        expect(renderable).type.toBe<{ readonly label: string }>()
        return { destroy() {}, x: 0 }
      },
      apply: (node, { transform }) => {
        expect(node).type.toBe<Node>()
        node.x = transform.x
      }
    })

    const withRegistry = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(Nodes, NodeRegistry.make<Node>({ attach() {}, detach() {} })))
    })
    expect(withRegistry.tick(Game.Schedule(render))).type.toBe<Result.Result<void, never>>()

    const withoutRegistry = Game.Runtime.make({ services: Game.Runtime.services() })
    // @ts-expect-error __runtimeRequirementError__: "Missing service"; readonly __requirement__: "PixiTypes/Nodes"
    withoutRegistry.tick(Game.Schedule(render))
  })

  it("types extra selections and services, and requires the extra services", () => {
    const Scale = Descriptor.Service<{ readonly factor: number }>()("PixiTypes/Scale")
    const render = RenderSync.system(Game, {
      name: "PixiTypes/Extra",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      select: { sprite: Game.Query.optional(Sprite) },
      services: { scale: Scale },
      create: ({ data, services }) => {
        expect(services.scale.factor).type.toBe<number>()
        if (data.sprite.present) expect(data.sprite.get()).type.toBe<{ readonly label: string }>()
        return { destroy() {}, x: 0 }
      },
      apply: (node, { transform, services }) => {
        node.x = transform.x * services.scale.factor
      }
    })

    const withoutScale = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(Nodes, NodeRegistry.make<Node>({ attach() {}, detach() {} })))
    })
    // @ts-expect-error __runtimeRequirementError__: "Missing service"; readonly __requirement__: "PixiTypes/Scale"
    withoutScale.tick(Game.Schedule(render))
  })

  it("types resources as read cells and only accepts schema resources", () => {
    const Zoom = Descriptor.Resource<number>()("PixiTypes/Zoom")
    const Other = Descriptor.Resource<number>()("PixiTypes/Other")
    const Zoomed = Schema.bind(Schema.fragment({ components: { Position, Sprite }, resources: { Zoom } }))
    RenderSync.system(Zoomed, {
      name: "PixiTypes/Zoom",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      resources: { zoom: Zoom },
      create: ({ resources }) => {
        expect(resources.zoom.get()).type.toBe<number>()
        return { destroy() {}, x: 0 }
      },
      apply: (node, { transform, resources }) => {
        node.x = transform.x * resources.zoom.get()
      }
    })

    RenderSync.system(Zoomed, {
      name: "PixiTypes/Unknown",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      // @ts-expect-error Type '"PixiTypes/Other"' is not assignable to type '"PixiTypes/Zoom"'.
      resources: { other: Other },
      create: () => ({ destroy() {}, x: 0 }),
      apply: () => {}
    })
  })

  it("only accepts read-only extra slots", () => {
    RenderSync.system(Game, {
      name: "PixiTypes/WriteSlot",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      // @ts-expect-error Type '"write"' is not assignable to type '"optional"'.
      select: { position: Game.Query.write(Position) },
      create: () => ({ destroy() {}, x: 0 }),
      apply: () => {}
    })
  })

  it("only accepts schema components in redrawOn", () => {
    RenderSync.system(Game, {
      name: "PixiTypes/Redraw",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      redrawOn: [Sprite],
      create: () => ({ destroy() {}, x: 0 }),
      apply: () => {}
    })
    RenderSync.system(Game, {
      name: "PixiTypes/RedrawInvalid",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      // @ts-expect-error Type '"PixiTypes/Health"' is not assignable to type '"PixiTypes/Position"'.
      redrawOn: [Health],
      create: () => ({ destroy() {}, x: 0 }),
      apply: () => {}
    })
  })

  it("only accepts components registered in the bound schema", () => {
    RenderSync.system(Game, {
      name: "PixiTypes/Invalid",
      // @ts-expect-error Type '"PixiTypes/Health"' is not assignable to type '"PixiTypes/Position"'.
      renderable: Health,
      transform: Position,
      registry: Nodes,
      create: () => ({ destroy() {}, x: 0 }),
      apply: () => {}
    })
  })

  it("makes the transform optional: callbacks then see `transform: undefined`", () => {
    const render = RenderSync.system(Game, {
      name: "PixiTypes/NoTransform",
      renderable: Sprite,
      registry: Nodes,
      create: ({ transform }) => {
        expect(transform).type.toBe<undefined>()
        return { destroy() {}, x: 0 }
      },
      apply: () => {}
    })
    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(Nodes, NodeRegistry.make<Node>({ attach() {}, detach() {} })))
    })
    expect(runtime.tick(Game.Schedule(render)).ok).type.toBe<boolean>()
  })

  it("types interpolate: planar components, a clock with alpha, and required services", () => {
    const Planar = Descriptor.Component<{ x: number; y: number }>()("PixiTypes/Planar")
    const Previous = Descriptor.Component<{ x: number; y: number }>()("PixiTypes/Previous")
    const Clock = Descriptor.Service<{ readonly alpha: number }>()("PixiTypes/Clock")
    const NoAlpha = Descriptor.Service<{ readonly now: number }>()("PixiTypes/NoAlpha")
    const Planet = Schema.bind(Schema.fragment({ components: { Planar, Previous, Position, Health } }))

    const interpolate = RenderSync.interpolate(Planet, {
      name: "PixiTypes/Interpolate",
      registry: Nodes,
      previous: Previous,
      current: Planar,
      clock: Clock,
      place: (node, position) => {
        expect(node).type.toBe<Node>()
        expect(position).type.toBe<RenderSync.Planar>()
      }
    })

    const withoutClock = Planet.Runtime.make({
      services: Planet.Runtime.services(Planet.Runtime.service(Nodes, NodeRegistry.make<Node>({ attach() {}, detach() {} })))
    })
    // @ts-expect-error __runtimeRequirementError__: "Missing service"; readonly __requirement__: "PixiTypes/Clock"
    withoutClock.tick(Planet.Schedule(interpolate))

    RenderSync.interpolate(Planet, {
      name: "PixiTypes/NotPlanar",
      registry: Nodes,
      // @ts-expect-error Type 'Descriptor<"component", "PixiTypes/Health", number>' is not assignable to type '"The previous component
      previous: Health,
      current: Planar,
      clock: Clock,
      place: () => {}
    })

    RenderSync.interpolate(Planet, {
      name: "PixiTypes/NoAlpha",
      registry: Nodes,
      previous: Previous,
      current: Planar,
      // @ts-expect-error Type 'Descriptor<"service", "PixiTypes/NoAlpha", { readonly now: number; }>' is not assignable to type '"The
      clock: NoAlpha,
      place: () => {}
    })
  })
})


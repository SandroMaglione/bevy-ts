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
    // @ts-expect-error!
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
    // @ts-expect-error!
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
      // @ts-expect-error!
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
      // @ts-expect-error!
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
      // @ts-expect-error!
      redrawOn: [Health],
      create: () => ({ destroy() {}, x: 0 }),
      apply: () => {}
    })
  })

  it("only accepts components registered in the bound schema", () => {
    RenderSync.system(Game, {
      name: "PixiTypes/Invalid",
      // @ts-expect-error!
      renderable: Health,
      transform: Position,
      registry: Nodes,
      create: () => ({ destroy() {}, x: 0 }),
      apply: () => {}
    })
  })
})

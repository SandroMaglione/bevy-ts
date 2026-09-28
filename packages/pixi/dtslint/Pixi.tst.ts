import { Descriptor, Result, Schema } from "@bevy-ts/core"
import { NodeRegistry, RenderSync, packageTag } from "@bevy-ts/pixi"
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

describe("@bevy-ts/pixi", () => {
  it("exposes the package entrypoint type through the workspace", () => {
    expect(packageTag).type.toBe<"pixi">()
  })

  it("types node callbacks from the descriptors and the registry service", () => {
    const render = RenderSync.systems(Game, {
      name: "PixiTypes/Render",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      create: (sprite) => {
        expect(sprite).type.toBe<{ readonly label: string }>()
        return { destroy() {}, x: 0 }
      },
      apply: (node, position) => {
        expect(node).type.toBe<Node>()
        node.x = position.x
      }
    })

    const withRegistry = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(Nodes, NodeRegistry.make<Node>({ attach() {}, detach() {} })))
    })
    expect(withRegistry.tick(Game.Schedule(render.create, render.sync, render.destroy))).type.toBe<Result.Result<void, never>>()

    const withoutRegistry = Game.Runtime.make({ services: Game.Runtime.services() })
    // @ts-expect-error!
    withoutRegistry.tick(Game.Schedule(render.create))
  })

  it("only accepts components registered in the bound schema", () => {
    RenderSync.systems(Game, {
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

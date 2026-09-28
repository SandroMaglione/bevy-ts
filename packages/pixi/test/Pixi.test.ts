import { describe, expect, it } from "vitest"

import { Descriptor, Schema } from "@bevy-ts/core"
import type * as Entity from "@bevy-ts/core/Entity"
import { NodeRegistry, RenderSync, packageTag } from "@bevy-ts/pixi"

class FakeNode {
  readonly label: string
  x = 0
  y = 0
  destroyed = false
  constructor(label: string) {
    this.label = label
  }
  destroy() {
    this.destroyed = true
  }
}

class FakeContainer {
  readonly children: Array<FakeNode> = []
  addChild(child: FakeNode) {
    this.children.push(child)
  }
  removeChild(child: FakeNode) {
    this.children.splice(this.children.indexOf(child), 1)
  }
}

const Position = Descriptor.Component<{ x: number; y: number }>()("PixiTest/Position")
const Sprite = Descriptor.Component<{ label: string }>()("PixiTest/Sprite")
const Nodes = Descriptor.Service<NodeRegistry.NodeRegistry<FakeNode>>()("PixiTest/Nodes")

const Game = Schema.bind(Schema.fragment({ components: { Position, Sprite } }))
type Id = Entity.EntityId<typeof Game.schema, typeof Game.schema>

describe("@bevy-ts/pixi", () => {
  it("resolves through the workspace package entrypoint", () => {
    expect(packageTag).toBe("pixi")
  })

  it("keeps one attached node per entity and destroys it on removal", () => {
    const layer = new FakeContainer()
    const registry = NodeRegistry.inContainer(layer)
    const first = registry.ensure({ value: 1 }, () => new FakeNode("a"))

    expect(registry.ensure({ value: 1 }, () => new FakeNode("b"))).toBe(first)
    expect(layer.children).toEqual([first])
    expect(registry.remove({ value: 1 })).toBe(true)
    expect(registry.remove({ value: 1 })).toBe(false)
    expect(first.destroyed).toBe(true)
    expect(layer.children).toEqual([])
  })

  it("mirrors spawns, moves, and despawns into registry nodes", () => {
    const layer = new FakeContainer()
    const registry = NodeRegistry.inContainer(layer)
    const render = RenderSync.systems(Game, {
      name: "PixiTest/Render",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      create: ({ renderable }) => new FakeNode(renderable.label),
      apply: (node, { transform }) => {
        node.x = transform.x
        node.y = transform.y
      }
    })

    const ids: Array<Id> = []
    const Spawn = Game.System("PixiTest/Spawn", {}, ({ commands }) => {
      ids.push(commands.spawn(Game.Command.spawn([Position, { x: 1, y: 2 }], [Sprite, { label: "hero" }])))
      commands.spawn(Game.Command.spawn([Position, { x: 0, y: 0 }]))
    })
    const Move = Game.System("PixiTest/Move", {
      queries: { moving: Game.Query({ selection: { position: Game.Query.write(Position) }, with: [Sprite] }) }
    }, ({ queries }) => {
      for (const { data } of queries.moving.each()) {
        data.position.update((position) => ({ x: position.x + 10, y: position.y }))
      }
    })
    const Despawn = Game.System("PixiTest/Despawn", {}, ({ commands }) => {
      commands.despawn(ids[0]!)
    })

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(Nodes, registry))
    })
    const sync = Game.Schedule(render.destroy, render.create, render.sync)

    runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred(), sync))
    expect(layer.children.map((node) => [node.label, node.x, node.y])).toEqual([["hero", 1, 2]])

    runtime.tick(Game.Schedule(Move, sync))
    expect(layer.children.map((node) => [node.label, node.x, node.y])).toEqual([["hero", 11, 2]])

    const hero = layer.children[0]!
    runtime.tick(Game.Schedule(Despawn, Game.Schedule.applyDeferred(), sync))
    expect(layer.children).toEqual([])
    expect(hero.destroyed).toBe(true)
    expect(registry.size).toBe(0)
  })

  it("passes selected data, resources, and services to the callbacks", () => {
    const Zoom = Descriptor.Resource<number>()("PixiTest/Zoom")
    const Prefix = Descriptor.Service<string>()("PixiTest/Prefix")
    const Zoomed = Schema.bind(Schema.fragment({ components: { Position, Sprite }, resources: { Zoom } }))
    const layer = new FakeContainer()
    const render = RenderSync.systems(Zoomed, {
      name: "PixiTest/Zoomed",
      renderable: Position,
      transform: Position,
      registry: Nodes,
      select: { sprite: Zoomed.Query.optional(Sprite) },
      resources: { zoom: Zoom },
      services: { prefix: Prefix },
      create: ({ data, services }) => new FakeNode(`${services.prefix}${data.sprite.present ? data.sprite.get().label : "none"}`),
      apply: (node, { transform, resources }) => {
        node.x = transform.x * resources.zoom.get()
      }
    })
    const Spawn = Zoomed.System("PixiTest/SpawnZoomed", {}, ({ commands }) => {
      commands.spawn(Zoomed.Command.spawn([Position, { x: 3, y: 0 }], [Sprite, { label: "hero" }]))
      commands.spawn(Zoomed.Command.spawn([Position, { x: 1, y: 0 }]))
    })

    const runtime = Zoomed.Runtime.make({
      services: Zoomed.Runtime.services(
        Zoomed.Runtime.service(Nodes, NodeRegistry.inContainer(layer)),
        Zoomed.Runtime.service(Prefix, "#")
      ),
      resources: { Zoom: 2 }
    })
    runtime.tick(Zoomed.Schedule(Spawn, Zoomed.Schedule.applyDeferred(), render.create))
    expect(layer.children.map((node) => [node.label, node.x])).toEqual([["#hero", 6], ["#none", 2]])
  })
})

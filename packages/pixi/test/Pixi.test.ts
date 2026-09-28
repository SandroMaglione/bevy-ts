import { describe, expect, it } from "vitest"

import { Descriptor, Schema } from "@typeonce/bevy-ts"
import type * as Entity from "@typeonce/bevy-ts/Entity"
import { NodeRegistry, RenderSync, packageTag } from "@typeonce/bevy-ts-pixi"

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

describe("@typeonce/bevy-ts-pixi", () => {
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
    const render = RenderSync.system(Game, {
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
    const sync = Game.Schedule(render)

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
    const render = RenderSync.system(Zoomed, {
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
    runtime.tick(Zoomed.Schedule(Spawn, Zoomed.Schedule.applyDeferred(), render))
    expect(layer.children.map((node) => [node.label, node.x])).toEqual([["#hero", 6], ["#none", 2]])
  })

  it("re-applies nodes when a redrawOn component changes, once per entity", () => {
    const Frame = Descriptor.Component<number>()("PixiTest/Frame")
    const Animated = Schema.bind(Schema.fragment({ components: { Position, Sprite, Frame } }))
    const layer = new FakeContainer()
    const applied: Array<string> = []
    const render = RenderSync.system(Animated, {
      name: "PixiTest/Animated",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      select: { frame: Animated.Query.read(Frame) },
      redrawOn: [Frame],
      create: ({ renderable }) => new FakeNode(renderable.label),
      apply: (node, { transform, data }) => {
        node.x = transform.x
        node.y = data.frame.get()
        applied.push(`${node.label}:${node.x}:${node.y}`)
      }
    })
    const Spawn = Animated.System("PixiTest/SpawnAnimated", {}, ({ commands }) => {
      commands.spawn(Animated.Command.spawn([Position, { x: 0, y: 0 }], [Sprite, { label: "hero" }], [Frame, 0]))
    })
    const step = (moves: boolean) => Animated.System(`PixiTest/Step${moves}`, {
      queries: { heroes: Animated.Query({ selection: { position: Animated.Query.write(Position), frame: Animated.Query.write(Frame) } }) }
    }, ({ queries }) => {
      for (const { data } of queries.heroes.each()) {
        data.frame.update((frame) => frame + 1)
        if (moves) data.position.update((position) => ({ x: position.x + 1, y: position.y }))
      }
    })

    const runtime = Animated.Runtime.make({
      services: Animated.Runtime.services(Animated.Runtime.service(Nodes, NodeRegistry.inContainer(layer)))
    })
    runtime.tick(Animated.Schedule(Spawn, Animated.Schedule.applyDeferred(), render))
    runtime.tick(Animated.Schedule(step(false), render))
    runtime.tick(Animated.Schedule(step(true), render))
    // Each node is applied once per run, including the run that creates it.
    expect(applied).toEqual(["hero:0:0", "hero:0:1", "hero:1:2"])
  })

  it("replaces the node of an entity that lost and regained its renderable in one run", () => {
    const layer = new FakeContainer()
    const render = RenderSync.system(Game, {
      name: "PixiTest/Readd",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      create: ({ renderable }) => new FakeNode(renderable.label),
      apply: () => {}
    })
    const ids: Array<Id> = []
    const Spawn = Game.System("PixiTest/SpawnReadd", {}, ({ commands }) => {
      ids.push(commands.spawn(Game.Command.spawn([Position, { x: 0, y: 0 }], [Sprite, { label: "old" }])))
    })
    const Swap = Game.System("PixiTest/Swap", {}, ({ commands }) => {
      commands.remove(ids[0]!, Sprite)
    })
    const Readd = Game.System("PixiTest/ReaddSprite", {}, ({ commands }) => {
      commands.insert(ids[0]!, [Sprite, { label: "new" }])
    })
    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(Nodes, NodeRegistry.inContainer(layer)))
    })
    runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred(), render))
    const old = layer.children[0]!
    runtime.tick(Game.Schedule(Swap, Game.Schedule.applyDeferred(), Readd, Game.Schedule.applyDeferred(), render))
    expect(old.destroyed).toBe(true)
    expect(layer.children.map((node) => node.label)).toEqual(["new"])
  })

  it("creates, updates, and destroys nothing while its run conditions fail, and catches up after", () => {
    const Mode = Game.StateMachine("PixiTest/Mode", ["Visible", "Hidden"] as const)
    const layer = new FakeContainer()
    const render = RenderSync.system(Game, {
      name: "PixiTest/Gated",
      renderable: Sprite,
      transform: Position,
      registry: Nodes,
      when: [Game.Condition.inState(Mode, "Visible")],
      create: ({ renderable }) => new FakeNode(renderable.label),
      apply: (node, { transform }) => {
        node.x = transform.x
      }
    })
    const Spawn = Game.System("PixiTest/SpawnGated", {}, ({ commands }) => {
      commands.spawn(Game.Command.spawn([Position, { x: 4, y: 0 }], [Sprite, { label: "late" }]))
    })
    const Show = Game.System("PixiTest/Show", { nextMachines: { mode: Game.System.nextState(Mode) } }, ({ nextMachines }) => {
      nextMachines.mode.set("Visible")
    })
    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(Nodes, NodeRegistry.inContainer(layer))),
      machines: Game.Runtime.machines(Game.Runtime.machine(Mode, "Hidden"))
    })
    runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred(), render))
    expect(layer.children).toEqual([])
    runtime.tick(Game.Schedule(Show, Game.Schedule.applyStateTransitions(), render))
    expect(layer.children.map((node) => [node.label, node.x])).toEqual([["late", 4]])
  })

  it("without a transform, applies on creation and redrawOn changes only", () => {
    const layer = new FakeContainer()
    const applied: Array<string> = []
    const render = RenderSync.system(Game, {
      name: "PixiTest/NoTransform",
      renderable: Sprite,
      registry: Nodes,
      redrawOn: [Sprite],
      create: ({ renderable }) => new FakeNode(renderable.label),
      apply: (_node, { renderable }) => {
        applied.push(renderable.label)
      }
    })
    const ids: Array<Id> = []
    const Spawn = Game.System("PixiTest/SpawnNoTransform", {}, ({ commands }) => {
      ids.push(commands.spawn(Game.Command.spawn([Position, { x: 0, y: 0 }], [Sprite, { label: "a" }])))
    })
    const Move = Game.System("PixiTest/MoveNoTransform", { queries: { all: Game.Query({ selection: { position: Game.Query.write(Position) } }) } }, ({ queries }) => {
      for (const { data } of queries.all.each()) data.position.update((position) => ({ x: position.x + 1, y: position.y }))
    })
    const Relabel = Game.System("PixiTest/Relabel", { queries: { all: Game.Query({ selection: { sprite: Game.Query.write(Sprite) } }) } }, ({ queries }) => {
      for (const { data } of queries.all.each()) data.sprite.set({ label: "b" })
    })
    const runtime = Game.Runtime.make({ services: Game.Runtime.services(Game.Runtime.service(Nodes, NodeRegistry.inContainer(layer))) })
    runtime.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred(), render))
    runtime.tick(Game.Schedule(Move, render))
    runtime.tick(Game.Schedule(Relabel, render))
    expect(applied).toEqual(["a", "b"])
  })

  it("interpolates nodes between the previous and current positions at the clock's alpha", () => {
    const Previous = Descriptor.Component<{ x: number; y: number }>()("PixiTest/Previous")
    const Clock = Descriptor.Service<{ alpha: number }>()("PixiTest/Clock")
    const Moving = Schema.bind(Schema.fragment({ components: { Position, Previous, Sprite } }))
    const layer = new FakeContainer()
    const clock = { alpha: 0.25 }
    const sync = RenderSync.system(Moving, {
      name: "PixiTest/SyncMoving",
      renderable: Sprite,
      registry: Nodes,
      create: ({ renderable }) => new FakeNode(renderable.label),
      apply: () => {}
    })
    const interpolate = RenderSync.interpolate(Moving, {
      name: "PixiTest/Interpolate",
      registry: Nodes,
      previous: Previous,
      current: Position,
      clock: Clock,
      place: (node, { x, y }) => {
        node.x = x
        node.y = y
      }
    })
    const Spawn = Moving.System("PixiTest/SpawnMoving", {}, ({ commands }) => {
      commands.spawn(Moving.Command.spawn([Position, { x: 10, y: 20 }], [Previous, { x: 0, y: 0 }], [Sprite, { label: "moving" }]))
      // No node: has both positions but no renderable.
      commands.spawn(Moving.Command.spawn([Position, { x: 1, y: 1 }], [Previous, { x: 0, y: 0 }]))
    })
    const runtime = Moving.Runtime.make({
      services: Moving.Runtime.services(Moving.Runtime.service(Nodes, NodeRegistry.inContainer(layer)), Moving.Runtime.service(Clock, clock))
    })
    runtime.tick(Moving.Schedule(Spawn, Moving.Schedule.applyDeferred(), sync, interpolate))
    expect(layer.children.map((node) => [node.x, node.y])).toEqual([[2.5, 5]])
    clock.alpha = 0.5
    runtime.tick(Moving.Schedule(interpolate))
    expect(layer.children.map((node) => [node.x, node.y])).toEqual([[5, 10]])
  })
})


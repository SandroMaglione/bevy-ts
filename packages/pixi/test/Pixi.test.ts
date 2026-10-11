import { describe, expect, it } from "vitest"

import * as Render from "@typeonce/bevy-ts-render"
import { NodeRegistry, RenderSync, packageTag } from "@typeonce/bevy-ts-pixi"

class FakeNode {
  readonly label: string
  destroyed = false
  destroyOptions: unknown = undefined
  constructor(label: string) {
    this.label = label
  }
  destroy(options?: unknown) {
    this.destroyed = true
    this.destroyOptions = options
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

describe("@typeonce/bevy-ts-pixi", () => {
  it("resolves through the workspace package entrypoint", () => {
    expect(packageTag).toBe("pixi")
  })

  it("re-exports the generic registry and render sync from @typeonce/bevy-ts-render", () => {
    expect(NodeRegistry.make).toBe(Render.NodeRegistry.make)
    expect(RenderSync.system).toBe(Render.RenderSync.system)
    expect(RenderSync.interpolate).toBe(Render.RenderSync.interpolate)
  })

  it("inContainer keeps one attached node per entity and destroys it on removal", () => {
    const layer = new FakeContainer()
    const registry = NodeRegistry.inContainer(layer)
    const first = registry.ensure(1, () => new FakeNode("a"))

    expect(registry.ensure(1, () => new FakeNode("b"))).toBe(first)
    expect(layer.children).toEqual([first])
    expect(registry.remove(1)).toBe(true)
    expect(registry.remove(1)).toBe(false)
    expect(first.destroyed).toBe(true)
    expect(first.destroyOptions).toEqual({ children: true })
    expect(layer.children).toEqual([])
  })

  it("inContainer detaches and destroys every node on clear", () => {
    const layer = new FakeContainer()
    const registry = NodeRegistry.inContainer(layer)
    const a = registry.ensure(1, () => new FakeNode("a"))
    const b = registry.ensure(2, () => new FakeNode("b"))

    expect(layer.children).toEqual([a, b])
    registry.clear()
    expect(layer.children).toEqual([])
    expect([a.destroyed, b.destroyed]).toEqual([true, true])
    expect(registry.size).toBe(0)
  })
})

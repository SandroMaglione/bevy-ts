import { NodeRegistry, packageTag } from "@typeonce/bevy-ts-pixi"
import { describe, expect, it } from "tstyche"

interface Node {
  destroy(): void
  x: number
}

describe("@typeonce/bevy-ts-pixi", () => {
  it("exposes the package entrypoint type through the workspace", () => {
    expect(packageTag).type.toBe<"pixi">()
  })

  it("types inContainer registries from the container's children", () => {
    const layer = { addChild(_child: Node) {}, removeChild(_child: Node) {} }
    expect(NodeRegistry.inContainer(layer)).type.toBe<NodeRegistry.NodeRegistry<Node>>()
    expect(NodeRegistry.inContainer).type.not.toBeCallableWith({ addChild(_child: { x: number }) {}, removeChild(_child: { x: number }) {} })
  })
})

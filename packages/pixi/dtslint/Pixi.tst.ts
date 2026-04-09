import { packageTag } from "@bevy-ts/pixi"
import { describe, expect, it } from "tstyche"

describe("@bevy-ts/pixi", () => {
  it("exposes the package entrypoint type through the workspace", () => {
    expect(packageTag).type.toBe<"pixi">()
  })
})

import { packageTag } from "@bevy-ts/browser"
import { describe, expect, it } from "tstyche"

describe("@bevy-ts/browser", () => {
  it("exposes the package entrypoint type through the workspace", () => {
    expect(packageTag).type.toBe<"browser">()
  })
})

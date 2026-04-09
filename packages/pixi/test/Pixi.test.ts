import { describe, expect, it } from "vitest"

import { packageTag } from "@bevy-ts/pixi"

describe("@bevy-ts/pixi", () => {
  it("resolves through the workspace package entrypoint", () => {
    expect(packageTag).toBe("pixi")
  })
})

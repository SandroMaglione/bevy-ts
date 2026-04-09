import { describe, expect, it } from "vitest"

import { packageTag } from "@bevy-ts/browser"

describe("@bevy-ts/browser", () => {
  it("resolves through the workspace package entrypoint", () => {
    expect(packageTag).toBe("browser")
  })
})

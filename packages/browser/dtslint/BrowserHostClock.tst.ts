import { BrowserHostClock } from "@typeonce/ritmo-browser"
import type { HostClock } from "@typeonce/ritmo"
import { describe, expect, it } from "tstyche"

describe("BrowserHostClock.make", () => {
  it("makes a core host clock from a window-like host", () => {
    const host = { performance: { now: () => 0 }, document: {} }
    expect(BrowserHostClock.make(host)).type.toBe<HostClock.HostClock>()
  })

  it("rejects a host without performance", () => {
    const noPerformance = { now: () => 0 }
    // @ts-expect-error Property 'performance' is missing
    BrowserHostClock.make(noPerformance)
  })
})

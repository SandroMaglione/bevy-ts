import { HostClock, Result } from "@typeonce/ritmo"
import { describe, expect, it } from "tstyche"

describe("HostClock", () => {
  it("types the standard clock as a plain host clock", () => {
    expect(HostClock.standard).type.toBe<HostClock.HostClock>()
    expect(HostClock.standard.now()).type.toBe<number>()
  })

  it("types the test clock with adjust, which returns a Result", () => {
    const clock = HostClock.test()
    expect(clock).type.toBe<HostClock.TestHostClock>()
    expect(clock.adjust(16)).type.toBe<Result.Result<void, HostClock.InvalidAdjustment>>()
    expect<HostClock.InvalidAdjustment["_tag"]>().type.toBe<"InvalidAdjustment">()
    expect(clock).type.toBeAssignableTo<HostClock.HostClock>()
  })

  it("types elapsed as a number of milliseconds", () => {
    expect(HostClock.elapsed(0, 16)).type.toBe<number>()
    // @ts-expect-error Argument of type 'string' is not assignable to parameter of type 'number'.
    HostClock.elapsed("0", 16)
  })

  it("has no adjust on the standard clock", () => {
    // @ts-expect-error Property 'adjust' does not exist on type 'HostClock'.
    HostClock.standard.adjust(1)
  })
})

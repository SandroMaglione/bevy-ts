import { Decode, Descriptor, Fx, Result, Schema } from "@typeonce/bevy-ts"
import type { Handle } from "@typeonce/bevy-ts/Entity"
import { describe, expect, it } from "tstyche"

describe("Result", () => {
  it("keeps value and error types through narrowing, match, and all", () => {
    const parsed = Result.success(1) as Result.Result<number, "NaN">
    if (parsed.ok) expect(parsed.value).type.toBe<number>()
    else expect(parsed.error).type.toBe<"NaN">()
    expect(Result.match(parsed, { onSuccess: (value) => value > 0, onFailure: (error) => error })).type.toBe<boolean | "NaN">()

    const name = Result.success("a") as Result.Result<string, "Empty">
    expect(Result.all([parsed, name])).type.toBe<Result.Result<readonly [number, string], "NaN" | "Empty">>()
    expect(Result.all({ parsed, name })).type.toBe<Result.Result<{ readonly parsed: number; readonly name: string }, "NaN" | "Empty">>()
  })
})

describe("Fx", () => {
  it("accumulates errors and requirements through flatMap", () => {
    const load = Fx.fail("Missing" as const)
    const parse = (_: never) => Fx.fail("Invalid" as const)
    expect(Fx.flatMap(load, parse)).type.toBe<Fx.Fx<never, "Missing" | "Invalid", unknown>>()
    expect(Fx.map(Fx.succeed(1), (value) => String(value))).type.toBe<Fx.Fx<string, never, unknown>>()
    expect(Fx.runSync(Fx.fail("Nope" as const))).type.toBe<Result.Result<never, "Nope">>()
  })
})

describe("Decode", () => {
  const Root = Schema.defineRoot("Values")
  const Health = Descriptor.Component<number>()("Values/Health")

  it("infers the decoded type of each codec", () => {
    expect(Decode.literal("idle", "run")).type.toBe<Decode.Codec<"idle" | "run">>()
    expect(Decode.nullable(Decode.number)).type.toBe<Decode.Codec<number | null>>()
    expect(Decode.array(Decode.string)).type.toBe<Decode.Codec<ReadonlyArray<string>>>()
    expect(Decode.struct({ level: Decode.integer, tags: Decode.array(Decode.string) })).type.toBe<
      Decode.Codec<{ readonly level: number; readonly tags: ReadonlyArray<string> }>
    >()
    expect(Decode.handle(Root, Health)).type.toBe<Decode.Codec<Handle<typeof Root, typeof Health>>>()
  })

  it("makes constructed descriptors whose values and raw input follow the codec", () => {
    const Stats = Descriptor.ConstructedComponent(Decode.struct({ level: Decode.integer }))("Values/Stats")
    expect<Descriptor.Descriptor.Value<typeof Stats>>().type.toBe<{ readonly level: number }>()
    expect<Descriptor.Descriptor.Raw<typeof Stats>>().type.toBe<{ readonly level: number }>()
  })

  it("rejects codecs that cannot be built", () => {
    // @ts-expect-error Expected at least 1 arguments, but got 0
    Decode.literal()
    // @ts-expect-error Type 'number' is not assignable to type 'Codec<any>'
    Decode.struct({ level: 1 })
  })
})

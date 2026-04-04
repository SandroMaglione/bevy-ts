import { describe, expect, it } from "vitest"
// @ts-expect-error The docs generator runs as ESM JS; the test imports its runtime entrypoint directly.
import { collectNamedDescriptions, parseJSDoc } from "../scripts/docgen.mjs"

describe("parseJSDoc", () => {
  it("parses description and repeated tags", () => {
    const comment = parseJSDoc(`/**
 * Example module.
 *
 * @docGroup helpers
 * @categoryDescription Constructors
 * Builders.
 * @example
 * \`\`\`ts
 * const value = 1
 * \`\`\`
 */`)

    expect(comment.description).toContain("Example module.")
    expect(comment.tags.get("docGroup")).toEqual(["helpers"])
    expect(comment.tags.get("example")?.[0]).toContain("```ts")
  })
})

describe("collectNamedDescriptions", () => {
  it("keeps the first line as the section name and the rest as the body", () => {
    const descriptions = collectNamedDescriptions([
      "Constructors\nBuilders for the public surface."
    ])

    expect(descriptions.get("Constructors")).toBe("Builders for the public surface.")
  })
})

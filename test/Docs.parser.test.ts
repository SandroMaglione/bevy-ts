import { describe, expect, it } from "vitest"
import { collectNamedDescriptions, createDocsRenderer, parseJSDoc } from "../scripts/docgen.ts"

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

describe("createDocsRenderer", () => {
  it("highlights fenced blocks, inline code, and signatures with shiki markup", async () => {
    const renderer = await createDocsRenderer()

    const markdownHtml = renderer.markdown.render([
      "Inline `Game.System.define()`",
      "",
      "```ts",
      "const value = 1",
      "```"
    ].join("\n"))

    expect(markdownHtml).toContain('class="shiki')
    expect(markdownHtml).toContain('class="line"')
    expect(markdownHtml).toContain('inline-code')

    const signatureHtml = renderer.highlightBlock("export const value: number", "ts")

    expect(signatureHtml).toContain('class="shiki')
    expect(signatureHtml).toContain("export")
  })

  it("drops trailing blank lines from highlighted blocks", async () => {
    const renderer = await createDocsRenderer()

    const html = renderer.highlightBlock("const value = 1\n", "ts")

    expect(html.match(/class="line"/g)).toHaveLength(1)
  })
})

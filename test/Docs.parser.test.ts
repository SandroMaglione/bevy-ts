import { describe, expect, it } from "vitest"
import {
  buildSiteCss,
  collectNamedDescriptions,
  createDocsRenderer,
  getItemShortDescription,
  parseJSDoc
} from "../scripts/docgen.ts"

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

describe("getItemShortDescription", () => {
  it("returns the first paragraph as a single line", () => {
    const summary = getItemShortDescription([
      "Creates the system definition.",
      "",
      "Further details stay in the full body."
    ].join("\n"))

    expect(summary).toBe("Creates the system definition.")
  })

  it("collapses multiline first paragraphs", () => {
    const summary = getItemShortDescription([
      "Defines the query access surface",
      "without keeping formatting noise.",
      "",
      "Second paragraph."
    ].join("\n"))

    expect(summary).toBe("Defines the query access surface without keeping formatting noise.")
  })
})

describe("buildSiteCss", () => {
  it("minifies the authored stylesheet", () => {
    const css = buildSiteCss(`
      .example {
        color: #ffffff;
        margin: 0 0 0 0;
      }
    `)

    expect(css).toContain(".example{")
    expect(css).toContain("#fff")
    expect(css).not.toContain("\n")
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

import { describe, expect, it } from "vitest"
import {
  buildSiteCss,
  collectNamedDescriptions,
  collectExampleApiUsageCounts,
  createDocsRenderer,
  extractExampleApiUsages,
  getItemShortDescription,
  parseJSDoc,
  resolveKeyApiEntries
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

describe("extractExampleApiUsages", () => {
  it("collects bound and direct namespace helper usages", () => {
    const usages = extractExampleApiUsages([
      "const setup = Game.System(\"Setup\", {",
      "  queries: { moving: Game.Query({ selection: { position: Game.Query.read(Position) } }) }",
      "})",
      "const Game = Schema.bind(Schema.fragment({}))",
      "const app = App.makeApp(runtime)",
      "const state = Game.Condition.inState(Phase, \"Running\")"
    ].join("\n"))

    expect(usages).toEqual([
      "query.read",
      "machine.inState",
      "system.System",
      "query.Query",
      "schema.bind",
      "schema.fragment",
      "app.makeApp"
    ])
  })
})

describe("collectExampleApiUsageCounts", () => {
  it("counts helper usage across multiple example sources", () => {
    const counts = collectExampleApiUsageCounts([
      "Game.System(\"A\", {})\nGame.System(\"B\", {})",
      "Schema.bind(Schema.fragment({}))\nGame.System(\"C\", {})"
    ])

    expect(counts.get("system.System")).toBe(3)
    expect(counts.get("schema.bind")).toBe(1)
    expect(counts.get("schema.fragment")).toBe(1)
  })
})

describe("resolveKeyApiEntries", () => {
  it("keeps only documented helpers and sorts by usage then module and item order", () => {
    const entries = resolveKeyApiEntries(
      new Map([
        ["system.System", 3],
        ["schema.bind", 3],
        ["app.makeApp", 1],
        ["runtime.missing", 10]
      ]),
      [
        {
          key: "system.System",
          moduleSlug: "system",
          moduleName: "system",
          modulePath: "src/system.ts",
          moduleOrder: 2,
          itemName: "System",
          itemAnchor: "system",
          itemDescription: "Defines a system.",
          itemOrder: 5
        },
        {
          key: "schema.bind",
          moduleSlug: "schema",
          moduleName: "schema",
          modulePath: "src/schema.ts",
          moduleOrder: 1,
          itemName: "bind",
          itemAnchor: "bind",
          itemDescription: "Binds a schema.",
          itemOrder: 3
        },
        {
          key: "app.makeApp",
          moduleSlug: "app",
          moduleName: "app",
          modulePath: "src/app.ts",
          moduleOrder: 0,
          itemName: "makeApp",
          itemAnchor: "makeapp",
          itemDescription: "Wraps a runtime.",
          itemOrder: 1
        }
      ]
    )

    expect(entries.map((entry) => entry.key)).toEqual([
      "schema.bind",
      "system.System",
      "app.makeApp"
    ])
    expect(entries.map((entry) => entry.usageCount)).toEqual([3, 3, 1])
  })
})

describe("createDocsRenderer", () => {
  it("highlights fenced blocks, inline code, and signatures with shiki markup", async () => {
    const renderer = await createDocsRenderer()

    const markdownHtml = renderer.markdown.render([
      "Inline `Game.System()`",
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

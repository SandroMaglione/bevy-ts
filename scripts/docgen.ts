import * as NodePath from "node:path"
import process from "node:process"
import MarkdownIt from "markdown-it"
import * as FileSystem from "effect/FileSystem"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { transform } from "lightningcss"
import { createHighlighter } from "shiki"
import * as ts from "typescript"

type TagMap = Map<string, Array<string>>

interface ModuleGroup {
  readonly id: string
  readonly label: string
}

interface DocsConfig {
  readonly siteTitle: string
  readonly siteDescription: string
  readonly basePath: string
  readonly outDir: string
  readonly sourceBaseUrl: string
  readonly moduleGroups: ReadonlyArray<ModuleGroup>
  readonly entryPoints: ReadonlyArray<string>
}

interface ResolvedDocsConfig extends DocsConfig {
  readonly outDir: string
}

export interface ParsedJSDoc {
  readonly description: string
  readonly tags: TagMap
}

export interface DocsRenderer {
  readonly markdown: MarkdownIt
  readonly highlightBlock: (code: string, language?: string) => string
  readonly highlightInline: (code: string) => string
  readonly highlightName: (code: string) => string
  readonly dispose: () => void
}

type ModuleItemKind = "function" | "constant" | "interface" | "type" | "namespace"

interface ModuleItem {
  readonly name: string
  readonly kind: ModuleItemKind
  readonly description: string
  readonly examples: ReadonlyArray<string>
  readonly category: string | null
  readonly deprecated: boolean
  readonly anchor: string
  readonly order: number
  readonly sourceLink: string
  readonly line: number
  readonly statementKind: ts.SyntaxKind
}

interface ModuleDoc {
  readonly path: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly examples: ReadonlyArray<string>
  readonly group: string
  readonly categoryDescriptions: ReadonlyMap<string, string>
  readonly groupDescriptions: ReadonlyMap<string, string>
  readonly sourceLink: string
  readonly items: ReadonlyArray<ModuleItem>
  readonly valueItems: ReadonlyArray<ModuleItem>
  readonly typeItems: ReadonlyArray<ModuleItem>
}

interface ModuleSection {
  readonly key: string
  readonly description: string
  readonly items: Array<ModuleItem>
}

interface StandalonePage {
  readonly id: string
  readonly label: string
  readonly outputPath: string
  readonly title: string
  readonly description: string
  readonly content: string
}

interface DocsModel {
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
}

interface TocEntry {
  readonly name: string
  readonly anchor: string
  readonly description: string
}

interface TocSection {
  readonly key: string
  readonly items: ReadonlyArray<TocEntry>
}

interface KeyApiDocTarget {
  readonly key: string
  readonly moduleSlug: string
  readonly moduleName: string
  readonly modulePath: string
  readonly moduleOrder: number
  readonly itemName: string
  readonly itemAnchor: string
  readonly itemDescription: string
  readonly itemOrder: number
}

interface KeyApiEntry extends KeyApiDocTarget {
  readonly usageCount: number
}

const ModuleGroupSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  label: Schema.NonEmptyString
})

const DocsConfigSchema = Schema.Struct({
  siteTitle: Schema.NonEmptyString,
  siteDescription: Schema.NonEmptyString,
  basePath: Schema.NonEmptyString,
  outDir: Schema.NonEmptyString,
  sourceBaseUrl: Schema.NonEmptyString,
  moduleGroups: Schema.Array(ModuleGroupSchema),
  entryPoints: Schema.Array(Schema.NonEmptyString)
})

const decodeDocsConfig = Schema.decodeUnknownSync(DocsConfigSchema)

const SHIKI_THEME = "one-light"
const SHIKI_INLINE_LANG = "ts"
const SHIKI_PLAIN_LANG = "text"
const MODULE_RENDER_CONCURRENCY = 6
const ICON_EXTERNAL_LINK = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`
const HOMEPAGE_MARKDOWN_PATH = NodePath.join("scripts", "homepage.md")
const DOCGEN_CSS_PATH = NodePath.join("scripts", "docgen.css")
const EXAMPLES_DIRECTORY_PATH = NodePath.join("src", "examples")

const DIRECT_NAMESPACE_TO_MODULE_SLUG: Record<string, string> = {
  App: "app",
  Definition: "definition",
  Descriptor: "descriptor",
  Entity: "entity",
  Result: "result",
  Schema: "schema"
}

const BOUND_NAMESPACE_TO_MODULE_SLUG: Record<string, string> = {
  Command: "command",
  Condition: "machine",
  Entity: "entity",
  Query: "query",
  Runtime: "runtime",
  Schedule: "schedule",
  StateMachine: "machine",
  System: "system"
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}

const toError = (error: unknown, message: string): Error =>
  error instanceof Error ? new Error(`${message}: ${error.message}`, { cause: error }) : new Error(`${message}: ${String(error)}`)

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => HTML_ESCAPE[char] ?? char)

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item"

const readFileString = (path: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readFileString(path).pipe(
      Effect.mapError((error) => toError(error, `Unable to read ${path}`))
    )
  })

const writeFileString = (path: string, content: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    yield* fs.makeDirectory(pathService.dirname(path), { recursive: true }).pipe(
      Effect.mapError((error) => toError(error, `Unable to create parent directory for ${path}`))
    )
    yield* fs.writeFileString(path, content).pipe(
      Effect.mapError((error) => toError(error, `Unable to write ${path}`))
    )
  })

const removeDir = (path: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.remove(path, { recursive: true, force: true }).pipe(
      Effect.mapError((error) => toError(error, `Unable to remove ${path}`))
    )
  })

const readJsonFile = (path: string) =>
  Effect.gen(function*() {
    const content = yield* readFileString(path)
    return yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (error) => toError(error, `Unable to parse JSON in ${path}`)
    })
  })

const normalizeCommentBody = (text: string): string =>
  text
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim()

export const parseJSDoc = (text: string): ParsedJSDoc => {
  if (!text || !text.trim()) {
    return { description: "", tags: new Map() }
  }

  const body = normalizeCommentBody(text)
  const lines = body.split("\n")
  const descriptionLines: Array<string> = []
  const tags: TagMap = new Map()

  let currentTag: string | null = null
  let currentLines: Array<string> = []

  const flushTag = () => {
    if (currentTag === null) {
      return
    }
    const existing = tags.get(currentTag) ?? []
    existing.push(currentLines.join("\n").trim())
    tags.set(currentTag, existing)
  }

  for (const line of lines) {
    const tagMatch = line.match(/^@([A-Za-z][\w-]*)\s*(.*)$/)
    if (tagMatch) {
      const [, matchedTag = "", initialValue = ""] = tagMatch
      flushTag()
      currentTag = matchedTag
      currentLines = [initialValue]
      continue
    }
    if (currentTag === null) {
      descriptionLines.push(line)
      continue
    }
    currentLines.push(line)
  }

  flushTag()

  return {
    description: descriptionLines.join("\n").trim(),
    tags
  }
}

const getFirstTag = (doc: ParsedJSDoc, tagName: string): string | null => {
  const values = doc.tags.get(tagName)
  if (!values || values.length === 0) {
    return null
  }
  const first = values[0]?.trim()
  return first && first.length > 0 ? first : null
}

const hasTag = (doc: ParsedJSDoc, tagName: string): boolean => (doc.tags.get(tagName) ?? []).length > 0

export const collectNamedDescriptions = (values: ReadonlyArray<string> | undefined): Map<string, string> => {
  const entries = values ?? []
  const result = new Map<string, string>()

  for (const entry of entries) {
    const trimmed = entry.trim()
    if (!trimmed) {
      continue
    }
    const [head, ...tail] = trimmed.split("\n")
    const name = head?.trim() ?? ""
    if (!name) {
      continue
    }
    result.set(name, tail.join("\n").trim())
  }

  return result
}

const extractLeadingModuleComment = (content: string): string => {
  const match = content.match(/^\s*\/\*\*[\s\S]*?\*\//)
  return match?.[0] ?? ""
}

const getJsDocText = (node: ts.HasJSDoc, sourceFile: ts.SourceFile): string => {
  const jsDocs = (node as ts.Node & { readonly jsDoc?: ReadonlyArray<ts.JSDoc> }).jsDoc
  if (!Array.isArray(jsDocs) || jsDocs.length === 0) {
    return ""
  }
  const last = jsDocs[jsDocs.length - 1]
  return last.getFullText(sourceFile)
}

const isExported = (node: ts.Node & { readonly modifiers?: ts.NodeArray<ts.ModifierLike> }) =>
  Array.isArray(node.modifiers) &&
  node.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)

const createSourceLink = (config: DocsConfig, relativePath: string, line: number): string =>
  `${config.sourceBaseUrl}/${relativePath.replaceAll(NodePath.sep, "/")}#L${line}`

const getLineNumber = (sourceFile: ts.SourceFile, node: ts.Node): number =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

const getModuleKindLabel = (kind: ModuleItemKind): string => {
  switch (kind) {
    case "function":
      return "Functions"
    case "constant":
      return "Variables"
    case "interface":
      return "Interfaces"
    case "type":
      return "Type Aliases"
    case "namespace":
      return "Namespaces"
    default:
      return "Exports"
  }
}

const toTitleCase = (value: string): string =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

const getGroupLabel = (config: DocsConfig, groupId: string): string =>
  config.moduleGroups.find((group) => group.id === groupId)?.label ?? toTitleCase(groupId)

interface CreateItemInput {
  readonly modulePath: string
  readonly sourceFile: ts.SourceFile
  readonly node: ts.Node
  readonly declaration: ts.Node
  readonly doc: ParsedJSDoc
  readonly kind: ModuleItemKind
  readonly name: string
  readonly order: number
  readonly config: DocsConfig
}

const createItem = ({
  modulePath,
  sourceFile,
  node,
  declaration,
  doc,
  kind,
  name,
  order,
  config
}: CreateItemInput): ModuleItem => {
  const line = getLineNumber(sourceFile, declaration)
  return {
    name,
    kind,
    description: doc.description.trim(),
    examples: doc.tags.get("example") ?? [],
    category: getFirstTag(doc, "category"),
    deprecated: hasTag(doc, "deprecated"),
    anchor: slugify(name),
    order,
    sourceLink: createSourceLink(config, modulePath, line),
    line,
    statementKind: node.kind
  }
}

const shouldSkipDoc = (doc: ParsedJSDoc): boolean => hasTag(doc, "internal") || hasTag(doc, "ignore")

const parseExportedItems = ({
  config,
  sourceFile,
  modulePath
}: {
  readonly config: DocsConfig
  readonly sourceFile: ts.SourceFile
  readonly modulePath: string
}): Array<ModuleItem> => {
  const items: Array<ModuleItem> = []
  let order = 0

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) {
      continue
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const doc = parseJSDoc(getJsDocText(statement, sourceFile))
      if (shouldSkipDoc(doc)) {
        continue
      }
      items.push(
        createItem({
          config,
          modulePath,
          sourceFile,
          node: statement,
          declaration: statement,
          doc,
          kind: "function",
          name: statement.name.text,
          order: order++
        })
      )
      continue
    }

    if (ts.isVariableStatement(statement)) {
      const statementDoc = parseJSDoc(getJsDocText(statement, sourceFile))
      if (shouldSkipDoc(statementDoc)) {
        continue
      }

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue
        }
        const initializer = declaration.initializer
        const declarationDocText = getJsDocText(declaration, sourceFile)
        const declarationDoc = declarationDocText
          ? parseJSDoc(declarationDocText)
          : statementDoc
        if (shouldSkipDoc(declarationDoc)) {
          continue
        }

        const kind = declaration.type?.getText(sourceFile).includes("=>") ||
          (initializer !== undefined && ts.isArrowFunction(initializer)) ||
          (initializer !== undefined && ts.isFunctionExpression(initializer))
          ? "function"
          : "constant"

        items.push(
          createItem({
            config,
            modulePath,
            sourceFile,
            node: statement,
            declaration,
            doc: declarationDoc,
            kind,
            name: declaration.name.text,
            order: order++
          })
        )
      }
      continue
    }

    if (ts.isInterfaceDeclaration(statement) && statement.name) {
      const doc = parseJSDoc(getJsDocText(statement, sourceFile))
      if (shouldSkipDoc(doc)) {
        continue
      }
      items.push(
        createItem({
          config,
          modulePath,
          sourceFile,
          node: statement,
          declaration: statement,
          doc,
          kind: "interface",
          name: statement.name.text,
          order: order++
        })
      )
      continue
    }

    if (ts.isTypeAliasDeclaration(statement) && statement.name) {
      const doc = parseJSDoc(getJsDocText(statement, sourceFile))
      if (shouldSkipDoc(doc)) {
        continue
      }
      items.push(
        createItem({
          config,
          modulePath,
          sourceFile,
          node: statement,
          declaration: statement,
          doc,
          kind: "type",
          name: statement.name.text,
          order: order++
        })
      )
      continue
    }

    if (ts.isModuleDeclaration(statement) && statement.name) {
      const doc = parseJSDoc(getJsDocText(statement, sourceFile))
      if (shouldSkipDoc(doc)) {
        continue
      }
      items.push(
        createItem({
          config,
          modulePath,
          sourceFile,
          node: statement,
          declaration: statement,
          doc,
          kind: "namespace",
          name: statement.name.getText(sourceFile),
          order: order++
        })
      )
    }
  }

  return dedupeModuleItems(items)
}

const dedupeModuleItems = (items: ReadonlyArray<ModuleItem>): Array<ModuleItem> => {
  const deduped: Array<ModuleItem> = []
  const byKey = new Map<string, number>()

  for (const item of items) {
    const key = `${item.kind}:${item.name}`
    const existingIndex = byKey.get(key)

    if (existingIndex === undefined) {
      byKey.set(key, deduped.length)
      deduped.push(item)
      continue
    }

    const existing = deduped[existingIndex]
    if (!existing) {
      continue
    }

    deduped[existingIndex] = {
      ...existing,
      description: existing.description || item.description,
      examples: existing.examples.length > 0 ? existing.examples : item.examples,
      category: existing.category ?? item.category,
      deprecated: existing.deprecated || item.deprecated
    }
  }

  return deduped
}

const validateModule = (moduleDoc: ModuleDoc, config: DocsConfig): void => {
  if (!moduleDoc.description) {
    throw new Error(`Missing module description in ${moduleDoc.path}`)
  }
  if (!moduleDoc.group) {
    throw new Error(`Missing @docGroup in ${moduleDoc.path}`)
  }
  if (!config.moduleGroups.some((group) => group.id === moduleDoc.group)) {
    throw new Error(
      `Unknown @docGroup "${moduleDoc.group}" in ${moduleDoc.path}. ` +
        `Expected one of: ${config.moduleGroups.map((group) => group.id).join(", ")}`
    )
  }
}

const parseModule = ({
  absolutePath,
  relativePath,
  config,
  program
}: {
  readonly absolutePath: string
  readonly relativePath: string
  readonly config: DocsConfig
  readonly program: ts.Program
}): ModuleDoc => {
  const sourceFile = program.getSourceFile(absolutePath)
  if (!sourceFile) {
    throw new Error(`Unable to load source file ${relativePath}`)
  }
  const content = sourceFile.getFullText()
  const moduleDoc = parseJSDoc(extractLeadingModuleComment(content))
  const moduleName = getFirstTag(moduleDoc, "module") ?? NodePath.basename(relativePath, ".ts")
  const group = getFirstTag(moduleDoc, "docGroup")
  if (!moduleDoc.description) {
    throw new Error(`Missing module description in ${relativePath}`)
  }
  if (!group) {
    throw new Error(`Missing @docGroup in ${relativePath}`)
  }
  const categoryDescriptions = collectNamedDescriptions(moduleDoc.tags.get("categoryDescription"))
  const groupDescriptions = collectNamedDescriptions(moduleDoc.tags.get("groupDescription"))
  const items = parseExportedItems({
    config,
    sourceFile,
    modulePath: relativePath
  })
  const result = {
    path: relativePath,
    slug: slugify(moduleName),
    name: moduleName,
    description: moduleDoc.description,
    examples: moduleDoc.tags.get("example") ?? [],
    group,
    categoryDescriptions,
    groupDescriptions,
    sourceLink: createSourceLink(config, relativePath, 1),
    items,
    valueItems: items.filter((item) => item.kind === "function" || item.kind === "constant"),
    typeItems: items.filter((item) => item.kind === "type" || item.kind === "interface")
  }
  validateModule(result, config)
  return result
}

const readTsConfig = (cwd: string): ts.CompilerOptions => {
  const tsConfigPath = NodePath.join(cwd, "tsconfig.json")
  const readResult = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
  if (readResult.error) {
    throw new Error(ts.flattenDiagnosticMessageText(readResult.error.messageText, "\n"))
  }
  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, cwd)
  return {
    ...parsed.options,
    noEmit: true
  }
}

const getRelativeDocHref = (fromOutputPath: string, toOutputPath: string): string => {
  const relative = NodePath.relative(NodePath.dirname(fromOutputPath), toOutputPath).replaceAll(NodePath.sep, "/")
  return relative === "" ? "./" : relative
}

const rewriteMarkdownLinks = (content: string, sourceBaseUrl: string): string =>
  content.replace(/\]\((?!https?:\/\/|#|mailto:|data:)([^)]+)\)/g, (_match: string, rawTarget: string) => {
    const [target = "", hash = ""] = rawTarget.split("#")
    const normalized = NodePath.posix
      .normalize(target.replaceAll(NodePath.sep, "/"))
      .replace(/^(\.\.\/)+/u, "")
      .replace(/^\.\//u, "")
      .replace(/^\/+/u, "")
    if (normalized.length === 0) {
      return `](#${hash})`
    }
    const suffix = hash.length > 0 ? `#${hash}` : ""
    return `](${sourceBaseUrl}/${normalized}${suffix})`
  })

const stripMarkdownTitle = (content: string): string =>
  content.replace(/^#\s+.+\n+/i, "").trim()

const normalizeLanguage = (language: string): string => {
  const normalized = language.trim().toLowerCase()
  if (!normalized) {
    return SHIKI_PLAIN_LANG
  }
  if (normalized === "ts" || normalized === "typescript") {
    return "ts"
  }
  if (normalized === "js" || normalized === "javascript") {
    return "js"
  }
  if (normalized === "shell" || normalized === "bash" || normalized === "sh" || normalized === "zsh") {
    return "bash"
  }
  if (normalized === "plaintext") {
    return SHIKI_PLAIN_LANG
  }
  return normalized
}

const buildHighlightedSpan = (attributes: string, line: string, className: string): string => {
  if (attributes.includes(`class="`)) {
    return `<span${attributes.replace(/class="([^"]*)"/, ` class="$1 ${className}"`)}>${line}</span>`
  }
  const normalized = attributes.length > 0 ? `${attributes} ` : ""
  return `<span ${normalized}class="${className}">${line}</span>`
}

const convertBlockToInline = (html: string, className: string): string => {
  const match = html.match(/^<pre([^>]*)><code><span class="line">([\s\S]*)<\/span><\/code><\/pre>$/)
  if (!match) {
    throw new Error("Unable to convert highlighted block HTML to inline code.")
  }
  const [, rawAttributes = "", line = ""] = match
  const attributes = rawAttributes.trim().replace(/\s*tabindex="[^"]*"/g, "")
  return buildHighlightedSpan(attributes, line, className)
}

export const createDocsRenderer = async (): Promise<DocsRenderer> => {
  const highlighter = await createHighlighter({
    themes: [SHIKI_THEME],
    langs: ["ts", "js", "json", "bash", "html", "css", "text"]
  })
  const normalizeHighlightedCode = (code: string): string => code.replace(/\n+$/u, "")
  const highlightBlock = (code: string, language = SHIKI_PLAIN_LANG): string => {
    const normalizedCode = normalizeHighlightedCode(code)
    const normalizedLanguage = normalizeLanguage(language)
    try {
      return highlighter.codeToHtml(normalizedCode, {
        lang: normalizedLanguage,
        theme: SHIKI_THEME
      })
    } catch {
      return highlighter.codeToHtml(normalizedCode, {
        lang: SHIKI_PLAIN_LANG,
        theme: SHIKI_THEME
      })
    }
  }
  const highlightInline = (code: string): string =>
    convertBlockToInline(
      highlightBlock(code, SHIKI_INLINE_LANG),
      "inline-code"
    )
  const highlightName = (code: string): string =>
    convertBlockToInline(
      highlightBlock(code, SHIKI_INLINE_LANG),
      "api-name"
    )
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    highlight: (code: string, language: string) => highlightBlock(code, language)
  })
  markdown.renderer.rules.code_inline = (tokens, index) =>
    highlightInline(tokens[index]?.content ?? "")

  return {
    markdown,
    highlightBlock,
    highlightInline,
    highlightName,
    dispose: () => highlighter.dispose()
  }
}

const rewriteDocLinks = (content: string, anchors: ReadonlySet<string> = new Set()): string => {
  const withLinks = content.replace(/\{@link\s+([^}\s|]+)(?:\s+[^}]*)?\}/g, (_match: string, target: string) => {
    const normalized = target.split(".").at(-1) ?? target
    if (anchors.has(normalized)) {
      return `[${normalized}](#${slugify(normalized)})`
    }
    return `\`${normalized}\``
  })
  return withLinks
}

const renderMarkdown = (renderer: DocsRenderer, content: string, anchors: ReadonlySet<string> = new Set()): string =>
  renderer.markdown.render(rewriteDocLinks(content, anchors))

const renderExamples = (
  renderer: DocsRenderer,
  examples: ReadonlyArray<string>,
  anchors: ReadonlySet<string>
): string =>
  examples.length === 0
    ? ""
    : `<section class="module-examples"><h2>Examples</h2>${examples
        .map((example: string) => renderMarkdown(renderer, example, anchors))
        .join("")}</section>`

export const getItemShortDescription = (description: string): string => {
  const trimmed = description.trim()
  if (!trimmed) {
    return ""
  }

  const [paragraph] = trimmed.split(/\n\s*\n/u)
  if (!paragraph) {
    return ""
  }

  return paragraph
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .trim()
}

const renderToc = (
  renderer: DocsRenderer,
  sections: ReadonlyArray<TocSection>,
  anchors: ReadonlySet<string>
): string => {
  if (sections.length === 0) {
    return ""
  }

  return [
    `<section class="module-toc">`,
    ...sections.map((section: TocSection) =>
      [
        `<div class="module-toc-section">`,
        `<h3 class="module-toc-section-title">${escapeHtml(section.key)}</h3>`,
        `<div class="module-toc-list">`,
        ...section.items.map((item: TocEntry) =>
          [
            `<a class="module-toc-item" href="#${item.anchor}">`,
            `<span class="module-toc-item-name">${renderer.highlightName(item.name)}</span>`,
            getItemShortDescription(item.description)
              ? `<span class="module-toc-description">${renderMarkdown(renderer, getItemShortDescription(item.description), anchors)}</span>`
              : "",
            `</a>`
          ].join("")),
        `</div>`,
        `</div>`
      ].join("")),
    `</section>`
  ].join("")
}

const renderModuleToc = (
  renderer: DocsRenderer,
  sections: ReadonlyArray<ModuleSection>,
  anchors: ReadonlySet<string>
): string =>
  renderToc(
    renderer,
    sections.map((section) => ({
      key: section.key,
      items: section.items.map((item) => ({
        name: item.name,
        anchor: item.anchor,
        description: item.description
      }))
    })),
    anchors
  )

const renderItem = (renderer: DocsRenderer, item: ModuleItem, anchors: ReadonlySet<string>): string => {
  return [
    `<article class="doc-item" id="${item.anchor}">`,
    `<header class="doc-item-header">`,
    `<h3>${renderer.highlightName(item.name)}</h3>`,
    `<a class="source-link" href="${item.sourceLink}">Source${ICON_EXTERNAL_LINK}</a>`,
    `</header>`,
    item.description
      ? renderMarkdown(renderer, item.description, anchors)
      : `<p class="muted">No description provided yet.</p>`,
    item.examples.length > 0
      ? `<div class="doc-item-examples">${item.examples
          .map((example: string) => renderMarkdown(renderer, example, anchors))
          .join("")}</div>`
      : "",
    `</article>`
  ].join("")
}

const renderSecondaryTypes = (renderer: DocsRenderer, moduleDoc: ModuleDoc): string => {
  if (moduleDoc.typeItems.length === 0) {
    return ""
  }
  return [
    `<section class="related-types">`,
    `<h2>Related Types</h2>`,
    `<p>These support the callable API surface and are intentionally kept secondary in this v1 docs view.</p>`,
    `<ul>`,
    ...moduleDoc.typeItems.map((item: ModuleItem) => `<li>${renderer.highlightName(item.name)}</li>`),
    `</ul>`,
    `</section>`
  ].join("")
}

const getModuleSections = (moduleDoc: ModuleDoc): Array<ModuleSection> => {
  const sections: Array<ModuleSection> = []
  const byKey = new Map<string, ModuleSection>()

  for (const item of moduleDoc.valueItems) {
    const key = item.category ?? getModuleKindLabel(item.kind)
    if (!byKey.has(key)) {
      const description = moduleDoc.categoryDescriptions.get(key) ??
        moduleDoc.groupDescriptions.get(key) ??
        ""
      const section: ModuleSection = {
        key,
        description,
        items: []
      }
      byKey.set(key, section)
      sections.push(section)
    }
    const section = byKey.get(key)
    if (section) {
      section.items.push(item)
    }
  }

  return sections
}

const renderModuleContent = (renderer: DocsRenderer, config: ResolvedDocsConfig, moduleDoc: ModuleDoc): string => {
  const anchors = new Set(moduleDoc.items.map((item: ModuleItem) => item.name))
  const sections = getModuleSections(moduleDoc)

  return [
    `<header class="module-hero">`,
    `<p class="eyebrow">${escapeHtml(getGroupLabel(config, moduleDoc.group))}</p>`,
    `<h1>${escapeHtml(moduleDoc.name)}</h1>`,
    `<div class="module-actions"><a class="source-link" href="${moduleDoc.sourceLink}">View Source${ICON_EXTERNAL_LINK}</a></div>`,
    renderMarkdown(renderer, moduleDoc.description, anchors),
    `</header>`,
    renderExamples(renderer, moduleDoc.examples, anchors),
    renderModuleToc(renderer, sections, anchors),
    sections.length === 0
      ? `<section><p>No callable public exports are documented for this module yet.</p></section>`
      : sections
          .map((section) =>
            [
              `<section class="module-section">`,
              `<header class="module-section-header">`,
              `<h2>${escapeHtml(section.key)}</h2>`,
              section.description ? renderMarkdown(renderer, section.description, anchors) : "",
              `</header>`,
              `<div class="doc-item-list">`,
              section.items.map((item: ModuleItem) => renderItem(renderer, item, anchors)).join(""),
              `</div>`,
              `</section>`
            ].join(""))
          .join(""),
    renderSecondaryTypes(renderer, moduleDoc)
  ].join("")
}

export const extractExampleApiUsages = (content: string): ReadonlyArray<string> => {
  const usages: Array<string> = []

  for (const match of content.matchAll(/\bGame\.([A-Z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const namespace = match[1]
    const member = match[2]
    if (!namespace || !member) {
      continue
    }
    const moduleSlug = BOUND_NAMESPACE_TO_MODULE_SLUG[namespace]
    if (!moduleSlug) {
      continue
    }
    usages.push(`${moduleSlug}.${member}`)
  }

  for (const match of content.matchAll(/\bGame\.(Query|Schedule|StateMachine|System)\s*\(/g)) {
    const namespace = match[1]
    if (!namespace) {
      continue
    }
    const moduleSlug = BOUND_NAMESPACE_TO_MODULE_SLUG[namespace]
    if (!moduleSlug) {
      continue
    }
    usages.push(`${moduleSlug}.${namespace}`)
  }

  for (const match of content.matchAll(/\b(App|Definition|Descriptor|Entity|Result|Schema)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const namespace = match[1]
    const member = match[2]
    if (!namespace || !member) {
      continue
    }
    const moduleSlug = DIRECT_NAMESPACE_TO_MODULE_SLUG[namespace]
    if (!moduleSlug) {
      continue
    }
    usages.push(`${moduleSlug}.${member}`)
  }

  return usages
}

export const collectExampleApiUsageCounts = (sources: ReadonlyArray<string>): Map<string, number> => {
  const counts = new Map<string, number>()

  for (const source of sources) {
    for (const usage of extractExampleApiUsages(source)) {
      counts.set(usage, (counts.get(usage) ?? 0) + 1)
    }
  }

  return counts
}

export const resolveKeyApiEntries = (
  usageCounts: ReadonlyMap<string, number>,
  targets: ReadonlyArray<KeyApiDocTarget>
): Array<KeyApiEntry> => {
  const byKey = new Map(targets.map((target) => [target.key, target] as const))

  return [...usageCounts.entries()]
    .flatMap(([key, usageCount]) => {
      const target = byKey.get(key)
      return target ? [{ ...target, usageCount }] : []
    })
    .sort((left, right) =>
      right.usageCount - left.usageCount ||
      left.moduleName.localeCompare(right.moduleName) ||
      left.itemOrder - right.itemOrder
    )
}

const getKeyApiDocTargets = (modules: ReadonlyArray<ModuleDoc>): Array<KeyApiDocTarget> =>
  modules.flatMap((moduleDoc) =>
    moduleDoc.valueItems.map((item) => ({
      key: `${moduleDoc.slug}.${item.name}`,
      moduleSlug: moduleDoc.slug,
      moduleName: moduleDoc.name,
      modulePath: moduleDoc.path,
      moduleOrder: modules.findIndex((candidate) => candidate.slug === moduleDoc.slug),
      itemName: item.name,
      itemAnchor: item.anchor,
      itemDescription: item.description,
      itemOrder: item.order
    }))
  )

const readExampleSources = (cwd: string): Array<string> =>
  ts.sys
    .readDirectory(NodePath.join(cwd, EXAMPLES_DIRECTORY_PATH), [".ts"], undefined, undefined)
    .flatMap((path) => {
      const content = ts.sys.readFile(path)
      return content === undefined ? [] : [content]
    })

const renderKeyApiContent = ({
  renderer,
  config,
  entries,
  currentOutputPath
}: {
  readonly renderer: DocsRenderer
  readonly config: ResolvedDocsConfig
  readonly entries: ReadonlyArray<KeyApiEntry>
  readonly currentOutputPath: string
}): string => {
  const anchors = new Set(entries.map((entry) => entry.itemName))
  const toc = renderToc(
    renderer,
    [{
      key: "Most Used APIs",
      items: entries.map((entry) => ({
        name: entry.itemName,
        anchor: `${entry.moduleSlug}-${entry.itemAnchor}`,
        description: entry.itemDescription
      }))
    }],
    anchors
  )

  return [
    `<header class="module-hero">`,
    `<p class="eyebrow">Generated From Examples</p>`,
    `<h1>Key APIs</h1>`,
    `<p>This page ranks the most-used documented helper APIs across <span class="inline-code">${escapeHtml(EXAMPLES_DIRECTORY_PATH)}</span> and links each one back to its canonical docs section.</p>`,
    `</header>`,
    toc,
    entries.length === 0
      ? `<section><p>No documented API helper usage was found in the examples.</p></section>`
      : `<section class="module-section"><header class="module-section-header"><h2>Most Used APIs</h2></header><div class="doc-item-list">${entries
          .map((entry) => {
            const modulePath = NodePath.join(config.outDir, "modules", entry.moduleSlug, "index.html")
            const moduleHref = getRelativeDocHref(currentOutputPath, modulePath)
            return [
              `<article class="doc-item" id="${entry.moduleSlug}-${entry.itemAnchor}">`,
              `<header class="doc-item-header">`,
              `<h3>${renderer.highlightName(entry.itemName)}</h3>`,
              `<a class="source-link" href="${moduleHref}#${entry.itemAnchor}">${escapeHtml(entry.moduleName)}${ICON_EXTERNAL_LINK}</a>`,
              `</header>`,
              entry.itemDescription
                ? renderMarkdown(renderer, entry.itemDescription, anchors)
                : `<p class="muted">No description provided yet.</p>`,
              `<p><a href="${moduleHref}#${entry.itemAnchor}">Open ${escapeHtml(entry.moduleName)}.${escapeHtml(entry.itemName)} in the docs</a></p>`,
              `</article>`
            ].join("")
          })
          .join("")}</div></section>`
  ].join("")
}

const buildStandalonePages = ({
  renderer,
  cwd,
  config,
  modules,
  homepage
}: {
  readonly renderer: DocsRenderer
  readonly cwd: string
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
  readonly homepage: string
}): ReadonlyArray<StandalonePage> => {
  const homeOutputPath = NodePath.join(config.outDir, "index.html")
  const keyApisOutputPath = NodePath.join(config.outDir, "key-apis", "index.html")
  const keyApiEntries = resolveKeyApiEntries(
    collectExampleApiUsageCounts(readExampleSources(cwd)),
    getKeyApiDocTargets(modules)
  )

  return [
    {
      id: "overview",
      label: "Overview",
      outputPath: homeOutputPath,
      title: `${config.siteTitle} Docs`,
      description: config.siteDescription,
      content: renderHomePage({ renderer, config, modules, homepage })
    },
    {
      id: "key-apis",
      label: "Key APIs",
      outputPath: keyApisOutputPath,
      title: `Key APIs | ${config.siteTitle}`,
      description: "The most-used documented helper APIs across the project examples.",
      content: renderKeyApiContent({
        renderer,
        config,
        entries: keyApiEntries,
        currentOutputPath: keyApisOutputPath
      })
    }
  ]
}

const renderSidebar = ({
  config,
  modules,
  standalonePages,
  currentOutputPath
}: {
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
  readonly standalonePages: ReadonlyArray<StandalonePage>
  readonly currentOutputPath: string
}): string => {
  const groups = config.moduleGroups.map((group) => ({
    ...group,
    modules: modules.filter((moduleDoc) => moduleDoc.group === group.id)
  }))

  return [
    `<nav class="sidebar">`,
    `<a class="site-title" href="${getRelativeDocHref(currentOutputPath, standalonePages[0]?.outputPath ?? NodePath.join(config.outDir, "index.html"))}">${escapeHtml(config.siteTitle)}</a>`,
    `<p class="site-description">${escapeHtml(config.siteDescription)}</p>`,
    `<div class="sidebar-section">`,
    ...standalonePages.map((page) => {
      const isCurrentPage = NodePath.resolve(currentOutputPath) === NodePath.resolve(page.outputPath)
      return `<a class="sidebar-link${isCurrentPage ? " is-active" : ""}" href="${getRelativeDocHref(currentOutputPath, page.outputPath)}"${isCurrentPage ? ' aria-current="page"' : ""}>${escapeHtml(page.label)}</a>`
    }),
    `</div>`,
    ...groups.map((group: ModuleGroup & { readonly modules: ReadonlyArray<ModuleDoc> }) =>
      [
        `<section class="sidebar-section">`,
        `<h2>${escapeHtml(group.label)}</h2>`,
        `<ul>`,
        ...group.modules.map((moduleDoc: ModuleDoc) => {
          const modulePath = NodePath.join(config.outDir, "modules", moduleDoc.slug, "index.html")
          const href = getRelativeDocHref(currentOutputPath, modulePath)
          const isCurrentPage = NodePath.resolve(currentOutputPath) === NodePath.resolve(modulePath)
          return `<li><a class="sidebar-link${isCurrentPage ? " is-active" : ""}" href="${href}"${isCurrentPage ? ' aria-current="page"' : ""}>${escapeHtml(moduleDoc.name)}</a></li>`
        }),
        `</ul>`,
        `</section>`
      ].join("")),
    `</nav>`
  ].join("")
}

const renderPage = ({
  config,
  modules,
  standalonePages,
  currentOutputPath,
  title,
  description,
  content
}: {
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
  readonly standalonePages: ReadonlyArray<StandalonePage>
  readonly currentOutputPath: string
  readonly title: string
  readonly description: string
  readonly content: string
}): string => {
  const cssPath = NodePath.join(config.outDir, "assets", "site.css")
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="stylesheet" href="${getRelativeDocHref(currentOutputPath, cssPath)}">`,
    `</head>`,
    `<body>`,
    `<div class="layout">`,
    renderSidebar({ config, modules, standalonePages, currentOutputPath }),
    `<main class="content">${content}</main>`,
    `</div>`,
    `</body>`,
    `</html>`
  ].join("")
}

const renderHomePage = ({
  renderer,
  config,
  modules,
  homepage
}: {
  readonly renderer: DocsRenderer
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
  readonly homepage: string
}): string => {
  const grouped = config.moduleGroups.map((group) => ({
    ...group,
    modules: modules.filter((moduleDoc) => moduleDoc.group === group.id)
  }))

  return [
    `<header class="home-hero">`,
    `<p class="eyebrow">Step By Step Guide</p>`,
    `<h1>${escapeHtml(config.siteTitle)}</h1>`,
    `<p class="home-summary">${escapeHtml(config.siteDescription)}</p>`,
    `</header>`,
    `<section class="home-readme">${renderMarkdown(renderer, homepage)}</section>`,
    `<section class="home-groups">`,
    `<h2>API Modules</h2>`,
    `<div class="group-grid">`,
    grouped
      .map((group: ModuleGroup & { readonly modules: ReadonlyArray<ModuleDoc> }) =>
        [
          `<section class="group-card">`,
          `<h3>${escapeHtml(group.label)}</h3>`,
          `<ul>`,
          ...group.modules.map((moduleDoc: ModuleDoc) =>
            `<li><a href="./modules/${moduleDoc.slug}/">${escapeHtml(moduleDoc.name)}</a><p>${escapeHtml(moduleDoc.description.split("\n")[0] ?? "")}</p></li>`),
          `</ul>`,
          `</section>`
        ].join(""))
      .join(""),
    `</div>`,
    `</section>`
  ].join("")
}

export const buildSiteCss = (source: string): string => {
  const result = transform({
    filename: "docgen.css",
    code: Buffer.from(source),
    minify: true
  })
  return Buffer.from(result.code).toString("utf8")
}

export const loadDocsModel = (cwd = process.cwd()): Effect.Effect<DocsModel, Error, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const configPath = NodePath.join(cwd, "docs.config.json")
    yield* Effect.logInfo(`Loading docs config from ${configPath}`)
    const rawConfig = yield* readJsonFile(configPath)
    const config = decodeDocsConfig(rawConfig) as DocsConfig

    yield* Effect.logInfo(`Creating TypeScript program for ${config.entryPoints.length} entry points`)
    const compilerOptions = readTsConfig(cwd)
    const absoluteEntryPoints = config.entryPoints.map((entryPoint) => NodePath.join(cwd, entryPoint))
    const program = ts.createProgram(absoluteEntryPoints, compilerOptions)
    const modules = absoluteEntryPoints
      .map((absolutePath, index) =>
        parseModule({
          absolutePath,
          relativePath: config.entryPoints[index] ?? absolutePath,
          config,
          program
        }))
      .sort((a, b) => a.name.localeCompare(b.name))

    yield* Effect.logInfo(`Loaded ${modules.length} documentation modules`)

    return {
      config: {
        ...config,
        outDir: NodePath.join(cwd, config.outDir)
      },
      modules
    }
  }).pipe(
    Effect.withLogSpan("load-docs-model")
  )

const buildModulePage = ({
  renderer,
  config,
  modules,
  standalonePages,
  moduleDoc,
  index
}: {
  readonly renderer: DocsRenderer
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
  readonly standalonePages: ReadonlyArray<StandalonePage>
  readonly moduleDoc: ModuleDoc
  readonly index: number
}) =>
  Effect.gen(function*() {
    const outputPath = NodePath.join(config.outDir, "modules", moduleDoc.slug, "index.html")
    yield* Effect.logInfo(`Building module ${index + 1}/${modules.length}: ${moduleDoc.name}`)

    const html = renderPage({
      config,
      modules,
      standalonePages,
      currentOutputPath: outputPath,
      title: `${moduleDoc.name} | ${config.siteTitle}`,
      description: moduleDoc.description.split("\n")[0] ?? moduleDoc.description,
      content: renderModuleContent(renderer, config, moduleDoc)
    })

    yield* writeFileString(outputPath, html)
    yield* Effect.logInfo(`Wrote module page ${moduleDoc.slug}`)
  }).pipe(
    Effect.annotateLogs({
      module: moduleDoc.slug
    })
  )

export const buildDocsSite = (
  cwd = process.cwd()
): Effect.Effect<void, Error, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const startedAt = Date.now()
    const { config, modules } = yield* loadDocsModel(cwd)

    yield* Effect.logInfo("Initializing markdown and syntax highlighter")
    yield* Effect.acquireUseRelease(
      Effect.promise(() => createDocsRenderer()),
      (renderer) =>
        Effect.gen(function*() {
          yield* Effect.logInfo(`Reading homepage markdown and stylesheet sources for ${config.outDir}`)
          const homepage = yield* readFileString(NodePath.join(cwd, HOMEPAGE_MARKDOWN_PATH))
          const normalizedHomepage = stripMarkdownTitle(rewriteMarkdownLinks(homepage, config.sourceBaseUrl))
          const siteCssSource = yield* readFileString(NodePath.join(cwd, DOCGEN_CSS_PATH))
          const siteCss = buildSiteCss(siteCssSource)
          const standalonePages = buildStandalonePages({
            renderer,
            cwd,
            config,
            modules,
            homepage: normalizedHomepage
          })

          yield* removeDir(config.outDir)
          yield* Effect.logInfo("Writing static assets")
          yield* Effect.all([
            writeFileString(NodePath.join(config.outDir, ".nojekyll"), ""),
            writeFileString(NodePath.join(config.outDir, "assets", "site.css"), siteCss)
          ], { concurrency: "unbounded" })

          yield* Effect.logInfo(`Rendering ${standalonePages.length} standalone pages`)
          yield* Effect.forEach(
            standalonePages,
            (page) =>
              writeFileString(
                page.outputPath,
                renderPage({
                  config,
                  modules,
                  standalonePages,
                  currentOutputPath: page.outputPath,
                  title: page.title,
                  description: page.description,
                  content: page.content
                })
              ),
            { concurrency: "unbounded", discard: true }
          )
          yield* Effect.logInfo(`Building ${modules.length} module pages with concurrency ${MODULE_RENDER_CONCURRENCY}`)

          yield* Effect.forEach(
            modules,
            (moduleDoc, index) =>
              buildModulePage({
                renderer,
                config,
                modules,
                standalonePages,
                moduleDoc,
                index
              }),
            { concurrency: MODULE_RENDER_CONCURRENCY, discard: true }
          )

          yield* Effect.logInfo(`Documentation build completed in ${Date.now() - startedAt}ms`)
        }),
      (renderer) => Effect.sync(() => renderer.dispose())
    )
  }).pipe(
    Effect.withLogSpan("build-docs-site")
  )

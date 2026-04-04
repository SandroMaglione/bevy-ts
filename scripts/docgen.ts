import * as NodePath from "node:path"
import process from "node:process"
import MarkdownIt from "markdown-it"
import * as FileSystem from "effect/FileSystem"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
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
  readonly signature: string
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

interface DocsModel {
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
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

const SHIKI_THEME = "catppuccin-latte"
const SHIKI_INLINE_LANG = "ts"
const SHIKI_PLAIN_LANG = "text"
const MODULE_RENDER_CONCURRENCY = 6

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

const formatTypeString = (checker: ts.TypeChecker, symbol: ts.Symbol, declaration: ts.Node): string => {
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
  return checker.typeToString(
    type,
    declaration,
    ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.MultilineObjectLiterals |
      ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType
  )
}

const getValueSignature = (
  checker: ts.TypeChecker,
  declaration: ts.VariableDeclaration,
  sourceFile: ts.SourceFile
): string => {
  if (!ts.isIdentifier(declaration.name)) {
    return declaration.getText(sourceFile)
  }
  const symbol = checker.getSymbolAtLocation(declaration.name)
  if (!symbol) {
    return declaration.getText(sourceFile).replace(/\s*=\s*[\s\S]*$/, "").trim()
  }
  const typeString = formatTypeString(checker, symbol, declaration)
  return `export const ${declaration.name.text}: ${typeString}`
}

const getFunctionSignature = (
  checker: ts.TypeChecker,
  declaration: ts.FunctionDeclaration
): string => {
  if (!declaration.name) {
    return declaration.getText()
  }
  const symbol = checker.getSymbolAtLocation(declaration.name)
  if (!symbol) {
    return declaration.getText()
  }
  const typeString = formatTypeString(checker, symbol, declaration)
  return `export const ${declaration.name.text}: ${typeString}`
}

const getTypeSignature = (
  declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile
): string => declaration.getText(sourceFile)

interface CreateItemInput {
  readonly modulePath: string
  readonly sourceFile: ts.SourceFile
  readonly node: ts.Node
  readonly declaration: ts.Node
  readonly doc: ParsedJSDoc
  readonly kind: ModuleItemKind
  readonly name: string
  readonly signature: string
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
  signature,
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
    signature,
    sourceLink: createSourceLink(config, modulePath, line),
    line,
    statementKind: node.kind
  }
}

const shouldSkipDoc = (doc: ParsedJSDoc): boolean => hasTag(doc, "internal") || hasTag(doc, "ignore")

const parseExportedItems = ({
  config,
  checker,
  sourceFile,
  modulePath
}: {
  readonly config: DocsConfig
  readonly checker: ts.TypeChecker
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
          signature: getFunctionSignature(checker, statement),
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
            signature: getValueSignature(checker, declaration, sourceFile),
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
          signature: getTypeSignature(statement, sourceFile),
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
          signature: getTypeSignature(statement, sourceFile),
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
          signature: statement.getText(sourceFile),
          order: order++
        })
      )
    }
  }

  return items
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
  program,
  checker
}: {
  readonly absolutePath: string
  readonly relativePath: string
  readonly config: DocsConfig
  readonly program: ts.Program
  readonly checker: ts.TypeChecker
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
    checker,
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

const rewriteReadmeLinks = (content: string, sourceBaseUrl: string): string =>
  content.replace(/\]\((?!https?:\/\/|#|mailto:|data:)([^)]+)\)/g, (_match: string, rawTarget: string) => {
    const [target = "", hash = ""] = rawTarget.split("#")
    const normalized = target.replace(/^\.\//, "").replace(/^\/+/, "")
    if (normalized.length === 0) {
      return `](#${hash})`
    }
    const suffix = hash.length > 0 ? `#${hash}` : ""
    return `](${sourceBaseUrl}/${normalized}${suffix})`
  })

const stripReadmeTitle = (content: string): string =>
  content.replace(/^#\s+`?bevy-ts`?\s*\n+/i, "").trim()

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

const buildHighlightedInlineCode = (attributes: string, line: string): string => {
  if (attributes.includes(`class="`)) {
    return `<span${attributes.replace(/class="([^"]*)"/, ' class="$1 inline-code"')}>${line}</span>`
  }
  const normalized = attributes.length > 0 ? `${attributes} ` : ""
  return `<span ${normalized}class="inline-code">${line}</span>`
}

const convertBlockToInline = (html: string): string => {
  const match = html.match(/^<pre([^>]*)><code><span class="line">([\s\S]*)<\/span><\/code><\/pre>$/)
  if (!match) {
    throw new Error("Unable to convert highlighted block HTML to inline code.")
  }
  const [, rawAttributes = "", line = ""] = match
  const attributes = rawAttributes.trim()
  return buildHighlightedInlineCode(attributes, line)
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
      highlightBlock(code, SHIKI_INLINE_LANG)
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

const INDENT_UNIT = "  "

const makeIndent = (depth: number): string => INDENT_UNIT.repeat(Math.max(0, depth))

const formatSignature = (signature: string): string => {
  const source = signature.trim()
  if (!source) {
    return source
  }

  const lines: Array<string> = []
  let currentLine = ""
  let depth = 0
  let stringQuote: string | null = null
  let escaping = false

  const pushNewline = (nextDepth = depth): void => {
    const trimmedLine = currentLine.replace(/[ \t]+$/u, "")
    if (trimmedLine.length > 0 || lines.length > 0) {
      lines.push(trimmedLine)
    }
    currentLine = makeIndent(nextDepth)
  }

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    const next = source[index + 1] ?? ""
    const prev = source[index - 1] ?? ""

    if (stringQuote !== null) {
      currentLine += char
      if (escaping) {
        escaping = false
        continue
      }
      if (char === "\\") {
        escaping = true
        continue
      }
      if (char === stringQuote) {
        stringQuote = null
      }
      continue
    }

    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char
      currentLine += char
      continue
    }

    if (char === "{") {
      depth += 1
      currentLine += char
      if (next && next !== "}" && next !== "\n") {
        pushNewline(depth)
      }
      continue
    }

    if (char === "}") {
      depth = Math.max(0, depth - 1)
      if (prev !== "{" && prev !== "\n") {
        pushNewline(depth)
      }
      currentLine += char
      continue
    }

    if (char === "(" || char === "[" || char === "<") {
      currentLine += char
      depth += 1
      if (next && ![")", "]", ">", "\n"].includes(next)) {
        pushNewline(depth)
      }
      continue
    }

    if (char === ")" || char === "]" || char === ">") {
      depth = Math.max(0, depth - 1)
      if (currentLine.trim().length > 0 && prev !== "(" && prev !== "[" && prev !== "<") {
        pushNewline(depth)
      }
      currentLine += char
      continue
    }

    if (char === ",") {
      currentLine += char
      if (next && next !== "\n") {
        pushNewline(depth)
      }
      continue
    }

    if (char === ";" && depth > 0) {
      currentLine += char
      if (next && next !== "\n" && next !== "}") {
        pushNewline(depth)
      }
      continue
    }

    if (char === ":" && next === " ") {
      currentLine += char
      if (depth === 0 && source.slice(index + 1).includes("{")) {
        pushNewline(depth + 1)
      }
      continue
    }

    currentLine += char
  }

  const trimmedLine = currentLine.replace(/[ \t]+$/u, "")
  if (trimmedLine.length > 0) {
    lines.push(trimmedLine)
  }

  return lines
    .join("\n")
    .trim()
}

const renderSignature = (renderer: DocsRenderer, signature: string): string =>
  `<div class="signature">${renderer.highlightBlock(formatSignature(signature), "ts")}</div>`

const renderModuleToc = (renderer: DocsRenderer, sections: ReadonlyArray<ModuleSection>): string => {
  if (sections.length === 0) {
    return ""
  }

  return [
    `<section class="module-toc">`,
    `<h2>On This Page</h2>`,
    `<div class="module-toc-grid">`,
    ...sections.map((section: ModuleSection) =>
      [
        `<section class="module-toc-section">`,
        `<h3>${escapeHtml(section.key)}</h3>`,
        `<ul>`,
        ...section.items.map((item: ModuleItem) =>
          `<li><a href="#${item.anchor}">${renderer.highlightInline(item.name)}</a></li>`),
        `</ul>`,
        `</section>`
      ].join("")),
    `</div>`,
    `</section>`
  ].join("")
}

const renderItem = (renderer: DocsRenderer, item: ModuleItem, anchors: ReadonlySet<string>): string => {
  return [
    `<article class="doc-item" id="${item.anchor}">`,
    `<header class="doc-item-header">`,
    `<h3>${renderer.highlightInline(item.name)}</h3>`,
    `<a class="source-link" href="${item.sourceLink}">Source</a>`,
    `</header>`,
    item.description
      ? renderMarkdown(renderer, item.description, anchors)
      : `<p class="muted">No description provided yet.</p>`,
    renderSignature(renderer, item.signature),
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
    ...moduleDoc.typeItems.map((item: ModuleItem) => `<li>${renderer.highlightInline(item.name)}</li>`),
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
    `<div class="module-actions"><a class="source-link" href="${moduleDoc.sourceLink}">View Source</a></div>`,
    renderMarkdown(renderer, moduleDoc.description, anchors),
    `</header>`,
    renderExamples(renderer, moduleDoc.examples, anchors),
    renderModuleToc(renderer, sections),
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

const renderSidebar = ({
  config,
  modules,
  currentOutputPath
}: {
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
  readonly currentOutputPath: string
}): string => {
  const homePath = NodePath.join(config.outDir, "index.html")
  const isHomePage = NodePath.resolve(currentOutputPath) === NodePath.resolve(homePath)
  const groups = config.moduleGroups.map((group) => ({
    ...group,
    modules: modules.filter((moduleDoc) => moduleDoc.group === group.id)
  }))

  return [
    `<nav class="sidebar">`,
    `<a class="site-title" href="${getRelativeDocHref(currentOutputPath, homePath)}">${escapeHtml(config.siteTitle)}</a>`,
    `<p class="site-description">${escapeHtml(config.siteDescription)}</p>`,
    `<div class="sidebar-section">`,
    `<a class="sidebar-link${isHomePage ? " is-active" : ""}" href="${getRelativeDocHref(currentOutputPath, homePath)}"${isHomePage ? ' aria-current="page"' : ""}>Overview</a>`,
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
  currentOutputPath,
  title,
  description,
  content
}: {
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
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
    renderSidebar({ config, modules, currentOutputPath }),
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
  readme
}: {
  readonly renderer: DocsRenderer
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
  readonly readme: string
}): string => {
  const grouped = config.moduleGroups.map((group) => ({
    ...group,
    modules: modules.filter((moduleDoc) => moduleDoc.group === group.id)
  }))

  return [
    `<header class="home-hero">`,
    `<p class="eyebrow">Project Docs</p>`,
    `<h1>${escapeHtml(config.siteTitle)}</h1>`,
    `<p class="home-summary">${escapeHtml(config.siteDescription)}</p>`,
    `</header>`,
    `<section class="home-readme">${renderMarkdown(renderer, readme)}</section>`,
    `<section class="home-groups">`,
    `<h2>Modules</h2>`,
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

const SITE_CSS = `
:root {
  color-scheme: light;
  --bg: #f4f1ea;
  --surface: rgba(255, 255, 255, 0.85);
  --surface-strong: #fffdf8;
  --border: #d8cdbd;
  --text: #221b16;
  --muted: #6a5c50;
  --accent: #0d6c5b;
  --shadow: 0 12px 40px rgba(34, 27, 22, 0.08);
  --sidebar-width: 18rem;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(circle at top left, rgba(13, 108, 91, 0.16), transparent 28rem),
    linear-gradient(180deg, #fbf8f2 0%, var(--bg) 100%);
}

a {
  color: var(--accent);
}

pre,
code {
  font-family: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
}

.layout {
  display: grid;
  grid-template-columns: minmax(14rem, var(--sidebar-width)) minmax(0, 1fr);
  gap: 2rem;
  max-width: 96rem;
  margin: 0 auto;
  padding: 1.5rem;
}

.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  max-height: 100vh;
  overflow: auto;
  padding: 1.5rem 1rem 2rem;
  border-right: 1px solid var(--border);
}

.site-title {
  display: inline-block;
  margin-bottom: 0.5rem;
  color: var(--text);
  text-decoration: none;
  font-size: 1.5rem;
  font-weight: 700;
}

.site-description {
  margin: 0 0 1.5rem;
  color: var(--muted);
  line-height: 1.55;
}

.sidebar-section {
  margin-bottom: 1.5rem;
}

.sidebar-section h2 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.sidebar-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sidebar-link {
  display: block;
  padding: 0.4rem 0.65rem;
  border-radius: 0.7rem;
  text-decoration: none;
  line-height: 1.35;
}

.sidebar-link.is-active {
  color: var(--text);
  background: rgba(13, 108, 91, 0.12);
  box-shadow: inset 0 0 0 1px rgba(13, 108, 91, 0.18);
}

.content {
  min-width: 0;
  padding: 2rem 0 4rem;
}

.module-hero,
.home-hero,
.module-section,
.module-examples,
.module-toc,
.related-types,
.home-readme,
.group-card {
  background: var(--surface);
  border: 1px solid rgba(216, 205, 189, 0.8);
  box-shadow: var(--shadow);
  border-radius: 1.25rem;
}

.module-hero,
.home-hero,
.home-readme,
.module-examples,
.module-toc,
.related-types {
  padding: 1.75rem;
  margin-bottom: 1.5rem;
}

.module-section {
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.module-hero h1,
.home-hero h1 {
  margin: 0.4rem 0 1rem;
  font-size: clamp(2.4rem, 4vw, 4rem);
  line-height: 1.05;
}

.home-summary {
  margin: 0;
  max-width: 42rem;
  color: var(--muted);
  font-size: 1.1rem;
  line-height: 1.55;
}

.module-actions {
  margin: 0 0 1rem;
}

.source-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  text-decoration: none;
  font-size: 0.95rem;
}

.content h2,
.content h3,
.content h4,
.content p,
.content ul,
.content ol,
.content pre {
  margin-top: 0;
}

.content p,
.content li {
  line-height: 1.65;
}

.content p + p,
.content p + ul,
.content p + ol,
.content ul + p,
.content ol + p {
  margin-top: 0.9rem;
}

.content ul,
.content ol {
  padding-left: 1.3rem;
}

.module-section-header h2,
.module-examples h2,
.module-toc h2,
.related-types h2,
.home-groups h2 {
  margin-bottom: 0.75rem;
}

.module-section-header > :last-child,
.module-examples > :last-child,
.module-toc > :last-child,
.related-types > :last-child {
  margin-bottom: 0;
}

.module-toc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
}

.module-toc-section {
  padding: 1rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 0.9rem;
  background: var(--surface-strong);
}

.module-toc-section h3 {
  margin-bottom: 0.7rem;
  font-size: 1rem;
}

.module-toc-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.module-toc-section li + li {
  margin-top: 0.55rem;
}

.module-toc-section a {
  text-decoration: none;
  line-height: 1.4;
}

.doc-item-list {
  display: grid;
  gap: 1.25rem;
}

.doc-item {
  padding: 1.35rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: var(--surface-strong);
}

.doc-item-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.9rem;
}

.doc-item-header h3 {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.2;
}

.doc-item > :last-child {
  margin-bottom: 0;
}

.doc-item .signature + .doc-item-examples,
.doc-item p + .signature {
  margin-top: 1rem;
}

.doc-item-examples > :last-child {
  margin-bottom: 0;
}

.signature {
  margin: 1.1rem 0 0;
}

.signature .shiki {
  overflow-x: auto;
}

.signature .shiki code {
  white-space: pre;
  overflow-wrap: normal;
}

.signature .shiki .line {
  min-height: 1.55em;
}

.shiki {
  margin: 0;
  padding: 1rem 1.1rem;
  overflow: auto;
  border-radius: 0.9rem;
  border: 1px solid rgba(216, 205, 189, 0.8);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.shiki code {
  display: grid;
  gap: 0.18rem;
  font-size: 0.92rem;
  line-height: 1.6;
}

.shiki .line {
  display: block;
  min-height: 1.5em;
}

.inline-code {
  display: inline;
  padding: 0.04rem 0.28rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(216, 205, 189, 0.85);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  font-size: 0.84em;
  line-height: 1.35;
  white-space: break-spaces;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.inline-code code,
.inline-code .line {
  display: inline;
}

.related-types li + li {
  margin-top: 0.5rem;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 1rem;
}

.group-card {
  padding: 1.25rem;
}

.group-card ul {
  padding-left: 1.2rem;
  margin: 0;
}

.group-card li {
  margin-bottom: 1rem;
}

.group-card p {
  margin: 0.3rem 0 0;
  color: var(--muted);
}

.muted {
  color: var(--muted);
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
    padding: 1rem;
  }

  .sidebar {
    position: static;
    max-height: none;
    border-right: 0;
    border-bottom: 1px solid var(--border);
    padding: 0 0 1rem;
  }

  .content {
    padding-top: 0;
  }
}
`

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
    const checker = program.getTypeChecker()
    const modules = absoluteEntryPoints
      .map((absolutePath, index) =>
        parseModule({
          absolutePath,
          relativePath: config.entryPoints[index] ?? absolutePath,
          config,
          program,
          checker
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
  moduleDoc,
  index
}: {
  readonly renderer: DocsRenderer
  readonly config: ResolvedDocsConfig
  readonly modules: ReadonlyArray<ModuleDoc>
  readonly moduleDoc: ModuleDoc
  readonly index: number
}) =>
  Effect.gen(function*() {
    const outputPath = NodePath.join(config.outDir, "modules", moduleDoc.slug, "index.html")
    yield* Effect.logInfo(`Building module ${index + 1}/${modules.length}: ${moduleDoc.name}`)

    const html = renderPage({
      config,
      modules,
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
          yield* Effect.logInfo(`Reading README and preparing output directory ${config.outDir}`)
          const readme = yield* readFileString(NodePath.join(cwd, "README.md"))
          const normalizedReadme = stripReadmeTitle(rewriteReadmeLinks(readme, config.sourceBaseUrl))

          yield* removeDir(config.outDir)
          yield* Effect.logInfo("Writing static assets")
          yield* Effect.all([
            writeFileString(NodePath.join(config.outDir, ".nojekyll"), ""),
            writeFileString(NodePath.join(config.outDir, "assets", "site.css"), SITE_CSS)
          ], { concurrency: "unbounded" })

          const homeOutputPath = NodePath.join(config.outDir, "index.html")
          yield* Effect.logInfo("Rendering home page")
          const homeHtml = renderPage({
            config,
            modules,
            currentOutputPath: homeOutputPath,
            title: `${config.siteTitle} Docs`,
            description: config.siteDescription,
            content: renderHomePage({ renderer, config, modules, readme: normalizedReadme })
          })
          yield* writeFileString(homeOutputPath, homeHtml)
          yield* Effect.logInfo(`Building ${modules.length} module pages with concurrency ${MODULE_RENDER_CONCURRENCY}`)

          yield* Effect.forEach(
            modules,
            (moduleDoc, index) =>
              buildModulePage({
                renderer,
                config,
                modules,
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

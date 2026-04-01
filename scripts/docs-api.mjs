import * as Fs from "node:fs"
import * as Path from "node:path"

const apiDir = Path.join("docs", "api")
const sidebarPath = Path.join(apiDir, "typedoc-sidebar.json")
const apiIndexPath = Path.join(apiDir, "index.md")

const readJson = (path) => JSON.parse(Fs.readFileSync(path, "utf8"))

const readModuleOverview = (moduleName) => {
  const moduleIndexPath = Path.join(apiDir, moduleName, "index.md")
  const content = Fs.readFileSync(moduleIndexPath, "utf8")
  const lines = content.split("\n")
  const headingIndex = lines.findIndex((line) => line.startsWith("# "))
  const nextSectionIndex = lines.findIndex(
    (line, index) => index > headingIndex && line.startsWith("## ")
  )
  const overviewLines = lines
    .slice(headingIndex + 1, nextSectionIndex === -1 ? undefined : nextSectionIndex)
    .join("\n")
    .trim()

  return overviewLines.length > 0 ? overviewLines : "No overview provided."
}

const moduleNameFromLink = (link) =>
  link.replace(/^\/api\//, "").replace(/\/$/, "")

const buildApiIndex = () => {
  const sidebar = readJson(sidebarPath)
  const sections = sidebar.map((item) => {
    const moduleName = moduleNameFromLink(item.link)
    const overview = readModuleOverview(moduleName)

    return [
      `## [${item.text}](.${item.link.replace(/^\/api/, "")})`,
      overview
    ].join("\n\n")
  })

  const page = [
    "---",
    'title: "API"',
    "---",
    "",
    "# API",
    "",
    "Reference for the public modules exported by `bevy-ts`.",
    "",
    ...sections
  ].join("\n")

  Fs.writeFileSync(apiIndexPath, `${page}\n`)
}

buildApiIndex()

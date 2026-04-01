import * as Fs from "node:fs"
import * as Path from "node:path"

const docsDir = "docs"
const apiDir = Path.join(docsDir, "api")
const vitepressDir = Path.join(docsDir, ".vitepress")
const docsIndexPath = Path.join(docsDir, "index.md")
const repoBlobBase = "https://github.com/SandroMaglione/bevy-ts/blob/main"

const ensureDir = (path) => {
  Fs.mkdirSync(path, { recursive: true })
}

const rewriteReadmeLinks = (content) =>
  content.replace(/\]\((?!https?:\/\/|#|mailto:|data:)([^)]+)\)/g, (_match, rawTarget) => {
    const [target, hash = ""] = rawTarget.split("#")
    const normalized = target.replace(/^\.\//, "").replace(/^\/+/, "")
    if (normalized.length === 0) {
      return `](#${hash})`
    }
    const suffix = hash.length > 0 ? `#${hash}` : ""
    return `](${repoBlobBase}/${normalized}${suffix})`
  })

const stripReadmeTitle = (content) =>
  content.replace(/^#\s+`?bevy-ts`?\s*\n+/i, "")

const writeHomepage = () => {
  const readme = Fs.readFileSync("README.md", "utf8")
  const content = stripReadmeTitle(rewriteReadmeLinks(readme)).trim()
  const frontmatter = `---
title: "bevy-ts"
---

`

  ensureDir(docsDir)
  Fs.writeFileSync(docsIndexPath, `${frontmatter}${content}\n`)
}

const cleanupGeneratedDocs = () => {
  Fs.rmSync(apiDir, { recursive: true, force: true })
  Fs.rmSync(Path.join(docsDir, "modules"), { recursive: true, force: true })
  Fs.rmSync(Path.join(docsDir, ".jekyll-cache"), { recursive: true, force: true })
  Fs.rmSync(Path.join(docsDir, "_config.yml"), { force: true })
  Fs.rmSync(Path.join(vitepressDir, "dist"), { recursive: true, force: true })
  Fs.rmSync(Path.join(vitepressDir, "cache"), { recursive: true, force: true })
}

cleanupGeneratedDocs()
ensureDir(vitepressDir)
writeHomepage()

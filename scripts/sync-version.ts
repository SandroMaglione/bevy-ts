/**
 * Writes the devtools package version into `packages/devtools/src/internal/version.ts`
 * (replay files record it). Run by `pnpm version-packages` after `changeset version`.
 */
import { readFileSync, writeFileSync } from "node:fs"

const root = new URL("../packages/devtools/", import.meta.url)
const manifest: unknown = JSON.parse(readFileSync(new URL("package.json", root), "utf8"))
const version = typeof manifest === "object" && manifest !== null && "version" in manifest && typeof manifest.version === "string" ? manifest.version : undefined
if (version === undefined) throw new Error("packages/devtools/package.json has no version")

const target = new URL("src/internal/version.ts", root)
const source = readFileSync(target, "utf8").replace(/export const libraryVersion = "[^"]*"/, `export const libraryVersion = "${version}"`)
writeFileSync(target, source)
console.log(`devtools libraryVersion = ${version}`)

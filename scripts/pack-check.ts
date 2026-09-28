/**
 * Verifies the published shape of every package, the way a user installs it.
 *
 * 1. Builds the packages from a clean `dist`.
 * 2. Packs each one with `pnpm pack`, which applies `publishConfig` and turns
 *    `workspace:` ranges into real versions.
 * 3. Installs the tarballs into a fresh consumer project outside the
 *    workspace (internal dependencies are overridden to the tarballs, since
 *    the new version is not on npm yet).
 * 4. Type-checks a consumer file with `skipLibCheck: false` under
 *    `moduleResolution: nodenext` with TypeScript 7 and 6, runs it with
 *    plain Node, and checks that `internal/*` paths are not exported.
 *
 *   pnpm pack:check
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const packages = ["core", "math", "browser", "pixi", "devtools"] as const

const run = (command: string, args: ReadonlyArray<string>, cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })

const step = (message: string) => console.log(`\n> ${message}`)

step("build")
run("pnpm", ["build"], root)

const work = mkdtempSync(path.join(os.tmpdir(), "bevy-ts-pack-"))
const tarballs = path.join(work, "tarballs")
mkdirSync(tarballs)

step("pack")
const tarballByName = new Map<string, string>()
for (const directory of packages) {
  const packageRoot = path.join(root, "packages", directory)
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { readonly name: string }
  const before = new Set(readdirSync(tarballs))
  run("pnpm", ["pack", "--pack-destination", tarballs], packageRoot)
  const created = readdirSync(tarballs).find((file) => !before.has(file))
  if (created === undefined) throw new Error(`pnpm pack produced no tarball for ${manifest.name}`)
  tarballByName.set(manifest.name, path.join(tarballs, created))
  const listing = run("tar", ["-tzf", path.join(tarballs, created)], work).split("\n")
  for (const required of ["package/LICENSE", "package/README.md", "package/dist/index.js", "package/dist/index.d.ts", "package/src/index.ts"]) {
    if (!listing.includes(required)) throw new Error(`${manifest.name} tarball is missing ${required}`)
  }
  if (listing.some((file) => file.includes("/test/") || file.includes("tsbuildinfo"))) {
    throw new Error(`${manifest.name} tarball contains test or build-info files`)
  }
  const packed = JSON.parse(run("tar", ["-xzOf", path.join(tarballs, created), "package/package.json"], work)) as {
    readonly exports: Record<string, unknown>
    readonly dependencies?: Record<string, string>
  }
  if (JSON.stringify(packed.exports).includes("./src/")) throw new Error(`${manifest.name} publishes source exports`)
  for (const [dependency, range] of Object.entries(packed.dependencies ?? {})) {
    if (range.startsWith("workspace:")) throw new Error(`${manifest.name} publishes ${dependency}@${range}`)
  }
  console.log(`${manifest.name}: ${created}`)
}

step("install into a consumer project")
const consumer = path.join(work, "consumer")
mkdirSync(consumer)
const fileSpec = (name: string) => `file:${tarballByName.get(name)!}`
writeFileSync(path.join(consumer, "package.json"), JSON.stringify({
  name: "bevy-ts-consumer",
  private: true,
  type: "module",
  dependencies: Object.fromEntries([...tarballByName.keys()].map((name) => [name, fileSpec(name)])),
  overrides: Object.fromEntries([...tarballByName.keys()].map((name) => [name, fileSpec(name)]))
}, null, 2))
run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], consumer)

writeFileSync(path.join(consumer, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: false,
    types: []
  },
  include: ["main.ts"]
}, null, 2))

const program = `
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import * as Result from "@typeonce/bevy-ts/Result"
import * as Vector2 from "@typeonce/bevy-ts-math/Vector2"
import { Keyboard } from "@typeonce/bevy-ts-browser"
import { NodeRegistry } from "@typeonce/bevy-ts-pixi"
import { Session } from "@typeonce/bevy-ts-devtools"

const Position = Descriptor.ConstructedComponent(Vector2)("Consumer/Position")
const Game = Schema.bind(Schema.fragment({ components: { Position } }))
const Spawn = Game.System("Consumer/Spawn", {}, ({ commands }) => {
  const draft = Game.Command.spawn(Game.Command.entryRaw(Position, { x: 1, y: 2 }))
  if (draft.ok) commands.spawn(draft.value)
})
const runtime = Game.Runtime.make({ services: Game.Runtime.services(), debug: true })
const session = Session.make(runtime, { schedules: { setup: Game.Schedule(Spawn, Game.Schedule.applyDeferred()) } })
const ran = session.run("setup")
const keyboard = Keyboard.scripted({ jump: [" "] }, [{ frame: 0, press: ["jump"] }])
const registry = NodeRegistry.make<string>({ attach: () => {}, detach: () => {} })
console.log(JSON.stringify({
  ok: ran.data.ok && Result.isSuccess(Result.success(1)),
  entities: session.dump().data.entityCount,
  jump: keyboard.snapshot().jump.pressed,
  nodes: registry.size
}))
`
writeFileSync(path.join(consumer, "main.ts"), program)

step("type-check the consumer with TypeScript 7 (skipLibCheck: false)")
run(path.join(root, "node_modules", ".bin", "tsc"), ["-p", "tsconfig.json", "--pretty", "false"], consumer)

step("type-check the consumer with TypeScript 6 (skipLibCheck: false)")
run("node", [path.join(root, "node_modules", "typescript6", "lib", "tsc.js"), "-p", "tsconfig.json", "--pretty", "false"], consumer)

step("run the consumer with Node")
execFileSync(path.join(root, "node_modules", ".bin", "tsc"), ["-p", "tsconfig.json", "--noEmit", "false", "--outDir", "out"], { cwd: consumer, stdio: "inherit" })
const output = run("node", ["out/main.js"], consumer).trim()
const expected = JSON.stringify({ ok: true, entities: 1, jump: true, nodes: 0 })
if (output !== expected) throw new Error(`consumer printed ${output}, expected ${expected}`)
console.log(output)

step("internal modules are not exported")
writeFileSync(path.join(consumer, "internal.mjs"), `import("@typeonce/bevy-ts/internal/world").then(() => process.exit(1), (error) => { if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") process.exit(2) })\n`)
run("node", ["internal.mjs"], consumer)

if (process.env.PACK_CHECK_KEEP) console.log(`kept ${work}`)
else rmSync(work, { recursive: true, force: true })
console.log("\npack check passed")

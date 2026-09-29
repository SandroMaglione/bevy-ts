/**
 * Type tests must say which error they expect. TSTyche checks the text after
 * `// @ts-expect-error` against the actual compiler error, so a test cannot
 * pass because of an unrelated mistake (a typo, a renamed API, a missing
 * import). A trailing `!` switches that check off, so it is not allowed.
 * Messages must also not quote absolute paths, which differ between machines.
 *
 *   node --import tsx scripts/check-type-tests.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dirname, "..", "packages")
const offenders: Array<string> = []
const machinePaths: Array<string> = []

const walk = (directory: string): void => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.tst\.tsx?$/.test(name)) {
      readFileSync(path, "utf8").split("\n").forEach((line, index) => {
        if (/@ts-expect-error!/.test(line)) offenders.push(`${path}:${index + 1}`)
        if (/@ts-expect-error .*(\/Users\/|\/home\/|[A-Z]:\\)/.test(line)) machinePaths.push(`${path}:${index + 1}`)
      })
    }
  }
}

for (const name of readdirSync(root)) {
  const dtslint = join(root, name, "dtslint")
  try {
    if (statSync(dtslint).isDirectory()) walk(dtslint)
  } catch {
    // Packages without type tests.
  }
}

if (machinePaths.length > 0) {
  console.error(
    [
      "Expected error messages must not quote absolute paths (they differ on other machines); cut the fragment before the path:",
      ...machinePaths.map((line) => `  ${line}`)
    ].join("\n")
  )
}
if (offenders.length > 0) {
  console.error(
    [
      "Type tests must state the expected error: write `// @ts-expect-error <fragment of the message>`",
      "(or use `expect(fn).type.not.toBeCallableWith(...)`) instead of `// @ts-expect-error!`:",
      ...offenders.map((offender) => `  ${offender}`)
    ].join("\n")
  )
}
if (offenders.length > 0 || machinePaths.length > 0) process.exit(1)
console.log("type tests: every expected error states its message")

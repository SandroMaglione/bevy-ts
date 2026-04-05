import { startGeneticsExample } from "./main.ts"

const mount = document.querySelector<HTMLElement>("[data-genetics-root]")

if (!mount) {
  throw new Error("Missing [data-genetics-root] host element in examples/genetics/index.html")
}

void startGeneticsExample(mount)

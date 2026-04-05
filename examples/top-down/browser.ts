import { startTopDownExample } from "./main.ts"

const mount = document.querySelector<HTMLElement>("[data-top-down-root]")

if (!mount) {
  throw new Error("Missing [data-top-down-root] host element in examples/top-down/index.html")
}

void startTopDownExample(mount)

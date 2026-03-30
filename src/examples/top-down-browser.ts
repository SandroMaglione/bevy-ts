import { startTopDownExample } from "./top-down/main.ts"

const mount = document.querySelector<HTMLElement>("[data-top-down-root]")

if (!mount) {
  throw new Error("Missing [data-top-down-root] host element in top-down.html")
}

void startTopDownExample(mount)

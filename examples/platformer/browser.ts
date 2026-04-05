import { startPlatformerExample } from "./main.ts"

const mount = document.querySelector<HTMLElement>("[data-platformer-root]")

if (!mount) {
  throw new Error("Missing [data-platformer-root] host element in examples/platformer/index.html")
}

void startPlatformerExample(mount)

import { startPlatformerExample } from "./platformer/main.ts"

const mount = document.querySelector<HTMLElement>("[data-platformer-root]")

if (!mount) {
  throw new Error("Missing [data-platformer-root] host element in platformer.html")
}

void startPlatformerExample(mount)

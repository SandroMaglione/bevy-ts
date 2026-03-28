import type { BrowserExampleHandle } from "./pixi.ts"
import { startPixiExample } from "./pixi.ts"
import { startPokemonExample } from "./pokemon.ts"
import { startSnakeExample } from "./snake.ts"

type ExampleId = "pixi" | "pokemon" | "snake"

type ExampleDefinition = {
  readonly id: ExampleId
  readonly label: string
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly meta: ReadonlyArray<string>
  readonly start: (mount: HTMLElement) => Promise<BrowserExampleHandle>
}

const examples: ReadonlyArray<ExampleDefinition> = [
  {
    id: "pixi",
    label: "Pixi Motion",
    eyebrow: "PixiJS loop, bevy-ts ECS",
    title: "External runtime, typed motion systems.",
    description:
      "Pixi owns the canvas and ticker. The ECS side owns descriptors, schema, resources, systems, schedules, and the sync step that projects ECS state into renderer-owned sprites.",
    meta: ["Setup schedule: spawn scene", "Update: input, motion, bounce, sync", "Renderer objects live outside ECS"],
    start: startPixiExample
  },
  {
    id: "pokemon",
    label: "Pokemon",
    eyebrow: "Grid movement demo",
    title: "Intent, collision, and apply phases on a Pixi grid.",
    description:
      "This keeps the Pokemon-style ECS flow intact: keyboard input becomes movement intent, collisions veto illegal targets, and a sync system mirrors ECS positions into Pixi tiles.",
    meta: ["Arrows or WASD to move", "Fresh runtime per switch", "Pixi-backed browser integration"],
    start: startPokemonExample
  },
  {
    id: "snake",
    label: "Snake",
    eyebrow: "Event and lookup demo",
    title: "Ordered ECS phases on a visible Pixi board.",
    description:
      "This browser tab keeps the original Snake ECS logic and only adds a Pixi render bridge. It is the intermediate validation step for visible grid-based ECS rendering.",
    meta: ["Auto-advances on a fixed step", "Head, body, and food render separately", "Exercises event polling and entity lookup"],
    start: startSnakeExample
  }
]

const exampleMap = new Map(examples.map((example) => [example.id, example] as const))

const controls = document.querySelector<HTMLElement>("[data-example-controls]")
const mount = document.querySelector<HTMLElement>("[data-example-root]")
const eyebrow = document.querySelector<HTMLElement>("[data-example-eyebrow]")
const title = document.querySelector<HTMLElement>("[data-example-title]")
const description = document.querySelector<HTMLElement>("[data-example-description]")
const meta = document.querySelector<HTMLElement>("[data-example-meta]")

if (!controls || !mount || !eyebrow || !title || !description || !meta) {
  throw new Error("Missing example host elements in pixi.html")
}

let currentHandle: BrowserExampleHandle | null = null
let currentId: ExampleId | null = null
let switchToken = 0

const renderChrome = (example: ExampleDefinition): void => {
  eyebrow.textContent = example.eyebrow
  title.textContent = example.title
  description.textContent = example.description
  meta.replaceChildren(
    ...example.meta.map((item) => {
      const chip = document.createElement("span")
      chip.textContent = item
      return chip
    })
  )
}

const renderMenu = (): void => {
  controls.replaceChildren(
    ...examples.map((example) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "example-switcher__button"
      button.dataset.active = String(example.id === currentId)
      button.textContent = example.label
      button.addEventListener("click", () => {
        void activateExample(example.id)
      })
      return button
    })
  )
}

const activateExample = async (id: ExampleId): Promise<void> => {
  const example = exampleMap.get(id)
  if (!example) {
    return
  }

  const token = ++switchToken

  if (currentHandle) {
    const previous = currentHandle
    currentHandle = null
    await previous.destroy()
  }

  if (token !== switchToken) {
    return
  }

  currentId = id
  renderChrome(example)
  renderMenu()
  currentHandle = await example.start(mount)

  if (token !== switchToken && currentHandle) {
    const stale = currentHandle
    currentHandle = null
    await stale.destroy()
  }
}

void activateExample("pixi")

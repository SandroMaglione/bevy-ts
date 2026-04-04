import * as Effect from "effect/Effect"
import { buildDocsSite } from "./docgen.mjs"

await Effect.runPromise(buildDocsSite())

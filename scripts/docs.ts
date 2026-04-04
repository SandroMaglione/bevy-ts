import * as Effect from "effect/Effect"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { buildDocsSite } from "./docgen.ts"

buildDocsSite().pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)

/**
 * Typed ownership scopes for groups of runtime entities.
 *
 * An entity scope is a lifetime token, not a component and not proof that an
 * entity is alive. Systems can spawn entities into a scope and later queue one
 * deferred cleanup for the complete group. This is the small piece needed to
 * build scenes without teaching the ECS runtime about menus, levels, overlays,
 * or any other game-specific scene model.
 *
 * @module entityScope
 * @docGroup core
 */

/** A nominal entity-lifetime scope tied to one bound game root. */
export interface EntityScope<
  out Name extends string = string,
  out Root = unknown
> {
  readonly kind: "entityScope"
  readonly name: Name
  readonly key: symbol
  readonly __schemaRoot?: Root | undefined
}

/** Type-level helpers for entity scopes. */
export namespace EntityScope {
  export type Any = EntityScope<string, any>
  export type Name<T extends Any> = T["name"]
  export type Root<T extends Any> = T extends EntityScope<string, infer Root> ? Root : never
}

/**
 * Creates one canonical entity-scope token.
 *
 * Normal game code should use `Game.EntityScope(...)` so the returned token is
 * branded to that game's root.
 */
export const make = <const Name extends string, Root = unknown>(
  name: Name
): EntityScope<Name, Root> => ({
  kind: "entityScope",
  name,
  key: Symbol.for(`bevy-ts/entityScope/${name}`)
})

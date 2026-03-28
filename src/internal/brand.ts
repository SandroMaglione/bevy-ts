/**
 * Creates a nominal type from an otherwise structural value.
 *
 * This utility is used for opaque ids such as `EntityId`, where two values may
 * have the same runtime shape but should not be considered interchangeable by
 * the type system.
 */
export type Brand<Token, Value> = Value & {
  readonly __brand: Token
}

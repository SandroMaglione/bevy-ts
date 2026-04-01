/**
 * Small branding helpers for constructor-first validated values.
 *
 * Brands let the library distinguish validated carried values from raw user
 * input without changing their runtime representation. Constructors built with
 * this module are always explicit and non-throwing.
 */
import * as internal from "./internal/brand.ts"

/**
 * Public marker used to distinguish one validated domain from another.
 */
export type Brand<Key> = internal.PublicBrand<Key>
/**
 * One value tagged with a stable public {@link Brand}.
 */
export type Branded<Value, Key> = internal.Branded<Value, Key>

/**
 * Minimal constructor contract shared by branded helper modules.
 *
 * The constructor boundary is the only place raw input is accepted. After one
 * value has been validated, downstream helpers operate on the branded carried
 * type instead of revalidating plain structural data.
 */
export interface Constructor<Value, Raw, Error> {
  /**
   * Validates one raw value and returns an explicit success/failure result.
   */
  readonly result: (raw: Raw) => import("./Result.ts").Result<Value, Error>
  /**
   * Validates one raw value and returns `null` on failure.
   *
   * This is useful at internal boundaries where only presence matters and no
   * structured error is needed.
   */
  readonly option: (raw: Raw) => Value | null
  /**
   * Checks whether one raw value already satisfies the branded invariants.
   */
  readonly is: (raw: Raw) => raw is Raw & Value
}

/**
 * Builds one explicit non-throwing constructor from a validation function.
 */
export const refine: <Value, Raw, Error>(
  validate: (raw: Raw) => import("./Result.ts").Result<Value, Error>
) => Constructor<Value, Raw, Error> = internal.refine

/**
 * Combines two constructors that validate the same carried value.
 *
 * The returned constructor succeeds only when both validations succeed.
 */
export const all: <Value, Raw, ErrorA, ErrorB>(
  left: Constructor<Value, Raw, ErrorA>,
  right: Constructor<Value, Raw, ErrorB>
) => Constructor<Value, Raw, readonly [ErrorA, ErrorB]> = internal.all

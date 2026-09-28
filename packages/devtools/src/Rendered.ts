/**
 * Data paired with its text rendering.
 *
 * Every devtools query returns a `Rendered` value: `data` for code, `text`
 * for people and agents. It prints as its text through `console.log`,
 * `String(...)`, and template literals, and serializes as its data through
 * `JSON.stringify`.
 *
 * @module Rendered
 * @docGroup devtools
 */

const inspectSymbol = Symbol.for("nodejs.util.inspect.custom")

export class Rendered<A> {
  readonly data: A
  readonly text: string

  constructor(data: A, text: string) {
    this.data = data
    this.text = text
  }

  toString(): string {
    return this.text
  }

  toJSON(): A {
    return this.data
  }

  [inspectSymbol](): string {
    return this.text
  }
}

export const make = <A>(data: A, text: string): Rendered<A> => new Rendered(data, text)

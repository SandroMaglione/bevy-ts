---
"@typeonce/ritmo": minor
"@typeonce/ritmo-devtools": minor
---

**Immutable components.** `Descriptor.Component`, `ConstructedComponent`, and `TransientComponent` take an optional `{ immutable: true }` for data that says what an entity is (a kind, a team, a tile). Queries can only read such a component: `Game.Query.write(Kind)` is a compile error naming the fix (`replace it with commands.insert(entity, Game.Command.entry(Kind, ...))`), and it throws the same message when an erased type reaches it. Replacing the component with `commands.insert` still marks it changed for `Game.Query.changed(Kind)`. Descriptors declared without the option keep their exact type.

- `Descriptor.isImmutable(descriptor)` reports the option at runtime.
- `describe()` component entries gain `immutable`, and the text report prints it.

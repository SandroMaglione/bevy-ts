---
"@typeonce/bevy-ts": minor
---

Add `Descriptor.State(name, states, { transitions? })`: a component whose value is one of a closed set of states. It behaves like any other component (queries, change detection, rollback), and its constructor validates the value, so `setRaw` and snapshot restore reject unknown states. Its write cell adds `transition(from, to)`, a compare-and-set that writes `to` only while the state is still `from` and otherwise returns a `StateMismatch` failure (`Query.StateMismatchError`) without writing. With a `transitions` graph, which must list every state, a pair the graph does not allow is a compile error. Without a graph, any pair of states is accepted.

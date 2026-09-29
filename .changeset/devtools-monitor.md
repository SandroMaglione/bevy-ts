---
"@typeonce/bevy-ts-devtools": minor
---

Add `Monitor.attach(runtime, { schedules, pick?, locate? })`: a live browser panel that shows how a running game works, toggled with the backslash key or a corner button.

- **Overview:** schedule tick times, the busiest systems, entity counts per component with sparklines, state machines, and alerts (failed systems, NaN or infinite writes, discarded messages).
- **Systems:** each schedule's systems in order, grouped by run conditions. Each one shows its writes, events, spawns (learned while running), and reads, with a live working/idle/skipped status. Hover a name to highlight its writers and readers.
- **Entity:** pick an entity on screen, by id, or by component, and follow its components and changes live.

The monitor observes the runtime only while it is open. `Monitor.Collector` exposes the same data without DOM.

---
"@typeonce/bevy-ts": patch
---

Fix spawn and insert entries accepting a value of the wrong component. In a schema with two or more components, `spawn([Health, "a name"])` compiled because entries were typed as "any schema descriptor with any schema value". Each descriptor is now paired with its own value type, so these entries are compile errors. Code that compiled only because of this hole now reports the mismatch.

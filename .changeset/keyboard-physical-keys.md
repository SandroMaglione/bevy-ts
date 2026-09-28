---
"@typeonce/bevy-ts-browser": minor
---

Keyboard bindings can match physical keys: `Keyboard.code("KeyW")` binds by `KeyboardEvent.code`, so a position stays fixed across layouts (WASD on AZERTY) and modifiers cannot change the match (Option+W typing "∑" on macOS, Shift+1 typing "!"). Character and physical bindings mix freely on one action. Character bindings are also more robust: a key released while a modifier changed its character (W pressed, then Option, then W released as "∑") now releases its action instead of staying held. `KeyEvent` gains an optional `code`; the module docs list browser-reserved shortcuts (Ctrl/Cmd+W) that pages cannot block.

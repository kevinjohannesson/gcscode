# @gcscode/extension-example

The canonical minimal extension. Mirror this shape when writing a new extension.

## What it demonstrates

- An extension lives in its own workspace package.
- Its only dependency on the host app is `@gcscode/extension-api`.
- It exports a named `const` (`exampleExtension`) of type `Extension` carrying identity metadata (`id`, `displayName`, `version`) plus an `activate(context)` function.
- Inside `activate`, it calls `context.host.window.registerView`, `context.host.window.registerStatusBarItem`, `context.host.commands.registerCommand`, and `context.host.keybindings.registerKeybinding`, then pushes all four returned `Disposable`s onto `context.subscriptions` — demonstrating multi-surface contributions from a single extension and showing how a command (called by id from elsewhere; the integration backbone for future palette / menu contributions) sits alongside UI contributions, with a keybinding wiring a key combo to fire the command.

## Anatomy

```
src/
  index.ts              - exports exampleExtension: Extension (identity + activate(context))
  example-view.svelte   - the contributed main-content fragment
  example-status.svelte - the contributed status bar fragment
```

The extension contributes one of each kind:

- a view (`gcscode.example.main`),
- a status bar item (`gcscode.example.status`, right-aligned),
- a command (`gcscode.example.greet`, returns the fixed greeting `'Hello from gcscode.example'` and `console.log`s it),
- a keybinding (`Alt+Shift+G` → `gcscode.example.greet`). Press the combo with dev tools open to see the greeting log.

To write your own extension, copy this package, change the exported constant name (`exampleExtension` → `yourExtension`) and identity fields, rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.

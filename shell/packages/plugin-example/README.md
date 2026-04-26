# @gcscode/plugin-example

The canonical minimal plugin. Mirror this shape when writing a new plugin.

## What it demonstrates

- A plugin lives in its own workspace package.
- Its only dependency on the host app is `@gcscode/plugin-api`.
- It exports a named `const` (`examplePlugin`) of type `Plugin` carrying identity metadata (`id`, `displayName`, `version`) plus an `activate(context)` function.
- Inside `activate`, it calls `context.host.registerView`, `context.host.registerStatusBarItem`, and `context.host.registerCommand`, then pushes all three returned `Disposable`s onto `context.subscriptions` — demonstrating multi-surface contributions from a single plugin and showing how a command (the integration backbone) sits alongside UI contributions.

## Anatomy

```
src/
  index.ts              - exports examplePlugin: Plugin (identity + activate(context))
  example-view.svelte   - the contributed main-content fragment
  example-status.svelte - the contributed status bar fragment
```

The plugin contributes one of each kind:

- a view (`gcscode.example.main`),
- a status bar item (`gcscode.example.status`, right-aligned),
- a command (`gcscode.example.greet`, returns the fixed greeting `'Hello from gcscode.example'`).

To write your own plugin, copy this package, change the exported constant name (`examplePlugin` → `yourPlugin`) and identity fields, rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.

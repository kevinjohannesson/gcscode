# @gcscode/plugin-example

The canonical minimal plugin. Mirror this shape when writing a new plugin.

## What it demonstrates

- A plugin lives in its own workspace package.
- Its only dependency on the host app is `@gcscode/plugin-api`.
- It exports a named `const` (`examplePlugin`) of type `Plugin` carrying identity metadata (`id`, `displayName`, `version`) plus an `activate(context)` function.
- Inside `activate`, it calls `context.host.registerView` and pushes the returned `Disposable` to `context.subscriptions`.

## Anatomy

```
src/
  index.ts             - exports examplePlugin: Plugin (identity + activate(context))
  example-view.svelte  - the contributed UI fragment
```

To write your own plugin, copy this package, change the exported constant name (`examplePlugin` → `yourPlugin`) and identity fields, rename the component, and adjust `package.json`'s name. That's it — no other ceremony is currently required.

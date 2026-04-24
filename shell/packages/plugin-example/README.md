# @gcscode/plugin-example

The canonical minimal plugin. Mirror this shape when writing a new plugin.

## What it demonstrates

- A plugin lives in its own workspace package.
- Its only dependency on the host app is `@gcscode/plugin-api`.
- Its `activate(host)` function is the single entry point; it registers one `content` contribution.

## Anatomy

```
src/
  index.ts             - exports examplePlugin: Plugin, calls host.registerContribution
  example-view.svelte  - the contributed UI fragment
```

To write your own plugin, copy this package, rename the exported constant (`examplePlugin` → `yourPlugin`), rename the component, and adjust `package.json`'s name. That's it — no other ceremony is currently required.

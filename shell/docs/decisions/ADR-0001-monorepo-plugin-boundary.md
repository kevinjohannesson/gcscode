# ADR-0001 — Enforce the plugin boundary via pnpm workspaces

**Status:** Accepted (2026-04-25)

## Context

GCScode is a shell-plus-plugins architecture. First-party features will eventually be built as plugins against the same public API that third-party, untrusted plugins will use. A plugin reaching into shell internals — not through the public API — would silently lock in assumptions that later prevent permissioning and sandboxing.

We needed to pick a way to make "plugin only imports from the public API" physically true, not convention-dependent, from day one.

Alternatives considered:

1. **In-tree, convention-only** (`src/shell`, `src/plugins/example`). Cheapest; relies entirely on human/agent discipline.
2. **In-tree with ESLint `no-restricted-imports`.** Convention made machine-enforceable, but lint can be bypassed (`// eslint-disable-next-line`), and future in-process dynamic loading still has filesystem-wide module resolution.
3. **pnpm workspaces with three packages** (`shell`, `plugin-api`, `plugin-example`). The plugin literally has no module resolution path to shell internals — they're not listed as a dependency, not exported, not on the plugin's node_modules path.

## Decision

Adopt pnpm workspaces. Three packages: `@gcscode/shell`, `@gcscode/plugin-api`, `@gcscode/plugin-example`.

## Consequences

**Positive.**

- The boundary is physical — a misuse doesn't compile, it fails resolution.
- The shape matches the long-term story. When plugins become externally authored, the only changes are (a) `@gcscode/plugin-api` gets published and versioned, and (b) plugins move from `workspace:*` to published version ranges. No architectural change.
- ESLint's plugin-boundary rule is now a secondary safety net (against relative-path escapes) rather than the primary mechanism.

**Negative.**

- Slightly more ceremony per package (one extra `package.json`, `tsconfig.json`).
- Any shared devDep that changes version requires updating the root and reinstalling — no per-package drift.
- Plugin-example cannot share a Svelte fixture with shell's tests without moving it to a shared location. Accepted: fixtures stay package-local.

## Follow-ups

- A second lint rule (`no-restricted-imports`, see `eslint.config.ts`) blocks relative-path escapes (`../../shell/...`), which the workspace boundary alone would not prevent.
- When plugins become externally authored, `@gcscode/plugin-api` moves from `dependencies` to `peerDependencies` in plugin packages. (The pattern is already in place for `svelte` in both `plugin-api` and `plugin-example`.)

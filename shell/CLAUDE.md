# GCScode — agent guide

## What this repo is

A Svelte 5 SPA scaffolded as the shell for a VS Code–style ground control station (GCS). Plugins contribute UI fragments into named extension surfaces. First-party features will be built as plugins against the same public API used by third-party plugins later.

## Layout

pnpm workspace with three packages:

- `@gcscode/shell` — the app. Owns bootstrapping and the plugin registry.
- `@gcscode/plugin-api` — the **only** import path for plugins. Types and contracts.
- `@gcscode/plugin-example` — the first plugin. Canonical worked example.

Package root is the repo root. Shared tooling at the root: ESLint flat config, Prettier, and `tsconfig.base.json`. Each package extends these. `svelte.config.js` and `vite.config.ts` live in `packages/shell/` (Vite looks for them at its config's directory).

## Boundary rule — load bearing

**Plugin packages import ONLY from `@gcscode/plugin-api`.** No imports from `@gcscode/shell`. No relative imports that escape the package root. ESLint enforces this; package boundaries in pnpm workspaces reinforce it. Don't work around either.

Corollary: if a plugin needs a capability the host doesn't yet expose, add it to `@gcscode/plugin-api` first (as a new method on `PluginHost` or a new `ContributionKind`), land that, then use it. Never reach around the API.

## Conventions

- **Filenames:** kebab-case for everything, including `.svelte` components. Component import bindings remain PascalCase: `import ExampleView from './example-view.svelte'`.
- **Tests:** co-located `*.test.ts` next to the code they test.
- **Plugin export name:** named `const` matching the plugin's slug (`examplePlugin`, `telemetryPlugin`, ...). Never `default`, never generic `plugin`.
- **ADRs:** `docs/decisions/ADR-NNNN-<slug>.md`.

## Commands

- `pnpm dev` — run the shell's dev server
- `pnpm build` — build all packages
- `pnpm test` — run all tests in all packages
- `pnpm check` — svelte-check + tsc across all packages
- `pnpm lint` — ESLint + Prettier
- `pnpm format` — Prettier write

## Further reading

- `docs/out-of-scope.md` — canonical list of what is intentionally NOT built yet. Check here before building anything new.
- `docs/decisions/` — architecture decision records.
- `packages/plugin-api/README.md` — how to write a plugin.
- `packages/plugin-example/README.md` — the worked example to mirror.

---

## Working with Svelte code

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

### Available Svelte MCP Tools:

#### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

#### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

#### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

#### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

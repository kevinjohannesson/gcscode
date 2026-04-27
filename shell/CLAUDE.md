# GCScode — agent guide

## What this repo is

A Svelte 5 SPA scaffolded as the shell for a VS Code–style ground control station (GCS). Extensions contribute UI fragments into named extension surfaces. First-party features will be built as extensions against the same public API used by third-party extensions later.

## Layout

pnpm workspace with three packages:

- `@gcscode/shell` — the app. Owns bootstrapping and the extension registry.
- `@gcscode/extension-api` — the **only** import path for extensions. Types and contracts.
- `@gcscode/extension-example` — the first extension. Canonical worked example.

Package root is the repo root. Shared tooling at the root: ESLint flat config, Prettier, and `tsconfig.base.json`. Each package extends these. `svelte.config.js` and `vite.config.ts` live in `packages/shell/` (Vite looks for them at its config's directory).

## Boundary rule — load bearing

**Extension packages import ONLY from `@gcscode/extension-api`.** No imports from `@gcscode/shell`. No relative imports that escape the package root. ESLint enforces this; package boundaries in pnpm workspaces reinforce it. Don't work around either.

Corollary: if an extension needs a capability the host doesn't yet expose, add it to `@gcscode/extension-api` first (as a new method on `ExtensionHost` — typically a `register*` for a new kind, or a verb like `executeCommand` — or a new field on `ExtensionContext`), land that, then use it. Never reach around the API.

## Conventions

- **Filenames:** kebab-case for everything, including `.svelte` components. Component import bindings remain PascalCase: `import ExampleView from './example-view.svelte'`.
- **Tests:** co-located `*.test.ts` next to the code they test.
- **Extension export name:** named `const` matching the extension's slug (`exampleExtension`, `telemetryExtension`, ...). Never `default`, never generic `extension`.
- **ADRs:** `docs/decisions/ADR-NNNN-<slug>.md`.
- **Specs:** `docs/specs/YYYY-MM-DD-<topic>.md` (not the brainstorming-skill default of `docs/superpowers/specs/`).
- **Plans:** `docs/plans/YYYY-MM-DD-<topic>.md` (not the writing-plans-skill default of `docs/superpowers/plans/`).
- **Scratch:** `scratch/` is reserved for one-off exploration that shouldn't become real code. Gitignored.

## Branching and merging

- **Feature branches.** Implementation work runs on `feat/<topic>` branches off master. Spec/plan commits can land on master directly (they're metadata about future work); code commits live on a branch.
- **Merge with `--no-ff`.** Land a feature branch via `git merge --no-ff feat/<topic>` so the feature boundary survives in `git log`. Matches the `f448ddc Merge branch 'feat/plugin-architecture-mvp'` precedent.
- **Never `--no-verify`.** Don't bypass commit hooks. If a hook fails, fix the underlying issue. (The repo currently has no commit hooks; the rule is in place for when it does.)
- **No force pushes to master.** Even with explicit user consent, prefer fixing the underlying issue over force-pushing.

## Extension shape

An extension module exports a named `const` of type `Extension` with `{ id, displayName, version, activate(context) }`. Inside `activate`, call `context.host.register*` (each returns a `Disposable`) and push every disposable to `context.subscriptions`. Long-form contract: `packages/extension-api/README.md`.

## Planning conventions and long-term alignment

### VS Code alignment (in spirit, not by byte)

GCScode mirrors VS Code's extension architecture in spirit, not by byte. Adopt VS Code's load-bearing patterns — disposables, activation contexts, named/disposable contributions, register-then-execute, commands as the integration backbone — but feel free to diverge on syntax/style/ergonomics when the local context warrants. Extension-code portability is **not** a goal.

During brainstorming and planning, surface every API divergence from VS Code as a labeled decision (with the trade-off articulated), not as a default. When picking a divergence, capture it in the spec or ADR explicitly. Specs should include a "VS Code alignment" section that lists what is aligned, what diverges (and why), and what is deferred — see `docs/specs/2026-04-26-phase-a2-commands.md` for the canonical table-format example.

### Subagent-driven plan execution

When executing a plan, use the `superpowers:subagent-driven-development` skill: dispatch a fresh implementer subagent per task, follow with a spec compliance review then a code quality review, and address review feedback in separate `Code-review-followup:` commits on the same branch (not amends). After all tasks land, dispatch a final cross-cutting code review over the full branch before merging via `superpowers:finishing-a-development-branch`.

This pattern surfaces the same class of issues at three different points (implementer self-review, per-task spec/quality review, final cross-cutting review), and produces a legible `git log` where every followup is traced to the review note that prompted it. Don't squash followups into the originating commit — the review trail is part of the history.

### Non-goals propagate to `docs/out-of-scope.md`

When a spec lists cross-cutting deferrals — concepts the architecture is deliberately deferring, not just per-iteration scope cuts — those deferrals must land in `docs/out-of-scope.md` when the iteration ships, with an explicit trigger to revisit. Per-iteration scope omissions stay in the spec only; cross-cutting deferrals are the canonical list in `out-of-scope.md`.

The judgment: does this non-goal apply only to this iteration, or is it a deliberate "we're deferring this concept" decision affecting the whole architecture? Cross-cutting → propagate to `out-of-scope.md`. Specs should include a `docs/out-of-scope.md` propagation section listing the exact edits the iteration's docs commit will make — see the `## docs/out-of-scope.md propagation` section in `docs/specs/2026-04-26-phase-a2-commands.md` for the canonical bullet-list-of-edits format.

## Commands

- `pnpm dev` — run the shell's dev server
- `pnpm build` — build all packages
- `pnpm test` — run all tests in all packages
- `pnpm check` — svelte-check + tsc across all packages
- `pnpm lint` — ESLint + Prettier
- `pnpm format` — Prettier write

## Further reading

- `docs/roadmap.md` — phase plan + iteration status + planned feature extensions. Start here for "where are we now / what's next".
- `docs/out-of-scope.md` — canonical list of what is intentionally NOT built yet. Check here before building anything new.
- `docs/decisions/` — architecture decision records.
- `packages/extension-api/README.md` — how to write an extension.
- `packages/extension-example/README.md` — the worked example to mirror.

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

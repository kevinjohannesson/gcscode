# GCScode — agent guide

## What this repo is

A Svelte 5 SPA scaffolded as the shell for a VS Code–style ground control station (GCS). Extensions contribute UI fragments into named extension surfaces. First-party features will be built as extensions against the same public API used by third-party extensions later.

## Layout

pnpm workspace organized into three roles: `@gcscode/shell` (the app — owns bootstrapping and the extension registry), `@gcscode/extension-api` (the **only** import path for extensions — types and contracts), and a set of extension packages. The canonical worked-example extension is `@gcscode/extension-example` (new extension authors read it first); the rest are first-party feature extensions (`extension-sitl`, `extension-map`, `extension-flight-overlay`, `extension-vehicle-status`, and others). See `packages/` for the current set.

The workspace root is this directory, `shell/`. The git root is one level up; besides `shell/` it holds `.claude/` (the reviewer registry, agents, skills, scripts) and `.github/`. Shared tooling here: ESLint flat config, Prettier, `tsconfig.base.json`, which each package extends. `svelte.config.js` and `vite.config.ts` live in `packages/shell/`.

## Boundary rule — load bearing

**Extension packages import RUNTIME only from `@gcscode/extension-api`.** No runtime imports from `@gcscode/shell` or sibling extension packages. No relative imports that escape the package root.

**Type-only imports from sibling extension packages are allowed**, exclusively for consuming cross-extension `exports` (see [ADR-0005](docs/decisions/ADR-0005-extension-boundaries.md)). `import type` is erased at compile time; anything that emits JS at runtime against a sibling extension package is a violation.

ESLint enforces both rules (`@typescript-eslint/no-restricted-imports` with `allowTypeImports: true` for the sibling pattern). Don't work around either.

Corollary: if an extension needs a capability the host doesn't yet expose, first ask **whether the host would have to own the surface that capability mutates** ([ADR-0012](docs/decisions/ADR-0012-service-extensions-vs-host-namespaces.md)).

- **Platform concern** (the host must own it — contributions, commands, keybindings, extension lookup, configuration, and later events/themes/i18n/storage): add it to `@gcscode/extension-api` first — as a new method under an existing `ExtensionHost` namespace (`host.commands.*`, `host.window.*`, `host.keybindings.*`, `host.extensions.*`, `host.configuration.*`), as a new namespace if the capability is cross-cutting, or as a new field on `ExtensionContext` where it is per-extension rather than shared — land that, then use it.
- **Domain concern** (about what gcscode controls or displays — maps, assets, live state, video): ship it as a **service extension**, not a host namespace. Its package exports the vocabulary types and the API; consumers `import type` from it and look up the live API via `host.extensions.getExtension<T>(id)?.exports`. A service extension exports types from its entry point, never its live registry.

Either way: never reach around the API.

## Extension shape

An extension module exports a named `const` of type `Extension` with `{ manifest: { id, displayName, version, description? }, activate(context) }`. The manifest carries declarative identity and presentation metadata; registration stays imperative. Inside `activate`, call `context.host.<namespace>.register*` (e.g. `context.host.window.registerView`, `context.host.commands.registerCommand`), each of which returns a `Disposable`, and push every disposable to `context.subscriptions`. Long-form contract: `packages/extension-api/README.md`. Manifest growth: [ADR-0007](docs/decisions/ADR-0007-extension-manifest.md).

## Conventions

- **Filenames:** kebab-case for everything, including `.svelte` components. Component import bindings stay PascalCase: `import ExampleView from './example-view.svelte'`.
- **Extension export name:** a named `const` matching the extension's slug (`exampleExtension`, `telemetryExtension`). Never `default`, never a generic `extension`.
- **Docs locations** (these override the superpowers skills' `docs/superpowers/` defaults): specs `docs/specs/YYYY-MM-DD-<topic>.md`, plans `docs/plans/YYYY-MM-DD-<topic>.md`, ADRs `docs/decisions/ADR-NNNN-<slug>.md`, architecture notes `docs/architecture/YYYY-MM-DD-<topic>.md` (indexed in its README). Before writing under `docs/`, read `.claude/rules/docs.md`: it loads by itself only when the session started in the same checkout as the file.
- **Svelte:** before Svelte work, read `.claude/rules/svelte.md` (it too loads by itself only in the checkout the session started in).
- **Scratch:** `scratch/` is for one-off exploration that shouldn't become real code. Gitignored.
- **Public repo:** commits, docs, PR bodies and reviews are world-readable. Use repo-relative paths, never a home-directory path, and no credentials or internal URLs.

## Tests

- Co-located `*.test.ts` next to the code they test.
- A new test counts only once it has been seen failing. Mutate each branch you changed, watch the specific test fail for the right reason, restore, and list the mutations — and any that survived — in the task report. A new test that passes on its first run is suspect.
- A test that compares two paths sharing the logic under test (`A(x) === B(x)` over one lookup) proves they agree, not that they are right. Give every value an absolute expected answer taken from the spec, ideally one the type system makes impossible to omit.

## Branching and merging

- Code goes on `feat/<topic>` branches, specs on `spec/<topic>`, ADRs on `adr/<slug>` (take the next free ADR number when you create the branch), all off master. Plans and architecture notes may land on master directly. An ADR needed in the middle of a feature ships as its own PR first.
- Open PRs as drafts, and push every commit before any reviewer is dispatched. Reviewing, fixing findings, merging and reporting: the `review-loop` skill (`../.claude/skills/review-loop/`). Who reviews: `../.claude/agent-config.json`.
- Executing a plan: `superpowers:subagent-driven-development`, one implementer per task, reviewed per the `review-loop` skill.
- Review fixes go in separate `Code-review-followup:` commits on the same branch. Never amend a pushed commit or squash: the review trail is part of the history.
- After a spec or ADR PR merges, implement it on a `feat/` branch. Only purely mechanical docs edits whose exact text the spec gives go straight to master; if you find yourself making a decision the spec didn't, use a branch.
- The owner merges. The `auto-merge` label hands it to `.github/workflows/auto-merge.yml`, whose header comment describes the gates; `test/*` branches stay manual.
- Never `--no-verify`. No force pushes to master, nor to a PR branch once it has reviews.

## Subagent worktree discipline

Work happens in a worktree under `.worktrees/` at the git root; the main checkout's branch is never switched. The Bash tool resets the working directory between calls, so in a worktree:

1. Prefix every command with `cd <worktree>/shell &&`.
2. Chain `git branch --show-current` before every `git commit`; if it reads `master`, stop — you are in the main checkout.
3. Run `pnpm format`, `pnpm test`, `pnpm check` and `pnpm lint` only with that prefix; otherwise they change or read the main checkout.

A dispatch that will commit in a worktree restates these three rules: the subagent cannot tell which worktree it is in. The controller session itself should run in the worktree (§ Sessions).

## Sessions

One controller session per PR or iteration. When the worktree already exists, start the session in its `shell/`: a session sees the path-scoped rules and skills of the checkout it started in, and that checkout's agent files as they were at start. A session that creates its worktree stays where it started, so it reads the rules explicitly (§ Conventions) and dispatches edited agent files inline (`review-loop` skill). Handoff notes live in the main checkout's `.claude/handoffs/` (gitignored), never a worktree's, which `git worktree remove` deletes; from any checkout that is `"$(git rev-parse --path-format=absolute --git-common-dir)/../.claude/handoffs/"`. Start from the latest note and end by writing one: state, decisions made, open items. When working unattended, don't ask questions: take the documented default and record it in the end-of-PR report. Stop and ask only before something irreversible.

## Commands

- `pnpm dev` — run the shell's dev server
- `pnpm build` — build all packages
- `pnpm test` — all package tests, then the repo scripts' tests (`pnpm test:scripts`)
- `pnpm check` — svelte-check + tsc across all packages
- `pnpm lint` — ESLint + Prettier
- `pnpm lint:docs` — links, anchors, leaked local paths and required headings in changed markdown
- `pnpm format` — Prettier write

## Where to look

- `docs/roadmap.md` — where we are and what's next. `docs/out-of-scope.md` — what is deliberately not built yet; check it before building anything new. `docs/vs-code-alignment.md` — the cumulative ledger of alignments with VS Code and divergences from it.
- `docs/decisions/` — ADRs. Read [ADR-0011](docs/decisions/ADR-0011-asset-vocabulary-and-registry.md) before adding any asset-facing type, and [ADR-0012](docs/decisions/ADR-0012-service-extensions-vs-host-namespaces.md) before adding a capability.
- `docs/architecture/` — dated notes on established patterns: background, not decisions.
- `packages/extension-api/README.md` and `packages/extension-example/README.md` — how to write an extension.
- `/housekeeping` (`.claude/commands/housekeeping.md`) — a drift sweep to run every 2–3 iterations, not during feature work.

# gcscode

A ground control station (GCS) for drones: a Svelte 5 app whose shell hosts extensions, modelled on VS Code's extension architecture. Every feature, first-party included, is an extension built against one public API.

## Layout

- `packages/` — gcscode itself: the shell (`packages/shell`), the extension API (`packages/extension-api`) and the extensions.
- `libs/` — generic libraries that are not gcscode itself: `dockview-svelte`, which the shell uses for its layout, and `map-gl-svelte`.
- `tools/` — what gcscode is developed and tested against: `tools/sitl` runs a simulated drone ([its README](tools/sitl/README.md)), and `tools/camera-sim` fakes its camera ([its README](tools/camera-sim/README.md)).
- `docs/` — the roadmap, specs, plans and architecture decisions.

## Running it

Needs Node 20.19+, 22.13+ or 24+ (the range Vite and ESLint accept), and pnpm 9. `pnpm test` also needs `python3` with its `venv` module, for the tests of `tools/sitl`.

```sh
pnpm install
pnpm dev
```

`pnpm test`, `pnpm check` and `pnpm lint` run the tests, type checks and linters across the workspace.

## More

- [`docs/roadmap.md`](docs/roadmap.md) — where the project is and what comes next.
- [`packages/extension-api/README.md`](packages/extension-api/README.md) — how to write an extension.
- [`CLAUDE.md`](CLAUDE.md) — the guide the coding agents work from, and the conventions the repo follows.

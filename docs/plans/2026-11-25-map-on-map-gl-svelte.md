# The map on `map-gl-svelte` — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the map's own view runs on `map-gl-svelte` inside `extension-map`, and no other package sees the library (GCS-113).

**Architecture:** `map-view.svelte` renders the library's `Map` with `MapApi.camera` as its controlled camera. Registered layers mount beside it, in a subtree of their own that alone sets the deprecated `gcscode.map.maplibre` context, from the library's ref. Controls mount in the corner slots as before, outside that subtree. ESLint forbids `map-gl-svelte` everywhere but `packages/extension-map`.

**Tech stack:** Svelte 5, MapLibre 5, `map-gl-svelte`, vitest (node and browser projects), ESLint flat config.

**Spec:** [`docs/specs/2026-11-25-map-on-map-gl-svelte.md`](../specs/2026-11-25-map-on-map-gl-svelte.md), Design § The migration PR.

## Global constraints

- **`MapApi`'s shape does not change** beyond the deprecation markers, the reworded manifest description and controls losing the context (spec Non-goals).
- **The flight overlay is not edited.** Its layers keep reading the context exactly as today.
- **Every new test is seen failing before it passes.** The task report lists each mutation and any that survived (`CLAUDE.md` § Tests).

## Decisions this plan adds

1. **The view's test runs real MapLibre in headless Chromium**, as the library's own tests do. The library drives MapLibre's camera transform (`transformCameraUpdate`), which no jsdom stand-in reproduces, so the old `FakeMap` test cannot carry over. `extension-map`'s vitest config gains a `browser` project for `map-view.test.ts`; every other test keeps the node environment. CI already installs Chromium for the library.
2. **The basemap URL moves to `basemap.ts`**, so the test swaps it for an empty style and never touches the network.
3. **Registered layers render before the library's `Map`** in the template. Siblings tear down in order, so each layer removes what it drew before the library destroys the map, which the P7 test checks at the moment of `map.remove()`.
4. **Layers mount ungated**, before the map exists, with the getter returning `null` until it does (spec Known unknowns, "Mount order"). The old view gated them on the map.
5. **The camera is controlled** (`longitude`, `latitude`, `zoom`, `pitch`, `bearing` from `MapApi.camera`; `onMove` writes it back). The library skips a camera write while MapLibre is moving and re-applies it on `moveend`, so a write never stops the operator's drag.
6. **The P7 tests use stand-in layers** in `src/test-fixtures/` that draw as the overlay's do (a `Marker`; a GeoJSON source and layer added on load). A test in `extension-map` cannot import the overlay (ADR-0005), and the overlay's own teardown code does not change in this PR.
7. **The lint guard covers the shell's allowlisted files too.** They may import extension packages, but not `map-gl-svelte`: a block of their own carries the one pattern.

## Review focus

1. **Camera in both directions**, especially a drag that no camera write stops and a write back to where the operator dragged from.
2. **Teardown order**: what the map still holds when it is destroyed, across 100 cycles of the map and of a layer extension.
3. **The lint guard keeps the rest of the boundary** in `extension-map` and in every other extension, since flat config replaces a rule's options wholesale.

## Task 1: the migration

- [ ] `map-view.svelte` on the library's `Map`, with `registered-layers.svelte` and `map-ready.svelte`; the start-up notice and logging.
- [ ] Controls no longer get the context; `registerLayer` and `MAPLIBRE_CONTEXT_KEY` marked `@deprecated`; the manifest description reworded.
- [ ] The lint guard and its tests in `eslint.config.test.mjs`.
- [ ] `map-view.test.ts` in the browser project.
- [ ] The README and the propagation edits the spec lists: `CLAUDE.md` § Layout, the roadmap's Libraries entry, `docs/out-of-scope.md`, `docs/vs-code-alignment.md`.

## Spec findings left for implementation

The final cross-cutting review verifies each.

- [ ] **Mount order without the library's context** (Known unknowns): the context stays a getter that returns `null` until the map exists, and the P7 tests cover a layer that mounts first.
- [ ] **Logging the start-up failure** (Known unknowns, PR #110 RT-15): a start-up failure shows the notice and is logged; a failed tile request on a running map is logged without one.
- [ ] **The library's private reads** (Known unknowns): recorded as the out-of-scope row "Keeping `map-gl-svelte` in step with react-maplibre".
- [ ] **The command's name** and **which set the set time names** (Known unknowns, PR #110 RT-14): GCS-62's, not this PR's.
- [ ] **Done when** (Design § The migration PR): each clause has a test, or for "behave as before" on the overlay's own layers, the stand-ins of decision 6.

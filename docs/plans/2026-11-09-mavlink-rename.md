# MAVLink rename — implementation plan

**Goal:** Rename `extension-sitl` to `extension-mavlink` and `extension-flight-overlay` to `extension-mavlink-flight-overlay`: the first of the four PRs that implement [ADR-0014](../decisions/ADR-0014-protocols-as-languages.md).

**Source:** the roadmap entry "Rename `extension-sitl` → `extension-mavlink`, …" in [`docs/roadmap.md`](../roadmap.md) and ADR-0014 Decision 3. There is no spec: the roadmap entry leaves one choice open, settled below.

---

## Decisions

1. **The ids are renamed too**, to `gcscode.mavlink` and `gcscode.mavlink-flight-overlay`, and so is every contribution id under them: the configuration key, the view, the command, and the map control, source and layer ids. The roadmap entry allowed keeping `gcscode.sitl` and `gcscode.flight-overlay` instead. That would leave the old name in every lookup and in the setting an operator edits, and it collides with the export-name convention: `packages/extension-api/README.md` defines an id as `<namespace>.<slug>` and the main export as a `const` named after that slug. Keeping `gcscode.sitl` means exporting `sitlExtension` from `extension-mavlink` or breaking the convention. Cost: the host has to move what it saved under the old ids (decision 2).
2. **The host moves saved state at startup.** A bundled entry lists the ids its extension was known by before, as `previousIds`. Before the registry or the disabled set reads storage, `main.ts` moves the disabled set's entry for each old id and every configuration key under `<old id>.` to the new id. A value already saved under the new id wins, and the old entry is removed either way, so an extension the operator re-enables stays enabled on the next start. Migration hooks for extensions stay out of scope ([`docs/out-of-scope.md`](../out-of-scope.md), "Settings schema migration hooks"): this is the host moving its own records.
3. **Operator-facing text follows the rename where it named the extension.** The display name `SITL Telemetry` becomes `MAVLink`, and the view title, its heading, the command category, the asset source label, vehicle status's prefix and the log lines follow. The overlay keeps the display name `Flight Overlay`: it is accurate for an operator, and the protocol in its package name is information for developers.
4. **What keeps the old words.** Mentions of the simulator itself (the SITL test data, the Canberra start point, the ArduPilot dialect in the adapter's comments). Dated records: specs, plans, ADRs, architecture notes, shipped roadmap entries and the handoffs, as after PR #42. The `'sitl'` source ids in `extension-assets`' and `extension-assets-demo`'s tests, which are arbitrary fixtures and not this extension's id; the `airframe` PR rewrites those tests.

## VS Code alignment

| Concern                                   | VS Code                                                                                                                                                                      | gcscode                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A renamed extension keeps its saved state | ✓ (moving a deprecated extension to its replacement, VS Code disables the replacement if the old one was disabled, and can move its storage: `migrateUnsupportedExtensions`) | ✓ (a bundled entry lists its `previousIds`; at startup the host moves the disabled-set entry and the configuration keys saved under each old id) |

VS Code has no equivalent of the configuration move because its setting keys are not tied to an extension's id; gcscode's must start with it. The row is copied into [`docs/vs-code-alignment.md`](../vs-code-alignment.md) in this PR.

## Tasks

### Task 1: the rename

- `git mv` both packages, rename `sitl-view.svelte` to `mavlink-view.svelte`, and update the package names, the dependents' `package.json` files and `pnpm-lock.yaml`.
- Rename the exports: `sitlExtension` → `mavlinkExtension`, `flightOverlayExtension` → `mavlinkFlightOverlayExtension`, `SitlExports` → `MavlinkExports`, and the consumers' `getSitlExports` / `sitlExports` helpers to match.
- Rename the ids and the contribution ids under them (decision 1), and the operator-facing text (decision 3).
- Update the documents that describe current code: `CLAUDE.md`, the package READMEs, `docs/out-of-scope.md`, `docs/vs-code-alignment.md`, and the open roadmap entries that name `SitlExports` or `gcscode.sitl`.

### Task 2: saved state follows the ids

- `previousIds` on `BundledExtensionEntry`, set to `gcscode.sitl` and `gcscode.flight-overlay` on the two entries.
- The migration: one function per store, beside the code that owns that store's format, and one entry point that `main.ts` calls first.
- Tests with literal expected values: each store moved, a value under the new id winning, keys that only share a prefix untouched, nothing written when nothing was saved, corrupt or unreadable storage left alone, a second run changing nothing, and the bundled list naming both old ids.
- Tick the roadmap entry.

## Checklist: review findings left for this PR

The final review verifies each.

- [ ] Both packages keep the `extension-` prefix the boundary rules in `eslint.config.ts` match on (PR #44 RT-1, EA-1). Checked with a probe: a runtime import of `@gcscode/extension-mavlink` from inside `packages/extension-mavlink-flight-overlay`, and one of either package from the shell outside the allowlist, each fail `pnpm lint`.
- [ ] Saved state under the old ids is migrated, not lost (PR #44 EA-8): the disabled set and configuration keys such as `gcscode.sitl.connectionUrl`.

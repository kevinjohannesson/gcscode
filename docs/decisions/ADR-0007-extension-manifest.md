# ADR-0007 — Extension manifest

**Status:** Accepted (2026-05-02)

## Context

[ADR-0003](ADR-0003-plugin-api-refinements.md) deferred a declarative `contributes` manifest, with an explicit trigger to revisit: "a settings UI that toggles individual contributions, **a marketplace preview**, or the first untrusted extension module." The marketplace preview is now imminent — the next iteration after this one is a "(crude) UI" that lets users enable / disable extensions, with marketplace-styled rows showing per-extension descriptions.

The marketplace UI cannot render descriptions without per-extension metadata that's not on `Extension` today. Three real choices were considered:

1. **B-lite** — add `description?: string` directly on `Extension`. Cements the existing "metadata as identity fields on the object" divergence (see [`docs/vs-code-alignment.md`](../vs-code-alignment.md)).
2. **B-manifest** — lift presentation metadata into a per-extension `ExtensionManifest` object. First taste of the deferred manifest, scoped to descriptive metadata only. Runtime registration stays imperative.
3. **B-full** — pull the full declarative `contributes` manifest forward (commands, views, keybindings as static arrays). Massive scope expansion; trigger language doesn't justify it.

This ADR records the choice of **B-manifest**.

There is also a reason this iteration is worth doing now even though only the marketplace UI consumes it. The alignment ledger's Divergences row "Extension shape" lists "Manifest deferral lands → re-evaluate" as its trigger. That re-evaluation has no other natural home; specs capture per-iteration snapshots, not cumulative reasoning. The ledger asked for an ADR; this is it.

## Decision

Adopt a per-extension `ExtensionManifest` declaration object. The new types in `@gcscode/extension-api`:

```ts
export interface ExtensionIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
}

export interface ExtensionManifest extends ExtensionIdentity {
  readonly description?: string;
}

export interface Extension {
  readonly manifest: ExtensionManifest;
  activate(context: ExtensionContext): unknown;
  deactivate?(): void | Promise<void>;
}
```

`Extension` no longer extends `ExtensionIdentity`; identity moves into `manifest`. `ExtensionContext.extension` keeps its type (`ExtensionIdentity`) — the host derives the context-side identity from `extension.manifest`. Extensions read their own identity via `context.extension.id` exactly as today.

**Field scope this iteration: `description?` only.** The manifest is a structured home — it earns its keep by being the place future declarative metadata lands without churning the `Extension` shape again. But adding fields speculatively is the same trap that ADR-0003 warned about. So this iteration adds `description?` (the marketplace UI's only consumer field) and nothing else.

**Iteration scope: presentation metadata only.** The manifest holds `id / displayName / version / description?` and grows with similar descriptive metadata as triggers fire. It does **not** grow into the `contributes` map (commands / views / keybindings as static arrays) — that's a separate concept with a separate trigger.

**Updated trigger language for the next manifest growth:** the "manifest deferral" trigger in the ledger and `out-of-scope.md` is replaced with sharper language. Going forward:

- For descriptive metadata growth (`category?`, `icon?`, `categories?`, etc.) → add per-field when a real consumer needs it.
- For declarative `contributes` arrays → trigger remains "first contribution-level toggle UI / first third-party producer-consumer pair / first untrusted extension module". Strictly narrower than "manifest deferral lands".

**Migration shape: hard break, no deprecation period.** Three first-party extensions plus the workbench built-in migrate in the same iteration. Deprecation cruft adds zero value with such a small consumer set. Mirrors the ADR-0006 migration pattern.

**Naming: `manifest`, not `metadata`.** VS Code's `package.json` is the "extension manifest"; the term is the most aligned. The internal field name on `Extension` is `manifest`.

**Internal name disambiguation: `extension-manifest.ts` → `bundled-extensions.ts`.** The pre-existing host-side file `packages/shell/src/extension-host/extension-manifest.ts` (the `bundledExtensions` array shipped in B4) is renamed to `bundled-extensions.ts` in the same iteration. The `ManifestEntry` type renames to `BundledExtensionEntry`. This frees the "manifest" term for the public per-extension manifest concept and removes a source of contributor confusion.

## Consequences

**Positive.**

- **Closes the alignment ledger's "Extension shape" re-evaluation trigger.** The Divergences row updates: gcscode now declares a structured manifest object (not flat identity fields), and the trigger to revisit shifts from "manifest deferral lands" to "first third-party / out-of-tree extension".
- **Establishes the manifest as a future-friendly home.** `category`, `icon`, `categories`, `engines` all have a clear destination when their triggers fire. No more growing the `Extension` shape itself.
- **Resolves naming ambiguity.** Two distinct concepts both called "manifest" (B4's host-side bundling list and the public per-extension declaration) collapse to one — only the public one keeps the name.
- **Sharper triggers for future growth.** Future contributors don't relitigate "manifest deferral" wholesale; they look at the specific field's trigger language and the "iteration scope: presentation metadata only" framing in this ADR.
- **Mostly VS Code-aligned in spirit.** A structured manifest with `id / displayName / version / description` mirrors the load-bearing fields of VS Code's `package.json`. The remaining shape divergence (TypeScript object literal vs JSON file) is a syntax / ergonomics call, not a load-bearing one.

**Negative.**

- **One-time migration churn.** Three first-party extensions, the workbench built-in, host code in `registry.ts` + `extension-manager.ts`, plus tests. All mechanical; no logic changes.
- **`ExtensionRecord` shape change ripples.** The `manager.listExtensions()` return shape moves from flat `{ id, displayName, version, enabled }` to nested `{ manifest, enabled }`. Has no current consumers (the marketplace UI is the upcoming first consumer) so the ripple is contained.
- **Two related types coexist.** `ExtensionIdentity` (read-only identity inside `ExtensionContext`) and `ExtensionManifest` (declaration shape) are related by `ExtensionManifest extends ExtensionIdentity`. The duplication earns its keep — the context-side type is the minimal surface extensions need to introspect themselves; the manifest is the declaration the package author fills in. Both names are useful in their own places.

## Alternatives considered

- **B-lite — `description?` directly on `Extension`** (option 1 above). Smallest diff; reinforces the existing identity-flat divergence in the ledger. Rejected: defers the same decision to the next iteration that adds `category?` or `icon?`, paying the migration cost twice.
- **Parallel exports** — each extension package exports `manifest: ExtensionManifest` and a separate runtime `Extension` with no internal reference. Closer to VS Code's "manifest in `package.json`, code in the module export" syntactically. Rejected: duplicates `id / displayName / version` across two values; the only buy is statically loading metadata without running `activate()`, which only matters under lazy activation (still deferred per ADR-0003).
- **Both shapes** — `Extension` keeps identity fields **and** gains an optional `manifest`. Rejected: two truths to keep in sync, and the field's optionality encodes ambiguity rather than resolving it.
- **B-full — pull `contributes.commands` / `contributes.views` / `contributes.keybindings` static arrays in this iteration.** Rejected: massive scope expansion; the trigger language for the contributes manifest is sharper than "manifest deferral lands" — it's specifically "settings UI per-contribution / first third-party producer-consumer pair / first untrusted module", none of which has fired.
- **Add `category?` and `icon?` in the same iteration as `description?`.** Rejected: speculative, no current consumer, and adding per-field as triggers fire is exactly the manifest's promise. The marketplace UI may pull `category?` next; it'll land then.

## Follow-ups

- ADR-0003's `## Decisions deferred` "Declarative `contributes`" entry — the trigger "a settings UI that toggles individual contributions, a marketplace preview, or the first untrusted extension module" partially fires here. ADR-0003's `## Follow-ups` section gains a pointer noting the partial resolution: the descriptive-metadata subset is now structured per ADR-0007, while the `contributes` arrays themselves remain deferred under sharpened trigger language.
- `docs/vs-code-alignment.md` Divergences row "Extension shape" — gcscode column updates to reflect the manifest. Trigger to revisit narrows from "Manifest deferral lands" to "first third-party / out-of-tree extension".
- `docs/out-of-scope.md` "Declarative `contributes` manifest" entry — trigger language tightens to "settings UI for individual contributions / first untrusted extension module / first third-party producer-consumer pair". The "marketplace preview" half of the prior trigger is removed (it fired here; the descriptive subset is shipped).
- Future descriptive-metadata fields (`category?`, `icon?`, `categories?`) — add per-field on `ExtensionManifest` when a consumer pulls on them. The marketplace UI may pull `category?` next.
- Future declarative `contributes` arrays — separate ADR if/when the sharper trigger fires. Will reference this one for the manifest's structure.
- The marketplace UI iteration that motivated this — its own brainstorm + spec + plan, separate from this iteration. Lands after this manifest iteration so it consumes the final manifest shape.

# ADR-0014: Protocols are like languages

**Date:** 2026-11-09
**Status:** Accepted
**Supersedes:** [ADR-0011 (Asset vocabulary and registry)](ADR-0011-asset-vocabulary-and-registry.md)

## Context

[ADR-0011](ADR-0011-asset-vocabulary-and-registry.md) gave gcscode its own model of what a vehicle is, and a live-state contract was to extend it to what one is doing. Such a model grows until the whole app speaks it, and its generic words replace the ones operators know, such as the vehicle's own flight mode.

VS Code met the same problem with languages. Its core knows no language: hover, completion and formatting are each a provider contract that a language fills in, and nothing models what code is.

## Decision

1. **The app knows no protocol, and neither does any generic feature.** The app is the shell and `@gcscode/extension-api`. MAVLink-only for now is fine.
2. **Each feature owns its contract, and protocols fill it in.** There is no gcscode-wide dictionary of vehicle facts. A feature publishes what it needs as a service extension ([ADR-0012](ADR-0012-service-extensions-vs-host-namespaces.md)), as VS Code's former Test Explorer UI extension published the Test Adapter API that Mocha and Python adapters filled in. Vehicle status's contract is first, filled by the MAVLink extension, and shows flight mode as the text supplied. The feature defines levels (the status light's colours) and actions ("return home"); the protocol picks the level and implements the action.
3. **Extensions built on one other extension are expected.** One tied to a protocol carries its name: `extension-flight-overlay` becomes `mavlink-flight-overlay` and may read the MAVLink extension's exports. A lint rule will let only extensions with `mavlink` in their name import it.
4. **`extension-assets` keeps identity only**, like a file path in VS Code: the name the asset card gives the map when it asks it to locate a vehicle. What stays of ADR-0011 is the registry of its Decisions 3 and 4, with `isLive` from [asset abstraction v0](../specs/2026-10-21-asset-abstraction-v0.md): per-source namespaces, opaque registry-minted keys, the source label as what renders. Its vocabulary and its two-source and type rules go. `airframe` leaves, for the map's contract once the map draws symbols.

## Consequences

- Work grows as protocols × features, as in VS Code. That is accepted.
- A vehicle reached through two sources shows up under two names, parked in [`docs/out-of-scope.md`](../out-of-scope.md) until a real second source exists.
- The live-state contract is dropped. STANAG was a placeholder for "not only MAVLink", and no second protocol is planned. The follow-up PRs are on [`docs/roadmap.md`](../roadmap.md).

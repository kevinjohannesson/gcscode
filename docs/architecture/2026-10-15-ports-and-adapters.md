# Ports and adapters, anti-corruption layers, and the GoF Adapter

- **Date:** 2026-10-15
- **Status:** informative, not normative. A snapshot of understanding on this date. It names patterns and maps them onto gcscode; it commits to nothing. Decisions live in specs and ADRs.
- **Origin:** brainstorm on what is now called the asset abstraction (first called a vehicle capability model). A companion note on capability APIs and their prior art is planned.

## Why this note exists

While brainstorming the asset abstraction, the code that translates MAVLink into gcscode's own vocabulary kept getting called "the adapter". That raised the question: _is that the Adapter pattern?_

Partly. Three established patterns overlap here, and they are easy to blur because two of them share the word "adapter". They differ in scale and in what they are about: calls, technology, or models.

## The three patterns

### Adapter (Gang of Four, 1994)

From _Design Patterns_ (Gamma, Helm, Johnson, Vlissides); a structural pattern.

- **Problem:** a client is written against one interface (the _target_), but the object you have (the _adaptee_) exposes a different one.
- **Shape:** the adapter implements the target interface, holds the adaptee, and translates each call.
- **What it is about:** _calls_. The client holds a reference to the adapter and invokes it. Object-level; the client initiates.

```ts
interface GimbalControl {
  // target: our vocabulary
  setPitch(degrees: number): Promise<void>;
}

class MavlinkGimbal implements GimbalControl {
  // adapter
  constructor(private readonly link: MavlinkLink) {} // adaptee
  setPitch(degrees: number) {
    return this.link.sendCommand('MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW', { pitch: degrees });
  }
}
```

### Ports and Adapters, a.k.a. Hexagonal Architecture (Cockburn, 2005)

From Alistair Cockburn's article "Hexagonal Architecture".

- **Problem:** application logic gets entangled with the technologies around it (UI, storage, devices, protocols), so it cannot be tested, reused, or reasoned about without them.
- **Shape:** the application core defines _ports_, which are interfaces in its own terms. _Adapters_ plug one specific technology into a port. The core never knows what is on the other side.
- **Driving vs driven:** driving (primary) adapters call into the application; driven (secondary) adapters are called by it. Devices blur this split: an asset such as a drone or a radar both initiates (heartbeats, telemetry) and gets commanded. In practice that means an inbound port for what it reports and, later, an outbound port for what it is told to do.
- **What it is about:** _technology isolation_, at system scale. Adapters may push or pull. The pattern constrains where the boundary is, not how calls flow across it.

This is where "adapter" in gcscode's vocabulary comes from.

### Anti-corruption layer (Evans, 2003)

From Eric Evans' _Domain-Driven Design_.

- **Problem:** integrating with a system whose model differs from yours. Without care, its concepts leak in and gradually reshape your model around someone else's assumptions.
- **Shape:** a translation layer at the boundary that converts between the two models. Evans describes it as typically built internally from facades, adapters and translators.
- **What it is about:** _models and vocabulary_. The question it answers: inside the boundary, whose words win? Ours.

## How they relate

|                | GoF Adapter                 | Ports and Adapters                 | Anti-corruption layer         |
| -------------- | --------------------------- | ---------------------------------- | ----------------------------- |
| Scale          | object                      | system architecture                | domain boundary               |
| Concerned with | interface mismatch in calls | isolating the core from technology | keeping a foreign model out   |
| Direction      | client calls adapter        | inbound and outbound               | both                          |
| Answers        | "how do I call this?"       | "where is the boundary?"           | "whose vocabulary is inside?" |

They nest rather than compete. Hexagonal architecture says _where_ the boundary is. The anti-corruption layer says _what_ crosses it: our model, never theirs. The GoF Adapter is one technique for implementing the crossing when the crossing is a call.

## Mapping onto gcscode (as of this date)

| Role                  | In gcscode                                                                                                                                     | Status                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Port                  | `AssetsApi` in a planned `extension-assets` (`registerAsset`, `getAssets`), typed in gcscode's own vocabulary (`AssetDescription`, `Airframe`) | brainstorm                     |
| Adapter               | `extension-sitl`, which in architectural terms is the MAVLink adapter                                                                          | exists; not yet using the port |
| Anti-corruption layer | translations such as `toAirframe(mavType)`: `MAV_TYPE` stops at the adapter, and inside only `Airframe` exists                                 | brainstorm                     |
| GoF Adapter           | none yet; appears once commands exist (consumer → assets service → registering adapter → MAVLink command)                                      | future                         |

Observations:

- **The boundary rule already enforces half of the hexagon.** ESLint forbids runtime imports between extension packages, so a consumer can never call into an adapter's code directly. Type-only imports from siblings are allowed ([ADR-0005](../decisions/ADR-0005-extension-boundaries.md)), so a consumer _can_ still couple to an adapter's types. Keeping consumers on the port's types is convention, not enforcement.
- **Telemetry has no port yet.** `extension-vehicle-status`, `extension-flight-overlay` and `extension-map-demo` read SITL's `telemetry` export (`SitlExports`) directly, so for telemetry the consumers talk to the adapter. This is known and deliberate; the assets port would be the first adapter-neutral contract.
- **A partial anti-corruption layer already exists.** `telemetry-store.svelte.ts` translates ArduCopter's numeric `custom_mode` through `ARDUCOPTER_MODES`, so firmware mode numbers stop at the adapter. The resulting names (`GUIDED`, `RTL`) are still ArduCopter vocabulary, though, so the firmware's model leaks through in its words, if not its numbers. MAVLink's standard modes protocol is the established fix on the wire side.
- **The anti-corruption layer has a mechanical test.** MAVLink identifiers (`MAV_TYPE_*`, message names) should appear only inside adapter packages. That is checkable by lint or grep. It is not in place.

## Same role, other names

The adapter role recurs throughout the prior art surveyed in the capability-API brainstorm, under different names:

| System                     | Name for the adapter role                                   |
| -------------------------- | ----------------------------------------------------------- |
| STANAG 4586                | Vehicle Specific Module (VSM)                               |
| QGroundControl             | FirmwarePlugin                                              |
| Home Assistant             | integration                                                 |
| ROS `capabilities` package | capability provider                                         |
| VS Code                    | extensions registering providers into host-owned registries |

## Open questions (as of this date)

- **Commands:** when commands arrive, do they route through the assets port to whichever adapter registered the asset, or does each capability (gimbal, camera) get its own port?
- **Naming:** `extension-sitl` is named after the test setup, but its architectural role is "MAVLink adapter", and it would serve a real drone just as well. Rename it, or keep the name?
  _Direction (2026-10-15): rename to reflect the adapter role (e.g. `extension-mavlink`), after v0._
- **Telemetry:** its own port, or part of the assets port?
  _Direction (2026-10-15): its own port, separate from asset descriptions, after v0._
- **Enforcement:** should "foreign identifiers only inside adapters" become a lint rule?

## References

- Gamma, Helm, Johnson, Vlissides. _Design Patterns: Elements of Reusable Object-Oriented Software_ (1994), "Adapter".
- Alistair Cockburn. "Hexagonal Architecture" (2005).
- Eric Evans. _Domain-Driven Design: Tackling Complexity in the Heart of Software_ (2003), "Anti-Corruption Layer".
- [ADR-0005: extension boundaries](../decisions/ADR-0005-extension-boundaries.md)

/**
 * Teardown across the extension boundary — spec cases 31–33.
 *
 * The first test in this iteration that wires the real pieces together: the
 * real host registry and manager, the real `@gcscode/extension-assets`
 * service, and the real `@gcscode/extension-sitl` adapter. Every earlier test
 * in the iteration is within one package, because the boundary rule forbids an
 * extension package from importing a sibling at runtime — the shell is the one
 * package allowed to, so this is the only place the boundary itself can be
 * exercised. `app.test.ts` is the in-repo precedent for the shape: real
 * registry, real manager, real extensions, fixtures only where a fixture is
 * the subject.
 *
 * Heartbeats arrive through the extension's own message path — a stubbed
 * global `WebSocket`, the seam `mavlink-client.test.ts` and `index.test.ts`
 * already use. Nothing here reaches into `extension-sitl`'s internals, and no
 * production export exists for the benefit of this file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Extension, ExtensionHost, ViewContribution } from '@gcscode/extension-api';
import { assetsExtension, type AssetsApi, type RegisteredAsset } from '@gcscode/extension-assets';
import { sitlExtension } from '@gcscode/extension-sitl';

import { createExtensionManager, type ExtensionManager } from './extension-manager';
import { createRegistry } from './registry';

// ---------------------------------------------------------------------------
// MockWebSocket — a third variant of the two in `extension-sitl`'s tests, and
// local on purpose. That package's header note ("if a third test file ever
// needs a WebSocket mock, extracting a shared helper becomes the right call")
// was written about a third file inside that package. Sharing it across the
// package boundary would mean either exporting a test double from
// `@gcscode/extension-sitl`'s entry point — production API added for a test —
// or a new workspace package to hold twenty lines. Both cost more than the
// copy.
//
// `close()` auto-fires `onclose` synchronously, matching `index.test.ts`'s
// variant: `registry.deactivate` awaits the extension's `deactivate` hook,
// which awaits `client.close()`, so a mock that left the close pending would
// hang the disable step the teardown cases are about.
// ---------------------------------------------------------------------------

const mockInstances: MockWebSocket[] = [];

class MockWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: ((ev: { type: string }) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: { type: string }) => void) | null = null;
  onclose: ((ev: { type: string; code?: number; reason?: string }) => void) | null = null;
  closeArgs: { code?: number; reason?: string } | null = null;

  constructor(url: string) {
    this.url = url;
    mockInstances.push(this);
  }

  close(code?: number, reason?: string) {
    this.closeArgs = { code, reason };
    this.readyState = 3; // CLOSED
    this.onclose?.({ type: 'close', code, reason });
  }
}

/** The socket the most recent `activate` opened. */
function lastMock(): MockWebSocket {
  const mock = mockInstances[mockInstances.length - 1];
  if (!mock) throw new Error('No MockWebSocket instance was constructed');
  return mock;
}

/**
 * Deliver one frame the way mavlink2rest does. The handler is required rather
 * than optional-called: a test that asserts "nothing was registered" after
 * delivering a frame has to fail if the frame was never delivered at all, and
 * `onmessage?.(…)` would make that failure invisible.
 */
function deliver(frame: unknown): void {
  const socket = lastMock();
  if (socket.onmessage === null) {
    throw new Error('The mock socket has no message handler; nothing would receive this frame.');
  }
  socket.onmessage({ data: JSON.stringify(frame) });
}

/** The live frame, measured 2026-10-21 against mavlink2rest. The same literal
 *  as `extension-sitl`'s own tests carry — `mavtype` is a nested object, which
 *  is the shape no fixture would have guessed. */
const HEARTBEAT_FRAME = {
  header: { system_id: 1, component_id: 1, sequence: 166 },
  message: {
    type: 'HEARTBEAT',
    mavtype: { type: 'MAV_TYPE_QUADROTOR' },
    autopilot: { type: 'MAV_AUTOPILOT_ARDUPILOTMEGA' },
    base_mode: 'MAV_MODE_FLAG_CUSTOM_MODE_ENABLED',
    custom_mode: 4,
    system_status: { type: 'MAV_STATE_STANDBY' },
    mavlink_version: 3,
  },
};

/** Never rendered here — these cases are about the registry, not the view.
 *  Same stand-in `registry.test.ts` uses. */
const fakeComponent = {} as ViewContribution['component'];

const SITL_ASSET = {
  localId: '1',
  airframe: { kind: 'multirotor' },
  sourceId: 'gcscode.sitl',
  sourceLabel: 'SITL',
  // Opaque by decision (case 9): its existence and stability are asserted,
  // never its format.
  key: expect.any(String),
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * A stand-in consumer whose only job is to hand the test the same
 * `ExtensionHost` facade an extension gets, so the assets service is resolved
 * the way `extension-assets-demo` resolves it — per read, through the host's
 * own lookup — rather than through a shell-internal back door. It contributes
 * nothing and never throws.
 */
function makeHostProbe(): { extension: Extension; host: () => ExtensionHost } {
  let captured: ExtensionHost | undefined;
  return {
    extension: {
      manifest: { id: 'test.host-probe', displayName: 'Host probe', version: '0.0.0' },
      activate(context) {
        captured = context.host;
      },
    },
    host: () => {
      if (captured === undefined) throw new Error('The host probe never activated.');
      return captured;
    },
  };
}

function resolveAssets(host: ExtensionHost): AssetsApi {
  const api = host.extensions.getExtension<AssetsApi>('gcscode.assets')?.exports;
  if (api === undefined) throw new Error('The assets service is not active.');
  return api;
}

/** Only what the MAVLink adapter asserted, so a case about *its* assets cannot
 *  be satisfied — or broken — by another source's. */
function sitlAssets(api: AssetsApi): readonly RegisteredAsset[] {
  return api.getAssets().filter((asset) => asset.sourceId === 'gcscode.sitl');
}

function failureMessageOf(manager: ExtensionManager, id: string): string | undefined {
  return manager.listExtensions().find((record) => record.manifest.id === id)?.failure?.message;
}

/**
 * Register everything through the manager, in the order given, with
 * `console.error` silenced — a contained activation failure reports itself
 * there, and a deliberate failure should not read as a broken test run (the
 * convention `app.test.ts` and `bootstrap.test.ts` already follow).
 */
function wire(extensions: readonly Extension[]): { manager: ExtensionManager } {
  const manager = createExtensionManager(createRegistry());
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const extension of extensions) manager.register(extension);
  } finally {
    consoleErrorSpy.mockRestore();
  }
  return { manager };
}

/** A second asserting source, so "removes *its* assets" is a scoped claim. */
function makeBystanderSource(): Extension {
  return {
    manifest: { id: 'test.bystander', displayName: 'Bystander', version: '0.0.0' },
    activate(context) {
      const source = resolveAssets(context.host).createSource('test.bystander', 'Bystander');
      context.subscriptions.push(source);
      source.registerAsset({ localId: 'b1' });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('teardown across the adapter boundary', () => {
  beforeEach(() => {
    mockInstances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(async () => {
    // Both extensions hold module-level state that outlives a host registry:
    // `extension-sitl`'s WebSocket client and `extension-assets`' registry.
    // Tearing both down keeps a test that left one active from leaking an open
    // socket, or a live registry, into the next.
    await sitlExtension.deactivate?.();
    assetsExtension.deactivate?.();
    vi.unstubAllGlobals();
  });

  // Case 31.
  it("removes the adapter's assets when the adapter is disabled, and leaves another source's alone", async () => {
    const probe = makeHostProbe();
    const { manager } = wire([
      probe.extension,
      assetsExtension,
      sitlExtension,
      makeBystanderSource(),
    ]);
    const api = resolveAssets(probe.host());

    deliver(HEARTBEAT_FRAME);

    // Proven present FIRST. Without this the assertion after the disable would
    // hold just as well against an adapter that never registered anything —
    // which is exactly what dropping `assetAdapter.onMessage(json)` from the
    // extension's message path produces.
    expect(sitlAssets(api)).toEqual([SITL_ASSET]);

    await manager.setEnabled('gcscode.sitl', false);

    expect(sitlAssets(api)).toEqual([]);
    // Scoped: the service is still live and the bystander's asset is
    // untouched. One extension being disabled is not a registry teardown.
    expect(api.getAssets().map((asset) => asset.localId)).toEqual(['b1']);
  });

  // Case 32, first half: what was already registered is gone.
  //
  // A fixture adapter rather than `sitlExtension`, because the real adapter
  // cannot reach the state this case describes: it claims lazily on an inbound
  // frame, and no frame can arrive synchronously inside `activate`. Every
  // eager claimant can reach it, which is the shape the spec's wording
  // describes and the shape a future adapter that claims from configuration
  // would have. What is real here is everything the claim passes through: the
  // host's containment, `context.subscriptions`, and the registry.
  it('leaves no assets when an adapter throws after claiming its source', () => {
    const probe = makeHostProbe();
    let heldAtThrow: readonly RegisteredAsset[] = [];
    const eagerAdapter: Extension = {
      manifest: { id: 'test.eager-adapter', displayName: 'Eager adapter', version: '0.0.0' },
      activate(context) {
        const api = resolveAssets(context.host);
        const source = api.createSource('test.eager', 'Eager');
        context.subscriptions.push(source);
        source.registerAsset({ localId: '9' });
        // Containment unwinds synchronously inside `manager.register`, so the
        // test only ever sees the aftermath. This is the one observation point
        // for "it was there first", and `getAssets()` returning a snapshot
        // (case 10) is what lets it survive the removal that follows.
        heldAtThrow = api.getAssets();
        throw new Error('boom');
      },
    };

    const { manager } = wire([probe.extension, assetsExtension, eagerAdapter]);
    const api = resolveAssets(probe.host());

    expect(heldAtThrow.map((asset) => asset.localId)).toEqual(['9']);
    expect(failureMessageOf(manager, 'test.eager-adapter')).toBe('boom');
    expect(api.getAssets()).toEqual([]);
  });

  // Case 32, second half, and the one that protects task 5's decision: the
  // real extension, a real host error, and the frames that keep arriving
  // afterwards. Containment disposes `context.subscriptions` but never calls
  // `deactivate`, so nothing closes the socket — an adapter that re-claimed on
  // the next heartbeat would re-register about a second later whatever
  // containment had just removed.
  it('registers nothing on the heartbeats that keep arriving after the real adapter fails to activate', () => {
    const probe = makeHostProbe();
    // Owns the view id `extension-sitl` registers. A genuine host guard then
    // fails sitl's real `activate` — at the step after its adapter was pushed
    // to `subscriptions` and after its socket was opened, which is what makes
    // this the failed-activation-with-a-live-socket case rather than a
    // failure before any of it ran.
    const viewSquatter: Extension = {
      manifest: { id: 'test.view-squatter', displayName: 'View squatter', version: '0.0.0' },
      activate(context) {
        context.subscriptions.push(
          context.host.window.registerView({
            id: 'gcscode.sitl.location',
            component: fakeComponent,
            title: 'Squatter',
          }),
        );
      },
    };

    const { manager } = wire([probe.extension, assetsExtension, viewSquatter, sitlExtension]);
    const api = resolveAssets(probe.host());

    expect(failureMessageOf(manager, 'gcscode.sitl')).toMatch(/is already registered/);
    // The premise the terminal disposal rests on, asserted rather than
    // assumed: nothing closed this socket. A future containment that also ran
    // `deactivate` would surface here instead of silently making the case
    // below unreachable.
    expect(lastMock().closeArgs).toBeNull();

    deliver(HEARTBEAT_FRAME);
    deliver(HEARTBEAT_FRAME);

    expect(api.getAssets()).toEqual([]);
  });

  // Case 33. The tension with case 32 is the point: disposal is terminal
  // *within* one activation, while a fresh `activate` builds a fresh adapter.
  it('re-claims and re-registers when the adapter is re-enabled', async () => {
    const probe = makeHostProbe();
    const { manager } = wire([probe.extension, assetsExtension, sitlExtension]);
    const api = resolveAssets(probe.host());

    deliver(HEARTBEAT_FRAME);
    const before = sitlAssets(api);
    expect(before).toEqual([SITL_ASSET]);

    await manager.setEnabled('gcscode.sitl', false);
    // Not decoration: without this, everything below would hold for an asset
    // the disable failed to remove, and the case would pass for the opposite
    // of the reason it exists.
    expect(api.getAssets()).toEqual([]);
    // The id is claimable again — what "released" means, observed from the
    // outside. Claimed and released immediately so the re-enabled adapter can
    // take it.
    api.createSource('gcscode.sitl', 'interim').dispose();

    await manager.setEnabled('gcscode.sitl', true);
    // The re-enabled extension opened its own socket, so the frame below goes
    // to the new activation rather than to the closed one `lastMock()` would
    // otherwise still be pointing at.
    expect(mockInstances).toHaveLength(2);
    deliver(HEARTBEAT_FRAME);

    const after = sitlAssets(api);
    expect(after).toEqual([SITL_ASSET]);
    // A fresh registration, not a survivor: a different entry object, and the
    // source id is claimed again rather than still free.
    expect(after[0]).not.toBe(before[0]);
    expect(() => api.createSource('gcscode.sitl', 'interim')).toThrow(/already claimed/);
  });
});

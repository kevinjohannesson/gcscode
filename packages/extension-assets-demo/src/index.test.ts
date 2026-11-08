import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost, StatusBarItemContribution } from '@gcscode/extension-api';
import type { Airframe, AssetsApi, RegisteredAsset } from '@gcscode/extension-assets';

import AssetsStatusItem from './assets-status-item.svelte';
import { assetsDemoExtension, getAssetsApi } from './index';

/** The registry double's own write verb, standing in for what an adapter does
 *  through an `AssetSource`. The real handle cannot be constructed here (see
 *  `makeFakeRegistry`), and a consumer would never hold one anyway. */
interface FakeRegistry extends AssetsApi {
  register(asset: { localId: string; sourceLabel: string; airframe?: Airframe }): void;
}

/**
 * A stand-in for `@gcscode/extension-assets`' registry. This package may only
 * `import type` from a sibling extension package (ADR-0005, enforced by
 * ESLint), so the real class cannot be constructed here — the double mirrors
 * the four behaviours the consumer actually depends on, and the real class's
 * own reactivity is covered in its own package:
 *
 * - entries live in a `SvelteMap`, which is what makes a read inside `$derived`
 *   re-run when the registry changes;
 * - `airframe` is **absent** rather than `undefined` when nobody asserted one,
 *   so the component cannot pass case 28 by accident;
 * - re-registering a `localId` reuses the asset's `key` and replaces the entry
 *   with a **fresh object**, which is what bumps that key's own signal;
 * - `key` is registry-minted and opaque.
 */
function makeFakeRegistry(): FakeRegistry {
  const entries = new SvelteMap<string, RegisteredAsset>();
  // A plain Map on purpose: a localId -> key index, never read in a reactive
  // context, exactly as the real registry keeps it.
  const keysByLocalId = new Map<string, string>();
  let nextKey = 1;

  return {
    createSource() {
      // A consumer never claims a source. Throwing beats returning something
      // plausible: if the component ever starts writing, this says so.
      throw new Error('a consumer must not call createSource');
    },
    getAssets: () => [...entries.values()],
    register({ localId, sourceLabel, airframe }) {
      const key = keysByLocalId.get(localId) ?? `asset-${nextKey++}`;
      keysByLocalId.set(localId, key);
      entries.set(key, {
        localId,
        ...(airframe === undefined ? {} : { airframe }),
        // A comparison token the consumer never renders — `sourceLabel` is the
        // operator-facing name (ADR-0011), so one fixed value is enough here.
        sourceId: 'test.source',
        sourceLabel,
        key,
      });
    },
  };
}

/**
 * `exports` is a `SvelteMap` keyed by extension id, mirroring the host's own
 * `exportsByExtension`: that is what makes "has the service appeared yet"
 * reactive, which is the second of the two boundary crossings the spec's
 * reactivity-as-contract term rests on. `getExtension` returns a freshly
 * built record per call with only `.exports` stable, as the real host does.
 */
function makeFakeHost(opts?: {
  exports?: SvelteMap<string, unknown>;
  registerStatusBarItem?: ExtensionHost['window']['registerStatusBarItem'];
}): ExtensionHost {
  const exports = opts?.exports ?? new SvelteMap<string, unknown>();
  return {
    window: {
      registerView: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      registerStatusBarItem:
        opts?.registerStatusBarItem ?? vi.fn(() => ({ dispose: () => {} }) as Disposable),
      showQuickPick: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      executeCommand: vi.fn(() => Promise.resolve()) as ExtensionHost['commands']['executeCommand'],
    },
    keybindings: {
      registerKeybinding: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    },
    extensions: {
      getExtension: <T>(id: string) => {
        const published = exports.get(id);
        return published === undefined ? undefined : { id, exports: published as T };
      },
    },
    configuration: {
      registerConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
        has: vi.fn().mockReturnValue(false),
        inspect: vi.fn().mockReturnValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
  };
}

function activate(host: ExtensionHost, subscriptions: Disposable[] = []): void {
  assetsDemoExtension.activate({
    host,
    subscriptions,
    extension: {
      id: assetsDemoExtension.manifest.id,
      displayName: assetsDemoExtension.manifest.displayName,
      version: assetsDemoExtension.manifest.version,
    },
  });
}

/** One live registry already holding `assets`, published under the id the
 *  consumer looks up. Returns both halves so a test can keep writing. */
function withRegistry(assets: Parameters<FakeRegistry['register']>[0][]): {
  registry: FakeRegistry;
  exports: SvelteMap<string, unknown>;
} {
  const registry = makeFakeRegistry();
  for (const asset of assets) registry.register(asset);
  return { registry, exports: new SvelteMap<string, unknown>([['gcscode.assets', registry]]) };
}

/** The rendered labels, in order. `{#each}` leaves comment anchors in the
 *  container, so the spans are read rather than the container's text. */
function labels(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('span')].map((span) => span.textContent);
}

afterEach(() => {
  // Clears the module-level host, so a later render cannot read a host a
  // previous test built.
  assetsDemoExtension.deactivate?.();
});

describe('assetsDemoExtension', () => {
  it('has the expected manifest', () => {
    expect(assetsDemoExtension.manifest.id).toBe('gcscode.assets-demo');
    expect(assetsDemoExtension.manifest.displayName).toBe('Assets (demo)');
    expect(assetsDemoExtension.manifest.version).toBe('0.0.0');
    expect(assetsDemoExtension.manifest.description).toContain('Throwaway');
  });

  it('activate registers exactly one status bar item and pushes one disposable', () => {
    const captured: StatusBarItemContribution[] = [];
    const registerStatusBarItem = vi.fn((item: StatusBarItemContribution) => {
      captured.push(item);
      return { dispose: () => {} } as Disposable;
    });
    const subscriptions: Disposable[] = [];

    activate(makeFakeHost({ registerStatusBarItem }), subscriptions);

    expect(registerStatusBarItem).toHaveBeenCalledTimes(1);
    expect(captured[0].id).toBe('gcscode.assets-demo.summary');
    expect(captured[0].alignment).toBe('left');
    expect(captured[0].component).toBe(AssetsStatusItem);
    expect(subscriptions).toHaveLength(1);
  });

  it('activate claims no asset source — a consumer only reads', () => {
    const { registry, exports } = withRegistry([]);
    const createSource = vi.spyOn(registry, 'createSource');

    activate(makeFakeHost({ exports }));

    expect(createSource).not.toHaveBeenCalled();
  });

  it('getAssetsApi resolves through the host, and deactivate drops it', () => {
    const { registry, exports } = withRegistry([]);
    activate(makeFakeHost({ exports }));

    expect(getAssetsApi()).toBe(registry);

    assetsDemoExtension.deactivate?.();
    expect(getAssetsApi()).toBeUndefined();
  });
});

describe('AssetsStatusItem', () => {
  // Case 28. Two sources in one list, because a consumer reads the registry
  // rather than the sources: nothing here knows how many there are, or that
  // one of them speaks MAVLink.
  it('renders sourceLabel · airframe for each registered asset', () => {
    const { exports } = withRegistry([
      { localId: '17', sourceLabel: 'SITL', airframe: { kind: 'multirotor' } },
      { localId: '249', sourceLabel: 'Radar', airframe: { kind: 'fixed-wing' } },
    ]);
    activate(makeFakeHost({ exports }));

    const { container } = render(AssetsStatusItem);

    expect(labels(container)).toEqual(['SITL · multirotor', 'Radar · fixed-wing']);
    expect(screen.getByText('Radar · fixed-wing')).toBeDefined();
    // `localId` is opaque to consumers (ADR-0011) — a per-source address, not
    // a domain fact. Neither of these two reaches the label.
    expect(container.textContent).not.toContain('17');
    expect(container.textContent).not.toContain('249');
  });

  // Case 28, the half that matters: absent means nobody asserted an airframe,
  // `unknown` means the adapter saw something gcscode cannot name. Collapsing
  // them discards the distinction the vocabulary rests on.
  it('renders an absent airframe distinguishably from an asserted unknown', () => {
    const { exports } = withRegistry([
      { localId: '1', sourceLabel: 'SITL' },
      { localId: '2', sourceLabel: 'SITL', airframe: { kind: 'unknown' } },
    ]);
    activate(makeFakeHost({ exports }));

    const { container } = render(AssetsStatusItem);

    expect(labels(container)).toEqual(['SITL · —', 'SITL · unknown']);
  });

  // Case 29 — the contract term. A component that resolved the service at
  // activate() and cached `getAssets()` renders the empty list forever.
  it('updates when an asset is registered after mount, with no event and no remount', () => {
    const { registry, exports } = withRegistry([]);
    activate(makeFakeHost({ exports }));

    const { container } = render(AssetsStatusItem);
    expect(labels(container)).toEqual([]);

    registry.register({ localId: '7', sourceLabel: 'SITL', airframe: { kind: 'fixed-wing' } });
    flushSync();

    expect(labels(container)).toEqual(['SITL · fixed-wing']);
  });

  // Case 29's other reactivity path. Registering a `localId` the source
  // already holds replaces the entry in place rather than adding one, so the
  // update arrives via that key's own signal instead of the map's version —
  // a different mechanism, and the one a vehicle changing MAV_TYPE exercises.
  it('updates in place when a registered asset changes airframe', () => {
    const { registry, exports } = withRegistry([
      { localId: '1', sourceLabel: 'SITL', airframe: { kind: 'unknown' } },
    ]);
    activate(makeFakeHost({ exports }));

    const { container } = render(AssetsStatusItem);
    expect(labels(container)).toEqual(['SITL · unknown']);
    const spanBefore = container.querySelector('span');

    registry.register({ localId: '1', sourceLabel: 'SITL', airframe: { kind: 'vtol' } });
    flushSync();

    expect(labels(container)).toEqual(['SITL · vtol']);
    // The same element, updated — the `{#each}` is keyed on the registry's
    // `key`, which a replacement preserves. Keying on anything derived from
    // the description would tear the element down and rebuild it instead.
    expect(container.querySelector('span')).toBe(spanBefore);
  });

  it('renders nothing when the assets service is absent', () => {
    activate(makeFakeHost());

    const { container } = render(AssetsStatusItem);

    expect(labels(container)).toEqual([]);
    expect(container.textContent).toBe('');
  });

  it('renders nothing when the consumer has not activated, so no host is known', () => {
    // Explicit rather than relying on the afterEach hook having run first.
    assetsDemoExtension.deactivate?.();

    const { container } = render(AssetsStatusItem);

    expect(labels(container)).toEqual([]);
  });

  // The second boundary crossing: the host's exports map is a SvelteMap too,
  // so "has the service appeared yet" is reactive. This is what lets the
  // bundling order stay a comment rather than a constraint.
  it('picks up the assets service when it activates after the consumer mounted', () => {
    const exports = new SvelteMap<string, unknown>();
    activate(makeFakeHost({ exports }));

    const { container } = render(AssetsStatusItem);
    expect(labels(container)).toEqual([]);

    const registry = makeFakeRegistry();
    registry.register({ localId: '1', sourceLabel: 'SITL', airframe: { kind: 'multirotor' } });
    exports.set('gcscode.assets', registry);
    flushSync();

    expect(labels(container)).toEqual(['SITL · multirotor']);
  });
});

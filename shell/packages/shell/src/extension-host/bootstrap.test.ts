import { describe, expect, it, vi } from 'vitest';

import type { Extension, ExtensionContext } from '@gcscode/extension-api';

import { bootstrap } from './bootstrap';
import { createExtensionManager } from './extension-manager';
import { createRegistry } from './registry';

const manifest = (id: string) => ({ id, displayName: id, version: '0.0.0' });

/**
 * Registers one command named after the extension, so "did it activate?" is
 * answerable from `registry.listCommands()`. `onActivate` records call order.
 */
function workingExtension(id: string, onActivate?: (id: string) => void): Extension {
  return {
    manifest: manifest(id),
    activate: (context: ExtensionContext) => {
      onActivate?.(id);
      context.host.commands.registerCommand({ id: `${id}.cmd`, run: () => undefined });
    },
  };
}

/**
 * Registers its command *before* throwing, so the assertion that nothing of a
 * failed extension survives boot is not vacuous.
 */
function failingExtension(id: string, message: string): Extension {
  return {
    manifest: manifest(id),
    activate: (context: ExtensionContext) => {
      context.host.commands.registerCommand({ id: `${id}.cmd`, run: () => undefined });
      throw new Error(message);
    },
  };
}

const alwaysEnabled = { isInitiallyEnabled: () => true };

describe('bootstrap', () => {
  it('returns normally when one extension throws, and activates the rest', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    // The manager reports the failure through `console.error`; silence it so a
    // deliberate failure does not read as a broken test run.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(() =>
        bootstrap({
          manager,
          persistence: alwaysEnabled,
          extensions: [
            { id: 'x.bad', extension: failingExtension('x.bad', 'nope') },
            { id: 'x.good', extension: workingExtension('x.good') },
          ],
        }),
      ).not.toThrow();
    } finally {
      consoleErrorSpy.mockRestore();
    }

    // The failed extension left nothing behind and the one after it still ran,
    // which is the halt this iteration exists to prevent.
    expect(registry.listCommands().map((c) => c.id)).toEqual(['x.good.cmd']);
    const bad = manager.listExtensions().find((r) => r.manifest.id === 'x.bad');
    expect(bad).toBeDefined();
    expect(bad?.failure?.message).toContain('nope');
  });

  it('contains a failing built-in and still activates the bundled extensions', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(() =>
        bootstrap({
          manager,
          persistence: alwaysEnabled,
          extensions: [{ id: 'x.good', extension: workingExtension('x.good') }],
          builtIns: [failingExtension('built-in.bad', 'built-in nope')],
        }),
      ).not.toThrow();
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(registry.listCommands().map((c) => c.id)).toEqual(['x.good.cmd']);
    const builtIn = manager.listExtensions().find((r) => r.manifest.id === 'built-in.bad');
    expect(builtIn).toBeDefined();
    expect(builtIn?.failure?.message).toContain('built-in nope');
    expect(builtIn?.enabled).toBe(true);
  });

  it('activates built-ins first, then bundled extensions in insertion order', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const order: string[] = [];
    const record = (id: string) => order.push(id);

    bootstrap({
      manager,
      persistence: alwaysEnabled,
      extensions: [
        { id: 'x.first', extension: workingExtension('x.first', record) },
        { id: 'x.second', extension: workingExtension('x.second', record) },
        { id: 'x.third', extension: workingExtension('x.third', record) },
      ],
      builtIns: [workingExtension('built-in', record)],
    });

    // Insertion order is the only cross-extension activation guarantee
    // (ADR-0005), and `bundled-extensions.ts` leans on it: vehicle-status and
    // map-demo read SITL's exports, flight-overlay reads map's. `bootstrap` is
    // now the only thing that honours that order, so assert it here.
    //
    // That the order is complete by the time `bootstrap` returns is the other
    // half: `main.ts` attaches the keybinding dispatcher and mounts afterwards,
    // so no activation may be deferred past the return.
    expect(order).toEqual(['built-in', 'x.first', 'x.second', 'x.third']);
  });

  it('honours persistence for the initial enabled state', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const persistence = { isInitiallyEnabled: (id: string) => id !== 'x.off' };

    bootstrap({
      manager,
      persistence,
      extensions: [{ id: 'x.off', extension: failingExtension('x.off', 'must not run') }],
    });

    // A disabled extension is registered but never activated, so there is no
    // failure to record — the throw above would have produced one.
    expect(manager.listExtensions()[0].enabled).toBe(false);
    expect(manager.listExtensions()[0].failure).toBeUndefined();
  });

  it("passes each entry's initialEnabled as the persistence fallback, and leaves built-ins out of it", () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const asked: Array<[string, boolean]> = [];
    const persistence = {
      isInitiallyEnabled: (id: string, fallback: boolean) => {
        asked.push([id, fallback]);
        return fallback;
      },
    };

    bootstrap({
      manager,
      persistence,
      extensions: [
        { id: 'x.default', extension: workingExtension('x.default') },
        { id: 'x.off', extension: workingExtension('x.off'), initialEnabled: false },
      ],
      builtIns: [workingExtension('built-in')],
    });

    // Built-ins are always enabled and not tracked in persistence, so the
    // built-in must not appear here.
    expect(asked).toEqual([
      ['x.default', true],
      ['x.off', false],
    ]);
    expect(registry.listCommands().map((c) => c.id)).toEqual(['built-in.cmd', 'x.default.cmd']);
  });
});

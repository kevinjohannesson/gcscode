import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Plugin, PluginContext } from '@gcscode/plugin-api';

import { createRegistry } from './plugin-host/registry';
import { parseKey, matchesKey, attachKeybindingDispatcher } from './keybinding-dispatcher';

function plugin(id: string, activate: (context: PluginContext) => void): Plugin {
  return { id, displayName: id, version: '0.0.0', activate };
}

describe('parseKey', () => {
  it('parses a single key', () => {
    expect(parseKey('g')).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      key: 'g',
    });
  });

  it('parses a single modifier + key', () => {
    expect(parseKey('Ctrl+G')).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
      key: 'g',
    });
  });

  it('parses multiple modifiers + key', () => {
    expect(parseKey('Ctrl+Shift+Alt+Meta+G')).toEqual({
      ctrl: true,
      shift: true,
      alt: true,
      meta: true,
      key: 'g',
    });
  });

  it('is case-insensitive on modifiers and key', () => {
    expect(parseKey('CTRL+shift+G')).toEqual(parseKey('Ctrl+Shift+g'));
  });

  it('accepts Cmd and Command as aliases for Meta', () => {
    expect(parseKey('Cmd+G').meta).toBe(true);
    expect(parseKey('Command+G').meta).toBe(true);
  });

  it('accepts Control as an alias for Ctrl', () => {
    expect(parseKey('Control+G').ctrl).toBe(true);
  });

  it('throws on input with no non-modifier key', () => {
    expect(() => parseKey('Ctrl+Shift')).toThrow(/no non-modifier key/);
  });

  it('throws on input with multiple non-modifier keys', () => {
    expect(() => parseKey('g+h')).toThrow(/more than one non-modifier key/);
  });
});

describe('matchesKey', () => {
  function event(init: KeyboardEventInit): KeyboardEvent {
    return new KeyboardEvent('keydown', init);
  }

  it('returns true when modifiers and key match', () => {
    const parsed = parseKey('Ctrl+Shift+G');
    expect(matchesKey(event({ key: 'G', ctrlKey: true, shiftKey: true }), parsed)).toBe(true);
  });

  it('returns false when a modifier mismatches', () => {
    const parsed = parseKey('Ctrl+Shift+G');
    expect(matchesKey(event({ key: 'G', ctrlKey: true, shiftKey: false }), parsed)).toBe(false);
  });

  it('returns false when the key mismatches', () => {
    const parsed = parseKey('Ctrl+G');
    expect(matchesKey(event({ key: 'h', ctrlKey: true }), parsed)).toBe(false);
  });

  it('case-insensitive match on the key portion', () => {
    const parsed = parseKey('Ctrl+G');
    expect(matchesKey(event({ key: 'G', ctrlKey: true }), parsed)).toBe(true);
    expect(matchesKey(event({ key: 'g', ctrlKey: true }), parsed)).toBe(true);
  });
});

describe('attachKeybindingDispatcher', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns a Disposable whose dispose() removes the listener', () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.cmd', run });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.cmd' });
      }),
    );

    const disposable = attachKeybindingDispatcher(registry, target);
    expect(typeof disposable.dispose).toBe('function');
    disposable.dispose();

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    expect(run).not.toHaveBeenCalled();
  });

  it('fires the command when a registered keybinding matches the keydown event', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.cmd', run });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    const event = new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, cancelable: true });
    target.dispatchEvent(event);
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('calls preventDefault on a matched event', () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.cmd', run: () => undefined });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    const event = new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, cancelable: true });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing when no keybinding matches the keydown event', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.cmd', run });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true }));
    await Promise.resolve();

    expect(run).not.toHaveBeenCalled();
  });

  it('first registration with a matching key wins', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const runFirst = vi.fn();
    const runSecond = vi.fn();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.first', run: runFirst });
        ctx.host.registerCommand({ id: 'plugin.a.second', run: runSecond });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.first' });
        ctx.host.registerKeybinding({ key: 'Ctrl+H', command: 'plugin.a.second' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    await Promise.resolve();

    expect(runFirst).toHaveBeenCalledTimes(1);
    expect(runSecond).not.toHaveBeenCalled();
  });

  it('does not throw out of the keydown handler when the bound command is not registered (sync throw caught)', () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.does-not-exist' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    expect(() =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true })),
    ).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('logs and does not throw when the bound command rejects asynchronously', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'plugin.a.async-boom',
          run: () => Promise.reject(new Error('async-boom')),
        });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.async-boom' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    // Flush enough microtasks to settle the chain:
    //   Promise.resolve().then(() => Promise.reject(...)) needs ~4 ticks for
    //   the rejection to propagate through thenable adoption to our .catch.
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

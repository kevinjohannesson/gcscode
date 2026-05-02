import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Extension, ExtensionContext } from '@gcscode/extension-api';

import { createRegistry } from './extension-host/registry';
import { parseKey, matchesKey, attachKeybindingDispatcher } from './keybinding-dispatcher';
import { modalState } from './modal-state.svelte';

function extension(id: string, activate: (context: ExtensionContext) => void): Extension {
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

  it('throws on empty input', () => {
    expect(() => parseKey('')).toThrow(/empty token|no non-modifier key/);
  });

  it('throws on empty token from a stray "+" (e.g. "Ctrl++G")', () => {
    expect(() => parseKey('Ctrl++G')).toThrow(/empty token/);
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

  it('matches multi-character named keys (Enter, ArrowLeft, Escape)', () => {
    expect(matchesKey(event({ key: 'Enter' }), parseKey('Enter'))).toBe(true);
    expect(matchesKey(event({ key: 'ArrowLeft' }), parseKey('ArrowLeft'))).toBe(true);
    expect(matchesKey(event({ key: 'Escape', ctrlKey: true }), parseKey('Ctrl+Escape'))).toBe(true);
  });

  it('falls back to event.code for letter keys when event.key is mangled (macOS Alt/layout)', () => {
    // Reproduces: macOS Option+Shift+G yields key='˝' but code='KeyG'.
    const parsed = parseKey('Alt+Shift+G');
    expect(
      matchesKey(event({ key: '˝', code: 'KeyG', altKey: true, shiftKey: true }), parsed),
    ).toBe(true);
  });

  it('falls back to event.code for letter keys under Ctrl when event.key is mangled', () => {
    // Reproduces user's report: Ctrl+Shift+G on their Mac yields key='Ì' but code='KeyG'.
    const parsed = parseKey('Ctrl+Shift+G');
    expect(
      matchesKey(event({ key: 'Ì', code: 'KeyG', ctrlKey: true, shiftKey: true }), parsed),
    ).toBe(true);
  });

  it('falls back to event.code for digit keys when event.key is mangled', () => {
    const parsed = parseKey('Alt+1');
    expect(matchesKey(event({ key: '¡', code: 'Digit1', altKey: true }), parsed)).toBe(true);
  });

  it('does not fall back when event.code points at a different physical key', () => {
    // event.key is 'q' (no match for 'g') and code='KeyH' (not 'KeyG') — must not match.
    const parsed = parseKey('g');
    expect(matchesKey(event({ key: 'q', code: 'KeyH' }), parsed)).toBe(false);
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
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.cmd' });
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
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.cmd' });
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
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run: () => undefined });
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.cmd' });
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
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true }));
    await Promise.resolve();

    expect(run).not.toHaveBeenCalled();
  });

  it('only the keybinding whose key matches the event fires (other registrations are skipped)', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const runFirst = vi.fn();
    const runSecond = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.first', run: runFirst });
        ctx.host.commands.registerCommand({ id: 'ext.a.second', run: runSecond });
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.first' });
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+H', command: 'ext.a.second' });
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
      extension('ext.a', (ctx) => {
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.does-not-exist' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    expect(() =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true })),
    ).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('logs a parse error and continues iterating subsequent keybindings', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run });
        // First keybinding has a malformed key (empty token from a stray "+");
        // dispatcher should log and continue, then match the second one.
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl++G', command: 'ext.a.cmd' });
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+H', command: 'ext.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true }));
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalled(); // logged the parse failure
    expect(run).toHaveBeenCalledTimes(1); // and still fired the well-formed match
  });

  it('logs and does not throw when the bound command rejects asynchronously', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({
          id: 'ext.a.async-boom',
          run: () => Promise.reject(new Error('async-boom')),
        });
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.async-boom' });
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

describe('modal-pause hook', () => {
  afterEach(() => {
    modalState.active = false;
  });

  it('does not fire a matching command when modalState.active is true', () => {
    const registry = createRegistry();
    const run = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.keybindings.registerKeybinding({
          key: 'Ctrl+Shift+G',
          command: 'ext.a.cmd',
        });
      }),
    );
    const target = document.createElement('div');
    attachKeybindingDispatcher(registry, target);

    modalState.active = true;
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'g',
        code: 'KeyG',
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('resumes firing when modalState.active flips back to false', async () => {
    const registry = createRegistry();
    const run = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.keybindings.registerKeybinding({
          key: 'Ctrl+Shift+G',
          command: 'ext.a.cmd',
        });
      }),
    );
    const target = document.createElement('div');
    attachKeybindingDispatcher(registry, target);

    modalState.active = true;
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'g',
        code: 'KeyG',
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(run).not.toHaveBeenCalled();

    modalState.active = false;
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'g',
        code: 'KeyG',
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

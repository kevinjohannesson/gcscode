import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ConfigurationTarget } from '@gcscode/extension-api';

import { writeConfigurationBlob, loadConfigurationBlob } from './persistence';

import { ConfigurationStore } from './configuration-store.svelte';

function makeStorage(): Storage {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    key: (i) => Object.keys(data)[i] ?? null,
    get length() {
      return Object.keys(data).length;
    },
  } as Storage;
}

describe('ConfigurationStore.registerConfiguration', () => {
  let store: ConfigurationStore;

  beforeEach(() => {
    store = new ConfigurationStore(makeStorage());
  });

  it('accepts a valid registration', () => {
    expect(() =>
      store.registerConfiguration(
        {
          key: 'ext.a.foo',
          schema: { type: 'string' },
          default: 'hello',
        },
        'ext.a',
      ),
    ).not.toThrow();
  });

  it('throws when the key does not start with the extension id followed by a dot', () => {
    expect(() =>
      store.registerConfiguration(
        { key: 'other.foo', schema: { type: 'string' }, default: 'x' },
        'ext.a',
      ),
    ).toThrow(/must start with "ext\.a\."/);
  });

  it('throws when the same key is registered twice', () => {
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'x' },
      'ext.a',
    );
    expect(() =>
      store.registerConfiguration(
        { key: 'ext.a.foo', schema: { type: 'string' }, default: 'y' },
        'ext.a',
      ),
    ).toThrow(/already registered/);
  });

  it('throws when the default value violates the schema', () => {
    expect(() =>
      store.registerConfiguration(
        { key: 'ext.a.foo', schema: { type: 'string' }, default: 42 },
        'ext.a',
      ),
    ).toThrow(/default for "ext\.a\.foo"/);
  });

  it('accepts a registration with no default', () => {
    expect(() =>
      store.registerConfiguration({ key: 'ext.a.foo', schema: { type: 'string' } }, 'ext.a'),
    ).not.toThrow();
  });

  it('supports ajv-formats (uri format passes on a valid ws:// url)', () => {
    expect(() =>
      store.registerConfiguration(
        {
          key: 'ext.a.url',
          schema: { type: 'string', format: 'uri' },
          default: 'ws://localhost:8088/v1/ws/mavlink',
        },
        'ext.a',
      ),
    ).not.toThrow();
  });
});

describe('ConfigurationStore.update (via WorkspaceConfiguration)', () => {
  let storage: Storage;
  let store: ConfigurationStore;

  beforeEach(() => {
    storage = makeStorage();
    store = new ConfigurationStore(storage);
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
  });

  it('update resolves and the new value is readable via get()', async () => {
    const cfg = store.getConfiguration('ext.a');
    await cfg.update('foo', 'world');
    expect(cfg.get<string>('foo')).toBe('world');
  });

  it('update persists the value to localStorage via read-modify-write', async () => {
    // Pre-populate an orphan key to verify RMW preserves it.
    writeConfigurationBlob(storage, { 'orphan.key': 'still-here' });

    const cfg = store.getConfiguration('ext.a');
    await cfg.update('foo', 'world');

    expect(loadConfigurationBlob(storage)).toEqual({
      'orphan.key': 'still-here',
      'ext.a.foo': 'world',
    });
  });

  it('update rejects when no schema is registered for the key', async () => {
    const cfg = store.getConfiguration();
    await expect(cfg.update('unknown.key', 'x')).rejects.toThrow(/No schema registered/);
  });

  it('update rejects when the value violates the schema', async () => {
    const cfg = store.getConfiguration('ext.a');
    await expect(cfg.update('foo', 42)).rejects.toThrow(/does not match schema/);
  });

  it('update rejects (Promise rejection, not sync throw) on ConfigurationTarget.Workspace', async () => {
    const cfg = store.getConfiguration('ext.a');
    const result = cfg.update('foo', 'world', ConfigurationTarget.Workspace);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow(/Target not supported in v1/);
  });

  it('update rejects (Promise rejection) on ConfigurationTarget.WorkspaceFolder', async () => {
    const cfg = store.getConfiguration('ext.a');
    await expect(cfg.update('foo', 'world', ConfigurationTarget.WorkspaceFolder)).rejects.toThrow(
      /Target not supported in v1/,
    );
  });

  it('listener-before-persist ordering: listeners observe new value before persistence resolves', async () => {
    const cfg = store.getConfiguration('ext.a');
    const observedDuringListener: string[] = [];

    store.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ext.a.foo')) {
        observedDuringListener.push(cfg.get<string>('foo', '') as string);
      }
    });

    await cfg.update('foo', 'world');
    expect(observedDuringListener).toEqual(['world']);
  });

  it('update rejects with Persistence failed when storage.setItem throws; in-memory commit stays', async () => {
    const failingStorage = {
      ...storage,
      getItem: (k: string) => storage.getItem(k),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as Storage;

    const s2 = new ConfigurationStore(failingStorage);
    s2.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    const cfg = s2.getConfiguration('ext.a');
    await expect(cfg.update('foo', 'world')).rejects.toThrow(/Persistence failed/);
    // In-memory commit stays (per the documented ordering).
    expect(cfg.get<string>('foo')).toBe('world');
  });
});

describe('ConfigurationStore boot + re-validation', () => {
  it('a persisted value matching the schema is exposed via get() after registration', () => {
    const storage = makeStorage();
    writeConfigurationBlob(storage, { 'ext.a.foo': 'previously-set' });
    const store = new ConfigurationStore(storage);
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBe('previously-set');
  });

  it('a persisted value violating the schema is dropped + console.warn fires; get() returns default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage();
    writeConfigurationBlob(storage, { 'ext.a.foo': 42 });
    const store = new ConfigurationStore(storage);
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBe('hello');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/ext\.a\.foo.*violates schema/);
    // Bad value stays in localStorage (deliberate — re-validation succeeds if schema loosens).
    expect(loadConfigurationBlob(storage)).toEqual({ 'ext.a.foo': 42 });
    warn.mockRestore();
  });

  it('Disposable.dispose() removes the schema AND clears the in-memory value', () => {
    const storage = makeStorage();
    writeConfigurationBlob(storage, { 'ext.a.foo': 'preset' });
    const store = new ConfigurationStore(storage);
    const d = store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBe('preset');

    d.dispose();
    // After dispose: no schema → get() with no defaultValue arg returns undefined.
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBeUndefined();
    // The persisted blob is unchanged — re-registration recovers it.
    expect(loadConfigurationBlob(storage)).toEqual({ 'ext.a.foo': 'preset' });

    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBe('preset');
  });
});

describe('ConfigurationStore.onDidChangeConfiguration', () => {
  let store: ConfigurationStore;

  beforeEach(() => {
    store = new ConfigurationStore(makeStorage());
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    store.registerConfiguration(
      { key: 'ext.b.bar', schema: { type: 'number' }, default: 0 },
      'ext.b',
    );
  });

  it('does not fire during registerConfiguration', () => {
    const listener = vi.fn();
    store.onDidChangeConfiguration(listener);
    store.registerConfiguration(
      { key: 'ext.a.baz', schema: { type: 'string' }, default: 'x' },
      'ext.a',
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires once per update() call (no coalescing)', async () => {
    const listener = vi.fn();
    store.onDidChangeConfiguration(listener);
    await store.getConfiguration('ext.a').update('foo', '1');
    await store.getConfiguration('ext.a').update('foo', '2');
    await store.getConfiguration('ext.a').update('foo', '3');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('affectsConfiguration returns true for exact key match', async () => {
    const events: boolean[] = [];
    store.onDidChangeConfiguration((e) => {
      events.push(e.affectsConfiguration('ext.a.foo'));
    });
    await store.getConfiguration('ext.a').update('foo', 'x');
    expect(events).toEqual([true]);
  });

  it('affectsConfiguration returns true for prefix-match', async () => {
    const events: boolean[] = [];
    store.onDidChangeConfiguration((e) => {
      events.push(e.affectsConfiguration('ext.a'));
    });
    await store.getConfiguration('ext.a').update('foo', 'x');
    expect(events).toEqual([true]);
  });

  it('affectsConfiguration returns false for unrelated section', async () => {
    const events: boolean[] = [];
    store.onDidChangeConfiguration((e) => {
      events.push(e.affectsConfiguration('ext.b'));
    });
    await store.getConfiguration('ext.a').update('foo', 'x');
    expect(events).toEqual([false]);
  });

  it('Disposable.dispose() unsubscribes the listener', async () => {
    const listener = vi.fn();
    const d = store.onDidChangeConfiguration(listener);
    await store.getConfiguration('ext.a').update('foo', '1');
    d.dispose();
    await store.getConfiguration('ext.a').update('foo', '2');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

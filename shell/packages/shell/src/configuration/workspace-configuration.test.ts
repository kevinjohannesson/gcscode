import { describe, it, expect, beforeEach } from 'vitest';

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

describe('WorkspaceConfiguration (via ConfigurationStore.getConfiguration)', () => {
  let store: ConfigurationStore;

  beforeEach(() => {
    store = new ConfigurationStore(makeStorage());
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    store.registerConfiguration(
      { key: 'ext.a.count', schema: { type: 'number' }, default: 0 },
      'ext.a',
    );
  });

  it('get returns the schema default when no value has been written', () => {
    const cfg = store.getConfiguration('ext.a');
    expect(cfg.get<string>('foo')).toBe('hello');
    expect(cfg.get<number>('count')).toBe(0);
  });

  it('get with no section reads the full key', () => {
    const cfg = store.getConfiguration();
    expect(cfg.get<string>('ext.a.foo')).toBe('hello');
  });

  it('get with a defaultValue arg falls back when the key is unregistered', () => {
    const cfg = store.getConfiguration();
    expect(cfg.get<string>('unknown.key')).toBeUndefined();
    expect(cfg.get<string>('unknown.key', 'fallback')).toBe('fallback');
  });

  it('has returns true only when a value is persisted in the in-memory map', () => {
    const cfg = store.getConfiguration('ext.a');
    // No persisted value yet; schema-default-only.
    expect(cfg.has('foo')).toBe(false);
  });

  it('inspect returns { key, defaultValue, globalValue } for a registered key', () => {
    const cfg = store.getConfiguration();
    expect(cfg.inspect('ext.a.foo')).toEqual({
      key: 'ext.a.foo',
      defaultValue: 'hello',
      globalValue: undefined,
    });
  });

  it('inspect returns undefined for an unregistered key', () => {
    const cfg = store.getConfiguration();
    expect(cfg.inspect('unknown.key')).toBeUndefined();
  });
});

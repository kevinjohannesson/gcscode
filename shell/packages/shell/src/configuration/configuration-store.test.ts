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

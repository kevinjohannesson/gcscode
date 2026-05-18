import { describe, it, expect, vi } from 'vitest';

import { loadConfigurationBlob, writeConfigurationBlob, STORAGE_KEY } from './persistence';

function makeStorage(initial: Record<string, string> = {}): Storage {
  const data: Record<string, string> = { ...initial };
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

describe('persistence', () => {
  it('loadConfigurationBlob returns an empty object when storage is empty', () => {
    expect(loadConfigurationBlob(makeStorage())).toEqual({});
  });

  it('loadConfigurationBlob returns the parsed blob when storage has valid JSON', () => {
    const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ 'a.b': 1, 'c.d': 'two' }) });
    expect(loadConfigurationBlob(storage)).toEqual({ 'a.b': 1, 'c.d': 'two' });
  });

  it('loadConfigurationBlob returns an empty object on corrupted JSON and logs a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage({ [STORAGE_KEY]: '{not json' });
    expect(loadConfigurationBlob(storage)).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('loadConfigurationBlob returns an empty object when storage.getItem throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('storage disabled');
      },
    } as unknown as Storage;
    expect(loadConfigurationBlob(broken)).toEqual({});
  });

  it('writeConfigurationBlob round-trips through loadConfigurationBlob', () => {
    const storage = makeStorage();
    writeConfigurationBlob(storage, { 'a.b': 1, 'c.d': true });
    expect(loadConfigurationBlob(storage)).toEqual({ 'a.b': 1, 'c.d': true });
  });

  it('writeConfigurationBlob throws when storage.setItem throws', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;
    expect(() => writeConfigurationBlob(broken, { 'a.b': 1 })).toThrow(/QuotaExceededError/);
  });
});

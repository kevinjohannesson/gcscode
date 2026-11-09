import { describe, it, expect, vi } from 'vitest';

import {
  loadConfigurationBlob,
  moveConfigurationSection,
  writeConfigurationBlob,
  STORAGE_KEY,
} from './persistence';

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

describe('moveConfigurationSection', () => {
  const saved = (blob: Record<string, unknown>) =>
    makeStorage({ [STORAGE_KEY]: JSON.stringify(blob) });

  it('moves every key under the old section to the new one', () => {
    const storage = saved({
      'ext.old.url': 'ws://vehicle.test:8088',
      'ext.old.nested.depth': 3,
      'ext.other.flag': true,
    });

    moveConfigurationSection(storage, 'ext.old', 'ext.new');

    expect(loadConfigurationBlob(storage)).toEqual({
      'ext.new.url': 'ws://vehicle.test:8088',
      'ext.new.nested.depth': 3,
      'ext.other.flag': true,
    });
  });

  it('keeps a value already saved under the new key and drops the old one', () => {
    const storage = saved({ 'ext.old.url': 'ws://old.test', 'ext.new.url': 'ws://new.test' });

    moveConfigurationSection(storage, 'ext.old', 'ext.new');

    expect(loadConfigurationBlob(storage)).toEqual({ 'ext.new.url': 'ws://new.test' });
  });

  it('leaves keys that only start with the old id, without its dot', () => {
    const raw = JSON.stringify({ 'ext.oldish.url': 1, 'ext.old': 2 });
    const storage = makeStorage({ [STORAGE_KEY]: raw });
    const setItem = vi.spyOn(storage, 'setItem');

    moveConfigurationSection(storage, 'ext.old', 'ext.new');

    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('writes nothing when nothing is saved', () => {
    const storage = makeStorage();
    moveConfigurationSection(storage, 'ext.old', 'ext.new');
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('leaves a corrupted blob as it is', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage({ [STORAGE_KEY]: '{not json' });

    moveConfigurationSection(storage, 'ext.old', 'ext.new');

    expect(storage.getItem(STORAGE_KEY)).toBe('{not json');
    warn.mockRestore();
  });

  it('does not throw when the write fails, and the old keys stay', () => {
    const raw = JSON.stringify({ 'ext.old.url': 'ws://vehicle.test:8088' });
    const storage = makeStorage({ [STORAGE_KEY]: raw });
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    expect(() => moveConfigurationSection(storage, 'ext.old', 'ext.new')).not.toThrow();
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });
});

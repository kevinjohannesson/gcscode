import { describe, expect, it, vi } from 'vitest';

import { ConfigurationStore } from '../configuration/configuration-store.svelte';
import { STORAGE_KEY as CONFIGURATION_KEY } from '../configuration/persistence';
import { createExtensionPersistence } from './extension-persistence';
import { moveSavedStateFromPreviousIds } from './previous-ids';

const DISABLED_KEY = 'gcscode.extensions.disabled';

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

function savedUnderOldId(): Storage {
  return makeStorage({
    [DISABLED_KEY]: JSON.stringify(['ext.old']),
    [CONFIGURATION_KEY]: JSON.stringify({ 'ext.old.url': 'ws://vehicle.test:8088' }),
  });
}

describe('moveSavedStateFromPreviousIds', () => {
  it('gives the stores what was saved under the old id, under the new one', () => {
    const storage = savedUnderOldId();

    moveSavedStateFromPreviousIds([{ id: 'ext.new', previousIds: ['ext.old'] }], storage);

    expect(createExtensionPersistence(storage).isInitiallyEnabled('ext.new', true)).toBe(false);
    const store = new ConfigurationStore(storage);
    store.registerConfiguration(
      { key: 'ext.new.url', schema: { type: 'string' }, default: 'ws://localhost:8088' },
      'ext.new',
    );
    expect(store.getConfiguration('ext.new').get('url')).toBe('ws://vehicle.test:8088');
  });

  it('changes nothing when it runs a second time', () => {
    const storage = savedUnderOldId();
    const entries = [{ id: 'ext.new', previousIds: ['ext.old'] }];
    moveSavedStateFromPreviousIds(entries, storage);
    const afterFirst = [storage.getItem(DISABLED_KEY), storage.getItem(CONFIGURATION_KEY)];

    moveSavedStateFromPreviousIds(entries, storage);

    expect([storage.getItem(DISABLED_KEY), storage.getItem(CONFIGURATION_KEY)]).toEqual(afterFirst);
    expect(afterFirst).toEqual([
      JSON.stringify(['ext.new']),
      JSON.stringify({ 'ext.new.url': 'ws://vehicle.test:8088' }),
    ]);
  });

  it("leaves saved state alone when a previous id is some entry's current id", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = savedUnderOldId();

    moveSavedStateFromPreviousIds(
      [{ id: 'ext.old' }, { id: 'ext.new', previousIds: ['ext.old'] }],
      storage,
    );

    expect(storage.getItem(DISABLED_KEY)).toBe(JSON.stringify(['ext.old']));
    expect(storage.getItem(CONFIGURATION_KEY)).toBe(
      JSON.stringify({ 'ext.old.url': 'ws://vehicle.test:8088' }),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

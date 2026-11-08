import { beforeEach, describe, expect, it } from 'vitest';

import { createExtensionPersistence } from './extension-persistence';

// MemoryStorage: in-memory implementation of the Storage interface for tests.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  failNextRead = false;
  failOnWrite = false;

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  getItem(key: string): string | null {
    if (this.failNextRead) {
      this.failNextRead = false;
      throw new Error('SecurityError: storage access denied');
    }
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failOnWrite) {
      throw new Error('QuotaExceededError: storage quota exceeded');
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const STORAGE_KEY = 'gcscode.extensions.disabled';

describe('createExtensionPersistence', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('empty storage: isInitiallyEnabled returns fallback value', () => {
    const persistence = createExtensionPersistence(storage);
    expect(persistence.isInitiallyEnabled('ext.a', true)).toBe(true);
    expect(persistence.isInitiallyEnabled('ext.a', false)).toBe(false);
  });

  it('populated storage with ["ext.a"]: ext.a returns false, ext.b returns fallback', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(['ext.a']));
    const persistence = createExtensionPersistence(storage);
    expect(persistence.isInitiallyEnabled('ext.a', true)).toBe(false);
    expect(persistence.isInitiallyEnabled('ext.b', true)).toBe(true);
  });

  it('recordEnabledChange(id, false) writes the id to storage', () => {
    const persistence = createExtensionPersistence(storage);
    persistence.recordEnabledChange('ext.a', false);
    const raw = storage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed: unknown = JSON.parse(raw!);
    expect(parsed).toEqual(['ext.a']);
  });

  it('recordEnabledChange(id, true) after a prior disable removes the id from storage', () => {
    const persistence = createExtensionPersistence(storage);
    persistence.recordEnabledChange('ext.a', false);
    persistence.recordEnabledChange('ext.a', true);
    const raw = storage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed: unknown = JSON.parse(raw!);
    expect(parsed).toEqual([]);
    expect(persistence.isInitiallyEnabled('ext.a', true)).toBe(true);
  });

  it('recordEnabledChange(id, true) on never-disabled is a no-op', () => {
    const persistence = createExtensionPersistence(storage);
    expect(() => persistence.recordEnabledChange('ext.a', true)).not.toThrow();
    // Storage key should still contain an empty array (or the entry was already absent)
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      expect(Array.isArray(parsed) && (parsed as string[]).includes('ext.a')).toBe(false);
    }
  });

  it('malformed JSON in storage: fallback to empty disabled set, no throw', () => {
    storage.setItem(STORAGE_KEY, 'not-valid-json{{');
    let persistence: ReturnType<typeof createExtensionPersistence> | undefined;
    expect(() => {
      persistence = createExtensionPersistence(storage);
    }).not.toThrow();
    expect(persistence!.isInitiallyEnabled('ext.a', true)).toBe(true);
  });

  it('storage getItem throws: fallback to empty, no throw', () => {
    storage.failNextRead = true;
    let persistence: ReturnType<typeof createExtensionPersistence> | undefined;
    expect(() => {
      persistence = createExtensionPersistence(storage);
    }).not.toThrow();
    expect(persistence!.isInitiallyEnabled('ext.a', true)).toBe(true);
  });

  it('storage setItem throws: no throw; in-memory state consistent for subsequent reads', () => {
    const persistence = createExtensionPersistence(storage);
    storage.failOnWrite = true;
    expect(() => persistence.recordEnabledChange('ext.a', false)).not.toThrow();
    // In-memory state should still reflect the disable even if storage write failed
    expect(persistence.isInitiallyEnabled('ext.a', true)).toBe(false);
  });
});

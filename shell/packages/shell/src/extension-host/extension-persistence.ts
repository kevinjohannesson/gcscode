const STORAGE_KEY = 'gcscode.extensions.disabled';

export interface ExtensionPersistence {
  isInitiallyEnabled(id: string, fallback: boolean): boolean;
  recordEnabledChange(id: string, enabled: boolean): void;
}

export function createExtensionPersistence(storage: Storage = localStorage): ExtensionPersistence {
  const disabled = new Set<string>(loadDisabled(storage));

  return {
    isInitiallyEnabled(id, fallback) {
      if (disabled.has(id)) return false;
      return fallback;
    },
    recordEnabledChange(id, enabled) {
      if (enabled) disabled.delete(id);
      else disabled.add(id);
      saveDisabled(storage, disabled);
    },
  };
}

function loadDisabled(storage: Storage): string[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function saveDisabled(storage: Storage, disabled: Set<string>): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Array.from(disabled)));
  } catch {
    // localStorage may throw on quota exceeded or storage disabled.
    // In-memory state is still consistent for subsequent isInitiallyEnabled
    // calls; we just lose persistence across reload.
  }
}

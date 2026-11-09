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

/**
 * Moves a renamed extension's entry in the disabled set from its old id to its
 * new one, so an extension the operator turned off stays off. The old entry is
 * removed, so re-enabling the extension under its new id holds on the next
 * start. Writes only when the old id was in the set; storage that cannot be
 * read, or holds no array, is left as it is.
 */
export function moveDisabledId(storage: Storage, fromId: string, toId: string): void {
  const disabled = new Set<string>(loadDisabled(storage));
  if (!disabled.delete(fromId)) return;
  disabled.add(toId);
  saveDisabled(storage, disabled);
}

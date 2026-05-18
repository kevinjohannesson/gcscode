/**
 * Single localStorage key holding the entire configuration map.
 * Schema: `{ [fullKey: string]: unknown }`.
 */
export const STORAGE_KEY = 'gcscode.configuration';

export type ConfigurationBlob = Record<string, unknown>;

/**
 * Load the persisted configuration blob. Returns `{}` on any failure — corrupted
 * JSON, storage disabled, quota errors, etc. A corrupted-JSON failure also
 * logs a warning so operators editing the blob by hand get a signal.
 */
export function loadConfigurationBlob(storage: Storage = localStorage): ConfigurationBlob {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw == null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ConfigurationBlob;
  } catch {
    console.warn(
      `[configuration] persisted blob at "${STORAGE_KEY}" is not valid JSON; starting from empty store`,
    );
    return {};
  }
}

/**
 * Write the full blob. Throws on storage failure (quota / disabled / security
 * context) — callers (the configuration store's `update()`) translate this into
 * a `Persistence failed` Promise rejection.
 */
export function writeConfigurationBlob(storage: Storage, blob: ConfigurationBlob): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

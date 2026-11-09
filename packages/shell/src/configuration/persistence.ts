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

/**
 * Moves every key saved under `<fromSection>.` to the same key under
 * `<toSection>.`, for an extension whose id was renamed. A value already saved
 * under the new key wins, and the old key is removed either way. Writes only
 * when a key moved. A blob that cannot be read is left as it is, and a failed
 * write leaves the old keys for the next start to move.
 */
export function moveConfigurationSection(
  storage: Storage,
  fromSection: string,
  toSection: string,
): void {
  const blob = loadConfigurationBlob(storage);
  const prefix = `${fromSection}.`;
  let moved = false;
  for (const key of Object.keys(blob)) {
    if (!key.startsWith(prefix)) continue;
    const newKey = `${toSection}.${key.slice(prefix.length)}`;
    if (!Object.hasOwn(blob, newKey)) blob[newKey] = blob[key];
    delete blob[key];
    moved = true;
  }
  if (!moved) return;
  try {
    writeConfigurationBlob(storage, blob);
  } catch {
    // Quota exceeded or storage disabled: nothing was written.
  }
}

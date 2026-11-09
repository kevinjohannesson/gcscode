import { moveConfigurationSection } from '../configuration/persistence';
import type { BundledExtensionEntry } from './bundled-extensions';
import { moveDisabledId } from './extension-persistence';

/**
 * Moves what the host saved under an extension's previous ids — its entry in
 * the disabled set and its configuration keys — to its current id, so a
 * renamed extension keeps the operator's settings. `main.ts` calls it before
 * creating the registry and the disabled set, which read what is saved when
 * they are created.
 *
 * A previous id that is also some entry's current id is skipped: moving it
 * would hand that extension's saved state to another one.
 */
export function moveSavedStateFromPreviousIds(
  entries: readonly Pick<BundledExtensionEntry, 'id' | 'previousIds'>[],
  storage: Storage = localStorage,
): void {
  const currentIds = new Set(entries.map((entry) => entry.id));
  for (const entry of entries) {
    for (const previousId of entry.previousIds ?? []) {
      if (currentIds.has(previousId)) {
        console.warn(
          `[extensions] "${previousId}" is listed as a previous id of "${entry.id}" but is a current id; its saved state stays where it is.`,
        );
        continue;
      }
      moveDisabledId(storage, previousId, entry.id);
      moveConfigurationSection(storage, previousId, entry.id);
    }
  }
}

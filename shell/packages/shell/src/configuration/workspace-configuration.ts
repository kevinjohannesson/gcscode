import type { ConfigurationTarget, WorkspaceConfiguration } from '@gcscode/extension-api';

/**
 * Internal contract the wrapper closes over. Lives in the store; the wrapper
 * is the public face that extensions read/write through.
 */
export interface ConfigurationStoreFacade {
  hasSchema(fullKey: string): boolean;
  getDefault(fullKey: string): unknown;
  getValue(fullKey: string): unknown | undefined;
  hasValue(fullKey: string): boolean;
  update(fullKey: string, value: unknown, target: ConfigurationTarget): Promise<void>;
}

export function createWorkspaceConfiguration(
  facade: ConfigurationStoreFacade,
  section: string | undefined,
): WorkspaceConfiguration {
  const fullKey = (key: string): string => (section ? `${section}.${key}` : key);

  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      const k = fullKey(key);
      if (!facade.hasSchema(k)) {
        return defaultValue;
      }
      if (facade.hasValue(k)) {
        return facade.getValue(k) as T;
      }
      const schemaDefault = facade.getDefault(k);
      if (schemaDefault !== undefined) {
        return schemaDefault as T;
      }
      return defaultValue;
    },

    has(key: string): boolean {
      return facade.hasValue(fullKey(key));
    },

    inspect<T>(key: string) {
      const k = fullKey(key);
      if (!facade.hasSchema(k)) return undefined;
      return {
        key: k,
        defaultValue: facade.getDefault(k) as T | undefined,
        globalValue: facade.hasValue(k) ? (facade.getValue(k) as T) : undefined,
      };
    },

    update(key: string, value: unknown, target?: ConfigurationTarget) {
      return facade.update(fullKey(key), value, target ?? 1); // 1 = ConfigurationTarget.Global
    },
  };
}

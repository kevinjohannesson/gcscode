import {
  ConfigurationTarget,
  type ConfigurationChangeEvent,
  type ConfigurationContribution,
  type Disposable,
  type WorkspaceConfiguration,
} from '@gcscode/extension-api';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import { writeConfigurationBlob, loadConfigurationBlob } from './persistence';
import {
  createWorkspaceConfiguration,
  type ConfigurationStoreFacade,
} from './workspace-configuration';

interface CompiledSchemaEntry {
  contribution: ConfigurationContribution;
  validate: ValidateFunction;
}

const ajv = new Ajv({ strict: false, allErrors: false });
addFormats(ajv);

function summarizeAjvErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
    .join('; ');
}

/**
 * Owns the configuration registry, in-memory value map, and listener set.
 * `host.configuration.*` methods delegate to a single instance of this class
 * created by `createRegistry()` at shell boot.
 */
export class ConfigurationStore {
  private _schemas = new SvelteMap<string, CompiledSchemaEntry>();
  private _values = new SvelteMap<string, unknown>();
  private _storage: Storage;
  private _listeners = new SvelteSet<(e: ConfigurationChangeEvent) => void>();
  private _pendingPersisted: Record<string, unknown>;

  public constructor(storage: Storage = localStorage) {
    this._storage = storage;
    this._pendingPersisted = loadConfigurationBlob(storage);
  }

  public registerConfiguration(
    contribution: ConfigurationContribution,
    extensionId: string,
  ): Disposable {
    const { key, schema, default: defaultValue } = contribution;

    const prefix = `${extensionId}.`;
    if (!key.startsWith(prefix)) {
      throw new Error(
        `Setting key "${key}" must start with "${prefix}" (registered by extension "${extensionId}").`,
      );
    }

    if (this._schemas.has(key)) {
      throw new Error(`Setting key "${key}" is already registered.`);
    }

    const validate = ajv.compile(schema);

    if (defaultValue !== undefined && !validate(defaultValue)) {
      throw new Error(
        `default for "${key}" does not match schema: ${summarizeAjvErrors(validate)}`,
      );
    }

    const entry: CompiledSchemaEntry = { contribution, validate };
    this._schemas.set(key, entry);

    // Re-validate any persisted value for this key. Bad → warn + leave out of
    // _values; the persisted blob is NOT touched (so schema loosening recovers it).
    if (key in this._pendingPersisted) {
      const persisted = this._pendingPersisted[key];
      if (validate(persisted)) {
        this._values.set(key, persisted);
      } else {
        console.warn(
          `[configuration] persisted value for "${key}" violates schema; falling back to default (${summarizeAjvErrors(validate)})`,
        );
      }
    }

    return {
      dispose: () => {
        // Idempotent + safe under re-registration: only delete if the entry
        // in the map is the one this disposable owns.
        if (this._schemas.get(key) === entry) {
          this._schemas.delete(key);
          this._values.delete(key);
        }
      },
    };
  }

  public getConfiguration(section?: string): WorkspaceConfiguration {
    return createWorkspaceConfiguration(this.facade, section);
  }

  private get facade(): ConfigurationStoreFacade {
    return {
      hasSchema: (k) => this._schemas.has(k),
      getDefault: (k) => this._schemas.get(k)?.contribution.default,
      getValue: (k) => this._values.get(k),
      hasValue: (k) => this._values.has(k),
      update: (k, v, t) => this.update(k, v, t),
    };
  }

  public onDidChangeConfiguration(listener: (e: ConfigurationChangeEvent) => void): {
    dispose(): void;
  } {
    this._listeners.add(listener);
    return {
      dispose: () => {
        this._listeners.delete(listener);
      },
    };
  }

  private async update(
    fullKey: string,
    value: unknown,
    target: ConfigurationTarget,
  ): Promise<void> {
    if (target !== ConfigurationTarget.Global) {
      throw new Error('Target not supported in v1');
    }
    const entry = this._schemas.get(fullKey);
    if (entry === undefined) {
      throw new Error(`No schema registered for "${fullKey}"`);
    }
    if (!entry.validate(value)) {
      throw new Error(
        `Value for "${fullKey}" does not match schema: ${summarizeAjvErrors(entry.validate)}`,
      );
    }

    // In-memory commit + listener fire BEFORE persistence (documented ordering;
    // listeners observe new state; persist failure rejects the Promise but does
    // not roll back in-memory state).
    this._values.set(fullKey, value);
    const event: ConfigurationChangeEvent = {
      affectsConfiguration(section: string): boolean {
        return fullKey === section || fullKey.startsWith(`${section}.`);
      },
    };
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[configuration] listener threw:', err);
      }
    }

    // Read-modify-write the blob (preserves orphan keys and validation-failed
    // persisted values for other keys).
    try {
      const blob = loadConfigurationBlob(this._storage);
      blob[fullKey] = value;
      writeConfigurationBlob(this._storage, blob);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Persistence failed: ${reason}`, { cause: err });
    }
  }
}

import type {
  ConfigurationContribution,
  ConfigurationTarget,
  Disposable,
  WorkspaceConfiguration,
} from '@gcscode/extension-api';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { SvelteMap } from 'svelte/reactivity';

import {
  createWorkspaceConfiguration,
  type ConfigurationStoreFacade,
} from './workspace-configuration';

// loadConfigurationBlob + ConfigurationBlob will be used in Task 6.

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

  public constructor(storage: Storage = localStorage) {
    this._storage = storage;
    // Boot-time blob load lands in Task 6. For now, start empty so this task's
    // tests are isolated.
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

  // Placeholder until Task 5 lands the real implementation. Reject everything
  // so any accidental call surfaces clearly during this task's tests.
  private update(_fullKey: string, _value: unknown, _target: ConfigurationTarget): Promise<void> {
    return Promise.reject(new Error('update() not yet implemented'));
  }

  // onDidChangeConfiguration lands in Task 5.
}

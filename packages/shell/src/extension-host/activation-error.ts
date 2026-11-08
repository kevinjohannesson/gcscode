/**
 * Thrown by `Registry.activate` when an extension's `activate()` throws, or
 * returns a thenable (activation is synchronous — see the containment spec).
 *
 * Lives in its own module, not `registry.ts`, so a module that only needs the
 * error type (e.g. `extension-manager.ts`) doesn't pull in `registry.ts`'s
 * runtime dependencies — `ajv`/`ajv-formats` (via `ConfigurationStore`) and
 * `svelte/reactivity` — just to catch and check an error.
 */
export class ExtensionActivationError extends Error {
  readonly extensionId: string;

  constructor(extensionId: string, cause: unknown) {
    super(`Extension "${extensionId}" failed to activate.`, { cause });
    this.name = 'ExtensionActivationError';
    this.extensionId = extensionId;
  }
}

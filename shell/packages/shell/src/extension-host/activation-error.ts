/**
 * Thrown by `Registry.activate` when an extension's `activate()` throws, or
 * returns a thenable (activation is synchronous — see the containment spec).
 *
 * Lives in its own module so `registry.ts` and `extension-manager.ts` can both
 * import it without a cycle.
 */
export class ExtensionActivationError extends Error {
  readonly extensionId: string;

  constructor(extensionId: string, cause: unknown) {
    super(`Extension "${extensionId}" failed to activate.`, { cause });
    this.name = 'ExtensionActivationError';
    this.extensionId = extensionId;
  }
}

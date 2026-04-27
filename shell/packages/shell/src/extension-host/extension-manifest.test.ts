import { describe, expect, it } from 'vitest';

import { bundledExtensions } from './extension-manifest';

describe('bundledExtensions', () => {
  it('is non-empty', () => {
    expect(bundledExtensions.length).toBeGreaterThanOrEqual(1);
  });

  it("each entry's id matches its extension's id", () => {
    for (const entry of bundledExtensions) {
      expect(entry.id).toBe(entry.extension.id);
    }
  });
});

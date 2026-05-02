import { describe, expect, it } from 'vitest';

import { bundledExtensions } from './bundled-extensions';

describe('bundledExtensions', () => {
  it('is non-empty', () => {
    expect(bundledExtensions.length).toBeGreaterThanOrEqual(1);
  });

  it("each entry's id matches its extension's id", () => {
    for (const entry of bundledExtensions) {
      expect(entry.id).toBe(entry.extension.id);
    }
  });

  it('bundles vehicle-status after sitl so the consumer activates after the producer', () => {
    const ids = bundledExtensions.map((entry) => entry.id);
    const sitlIndex = ids.indexOf('gcscode.sitl');
    const vehicleStatusIndex = ids.indexOf('gcscode.vehicle-status');
    expect(sitlIndex).toBeGreaterThanOrEqual(0);
    expect(vehicleStatusIndex).toBeGreaterThan(sitlIndex);
  });
});

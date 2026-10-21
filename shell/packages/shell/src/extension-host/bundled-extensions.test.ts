import { describe, expect, it } from 'vitest';

import { bundledExtensions } from './bundled-extensions';

describe('bundledExtensions', () => {
  it('is non-empty', () => {
    expect(bundledExtensions.length).toBeGreaterThanOrEqual(1);
  });

  it("each entry's id matches its extension's id", () => {
    for (const entry of bundledExtensions) {
      expect(entry.id).toBe(entry.extension.manifest.id);
    }
  });

  it('bundles map before flight-overlay, the one position in this list that is a requirement', () => {
    // flight-overlay resolves map's exports during its own activate(), so the
    // wrong way round means no overlay at all — it degrades rather than
    // throwing. Every other position in the list is documentation: the lazy
    // readers (vehicle-status, map-demo) pick their producer up on the next
    // read, and the assets service is resolved per inbound message.
    const ids = bundledExtensions.map((entry) => entry.id);
    const mapIndex = ids.indexOf('gcscode.map');
    const flightOverlayIndex = ids.indexOf('gcscode.flight-overlay');
    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(flightOverlayIndex).toBeGreaterThan(mapIndex);
  });
});

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
    // readers (vehicle-status, map-demo, assets-demo) pick their producer up
    // on the next read, and the assets service is resolved per inbound
    // message. That inventory is prose, not an assertion: this test pins map
    // before flight-overlay and nothing else, so a future entry carrying a
    // real ordering requirement would make the sentence false without failing
    // anything here.
    const ids = bundledExtensions.map((entry) => entry.id);
    const mapIndex = ids.indexOf('gcscode.map');
    const flightOverlayIndex = ids.indexOf('gcscode.mavlink-flight-overlay');
    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(flightOverlayIndex).toBeGreaterThan(mapIndex);
  });

  it('lists the ids the two MAVLink extensions had before ADR-0014 renamed them', () => {
    const previousIds = Object.fromEntries(
      bundledExtensions
        .filter((entry) => entry.previousIds !== undefined)
        .map((entry) => [entry.id, entry.previousIds]),
    );
    expect(previousIds).toEqual({
      'gcscode.mavlink': ['gcscode.sitl'],
      'gcscode.mavlink-flight-overlay': ['gcscode.flight-overlay'],
    });
  });
});

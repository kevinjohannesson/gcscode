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

  it('bundles map before mavlink-flight-overlay, an activation requirement', () => {
    // Two positions in this list are requirements, for different reasons.
    // 1. Activation order: flight-overlay resolves map's exports during its
    //    own activate(), so the wrong way round means no overlay at all - it
    //    degrades rather than throwing. This test pins that.
    // 2. Landing tab: the shell adds dock panels in registration order and
    //    the last one added is the front tab, so whichever view registers
    //    last is the tab every load opens on. The two tests below pin that
    //    Map stays it.
    // Every other position is documentation: the lazy readers (vehicle-status,
    // map-demo, assets-demo) pick their producer up on the next read, and the
    // assets service is resolved per inbound message. That inventory is
    // prose, not an assertion: a future entry carrying a real requirement
    // would make this sentence false without failing anything here.
    const ids = bundledExtensions.map((entry) => entry.id);
    const mapIndex = ids.indexOf('gcscode.map');
    const flightOverlayIndex = ids.indexOf('gcscode.mavlink-flight-overlay');
    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(flightOverlayIndex).toBeGreaterThan(mapIndex);
  });

  it('bundles video before map, so Map is the tab every load opens on', () => {
    const ids = bundledExtensions.map((entry) => entry.id);
    expect(ids.indexOf('gcscode.video')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('gcscode.video')).toBeLessThan(ids.indexOf('gcscode.map'));
  });

  it('keeps map the last entry that registers a view: only mavlink-flight-overlay follows it', () => {
    const ids = bundledExtensions.map((entry) => entry.id);
    expect(ids.slice(ids.indexOf('gcscode.map') + 1)).toEqual(['gcscode.mavlink-flight-overlay']);
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

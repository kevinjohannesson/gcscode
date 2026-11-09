/**
 * Boots the real `main.ts` against state saved before the MAVLink rename.
 * What it pins is the order of `main.ts`'s first lines: the registry's
 * configuration store and the disabled set read storage when they are
 * created, so the move from the previous ids has to run before both. The
 * unit tests in `extension-host/previous-ids.test.ts` cannot see that order.
 *
 * `mount`, the root component and dockview's stylesheet are stubbed, so no UI
 * renders. The bundled
 * extensions activate for real; `WebSocket` is stubbed to record the URL the
 * MAVLink extension dials.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('svelte', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte')>()),
  mount: vi.fn(),
}));
vi.mock('./app.svelte', () => ({ default: {} }));
// Node cannot load a stylesheet from node_modules; nothing renders anyway.
vi.mock('dockview-core/dist/styles/dockview.css', () => ({}));

const dialled: string[] = [];

class RecordingWebSocket {
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onclose: (() => void) | null = null;

  public constructor(url: string) {
    dialled.push(url);
  }

  public close(): void {}
}

async function bootWith(saved: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(saved)) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  await import('./main');
}

// The first boot transforms the whole app, about 3 s on its own and more under
// a full parallel run. A boot that outlived the default 5 s timeout would keep
// running into the next test's boot.
describe('main.ts at boot', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    dialled.length = 0;
    vi.stubGlobal('WebSocket', RecordingWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('keeps the MAVLink extension disabled when it was disabled as gcscode.sitl', async () => {
    await bootWith({ 'gcscode.extensions.disabled': ['gcscode.sitl'] });

    expect(dialled).toEqual([]);
    expect(localStorage.getItem('gcscode.extensions.disabled')).toBe('["gcscode.mavlink"]');
  });

  it('dials the connection URL saved as gcscode.sitl.connectionUrl', async () => {
    await bootWith({
      'gcscode.configuration': {
        'gcscode.sitl.connectionUrl': 'ws://vehicle.test:8088/v1/ws/mavlink',
      },
    });

    expect(dialled).toHaveLength(1);
    expect(dialled[0]).toMatch(/^ws:\/\/vehicle\.test:8088\/v1\/ws\/mavlink\?filter=/);
  });
});

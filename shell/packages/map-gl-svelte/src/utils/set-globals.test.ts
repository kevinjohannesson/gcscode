import { afterEach, expect, test, vi } from 'vitest';
import { setGlobals } from './set-globals';

type Call = [name: string, ...args: unknown[]];

/** A stand-in for the maplibre-gl module that records every global setter it receives. */
function createFakeMapLib(rtlStatus?: string) {
  const calls: Call[] = [];
  const mapLib = {
    setMaxParallelImageRequests: (...args: unknown[]) =>
      calls.push(['setMaxParallelImageRequests', ...args]),
    setWorkerCount: (...args: unknown[]) => calls.push(['setWorkerCount', ...args]),
    setWorkerUrl: (...args: unknown[]) => calls.push(['setWorkerUrl', ...args]),
    setRTLTextPlugin: (...args: unknown[]) => calls.push(['setRTLTextPlugin', ...args]),
    ...(rtlStatus === undefined ? {} : { getRTLTextPluginStatus: () => rtlStatus }),
  };
  return { mapLib, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('setGlobals calls each setter once with the given value', () => {
  const { mapLib, calls } = createFakeMapLib();

  setGlobals(mapLib, { maxParallelImageRequests: 8, workerCount: 3, workerUrl: '/w.js' });

  expect(calls).toEqual([
    ['setMaxParallelImageRequests', 8],
    ['setWorkerCount', 3],
    ['setWorkerUrl', '/w.js'],
  ]);
});

test('setGlobals leaves unset settings alone, but passes 0 through', () => {
  const unset = createFakeMapLib();
  setGlobals(unset.mapLib, {});
  expect(unset.calls, 'nothing set').toEqual([]);

  const zero = createFakeMapLib();
  setGlobals(zero.mapLib, { maxParallelImageRequests: 0, workerCount: 0 });
  expect(zero.calls, '0 is a value, not "unset"').toEqual([
    ['setMaxParallelImageRequests', 0],
    ['setWorkerCount', 0],
  ]);
});

test('setGlobals sets the RTL text plugin only while its status is unavailable', () => {
  const unavailable = createFakeMapLib('unavailable');
  setGlobals(unavailable.mapLib, { RTLTextPlugin: '/rtl.js' });
  expect(unavailable.calls, 'unavailable: set once, lazy by default').toEqual([
    ['setRTLTextPlugin', '/rtl.js', expect.any(Function), true],
  ]);

  const object = createFakeMapLib('unavailable');
  setGlobals(object.mapLib, { RTLTextPlugin: { pluginUrl: '/rtl.js', lazy: false } });
  expect(object.calls, 'object form carries its own lazy flag').toEqual([
    ['setRTLTextPlugin', '/rtl.js', expect.any(Function), false],
  ]);

  for (const status of ['deferred', 'loading', 'loaded', 'error']) {
    const { mapLib, calls } = createFakeMapLib(status);
    setGlobals(mapLib, { RTLTextPlugin: '/rtl.js' });
    expect(calls, `${status}: left alone`).toEqual([]);
  }

  const noStatus = createFakeMapLib();
  setGlobals(noStatus.mapLib, { RTLTextPlugin: '/rtl.js' });
  expect(noStatus.calls, 'no getRTLTextPluginStatus: left alone').toEqual([]);
});

test('setGlobals logs an RTL text plugin load error', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { mapLib, calls } = createFakeMapLib('unavailable');

  setGlobals(mapLib, { RTLTextPlugin: '/rtl.js' });
  const onLoaded = calls[0][2] as (error?: Error) => void;

  onLoaded();
  expect(consoleError, 'no error, no log').not.toHaveBeenCalled();

  const error = new Error('plugin failed');
  onLoaded(error);
  expect(consoleError).toHaveBeenCalledExactlyOnceWith(error);
});

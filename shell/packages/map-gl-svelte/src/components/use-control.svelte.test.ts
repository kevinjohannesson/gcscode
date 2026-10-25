import * as maplibregl from 'maplibre-gl';
import { flushSync } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { useControl } from '../index';
import { cleanup, renderLoaded } from '../test-fixtures/controls-harness.svelte';
import type { ControlPosition, IControl } from '../types/lib';
import type { MapContextValue } from './map-context';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A control that writes what MapLibre asks of it to `log`. */
type RecordingControl = IControl & { readonly element: HTMLElement };

function recordingControl(log: string[]): RecordingControl {
  const element = document.createElement('div');
  return {
    element,
    onAdd() {
      log.push('ctrl.onAdd');
      return element;
    },
    onRemove() {
      log.push('ctrl.onRemove');
      element.remove();
    },
  };
}

test('onCreate runs once, with the map context, and useControl returns what it made', async () => {
  const log: string[] = [];
  const contexts: MapContextValue[] = [];
  let made: RecordingControl | undefined;
  let returned: RecordingControl | undefined;

  const r = await renderLoaded({
    custom: () => {
      returned = useControl((context) => {
        log.push('create');
        contexts.push(context);
        made = recordingControl(log);
        return made;
      });
    },
  });

  expect(log).toEqual(['create', 'ctrl.onAdd']);
  expect(returned, 'useControl returns the control onCreate made').toBe(made);
  expect(contexts[0].map.getMap(), "context.map is the map's ref").toBe(await r.map());
  expect(contexts[0].mapLib.Map, 'context.mapLib is the library').toBe(maplibregl.Map);
});

test('onAdd runs after the map added the control, onRemove before it removes it', async () => {
  const log: string[] = [];
  const contexts: MapContextValue[] = [];
  let made: RecordingControl | undefined;
  let hasWhen: (label: string, context: MapContextValue) => void = () => {};

  const r = await renderLoaded({
    custom: () => {
      hasWhen = (label, context) => {
        contexts.push(context);
        log.push(`${label} (map has control: ${context.map.hasControl(made!)})`);
      };
      useControl(
        (context) => {
          log.push('create');
          contexts.push(context);
          made = recordingControl(log);
          return made;
        },
        (context) => hasWhen('onAdd', context),
        (context) => hasWhen('onRemove', context),
      );
    },
  });
  const map = await r.map();

  expect(log, 'onAdd runs after the map added the control').toEqual([
    'create',
    'ctrl.onAdd',
    'onAdd (map has control: true)',
  ]);
  expect(map.hasControl(made!)).toBe(true);

  r.props.custom = undefined;
  flushSync();

  expect(log, 'onRemove runs before the map removes the control').toEqual([
    'create',
    'ctrl.onAdd',
    'onAdd (map has control: true)',
    'onRemove (map has control: true)',
    'ctrl.onRemove',
  ]);
  expect(contexts, 'all three got the same context').toHaveLength(3);
  expect(contexts[1]).toBe(contexts[0]);
  expect(contexts[2]).toBe(contexts[0]);
});

type Overload = {
  name: string;
  /** Calls `useControl` as the overload does, with `position` where the overload has options. */
  setup: (log: string[], position: ControlPosition, made: (c: RecordingControl) => void) => void;
  /** What `log` holds once the control was added and then removed. */
  expected: string[];
};

const overloads: Overload[] = [
  {
    name: '(onCreate, opts)',
    setup: (log, position, made) => {
      useControl(
        () => {
          const ctrl = recordingControl(log);
          made(ctrl);
          return ctrl;
        },
        { position },
      );
    },
    expected: ['ctrl.onAdd', 'ctrl.onRemove'],
  },
  {
    name: '(onCreate, onRemove, opts)',
    setup: (log, position, made) => {
      useControl(
        () => {
          const ctrl = recordingControl(log);
          made(ctrl);
          return ctrl;
        },
        () => log.push('onRemove'),
        { position },
      );
    },
    expected: ['ctrl.onAdd', 'onRemove', 'ctrl.onRemove'],
  },
  {
    name: '(onCreate, onAdd, onRemove, opts)',
    setup: (log, position, made) => {
      useControl(
        () => {
          const ctrl = recordingControl(log);
          made(ctrl);
          return ctrl;
        },
        () => log.push('onAdd'),
        () => log.push('onRemove'),
        { position },
      );
    },
    expected: ['ctrl.onAdd', 'onAdd', 'onRemove', 'ctrl.onRemove'],
  },
];

test.each(overloads)('overload $name', async ({ setup, expected }) => {
  const log: string[] = [];
  let made: RecordingControl | undefined;
  const r = await renderLoaded({
    custom: () =>
      setup(log, 'bottom-left', (ctrl) => {
        made = ctrl;
      }),
  });

  const corner = r.target.querySelector('.maplibregl-ctrl-bottom-left');
  expect(corner?.contains(made!.element), 'control is at the position').toBe(true);

  r.props.custom = undefined;
  flushSync();

  expect(log).toEqual(expected);
});

test('without options the control goes where MapLibre puts it', async () => {
  const log: string[] = [];
  let made: RecordingControl | undefined;
  const r = await renderLoaded({
    custom: () => {
      useControl(() => (made = recordingControl(log)));
    },
  });

  const corner = r.target.querySelector('.maplibregl-ctrl-top-right');
  expect(corner?.contains(made!.element)).toBe(true);
});

test('after the component is unmounted the map no longer has the control', async () => {
  const log: string[] = [];
  let made: RecordingControl | undefined;
  const r = await renderLoaded({
    custom: () => {
      useControl(() => (made = recordingControl(log)));
    },
  });
  const map = await r.map();
  expect(map.hasControl(made!), 'the map has it while mounted').toBe(true);

  r.props.custom = undefined;
  flushSync();

  expect(map.hasControl(made!), 'removed with the component').toBe(false);
  expect(made!.element.isConnected, 'and out of the DOM').toBe(false);
});

test('a whole map tree unmounted removes the control once', async () => {
  const log: string[] = [];
  let made: RecordingControl | undefined;
  const r = await renderLoaded({
    custom: () => {
      useControl(
        () => (made = recordingControl(log)),
        () => log.push('onRemove'),
      );
    },
  });
  const map = await r.map();

  r.unmount();

  expect(map.hasControl(made!)).toBe(false);
  expect(log, 'removed by the component, not again by the map').toEqual([
    'ctrl.onAdd',
    'onRemove',
    'ctrl.onRemove',
  ]);
});

test('teardown leaves a control the map no longer has', async () => {
  const log: string[] = [];
  let made: RecordingControl | undefined;
  const r = await renderLoaded({
    custom: () => {
      useControl(
        () => (made = recordingControl(log)),
        () => log.push('onRemove'),
      );
    },
  });
  const map = await r.map();

  // Taken out by someone else first, as when the map itself was removed.
  map.removeControl(made!);
  expect(log).toEqual(['ctrl.onAdd', 'ctrl.onRemove']);

  r.props.custom = undefined;
  flushSync();

  // `onRemove` still runs, as upstream's does; the control is not removed a second time.
  expect(log).toEqual(['ctrl.onAdd', 'ctrl.onRemove', 'onRemove']);
});

test('a control the map already has is not added again', async () => {
  const log: string[] = [];
  let made: RecordingControl | undefined;
  const r = await renderLoaded({
    custom: () => {
      useControl(
        ({ map }) => {
          // onCreate puts the control on the map itself.
          made = recordingControl(log);
          map.addControl(made);
          return made;
        },
        () => log.push('onAdd'),
        () => log.push('onRemove'),
      );
    },
  });

  expect(log, 'one add, and no onAdd for an add useControl did not make').toEqual(['ctrl.onAdd']);

  r.props.custom = undefined;
  flushSync();

  expect(log).toEqual(['ctrl.onAdd', 'onRemove', 'ctrl.onRemove']);
});

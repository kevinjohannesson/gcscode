import { describe, expect, it } from 'vitest';

import { parseStationMessage } from './station-protocol';
import { advControls } from './test-fakes';

// The exact text packages/mavlink-station sends (its snapshot.rs tests pin the same strings).
const HELLO = '{"type":"hello","protocol":1,"station":"0.1.0"}';
const INPUT =
  '{"type":"input","radio":{"name":"TX16SMK3 Joystick","vendorId":4617,"productId":20308,' +
  '"serial":"0123456789AB","axes":[100,-32768],"buttons":[false,true],"hats":[1]},"controls":null,' +
  '"eventsPerSecond":12}';

describe('parseStationMessage', () => {
  it('reads hello', () => {
    expect(parseStationMessage(HELLO)).toEqual({ type: 'hello', protocol: 1, station: '0.1.0' });
  });

  it('reads input with a radio', () => {
    expect(parseStationMessage(INPUT)).toEqual({
      type: 'input',
      radio: {
        name: 'TX16SMK3 Joystick',
        vendorId: 4617,
        productId: 20308,
        serial: '0123456789AB',
        axes: [100, -32768],
        buttons: [false, true],
        hats: [1],
      },
      controls: null,
      eventsPerSecond: 12,
    });
  });

  it('reads input without a radio, before a whole second has passed', () => {
    expect(
      parseStationMessage('{"type":"input","radio":null,"controls":null,"eventsPerSecond":null}'),
    ).toEqual({
      type: 'input',
      radio: null,
      controls: null,
      eventsPerSecond: null,
    });
  });

  it('reads a radio without a serial', () => {
    const text = INPUT.replace('"0123456789AB"', 'null');
    expect(parseStationMessage(text)).toMatchObject({ radio: { serial: null } });
  });

  it.each([
    ['not JSON', 'hello'],
    ['not an object', '7'],
    ['null', 'null'],
    ['an unknown type', '{"type":"output"}'],
    ['hello without a protocol', '{"type":"hello","station":"0.1.0"}'],
    ['hello with a fractional protocol', '{"type":"hello","protocol":0.5,"station":"0.1.0"}'],
    ['input without eventsPerSecond', '{"type":"input","radio":null,"controls":null}'],
    ['input without controls, as protocol 0 sent it', INPUT.replace('"controls":null,', '')],
    ['an axis that is not a number', INPUT.replace('[100,', '["100",')],
    ['a button that is not a boolean', INPUT.replace('[false,true]', '[0,1]')],
    ['a hat that is not a number', INPUT.replace('"hats":[1]', '"hats":["up"]')],
    ['a radio without a name', INPUT.replace('"name":"TX16SMK3 Joystick",', '')],
    ['a radio without a vendor id', INPUT.replace('"vendorId":4617,', '')],
    ['a radio without a product id', INPUT.replace('"productId":20308,', '')],
    ['a radio with a numeric serial', INPUT.replace('"0123456789AB"', '7')],
  ])('refuses %s', (_name, text) => {
    expect(parseStationMessage(text)).toBeNull();
  });
});

describe('parseStationMessage with controls', () => {
  // The exact controls text packages/mavlink-station's snapshot.rs pins, apart from the axes
  // and on/off lists, which the station always sends whole.
  const RADIO =
    '{"name":"TX16SMK3 Joystick","vendorId":4617,"productId":20308,"serial":null,' +
    '"axes":[0],"buttons":[true],"hats":[]}';
  const input = (controls: unknown, radio = RADIO) =>
    `{"type":"input","radio":${radio},"controls":${JSON.stringify(controls)},"eventsPerSecond":3}`;

  it('reads every control', () => {
    expect(parseStationMessage(input(advControls()))).toEqual({
      type: 'input',
      radio: expect.objectContaining({ name: 'TX16SMK3 Joystick' }),
      controls: advControls(),
      eventsPerSecond: 3,
    });
  });

  it('reads the switch fields as the station writes them', () => {
    const text = input(advControls()).replace(
      /"switches":\[.*?\],"unmapped/,
      '"switches":[{"name":"SA","buttons":[0,1,2],"positions":["up","middle","down"],"position":"middle"},' +
        '{"name":"SF","buttons":[15,16],"positions":["up","down"],"position":null}],"unmapped',
    );
    expect(parseStationMessage(text)).toMatchObject({
      controls: { switches: [{ position: 'middle' }, { position: null }] },
    });
  });

  const c = advControls();
  it.each([
    ['controls without a radio', input(c, 'null')],
    [
      'an unknown axis role',
      input({ ...c, axes: c.axes.map((a, i) => (i ? a : { ...a, role: 'elevator' })) }),
    ],
    ['axis roles out of order', input({ ...c, axes: [c.axes[1], c.axes[0], ...c.axes.slice(2)] })],
    ['a missing axis role', input({ ...c, axes: c.axes.slice(1) })],
    [
      'a fractional percent',
      input({ ...c, axes: c.axes.map((a, i) => (i ? a : { ...a, percent: 1.5 })) }),
    ],
    [
      'a mapped axis without a percent',
      input({ ...c, axes: c.axes.map((a, i) => (i ? a : { ...a, percent: null })) }),
    ],
    [
      'an on/off control without a state',
      input({ ...c, onOff: [{ role: 'control', button: 20, on: null }, c.onOff[1]] }),
    ],
    ['on/off roles out of order', input({ ...c, onOff: [c.onOff[1], c.onOff[0]] })],
    [
      'a position the switch does not have',
      input({ ...c, switches: [{ ...c.switches[0], position: 'sideways' }] }),
    ],
    [
      'a switch with fewer names than buttons',
      input({ ...c, switches: [{ ...c.switches[0], positions: ['middle'] }] }),
    ],
    ['controls without a profile', input({ ...c, profile: undefined })],
    ['unmapped buttons that are not numbers', input({ ...c, unmappedButtons: ['21'] })],
  ])('refuses %s', (_name, text) => {
    expect(parseStationMessage(text)).toBeNull();
  });
});

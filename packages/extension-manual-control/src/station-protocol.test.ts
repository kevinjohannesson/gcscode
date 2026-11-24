import { describe, expect, it } from 'vitest';

import { parseStationMessage } from './station-protocol';

// The exact text packages/mavlink-station sends (its snapshot.rs tests pin the same strings).
const HELLO = '{"type":"hello","protocol":0,"station":"0.1.0"}';
const INPUT =
  '{"type":"input","radio":{"name":"TX16SMK3 Joystick","vendorId":4617,"productId":20308,' +
  '"serial":"0123456789AB","axes":[100,-32768],"buttons":[false,true],"hats":[1]},"eventsPerSecond":12}';

describe('parseStationMessage', () => {
  it('reads hello', () => {
    expect(parseStationMessage(HELLO)).toEqual({ type: 'hello', protocol: 0, station: '0.1.0' });
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
      eventsPerSecond: 12,
    });
  });

  it('reads input without a radio, before a whole second has passed', () => {
    expect(parseStationMessage('{"type":"input","radio":null,"eventsPerSecond":null}')).toEqual({
      type: 'input',
      radio: null,
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
    ['input without eventsPerSecond', '{"type":"input","radio":null}'],
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

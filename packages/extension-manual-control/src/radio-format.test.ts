import { describe, expect, it } from 'vitest';

import { axisFill, buttonRows, eventsLine, isEdgeTx, pressedLine, usbId } from './radio-format';

describe('radio format', () => {
  it('recognises EdgeTX by its USB id only', () => {
    expect(isEdgeTx(0x1209, 0x4f54)).toBe(true);
    expect(isEdgeTx(0x1209, 0x4f55)).toBe(false);
    expect(isEdgeTx(0x045e, 0x4f54)).toBe(false);
  });

  it('prints a USB id as four hex digits each', () => {
    expect(usbId(0x1209, 0x4f54)).toBe('1209:4f54');
    expect(usbId(0x45e, 0x2)).toBe('045e:0002');
  });

  it('fills an axis bar from the middle out to the value', () => {
    expect(axisFill(0)).toEqual({ left: 50, width: 0 });
    expect(axisFill(32767)).toEqual({ left: 50, width: 50 });
    expect(axisFill(-32768)).toEqual({ left: 0, width: 50 });
    expect(axisFill(16384)).toEqual({ left: 50, width: (16384 / 32767) * 50 });
    expect(axisFill(-16384)).toEqual({ left: 25, width: 25 });
  });

  it('lays buttons out twelve to a row', () => {
    expect(buttonRows(0)).toEqual([]);
    expect(buttonRows(3)).toEqual([[0, 1, 2]]);
    expect(buttonRows(28)).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      [24, 25, 26, 27],
    ]);
  });

  it('lists the pressed buttons by number', () => {
    expect(pressedLine([false, false])).toBe('pressed: none');
    expect(pressedLine([false, false, false, false, false, false, false, true, false, true])).toBe(
      'pressed: 7, 9',
    );
    expect(pressedLine([true])).toBe('pressed: 0');
  });

  it('says the events line the way the probe does', () => {
    expect(eventsLine(null)).toBe('input events in the last second: (waiting for input)');
    expect(eventsLine(0)).toBe('input events in the last second: 0');
    expect(eventsLine(250)).toBe('input events in the last second: 250');
  });
});

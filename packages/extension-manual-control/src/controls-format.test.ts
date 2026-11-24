import { describe, expect, it } from 'vitest';

import { buttonsText, controlLabel, onOffText, percentFill, unmappedLine } from './controls-format';

describe('controls-format', () => {
  it('labels each control as the probe does', () => {
    expect(
      (['roll', 'pitch', 'throttle', 'yaw', 'aux1', 'aux4', 'control', 'rtl'] as const).map(
        controlLabel,
      ),
    ).toEqual(['roll', 'pitch', 'throttle', 'yaw', 'aux 1', 'aux 4', 'control', 'RTL']);
  });

  it('fills a two-sided axis from the middle', () => {
    expect(percentFill('roll', 0)).toEqual({ left: 50, width: 0 });
    expect(percentFill('roll', 100)).toEqual({ left: 50, width: 50 });
    expect(percentFill('roll', -100)).toEqual({ left: 0, width: 50 });
    expect(percentFill('yaw', -40)).toEqual({ left: 30, width: 20 });
  });

  it('fills throttle from the left', () => {
    expect(percentFill('throttle', 0)).toEqual({ left: 0, width: 0 });
    expect(percentFill('throttle', 37)).toEqual({ left: 0, width: 37 });
    expect(percentFill('throttle', 100)).toEqual({ left: 0, width: 100 });
  });

  it('keeps a bar inside its cell whatever it is sent', () => {
    expect(percentFill('roll', 250)).toEqual({ left: 50, width: 50 });
    expect(percentFill('throttle', -20)).toEqual({ left: 0, width: 0 });
  });

  it('says on, off or not mapped', () => {
    expect([true, false, null].map(onOffText)).toEqual(['on', 'off', 'not mapped']);
  });

  it('names the buttons a control reads', () => {
    expect(buttonsText([20])).toBe('button 20');
    expect(buttonsText([0, 1, 2])).toBe('buttons 0, 1, 2');
    expect(buttonsText([])).toBe('');
  });

  it('lists the inputs nothing reads', () => {
    expect(unmappedLine([6, 7], [])).toBe('unmapped axes: 6, 7 · unmapped buttons: none');
  });
});

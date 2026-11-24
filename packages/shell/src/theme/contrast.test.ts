import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

describe('contrastRatio', () => {
  it('is 21 for black on white, in either order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1 for a colour on itself', () => {
    expect(contrastRatio('#1f1f1f', '#1f1f1f')).toBe(1);
  });

  it('matches WCAG for #777777 on white (4.48, just under AA)', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('rejects anything but an opaque #rrggbb colour', () => {
    expect(() => contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff')).toThrow(/#rrggbb/);
  });
});

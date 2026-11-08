import { expect, test } from 'vitest';
import { applyStyle } from './apply-style';

test('applyStyle', () => {
  const div = document.createElement('div');

  expect(() => applyStyle(null as unknown as HTMLElement, {}), 'null element').not.toThrow();

  expect(() => applyStyle(div, undefined), 'undefined style').not.toThrow();

  expect(() => applyStyle(div, null as unknown as undefined), 'null style').not.toThrow();

  applyStyle(div, { marginLeft: 4, height: 24, lineHeight: 2, zIndex: 1, flexGrow: 0.5 });

  expect(div.style.marginLeft, 'appended px to numeric value').toBe('4px');
  expect(div.style.height, 'appended px to numeric value').toBe('24px');
  expect(div.style.lineHeight, 'unitless numeric property').toBe('2');
  expect(div.style.zIndex, 'unitless numeric property').toBe('1');
  expect(div.style.flexGrow, 'unitless numeric property').toBe('0.5');
});

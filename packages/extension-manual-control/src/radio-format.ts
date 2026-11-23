// What the Radio input view shows, as plain values, matching tools/radio-probe's terminal block.

export const AXIS_MIN = -32768;
export const AXIS_MAX = 32767;
export const BUTTONS_PER_ROW = 12;

/** EdgeTX's USB joystick, as the probe recognises it. */
export function isEdgeTx(vendorId: number, productId: number): boolean {
  return vendorId === 0x1209 && productId === 0x4f54;
}

/** `1209:4f54`, as the probe prints a USB id. */
export function usbId(vendorId: number, productId: number): string {
  const hex = (n: number) => n.toString(16).padStart(4, '0');
  return `${hex(vendorId)}:${hex(productId)}`;
}

/**
 * The filled part of an axis bar, in percent of its width: from the middle, 0,
 * out to the value. -32768 fills the left half, 32767 the right half.
 */
export function axisFill(value: number): { left: number; width: number } {
  if (value >= 0) return { left: 50, width: (Math.min(value, AXIS_MAX) / AXIS_MAX) * 50 };
  const width = (Math.min(-value, -AXIS_MIN) / -AXIS_MIN) * 50;
  return { left: 50 - width, width };
}

/** Button numbers in rows of twelve, as the probe's grid. */
export function buttonRows(count: number): number[][] {
  const rows: number[][] = [];
  for (let start = 0; start < count; start += BUTTONS_PER_ROW) {
    rows.push(
      Array.from({ length: Math.min(BUTTONS_PER_ROW, count - start) }, (_, i) => start + i),
    );
  }
  return rows;
}

/** `pressed: 7, 9` or `pressed: none`. */
export function pressedLine(buttons: readonly boolean[]): string {
  const pressed = buttons.flatMap((on, i) => (on ? [i] : []));
  return `pressed: ${pressed.length ? pressed.join(', ') : 'none'}`;
}

/** The events line under the block, or the probe's text before a whole second has passed. */
export function eventsLine(perSecond: number | null): string {
  return perSecond === null
    ? 'input events in the last second: (waiting for input)'
    : `input events in the last second: ${perSecond}`;
}

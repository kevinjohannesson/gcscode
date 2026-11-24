// What the Controls view shows, as plain values, matching tools/radio-probe's --mapped block.
import type { AxisRole, OnOffRole } from './station-protocol';

const LABELS: Record<AxisRole | OnOffRole, string> = {
  roll: 'roll',
  pitch: 'pitch',
  throttle: 'throttle',
  yaw: 'yaw',
  aux1: 'aux 1',
  aux2: 'aux 2',
  aux3: 'aux 3',
  aux4: 'aux 4',
  control: 'control',
  rtl: 'RTL',
};

/** What an operator reads for a control, as the probe prints it. */
export function controlLabel(role: AxisRole | OnOffRole): string {
  return LABELS[role];
}

/** Throttle reads 0% to 100%; every other axis -100% to 100%, 0% at its centre. */
export function isOneSided(role: AxisRole): boolean {
  return role === 'throttle';
}

/**
 * The filled part of a control's bar, in percent of its width. A two-sided axis fills from
 * the middle out to its value, throttle from the left.
 */
export function percentFill(role: AxisRole, percent: number): { left: number; width: number } {
  const p = Math.max(isOneSided(role) ? 0 : -100, Math.min(100, percent));
  if (isOneSided(role)) return { left: 0, width: p };
  return p >= 0 ? { left: 50, width: p / 2 } : { left: 50 + p / 2, width: -p / 2 };
}

/** `on`, `off`, or `not mapped`. */
export function onOffText(on: boolean | null): string {
  return on === null ? 'not mapped' : on ? 'on' : 'off';
}

/** `button 20`, `buttons 0, 1, 2`, or nothing when not mapped. */
export function buttonsText(buttons: readonly number[]): string {
  if (buttons.length === 0) return '';
  return `${buttons.length === 1 ? 'button' : 'buttons'} ${buttons.join(', ')}`;
}

/** `unmapped axes: 6, 7 · unmapped buttons: none`. */
export function unmappedLine(axes: readonly number[], buttons: readonly number[]): string {
  const list = (v: readonly number[]) => (v.length ? v.join(', ') : 'none');
  return `unmapped axes: ${list(axes)} · unmapped buttons: ${list(buttons)}`;
}

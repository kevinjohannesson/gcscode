import type { Disposable } from '@gcscode/plugin-api';

import type { Registry } from './plugin-host/registry';

interface ParsedKey {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

export function parseKey(input: string): ParsedKey {
  const tokens = input.split('+').map((t) => t.trim());
  const parsed: ParsedKey = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === '') {
      throw new Error(
        `Keybinding "${input}" has an empty token (likely a stray "+" or whitespace-only segment)`,
      );
    }
    if (lower === 'ctrl' || lower === 'control') parsed.ctrl = true;
    else if (lower === 'shift') parsed.shift = true;
    else if (lower === 'alt') parsed.alt = true;
    else if (lower === 'meta' || lower === 'cmd' || lower === 'command') parsed.meta = true;
    else {
      if (parsed.key !== '') {
        throw new Error(`Keybinding "${input}" has more than one non-modifier key`);
      }
      parsed.key = lower;
    }
  }
  if (parsed.key === '') {
    throw new Error(`Keybinding "${input}" has no non-modifier key`);
  }
  return parsed;
}

export function matchesKey(event: KeyboardEvent, parsed: ParsedKey): boolean {
  return (
    event.ctrlKey === parsed.ctrl &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt &&
    event.metaKey === parsed.meta &&
    event.key.toLowerCase() === parsed.key
  );
}

export function attachKeybindingDispatcher(registry: Registry, target: EventTarget): Disposable {
  const handler = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return;
    for (const kb of registry.listKeybindings()) {
      let parsed: ParsedKey;
      try {
        parsed = parseKey(kb.key);
      } catch (err) {
        console.error(`[keybinding-dispatcher] failed to parse "${kb.key}":`, err);
        continue;
      }
      if (matchesKey(event, parsed)) {
        event.preventDefault();
        try {
          void registry.executeCommand(kb.command).catch((err) => {
            console.error(
              `[keybinding-dispatcher] command "${kb.command}" rejected (key "${kb.key}"):`,
              err,
            );
          });
        } catch (err) {
          // Sync throw from registry.executeCommand (e.g. missing command id).
          console.error(
            `[keybinding-dispatcher] command "${kb.command}" threw synchronously (key "${kb.key}"):`,
            err,
          );
        }
        return; // first match wins
      }
    }
  };
  target.addEventListener('keydown', handler);
  return {
    dispose() {
      target.removeEventListener('keydown', handler);
    },
  };
}

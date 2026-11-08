import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { mountSvelteComponent } from '../utils.svelte';
import TestComponent from './test-component.svelte';

describe('mountSvelteComponent', () => {
  let host: HTMLElement;

  afterEach(() => {
    host?.remove();
  });

  function makeHost(): HTMLElement {
    host = document.createElement('div');
    document.body.appendChild(host);
    return host;
  }

  it('mounts the component into the target element', () => {
    const target = makeHost();
    mountSvelteComponent(TestComponent, { title: 'A' }, target);
    flushSync();

    expect(target.querySelector('[data-testid="title"]')?.textContent).toBe('A');
    expect(target.children.length).toBeGreaterThan(0);
  });

  it('update() propagates without remount (same DOM node, same mount-time const)', () => {
    const target = makeHost();
    const onMounted = vi.fn();

    const handle = mountSvelteComponent(TestComponent, { title: 'A', onMounted }, target);
    flushSync();

    const titleNode = target.querySelector('[data-testid="title"]') as HTMLElement;
    expect(titleNode.textContent).toBe('A');
    const mountIdBefore = titleNode.dataset.mountId;
    expect(onMounted).toHaveBeenCalledTimes(1);

    handle.update({ title: 'B' });
    flushSync();

    const titleNodeAfter = target.querySelector('[data-testid="title"]') as HTMLElement;
    expect(titleNodeAfter).toBe(titleNode); // identity preserved → no remount
    expect(titleNodeAfter.textContent).toBe('B');
    expect(titleNodeAfter.dataset.mountId).toBe(mountIdBefore);
    expect(onMounted).toHaveBeenCalledTimes(1); // not re-mounted
  });

  it('dispose() removes the rendered DOM and a subsequent update() is a noop', () => {
    const target = makeHost();
    const handle = mountSvelteComponent(TestComponent, { title: 'A' }, target);
    flushSync();
    expect(target.children.length).toBeGreaterThan(0);

    handle.dispose();
    flushSync();
    expect(target.children.length).toBe(0);

    // update() after dispose is documented as a noop in utils.svelte.ts.
    expect(() => handle.update({ title: 'B' })).not.toThrow();
    expect(target.children.length).toBe(0);
  });

  it('context map values are visible to descendants via getContext', () => {
    const target = makeHost();
    const ctx = new Map<unknown, unknown>([['test-key', 'hello']]);

    mountSvelteComponent(TestComponent, { title: 'A' }, target, ctx);
    flushSync();

    expect(target.querySelector('[data-testid="context"]')?.textContent).toBe('hello');
  });

  it('dispose() unmounts the reactive graph (later prop mutation does not re-render)', () => {
    const target = makeHost();
    const handle = mountSvelteComponent(TestComponent, { title: 'A' }, target);
    flushSync();

    handle.dispose();
    flushSync();

    // After dispose: target is empty AND further updates are silent.
    handle.update({ title: 'B' });
    flushSync();
    expect(target.children.length).toBe(0);
    // No `title: B` text reappears anywhere in the document body.
    expect(document.body.textContent).not.toContain('B');
  });
});

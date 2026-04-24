import { describe, expect, it } from 'vitest';

import type { Contribution } from '@gcscode/plugin-api';

import { createRegistry } from './registry';

const fakeComponent = {} as Contribution['component'];

describe('createRegistry', () => {
  it('starts with no contributions', () => {
    const registry = createRegistry();
    expect(registry.listContributions()).toHaveLength(0);
  });

  it('records contributions registered through a host', () => {
    const registry = createRegistry();
    const host = registry.createHost();

    host.registerContribution({ kind: 'content', component: fakeComponent });

    expect(registry.listContributions()).toEqual([{ kind: 'content', component: fakeComponent }]);
  });

  it('filters contributions by kind', () => {
    const registry = createRegistry();
    const host = registry.createHost();

    host.registerContribution({ kind: 'content', component: fakeComponent });

    expect(registry.listContributions('content')).toHaveLength(1);
  });

  it('gives each plugin its own host object', () => {
    const registry = createRegistry();
    const hostA = registry.createHost();
    const hostB = registry.createHost();

    expect(hostA).not.toBe(hostB);

    hostA.registerContribution({ kind: 'content', component: fakeComponent });
    hostB.registerContribution({ kind: 'content', component: fakeComponent });

    expect(registry.listContributions()).toHaveLength(2);
  });
});

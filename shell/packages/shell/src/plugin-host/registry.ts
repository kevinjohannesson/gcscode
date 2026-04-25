import type { Contribution, ContributionKind, PluginHost } from '@gcscode/plugin-api';

export interface Registry {
  createHost(): PluginHost;
  listContributions(kind?: ContributionKind): readonly Contribution[];
}

// Invariant: all plugin.activate(host) calls must complete before App mounts.
// Registration is not reactive — the store is a plain array, and consumers
// read via $derived(registry.listContributions(...)) which snapshots at mount
// time. Post-mount registration is out of scope (see docs/out-of-scope.md).
export function createRegistry(): Registry {
  const contributions: Contribution[] = [];

  return {
    createHost() {
      return {
        registerContribution(contribution) {
          contributions.push(contribution);
        },
      };
    },
    listContributions(kind) {
      return kind === undefined
        ? contributions.slice()
        : contributions.filter((c) => c.kind === kind);
    },
  };
}

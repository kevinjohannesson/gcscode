import type { Contribution, ContributionKind, PluginHost } from '@gcscode/plugin-api';

export interface Registry {
  createHost(): PluginHost;
  listContributions(kind?: ContributionKind): readonly Contribution[];
}

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

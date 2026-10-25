import type { Snippet } from 'svelte';
import type { SourceSpecification } from '../types/style-spec';

// In a `.ts` file rather than `source.svelte`, so `tsc` can see it.

export type SourceProps = SourceSpecification & {
  id?: string;
  children?: Snippet;
};

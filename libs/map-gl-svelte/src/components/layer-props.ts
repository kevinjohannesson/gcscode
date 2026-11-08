import type { CustomLayerInterface } from '../types/lib';
import type { LayerSpecification } from '../types/style-spec';

// In a `.ts` file rather than `layer.svelte`, so `tsc` can see it.

// Omiting property from a union type, see
// https://github.com/microsoft/TypeScript/issues/39556#issuecomment-656925230
type OptionalId<T> = T extends { id: string } ? Omit<T, 'id'> & { id?: string } : T;
type OptionalSource<T> = T extends { source: string } ? Omit<T, 'source'> & { source?: string } : T;

export type LayerProps = (OptionalSource<OptionalId<LayerSpecification>> | CustomLayerInterface) & {
  /** If set, the layer will be inserted before the specified layer */
  beforeId?: string;
};

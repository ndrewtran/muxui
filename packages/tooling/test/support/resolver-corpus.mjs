import { resolveCatalogGraph } from '../../src/local-resolver.mjs';

export { currentCorpus as corpus } from '../../../../tests/fixtures/g0.4/current-corpus.mjs';

export function resolve(value, graph) {
  const { expected: _expected, ...normalizedGraph } = graph;
  return resolveCatalogGraph({
    packageManager: value.packageManager,
    catalogs: value.catalogs,
    rendererDescriptors: value.rendererDescriptors,
    releaseManifests: value.releaseManifests,
    graph: normalizedGraph,
  });
}

export const directGraph = (value) => value.graphs.find(({ id }) => id === 'selected-direct-compatible');

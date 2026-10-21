import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mergeDerivedApis } from '@muxui/schema';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const snapshot = JSON.parse(await readFile(
  resolve(repositoryRoot, 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json'),
  'utf8',
));
const generatedClosure = JSON.parse((await readFile(
  resolve(repositoryRoot, 'packages/react/generated/r1-5-closure.json'),
  'utf8',
)).replace(/^\/\/ @generated-from:.*\n\/\/ @generated-content-sha256:.*\n/u, ''));
const runtimeSourcePaths = [
  'packages/react/src/button.ts',
  'packages/react/src/components.ts',
  'packages/react/src/fields.mjs',
  'packages/react/src/collections.mjs',
  'packages/react/src/overlays.mjs',
];
const runtimeSources = new Map(await Promise.all(runtimeSourcePaths.map(async (path) => (
  [path, await readFile(resolve(repositoryRoot, path), 'utf8')]
))));
const slugForFamily = (family) => family === 'Modal'
  ? 'dialog'
  : family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const runtimeSourceFor = (exportName) => [...runtimeSources.entries()]
  .find(([, source]) => new RegExp(`export\\s+const\\s+${exportName}\\b`, 'u').test(source))?.[0] ?? null;
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
};
const same = (left, right) => JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));

const families = await Promise.all(snapshot.families.map(async (familyEntry) => {
  const slug = slugForFamily(familyEntry.family);
  const authored = JSON.parse(await readFile(
    resolve(repositoryRoot, `catalog/components/${slug}/artifact.json`),
    'utf8',
  ));
  // A derived web.react API (Decision 0031) merges in as the catalog compiles it.
  const derived = await readFile(resolve(repositoryRoot, `packages/react/api/${slug}.json`), 'utf8')
    .then(JSON.parse, (error) => { if (error.code === 'ENOENT') return undefined; throw error; });
  const artifact = derived === undefined ? authored : mergeDerivedApis(authored, { 'web.react': derived });
  const binding = artifact.bindings['web.react'];
  const bindingId = `${artifact.id}#web.react`;
  return {
    family: familyEntry.family,
    familyId: familyEntry.scopeId,
    componentId: artifact.id,
    bindingId,
    export: artifact.name,
    runtimeProfile: binding ? 'web.react' : null,
    expected: {
      family: familyEntry.family,
      slug,
      root: { export: familyEntry.rootExport, kind: familyEntry.rootKind },
      tranche: familyEntry.tranche,
      contract: {
        artifact: `catalog/components/${slug}/artifact.json`,
        binding: bindingId,
        lifecycle: artifact.lifecycle,
        states: artifact.states,
        api: binding?.api ?? null,
        parts: artifact.anatomy,
        runtimeSource: runtimeSourceFor(artifact.name),
      },
      export: { name: artifact.name, module: '.', kind: 'component' },
      lifecycle: {
        artifact: artifact.lifecycle,
        binding: binding?.lifecycle ?? null,
        strategy: binding?.strategy ?? null,
      },
      packed: {
        binding: bindingId,
        export: artifact.name,
        runtimeProfile: 'web.react',
        selector: `.muxui-${slug}`,
      },
    },
  };
}));

const generatedByFamily = new Map(generatedClosure.families.map((entry) => [entry.family, entry]));
const projectGenerated = (entry) => entry && {
  family: entry.family,
  slug: entry.slug,
  root: entry.root,
  tranche: entry.tranche,
  contract: {
    artifact: entry.contract?.artifact,
    binding: entry.contract?.binding,
    lifecycle: entry.contract?.lifecycle,
    states: entry.contract?.states,
    api: entry.contract?.api,
    parts: entry.contract?.parts,
    runtimeSource: entry.contract?.runtimeSource,
  },
  export: entry.export,
  lifecycle: entry.lifecycle,
  packed: {
    binding: entry.packed?.binding,
    export: entry.packed?.export,
    runtimeProfile: entry.packed?.runtimeProfile,
    selector: entry.packed?.selector,
  },
};
const parityRows = families.map(({ expected, family, familyId, componentId, bindingId, export: exportName, runtimeProfile }) => {
  const generated = generatedByFamily.get(family);
  const generatedProjection = projectGenerated(generated);
  return {
    family,
    familyId,
    componentId,
    bindingId,
    export: exportName,
    runtimeProfile,
    expected,
    generated: generatedProjection,
    exact: same(generatedProjection, expected),
  };
});
const exactParity = generatedClosure.families.length === families.length
  && generatedByFamily.size === families.length
  && parityRows.every(({ exact }) => exact);

console.log(JSON.stringify({
  status: 'informational',
  claim: 'no support or release gate',
  modelEvaluation: 'disabled',
  discovery: {
    source: 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json',
    familyCount: families.length,
    componentCount: families.filter(({ runtimeProfile }) => runtimeProfile === 'web.react').length,
    reconciliation: `${families.length}/${families.filter(({ runtimeProfile }) => runtimeProfile === 'web.react').length}`,
    rawExportCount: snapshot.counts.rawExports,
    generationParity: {
      exact: exactParity,
      status: exactParity ? 'exact' : 'mismatch',
      source: 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json',
      generated: 'packages/react/generated/r1-5-closure.json',
      expectedFamilyCount: families.length,
      generatedFamilyCount: generatedClosure.families.length,
      reconciliation: `${parityRows.filter(({ exact }) => exact).length}/${families.length}`,
      mismatches: parityRows
        .filter(({ exact }) => !exact)
        .map(({ family, familyId, componentId, bindingId, export: exportName }) => ({
          family,
          familyId,
          componentId,
          bindingId,
          export: exportName,
        })),
    },
    families: families.map(({ expected: _expected, ...family }) => family),
  },
}));

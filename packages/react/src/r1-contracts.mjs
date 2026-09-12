import { createHash } from 'node:crypto';
import { canonicalJson, validateContractDocument } from '@muxui/schema';

const EXPECTED_UPSTREAM = Object.freeze({
  package: 'react-aria-components',
  version: '1.20.0',
  commit: '5ecb3333001313e83898cd07644227897e3bae1f',
  tree: 'eb6f6e25b83b2095536c4ab7671a0d977726738c',
  inputs: [
    { path: 'packages/react-aria-components/package.json', blob: '34aff3e05c02dfed56cc4e416d893331d48d3cc3', bytes: 2770 },
    { path: 'packages/react-aria-components/exports/index.ts', blob: 'e72133c7b1d1d0fe2d65031f100e3f92d61add9a', bytes: 20184 },
  ],
});

const EXPECTED_CLASSIFICATION_SHA256 = 'sha256:1210b8d3cee9999407c4632672640b0905c5d9fa8d93904a9e80afd70f9166dc';
const EXPECTED_NORMALIZED_EXPORTS_SHA256 = 'sha256:8f4e9dd637585ed98d529624f46960cee80041cd41bfef206e7745be351503d3';
const EXPECTED_UPSTREAM_DISPOSITIONS = Object.freeze([
  'candidate', 'delivered', 'defer', 'exclude', 'not-a-component',
]);

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function projectHistoricalIdentity(value) {
  const historicalMachine = ['core', 'ui'].join('-');
  const historicalDisplay = ['Core', 'UI'].join(' ');
  const historicalArtifact = ['core', ':'].join('');
  const historicalPackage = `@${historicalMachine}/`;
  const historicalDiagnostics = ['CORE', '_'].join('');
  if (typeof value === 'string') {
    return value
      .replaceAll(historicalMachine, 'muxui')
      .replaceAll(historicalDisplay, 'Mux UI')
      .replaceAll(historicalArtifact, 'muxui:')
      .replaceAll(historicalPackage, '@muxui/')
      .replaceAll(historicalDiagnostics, 'MUXUI_');
  }
  if (Array.isArray(value)) return value.map(projectHistoricalIdentity);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      projectHistoricalIdentity(key), projectHistoricalIdentity(item),
    ]));
  }
  return value;
}

function validateR10SourceContract(value) {
  const historicalSchemaPrefix = `${['core', 'ui'].join('-')}-react-`;
  const isHistorical = typeof value?.schema === 'string' && value.schema.startsWith(historicalSchemaPrefix);
  validateContractDocument('react-r1.schema.json', isHistorical ? projectHistoricalIdentity(value) : value);
}

function fail(code) {
  throw new Error(code);
}

function snapshotTuples(items) {
  return items.map(({ name, source, value }) => ({ name, source, value }));
}

function classificationTuples(items) {
  return items.map(({ name, kind, disposition, tranche, reason }) => ({
    name,
    kind,
    disposition,
    tranche,
    ...(reason === undefined ? {} : { reason }),
  }));
}

/** Validate the pinned React Aria source inventory and its derived exports. */
export function assertReactR10SourceContracts({ snapshot, upstreamExports, upstreamExportsBytes }) {
  for (const value of [snapshot, upstreamExports]) validateR10SourceContract(value);
  for (const value of [snapshot, upstreamExports]) {
    if (!same({
      package: value.package,
      version: value.version,
      commit: value.commit,
      tree: value.tree,
      inputs: value.inputs,
    }, EXPECTED_UPSTREAM)) fail('MUXUI_REACT_UPSTREAM_IDENTITY_DRIFT');
  }
  if (upstreamExports.items.length !== 613) fail('MUXUI_REACT_UPSTREAM_EXPORT_COUNT_DRIFT');
  if (!same(snapshotTuples(snapshot.items), upstreamExports.items)) fail('MUXUI_REACT_UPSTREAM_EXPORT_DERIVATION_DRIFT');
  if (sha256(JSON.stringify(upstreamExports.items)) !== EXPECTED_NORMALIZED_EXPORTS_SHA256
    || snapshot.exportTupleSha256 !== EXPECTED_NORMALIZED_EXPORTS_SHA256.slice(7)) {
    fail('MUXUI_REACT_UPSTREAM_EXPORT_TUPLE_DRIFT');
  }
  if (snapshot.normalizedExports.path !== 'catalog/react-r1-0/upstream-exports.json'
    || snapshot.normalizedExports.count !== upstreamExports.items.length
    || snapshot.normalizedExports.sha256 !== sha256(upstreamExportsBytes)) {
    fail('MUXUI_REACT_UPSTREAM_EXPORT_PAYLOAD_DRIFT');
  }
  const classificationSha256 = sha256(canonicalJson(classificationTuples(snapshot.items)));
  if (classificationSha256 !== EXPECTED_CLASSIFICATION_SHA256 || snapshot.classificationSha256 !== EXPECTED_CLASSIFICATION_SHA256) {
    fail('MUXUI_REACT_UPSTREAM_CLASSIFICATION_DRIFT');
  }
  if (!same(snapshot.dispositionGrammar, EXPECTED_UPSTREAM_DISPOSITIONS)) fail('MUXUI_REACT_UPSTREAM_DISPOSITION_GRAMMAR_DRIFT');
  return { snapshot, upstreamExports };
}

const R15_EVIDENCE_IDS = Object.freeze([
  'E-R1.5-01', 'E-R1.5-02', 'E-R1.5-03', 'E-R1.5-04', 'E-R1.5-05', 'E-R1.5-06',
]);

function r15TrancheEvidence(tranche) {
  const count = tranche === 'R1.3' ? 5 : tranche === 'R1.4' ? 6 : 4;
  return Array.from({ length: count }, (_, index) => `E-${tranche}-${String(index + 1).padStart(2, '0')}`);
}

function r15Slug(artifact) {
  return artifact.id.slice('muxui:component:'.length);
}

function r15FamilySlug(family) {
  return family === 'Modal'
    ? 'dialog'
    : family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function r15BindingId(slug) {
  return `muxui:component:${slug}#web.react`;
}

/** Validate the retained 53-family graph and its current package projections. */
export function assertReactR15GeneratedContracts({
  closure,
  snapshot,
  componentArtifacts,
  descriptor,
  release,
  closureRecord,
  currentContract,
  manifest,
  runtimeSources,
  styles,
}) {
  const failR15 = (code) => fail(`MUXUI_REACT_R15_${code}`);
  const expectedClosureKeys = [
    'advisories', 'agentDiscovery', 'compatibility', 'evidenceCapture',
    'exceptions', 'performance', 'publication', 'schema', 'tranche',
  ];
  if (closure?.schema !== 'muxui-react-r1-5-closure-v1'
    || closure.tranche !== 'R1.5'
    || !same(Object.keys(closure).sort(), expectedClosureKeys.sort())
    || closure.compatibility?.runtimeProfile !== 'web.react'
    || closure.compatibility?.node !== '>=24.19.0 <25'
    || closure.compatibility?.react !== '>=19.2.0 <20'
    || closure.compatibility?.reactDom !== '>=19.2.0 <20'
    || closure.compatibility?.browserMatrix?.browser !== 'Google Chrome 151'
    || closure.compatibility?.browserMatrix?.axe !== '4.13.0'
    || closure.compatibility?.browserMatrix?.source !== 'apps/react-playground/test/browser.test.mjs'
    || !same(closure.compatibility?.browserMatrix?.profiles, [
      'light/standard/full/comfortable/ltr',
      'dark/standard/full/comfortable/ltr',
      'light/more/full/comfortable/ltr',
      'light/standard/reduced/comfortable/ltr',
      'light/standard/full/compact/ltr',
      'light/standard/full/comfortable/rtl',
    ])
    || closure.compatibility?.status !== 'representative-baseline'
    || closure.performance?.status !== 'representative-baseline'
    || closure.performance?.method !== 'release preparation measures packed import and SSR'
    || closure.performance?.budgets?.packedImportMilliseconds !== 2000
    || closure.performance?.budgets?.ssrMilliseconds !== 1000
    || closure.agentDiscovery?.status !== 'informational'
    || closure.agentDiscovery?.claim !== 'no support or release gate'
    || !same(Object.keys(closure.evidenceCapture ?? {}).sort(), ['allowed', 'collection', 'prohibited', 'retention'].sort())
    || closure.evidenceCapture?.collection !== 'default-off'
    || !same(closure.evidenceCapture?.allowed, ['sanitized repository-relative paths', 'canonical IDs'])
    || !same(closure.evidenceCapture?.prohibited, ['credentials', 'consumer data'])
    || closure.evidenceCapture?.retention !== 'protected PR check/review logs'
    || !same(closure.exceptions, [])
    || !same(closure.advisories, [])
    || closure.publication?.candidateVersion !== '0.1.0-rc.1'
    || closure.publication?.status !== 'disabled'
    || closure.publication?.private !== true) failR15('CLOSURE_SOURCE_INVALID');

  if (!Array.isArray(snapshot?.families) || snapshot.families.length !== 53
    || !Array.isArray(componentArtifacts) || componentArtifacts.length !== 53
    || new Set(snapshot.families.map(({ family }) => family)).size !== 53
    || new Set(componentArtifacts.map(r15Slug)).size !== 53) failR15('FAMILY_COUNT_INVALID');

  const artifactsBySlug = new Map(componentArtifacts.map((artifact) => [r15Slug(artifact), artifact]));
  const snapshotByFamily = new Map(snapshot.families.map((entry) => [entry.family, entry]));
  const runtimeEntries = Object.entries(runtimeSources ?? {});
  const familySources = snapshot.families.map((upstreamFamily) => {
    const slug = r15FamilySlug(upstreamFamily.family);
    const artifact = artifactsBySlug.get(slug);
    const runtimeSource = runtimeEntries.find(([, source]) => (
      artifact && new RegExp(`export\\s+const\\s+${artifact.name}\\b`, 'u').test(source)
    ))?.[0];
    return {
      family: upstreamFamily.family,
      slug,
      rootExport: upstreamFamily.rootExport,
      rootKind: upstreamFamily.rootKind,
      exportName: artifact?.name,
      tranche: upstreamFamily.tranche,
      runtimeSource,
      artifactPath: `catalog/components/${slug}/artifact.json`,
    };
  });
  if (familySources.some(({ exportName, runtimeSource }) => !exportName || !runtimeSource)
    || !Array.isArray(closureRecord?.families)
    || closureRecord.families.length !== 53
    || new Set(closureRecord.families.map(({ slug }) => slug)).size !== 53
    || !same(closureRecord.families.map(({ family }) => family).sort(), familySources.map(({ family }) => family).sort())
    || closureRecord.schema !== 'muxui-react-r1-5-closure-v1'
    || closureRecord.generatedFrom !== 'catalog/react-r1-5/closure.json'
    || closureRecord.package !== manifest?.name
    || closureRecord.version !== manifest?.version
    || closureRecord.upstream?.package !== 'react-aria-components'
    || closureRecord.upstream?.version !== '1.20.0'
    || closureRecord.upstream?.commit !== EXPECTED_UPSTREAM.commit
    || closureRecord.upstream?.tree !== EXPECTED_UPSTREAM.tree
    || closureRecord.upstream?.rawExports !== 613
    || closureRecord.upstream?.documentedFamilies !== 53
    || !same(closureRecord.upstream?.rawDispositionCounts, {
      'committed-family-root': 53,
      'family-part': 75,
      'internal-runtime-support': 158,
      'internal-type-support': 327,
    })
    || 'donor' in closureRecord) failR15('FAMILY_GRAPH_INVALID');

  const historicalBindings = descriptor?.historical?.bindings;
  const historicalExports = descriptor?.historical?.exports;
  const historicalReleaseBindings = release?.historical?.bindings;
  const historicalReleaseExports = release?.historical?.componentExports;
  if (manifest?.private !== true
    || descriptor?.schema !== 'muxui-renderer-descriptor-v1'
    || descriptor.generatedFrom !== 'packages/react/src/generate.mjs'
    || descriptor.package !== manifest.name
    || descriptor.tranche !== 'R1.6'
    || descriptor.bindings?.length !== 74
    || descriptor.exports?.length !== 74
    || descriptor.historical?.tranche !== 'R1.5'
    || descriptor.historical?.familyCount !== 53
    || historicalBindings?.length !== 53
    || historicalExports?.length !== 53
    || release?.schema !== 'muxui-react-release-candidate-v1'
    || release.packagePrivate !== true
    || release.componentExports?.length !== 74
    || release.bindings?.length !== 74
    || release.catalog?.status !== 'bound'
    || release.catalog.components?.length !== 74
    || release.historical?.tranche !== 'R1.5'
    || release.historical?.familyCount !== 53
    || historicalReleaseBindings?.length !== 53
    || historicalReleaseExports?.length !== 53
    || release.publication?.status !== 'disabled'
    || currentContract?.schema !== 'muxui-react-r1-6-contract-v1'
    || currentContract.current?.familyCount !== 74
    || currentContract.current?.fixed53Count !== 53
    || currentContract.current?.supplementalCount !== 21
    || currentContract.components?.length !== 74
    || currentContract.components?.filter(({ tranche }) => tranche !== 'R1.6').length !== 53) {
    failR15('PROJECTION_COUNTS_INVALID');
  }

  for (const source of familySources) {
    const artifact = artifactsBySlug.get(source.slug);
    const upstream = snapshotByFamily.get(source.family);
    const binding = artifact?.bindings?.['web.react'];
    const bindingId = r15BindingId(source.slug);
    const runtimeSource = runtimeSources?.[source.runtimeSource];
    const familyClosure = closureRecord.families.find(({ slug }) => slug === source.slug);
    const descriptorBinding = historicalBindings.find(({ binding: value }) => value === bindingId);
    const descriptorExport = historicalExports.find(({ binding: value }) => value === bindingId);
    const releaseBinding = historicalReleaseBindings.find(({ binding: value }) => value === bindingId);
    const releaseExport = historicalReleaseExports.find(({ binding: value }) => value === bindingId);
    const currentComponent = currentContract.components.find(({ binding: value }) => value === bindingId);
    if (!artifact || !upstream || !binding
      || artifact.id !== `muxui:component:${source.slug}`
      || artifact.name !== source.exportName
      || artifact.lifecycle !== 'experimental'
      || source.rootExport !== upstream.rootExport
      || source.rootKind !== upstream.rootKind
      || source.tranche !== upstream.tranche
      || source.runtimeSource !== `packages/react/src/${source.runtimeSource.split('/').at(-1)}`
      || binding.lifecycle !== 'experimental'
      || binding.strategy !== 'direct'
      || !Array.isArray(binding.api?.props)
      || binding.api.props.some((prop) => /^is[A-Z]/u.test(prop))
      || typeof runtimeSource !== 'string'
      || !new RegExp(`export\\s+const\\s+${source.exportName}\\b`, 'u').test(runtimeSource)
      || !styles.includes(`.muxui-${source.slug}`)) failR15('FAMILY_CONTRACT_INVALID');
    if (!familyClosure
      || familyClosure.family !== source.family
      || familyClosure.root?.export !== source.rootExport
      || familyClosure.root?.kind !== source.rootKind
      || familyClosure.tranche !== source.tranche
      || familyClosure.contract?.artifact !== source.artifactPath
      || familyClosure.contract?.binding !== bindingId
      || familyClosure.contract?.lifecycle !== artifact.lifecycle
      || !same(familyClosure.contract?.states, artifact.states)
      || !same(familyClosure.contract?.api, binding.api)
      || !same(familyClosure.contract?.parts, artifact.anatomy)
      || familyClosure.contract?.runtimeSource !== source.runtimeSource
      || familyClosure.export?.name !== source.exportName
      || familyClosure.export?.module !== '.'
      || familyClosure.export?.kind !== 'component'
      || familyClosure.lifecycle?.artifact !== artifact.lifecycle
      || familyClosure.lifecycle?.binding !== binding.lifecycle
      || familyClosure.lifecycle?.strategy !== binding.strategy
      || !same(familyClosure.evidence?.tranche, r15TrancheEvidence(source.tranche))
      || !same(familyClosure.evidence?.final, R15_EVIDENCE_IDS)
      || familyClosure.evidence?.status !== 'pending'
      || familyClosure.evidence?.support !== 'unproved; R1.5 React exports only'
      || familyClosure.packed?.binding !== bindingId
      || familyClosure.packed?.export !== source.exportName
      || familyClosure.packed?.runtimeProfile !== 'web.react'
      || familyClosure.packed?.selector !== `.muxui-${source.slug}`
      || familyClosure.packed?.private !== true
      || 'donor' in familyClosure) failR15('FAMILY_CLOSURE_INVALID');
    if (!descriptorBinding || !descriptorExport || descriptorBinding.export !== source.exportName
      || descriptorBinding.lifecycle !== binding.lifecycle
      || descriptorBinding.strategy !== binding.strategy
      || descriptorBinding.runtimeProfile !== 'web.react'
      || descriptorBinding.selector !== `.muxui-${source.slug}`
      || descriptorExport.name !== source.exportName
      || !releaseExport || releaseExport.name !== source.exportName
      || !releaseBinding || releaseBinding.export !== source.exportName
      || releaseBinding.lifecycle !== binding.lifecycle
      || releaseBinding.strategy !== binding.strategy
      || releaseBinding.runtimeProfile !== 'web.react'
      || !currentComponent || currentComponent.tranche !== source.tranche
      || currentComponent.source !== source.runtimeSource
      || !same(currentComponent.states, artifact.states)
      || !same(currentComponent.api, binding.api)
      || 'donor' in currentComponent) failR15('PROJECTION_CONTRACT_INVALID');
  }

  return { closure, closureRecord, descriptor, release, currentContract };
}

export const assertReactR15ClosureContracts = assertReactR15GeneratedContracts;

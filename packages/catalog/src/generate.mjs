import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson, parseJsonStrict } from '@muxui/schema';
import { generatedText } from '../../../tooling/audits/repository-policy/src/policy.mjs';
import { compileCatalog } from './compiler.mjs';
import { syncSourceRecords } from './completeness.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const source = 'packages/catalog/catalog-sources.json';
const packageRoot = resolve(repositoryRoot, 'packages/catalog');
const packageManifest = parseJsonStrict(await readFile(join(packageRoot, 'package.json'), 'utf8'));
const repositoryPolicy = parseJsonStrict(await readFile(
  join(repositoryRoot, 'tooling/audits/repository-policy/repository-policy.json'),
  'utf8',
));
const checking = process.argv.includes('--check');
// The manifest lists exactly the canonical records on disk; only its settings
// are authored. The compiler reads the file, so it is written before compiling.
const sourcePath = join(repositoryRoot, source);
const listedManifest = parseJsonStrict(await readFile(sourcePath, 'utf8'));
const manifestOutput = {
  path: sourcePath,
  expected: `${JSON.stringify({
    ...listedManifest,
    records: await syncSourceRecords(repositoryRoot, listedManifest.records),
  }, null, 2)}\n`,
  label: source,
  from: 'catalog/',
};
if (!checking) await writeFile(sourcePath, manifestOutput.expected);
const { bundle, bytes } = await compileCatalog({ repositoryRoot, sourceManifestPath: source });
const tokenArtifact = bundle.artifacts.find(({ kind }) => kind === 'token');
if (!tokenArtifact) throw new Error('CATALOG_TOKEN_CONTRACT_MISSING: expected one canonical token source');
if (packageManifest.version !== bundle.catalogVersion) {
  throw new Error(
    'CATALOG_PACKAGE_VERSION_DRIFT: package version must equal compiled catalogVersion',
  );
}
const body = [
  `export const catalogJson = ${JSON.stringify(bytes)};`,
  '',
].join('\n');
const digest = createHash('sha256').update(body).digest('hex');
const expected = [
  `// @generated-from: ${source}`,
  `// @generated-content-sha256: sha256:${digest}`,
  body,
].join('\n');

const catalogPackageId = `${packageManifest.name}@${packageManifest.version}:${bundle.catalogDigest}`;
const bindingDescriptors = bundle.artifacts
  .filter(({ kind }) => kind === 'component')
  .flatMap((artifact) => Object.entries(artifact.tokenRequirementSets).map(([key, requirementSet]) => {
    const separator = key.indexOf(':');
    const bindingId = key.slice(0, separator);
    const profile = key.slice(separator + 1);
    return {
      ref: `${artifact.id}#${bindingId}`,
      profile,
      specRevision: artifact.bindingSpecRevisions[bindingId],
      tokenRequirementSetDigest: requirementSet.digest,
    };
  }))
  .sort((left, right) => `${left.ref}:${left.profile}`.localeCompare(`${right.ref}:${right.profile}`));
const platformSafetyDescriptors = bundle.artifacts
  .filter(({ kind }) => kind === 'component')
  .flatMap((artifact) => Object.entries(artifact.platformSafetyRequirementSets)
    .map(([key, requirementSet]) => ({
      key: `${artifact.id}#${key}`,
      digest: requirementSet.digest,
    })))
  .sort((left, right) => left.key.localeCompare(right.key));
const releaseManifest = {
  id: `muxui-release:${packageManifest.version}:${bundle.sourceRevision}`,
  releaseVersion: packageManifest.version,
  schemaVersion: bundle.schemaVersion,
  queryApiVersion: bundle.apiVersion,
  tokenContractVersion: tokenArtifact.record.tokenContractVersion,
  sourceRevision: bundle.sourceRevision,
  catalog: {
    id: catalogPackageId,
    version: packageManifest.version,
    digest: bundle.catalogDigest,
  },
  bindings: [],
};
const packageData = {
  schema: 'muxui-catalog-package-v2',
  name: packageManifest.name,
  version: packageManifest.version,
  catalogVersion: bundle.catalogVersion,
  catalogDigest: bundle.catalogDigest,
  queryApiVersion: bundle.apiVersion,
  supportedQueryApiVersions: bundle.supportedQueryApiVersions,
  schemaRange: '^2.0.0',
  sourceRevision: bundle.sourceRevision,
  tokenRequirementSets: Object.fromEntries(bindingDescriptors.map((descriptor) => [
    `${descriptor.ref}:${descriptor.profile}`,
    descriptor.tokenRequirementSetDigest,
  ])),
  platformSafetyContract: {
    version: bundle.platformSafetyContract.contractVersion,
    digest: bundle.platformSafetyContractDigest,
  },
  platformSafetyRequirementSets: Object.fromEntries(platformSafetyDescriptors.map(({ key, digest }) => [
    key,
    digest,
  ])),
  provenance: {
    kind: 'source-revision',
    value: bundle.sourceRevision,
  },
  releaseManifest,
  bundle: './catalog.json',
};
function strictJsonOutputs(path, sourcePath, value) {
  const expectedBytes = `${typeof value === 'string' ? value : canonicalJson(value)}\n`;
  const label = `packages/catalog/generated/${path}`;
  const provenanceLabel = `${label}.provenance`;
  const provenanceBody = `${canonicalJson({
    path: label,
    sha256: `sha256:${createHash('sha256').update(expectedBytes).digest('hex')}`,
  })}\n`;
  return [
    {
      path: resolve(packageRoot, `generated/${path}`),
      expected: expectedBytes,
      label,
    },
    {
      path: resolve(packageRoot, `generated/${path}.provenance`),
      expected: generatedText({ source: sourcePath, body: provenanceBody, policy: repositoryPolicy }),
      label: provenanceLabel,
    },
  ];
}
const outputs = [
  manifestOutput,
  {
    path: resolve(packageRoot, 'generated/catalog.mjs'),
    expected,
    label: 'packages/catalog/generated/catalog.mjs',
  },
  ...strictJsonOutputs('catalog.json', source, bytes),
  ...strictJsonOutputs('catalog-package.json', 'packages/catalog/package.json', packageData),
];

for (const output of outputs) {
  if (checking) {
    const actual = await readFile(output.path, 'utf8').catch(() => null);
    if (actual !== output.expected) {
      console.error(
        `CATALOG_GENERATED_BUNDLE_DRIFT: ${output.label} must be regenerated from ${output.from ?? source}`,
      );
      process.exitCode = 1;
    } else {
      console.log(`[catalog] generated bundle matches ${source}: ${output.label}`);
    }
  } else {
    await mkdir(dirname(output.path), { recursive: true });
    await writeFile(output.path, output.expected);
    console.log(`[catalog] generated ${output.label}`);
  }
}

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson, parseJsonStrict } from '@muxui/schema';
import { generatedText } from '../../../tooling/audits/repository-policy/src/policy.mjs';
import { compileCatalog } from './compiler.mjs';
import { synchronizedSourceManifest } from './completeness.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const source = 'packages/catalog/catalog-sources.json';
const packageRoot = resolve(repositoryRoot, 'packages/catalog');
const packageManifest = parseJsonStrict(await readFile(join(packageRoot, 'package.json'), 'utf8'));
const repositoryPolicy = parseJsonStrict(await readFile(
  join(repositoryRoot, 'tooling/audits/repository-policy/repository-policy.json'),
  'utf8',
));
const checking = process.argv.includes('--check');
// Release preparation compiles the rc it packs without touching the source tree:
// `--package-version <rc> --output-directory <dir>` writes the package's generated files for that version into `<dir>/generated`.
const option = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const packageVersion = option('--package-version') ?? packageManifest.version;
const outputDirectory = option('--output-directory');
if (outputDirectory === undefined ? packageVersion !== packageManifest.version : checking) {
  throw new Error('CATALOG_PACKAGE_VERSION_OVERRIDE_INVALID: --package-version needs --output-directory, and neither combines with --check');
}
// The manifest lists exactly the canonical records on disk; only its settings
// are authored. The compiler takes the synchronized manifest directly, so it
// never depends on the file having been written first.
const sourcePath = join(repositoryRoot, source);
const syncedManifest = await synchronizedSourceManifest(repositoryRoot);
const manifestOutput = {
  path: sourcePath,
  expected: `${JSON.stringify(syncedManifest, null, 2)}\n`,
  label: source,
  from: 'catalog/',
};
const { bundle, bytes } = await compileCatalog({ repositoryRoot, sourceManifest: syncedManifest, catalogVersion: packageVersion });
const tokenArtifact = bundle.artifacts.find(({ kind }) => kind === 'token');
if (!tokenArtifact) throw new Error('CATALOG_TOKEN_CONTRACT_MISSING: expected one canonical token source');
if (packageVersion !== bundle.catalogVersion) {
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

const catalogPackageId = `${packageManifest.name}@${packageVersion}:${bundle.catalogDigest}`;
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
const tokenRequirementSets = Object.fromEntries(bindingDescriptors.map((descriptor) => [
  `${descriptor.ref}:${descriptor.profile}`,
  descriptor.tokenRequirementSetDigest,
]));
const platformSafetyRequirementSets = Object.fromEntries(platformSafetyDescriptors.map(({ key, digest }) => [
  key,
  digest,
]));

// The package that renders each binding id, by directory. The release record lists a binding only when its renderer is
// declared here, and derives the package name and compatible version range from that package's source manifest.
const rendererPackageRoots = { 'web.react': 'packages/react' };
const rendererPackages = Object.fromEntries(await Promise.all(
  Object.entries(rendererPackageRoots).map(async ([bindingId, root]) => [
    bindingId,
    parseJsonStrict(await readFile(join(repositoryRoot, root, 'package.json'), 'utf8')),
  ]),
));

/** `^X.Y.0-0`: the renderer's own minor line, from the first prerelease of X.Y.0, so its later builds stay compatible. */
function compatibleVersionRange(version) {
  const match = /^(\d+)\.(\d+)\.\d+(?:[-+].*)?$/u.exec(version);
  if (match === null) throw new Error(`CATALOG_RENDERER_VERSION_INVALID: ${version} is not a semantic version`);
  return `^${match[1]}.${match[2]}.0-0`;
}

// The digests of one binding, keyed by profile, from the package-level `<binding>:<profile>` requirement-set map.
function profileDigests(requirementSets, ref) {
  const prefix = `${ref}:`;
  return Object.fromEntries(Object.entries(requirementSets)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, digest]) => [key.slice(prefix.length), digest]));
}

// A renderer's compatibility with the catalog is judged per binding, by content: the revision of its spec and the digests
// of its requirement sets. The package version range says which builds of the renderer may be asked, never one build.
const releaseBindings = bundle.artifacts
  .filter(({ kind }) => kind === 'component')
  .flatMap((artifact) => artifact.platforms
    .filter((bindingId) => Object.hasOwn(rendererPackages, bindingId))
    .map((bindingId) => {
      const renderer = rendererPackages[bindingId];
      const ref = `${artifact.id}#${bindingId}`;
      const tokenRequirementSetDigests = profileDigests(tokenRequirementSets, ref);
      const platformSafetyRequirementSetDigests = profileDigests(platformSafetyRequirementSets, ref);
      if (Object.keys(tokenRequirementSetDigests).length === 0 || Object.keys(platformSafetyRequirementSetDigests).length === 0) {
        throw new Error(`CATALOG_RELEASE_BINDING_UNCOMPILED: ${ref} has no compiled requirement set`);
      }
      return {
        // The descriptor id a renderer package publishes for itself (`renderer:<package>`).
        descriptor: `renderer:${renderer.name}`,
        binding: ref,
        package: renderer.name,
        versionRange: compatibleVersionRange(renderer.version),
        // The renderer exports the component under its artifact name; the subpath it lives at stays renderer-owned.
        exportName: artifact.name,
        specRevision: artifact.bindingSpecRevisions[bindingId],
        tokenRequirementSetDigests,
        platformSafetyRequirementSetDigests,
      };
    }))
  .sort((left, right) => (left.binding < right.binding ? -1 : left.binding > right.binding ? 1 : 0));
const releaseManifest = {
  id: `muxui-release:${packageVersion}:${bundle.sourceRevision}`,
  releaseVersion: packageVersion,
  schemaVersion: bundle.schemaVersion,
  queryApiVersion: bundle.apiVersion,
  tokenContractVersion: tokenArtifact.record.tokenContractVersion,
  sourceRevision: bundle.sourceRevision,
  catalog: {
    id: catalogPackageId,
    version: packageVersion,
    digest: bundle.catalogDigest,
  },
  bindings: releaseBindings,
};
const packageData = {
  schema: 'muxui-catalog-package-v2',
  name: packageManifest.name,
  version: packageVersion,
  catalogVersion: bundle.catalogVersion,
  catalogDigest: bundle.catalogDigest,
  queryApiVersion: bundle.apiVersion,
  supportedQueryApiVersions: bundle.supportedQueryApiVersions,
  schemaRange: `^${bundle.schemaVersion}`,
  sourceRevision: bundle.sourceRevision,
  tokenRequirementSets,
  platformSafetyContract: {
    version: bundle.platformSafetyContract.contractVersion,
    digest: bundle.platformSafetyContractDigest,
  },
  platformSafetyRequirementSets,
  provenance: {
    kind: 'source-revision',
    value: bundle.sourceRevision,
  },
  releaseManifest,
  bundle: './catalog.json',
};
// A version override writes beside, never into, the checkout.
const outputRoot = outputDirectory === undefined ? packageRoot : resolve(outputDirectory);
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
      path: resolve(outputRoot, `generated/${path}`),
      expected: expectedBytes,
      label,
    },
    {
      path: resolve(outputRoot, `generated/${path}.provenance`),
      expected: generatedText({ source: sourcePath, body: provenanceBody, policy: repositoryPolicy }),
      label: provenanceLabel,
    },
  ];
}
const outputs = [
  ...(outputDirectory === undefined ? [manifestOutput] : []),
  {
    path: resolve(outputRoot, 'generated/catalog.mjs'),
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

// A small publish-set tuple for the release manifest and lineage tests: four tarballs with the files the manifest
// reads (a consistent catalog bundle, its records and sidecars, the schema declarations, the renderer descriptor), built
// with the same deterministic archive writer a release uses, and the committed sources the manifest binds.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after } from 'node:test';
import { canonicalJson } from '../src/canonical-json.mjs';
import { deterministicArchive } from '../src/release-archive.mjs';
import { buildPortfolioManifest, releaseIdFor, sha256 } from '../src/release-manifest.mjs';
import { readPublishSet } from '../src/release-set.mjs';

export const publishSet = readPublishSet(resolve(import.meta.dirname, '../../../..'));
const scratch = mkdtempSync(join(tmpdir(), 'muxui-release-tuple-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

export const commit = 'a'.repeat(40);
export const otherCommit = 'b'.repeat(40);
export const tree = 'c'.repeat(40);
export const digest = (character) => `sha256:${character.repeat(64)}`;

/** The bytes the generators write for a JSON file. */
export const jsonBytes = (value) => `${canonicalJson(value)}\n`;

/** A generated file's `.provenance` sidecar, as the generators write it, for `bytes` at the source path `path`. */
export function sidecarFor(path, bytes) {
  const body = `${canonicalJson({ path, sha256: sha256(bytes) })}\n`;
  return `// @generated-from: x\n// @generated-content-sha256: ${sha256(body)}\n${body}`;
}

// The files whose sidecars `archiveOf` writes when a fixture leaves them out, with the source path they record.
const sidecarPaths = {
  'generated/catalog.json': 'packages/catalog/generated/catalog.json',
  'generated/catalog-package.json': 'packages/catalog/generated/catalog-package.json',
  'generated/renderer-descriptor.json': 'packages/react/generated/renderer-descriptor.json',
};

const tokenDigests = { 'web.react': digest('1') };
const lucideVersion = '1.2.3';
export const lucideIntegrity = `sha512-${'A'.repeat(86)}==`;
const safetyDigests = { 'web.react': digest('2') };
export const binding = 'muxui:component:button#web.react';

/** The `./bundle` module the catalog generator writes for a bundle's bytes. */
export function catalogModuleFor(bundleBytes) {
  const body = `export const catalogJson = ${JSON.stringify(bundleBytes.slice(0, -1))};\n`;
  return `// @generated-from: x\n// @generated-content-sha256: ${sha256(body)}\n${body}`;
}

/** The generated files of a catalog package for `version`: a bundle, its package and release records, the module, and sidecars. */
export function catalogFiles({ version, reactRange = '^0.1.0-0', sourceRevision = digest('5'), tokenDigest = tokenDigests['web.react'] }) {
  const component = {
    id: 'muxui:component:button',
    kind: 'component',
    name: 'Button',
    platforms: ['web.react'],
    bindingSpecRevisions: { 'web.react': digest('3') },
    tokenRequirementSets: { 'web.react:web.react': { digest: tokenDigest } },
    platformSafetyRequirementSets: { 'web.react:web.react': { digest: safetyDigests['web.react'] } },
  };
  const token = { id: 'muxui:token:default-theme', kind: 'token', record: { tokenContractVersion: '2.0.0' } };
  const preimage = {
    formatVersion: '1.0.0',
    apiVersion: '3.0.0',
    supportedQueryApiVersions: ['3.0.0'],
    schemaVersion: '4.0.0',
    catalogVersion: version,
    sourceRevision,
    platformSafetyContract: { contractVersion: '1.0.0' },
    platformSafetyContractDigest: digest('7'),
    artifacts: [component, token],
  };
  const catalogDigest = sha256(canonicalJson(preimage));
  const bundle = { ...preimage, catalogDigest };
  const bundleBytes = jsonBytes(bundle);
  const catalogPackage = {
    schema: 'muxui-catalog-package-v2',
    name: '@muxui/catalog',
    version,
    catalogVersion: version,
    catalogDigest,
    queryApiVersion: '3.0.0',
    supportedQueryApiVersions: ['3.0.0'],
    schemaRange: '^4.0.0',
    sourceRevision,
    tokenRequirementSets: { [`${component.id}#web.react:web.react`]: tokenDigest },
    platformSafetyContract: { version: '1.0.0', digest: digest('7') },
    platformSafetyRequirementSets: { [`${component.id}#web.react:web.react`]: safetyDigests['web.react'] },
    provenance: { kind: 'source-revision', value: sourceRevision },
    releaseManifest: {
      id: `muxui-release:${version}:${sourceRevision}`,
      releaseVersion: version,
      schemaVersion: '4.0.0',
      queryApiVersion: '3.0.0',
      tokenContractVersion: '2.0.0',
      sourceRevision,
      catalog: { id: `@muxui/catalog@${version}:${catalogDigest}`, version, digest: catalogDigest },
      bindings: [{
        descriptor: 'renderer:@muxui/react',
        binding,
        package: '@muxui/react',
        versionRange: reactRange,
        exportName: 'Button',
        specRevision: digest('3'),
        tokenRequirementSetDigests: { 'web.react': tokenDigest },
        platformSafetyRequirementSetDigests: safetyDigests,
      }],
    },
    bundle: './catalog.json',
  };
  return {
    'generated/catalog.json': bundleBytes,
    'generated/catalog-package.json': jsonBytes(catalogPackage),
    'generated/catalog.mjs': catalogModuleFor(bundleBytes),
  };
}

/**
 * Four tarballs' files. `versions` and `commits` (by package name) change what the tuple is, `catalogRange` and
 * `reactRange` the ranges it declares, `descriptorDigest` and `catalogTokenDigest` the token requirement digests the
 * descriptor and the catalog carry, and `exceptions` the React package's active exceptions.
 */
export function tupleFixture({ versions = {}, commits = {}, descriptorDigest = tokenDigests, catalogTokenDigest, catalogRange = '^3.0.0-rc.1', reactRange = '^0.1.0-0', exceptions = [], extra = {} } = {}) {
  const at = { '@muxui/schema': '0.6.0-rc.1', '@muxui/catalog': '3.0.0-rc.1', '@muxui/tooling': '1.1.0-rc.1', '@muxui/react': '0.1.0-rc.5', ...versions };
  const gitHead = (name) => commits[name] ?? commit;
  const files = {
    '@muxui/schema': {
      'package.json': { name: '@muxui/schema', version: at['@muxui/schema'], gitHead: gitHead('@muxui/schema') },
      'src/index.mjs': "export const SCHEMA_VERSION = '4.0.0';\nexport const API_VERSION = '3.0.0';\n",
    },
    '@muxui/catalog': {
      'package.json': { name: '@muxui/catalog', version: at['@muxui/catalog'], gitHead: gitHead('@muxui/catalog'), dependencies: { '@muxui/schema': `^${at['@muxui/schema']}` } },
      ...catalogFiles({ version: at['@muxui/catalog'], reactRange, tokenDigest: catalogTokenDigest }),
    },
    '@muxui/tooling': {
      'package.json': {
        name: '@muxui/tooling', version: at['@muxui/tooling'], gitHead: gitHead('@muxui/tooling'),
        dependencies: { '@muxui/catalog': catalogRange, '@muxui/schema': `^${at['@muxui/schema']}` },
      },
    },
    '@muxui/react': {
      'package.json': {
        name: '@muxui/react',
        version: at['@muxui/react'],
        gitHead: gitHead('@muxui/react'),
        muxUi: { rendererDescriptor: './generated/renderer-descriptor.json' },
        exports: { '.': './generated/index.mjs', './markdown': './generated/markdown.js' },
        dependencies: { 'lucide-react': lucideVersion },
      },
      'generated/button.js': `import { Check } from 'lucide-react/dist/esm/icons/check.mjs';\nexport const Button = () => Check;\n`,
      'generated/styles.css': '.muxui-button{color:red}\n',
      'generated/compatibility.mjs': 'export const reactCompatibility = {"schema":"muxui-react-compatibility-v1"};\n',
      'generated/release.json': { exceptions, componentExports: [{ name: 'Button', binding, module: '.' }] },
      'generated/renderer-descriptor.json': {
        id: 'renderer:@muxui/react',
        package: '@muxui/react',
        version: at['@muxui/react'],
        bindingSchemaRange: '^4.0.0',
        tokenContractRange: '^2.0.0',
        provenance: { releaseId: 'set later', sourceCommit: gitHead('@muxui/react') },
        bindings: { [binding]: { export: '@muxui/react#Button', specRevision: digest('3'), tokenRequirementSetDigests: descriptorDigest, platformSafetyRequirementSetDigests: safetyDigests } },
      },
    },
  };
  Object.assign(files, extra);
  return { versions: at, files };
}

let sequence = 0;
/** The tarball of a package's files: objects are written as the generators write JSON, and missing sidecars are written. */
export function archiveOf(files) {
  const root = join(scratch, `package-${sequence += 1}`);
  const written = Object.fromEntries(Object.entries(files).map(([path, content]) => [path, typeof content === 'string' ? content : jsonBytes(content)]));
  for (const [path, source] of Object.entries(sidecarPaths)) {
    if (path in written && !(`${path}.provenance` in written)) written[`${path}.provenance`] = sidecarFor(source, written[path]);
  }
  for (const [path, content] of Object.entries(written)) {
    mkdirSync(dirname(join(root, 'package', path)), { recursive: true });
    writeFileSync(join(root, 'package', path), content);
  }
  return deterministicArchive(join(root, 'package'));
}

/** Tarballs for the fixture; the React descriptor records the release id the manifest will carry. */
export function artifactsOf(fixture, { revision = commit } = {}) {
  const published = publishSet.packages.map(({ name }) => ({ name, version: fixture.versions[name] }));
  fixture.files['@muxui/react']['generated/renderer-descriptor.json'].provenance.releaseId = releaseIdFor({ revision, published });
  return new Map(publishSet.packages.map(({ name }) => [name, archiveOf(fixture.files[name])]));
}

/** The sources a release is bound to as committed: the lockfile, the token source, and a reader. */
export function committedStore() {
  const store = new Map();
  store.set('pnpm-lock.yaml', Buffer.from(`lockfileVersion: '9.0'\n\npackages:\n\n  lucide-react@${lucideVersion}:\n    resolution: {integrity: ${lucideIntegrity}}\n`));
  store.set('catalog/tokens/default-theme.json', Buffer.from('{"id":"muxui:token:default-theme"}\n'));
  return Object.assign(store, { read: (path) => store.get(path) });
}

export const readCommitted = committedStore().read;

export const manifestOf = (artifacts, options = {}) => buildPortfolioManifest({
  publishSet, artifacts, source: { revision: commit, tree }, readCommitted, preparation: { mode: 'full-checks' }, ...options,
});

/** A release: the tuple, its tarballs, and its manifest, all published from `commit`. */
export function releaseFixture(options = {}) {
  const tuple = tupleFixture(options);
  const artifacts = artifactsOf(tuple);
  return { tuple, artifacts, manifest: manifestOf(artifacts) };
}

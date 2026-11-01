// A small publish-set tuple for the release manifest and lineage tests: four tarballs with just the files the
// manifest reads, built with the same deterministic archive writer a release uses.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after } from 'node:test';
import { canonicalJson } from '../src/canonical-json.mjs';
import { deterministicArchive } from '../src/release-archive.mjs';
import { buildPortfolioManifest, releaseIdFor } from '../src/release-manifest.mjs';
import { readPublishSet } from '../src/release-set.mjs';

export const publishSet = readPublishSet(resolve(import.meta.dirname, '../../../..'));
const scratch = mkdtempSync(join(tmpdir(), 'muxui-release-tuple-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

export const commit = 'a'.repeat(40);
export const otherCommit = 'b'.repeat(40);
export const tree = 'c'.repeat(40);
export const digest = (character) => `sha256:${character.repeat(64)}`;

const tokenDigests = { 'web.react': digest('1') };
const safetyDigests = { 'web.react': digest('2') };
const binding = 'muxui:component:button#web.react';

export function tupleFixture({ versions = {}, commits = {}, catalogDigest = digest('d'), descriptorDigest = tokenDigests, catalogRange = '^2.1.0-rc.1', reactRange = '^0.1.0-0', extra = {} } = {}) {
  const at = { '@muxui/schema': '0.6.0-rc.1', '@muxui/catalog': '2.1.0-rc.1', '@muxui/tooling': '1.1.0-rc.1', '@muxui/react': '0.1.0-rc.5', ...versions };
  const gitHead = (name) => commits[name] ?? commit;
  const files = {
    '@muxui/schema': { 'package.json': { name: '@muxui/schema', version: at['@muxui/schema'], gitHead: gitHead('@muxui/schema') } },
    '@muxui/catalog': {
      'package.json': { name: '@muxui/catalog', version: at['@muxui/catalog'], gitHead: gitHead('@muxui/catalog'), dependencies: { '@muxui/schema': `^${at['@muxui/schema']}` } },
      'generated/catalog-package.json': {
        name: '@muxui/catalog',
        version: at['@muxui/catalog'],
        catalogVersion: at['@muxui/catalog'],
        catalogDigest,
        queryApiVersion: '2.1.0',
        supportedQueryApiVersions: ['2.1.0'],
        platformSafetyContract: { version: '1.0.0' },
        releaseManifest: {
          schemaVersion: '3.0.0',
          tokenContractVersion: '2.0.0',
          catalog: { id: `@muxui/catalog@${at['@muxui/catalog']}:${catalogDigest}`, version: at['@muxui/catalog'], digest: catalogDigest },
          bindings: [{
            binding, package: '@muxui/react', versionRange: reactRange, exportName: 'Button', specRevision: digest('3'),
            tokenRequirementSetDigests: tokenDigests, platformSafetyRequirementSetDigests: safetyDigests,
          }],
        },
      },
    },
    '@muxui/tooling': {
      'package.json': {
        name: '@muxui/tooling', version: at['@muxui/tooling'], gitHead: gitHead('@muxui/tooling'),
        dependencies: { '@muxui/catalog': catalogRange, '@muxui/schema': `^${at['@muxui/schema']}` },
      },
    },
    '@muxui/react': {
      'package.json': { name: '@muxui/react', version: at['@muxui/react'], gitHead: gitHead('@muxui/react'), muxUi: { rendererDescriptor: './generated/renderer-descriptor.json' } },
      'generated/compatibility.mjs': 'export const reactCompatibility = {"schema":"muxui-react-compatibility-v1"};\n',
      'generated/renderer-descriptor.json': {
        id: 'renderer:@muxui/react',
        package: '@muxui/react',
        version: at['@muxui/react'],
        bindingSchemaRange: '^3.0.0',
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
export function archiveOf(files) {
  const root = join(scratch, `package-${sequence += 1}`);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, 'package', path)), { recursive: true });
    writeFileSync(join(root, 'package', path), typeof content === 'string' ? content : `${canonicalJson(content)}\n`);
  }
  return deterministicArchive(join(root, 'package'));
}

/** Tarballs for the fixture; a published React descriptor records the release id the manifest will carry. */
export function artifactsOf(fixture, reused = new Map()) {
  const published = publishSet.packages.filter(({ name }) => !reused.has(name)).map(({ name }) => ({ name, version: fixture.versions[name] }));
  const id = releaseIdFor({ revision: commit, published });
  const react = fixture.files['@muxui/react']['generated/renderer-descriptor.json'];
  if (!reused.has('@muxui/react')) react.provenance.releaseId = id;
  return new Map(publishSet.packages.map(({ name }) => [name, archiveOf(fixture.files[name])]));
}

export const evidence = { capturedCiEvidence: [], retainedReviewEvidence: [], activeExceptions: [] };
export const manifestOf = (artifacts, options = {}) => buildPortfolioManifest({
  publishSet, artifacts, source: { revision: commit, tree }, evidence, react: { correlation: {} }, preparation: { mode: 'full-checks' }, ...options,
});

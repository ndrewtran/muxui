import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../src/canonical-json.mjs';
import { readArchive } from '../src/release-archive.mjs';
import { buildPortfolioManifest, caretAllows, releaseIdFor, sha256, verifyPortfolioRelease } from '../src/release-manifest.mjs';
import { archiveOf, artifactsOf, commit, digest, evidence, manifestOf, otherCommit, publishSet, tree, tupleFixture } from './release-tuple-fixture.mjs';

const requireFromTooling = createRequire(resolve(import.meta.dirname, '../../../../packages/tooling/package.json'));
const semver = requireFromTooling('semver');

test('the manifest\'s caret check agrees with node-semver on the ranges a release records', () => {
  const ranges = ['^2.1.0-rc.1', '^0.1.0-0', '^3.0.0', '^2.0.0', '^0.6.0-rc.1', '^1.1.0-rc.1', '^0.0.3', '^1.2.3-beta.2'];
  const versions = ['2.1.0-rc.1', '2.1.0-rc.2', '2.1.0-rc.10', '2.1.0', '2.1.5', '2.2.0-rc.1', '2.2.0', '3.0.0-rc.1', '3.0.0', '0.1.0-alpha.0', '0.1.0-rc.5',
    '0.1.0', '0.1.9', '0.2.0-rc.1', '0.2.0', '0.6.0-rc.1', '0.6.0', '0.7.0', '1.1.0-rc.1', '1.1.0-rc.2', '1.2.0', '0.0.3', '0.0.4', '1.2.3-beta.3', '1.2.3-alpha', '1.2.3', '1.3.0-beta.1'];
  for (const range of ranges) {
    for (const version of versions) assert.equal(caretAllows(range, version), semver.satisfies(version, range), `${version} in ${range}`);
  }
  assert.equal(caretAllows('2.1.0-rc.1', '2.1.0-rc.1'), true);
  assert.equal(caretAllows('2.1.0-rc.1', '2.1.0-rc.2'), false);
  assert.throws(() => caretAllows('>=2.1.0', '2.1.0'), /P2_1_RANGE_UNSUPPORTED/u);
});

const verify = (manifest, artifacts, expected = { revision: commit, tree }) => verifyPortfolioRelease({ manifest, artifacts, publishSet, expected });
// A manifest edited after the build, with its digest recomputed, so the verifier reaches the check under test.
const redigest = ({ digest: _digest, preparation, ...body }) => ({ ...body, digest: sha256(canonicalJson(body)), preparation });

test('E-P2.1-03 one manifest correlates the tuple: packages, catalog, contracts, descriptors, profile, evidence, rollback', () => {
  const artifacts = artifactsOf(tupleFixture());
  const manifest = manifestOf(artifacts);
  assert.equal(manifest.schema, 'muxui-portfolio-release-v1');
  assert.deepEqual(Object.keys(manifest).sort(), ['catalog', 'compatibility', 'contracts', 'descriptors', 'digest', 'evidence', 'id', 'packages', 'preparation', 'publication', 'react', 'reactCompatibility', 'rollback', 'schema', 'source']);
  assert.deepEqual(manifest.source, { revision: commit, tree });
  assert.deepEqual(manifest.packages.map(({ name, version, role }) => [name, version, role]), [
    ['@muxui/schema', '0.6.0-rc.1', 'published'], ['@muxui/catalog', '2.1.0-rc.1', 'published'],
    ['@muxui/tooling', '1.1.0-rc.1', 'published'], ['@muxui/react', '0.1.0-rc.5', 'published'],
  ]);
  for (const record of manifest.packages) {
    assert.match(record.integrity, /^sha512-/u);
    assert.deepEqual(record.provenance, { kind: 'release-commit', releaseId: manifest.id, sourceCommit: commit });
  }
  assert.deepEqual(manifest.catalog, { id: `@muxui/catalog@2.1.0-rc.1:${digest('d')}`, version: '2.1.0-rc.1', digest: digest('d') });
  assert.deepEqual([manifest.contracts.schemaVersion, manifest.contracts.queryApiVersion, manifest.contracts.tokenContractVersion], ['3.0.0', '2.1.0', '2.0.0']);
  assert.deepEqual(manifest.descriptors.map(({ id, version, bindings }) => [id, version, bindings]), [['renderer:@muxui/react', '0.1.0-rc.5', 1]]);
  assert.deepEqual(manifest.compatibility.edges.map(({ from, to, range }) => `${from}>${to}@${range}`), [
    '@muxui/catalog>@muxui/schema@^0.6.0-rc.1', '@muxui/tooling>@muxui/catalog@^2.1.0-rc.1', '@muxui/tooling>@muxui/schema@^0.6.0-rc.1',
  ]);
  assert.equal(manifest.reactCompatibility.schema, 'muxui-react-compatibility-v1');
  assert.deepEqual(manifest.rollback.packages.map(({ name, fixForward }) => [name, fixForward]), [
    ['@muxui/schema', '0.6.0-rc.2'], ['@muxui/catalog', '2.1.0-rc.2'], ['@muxui/tooling', '1.1.0-rc.2'], ['@muxui/react', '0.1.0-rc.6'],
  ]);
  assert.equal(manifest.rollback.status, 'prepared-not-exercised');
  assert.equal(manifest.publication.mutationPerformed, false);
  verify(manifest, artifacts);
});

test('E-P2.1-03 two preparations of one commit and tuple give one manifest digest, whatever ran and when', () => {
  const first = manifestOf(artifactsOf(tupleFixture()));
  const second = manifestOf(artifactsOf(tupleFixture()), { preparation: { mode: 'main-ci-reused', mainCi: { runId: 4242, runAttempt: 2 } } });
  assert.equal(first.digest, second.digest);
  assert.equal(canonicalJson({ ...first, preparation: null }), canonicalJson({ ...second, preparation: null }));
  assert.doesNotMatch(canonicalJson({ ...first, preparation: null }), /"(?:createdAt|generatedAt|timestamp|date)"/u);
  // Any change to the tuple moves it: one byte of one package, or the commit.
  const repacked = tupleFixture();
  repacked.files['@muxui/schema']['extra.txt'] = 'x';
  assert.notEqual(manifestOf(artifactsOf(repacked)).digest, first.digest);
  assert.notEqual(buildPortfolioManifest({
    publishSet, artifacts: artifactsOf(tupleFixture()), source: { revision: otherCommit, tree }, evidence, react: {}, preparation: {},
  }).digest, first.digest);
});

test('E-P2.1-03 the verifier rejects repacked bytes under the same version', () => {
  const artifacts = artifactsOf(tupleFixture());
  const manifest = manifestOf(artifacts);
  const repacked = tupleFixture();
  repacked.files['@muxui/tooling']['src/extra.mjs'] = 'export {};\n';
  const swapped = new Map(artifacts).set('@muxui/tooling', archiveOf(repacked.files['@muxui/tooling']));
  assert.throws(() => verify(manifest, swapped), /P2_1_MANIFEST_PACKAGE_REPACKED: @muxui\/tooling@1\.1\.0-rc\.1 is not the recorded bytes/u);
  // The manifest itself cannot be edited to match without moving its digest.
  assert.throws(() => verify({ ...manifest, source: { revision: commit, tree: 'd'.repeat(40) } }, artifacts), /P2_1_MANIFEST_DIGEST_MISMATCH/u);
});

test('E-P2.1-03 the verifier rejects a package missing from the tuple', () => {
  const artifacts = artifactsOf(tupleFixture());
  const manifest = manifestOf(artifacts);
  const withoutTooling = new Map(artifacts);
  withoutTooling.delete('@muxui/tooling');
  assert.throws(() => verify(manifest, withoutTooling), /P2_1_MANIFEST_PACKAGE_MISSING: the tuple has no @muxui\/tooling/u);
  const unlisted = redigest({ ...manifest, packages: manifest.packages.filter(({ name }) => name !== '@muxui/catalog') });
  assert.throws(() => verify(unlisted, artifacts), /P2_1_MANIFEST_PACKAGE_MISSING: the tuple has no @muxui\/catalog/u);
  const extra = redigest({ ...manifest, packages: [...manifest.packages, { ...manifest.packages[0], name: '@muxui/tokens' }] });
  assert.throws(() => verify(extra, artifacts), /P2_1_MANIFEST_PACKAGE_UNEXPECTED/u);
});

test('E-P2.1-03 the verifier rejects a published package built from another commit', () => {
  // The tarball was built elsewhere: its gitHead is not the release commit its record claims.
  const foreign = tupleFixture({ commits: { '@muxui/catalog': otherCommit } });
  const artifacts = artifactsOf(foreign);
  assert.throws(() => verify(manifestOf(artifacts), artifacts), /P2_1_MANIFEST_COMMIT_MISMATCH: @muxui\/catalog is built from b+, not its recorded a+/u);
  // The record owns up to it, as a published package: still not the release commit.
  const good = artifactsOf(tupleFixture());
  const manifest = manifestOf(good);
  const records = manifest.packages.map((record) => (record.name === '@muxui/schema' ? { ...record, provenance: { ...record.provenance, sourceCommit: otherCommit } } : record));
  assert.throws(() => verify(redigest({ ...manifest, packages: records }), good), /P2_1_MANIFEST_COMMIT_MISMATCH: @muxui\/schema is built from a+, not its recorded b+/u);
  const owned = tupleFixture({ commits: { '@muxui/schema': otherCommit } });
  const ownedArtifacts = artifactsOf(owned);
  const ownedManifest = manifestOf(ownedArtifacts);
  const ownedRecords = ownedManifest.packages.map((record) => (record.name === '@muxui/schema' ? { ...record, provenance: { ...record.provenance, sourceCommit: otherCommit } } : record));
  assert.throws(() => verify(redigest({ ...ownedManifest, packages: ownedRecords }), ownedArtifacts), /@muxui\/schema is published from b+, not the release commit a+/u);
  // The release itself must be the one asked for.
  assert.throws(() => verify(manifest, good, { revision: otherCommit }), /P2_1_MANIFEST_SOURCE_MISMATCH/u);
});

test('E-P2.1-03 a reused package keeps its recorded version, digest, and provenance, and must still be compatible', () => {
  // The earlier release published schema 0.6.0-rc.1 from another commit; this release reuses it.
  const earlier = { kind: 'release-commit', releaseId: 'muxui-portfolio:earlier', sourceCommit: otherCommit };
  const reused = new Map([['@muxui/schema', earlier]]);
  const fixture = tupleFixture({ commits: { '@muxui/schema': otherCommit } });
  const artifacts = artifactsOf(fixture, reused);
  const manifest = manifestOf(artifacts, { reused });
  assert.deepEqual(manifest.packages.map(({ name, role }) => [name, role]), [['@muxui/schema', 'reused'], ['@muxui/catalog', 'published'], ['@muxui/tooling', 'published'], ['@muxui/react', 'published']]);
  assert.deepEqual(manifest.packages[0].provenance, earlier);
  assert.equal(manifest.id, releaseIdFor({ revision: commit, published: manifest.packages.slice(1).map(({ name, version }) => ({ name, version })) }));
  verify(manifest, artifacts);

  // Its recorded digest does not hold: other bytes under the recorded version.
  const rebuilt = tupleFixture({ commits: { '@muxui/schema': otherCommit } });
  rebuilt.files['@muxui/schema']['changed.txt'] = 'x';
  assert.throws(() => verify(manifest, new Map(artifacts).set('@muxui/schema', archiveOf(rebuilt.files['@muxui/schema']))), /P2_1_MANIFEST_PACKAGE_REPACKED: @muxui\/schema@0\.6\.0-rc\.1/u);
  // Its recorded provenance does not hold: the bytes name another commit.
  const claimed = new Map([['@muxui/schema', { ...earlier, sourceCommit: 'e'.repeat(40) }]]);
  assert.throws(() => verify(manifestOf(artifacts, { reused: claimed }), artifacts), /P2_1_MANIFEST_COMMIT_MISMATCH: @muxui\/schema is built from b+, not its recorded e+/u);
  // It cannot record this release as its own origin.
  const self = redigest({ ...manifest, packages: manifest.packages.map((record) => (record.role === 'reused' ? { ...record, provenance: { ...earlier, releaseId: manifest.id } } : record)) });
  assert.throws(() => verify(self, artifacts), /P2_1_MANIFEST_PACKAGE_INVALID: @muxui\/schema is reused and records this release as its origin/u);

  // Its compatibility does not hold: a reused tooling asks for a catalog line the tuple does not carry.
  const toolingReused = new Map([['@muxui/tooling', earlier]]);
  const incompatible = tupleFixture({ commits: { '@muxui/tooling': otherCommit }, catalogRange: '^2.0.0' });
  incompatible.files['@muxui/catalog']['package.json'].version = '3.0.0-rc.1';
  incompatible.files['@muxui/catalog']['generated/catalog-package.json'] = {
    ...incompatible.files['@muxui/catalog']['generated/catalog-package.json'], version: '3.0.0-rc.1', catalogVersion: '3.0.0-rc.1',
    releaseManifest: { ...incompatible.files['@muxui/catalog']['generated/catalog-package.json'].releaseManifest, catalog: { id: 'x', version: '3.0.0-rc.1', digest: digest('d') } },
  };
  incompatible.versions['@muxui/catalog'] = '3.0.0-rc.1';
  const incompatibleArtifacts = artifactsOf(incompatible, toolingReused);
  assert.throws(() => verify(manifestOf(incompatibleArtifacts, { reused: toolingReused }), incompatibleArtifacts), /P2_1_MANIFEST_COMPATIBILITY_BROKEN: @muxui\/tooling requires @muxui\/catalog@\^2\.0\.0, and the tuple has 3\.0\.0-rc\.1/u);
});

test('E-P2.1-03 a reused renderer must still match the new catalog\'s binding revisions, digests, and range', () => {
  const earlier = { kind: 'release-commit', releaseId: 'muxui-portfolio:earlier', sourceCommit: otherCommit };
  const reused = new Map([['@muxui/react', earlier]]);
  const compatible = tupleFixture({ commits: { '@muxui/react': otherCommit } });
  compatible.files['@muxui/react']['generated/renderer-descriptor.json'].provenance = { releaseId: earlier.releaseId, sourceCommit: otherCommit };
  const artifacts = artifactsOf(compatible, reused);
  verify(manifestOf(artifacts, { reused }), artifacts);

  // The catalog changed a requirement digest the reused descriptor still carries.
  const drifted = tupleFixture({ commits: { '@muxui/react': otherCommit }, descriptorDigest: { 'web.react': digest('9') } });
  drifted.files['@muxui/react']['generated/renderer-descriptor.json'].provenance = { releaseId: earlier.releaseId, sourceCommit: otherCommit };
  const driftedArtifacts = artifactsOf(drifted, reused);
  assert.throws(() => verify(manifestOf(driftedArtifacts, { reused }), driftedArtifacts), /P2_1_MANIFEST_COMPATIBILITY_BROKEN: @muxui\/react: muxui:component:button#web\.react token requirement digests differ/u);
  // The catalog's range for the renderer no longer admits the reused version.
  const outside = tupleFixture({ commits: { '@muxui/react': otherCommit }, reactRange: '^0.2.0-0' });
  outside.files['@muxui/react']['generated/renderer-descriptor.json'].provenance = { releaseId: earlier.releaseId, sourceCommit: otherCommit };
  const outsideArtifacts = artifactsOf(outside, reused);
  assert.throws(() => verify(manifestOf(outsideArtifacts, { reused }), outsideArtifacts), /range \^0\.2\.0-0 does not admit 0\.1\.0-rc\.5/u);
});

test('the deterministic archive reads back the files it was built from, in name order', () => {
  const archive = archiveOf({ 'package.json': { name: 'x' }, 'b/two.txt': 'two', 'a/one.txt': 'one' });
  assert.deepEqual([...readArchive(archive)].map(([name, bytes]) => [name, bytes.toString()]), [
    ['package/a/one.txt', 'one'], ['package/b/two.txt', 'two'], ['package/package.json', '{"name":"x"}\n'],
  ]);
  assert.deepEqual(archiveOf({ 'package.json': { name: 'x' }, 'b/two.txt': 'two', 'a/one.txt': 'one' }), archive);
});

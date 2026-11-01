import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../src/canonical-json.mjs';
import { readArchive } from '../src/release-archive.mjs';
import { caretAllows, readEvidenceRecord, releaseIdFor, sha256, sha512Integrity, verifyPortfolioRelease } from '../src/release-manifest.mjs';
import {
  archiveOf, artifactsOf, catalogFiles, catalogModuleFor, commit, digest, committedStore, jsonBytes, manifestOf, otherCommit, publishSet, readCommitted, sidecarFor, tree, tupleFixture,
} from './release-tuple-fixture.mjs';

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

const verify = (manifest, artifacts, options = {}) => verifyPortfolioRelease({
  manifest, artifacts, publishSet, expected: { revision: commit, tree }, readCommitted, ...options,
});
// A manifest edited after the build, with its digest recomputed, so the verifier reaches the check under test.
const redigest = ({ digest: _digest, preparation, ...body }) => ({ ...body, digest: sha256(canonicalJson(body)), preparation });
const honest = () => {
  const artifacts = artifactsOf(tupleFixture());
  return { artifacts, manifest: manifestOf(artifacts) };
};
const catalogOf = (change) => {
  const fixture = tupleFixture();
  change(fixture.files['@muxui/catalog']);
  return fixture;
};

test('E-P2.1-03 one manifest correlates the tuple: packages, catalog, contracts, descriptors, profile, evidence, rollback', () => {
  const { artifacts, manifest } = honest();
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
  const catalogPackage = JSON.parse(readArchive(artifacts.get('@muxui/catalog')).get('package/generated/catalog-package.json'));
  assert.deepEqual(manifest.catalog, { id: `@muxui/catalog@2.1.0-rc.1:${catalogPackage.catalogDigest}`, version: '2.1.0-rc.1', digest: catalogPackage.catalogDigest });
  assert.deepEqual(manifest.contracts, {
    schemaVersion: '3.0.0', queryApiVersion: '2.1.0', supportedQueryApiVersions: ['2.1.0'], tokenContractVersion: '2.0.0', platformSafetyContractVersion: '1.0.0',
  });
  assert.deepEqual(manifest.descriptors.map(({ id, version, bindings }) => [id, version, bindings]), [['renderer:@muxui/react', '0.1.0-rc.5', 1]]);
  assert.deepEqual(manifest.compatibility.edges.map(({ from, to, range }) => `${from}>${to}@${range}`), [
    '@muxui/catalog>@muxui/schema@^0.6.0-rc.1', '@muxui/tooling>@muxui/catalog@^2.1.0-rc.1', '@muxui/tooling>@muxui/schema@^0.6.0-rc.1',
  ]);
  assert.equal(manifest.reactCompatibility.schema, 'muxui-react-compatibility-v1');
  assert.deepEqual(manifest.evidence.capturedCiEvidence.map(({ milestone }) => milestone), ['R1.1', 'R1.2', 'R1.3', 'R1.4', 'R1.5']);
  assert.deepEqual(manifest.evidence.retainedReviewEvidence[0].milestones, ['R1.2', 'R1.3', 'R1.4']);
  assert.deepEqual(manifest.evidence.activeExceptions, []);
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
  assert.notEqual(manifestOf(artifactsOf(tupleFixture()), { source: { revision: otherCommit, tree } }).digest, first.digest);
});

test('E-P2.1-03 the verifier rejects repacked bytes under the same version', () => {
  const { artifacts, manifest } = honest();
  const repacked = tupleFixture();
  repacked.files['@muxui/tooling']['src/extra.mjs'] = 'export {};\n';
  const swapped = new Map(artifacts).set('@muxui/tooling', archiveOf(repacked.files['@muxui/tooling']));
  assert.throws(() => verify(manifest, swapped), /P2_1_MANIFEST_PACKAGE_REPACKED: @muxui\/tooling@1\.1\.0-rc\.1 is not the recorded bytes/u);
  // The manifest itself cannot be edited to match without moving its digest.
  assert.throws(() => verify({ ...manifest, source: { revision: commit, tree: 'd'.repeat(40) } }, artifacts), /P2_1_MANIFEST_DIGEST_MISMATCH/u);
});

test('E-P2.1-03 the verifier rejects a package missing from the tuple', () => {
  const { artifacts, manifest } = honest();
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
  const foreign = artifactsOf(tupleFixture({ commits: { '@muxui/catalog': otherCommit } }));
  assert.throws(() => verify(manifestOf(foreign), foreign), /P2_1_MANIFEST_COMMIT_MISMATCH: @muxui\/catalog is built from b+, not its recorded a+/u);
  // The record owns up to it, as a published package: still not the release commit.
  const { artifacts, manifest } = honest();
  const records = manifest.packages.map((record) => (record.name === '@muxui/schema' ? { ...record, provenance: { ...record.provenance, sourceCommit: otherCommit } } : record));
  assert.throws(() => verify(redigest({ ...manifest, packages: records }), artifacts), /P2_1_MANIFEST_COMMIT_MISMATCH: @muxui\/schema is built from a+, not its recorded b+/u);
  const owned = artifactsOf(tupleFixture({ commits: { '@muxui/schema': otherCommit } }));
  const ownedManifest = manifestOf(owned);
  const ownedRecords = ownedManifest.packages.map((record) => (record.name === '@muxui/schema' ? { ...record, provenance: { ...record.provenance, sourceCommit: otherCommit } } : record));
  assert.throws(() => verify(redigest({ ...ownedManifest, packages: ownedRecords }), owned), /@muxui\/schema is published from b+, not the release commit a+/u);
  // The release itself must be the one asked for.
  assert.throws(() => verify(manifest, artifacts, { expected: { revision: otherCommit } }), /P2_1_MANIFEST_SOURCE_MISMATCH/u);
});

// ---- the catalog is verified, not copied ----

test('E-P2.1-03 the catalog bundle is recomputed: an emptied bundle under the old declared digest is rejected', () => {
  const rejects = (change, pattern) => {
    const artifacts = artifactsOf(catalogOf(change));
    assert.throws(() => manifestOf(artifacts), pattern);
    // The verifier reads the same bytes, so a manifest recorded from the honest tuple fails on the tampered tarball.
    const { manifest } = honest();
    assert.throws(() => verify(manifest, new Map(artifactsOf(tupleFixture())).set('@muxui/catalog', artifacts.get('@muxui/catalog'))), pattern);
  };
  // catalog.json = {} with the digest the package record still declares (its sidecar and module follow the new bytes).
  rejects((files) => {
    files['generated/catalog.json'] = '{}\n';
    files['generated/catalog.mjs'] = catalogModuleFor('{}\n');
  }, /P2_1_MANIFEST_CATALOG_INVALID: the bundle digest undefined is not its content's sha256:/u);
  // A changed artifact under the old digest.
  rejects((files) => {
    const bundle = JSON.parse(files['generated/catalog.json']);
    bundle.artifacts[0].name = 'Other';
    files['generated/catalog.json'] = jsonBytes(bundle);
    files['generated/catalog.mjs'] = catalogModuleFor(jsonBytes(bundle));
  }, /the bundle digest sha256:[0-9a-f]{64} is not its content's/u);
  // A bundle whose own digest is honest but that the package record does not declare.
  rejects((files) => {
    const bundle = JSON.parse(files['generated/catalog.json']);
    const { catalogDigest: _digest, ...preimage } = bundle;
    preimage.artifacts[0].name = 'Other';
    const tampered = jsonBytes({ ...preimage, catalogDigest: sha256(canonicalJson(preimage)) });
    files['generated/catalog.json'] = tampered;
    files['generated/catalog.mjs'] = catalogModuleFor(tampered);
  }, /the package and release records declare another catalog digest/u);
  // Both sidecars and the module must hold: a stale sidecar, a missing file, and a module with another bundle.
  rejects((files) => { files['generated/catalog.json.provenance'] = sidecarFor('packages/catalog/generated/catalog.json', Buffer.from('old')); }, /generated\/catalog\.json: its provenance sidecar does not record/u);
  rejects((files) => { files['generated/catalog-package.json.provenance'] = 'junk'; }, /generated\/catalog-package\.json: its provenance sidecar is missing or malformed/u);
  rejects((files) => { delete files['generated/catalog.mjs']; }, /@muxui\/catalog has no generated\/catalog\.mjs/u);
  rejects((files) => { files['generated/catalog.mjs'] = catalogFiles({ version: '2.1.0-rc.1', sourceRevision: digest('6') })['generated/catalog.mjs']; }, /generated\/catalog\.mjs does not hold the bundle/u);
  // The release record must say what the bundle says: its binding digests, its versions.
  rejects((files) => {
    const record = JSON.parse(files['generated/catalog-package.json']);
    record.releaseManifest.bindings[0].tokenRequirementSetDigests = { 'web.react': digest('9') };
    files['generated/catalog-package.json'] = jsonBytes(record);
  }, /muxui:component:button#web\.react in the release record is not what the bundle holds/u);
  rejects((files) => {
    const record = JSON.parse(files['generated/catalog-package.json']);
    record.releaseManifest.tokenContractVersion = '9.0.0';
    files['generated/catalog-package.json'] = jsonBytes(record);
  }, /the release record names another token contract version/u);
  rejects((files) => {
    const record = JSON.parse(files['generated/catalog-package.json']);
    record.tokenRequirementSets = { 'muxui:component:button#web.react:web.react': digest('9') };
    files['generated/catalog-package.json'] = jsonBytes(record);
  }, /the package record's token requirement sets differ from the bundle's/u);
});

// ---- contracts, evidence, exceptions, rollback are recomputed ----

test('E-P2.1-03 contracts, evidence, exceptions, publication, and rollback are recomputed, not trusted', () => {
  const { artifacts, manifest } = honest();
  const forged = (key, value) => redigest({ ...manifest, [key]: value });
  const rejects = (key, value) => assert.throws(() => verify(forged(key, value), artifacts), /P2_1_MANIFEST_RECORD_MISMATCH: the recorded .* is not what the tarballs and the committed sources hold/u, key);
  rejects('contracts', { ...manifest.contracts, schemaVersion: '9.9.9' });
  rejects('contracts', { ...manifest.contracts, tokenContractVersion: '1.0.0' });
  rejects('evidence', { ...manifest.evidence, activeExceptions: [digest('e')] });
  rejects('evidence', { ...manifest.evidence, capturedCiEvidence: [] });
  rejects('evidence', { ...manifest.evidence, retainedReviewEvidence: [] });
  rejects('evidence', { capturedCiEvidence: [], retainedReviewEvidence: [], activeExceptions: [] });
  rejects('rollback', {});
  rejects('rollback', { ...manifest.rollback, forbidden: [] });
  rejects('publication', { ...manifest.publication, mutationPerformed: true });
  rejects('publication', undefined);

  // An exception the React package declares is bound by digest; one it does not declare cannot be recorded.
  const exception = { id: 'EX-1', reason: 'documented' };
  const excepted = artifactsOf(tupleFixture({ exceptions: [exception] }));
  const exceptedManifest = manifestOf(excepted);
  assert.deepEqual(exceptedManifest.evidence.activeExceptions, [sha256(canonicalJson(exception))]);
  verify(exceptedManifest, excepted);
  assert.throws(() => verify(redigest({ ...exceptedManifest, evidence: { ...exceptedManifest.evidence, activeExceptions: [] } }), excepted), /the recorded evidence is not what/u);

  // The schema package must declare the contract versions the catalog bundle implements.
  const schema = tupleFixture();
  schema.files['@muxui/schema']['src/index.mjs'] = "export const SCHEMA_VERSION = '3.1.0';\nexport const API_VERSION = '2.1.0';\n";
  assert.throws(() => manifestOf(artifactsOf(schema)), /P2_1_MANIFEST_CONTRACT_MISMATCH: @muxui\/schema declares schema 3\.1\.0 and query API 2\.1\.0/u);
});

test('E-P2.1-03 the retained evidence is bound to the committed bytes, and must be committed', () => {
  const { artifacts, manifest } = honest();
  // A retained index edited after the manifest was written.
  const edited = committedStore();
  edited.set('tests/evidence/r1.3/index.json', Buffer.from('{"milestone":"R1.3","edited":true}\n'));
  assert.throws(() => verify(manifest, artifacts, { readCommitted: edited.read }), /the recorded evidence is not what/u);
  const review = committedStore();
  review.set('tests/evidence/r1-retro-review/index.json', Buffer.from('{"milestones":["R1.2"],"records":[]}\n'));
  assert.throws(() => verify(manifest, artifacts, { readCommitted: review.read }), /the recorded evidence is not what/u);
  // An index that is not committed, or no way to read them, is not a verified release.
  const missing = committedStore();
  missing.delete('tests/evidence/r1.5/index.json');
  assert.throws(() => verify(manifest, artifacts, { readCommitted: missing.read }), /P2_1_MANIFEST_EVIDENCE_MISSING: tests\/evidence\/r1\.5\/index\.json is not committed/u);
  assert.throws(() => verify(manifest, artifacts, { readCommitted: undefined }), /P2_1_MANIFEST_EVIDENCE_UNVERIFIABLE/u);
  assert.throws(() => readEvidenceRecord(undefined), /P2_1_MANIFEST_EVIDENCE_UNVERIFIABLE/u);
});

// ---- the React correlation is recomputed ----

test('E-P2.1-03 the react correlation block is recomputed from the tarballs and the committed sources, not trusted', () => {
  const { artifacts, manifest } = honest();
  assert.deepEqual(Object.keys(manifest.react).sort(), ['bindings', 'catalog', 'generatedOutputs', 'lockfile', 'tokens', 'visualContract']);
  assert.deepEqual(manifest.react.bindings.map(({ binding }) => binding), ['muxui:component:button#web.react']);
  assert.deepEqual(manifest.react.lockfile, { path: 'pnpm-lock.yaml', sha256: sha256(readCommitted('pnpm-lock.yaml')) });
  assert.deepEqual(manifest.react.generatedOutputs.entries.map(({ path }) => path).filter((path) => !path.endsWith('.provenance')),
    ['generated/button.js', 'generated/compatibility.mjs', 'generated/release.json', 'generated/renderer-descriptor.json', 'generated/styles.css']);
  assert.equal(manifest.react.visualContract.inputs.lucide.version, '1.2.3');
  assert.deepEqual(manifest.react.visualContract.inputs.lucide.icons, { 'generated/button.js': ['check'] });
  verify(manifest, artifacts);

  const recordMismatch = /P2_1_MANIFEST_RECORD_MISMATCH: the recorded react is not what the tarballs and the committed sources hold/u;
  // The block deleted, or recorded as nothing, is not a verified release.
  const { react: _react, ...withoutBlock } = manifest;
  assert.throws(() => verify(redigest(withoutBlock), artifacts), recordMismatch);
  assert.throws(() => verify(redigest({ ...manifest, react: null }), artifacts), recordMismatch);
  assert.throws(() => verify(redigest({ ...manifest, react: {} }), artifacts), recordMismatch);

  // One forged identity, with the digest recomputed so the verifier reaches the check.
  const forge = (change) => {
    const react = structuredClone(manifest.react);
    change(react);
    return redigest({ ...manifest, react });
  };
  const forgeries = {
    lockfile: (react) => { react.lockfile.sha256 = digest('f'); },
    'generated outputs digest': (react) => { react.generatedOutputs.digest = digest('f'); },
    'generated output entry': (react) => { react.generatedOutputs.entries[0].sha256 = digest('f'); },
    'generated output dropped': (react) => { react.generatedOutputs.entries.pop(); },
    'catalog digest': (react) => { react.catalog.digest = digest('f'); },
    'catalog version': (react) => { react.catalog.version = '2.1.0-rc.9'; },
    'catalog source revision': (react) => { react.catalog.sourceRevision = digest('f'); },
    'token revision': (react) => { react.tokens.contentRevision = digest('f'); },
    'token contract': (react) => { react.tokens.tokenContractVersion = '9.9.9'; },
    'binding spec revision': (react) => { react.bindings[0].specRevision = digest('f'); },
    'binding requirement set': (react) => { react.bindings[0].tokenRequirementSet = digest('f'); },
    'binding added': (react) => { react.bindings.push({ ...react.bindings[0], binding: 'muxui:component:other#web.react' }); },
    'visual contract digest': (react) => { react.visualContract.digest = digest('f'); },
    'visual contract lucide integrity': (react) => { react.visualContract.inputs.lucide.integrity = `sha512-${'B'.repeat(86)}==`; },
    'visual contract compared': (react) => { react.visualContract.comparison = 'matched'; },
    'source field': (react) => { react.source = { revision: commit, tree }; },
    'workspace packages field': (react) => { react.packages = []; },
  };
  for (const [name, change] of Object.entries(forgeries)) assert.throws(() => verify(forge(change), artifacts), recordMismatch, name);

  // The committed sources moved after the manifest was written: another lockfile or token source, or either missing.
  const relocked = committedStore();
  relocked.set('pnpm-lock.yaml', Buffer.concat([relocked.get('pnpm-lock.yaml'), Buffer.from('# edited\n')]));
  assert.throws(() => verify(manifest, artifacts, { readCommitted: relocked.read }), recordMismatch);
  const retokened = committedStore();
  retokened.set('catalog/tokens/default-theme.json', Buffer.from('{"id":"muxui:token:default-theme","edited":true}\n'));
  assert.throws(() => verify(manifest, artifacts, { readCommitted: retokened.read }), recordMismatch);
  const unlocked = committedStore();
  unlocked.delete('pnpm-lock.yaml');
  assert.throws(() => verify(manifest, artifacts, { readCommitted: unlocked.read }), /P2_1_MANIFEST_EVIDENCE_MISSING: pnpm-lock\.yaml is not committed/u);
  const untokened = committedStore();
  untokened.delete('catalog/tokens/default-theme.json');
  assert.throws(() => manifestOf(artifacts, { readCommitted: untokened.read }), /P2_1_MANIFEST_EVIDENCE_MISSING: catalog\/tokens\/default-theme\.json is not committed/u);

  // A lockfile that does not lock the renderer's Lucide version gives the visual contract nothing to bind.
  const unlockedLucide = committedStore();
  unlockedLucide.set('pnpm-lock.yaml', Buffer.from("lockfileVersion: '9.0'\n"));
  assert.throws(() => manifestOf(artifacts, { readCommitted: unlockedLucide.read }), /R1_EXIT_VISUAL_CONTRACT_INVALID: Lucide requires an exact version and lockfile integrity/u);

  // A renderer that is reused keeps the block of the release that published it: this release records none, and may not forge one.
  const reuse = reuseScenario({ reuse: ['@muxui/react'] });
  const reused = manifestOf(reuse.artifacts, { reused: reuse.reused });
  assert.equal('react' in reused, false);
  verify(reused, reuse.artifacts, { priorManifests: reuse.priorManifests });
  assert.throws(() => verify(redigest({ ...reused, react: manifest.react }), reuse.artifacts, { priorManifests: reuse.priorManifests }), recordMismatch);
});

// ---- the renderer descriptor ----

test('E-P2.1-02 the verifier requires the catalog\'s renderer descriptor at its pointer, with its id and sidecar, and one-member export identities', () => {
  const rejectsBuild = (change, pattern) => {
    const fixture = tupleFixture();
    change(fixture.files['@muxui/react']);
    assert.throws(() => manifestOf(artifactsOf(fixture)), pattern);
  };
  rejectsBuild((files) => { delete files['package.json'].muxUi; }, /P2_1_MANIFEST_PACKAGE_INVALID: @muxui\/react points at undefined/u);
  rejectsBuild((files) => { files['package.json'].muxUi.rendererDescriptor = './generated/other.json'; }, /points at "\.\/generated\/other\.json"/u);
  rejectsBuild((files) => { files['generated/renderer-descriptor.json'].id = 'renderer:@muxui/other'; }, /descriptor is renderer:@muxui\/other for @muxui\/react, not renderer:@muxui\/react/u);
  rejectsBuild((files) => { files['generated/renderer-descriptor.json.provenance'] = sidecarFor('packages/react/generated/renderer-descriptor.json', Buffer.from('old')); }, /its provenance sidecar does not record/u);

  // Export identities that the installed resolver rejects are incompatible on the bytes too.
  const identity = (value) => {
    const fixture = tupleFixture();
    fixture.files['@muxui/react']['generated/renderer-descriptor.json'].bindings[binding].export = value;
    const artifacts = artifactsOf(fixture);
    return () => verify(manifestOf(artifacts), artifacts);
  };
  const binding = 'muxui:component:button#web.react';
  for (const bad of ['@muxui/react#Button#junk', '@muxui/react/button#Button', '@muxui/react/markdown#Other', '@muxui/other#Button', '@muxui/react', '@muxui/react#']) {
    assert.throws(identity(bad), /P2_1_MANIFEST_COMPATIBILITY_BROKEN: @muxui\/react: .*(?:is not a public @muxui\/react module and one member|export is not Button)/u, bad);
  }
  identity('@muxui/react#Button')();
});

// ---- reuse ----

// An earlier release at another commit, and a new release that reuses `names` from it.
function reuseScenario({ reuse, release = {}, earlier = {} }) {
  const allEarlier = Object.fromEntries(publishSet.packages.map(({ name }) => [name, otherCommit]));
  const earlierArtifacts = artifactsOf(tupleFixture({ commits: allEarlier, ...earlier }), { revision: otherCommit });
  const earlierManifest = manifestOf(earlierArtifacts, { source: { revision: otherCommit, tree } });
  const reused = new Map(reuse.map((name) => [name, earlierManifest.packages.find((record) => record.name === name)]));
  const artifacts = artifactsOf(tupleFixture({ commits: Object.fromEntries(reuse.map((name) => [name, otherCommit])), ...release }), { reused });
  for (const name of reuse) artifacts.set(name, earlierArtifacts.get(name));
  return { earlierArtifacts, earlierManifest, reused, artifacts, priorManifests: new Map([[earlierManifest.id, earlierManifest]]) };
}

test('E-P2.1-03 a reused package is the record of the release that published it, field for field and byte for byte', () => {
  const { earlierManifest, reused, artifacts, priorManifests } = reuseScenario({ reuse: ['@muxui/schema'] });
  const manifest = manifestOf(artifacts, { reused });
  assert.deepEqual(manifest.packages.map(({ name, role }) => [name, role]), [['@muxui/schema', 'reused'], ['@muxui/catalog', 'published'], ['@muxui/tooling', 'published'], ['@muxui/react', 'published']]);
  assert.deepEqual(manifest.packages[0], { ...earlierManifest.packages[0], role: 'reused' });
  assert.equal(manifest.id, releaseIdFor({ revision: commit, published: manifest.packages.slice(1).map(({ name, version }) => ({ name, version })) }));
  verify(manifest, artifacts, { priorManifests });

  // Repacked bytes under the same version and original provenance cannot be recorded...
  const repacked = tupleFixture({ commits: { '@muxui/schema': otherCommit } });
  repacked.files['@muxui/schema']['extra.txt'] = 'x';
  const repackedArtifacts = new Map(artifacts).set('@muxui/schema', archiveOf(repacked.files['@muxui/schema']));
  assert.throws(() => manifestOf(repackedArtifacts, { reused }), /P2_1_MANIFEST_REUSE_MISMATCH: @muxui\/schema is not the package its earlier release recorded/u);
  // ...and a forged record for them does not match the earlier release's.
  const newBytes = repackedArtifacts.get('@muxui/schema');
  const forged = redigest({ ...manifest, packages: manifest.packages.map((record) => (record.name === '@muxui/schema'
    ? { ...record, integrity: sha512Integrity(newBytes), sha256: sha256(newBytes) }
    : record)) });
  assert.throws(() => verify(forged, repackedArtifacts, { priorManifests }), /P2_1_MANIFEST_REUSE_MISMATCH: @muxui\/schema@0\.6\.0-rc\.1 is not the record muxui-portfolio:[0-9a-f]+ published/u);
  // Any other field of the record is held to it too.
  const relabelled = redigest({ ...manifest, packages: manifest.packages.map((record) => (record.name === '@muxui/schema' ? { ...record, provenance: { ...record.provenance, sourceCommit: commit } } : record)) });
  assert.throws(() => verify(relabelled, artifacts, { priorManifests }), /P2_1_MANIFEST_COMMIT_MISMATCH/u);

  // A reuse needs the earlier manifest, verified: none, another release, or one that no longer matches its digest.
  assert.throws(() => verify(manifest, artifacts), /P2_1_MANIFEST_REUSE_UNVERIFIED: @muxui\/schema is reused from muxui-portfolio:[0-9a-f]+, which has no verified earlier manifest/u);
  assert.throws(() => verify(manifest, artifacts, { priorManifests: new Map([['muxui-portfolio:other', earlierManifest]]) }), /P2_1_MANIFEST_REUSE_UNVERIFIED/u);
  const tampered = { ...earlierManifest, source: { ...earlierManifest.source, tree: 'd'.repeat(40) } };
  assert.throws(() => verify(manifest, artifacts, { priorManifests: new Map([[earlierManifest.id, tampered]]) }), /P2_1_MANIFEST_REUSE_UNVERIFIED/u);
  // It cannot name this release as its own origin.
  const self = redigest({ ...manifest, packages: manifest.packages.map((record) => (record.role === 'reused' ? { ...record, provenance: { ...record.provenance, releaseId: manifest.id } } : record)) });
  assert.throws(() => verify(self, artifacts, { priorManifests }), /P2_1_MANIFEST_PACKAGE_INVALID: @muxui\/schema is reused and records this release as its origin/u);
});

test('E-P2.1-03 a reused package must still be compatible with the new tuple', () => {
  // Tooling asked for a catalog line the new tuple does not carry.
  const incompatible = reuseScenario({ reuse: ['@muxui/tooling'], release: { versions: { '@muxui/catalog': '3.0.0-rc.1' } } });
  const manifest = manifestOf(incompatible.artifacts, { reused: incompatible.reused });
  assert.throws(() => verify(manifest, incompatible.artifacts, { priorManifests: incompatible.priorManifests }), /P2_1_MANIFEST_COMPATIBILITY_BROKEN: @muxui\/tooling requires @muxui\/catalog@\^2\.1\.0-rc\.1, and the tuple has 3\.0\.0-rc\.1/u);

  // The renderer still carries the requirement digests the catalog has since changed.
  const drifted = reuseScenario({ reuse: ['@muxui/react'], release: { catalogTokenDigest: digest('9') } });
  const driftedManifest = manifestOf(drifted.artifacts, { reused: drifted.reused });
  assert.throws(() => verify(driftedManifest, drifted.artifacts, { priorManifests: drifted.priorManifests }), /P2_1_MANIFEST_COMPATIBILITY_BROKEN: @muxui\/react: muxui:component:button#web\.react token requirement digests differ/u);

  // The catalog's range for the renderer no longer admits the reused version.
  const outside = reuseScenario({ reuse: ['@muxui/react'], release: { reactRange: '^0.2.0-0' } });
  const outsideManifest = manifestOf(outside.artifacts, { reused: outside.reused });
  assert.throws(() => verify(outsideManifest, outside.artifacts, { priorManifests: outside.priorManifests }), /range \^0\.2\.0-0 does not admit 0\.1\.0-rc\.5/u);

  // A compatible reuse verifies.
  const compatible = reuseScenario({ reuse: ['@muxui/react'] });
  verify(manifestOf(compatible.artifacts, { reused: compatible.reused }), compatible.artifacts, { priorManifests: compatible.priorManifests });
});

test('the deterministic archive reads back the files it was built from, in name order', () => {
  const archive = archiveOf({ 'package.json': { name: 'x' }, 'b/two.txt': 'two', 'a/one.txt': 'one' });
  assert.deepEqual([...readArchive(archive)].map(([name, bytes]) => [name, bytes.toString()]), [
    ['package/a/one.txt', 'one'], ['package/b/two.txt', 'two'], ['package/package.json', '{"name":"x"}\n'],
  ]);
  assert.deepEqual(archiveOf({ 'package.json': { name: 'x' }, 'b/two.txt': 'two', 'a/one.txt': 'one' }), archive);
});

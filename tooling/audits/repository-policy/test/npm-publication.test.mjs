import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import * as npm from '../src/npm-publication.mjs';
import { verifyCandidate, verifyDryRun } from '../src/release-lineage.mjs';
import { PORTFOLIO_MANIFEST_FILE, tarballFileName } from '../src/release-set.mjs';
import { createRegistry } from './registry-fake.mjs';
import { archiveOf, artifactsOf, commit, manifestOf, otherCommit, publishSet, readCommitted, tree, tupleFixture } from './release-tuple-fixture.mjs';

// The publish job of npm-publish.yml against an in-process registry (E-P2.1-06): no network, no registry mutation.
const scratch = mkdtempSync(join(tmpdir(), 'muxui-npm-publication-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const names = publishSet.packages.map(({ name }) => name);
const [schema, catalog, tooling, react] = names;
// The first portfolio release: the three new packages' rc.1 and @muxui/react's next number.
const first = { schema: '0.6.0-rc.1', catalog: '2.1.0-rc.1', tooling: '1.1.0-rc.1', react: '0.1.0-rc.5' };
const versionOf = { [schema]: first.schema, [catalog]: first.catalog, [tooling]: first.tooling, [react]: first.react };
const draftIntegrity = (character) => `sha512-${character.repeat(86)}==`;

// The temporary first-publish token of these runs; no test log may ever hold it.
const temporaryToken = 'npm_temporary_first_publish_token';

let sequence = 0;
/**
 * A candidate directory as the publish job downloads it (the set's tarballs and one portfolio manifest) with the
 * environment that names it. `revision` builds the whole release at another commit.
 */
function candidateOf({ versions = {}, revision = commit } = {}) {
  const tuple = tupleFixture({ versions, commits: Object.fromEntries(names.map((name) => [name, revision])) });
  const artifacts = artifactsOf(tuple, { revision });
  const manifest = manifestOf(artifacts, { source: { revision, tree } });
  const directory = join(scratch, `candidate-${sequence += 1}`);
  mkdirSync(directory);
  for (const [name, bytes] of artifacts) writeFileSync(join(directory, tarballFileName(name, tuple.versions[name])), bytes);
  writeFileSync(join(directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify(manifest));
  const integrity = manifest.packages.find((record) => record.name === react).integrity;
  const text = names.map((name) => `${name}=${tuple.versions[name]}`).join(',');
  return {
    directory, manifest, artifacts, integrity, text, versions: new Map(names.map((name) => [name, tuple.versions[name]])),
    environment: { GITHUB_SHA: commit, CANDIDATE_DIR: directory, MUXUI_RELEASE_VERSIONS: text, EXPECTED_SHA512: integrity, RUNNER_TEMP: scratch, NPM_TOKEN: temporaryToken },
  };
}

// @muxui/react has its rc.1 to rc.4 history; the three new packages are absent.
const reactHistory = () => ({
  [react]: {
    versions: Object.fromEntries([1, 2, 3, 4].map((rc) => [`0.1.0-rc.${rc}`, draftIntegrity(String(rc))])),
    tags: { latest: '0.1.0-rc.1', next: '0.1.0-rc.4' },
  },
});

/** One publish run's two jobs against `registry`: the prepare job's promotion checks, then the publish job. */
function publishRun({ registry, candidate = candidateOf(), github = dryRunGithub(), sha = commit, environment = {}, lines = [] }) {
  const io = { ...registry.io({ log: (line) => lines.push(line) }), publish: registry.publish };
  const env = { ...candidate.environment, GITHUB_SHA: sha, ...environment };
  return {
    lines,
    run: async () => {
      // prepare: Verify dry run, Verify promoted candidate (needs: prepare, so a failure here ends the run before approval).
      await verifyDryRun({ repository, sha, dryRunId: '555', currentRunId: '777', github });
      verifyCandidate({ directory: candidate.directory, publishSet, versions: candidate.versions, expectedSha512: candidate.integrity, sha, tree, readCommitted });
      // publish: Re-verify candidate, Publish the set in order.
      await npm.main('verify-candidate', env, io);
      await npm.main('publish-set', env, io);
    },
  };
}

const repository = 'ndrewtran/muxui';
const dryRunRun = (overrides) => ({
  id: 555, path: '.github/workflows/npm-publish.yml', event: 'workflow_dispatch', head_branch: 'main', head_sha: commit, status: 'completed',
  conclusion: 'success', run_attempt: 1, repository: { full_name: repository }, head_repository: { full_name: repository }, ...overrides,
});
// A scripted read-only GitHub client answering for dry run 555.
const dryRunGithub = (overrides = {}) => async (path) => {
  if (path.includes('/jobs')) return { jobs: [{ name: 'prepare', conclusion: 'success', steps: [{ name: 'Upload candidate', conclusion: 'success' }] }, { name: 'publish', conclusion: 'skipped' }] };
  if (path.includes('/artifacts')) {
    return { artifacts: [{ id: 9, name: 'npm-candidate', size_in_bytes: 4096, digest: `sha256:${'a'.repeat(64)}`, expired: false, workflow_run: { id: 555, head_sha: commit } }] };
  }
  return dryRunRun(overrides);
};

test('every package has its own rc rule: a first publish is its rc.1, a later one the next number over next', () => {
  assert.deepEqual(npm.parseCandidate(catalog, '2.1.0-rc.3'), { base: '2.1.0', rc: 3 });
  for (const invalid of ['2.1.0', '2.1.0-rc.0', '2.1.0-rc.01', '2.1.0-beta.1', ' 2.1.0-rc.2', '2.1.0-rc.2\n', '', undefined]) {
    assert.throws(() => npm.parseCandidate(catalog, invalid), /not an admitted candidate version for @muxui\/catalog/u, String(invalid));
  }
  // @muxui/react stays pinned to 0.1.0-rc.N (Roadmap R1 exit).
  assert.equal(npm.parseCandidate(react, '0.1.0-rc.5').rc, 5);
  assert.throws(() => npm.parseCandidate(react, '2.1.0-rc.1'), /not an admitted candidate version for @muxui\/react \(0\.1\.0-rc\.N/u);
  assert.equal(npm.fixForwardVersion('2.1.0-rc.1', catalog), '2.1.0-rc.2');
  assert.equal(npm.fixForwardVersion('0.1.0-rc.4'), '0.1.0-rc.5');

  const classify = (name, version, versionStatus, packument) => npm.classifyPreflight({ name, version, versionStatus, packument });
  const document = (tags, ...versions) => ({ 'dist-tags': tags, versions: Object.fromEntries(versions.map((version) => [version, {}])) });
  assert.deepEqual(classify(schema, '0.6.0-rc.1', 404, null), { kind: 'first', latest: '', next: '' });
  assert.throws(() => classify(schema, '0.6.0-rc.2', 404, null), /@muxui\/schema is absent, so only 0\.6\.0-rc\.1 can be a first publish/u);

  const published = document({ latest: '2.1.0-rc.1', next: '2.1.0-rc.2' }, '2.1.0-rc.1', '2.1.0-rc.2');
  assert.deepEqual(classify(catalog, '2.1.0-rc.3', 404, published), { kind: 'later', latest: '2.1.0-rc.1', next: '2.1.0-rc.2' });
  assert.throws(() => classify(catalog, '2.1.0-rc.4', 404, published), /must be the next release candidate after next \(rc\.N\+1\); next points at 2\.1\.0-rc\.2/u);
  // A new base version is its own decision, never an automatic continuation.
  assert.throws(() => classify(catalog, '2.2.0-rc.1', 404, published), /must be the next release candidate/u);
  assert.throws(() => classify(catalog, '2.1.0-rc.2', 200, published), /@muxui\/catalog@2\.1\.0-rc\.2 is already on the registry/u);
  assert.throws(() => classify(catalog, '2.1.0-rc.2', 404, published), /is listed in the packument/u);
  assert.throws(() => classify(catalog, '2.1.0-rc.3', 404, document({ latest: '2.1.0-rc.1', next: '2.1.0-rc.2', beta: '2.1.0-rc.1' }, '2.1.0-rc.1', '2.1.0-rc.2')), /Expected exactly latest and next/u);
  assert.throws(() => classify(catalog, '2.1.0-rc.3', 500, null), /Unexpected HTTP 500/u);
});

test('a release names one admitted version for every member of the publish set', () => {
  const text = names.map((name) => `${name}=${versionOf[name]}`).join(',');
  assert.deepEqual([...npm.parseVersionPairs(text, publishSet)], [[schema, first.schema], [catalog, first.catalog], [tooling, first.tooling], [react, first.react]]);
  const rejects = (value, message) => assert.throws(() => npm.parseVersionPairs(value, publishSet), message, value);
  rejects('', /missing @muxui\/schema, @muxui\/catalog, @muxui\/tooling, @muxui\/react/u);
  rejects(text.replace(`,${react}=${first.react}`, ''), /missing @muxui\/react/u);
  rejects(`${text},${react}=0.1.0-rc.6`, /@muxui\/react is listed twice/u);
  rejects(`${text},@muxui/tokens=1.0.0-rc.1`, /@muxui\/tokens is not in the publish set/u);
  rejects(text.replace(first.react, '0.2.0-rc.1'), /not an admitted candidate version for @muxui\/react/u);
  rejects(text.replace(first.tooling, '1.1.0'), /not an admitted candidate version for @muxui\/tooling/u);
  rejects(`${text},bad`, /"bad" is not name=version/u);
});

test('the publish job reads the candidate as the manifest records it and publishes only what it published', () => {
  const candidate = candidateOf();
  const read = (overrides = {}) => npm.readCandidateSet({
    directory: candidate.directory, publishSet, versions: candidate.versions, revision: commit, expectedIntegrity: candidate.integrity, ...overrides,
  });
  const packages = read();
  assert.deepEqual(packages.map(({ name, version }) => [name, version]), names.map((name) => [name, candidate.versions.get(name)]));
  assert.deepEqual(packages.map(({ integrity }) => integrity), candidate.manifest.packages.map(({ integrity }) => integrity));
  assert.ok(packages.every(({ file }) => file.startsWith(candidate.directory)));

  // A package the release reuses is not published again.
  const reused = candidateOf();
  const edited = structuredClone(reused.manifest);
  edited.packages[0].role = 'reused';
  writeFileSync(join(reused.directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify(edited));
  assert.deepEqual(npm.readCandidateSet({ directory: reused.directory, publishSet, versions: reused.versions, revision: commit, expectedIntegrity: reused.integrity }).map(({ name }) => name), [catalog, tooling, react]);
  edited.packages[0].role = 'draft';
  writeFileSync(join(reused.directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify(edited));
  assert.throws(() => npm.readCandidateSet({ directory: reused.directory, publishSet, versions: reused.versions, revision: commit, expectedIntegrity: reused.integrity }), /@muxui\/schema has role "draft"/u);

  assert.throws(() => read({ expectedIntegrity: '' }), /the tarball-sha512 input is empty/u);
  assert.throws(() => read({ versions: new Map([...candidate.versions, [catalog, '2.1.0-rc.2']]) }), /Expected exactly the tarball of each package/u);
});

test('the set publishes in publish order, each package preflighted, rechecked, published, and read back before the next', async () => {
  const registry = createRegistry({ seed: reactHistory() });
  const { run, lines } = publishRun({ registry });
  await run();

  // The three new packages first-publish with the temporary token; @muxui/react exists and publishes through OIDC.
  assert.deepEqual(registry.writes, names.map((name) => ({ op: 'publish', name, version: versionOf[name], tag: 'next', auth: name === react ? 'oidc' : 'token' })));
  assert.ok(!lines.join('\n').includes(temporaryToken), 'the token is never echoed');
  // A package's read-back finishes before the next package's publish begins.
  const at = (line) => lines.findIndex((entry) => entry === line);
  for (const [index, name] of names.slice(0, -1).entries()) {
    const done = at(`Published ${name}@${versionOf[name]} (${index + 1} of 4)`);
    assert.ok(done > 0 && done < at(`Publishing ${names[index + 1]}@${versionOf[names[index + 1]]} (${index + 2} of 4)`), name);
  }
  // Every package was preflighted before the first publish.
  assert.ok(at('Preflight passed for 4 packages; publishing in order.') < at(`Publishing ${schema}@${first.schema} (1 of 4)`));
  // The registry set latest on each first publish, and next moved over @muxui/react's history without touching latest.
  assert.deepEqual(registry.packument(schema)['dist-tags'], { next: first.schema, latest: first.schema });
  assert.deepEqual(registry.packument(react)['dist-tags'], { latest: '0.1.0-rc.1', next: first.react });
});

// E-P2.1-06: simulated refusals, with no registry mutation. Each stops the release before any publish.
test('E-P2.1-06 refusals: a version collision stops the whole set before the first publish', async () => {
  const collide = async (seed, message, candidate) => {
    const registry = createRegistry({ seed: { ...reactHistory(), ...seed } });
    const { run } = publishRun({ registry, candidate });
    await assert.rejects(run(), message);
    assert.deepEqual(registry.writes, [], 'nothing was published, not even the packages before the collision');
  };
  // A later package's version is already on the registry: schema and catalog must not publish either.
  await collide({ [tooling]: { versions: { [first.tooling]: draftIntegrity('t') }, tags: { latest: first.tooling, next: first.tooling } } }, /@muxui\/tooling@1\.1\.0-rc\.1 is already on the registry/u);
  await collide({ [react]: { versions: { ...reactHistory()[react].versions, [first.react]: draftIntegrity('5') }, tags: { latest: '0.1.0-rc.1', next: first.react } } }, /@muxui\/react@0\.1\.0-rc\.5 is already on the registry/u);
  // The first-publish and next-lineage rules, per package.
  await collide({}, /@muxui\/schema is absent, so only 0\.6\.0-rc\.1 can be a first publish/u, candidateOf({ versions: { [schema]: '0.6.0-rc.2' } }));
  await collide({ [catalog]: { versions: { '2.1.0-rc.3': draftIntegrity('c'), '2.1.0-rc.4': draftIntegrity('d') }, tags: { latest: '2.1.0-rc.3', next: '2.1.0-rc.4' } } }, /must be the next release candidate after next/u);
});

test('E-P2.1-06 refusals: an artifact-integrity mismatch stops the release before any publish', async () => {
  const refuse = async ({ candidate = candidateOf(), environment = {}, message, edit }) => {
    const registry = createRegistry({ seed: reactHistory() });
    edit?.(candidate);
    const io = { ...registry.io(), publish: registry.publish };
    const env = { ...candidate.environment, ...environment };
    await assert.rejects(npm.main('publish-set', env, io), message);
    assert.deepEqual(registry.writes, []);
  };
  // A tarball repacked under its recorded version: the bytes differ from the manifest's integrity.
  const repacked = tupleFixture();
  repacked.files[tooling]['src/extra.mjs'] = 'export {};\n';
  await refuse({
    edit: ({ directory }) => writeFileSync(join(directory, tarballFileName(tooling, first.tooling)), archiveOf(repacked.files[tooling])),
    message: /@muxui\/tooling@1\.1\.0-rc\.1 tarball is sha512-.*; the release manifest records sha512-/u,
  });
  // The operator authorized another @muxui/react digest.
  await refuse({ environment: { EXPECTED_SHA512: draftIntegrity('x') }, message: /@muxui\/react is sha512-.*; the tarball-sha512 input is sha512-x+==/u });
  await refuse({ environment: { EXPECTED_SHA512: '' }, message: /the tarball-sha512 input is empty/u });
  // A manifest edited after preparation to match another artifact.
  await refuse({
    edit: ({ directory, manifest }) => writeFileSync(join(directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify({ ...manifest, packages: manifest.packages.map((record) => (record.name === catalog ? { ...record, integrity: draftIntegrity('m') } : record)) })),
    message: /@muxui\/catalog@2\.1\.0-rc\.1 tarball is sha512-.*; the release manifest records sha512-m+==/u,
  });
});

test('E-P2.1-06 refusals: an invalid promotion lineage stops the release before any publish', async () => {
  const refuse = async ({ github, candidate, sha, environment, message }) => {
    const registry = createRegistry({ seed: reactHistory() });
    const { run } = publishRun({ registry, github, candidate, sha, environment });
    await assert.rejects(run(), message);
    assert.deepEqual(registry.writes, []);
    assert.deepEqual(registry.requests, [], 'no registry read either: the lineage fails before the publish job starts');
  };
  // A dry run at another commit, from another workflow, or never a successful dispatch.
  await refuse({ github: dryRunGithub({ head_sha: otherCommit }), message: /ran at b+, not a+/u });
  await refuse({ github: dryRunGithub({ path: '.github/workflows/ci.yml' }), message: /is \.github\/workflows\/ci\.yml, not \.github\/workflows\/npm-publish\.yml/u });
  await refuse({ github: dryRunGithub({ event: 'push' }), message: /ran on push, not workflow_dispatch/u });
  // A candidate that another commit built, promoted at this one.
  await refuse({ candidate: candidateOf({ revision: otherCommit }), message: /P2_1_MANIFEST_SOURCE_MISMATCH: the manifest source revision is b+, not a+/u });
  // A candidate of other versions than the inputs name.
  const stale = candidateOf({ versions: { [react]: '0.1.0-rc.6' } });
  await refuse({ candidate: { ...stale, versions: new Map([...stale.versions, [react, first.react]]) }, message: /Expected exactly the tarball of each package and one release manifest/u });

  // The publish job repeats the lineage it can read from the bytes, in case its artifact is not the one prepare checked.
  const registry = createRegistry({ seed: reactHistory() });
  const io = { ...registry.io(), publish: registry.publish };
  const candidate = candidateOf({ revision: otherCommit });
  await assert.rejects(npm.main('verify-candidate', candidate.environment, io), /The release manifest is for b+; this run is at a+/u);
  const other = candidateOf();
  await assert.rejects(npm.main('verify-candidate', { ...other.environment, MUXUI_RELEASE_VERSIONS: other.text.replace(first.react, '0.1.0-rc.6') }, io), /Expected exactly the tarball of each package/u);
  await assert.rejects(npm.main('publish-set', { ...other.environment, GITHUB_SHA: 'main' }, io), /GITHUB_SHA is "main"/u);
  await assert.rejects(npm.main('publish-set', { ...other.environment, CANDIDATE_DIR: 'relative/dir' }, io), /CANDIDATE_DIR is "relative\/dir"/u);
  assert.deepEqual(registry.writes, []);
});

// The rehearsal: a later package fails after earlier ones published. The recovery is a plan, never executed here.
async function failedRun({ faults }) {
  const registry = createRegistry({ seed: reactHistory(), faults });
  const candidate = candidateOf();
  const { run, lines } = publishRun({ registry, candidate });
  const error = await run().then(() => assert.fail('the run should stop'), (stopped) => stopped);
  return { registry, candidate, error, lines };
}

test('E-P2.1-06 rehearsal: a refused publish after earlier packages published stops the set and deprecates nothing', async () => {
  const { registry, candidate, error, lines } = await failedRun({ faults: { refuse: [tooling] } });
  assert.match(error.message, /tooling@1\.1\.0-rc\.1: npm error code E403|E403/u);
  // schema and catalog published and verified; tooling was attempted and refused; react was never reached.
  assert.deepEqual(registry.writes.map(({ name }) => name), [schema, catalog]);
  assert.deepEqual(error.progress.verified.map(({ name }) => name), [schema, catalog]);
  assert.deepEqual(error.progress.failed, { name: tooling, version: first.tooling, phase: 'publish' });
  assert.equal(registry.packument(tooling), null);
  assert.deepEqual(registry.packument(react)['dist-tags'], { latest: '0.1.0-rc.1', next: '0.1.0-rc.4' }, '@muxui/react is untouched');
  assert.ok(!lines.some((line) => line.startsWith(`Publishing ${react}`)));

  // The plan: healthy versions stay published, a package that never published needs no deprecation, no one is deprecated.
  const plan = lines.filter((line) => /^- |^\d+\. |^Recovery plan/u.test(line));
  assert.deepEqual(plan.slice(0, 5), [
    'Recovery plan (a plan only; nothing was deprecated, unpublished, or re-tagged):',
    `- ${schema}@${first.schema}: healthy; published and verified; stays published and is not deprecated`,
    `- ${catalog}@${first.catalog}: healthy; published and verified; stays published and is not deprecated`,
    `- ${tooling}@${first.tooling}: absent; never published; nothing to deprecate`,
    `- ${react}@${first.react}: not-attempted; never attempted; nothing to do`,
  ]);
  assert.ok(plan.some((line) => /verify the tuple again against a new release manifest; no record is rewritten/u.test(line)));
  assert.ok(!plan.some((line) => /deprecate \S+@|deprecate \d/u.test(line.replace(/nothing to deprecate|is not deprecated/gu, ''))));
  assert.ok(registry.writes.every(({ op }) => op === 'publish'), 'the fake registry saw publishes only');

  // Fix forward in a new dispatch: tooling and react never published and keep their versions; the packages that did publish
  // move to their next rc. The tuple is verified again against a new manifest, and the first release's record is untouched.
  const before = readFileSync(join(candidate.directory, PORTFOLIO_MANIFEST_FILE), 'utf8');
  const fixed = candidateOf({ versions: { [schema]: '0.6.0-rc.2', [catalog]: '2.1.0-rc.2' } });
  const verified = verifyCandidate({ directory: fixed.directory, publishSet, versions: fixed.versions, expectedSha512: fixed.integrity, sha: commit, tree, readCommitted });
  assert.notEqual(verified.digest, candidate.manifest.digest, 'a new release manifest');
  registry.faults.refuse = [];
  await publishRun({ registry, candidate: fixed }).run();
  assert.deepEqual(registry.writes.map(({ name, version }) => `${name}@${version}`), [
    `${schema}@${first.schema}`, `${catalog}@${first.catalog}`, `${schema}@0.6.0-rc.2`, `${catalog}@2.1.0-rc.2`, `${tooling}@${first.tooling}`, `${react}@${first.react}`,
  ]);
  assert.equal(readFileSync(join(candidate.directory, PORTFOLIO_MANIFEST_FILE), 'utf8'), before, 'no record is rewritten');
  assert.ok(registry.writes.every(({ op }) => op === 'publish'));
});

test('E-P2.1-06 rehearsal: a failed read-back deprecates only the version that published bad bytes and fixes it forward', async () => {
  const { registry, error, lines } = await failedRun({ faults: { corrupt: [catalog] } });
  assert.equal(error.title, 'Registry integrity mismatch');
  assert.deepEqual(error.progress.failed, { name: catalog, version: first.catalog, phase: 'read-back' });
  // The set stopped at the bad package: tooling and react never published.
  assert.deepEqual(registry.writes.map(({ name }) => name), [schema, catalog]);
  const plan = lines.filter((line) => /^- |^\d+\. |^Recovery plan/u.test(line));
  assert.deepEqual(plan.slice(1, 5), [
    `- ${schema}@${first.schema}: healthy; published and verified; stays published and is not deprecated`,
    `- ${catalog}@${first.catalog}: bad-bytes; published bad bytes; deprecate ${first.catalog} (separate explicit authorization) and fix forward to 2.1.0-rc.2`,
    `- ${tooling}@${first.tooling}: not-attempted; never attempted; nothing to do`,
    `- ${react}@${first.react}: not-attempted; never attempted; nothing to do`,
  ]);
  assert.ok(plan.some((line) => /@muxui\/catalog: published bad bytes; deprecate 2\.1\.0-rc\.1/u.test(line)), 'the steps name the one deprecation');
  assert.equal(plan.filter((line) => /: published bad bytes; deprecate/u.test(line)).length, 1);
  assert.ok(registry.writes.every(({ op }) => op === 'publish'));
});

test('E-P2.1-06 rehearsal: a read-back that cannot see the version, or sees it unattested, is a decision and not a deprecation', async () => {
  const lagging = await failedRun({ faults: { invisible: [tooling] } });
  assert.equal(lagging.error.title, 'Registry propagation timeout');
  assert.ok(lagging.lines.includes(`- ${tooling}@${first.tooling}: unverified; registry state unknown; read it again before deciding, and deprecate nothing until it is known`));
  const unattested = await failedRun({ faults: { unattested: [catalog] } });
  assert.equal(unattested.error.title, 'Provenance missing');
  assert.ok(unattested.lines.includes(`- ${catalog}@${first.catalog}: unattested; published the candidate bytes without provenance; stop for a decision, and deprecate nothing automatically`));
  for (const { registry } of [lagging, unattested]) assert.ok(registry.writes.every(({ op }) => op === 'publish'));
});

test('a recovery plan deprecates a version only when the registry holds other bytes for it', () => {
  const set = [{ name: schema, version: first.schema }, { name: catalog, version: first.catalog }];
  const plan = (assessed) => npm.planRecovery({ set, assessed }).packages.map(({ state, deprecate, fixForward }) => ({ state, deprecate, fixForward }));
  assert.deepEqual(plan([]), [{ state: 'not-attempted', deprecate: false, fixForward: undefined }, { state: 'not-attempted', deprecate: false, fixForward: undefined }]);
  assert.deepEqual(plan([{ name: schema, state: 'healthy' }, { name: catalog, state: 'bad-bytes' }]), [
    { state: 'healthy', deprecate: false, fixForward: undefined }, { state: 'bad-bytes', deprecate: true, fixForward: '2.1.0-rc.2' },
  ]);
  for (const state of ['absent', 'healthy', 'unattested', 'unverified']) {
    assert.ok(plan([{ name: schema, state }, { name: catalog, state }]).every(({ deprecate }) => deprecate === false), state);
  }
  assert.ok(npm.planRecovery({ set, assessed: [] }).steps.includes('verify the tuple again against a new release manifest; no record is rewritten'));
});

test('the publication CLI preflights the whole set read-only, and verifies a candidate before publishing', async () => {
  const registry = createRegistry({ seed: reactHistory() });
  const candidate = candidateOf();
  const lines = [];
  const summary = join(scratch, `summary-${sequence += 1}`);
  writeFileSync(summary, '');
  const io = { ...registry.io({ log: (line) => lines.push(line) }), publish: registry.publish };
  await npm.main('preflight-set', { MUXUI_RELEASE_VERSIONS: candidate.text, GITHUB_STEP_SUMMARY: summary }, io);
  assert.deepEqual(lines.splice(0), [
    `${schema}@${first.schema}: 404 (no collision)`, `${schema} absent (first publish; the registry will set latest)`,
    `${catalog}@${first.catalog}: 404 (no collision)`, `${catalog} absent (first publish; the registry will set latest)`,
    `${tooling}@${first.tooling}: 404 (no collision)`, `${tooling} absent (first publish; the registry will set latest)`,
    `${react}@${first.react}: 404 (no collision)`, `${react} dist-tags latest=0.1.0-rc.1 next=0.1.0-rc.4`,
  ]);
  assert.match(readFileSync(summary, 'utf8'), /^### Registry preflight\n\n- @muxui\/schema@0\.6\.0-rc\.1: absent/u);
  assert.deepEqual(registry.writes, []);

  await npm.main('verify-candidate', candidate.environment, io);
  assert.match(lines.splice(0)[0], /^Candidate verified: @muxui\/schema@0\.6\.0-rc\.1 sha512-.*, @muxui\/catalog@2\.1\.0-rc\.1 sha512-/u);
  assert.deepEqual(registry.writes, [], 'verification publishes nothing');
  await assert.rejects(npm.main('preflight-set', { MUXUI_RELEASE_VERSIONS: '' }, io), /missing @muxui\/schema/u);
  await assert.rejects(npm.main('unknown', {}, io), /Expected validate-version, check-npm, preflight, preflight-set, recheck, read-back, verify-candidate, or publish-set/u);

  await npm.main('publish-set', { ...candidate.environment, GITHUB_STEP_SUMMARY: summary }, io);
  assert.match(readFileSync(summary, 'utf8'), /### Published to next\n\n- @muxui\/schema@0\.6\.0-rc\.1: `sha512-.*`, dist-tags `\{"next":"0\.6\.0-rc\.1","latest":"0\.6\.0-rc\.1"\}`/u);
  assert.deepEqual(registry.writes.map(({ name }) => name), names);
});

// The first publish of a package that does not exist yet (npm trust needs an existing package) uses the temporary token;
// an existing package publishes through OIDC; the run never falls back from one to the other.
const existingPackage = (name, rc) => ({ [name]: { versions: { [rc]: draftIntegrity('e') }, tags: { latest: rc, next: rc } } });

test('a set with three first publishes uses the token for exactly those three and OIDC for @muxui/react', async () => {
  const registry = createRegistry({ seed: reactHistory() });
  const lines = [];
  const candidate = candidateOf();
  const environment = { ...candidate.environment };
  await npm.main('publish-set', environment, { ...registry.io({ log: (line) => lines.push(line) }), publish: registry.publish });
  assert.deepEqual(registry.writes.map(({ name, auth }) => [name, auth]), [[schema, 'token'], [catalog, 'token'], [tooling, 'token'], [react, 'oidc']]);
  assert.deepEqual(lines.filter((line) => line.startsWith('Authentication for ')), [
    `Authentication for ${schema}: temporary npm token (first publish)`,
    `Authentication for ${catalog}: temporary npm token (first publish)`,
    `Authentication for ${tooling}: temporary npm token (first publish)`,
    `Authentication for ${react}: trusted publishing (OIDC)`,
  ]);
  assert.ok(!lines.join('\n').includes(temporaryToken));
  assert.equal(environment.NPM_TOKEN, undefined, 'the token leaves the environment once read, so no later child inherits it');
  // Provenance is read back for a first publish as for any other.
  for (const { name } of registry.writes) assert.ok(registry.packument(name).versions[versionOf[name]].dist.attestations.provenance);
});

test('a first publish without the token refuses before any write and never falls back', async () => {
  for (const NPM_TOKEN of ['', undefined]) {
    const registry = createRegistry({ seed: reactHistory() });
    const lines = [];
    const candidate = candidateOf();
    await assert.rejects(
      npm.main('publish-set', { ...candidate.environment, NPM_TOKEN }, { ...registry.io({ log: (line) => lines.push(line) }), publish: registry.publish }),
      (error) => error.title === 'First publish needs a token'
        && /^@muxui\/schema, @muxui\/catalog, @muxui\/tooling do not exist on npm yet, and trusted publishing cannot create a package\./u.test(error.message) && !error.message.includes(react),
    );
    assert.deepEqual(registry.writes, [], 'nothing was published, not even @muxui/react');
    assert.ok(!lines.includes('Preflight passed for 4 packages; publishing in order.'));
  }
  // One new package is named alone, and a token that is not one line is refused before the registry is read.
  const registry = createRegistry({ seed: { ...reactHistory(), ...existingPackage(schema, '0.6.0-rc.1'), ...existingPackage(catalog, '2.1.0-rc.1') } });
  const candidate = candidateOf({ versions: { [schema]: '0.6.0-rc.2', [catalog]: '2.1.0-rc.2' } });
  await assert.rejects(npm.main('publish-set', { ...candidate.environment, NPM_TOKEN: '' }, { ...registry.io(), publish: registry.publish }), /@muxui\/tooling does not exist on npm yet/u);
  const requests = registry.requests.length;
  await assert.rejects(npm.main('publish-set', { ...candidate.environment, NPM_TOKEN: 'two words' }, { ...registry.io(), publish: registry.publish }), /NPM_TOKEN is not a single-line token/u);
  assert.equal(registry.requests.length, requests);
  assert.deepEqual(registry.writes, []);
});

test('a token that is present is not used for a package that already exists', async () => {
  // schema and catalog exist (rc.2 follows their rc.1); tooling is new; the token is set.
  const registry = createRegistry({ seed: { ...reactHistory(), ...existingPackage(schema, '0.6.0-rc.1'), ...existingPackage(catalog, '2.1.0-rc.1') } });
  const candidate = candidateOf({ versions: { [schema]: '0.6.0-rc.2', [catalog]: '2.1.0-rc.2' } });
  await publishRun({ registry, candidate }).run();
  assert.deepEqual(registry.writes.map(({ name, auth }) => [name, auth]), [[schema, 'oidc'], [catalog, 'oidc'], [tooling, 'token'], [react, 'oidc']]);

  // With every package existing, no token is used at all, and none is needed.
  const existing = createRegistry({ seed: { ...reactHistory(), ...existingPackage(schema, '0.6.0-rc.1'), ...existingPackage(catalog, '2.1.0-rc.1'), ...existingPackage(tooling, '1.1.0-rc.1') } });
  const later = candidateOf({ versions: { [schema]: '0.6.0-rc.2', [catalog]: '2.1.0-rc.2', [tooling]: '1.1.0-rc.2' } });
  await publishRun({ registry: existing, candidate: later, environment: { NPM_TOKEN: '' } }).run();
  assert.deepEqual(existing.writes.map(({ auth }) => auth), ['oidc', 'oidc', 'oidc', 'oidc']);
});

test('npm publish inherits no credential, and a first publish gets the token as config of that one process', () => {
  const environment = {
    PATH: '/usr/bin', NPM_TOKEN: temporaryToken, NODE_AUTH_TOKEN: 'other', 'npm_config_//registry.npmjs.org/:_authToken': 'config', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request',
  };
  const existing = npm.publishEnvironment(environment, undefined);
  assert.deepEqual(Object.keys(existing).sort(), ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'PATH', 'npm_config_engine_strict'], 'the OIDC request stays, every npm credential goes');
  const first = npm.publishEnvironment(environment, temporaryToken);
  assert.equal(first['npm_config_//registry.npmjs.org/:_authToken'], temporaryToken);
  assert.equal(first.NPM_TOKEN, undefined);
  assert.equal(first.NODE_AUTH_TOKEN, undefined);
  assert.equal(first.ACTIONS_ID_TOKEN_REQUEST_URL, 'https://oidc.example');
  assert.equal(environment.NPM_TOKEN, temporaryToken, 'the caller\'s environment is not edited');
});

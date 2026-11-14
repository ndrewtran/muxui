import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';
import * as npm from '../src/npm-publication.mjs';
import { loadReuse, verifyCandidate, verifyDryRun } from '../src/release-lineage.mjs';
import { planReuse } from '../src/release-effects.mjs';
import { buildPortfolioManifest, verifyPortfolioRelease } from '../src/release-manifest.mjs';
import { PORTFOLIO_MANIFEST_FILE, parseReleaseVersions, readPublishSet, readSourceVersions, tarballFileName } from '../src/release-set.mjs';
import { createRegistry } from './registry-fake.mjs';
import {
  archiveOf, artifactsOf, commit, firstReleaseFixture, manifestOf, otherCommit, publishSet, readCommitted, secondCommit, secondTree, successorFixture, tree, tupleFixture,
} from './release-tuple-fixture.mjs';

// The publish job of npm-publish.yml against an in-process registry (E-P2.1-06): no network, no registry mutation.
const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const scratch = mkdtempSync(join(tmpdir(), 'muxui-npm-publication-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const names = publishSet.packages.map(({ name }) => name);
const [schema, catalog, tooling, react] = names;
// The first portfolio release: the three new packages' rc.1 and @muxui/react's next number.
const first = { schema: '0.6.0-rc.1', catalog: '3.0.0-rc.1', tooling: '1.1.0-rc.1', react: '0.1.0-rc.5' };
const versionOf = { [schema]: first.schema, [catalog]: first.catalog, [tooling]: first.tooling, [react]: first.react };
// What the recovery plan says of an attempted package the registry does not show.
const unverifiedPlan = 'the publish may have landed and is not visible yet; stop for a decision, re-check the registry later, do not republish this version, and deprecate nothing until it is known';
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
  // The tarball-sha512 input authorizes exactly the tarballs this release publishes: every package, for the first release.
  const integrity = manifest.packages.map((record) => record.integrity).join(',');
  const text = names.map((name) => `${name}=${tuple.versions[name]}`).join(',');
  return {
    directory, manifest, artifacts, integrity, text, tree, versions: new Map(names.map((name) => [name, tuple.versions[name]])),
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

/**
 * One publish run's two jobs against `registry`: the prepare job's promotion checks (a reused package is fetched from the
 * registry and checked against the manifests the repository retains), then the publish job.
 */
function publishRun({ registry, candidate = candidateOf(), github = dryRunGithub({}, candidate.environment.GITHUB_SHA), sha = candidate.environment.GITHUB_SHA, environment = {}, lines = [] }) {
  const io = { ...registry.io({ log: (line) => lines.push(line) }), publish: registry.publish };
  const env = { ...candidate.environment, GITHUB_SHA: sha, ...environment };
  return {
    lines,
    run: async () => {
      // prepare: Verify dry run, Verify promoted candidate (needs: prepare, so a failure here ends the run before approval).
      await verifyDryRun({ repository, sha, dryRunId: '555', currentRunId: '777', github });
      const reuse = await loadReuse({ directory: candidate.directory, publishSet, versions: candidate.versions, sha, readRetained: candidate.readRetained, io });
      verifyCandidate({ directory: candidate.directory, publishSet, versions: candidate.versions, expectedSha512: candidate.integrity, sha, tree: candidate.tree, readCommitted, ...reuse });
      // publish: Re-verify candidate, Publish the set in order.
      await npm.main('verify-candidate', env, io);
      await npm.main('publish-set', env, io);
    },
  };
}

const repository = 'ndrewtran/muxui';
const dryRunRun = (overrides, at = commit) => ({
  id: 555, path: '.github/workflows/npm-publish.yml', event: 'workflow_dispatch', head_branch: 'main', head_sha: at, status: 'completed',
  conclusion: 'success', run_attempt: 1, repository: { full_name: repository }, head_repository: { full_name: repository }, ...overrides,
});
// A scripted read-only GitHub client answering for dry run 555 at commit `at`.
const dryRunGithub = (overrides = {}, at = commit) => async (path) => {
  if (path.includes('/jobs')) return { jobs: [{ name: 'prepare', conclusion: 'success', steps: [{ name: 'Upload candidate', conclusion: 'success' }] }, { name: 'publish', conclusion: 'skipped' }] };
  if (path.includes('/artifacts')) {
    return { artifacts: [{ id: 9, name: 'npm-candidate', size_in_bytes: 4096, digest: `sha256:${'a'.repeat(64)}`, expired: false, workflow_run: { id: 555, head_sha: at } }] };
  }
  return dryRunRun(overrides, at);
};

test('every package has its own rc rule: a first publish is its rc.1, a later one the next number over next', () => {
  assert.deepEqual(npm.parseCandidate(catalog, '3.0.0-rc.3'), { base: '3.0.0', rc: 3 });
  for (const invalid of ['3.0.0', '3.0.0-rc.0', '3.0.0-rc.01', '3.0.0-beta.1', ' 3.0.0-rc.2', '3.0.0-rc.2\n', '', undefined]) {
    assert.throws(() => npm.parseCandidate(catalog, invalid), /not an admitted candidate version for @muxui\/catalog/u, String(invalid));
  }
  // @muxui/react stays pinned to 0.1.0-rc.N (Roadmap R1 exit).
  assert.equal(npm.parseCandidate(react, '0.1.0-rc.5').rc, 5);
  assert.throws(() => npm.parseCandidate(react, '3.0.0-rc.1'), /not an admitted candidate version for @muxui\/react \(0\.1\.0-rc\.N/u);
  assert.equal(npm.fixForwardVersion('3.0.0-rc.1', catalog), '3.0.0-rc.2');
  assert.equal(npm.fixForwardVersion('0.1.0-rc.4'), '0.1.0-rc.5');

  const classify = (name, version, versionStatus, packument) => npm.classifyPreflight({ name, version, versionStatus, packument });
  const document = (tags, ...versions) => ({ 'dist-tags': tags, versions: Object.fromEntries(versions.map((version) => [version, {}])) });
  assert.deepEqual(classify(schema, '0.6.0-rc.1', 404, null), { kind: 'first', latest: '', next: '' });
  assert.throws(() => classify(schema, '0.6.0-rc.2', 404, null), /@muxui\/schema is absent, so only 0\.6\.0-rc\.1 can be a first publish/u);

  const published = document({ latest: '3.0.0-rc.1', next: '3.0.0-rc.2' }, '3.0.0-rc.1', '3.0.0-rc.2');
  assert.deepEqual(classify(catalog, '3.0.0-rc.3', 404, published), { kind: 'later', latest: '3.0.0-rc.1', next: '3.0.0-rc.2' });
  assert.throws(() => classify(catalog, '3.0.0-rc.4', 404, published), /must be the next release candidate after next \(rc\.N\+1\); next points at 3\.0\.0-rc\.2/u);
  // A strictly higher base version starts at its rc.1 (Decision 0035); the other candidates over the same history stop for a decision.
  assert.deepEqual(classify(catalog, '3.1.0-rc.1', 404, published), { kind: 'later', latest: '3.0.0-rc.1', next: '3.0.0-rc.2' });
  assert.deepEqual(classify(catalog, '4.0.0-rc.1', 404, published), { kind: 'later', latest: '3.0.0-rc.1', next: '3.0.0-rc.2' });
  assert.throws(() => classify(catalog, '3.1.0-rc.2', 404, published), /must be the next release candidate after next \(rc\.N\+1\); next points at 3\.0\.0-rc\.2/u);
  assert.throws(() => classify(catalog, '2.2.0-rc.1', 404, published), /must be the next release candidate/u);
  assert.throws(() => classify(catalog, '2.2.0-rc.2', 404, published), /must be the next release candidate/u);
  // The base compares numerically per part, not as text.
  const tens = document({ latest: '3.9.0-rc.1', next: '3.9.0-rc.1' }, '3.9.0-rc.1');
  assert.deepEqual(classify(catalog, '3.10.0-rc.1', 404, tens), { kind: 'later', latest: '3.9.0-rc.1', next: '3.9.0-rc.1' });
  assert.throws(() => classify(catalog, '3.8.0-rc.1', 404, tens), /must be the next release candidate/u);
  // A higher base is no way round the other checks: a version already on the registry, and any extra dist-tag, still stop.
  assert.throws(() => classify(catalog, '3.1.0-rc.1', 200, published), /@muxui\/catalog@3\.1\.0-rc\.1 is already on the registry/u);
  assert.throws(() => classify(catalog, '3.1.0-rc.1', 404, document({ latest: '3.0.0-rc.1', next: '3.0.0-rc.2', beta: '3.0.0-rc.1' }, '3.0.0-rc.1', '3.0.0-rc.2', '3.1.0-rc.1')), /is listed in the packument/u);
  assert.throws(() => classify(catalog, '3.1.0-rc.1', 404, document({ latest: '3.0.0-rc.1', next: '3.0.0-rc.2', beta: '3.0.0-rc.1' }, '3.0.0-rc.1', '3.0.0-rc.2')), /Expected exactly latest and next/u);
  // React keeps its pinned base, so no higher base is a candidate for it.
  assert.throws(() => classify(react, '0.2.0-rc.1', 404, document({ latest: '0.1.0-rc.1', next: '0.1.0-rc.5' }, '0.1.0-rc.1', '0.1.0-rc.5')), /not an admitted candidate version for @muxui\/react \(0\.1\.0-rc\.N/u);
  assert.throws(() => classify(catalog, '3.0.0-rc.2', 200, published), /@muxui\/catalog@3\.0\.0-rc\.2 is already on the registry/u);
  assert.throws(() => classify(catalog, '3.0.0-rc.2', 404, published), /is listed in the packument/u);
  assert.throws(() => classify(catalog, '3.0.0-rc.3', 404, document({ latest: '3.0.0-rc.1', next: '3.0.0-rc.2', beta: '3.0.0-rc.1' }, '3.0.0-rc.1', '3.0.0-rc.2')), /Expected exactly latest and next/u);
  assert.throws(() => classify(catalog, '3.0.0-rc.3', 500, null), /Unexpected HTTP 500/u);
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
  const { packages, reused } = read();
  assert.deepEqual(packages.map(({ name, version }) => [name, version]), names.map((name) => [name, candidate.versions.get(name)]));
  assert.deepEqual(packages.map(({ integrity }) => integrity), candidate.manifest.packages.map(({ integrity }) => integrity));
  assert.deepEqual(reused, []);
  assert.ok(packages.every(({ file }) => file.startsWith(candidate.directory)));

  // A package is published exactly when its version input is not empty: the manifest's role must agree with the input.
  const edit = (change) => {
    const edited = candidateOf();
    const manifest = structuredClone(edited.manifest);
    change(manifest);
    writeFileSync(join(edited.directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify(manifest));
    return edited;
  };
  const roleDraft = edit((manifest) => { manifest.packages[0].role = 'draft'; });
  assert.throws(() => npm.readCandidateSet({ directory: roleDraft.directory, publishSet, versions: roleDraft.versions, revision: commit, expectedIntegrity: roleDraft.integrity }), /@muxui\/schema has role "draft" in the release manifest, and its version input publishes it/u);
  const reusedByManifest = edit((manifest) => { manifest.packages[0].role = 'reused'; });
  assert.throws(() => npm.readCandidateSet({ directory: reusedByManifest.directory, publishSet, versions: reusedByManifest.versions, revision: commit, expectedIntegrity: reusedByManifest.integrity }), /@muxui\/schema has role "reused" in the release manifest, and its version input publishes it/u);

  // The authorization lists exactly the tarballs the release publishes.
  assert.throws(() => read({ expectedIntegrity: '' }), /the tarball-sha512 input authorizes nothing/u);
  assert.throws(() => read({ expectedIntegrity: packages[3].integrity }), /This release publishes @muxui\/schema sha512-.*, @muxui\/react sha512-.*; the tarball-sha512 input authorizes sha512-/u);
  assert.throws(() => read({ expectedIntegrity: `${candidate.integrity},${draftIntegrity('x')}` }), /the tarball-sha512 input authorizes .*x+==/u);
  assert.throws(() => read({ expectedIntegrity: 'sha512-short' }), /lists \["sha512-short"\], which is not a sha512 integrity/u);
  assert.deepEqual(read({ expectedIntegrity: [...candidate.integrity.split(',')].reverse().join(', ') }).packages.map(({ name }) => name), names, 'any order');
  assert.throws(() => read({ versions: new Map([...candidate.versions, [catalog, '3.0.0-rc.2']]) }), /Expected exactly the tarball of each published package/u);
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
  await collide({ [catalog]: { versions: { '3.0.0-rc.3': draftIntegrity('c'), '3.0.0-rc.4': draftIntegrity('d') }, tags: { latest: '3.0.0-rc.3', next: '3.0.0-rc.4' } } }, /must be the next release candidate after next/u);
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
  await refuse({ environment: { EXPECTED_SHA512: draftIntegrity('x') }, message: /@muxui\/react sha512-.*; the tarball-sha512 input authorizes sha512-x+==/u });
  await refuse({ environment: { EXPECTED_SHA512: '' }, message: /the tarball-sha512 input authorizes nothing/u });
  // A manifest edited after preparation to match another artifact.
  await refuse({
    edit: ({ directory, manifest }) => writeFileSync(join(directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify({ ...manifest, packages: manifest.packages.map((record) => (record.name === catalog ? { ...record, integrity: draftIntegrity('m') } : record)) })),
    message: /@muxui\/catalog@3\.0\.0-rc\.1 tarball is sha512-.*; the release manifest records sha512-m+==/u,
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
  await refuse({ candidate: { ...stale, versions: new Map([...stale.versions, [react, first.react]]) }, message: /Expected exactly the tarball of each published package and one release manifest/u });

  // The publish job repeats the lineage it can read from the bytes, in case its artifact is not the one prepare checked.
  const registry = createRegistry({ seed: reactHistory() });
  const io = { ...registry.io(), publish: registry.publish };
  const candidate = candidateOf({ revision: otherCommit });
  await assert.rejects(npm.main('verify-candidate', candidate.environment, io), /The release manifest is for b+; this run is at a+/u);
  const other = candidateOf();
  await assert.rejects(npm.main('verify-candidate', { ...other.environment, MUXUI_RELEASE_VERSIONS: other.text.replace(first.react, '0.1.0-rc.6') }, io), /Expected exactly the tarball of each published package/u);
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

  // The plan: healthy versions stay published, a package never attempted needs nothing, and the refused one is a decision
  // (npm may have accepted the PUT), not "never published"; no one is deprecated.
  const plan = lines.filter((line) => /^- |^\d+\. |^Recovery plan/u.test(line));
  assert.deepEqual(plan.slice(0, 5), [
    'Recovery plan (a plan only; nothing was deprecated, unpublished, or re-tagged):',
    `- ${schema}@${first.schema}: healthy; published and verified; stays published and is not deprecated`,
    `- ${catalog}@${first.catalog}: healthy; published and verified; stays published and is not deprecated`,
    `- ${tooling}@${first.tooling}: unverified; ${unverifiedPlan}`,
    `- ${react}@${first.react}: not-attempted; never attempted; nothing to do`,
  ]);
  assert.ok(plan.some((line) => /verify the tuple again against a new release manifest; no record is rewritten/u.test(line)));
  assert.ok(!plan.some((line) => /deprecate \S+@|deprecate \d/u.test(line.replace(/deprecate nothing until|is not deprecated/gu, ''))));
  assert.ok(registry.writes.every(({ op }) => op === 'publish'), 'the fake registry saw publishes only');

  // Fix forward in a new dispatch, once a later look at the registry settled tooling as never published: it and react keep
  // their versions; the packages that did publish move to their next rc. The tuple is verified again against a new manifest, and the first release's record is untouched.
  const before = readFileSync(join(candidate.directory, PORTFOLIO_MANIFEST_FILE), 'utf8');
  const fixed = candidateOf({ versions: { [schema]: '0.6.0-rc.2', [catalog]: '3.0.0-rc.2' } });
  const verified = verifyCandidate({ directory: fixed.directory, publishSet, versions: fixed.versions, expectedSha512: fixed.integrity, sha: commit, tree, readCommitted });
  assert.notEqual(verified.digest, candidate.manifest.digest, 'a new release manifest');
  registry.faults.refuse = [];
  await publishRun({ registry, candidate: fixed }).run();
  assert.deepEqual(registry.writes.map(({ name, version }) => `${name}@${version}`), [
    `${schema}@${first.schema}`, `${catalog}@${first.catalog}`, `${schema}@0.6.0-rc.2`, `${catalog}@3.0.0-rc.2`, `${tooling}@${first.tooling}`, `${react}@${first.react}`,
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
    `- ${catalog}@${first.catalog}: bad-bytes; published bad bytes; deprecate ${first.catalog} (separate explicit authorization) and fix forward to 3.0.0-rc.2`,
    `- ${tooling}@${first.tooling}: not-attempted; never attempted; nothing to do`,
    `- ${react}@${first.react}: not-attempted; never attempted; nothing to do`,
  ]);
  assert.ok(plan.some((line) => /@muxui\/catalog: published bad bytes; deprecate 3\.0\.0-rc\.1/u.test(line)), 'the steps name the one deprecation');
  assert.equal(plan.filter((line) => /: published bad bytes; deprecate/u.test(line)).length, 1);
  assert.ok(registry.writes.every(({ op }) => op === 'publish'));
});

test('E-P2.1-06 rehearsal: a read-back that cannot see the version, or sees it unattested, is a decision and not a deprecation', async () => {
  const lagging = await failedRun({ faults: { invisible: [tooling] } });
  assert.equal(lagging.error.title, 'Registry propagation timeout');
  assert.ok(lagging.lines.includes(`- ${tooling}@${first.tooling}: unverified; ${unverifiedPlan}`));
  const unattested = await failedRun({ faults: { unattested: [catalog] } });
  assert.equal(unattested.error.title, 'Provenance missing');
  assert.ok(unattested.lines.includes(`- ${catalog}@${first.catalog}: unattested; published the candidate bytes without provenance; stop for a decision, and deprecate nothing automatically`));
  for (const { registry } of [lagging, unattested]) assert.ok(registry.writes.every(({ op }) => op === 'publish'));
});

test('E-P2.1-06 rehearsal: a publish that errored after npm accepted it is unverified, never absent, and never republished', async () => {
  const { registry, error, lines } = await failedRun({ faults: { landThenFail: [catalog] } });
  assert.deepEqual(error.progress.failed, { name: catalog, version: first.catalog, phase: 'publish' });
  assert.deepEqual(registry.writes.map(({ name }) => name), [schema, catalog], 'the publish landed, and nothing later was attempted');
  const plan = lines.filter((line) => /^- |^\d+\. |^Recovery plan/u.test(line));
  assert.deepEqual(plan.slice(1, 5), [
    `- ${schema}@${first.schema}: healthy; published and verified; stays published and is not deprecated`,
    `- ${catalog}@${first.catalog}: unverified; ${unverifiedPlan}`,
    `- ${tooling}@${first.tooling}: not-attempted; never attempted; nothing to do`,
    `- ${react}@${first.react}: not-attempted; never attempted; nothing to do`,
  ]);
  assert.ok(!plan.some((line) => line.includes('never published')), 'a 404 after an attempt is not "never published"');
  assert.ok(!plan.some((line) => /: published bad bytes; deprecate/u.test(line)));
  // Later the version is visible: it was published, so publishing it again would be a collision.
  registry.reveal(catalog);
  const later = await npm.assessAttempted(error.progress.attempted, registry.io());
  assert.deepEqual(later.map(({ name, state }) => [name, state]), [[schema, 'healthy'], [catalog, 'healthy']]);
  await assert.rejects(npm.preflight(first.catalog, registry.io(), catalog), /@muxui\/catalog@3\.0\.0-rc\.1 is already on the registry/u);
});

test('a recovery plan deprecates a version only when the registry holds other bytes for it', () => {
  const set = [{ name: schema, version: first.schema }, { name: catalog, version: first.catalog }];
  const plan = (assessed) => npm.planRecovery({ set, assessed }).packages.map(({ state, deprecate, fixForward }) => ({ state, deprecate, fixForward }));
  assert.deepEqual(plan([]), [{ state: 'not-attempted', deprecate: false, fixForward: undefined }, { state: 'not-attempted', deprecate: false, fixForward: undefined }]);
  assert.deepEqual(plan([{ name: schema, state: 'healthy' }, { name: catalog, state: 'bad-bytes' }]), [
    { state: 'healthy', deprecate: false, fixForward: undefined }, { state: 'bad-bytes', deprecate: true, fixForward: '3.0.0-rc.2' },
  ]);
  for (const state of ['healthy', 'unattested', 'unverified']) {
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
  assert.match(lines.splice(0)[0], /^Candidate verified: @muxui\/schema@0\.6\.0-rc\.1 sha512-.*, @muxui\/catalog@3\.0\.0-rc\.1 sha512-/u);
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
  const registry = createRegistry({ seed: { ...reactHistory(), ...existingPackage(schema, '0.6.0-rc.1'), ...existingPackage(catalog, '3.0.0-rc.1') } });
  const candidate = candidateOf({ versions: { [schema]: '0.6.0-rc.2', [catalog]: '3.0.0-rc.2' } });
  await assert.rejects(npm.main('publish-set', { ...candidate.environment, NPM_TOKEN: '' }, { ...registry.io(), publish: registry.publish }), /@muxui\/tooling does not exist on npm yet/u);
  const requests = registry.requests.length;
  await assert.rejects(npm.main('publish-set', { ...candidate.environment, NPM_TOKEN: 'two words' }, { ...registry.io(), publish: registry.publish }), /NPM_TOKEN is not a single-line token/u);
  assert.equal(registry.requests.length, requests);
  assert.deepEqual(registry.writes, []);
});

test('a token that is present is not used for a package that already exists', async () => {
  // schema and catalog exist (rc.2 follows their rc.1); tooling is new; the token is set.
  const registry = createRegistry({ seed: { ...reactHistory(), ...existingPackage(schema, '0.6.0-rc.1'), ...existingPackage(catalog, '3.0.0-rc.1') } });
  const candidate = candidateOf({ versions: { [schema]: '0.6.0-rc.2', [catalog]: '3.0.0-rc.2' } });
  await publishRun({ registry, candidate }).run();
  assert.deepEqual(registry.writes.map(({ name, auth }) => [name, auth]), [[schema, 'oidc'], [catalog, 'oidc'], [tooling, 'token'], [react, 'oidc']]);

  // With every package existing, no token is used at all, and none is needed.
  const existing = createRegistry({ seed: { ...reactHistory(), ...existingPackage(schema, '0.6.0-rc.1'), ...existingPackage(catalog, '3.0.0-rc.1'), ...existingPackage(tooling, '1.1.0-rc.1') } });
  const later = candidateOf({ versions: { [schema]: '0.6.0-rc.2', [catalog]: '3.0.0-rc.2', [tooling]: '1.1.0-rc.2' } });
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

// ---------------------------------------------------------------------------------------------------------------------
// A later release publishes only the packages whose version units changed and reuses the rest (Decision 0032 item 9).

const prior = firstReleaseFixture();
const priorOrigins = () => new Map([[prior.manifest.id, prior.manifest]]);
const priorRelease = { first: false, priorManifest: prior.manifest };
const recordOf = (manifest, name) => manifest.packages.find((record) => record.name === name);
const runUrl = 'https://github.com/ndrewtran/muxui/actions/runs/41754361620/attempts/1';
// The registry after the first release: each package at its rc, with the bytes it published and `latest` and `next` on it. The
// three new packages also list the untagged 0.0.0-stage version npm shows beside a first publish.
const afterFirstRelease = () => Object.fromEntries(names.map((name) => [name, {
  versions: name === react
    ? Object.fromEntries([1, 2, 3, 4].map((rc) => [`0.1.0-rc.${rc}`, draftIntegrity(String(rc))]))
    : { '0.0.0-stage': draftIntegrity('s') },
  tarballs: { [versionOf[name]]: prior.artifacts.get(name) },
  tags: name === react ? { latest: '0.1.0-rc.1', next: first.react } : { latest: versionOf[name], next: versionOf[name] },
  commit: prior.manifest.source.revision,
}]));

/** A later release's candidate directory and environment: `published` are built anew and the rest reused from the first release. */
function successorOf(options = {}) {
  const successor = successorFixture(options);
  const published = names.filter((name) => !successor.reused.has(name));
  const directory = join(scratch, `candidate-${sequence += 1}`);
  mkdirSync(directory);
  for (const name of published) writeFileSync(join(directory, tarballFileName(name, successor.tuple.versions[name])), successor.artifacts.get(name));
  writeFileSync(join(directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify(successor.manifest));
  const integrity = published.map((name) => recordOf(successor.manifest, name).integrity).join(',');
  const text = names.map((name) => `${name}=${successor.reused.has(name) ? '' : successor.tuple.versions[name]}`).join(',');
  return {
    ...successor,
    directory,
    integrity,
    text,
    tree: secondTree,
    readRetained: priorOrigins,
    versions: new Map(published.map((name) => [name, successor.tuple.versions[name]])),
    environment: { GITHUB_SHA: successor.revision, CANDIDATE_DIR: directory, MUXUI_RELEASE_VERSIONS: text, EXPECTED_SHA512: integrity, RUNNER_TEMP: scratch, NPM_TOKEN: temporaryToken },
  };
}

test('a version input is empty to reuse a package, and a release publishes at least one', () => {
  const pairs = (tooling_) => `${schema}=,${catalog}=,${tooling}=${tooling_},${react}=`;
  assert.deepEqual([...npm.parseVersionPairs(pairs('1.1.0-rc.2'), publishSet)], [[tooling, '1.1.0-rc.2']], 'reused packages are left out of the Map');
  const rejects = (value, message) => assert.throws(() => npm.parseVersionPairs(value, publishSet), message, value);
  rejects(pairs(''), /publishes at least one package; every version is empty/u);
  rejects(pairs('1.1.0-rc.2').replace(`,${react}=`, ''), /missing @muxui\/react/u);
  rejects(pairs('1.1.0'), /not an admitted candidate version for @muxui\/tooling/u);
  rejects(`${react}=0.2.0-rc.1,${schema}=,${catalog}=,${tooling}=`, /not an admitted candidate version for @muxui\/react/u);
});

// The dry run's reuse, step by step as release-prepare.mjs takes it: plan the reuse from the prior release, fetch each reused
// package from the registry by exact version, build the manifest with the records kept, and verify what was built.
test('E-P2.1-03 a later release plans its reuse, fetches the reused bytes from the registry, and builds a manifest that verifies', async () => {
  const successor = successorFixture();
  const registry = createRegistry({ seed: afterFirstRelease() });
  const published = parseReleaseVersions(`${schema}=,${catalog}=,${tooling}=1.1.0-rc.2,${react}=`, publishSet, readSourceVersions(readPublishSet(repositoryRoot), repositoryRoot));
  assert.deepEqual([...published], [[tooling, '1.1.0-rc.2']]);
  const plan = planReuse({ publishSet, published, priorRelease, revision: secondCommit, cwd: repositoryRoot, readRetained: priorOrigins });
  assert.deepEqual([...plan.reused.keys()], [schema, catalog, react]);
  assert.deepEqual([...plan.versions], [[schema, first.schema], [catalog, first.catalog], [tooling, '1.1.0-rc.2'], [react, first.react]], 'a reused package keeps its recorded version');
  const fetched = new Map();
  for (const [name, record] of plan.reused) fetched.set(name, await npm.fetchReusedTarball(record, registry.io()));
  for (const [name, bytes] of fetched) assert.ok(bytes.equals(prior.artifacts.get(name)), `${name} is the published tarball, byte for byte`);
  assert.deepEqual(registry.writes, []);

  const artifacts = new Map(names.map((name) => [name, plan.reused.has(name) ? fetched.get(name) : successor.artifacts.get(name)]));
  const built = buildPortfolioManifest({ publishSet, artifacts, reused: plan.reused, source: { revision: secondCommit, tree: secondTree }, readCommitted, preparation: { mode: 'full-checks' } });
  assert.equal(built.digest, successor.manifest.digest, 'the same commit, versions, and reuse give the same manifest');
  assert.deepEqual(built.packages.map(({ name, role }) => [name, role]), [[schema, 'reused'], [catalog, 'reused'], [tooling, 'published'], [react, 'reused']]);
  assert.deepEqual(built.publication.order, [tooling]);
  assert.equal(built.react, undefined, 'a reused React keeps the correlation of the release that published it');
  for (const name of plan.reused.keys()) assert.deepEqual({ ...recordOf(built, name), role: 'published' }, recordOf(prior.manifest, name), 'version, digests, and provenance are the original record');
  verifyPortfolioRelease({ manifest: built, artifacts, publishSet, expected: { revision: secondCommit, tree: secondTree }, readCommitted, priorManifests: plan.priorManifests });

  // A reuse needs a prior release, one that is usable, and the retained manifest of the release that published the package.
  assert.throws(() => planReuse({ publishSet, published, priorRelease: { first: true }, revision: secondCommit, cwd: repositoryRoot }), /P2_1_REUSE_NEEDS_PRIOR_RELEASE: @muxui\/schema, @muxui\/catalog, @muxui\/react are reused/u);
  assert.throws(() => planReuse({ publishSet, published, priorRelease: { first: false, priorManifest: { ...prior.manifest, packages: prior.manifest.packages.slice(1) } }, revision: secondCommit, cwd: repositoryRoot }), /P2_1_PRIOR_RELEASE_INVALID/u);
  const chained = structuredClone(successor.manifest);
  assert.throws(() => planReuse({ publishSet, published: new Map([[schema, '0.6.0-rc.2']]), priorRelease: { first: false, priorManifest: chained }, revision: secondCommit, cwd: repositoryRoot, readRetained: () => new Map() }), /P2_1_REUSE_ORIGIN_UNAVAILABLE: @muxui\/catalog@3\.0\.0-rc\.1 was published by .*, whose manifest is not in releases\/ at /u);
  // Nothing reused needs no prior release.
  assert.equal(planReuse({ publishSet, published: new Map(prior.manifest.packages.map(({ name, version }) => [name, version])), priorRelease: { first: true }, revision: commit, cwd: repositoryRoot }).reused.size, 0);
});

test('E-P2.1-03 a reused package that is not on the registry as recorded fails the release', async () => {
  const [record] = [recordOf(prior.manifest, react)];
  const refuse = async (seed, message) => {
    const registry = createRegistry({ seed });
    await assert.rejects(npm.fetchReusedTarball(record, registry.io()), message);
  };
  await refuse({}, /@muxui\/react@0\.1\.0-rc\.5, which this release reuses, is not on the registry/u);
  const history = afterFirstRelease();
  // The registry lists the version at another integrity.
  await refuse({ [react]: { ...history[react], versions: { ...history[react].versions, [first.react]: draftIntegrity('z') } } }, /@muxui\/react@0\.1\.0-rc\.5 has sha512-z+==; expected sha512-/u);
  // The registry lists the recorded integrity and serves other bytes.
  await refuse({ [react]: { ...history[react], versions: { ...history[react].versions, [first.react]: record.integrity }, tarballs: { [first.react]: Buffer.from('other bytes') } } }, /The tarball of @muxui\/react@0\.1\.0-rc\.5 is sha512-.*; its earlier release recorded sha512-/u);
  // The recorded bytes were published without provenance.
  const unattested = createRegistry({ seed: history });
  await assert.rejects(npm.fetchReusedTarball({ ...record, version: '0.1.0-rc.3', integrity: draftIntegrity('3') }, { ...unattested.io(), fetch: async (url, init) => {
    const response = await unattested.fetch(url, init);
    return { ...response, json: async () => { const body = await response.json(); delete body.dist.attestations; return body; } };
  } }), /@muxui\/react@0\.1\.0-rc\.3 has no SLSA provenance attestation/u);
  // A tarball named at another host is not downloaded.
  const elsewhere = createRegistry({ seed: history });
  await assert.rejects(npm.fetchReusedTarball(record, { ...elsewhere.io(), fetch: async (url, init) => {
    const response = await elsewhere.fetch(url, init);
    return { ...response, json: async () => { const body = await response.json(); if (body.dist) body.dist.tarball = 'https://example.com/react.tgz'; return body; } };
  } }), /The tarball of @muxui\/react@0\.1\.0-rc\.5 is "https:\/\/example\.com\/react\.tgz", not on https:\/\/registry\.npmjs\.org/u);
});

// A repack with its retained digests updated and a recomputed manifest digest agrees with everything the repository
// holds. What it cannot agree with is the attestation the registry holds for the bytes the origin release published.
test('E-P2.1-03 a repacked reused package is refused whatever the repository and the registry metadata say', async () => {
  const original = recordOf(prior.manifest, react);
  const repacked = Buffer.from('repacked react');
  const forgedRecord = { ...original, integrity: `sha512-${createHash('sha512').update(repacked).digest('base64')}`, sha256: `sha256:${createHash('sha256').update(repacked).digest('hex')}` };
  // The registry metadata is forged to match: the version document and the served bytes are the repack's.
  const history = afterFirstRelease();
  const forgedRegistry = () => createRegistry({
    seed: { ...history, [react]: { ...history[react], versions: { ...history[react].versions, [first.react]: forgedRecord.integrity }, tarballs: { [first.react]: repacked } } },
  });
  // Without an attestation check the repack is fetched.
  const unchecked = forgedRegistry();
  assert.equal((await unchecked.fetch(`${npm.REGISTRY}/${react}/-/react-${first.react}.tgz`, { redirect: 'error' })).status, 200);
  // The registry's attestation is the one the real publish produced, for the original bytes.
  const attested = forgedRegistry();
  attested.attestation(react, first.react).subject[0].digest.sha512 = Buffer.from(original.integrity.slice('sha512-'.length), 'base64').toString('hex');
  await assert.rejects(npm.fetchReusedTarball(forgedRecord, attested.io()), (error) => error.title === 'Provenance mismatch' && /wrong the subject sha512\./u.test(error.message));
  // The original record against the forged registry fails too, on the integrity the version document names.
  await assert.rejects(npm.fetchReusedTarball(original, attested.io()), /Registry integrity mismatch|has sha512-.*; expected sha512-/u);
  assert.deepEqual(attested.writes, []);
});

test('E-P2.1-03 a reused package must have the attestation of the original publish: bytes, name, workflow, repository, commit, and run', async () => {
  const record = recordOf(prior.manifest, react);
  const refuse = async (change, wrong) => {
    const registry = createRegistry({ seed: afterFirstRelease() });
    change(registry.attestation(react, first.react), registry);
    await assert.rejects(npm.fetchReusedTarball(record, registry.io()), (error) => error.title === 'Provenance mismatch' && error.message.endsWith(`: wrong ${wrong}.`), wrong);
  };
  const parameters = (statement) => statement.predicate.buildDefinition;
  const unchanged = createRegistry({ seed: afterFirstRelease() });
  assert.ok((await npm.fetchReusedTarball(record, unchanged.io())).equals(prior.artifacts.get(react)), 'the original attestation is accepted');
  assert.deepEqual(unchanged.requests.filter((url) => url.includes('attestations')), [`${npm.REGISTRY}/-/npm/v1/attestations/@muxui%2freact@${first.react}`], 'it is read from the URL the version document names');

  await refuse((statement) => { statement.subject[0].digest.sha512 = '0'.repeat(128); }, 'the subject sha512');
  await refuse((statement) => { statement.subject[0].digest = { sha512: statement.subject[0].digest.sha512, sha256: '0'.repeat(64) }; }, 'the subject sha512');
  await refuse((statement) => { statement.subject[0].name = `pkg:npm/%40muxui/tooling@${first.react}`; }, 'the subject name');
  await refuse((statement) => { statement.subject[0].name = `pkg:npm/%40muxui/react@0.1.0-rc.4`; }, 'the subject name');
  await refuse((statement) => { statement.subject.push({ ...statement.subject[0] }); }, 'a single subject');
  await refuse((statement) => { parameters(statement).externalParameters.workflow.path = '.github/workflows/ci.yml'; }, 'the workflow');
  await refuse((statement) => { parameters(statement).externalParameters.workflow.ref = 'refs/heads/feature'; }, 'the workflow');
  await refuse((statement) => { parameters(statement).externalParameters.workflow.repository = 'https://github.com/someone/muxui'; }, 'the workflow repository');
  await refuse((statement) => { parameters(statement).resolvedDependencies[0].digest.gitCommit = otherCommit; }, 'the source commit');
  await refuse((statement) => { parameters(statement).resolvedDependencies[0].uri = 'git+https://github.com/someone/muxui@refs/heads/main'; }, 'the source commit');
  await refuse((statement) => { statement.predicate.runDetails.metadata.invocationId = 'https://github.com/someone/muxui/actions/runs/1/attempts/1'; }, 'the run');
  await refuse((statement) => { statement.predicate.runDetails.metadata.invocationId = 'https://github.com/ndrewtran/muxui/actions/runs/1'; }, 'the run');
  await refuse((statement) => { statement._type = 'https://in-toto.io/Statement/v0.1'; }, 'the statement type');
  // The source commit is the record's: a record for another commit does not match the attestation.
  const relabelled = { ...record, provenance: { ...record.provenance, sourceCommit: otherCommit } };
  await assert.rejects(npm.fetchReusedTarball(relabelled, unchanged.io()), /wrong the source commit\./u);

  // The attestation document itself: absent, without SLSA provenance, unreadable, or named at another host.
  const through = (change) => {
    const registry = createRegistry({ seed: afterFirstRelease() });
    return { ...registry.io(), fetch: async (url, init) => {
      const response = await registry.fetch(url, init);
      return change(String(url), response, registry) ?? response;
    } };
  };
  await assert.rejects(npm.fetchReusedTarball(record, through((url) => (url.includes('attestations') ? { status: 404, json: async () => null } : undefined))), /Unexpected HTTP 404 reading the attestations of @muxui\/react@0\.1\.0-rc\.5/u);
  await assert.rejects(npm.fetchReusedTarball(record, through((url, response) => (url.includes('attestations')
    ? { ...response, json: async () => ({ attestations: (await response.json()).attestations.slice(0, 1) }) } : undefined))), /has 0 SLSA provenance attestations, not 1/u);
  await assert.rejects(npm.fetchReusedTarball(record, through((url, response) => (url.includes('attestations')
    ? { ...response, json: async () => ({ attestations: [{ predicateType: 'https://slsa.dev/provenance/v1', bundle: {} }] }) } : undefined))), /attestation whose statement cannot be read/u);
  await assert.rejects(npm.fetchReusedTarball(record, through((url, response) => (url.endsWith(first.react) && !url.includes('attestations')
    ? { ...response, json: async () => { const body = await response.json(); body.dist.attestations.url = 'https://example.com/attestations'; return body; } } : undefined))), /The attestation URL of @muxui\/react@0\.1\.0-rc\.5 is "https:\/\/example\.com\/attestations", not on https:\/\/registry\.npmjs\.org/u);
});

test('E-P2.1-06 a reused package keeps next at its recorded version: the dry run, the publish preflight, and the recheck before each publish', async () => {
  const record = recordOf(prior.manifest, schema);
  const tagsOf = (name, change) => {
    const registry = createRegistry({ seed: afterFirstRelease() });
    change(registry.packument(name));
    return registry;
  };
  const moved = [
    ['next moved to the untagged placeholder', (packument) => { packument['dist-tags'].next = '0.0.0-stage'; }, /@muxui\/schema next points at 0\.0\.0-stage, and this release reuses 0\.6\.0-rc\.1, which next must be/u],
    ['next moved to another rc', (packument) => { packument['dist-tags'].next = '0.6.0-rc.2'; }, /next points at 0\.6\.0-rc\.2/u],
    ['next removed', (packument) => { delete packument['dist-tags'].next; }, /Expected exactly latest and next on @muxui\/schema/u],
    ['a third tag added', (packument) => { packument['dist-tags'].beta = '0.6.0-rc.1'; }, /Expected exactly latest and next on @muxui\/schema/u],
  ];
  for (const [what, change, message] of moved) {
    // The dry run fetches the reused bytes and stops...
    await assert.rejects(npm.fetchReusedTarball(record, tagsOf(schema, change).io()), (error) => error.title === 'Dist-tag drift' && message.test(error.message), what);
    // ...and the publish job's whole-set preflight stops before any publish, whichever package moved.
    const registry = tagsOf(schema, change);
    const candidate = successorOf();
    await assert.rejects(npm.main('publish-set', candidate.environment, { ...registry.io(), publish: registry.publish }), (error) => error.title === 'Dist-tag drift' && message.test(error.message), what);
    assert.deepEqual(registry.writes, [], `${what}: nothing was published`);
  }
  // The version itself must be listed in the packument, and a package gone from the registry is not a drift to wave through.
  const unlisted = createRegistry({ seed: afterFirstRelease() });
  const document = await (await unlisted.fetch(`${npm.REGISTRY}/${schema}`, { redirect: 'error' })).json();
  delete document.versions[first.schema];
  assert.throws(() => npm.judgeReusedTags({ name: schema, version: first.schema, packument: document }), /@muxui\/schema@0\.6\.0-rc\.1, which this release reuses, is not on the registry/u);
  assert.throws(() => npm.judgeReusedTags({ name: schema, version: first.schema, packument: null }), /is not on the registry/u);
  assert.deepEqual(npm.judgeReusedTags({ name: schema, version: first.schema, packument: { 'dist-tags': { latest: first.schema, next: first.schema }, versions: { [first.schema]: {} } } }), { kind: 'later', latest: first.schema, next: first.schema });

  // A reused package that drifts after the preflight stops the next publish: while catalog publishes, React's next or schema's latest moves.
  const drifts = [
    ['next', react, (packument) => { packument['dist-tags'].next = '0.1.0-rc.4'; }, 'Dist-tag drift', /@muxui\/react next points at 0\.1\.0-rc\.4, and this release reuses 0\.1\.0-rc\.5/u],
    ['latest', schema, (packument) => { packument['dist-tags'].latest = '0.0.0-stage'; }, 'Registry drift', /latest changed since the preflight: recorded "0\.6\.0-rc\.1", now "0\.0\.0-stage"/u],
  ];
  for (const [what, name, change, title, message] of drifts) {
    const registry = createRegistry({ seed: afterFirstRelease() });
    const candidate = successorOf({ published: [catalog, tooling], versions: { [catalog]: '3.0.0-rc.2', [tooling]: '1.1.0-rc.2' } });
    const publish = async (pkg, auth) => {
      await registry.publish(pkg, auth);
      change(registry.packument(name));
    };
    await assert.rejects(npm.main('publish-set', candidate.environment, { ...registry.io(), publish }), (error) => error.title === title && message.test(error.message)
      && error.progress.failed.name === tooling && error.progress.failed.phase === 'recheck', what);
    assert.deepEqual(registry.writes.map(({ name: published }) => published), [catalog], `${what}: catalog published; tooling was not attempted`);
  }
});

test('E-P2.1-03 no read of the registry follows a redirect: the version, the attestation, the packument, and the tarball', async () => {
  const record = recordOf(prior.manifest, react);
  // Every request passes redirect: 'error' (the fake refuses any that does not), including the plain registry reads.
  let seen;
  await npm.readRegistry(`${npm.REGISTRY}/${react}`, { fetch: async (url, init) => { seen = init; return { status: 404 }; } });
  assert.equal(seen.redirect, 'error');
  const reads = {
    'the version document': `${npm.REGISTRY}/${react}/${first.react}`,
    'the attestation': `${npm.REGISTRY}/-/npm/v1/attestations/@muxui%2freact@${first.react}`,
    'the packument': `${npm.REGISTRY}/${react}`,
    'the tarball': `${npm.REGISTRY}/${react}/-/react-${first.react}.tgz`,
  };
  for (const [what, url] of Object.entries(reads)) {
    const registry = createRegistry({ seed: afterFirstRelease() });
    registry.redirect(url);
    await assert.rejects(npm.fetchReusedTarball(record, registry.io()), /fetch failed/u, what);
    // The publish job's preflight reads the same documents and fails closed before it publishes.
    if (what !== 'the tarball') {
      await assert.rejects(npm.main('publish-set', successorOf().environment, { ...registry.io(), publish: registry.publish }), /fetch failed/u, what);
      assert.deepEqual(registry.writes, [], what);
    }
  }
});

test('E-P2.1-03 and E-P2.1-06 a tooling-only release goes from its candidate through promotion to publishing only tooling', async () => {
  const candidate = successorOf();
  const registry = createRegistry({ seed: afterFirstRelease() });
  const { run, lines } = publishRun({ registry, candidate });
  await run();

  // Only tooling publishes, through OIDC (it exists), and the others stay where they are.
  assert.deepEqual(registry.writes, [{ op: 'publish', name: tooling, version: '1.1.0-rc.2', tag: 'next', auth: 'oidc' }]);
  assert.deepEqual(readdirSync(candidate.directory).sort(), [tarballFileName(tooling, '1.1.0-rc.2'), PORTFOLIO_MANIFEST_FILE].sort(), 'the candidate holds the published tarball and the manifest');
  assert.deepEqual(lines.filter((line) => /^(Publish set|Candidate verified|Reused|Publishing|Published|Preflight passed)/u.test(line) || line.includes(': reused,')), [
    `Candidate verified: ${tooling}@1.1.0-rc.2 ${recordOf(candidate.manifest, tooling).integrity}`,
    `Reused, not published: ${[schema, catalog, react].map((name) => `${name}@${versionOf[name]} ${recordOf(candidate.manifest, name).integrity}`).join(', ')}`,
    `Publish set: ${tooling}@1.1.0-rc.2`,
    ...[schema, catalog, react].map((name) => `${name}@${versionOf[name]}: reused, on the registry with ${recordOf(candidate.manifest, name).integrity}`),
    'Preflight passed for 1 packages; publishing in order.',
    `Publishing ${tooling}@1.1.0-rc.2 (1 of 1)`,
    `Published ${tooling}@1.1.0-rc.2 (1 of 1)`,
  ]);
  // Each reused package is read with its attestation and its next before the first publish, and the log says by which run.
  assert.deepEqual(lines.filter((line) => line.includes(': attested by ')), [schema, catalog, react].map((name) => `${name}@${versionOf[name]}: attested by ${runUrl}, next ${versionOf[name]}`));
  assert.ok(lines.indexOf(`${react}@${first.react}: attested by ${runUrl}, next ${first.react}`) < lines.indexOf(`Publishing ${tooling}@1.1.0-rc.2 (1 of 1)`));
  // next moved over tooling's rc.1 without touching latest; the reused packages and their placeholders are untouched.
  assert.deepEqual(registry.packument(tooling)['dist-tags'], { latest: first.tooling, next: '1.1.0-rc.2' });
  for (const name of [schema, catalog]) assert.deepEqual(registry.packument(name)['dist-tags'], { latest: versionOf[name], next: versionOf[name] });
  assert.deepEqual(registry.packument(react)['dist-tags'], { latest: '0.1.0-rc.1', next: first.react });
  assert.ok(Object.hasOwn(registry.packument(tooling).versions, '0.0.0-stage'));
  assert.ok(!registry.requests.some((url) => url.endsWith('.tgz') && url.includes('tooling')), 'the publish job reads the version documents of reused packages, not their tarballs');
});

test('E-P2.1-03 a release that reuses React publishes catalog and tooling in order and leaves schema and React alone', async () => {
  const candidate = successorOf({ published: [catalog, tooling], versions: { [catalog]: '3.0.0-rc.2', [tooling]: '1.1.0-rc.2' } });
  const registry = createRegistry({ seed: afterFirstRelease() });
  const { run, lines } = publishRun({ registry, candidate });
  await run();
  assert.deepEqual(registry.writes.map(({ name, version, auth }) => [name, version, auth]), [[catalog, '3.0.0-rc.2', 'oidc'], [tooling, '1.1.0-rc.2', 'oidc']]);
  assert.ok(lines.includes(`Preflight passed for 2 packages; publishing in order.`));
  assert.ok(lines.includes(`${react}@${first.react}: reused, on the registry with ${recordOf(candidate.manifest, react).integrity}`));
  assert.deepEqual(candidate.manifest.publication.order, [catalog, tooling]);
  assert.deepEqual(registry.packument(react)['dist-tags'], { latest: '0.1.0-rc.1', next: first.react }, '@muxui/react is untouched');
});

test('E-P2.1-06 refusals: a reused package the registry does not hold as recorded stops the release before any publish', async () => {
  const history = afterFirstRelease();
  const refuse = async (seed, message) => {
    const registry = createRegistry({ seed });
    const candidate = successorOf();
    const { run } = publishRun({ registry, candidate });
    await assert.rejects(run(), message);
    assert.deepEqual(registry.writes, [], 'nothing was published');
  };
  // Promotion fetches the reused bytes, so each of these ends the prepare job; the publish job checks the same version document.
  await refuse({ ...history, [catalog]: { ...history[catalog], versions: { '0.0.0-stage': draftIntegrity('s') }, tarballs: {} } }, /@muxui\/catalog@3\.0\.0-rc\.1, which this release reuses, is not on the registry/u);
  await refuse({ ...history, [react]: { ...history[react], tarballs: { [first.react]: Buffer.from('repacked') }, versions: { ...history[react].versions, [first.react]: recordOf(prior.manifest, react).integrity } } }, /The tarball of @muxui\/react@0\.1\.0-rc\.5 is sha512-.*; its earlier release recorded sha512-/u);
  // The publish job alone: its candidate is verified and its reused package was changed on the registry since (same version, other integrity).
  const candidate = successorOf();
  const registry = createRegistry({ seed: { ...history, [schema]: { ...history[schema], versions: { ...history[schema].versions, [first.schema]: draftIntegrity('q') }, tarballs: {} } } });
  const io = { ...registry.io(), publish: registry.publish };
  await npm.main('verify-candidate', candidate.environment, io);
  await assert.rejects(npm.main('publish-set', candidate.environment, io), (error) => error.title === 'Registry integrity mismatch' && /@muxui\/schema@0\.6\.0-rc\.1 has sha512-q+==/u.test(error.message));
  assert.deepEqual(registry.writes, []);
});

test('E-P2.1-06 refusals: a collision of a published version, and a version input that disagrees with the manifest, stop the release', async () => {
  const history = afterFirstRelease();
  // Tooling's rc.2 is already on the registry: nothing publishes.
  const collide = createRegistry({ seed: { ...history, [tooling]: { ...history[tooling], versions: { ...history[tooling].versions, '1.1.0-rc.2': draftIntegrity('t') }, tags: { latest: first.tooling, next: '1.1.0-rc.2' } } } });
  await assert.rejects(publishRun({ registry: collide, candidate: successorOf() }).run(), /@muxui\/tooling@1\.1\.0-rc\.2 is already on the registry/u);
  assert.deepEqual(collide.writes, []);
  // A publish input for a package the manifest reuses (React was unchanged), or an empty input for one it publishes.
  const candidate = successorOf();
  const read = (versions, expectedIntegrity = candidate.integrity) => npm.readCandidateSet({ directory: candidate.directory, publishSet, versions, revision: secondCommit, expectedIntegrity });
  assert.throws(() => read(new Map([...candidate.versions, [react, '0.1.0-rc.6']])), /Expected exactly the tarball of each published package/u);
  const asPublished = successorOf();
  const manifest = structuredClone(asPublished.manifest);
  manifest.packages.find((record) => record.name === react).role = 'published';
  writeFileSync(join(asPublished.directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify(manifest));
  assert.throws(() => npm.readCandidateSet({ directory: asPublished.directory, publishSet, versions: asPublished.versions, revision: secondCommit, expectedIntegrity: asPublished.integrity }), /The version input for @muxui\/react is empty, which reuses it, and the release manifest has it as "published"/u);
  // The authorization names exactly the published tarball: not the reused ones, and not none.
  assert.throws(() => read(candidate.versions, `${candidate.integrity},${recordOf(candidate.manifest, react).integrity}`), /the tarball-sha512 input authorizes .*,/u);
  assert.throws(() => read(candidate.versions, recordOf(candidate.manifest, react).integrity), /This release publishes @muxui\/tooling sha512-/u);
  assert.throws(() => read(candidate.versions, ''), /authorizes nothing/u);
  assert.deepEqual(read(candidate.versions).reused.map(({ name }) => name), [schema, catalog, react]);
});

test('the publication CLI preflights only what a release publishes', async () => {
  const registry = createRegistry({ seed: afterFirstRelease() });
  const lines = [];
  await npm.main('preflight-set', { MUXUI_RELEASE_VERSIONS: successorOf().text }, { ...registry.io({ log: (line) => lines.push(line) }), publish: registry.publish });
  assert.deepEqual(lines, [
    `${schema}: reused (the prior release names its version; the registry is read when the candidate is built and again before the first publish)`,
    `${catalog}: reused (the prior release names its version; the registry is read when the candidate is built and again before the first publish)`,
    `${react}: reused (the prior release names its version; the registry is read when the candidate is built and again before the first publish)`,
    `${tooling}@1.1.0-rc.2: 404 (no collision)`,
    `${tooling} dist-tags latest=${first.tooling} next=${first.tooling}`,
  ]);
  assert.deepEqual(registry.writes, []);
});

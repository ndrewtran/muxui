import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import test, { after } from 'node:test';
import * as npm from '../src/npm-publication.mjs';
import { verifyCandidate, verifyDryRun } from '../src/release-lineage.mjs';
import { PORTFOLIO_MANIFEST_FILE, tarballFileName } from '../src/release-set.mjs';
import { createRegistry } from './registry-fake.mjs';
import {
  archiveOf, artifactsOf, commit, manifestOf, otherCommit, publishSet, readCommitted, tree, tupleFixture,
} from './release-tuple-fixture.mjs';

// The publish job of npm-publish.yml against an in-process registry (E-P2.1-06): no network, no registry mutation.
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
 * One publish run's two jobs against `registry`: the prepare job's promotion checks, then the publish job.
 */
function publishRun({ registry, candidate = candidateOf(), github = dryRunGithub({}, candidate.environment.GITHUB_SHA), sha = candidate.environment.GITHUB_SHA, environment = {}, lines = [] }) {
  const io = { ...registry.io({ log: (line) => lines.push(line) }), publish: registry.publish };
  const env = { ...candidate.environment, GITHUB_SHA: sha, ...environment };
  return {
    lines,
    run: async () => {
      // prepare: Verify dry run, Verify promoted candidate (needs: prepare, so a failure here ends the run before approval).
      await verifyDryRun({ repository, sha, dryRunId: '555', currentRunId: '777', github });
      verifyCandidate({ directory: candidate.directory, publishSet, versions: candidate.versions, expectedSha512: candidate.integrity, sha, tree: candidate.tree, readCommitted });
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

test('the publish job reads the candidate as the manifest records it', () => {
  const candidate = candidateOf();
  const read = (overrides = {}) => npm.readCandidateSet({
    directory: candidate.directory, publishSet, versions: candidate.versions, revision: commit, expectedIntegrity: candidate.integrity, ...overrides,
  });
  const packages = read();
  assert.deepEqual(packages.map(({ name, version }) => [name, version]), names.map((name) => [name, candidate.versions.get(name)]));
  assert.deepEqual(packages.map(({ integrity }) => integrity), candidate.manifest.packages.map(({ integrity }) => integrity));
  assert.ok(packages.every(({ file }) => file.startsWith(candidate.directory)));

  // The manifest must record the version the input names.
  const edited = candidateOf();
  const manifest = structuredClone(edited.manifest);
  manifest.packages[0].version = '0.6.0-rc.9';
  writeFileSync(join(edited.directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify(manifest));
  assert.throws(() => npm.readCandidateSet({ directory: edited.directory, publishSet, versions: edited.versions, revision: commit, expectedIntegrity: edited.integrity }), /@muxui\/schema is 0\.6\.0-rc\.9 \(muxui-schema-0\.6\.0-rc\.1\.tgz\) in the release manifest; the version input is 0\.6\.0-rc\.1/u);

  // The authorization lists exactly the tarballs the release publishes.
  assert.throws(() => read({ expectedIntegrity: '' }), /the tarball-sha512 input authorizes nothing/u);
  assert.throws(() => read({ expectedIntegrity: packages[3].integrity }), /This release publishes @muxui\/schema sha512-.*, @muxui\/react sha512-.*; the tarball-sha512 input authorizes sha512-/u);
  assert.throws(() => read({ expectedIntegrity: `${candidate.integrity},${draftIntegrity('x')}` }), /the tarball-sha512 input authorizes .*x+==/u);
  assert.throws(() => read({ expectedIntegrity: 'sha512-short' }), /lists \["sha512-short"\], which is not a sha512 integrity/u);
  assert.deepEqual(read({ expectedIntegrity: [...candidate.integrity.split(',')].reverse().join(', ') }).map(({ name }) => name), names, 'any order');
  assert.throws(() => read({ versions: new Map([...candidate.versions, [catalog, '3.0.0-rc.2']]) }), /Expected exactly the tarball of each package/u);
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

  // The plan: healthy versions stay published, a package never attempted needs nothing, and the refused one is a decision
  // (npm may have accepted the PUT), not "never published"; no one is deprecated.
  const plan = lines.filter((line) => /^- |^\d+\. |^Recovery plan/u.test(line));
  assert.deepEqual(plan.slice(0, 5), [
    'Recovery plan (a plan only; nothing was deprecated, unpublished, or re-tagged):',
    `- ${schema}@${first.schema}: healthy; published and verified; stays published and is not deprecated; the next release moves to 0.6.0-rc.2`,
    `- ${catalog}@${first.catalog}: healthy; published and verified; stays published and is not deprecated; the next release moves to 3.0.0-rc.2`,
    `- ${tooling}@${first.tooling}: unverified; ${unverifiedPlan}`,
    `- ${react}@${first.react}: not-attempted; never attempted; the next release keeps ${first.react}`,
  ]);
  // tooling's outcome is not settled, so the plan stops there and proposes no next release.
  assert.ok(plan.some((line) => /re-check the registry until every package above is settled/u.test(line)));
  assert.ok(!lines.some((line) => line.startsWith('Next release:')));
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
    `- ${schema}@${first.schema}: healthy; published and verified; stays published and is not deprecated; the next release moves to 0.6.0-rc.2`,
    `- ${catalog}@${first.catalog}: bad-bytes; published bad bytes; deprecate ${first.catalog} (with Andrew's yes) and move to 3.0.0-rc.2`,
    `- ${tooling}@${first.tooling}: not-attempted; never attempted; the next release keeps ${first.tooling}`,
    `- ${react}@${first.react}: not-attempted; never attempted; the next release keeps ${first.react}`,
  ]);
  assert.ok(plan.some((line) => /@muxui\/catalog: published bad bytes; deprecate 3\.0\.0-rc\.1/u.test(line)), 'the steps name the one deprecation');
  // Every outcome is settled, so recovery is the next four-package release from the registry's state.
  const next = `${schema}=0.6.0-rc.2,${catalog}=3.0.0-rc.2,${tooling}=${first.tooling},${react}=${first.react}`;
  assert.equal(lines.at(-1), `Next release: MUXUI_RELEASE_VERSIONS=${next}`);
  assert.ok(plan.includes(`3. prepare the next release of all four packages at ${next}, with a new dry run and a new release manifest; no record is rewritten`), plan.join('\n'));
  // That tuple is what the registry now admits: each version is absent and the next rc after next, or a first rc.1.
  const admitted = [];
  for (const pair of next.split(',')) {
    const [name, version] = pair.split('=');
    admitted.push((await npm.preflight(version, registry.io(), name)).kind);
  }
  assert.deepEqual(admitted, ['later', 'later', 'first', 'later']);
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
    `- ${schema}@${first.schema}: healthy; published and verified; stays published and is not deprecated; the next release moves to 0.6.0-rc.2`,
    `- ${catalog}@${first.catalog}: unverified; ${unverifiedPlan}`,
    `- ${tooling}@${first.tooling}: not-attempted; never attempted; the next release keeps ${first.tooling}`,
    `- ${react}@${first.react}: not-attempted; never attempted; the next release keeps ${first.react}`,
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
  const plan = (assessed) => npm.planRecovery({ set, assessed }).packages.map(({ state, deprecate, nextVersion }) => ({ state, deprecate, nextVersion }));
  assert.deepEqual(plan([]), [{ state: 'not-attempted', deprecate: false, nextVersion: first.schema }, { state: 'not-attempted', deprecate: false, nextVersion: first.catalog }]);
  assert.deepEqual(plan([{ name: schema, state: 'healthy' }, { name: catalog, state: 'bad-bytes' }]), [
    { state: 'healthy', deprecate: false, nextVersion: '0.6.0-rc.2' }, { state: 'bad-bytes', deprecate: true, nextVersion: '3.0.0-rc.2' },
  ]);
  for (const state of ['healthy', 'unattested', 'unverified']) {
    assert.ok(plan([{ name: schema, state }, { name: catalog, state }]).every(({ deprecate }) => deprecate === false), state);
  }
  // An unsettled outcome, or a failed post-publication check, proposes no next release.
  assert.equal(npm.planRecovery({ set, assessed: [] }).nextVersions, `${schema}=${first.schema},${catalog}=${first.catalog}`);
  for (const state of ['unattested', 'unverified']) assert.equal(npm.planRecovery({ set, assessed: [{ name: catalog, state }] }).nextVersions, null, state);
  assert.equal(npm.planRecovery({ set, assessed: [{ name: schema, state: 'healthy' }, { name: catalog, state: 'healthy' }], failed: { name: null, version: null, phase: 'verify' } }).nextVersions, null);
});

test('a recovery plan proposes no next release that the registry does not admit, such as a version published since the preflight', async () => {
  // catalog has its rc.1; this release publishes its rc.2. After schema publishes, someone else publishes catalog 3.0.0-rc.2,
  // so catalog's recheck stops it before its publish: catalog was never attempted, and its version is taken.
  const registry = createRegistry({ seed: { ...reactHistory(), ...existingPackage(catalog, '3.0.0-rc.1') } });
  const candidate = candidateOf({ versions: { [catalog]: '3.0.0-rc.2' } });
  const lines = [];
  const io = {
    ...registry.io({ log: (line) => lines.push(line) }),
    publish: async (pkg, auth) => {
      await registry.publish(pkg, auth);
      if (pkg.name === schema) await registry.publish({ name: catalog, version: '3.0.0-rc.2', file: join(candidate.directory, tarballFileName(catalog, '3.0.0-rc.2')) }, {});
    },
  };
  const error = await npm.main('publish-set', candidate.environment, io).then(() => assert.fail('the run should stop'), (stopped) => stopped);
  assert.deepEqual(error.progress.failed, { name: catalog, version: '3.0.0-rc.2', phase: 'recheck' });
  assert.ok(lines.includes(`- ${catalog}@3.0.0-rc.2: not-attempted; never attempted; the next release keeps 3.0.0-rc.2`));
  // The rest of the tuple is admitted; catalog's version is not, so the plan stops and prints no tuple.
  assert.deepEqual(lines.filter((line) => line.includes('stop for a decision')), [
    `2. stop for a decision: the registry does not admit ${catalog}@3.0.0-rc.2 for the next release (Version exists: ${catalog}@3.0.0-rc.2 is already on the registry; never overwrite or republish.)`,
  ]);
  assert.ok(lines.some((line) => /re-check the registry until every package above is settled/u.test(line)));
  assert.ok(!lines.some((line) => line.startsWith('Next release:')), lines.join('\n'));
});

test('a recovery plan stops, with no tuple, when the registry state is ambiguous or cannot be read', async () => {
  const set = [{ name: schema, version: first.schema }, { name: catalog, version: '3.0.0-rc.2' }];
  const refusals = async (registryIo) => npm.preflightNextRelease(npm.planRecovery({ set, assessed: [{ name: schema, state: 'healthy' }] }).packages, registryIo);
  const seed = (tags) => ({ [schema]: { versions: { [first.schema]: draftIntegrity('s') }, tags: { latest: first.schema, next: first.schema } }, [catalog]: { versions: { '3.0.0-rc.1': draftIntegrity('c') }, tags } });

  // A settled registry admits the whole tuple.
  assert.deepEqual(await refusals(createRegistry({ seed: seed({ latest: '3.0.0-rc.1', next: '3.0.0-rc.1' }) }).io()), []);
  // An extra dist-tag, or next at a version the packument does not list, is drift.
  const drift = await refusals(createRegistry({ seed: seed({ latest: '3.0.0-rc.1', next: '3.0.0-rc.1', beta: '3.0.0-rc.1' }) }).io());
  assert.deepEqual(drift.map(({ name, version }) => `${name}@${version}`), [`${catalog}@3.0.0-rc.2`]);
  assert.match(drift[0].reason, /^Dist-tag drift: Expected exactly latest and next/u);
  assert.match((await refusals(createRegistry({ seed: seed({ latest: '3.0.0-rc.1', next: '3.0.0-rc.9' }) }).io()))[0].reason, /next points at 3\.0\.0-rc\.9, which is not a published version/u);
  // A registry that answers 500, or cannot be reached, is unreadable.
  const status500 = await refusals({ fetch: async () => ({ status: 500, json: async () => null }) });
  assert.deepEqual(status500.map(({ reason }) => reason), [`Registry read failed: Unexpected HTTP 500 reading ${schema}.`, `Registry read failed: Unexpected HTTP 500 reading ${catalog}.`]);
  const unreachable = await refusals({ fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.deepEqual(unreachable.map(({ reason }) => reason), ['the registry could not be read: fetch failed', 'the registry could not be read: fetch failed']);

  const plan = npm.planRecovery({ set, assessed: [{ name: schema, state: 'healthy' }], refused: drift });
  assert.equal(plan.nextVersions, null);
  assert.ok(plan.steps.includes(`stop for a decision: the registry does not admit ${catalog}@3.0.0-rc.2 for the next release (${drift[0].reason})`));
  assert.ok(!plan.steps.some((step) => step.startsWith('prepare the next release')));
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

test('no read of the registry follows a redirect, and the publish job fails closed before it publishes', async () => {
  // Every request passes redirect: 'error' (the fake refuses any that does not).
  let seen;
  await npm.readRegistry(`${npm.REGISTRY}/${react}`, { fetch: async (url, init) => { seen = init; return { status: 404 }; } });
  assert.equal(seen.redirect, 'error');
  for (const url of [`${npm.REGISTRY}/${react}/${first.react}`, `${npm.REGISTRY}/${react}`]) {
    const registry = createRegistry({ seed: reactHistory() });
    registry.redirect(url);
    await assert.rejects(npm.main('publish-set', candidateOf().environment, { ...registry.io(), publish: registry.publish }), /fetch failed/u, url);
    assert.deepEqual(registry.writes, [], url);
  }
});

// The post-publication check reads what a consumer installs: the registry's install, its integrity, and npm audit signatures.
function publishedRegistry({ commit: at = commit } = {}) {
  const bytes = new Map(names.map((name) => [name, Buffer.from(`${name} published bytes`)]));
  const integrityOf = (name) => `sha512-${createHash('sha512').update(bytes.get(name)).digest('base64')}`;
  const registry = createRegistry({ seed: Object.fromEntries(names.map((name) => [name, { tarballs: { [versionOf[name]]: bytes.get(name) }, tags: { latest: versionOf[name], next: versionOf[name] }, commit: at }])) });
  const packages = names.map((name) => ({ name, version: versionOf[name], integrity: integrityOf(name) }));
  return { registry, packages };
}

test('the post-publication check installs the exact versions from the registry and verifies their integrity and signed provenance', async () => {
  const { registry, packages } = publishedRegistry();
  const environments = [];
  const lines = [];
  const run = (args, options) => {
    environments.push(options.env);
    return registry.npm(args, options);
  };
  const environment = { PATH: '/usr/bin', NPM_TOKEN: temporaryToken, NODE_AUTH_TOKEN: temporaryToken, npm_config__authToken: temporaryToken, npm_config_registry: 'https://elsewhere.example' };
  await npm.verifyPublished({ packages, sourceCommit: commit, environment, run, intervalMs: 0, log: (line) => lines.push(line) });
  assert.deepEqual(registry.npmCalls, ['install --ignore-scripts --no-audit --no-fund --legacy-peer-deps', 'audit signatures --json --include-attestations']);
  assert.match(lines.at(-1), /^Installed @muxui\/schema@0\.6\.0-rc\.1, .* npm audit signatures verified each registry signature and Sigstore attestation, built from a{40}/u);
  // npm runs with no credential and no inherited registry: only the project's .npmrc and two empty config files apply.
  for (const env of environments) {
    assert.deepEqual(Object.keys(env).filter((key) => /token|^npm_config_registry$/iu.test(key)), []);
    assert.match(env.npm_config_userconfig, /muxui-published-.*user\.npmrc$/u);
  }
});

test('the post-publication check fails on other bytes, a bad signature, or provenance that is not this commit and workflow', async () => {
  const refuses = async (change, message) => {
    const { registry, packages } = publishedRegistry();
    const checked = change(registry, packages) ?? packages;
    await assert.rejects(npm.verifyPublished({ packages: checked, sourceCommit: commit, run: registry.npm, installAttempts: 2, intervalMs: 0, sleep: async () => {}, log: () => {} }), message);
  };
  await refuses((_registry, packages) => packages.map((entry) => (entry.name === catalog ? { ...entry, integrity: draftIntegrity('o') } : entry)), /@muxui\/catalog installed as 3\.0\.0-rc\.1 with sha512-.*; expected 3\.0\.0-rc\.1 with sha512-o+==/u);
  await refuses((_registry, packages) => packages.map((entry) => (entry.name === react ? { ...entry, version: '0.1.0-rc.6' } : entry)), /did not appear after 2 attempts/u);
  await refuses((registry) => { registry.auditFaults[tooling] = 'invalid'; }, /invalid signatures or attestations: @muxui\/tooling@1\.1\.0-rc\.1/u);
  await refuses((registry) => { registry.auditFaults[schema] = 'missing'; }, /missing registry signatures: @muxui\/schema@0\.6\.0-rc\.1/u);
  await refuses((registry) => { registry.attestation(react, first.react).predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = otherCommit; }, /@muxui\/react@0\.1\.0-rc\.5 has provenance .*: wrong the source commit\./u);
  await refuses((registry) => { registry.attestation(schema, first.schema).predicate.buildDefinition.externalParameters.workflow.ref = 'refs/heads/feature'; }, /wrong the workflow\./u);
  await refuses((registry) => { registry.attestation(catalog, first.catalog).subject[0].digest.sha512 = '0'.repeat(128); }, /wrong the subject sha512\./u);
});

test('the post-publication check retries npm audit signatures through a transient failure, and surfaces npm\'s error', async () => {
  // npm's JSON error for an attestation endpoint that still lags the publish, and a spawn that timed out with no output.
  const notFound = { status: 1, stdout: JSON.stringify({ error: { code: 'E404', summary: `404 Not Found - GET ${npm.REGISTRY}/-/npm/v1/attestations/@muxui%2freact@0.1.0-rc.5`, detail: '' } }), stderr: 'npm error code E404\n' };
  const timedOut = { status: null, stdout: '', stderr: '', error: Object.assign(new Error('spawnSync npm ETIMEDOUT'), { code: 'ETIMEDOUT' }) };
  const scripted = (registry, failures) => (args, options) => (args[0] === 'audit' && failures.length > 0 ? failures.shift() : registry.npm(args, options));
  const check = ({ registry, packages }, run, lines = []) => npm.verifyPublished({ packages, sourceCommit: commit, run, installAttempts: 3, intervalMs: 0, sleep: async () => {}, log: (line) => lines.push(line) });

  // Two transient failures, then npm's report: the check passes.
  const passing = publishedRegistry();
  const lines = [];
  await check(passing, scripted(passing.registry, [notFound, timedOut]), lines);
  assert.equal(passing.registry.npmCalls.filter((call) => call.startsWith('audit')).length, 1, 'the fake answered the third audit');
  assert.ok(lines.includes(`npm audit signatures failed with E404: 404 Not Found - GET ${npm.REGISTRY}/-/npm/v1/attestations/@muxui%2freact@0.1.0-rc.5`), lines.join('\n'));
  assert.ok(lines.includes('npm audit signatures failed with ETIMEDOUT: spawnSync npm ETIMEDOUT'));
  assert.match(lines.at(-1), /^Installed /u);

  // A transient failure that never clears fails after the bound, with npm's last code and message.
  const lagging = publishedRegistry();
  await assert.rejects(check(lagging, scripted(lagging.registry, [notFound, notFound, notFound])), (error) => error.title === 'Post-publication check failed'
    && error.message === `npm audit signatures failed 3 times; last with E404: 404 Not Found - GET ${npm.REGISTRY}/-/npm/v1/attestations/@muxui%2freact@0.1.0-rc.5`);

  // Any other npm error fails at once, with its code and message.
  const usage = publishedRegistry();
  const calls = [];
  const failing = scripted(usage.registry, [{ status: 1, stdout: '', stderr: 'npm error code EUSAGE\nnpm error audit signatures needs a lockfile' }, notFound]);
  await assert.rejects(check(usage, (args, options) => { calls.push(args[0]); return failing(args, options); }), /^Error: npm audit signatures failed with EUSAGE: npm error code EUSAGE npm error audit signatures needs a lockfile$/u);
  assert.deepEqual(calls, ['install', 'audit']);

  // A reported invalid signature is not retried.
  const invalid = publishedRegistry();
  invalid.registry.auditFaults[tooling] = 'invalid';
  await assert.rejects(check(invalid, invalid.registry.npm), /invalid signatures or attestations: @muxui\/tooling@1\.1\.0-rc\.1/u);
  assert.deepEqual(invalid.registry.npmCalls, ['install --ignore-scripts --no-audit --no-fund --legacy-peer-deps', 'audit signatures --json --include-attestations']);
});

test('a release whose post-publication check fails stops after the publish for a decision, and proposes no next release', async () => {
  const registry = createRegistry({ seed: reactHistory() });
  registry.auditFaults[react] = 'invalid';
  const { run, lines } = publishRun({ registry });
  const error = await run().then(() => assert.fail('the run should stop'), (stopped) => stopped);
  assert.equal(error.title, 'Post-publication check failed');
  assert.deepEqual(error.progress.failed, { name: null, version: null, phase: 'verify' });
  assert.deepEqual(registry.writes.map(({ name }) => name), names, 'every package published and read back first');
  assert.ok(lines.some((line) => /stop for a decision: the post-publication check failed/u.test(line)), lines.join('\n'));
  assert.ok(!lines.some((line) => line.startsWith('Next release:')));
});

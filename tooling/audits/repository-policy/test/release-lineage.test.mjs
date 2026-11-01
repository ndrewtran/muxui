import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import {
  downloadArtifactZip,
  fetchCandidate,
  findMainCiProof,
  main,
  planFullGroups,
  readCandidateZip,
  verifyCandidate,
  verifyDryRun,
} from '../src/release-lineage.mjs';
import { buildPortfolioManifest } from '../src/release-manifest.mjs';
import { PORTFOLIO_MANIFEST_FILE, candidateFileNames, parseReleaseVersions, readSourceVersions, tarballFileName } from '../src/release-set.mjs';
import { archiveOf, artifactsOf, committedStore, otherCommit, publishSet, readCommitted, tupleFixture } from './release-tuple-fixture.mjs';

// Decision 0030: the dry run reuses main's green full CI run for the exact commit, and a
// publish run promotes the dry run's candidate. These cases fail closed or fall back.
const repository = 'ndrewtran/muxui';
const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const groups = ['checks', 'react', 'storybook'];
const base = `/repos/${repository}/actions`;

// A scripted read-only GitHub client: the longest route key that prefixes the path answers.
function scriptedGithub(routes) {
  const calls = [];
  const github = async (path) => {
    calls.push(path);
    const key = Object.keys(routes).filter((candidate) => path.startsWith(candidate)).sort((left, right) => right.length - left.length)[0];
    assert.ok(key, `unexpected GET ${path}`);
    const answer = routes[key];
    if (answer instanceof Error) throw answer;
    return typeof answer === 'function' ? answer(path) : answer;
  };
  return { github, calls };
}

const ownRepository = { repository: { full_name: repository }, head_repository: { full_name: repository } };
const ciRun = (id, overrides = {}) => ({
  id, path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: sha, status: 'completed',
  conclusion: 'success', run_attempt: 1, html_url: `https://github.com/${repository}/actions/runs/${id}`, ...ownRepository, ...overrides,
});
const job = (name, conclusion = 'success', extra = {}) => ({ name, status: 'completed', conclusion, ...extra });
const greenJobs = ['plan', 'check', ...groups.map((id) => `run ${id}`)].map((name) => job(name));

// `attempt` overrides what `attempts/<n>` returns; by default it is the listed run read as attempt n.
async function mainCi({ runs = [ciRun(101)], jobs = greenJobs, attempt = {}, planGroups = () => groups, ...routes } = {}) {
  const { github, calls } = scriptedGithub({
    [`${base}/workflows/ci.yml/runs`]: { workflow_runs: runs },
    [`${base}/runs/`]: (path) => {
      if (path.includes('/jobs')) return { jobs: typeof jobs === 'function' ? jobs(path) : jobs };
      const [, id, number] = /runs\/(\d+)\/attempts\/(\d+)/u.exec(path);
      return { ...runs.find((run) => String(run.id) === id), run_attempt: Number(number), ...attempt };
    },
    ...routes,
  });
  return { result: await findMainCiProof({ repository, sha, github, planGroups }), calls };
}

test('the dry run reuses the newest green full push run of main for the exact commit, read as one attempt', async () => {
  const { result, calls } = await mainCi({ runs: [ciRun(100, { conclusion: 'success' }), ciRun(101, { run_attempt: 2 })] });
  assert.deepEqual(result, { reused: true, runId: 101, attempt: 2, url: `https://github.com/${repository}/actions/runs/101`, groups });
  assert.match(calls[0], new RegExp(`head_sha=${sha}&event=push&branch=main`, 'u'));
  // The run and its jobs are read as the attempt that is reported, not as the run's latest state.
  assert.deepEqual(calls.slice(1), [`${base}/runs/101/attempts/2`, `${base}/runs/101/attempts/2/jobs?per_page=100&page=1`]);
});

test('the dry run falls back to the full release:prepare unless main fully passed this commit', async () => {
  const fallback = async (options, reason) => {
    const { result } = await mainCi(options);
    assert.equal(result.reused, false, String(reason));
    assert.match(result.reason, reason);
  };
  // No usable run: none, another commit, a PR run, another workflow, another repository.
  await fallback({ runs: [] }, /no ci\.yml push run on main/u);
  await fallback({ runs: [ciRun(101, { head_sha: 'c'.repeat(40) })] }, /no ci\.yml push run on main/u);
  await fallback({ runs: [ciRun(101, { event: 'pull_request', head_branch: 'feature' })] }, /no ci\.yml push run on main/u);
  await fallback({ runs: [ciRun(101, { head_branch: 'feature' })] }, /no ci\.yml push run on main/u);
  await fallback({ runs: [ciRun(101, { event: 'workflow_dispatch' })] }, /no ci\.yml push run on main/u);
  await fallback({ runs: [ciRun(101, { path: '.github/workflows/npm-publish.yml' })] }, /no ci\.yml push run on main/u);
  await fallback({ runs: [ciRun(101, { head_repository: { full_name: 'someone/muxui' } })] }, /no ci\.yml push run on main/u);
  // An unfinished or failed run.
  await fallback({ runs: [ciRun(101, { status: 'in_progress', conclusion: null })] }, /run 101 is in_progress/u);
  await fallback({ runs: [ciRun(101, { conclusion: 'failure' })] }, /run 101 concluded failure/u);
  await fallback({ runs: [ciRun(101, { conclusion: 'cancelled' })] }, /concluded cancelled/u);
  // The aggregate or any planned group did not pass, whatever the run's label says.
  await fallback({ jobs: greenJobs.map((entry) => (entry.name === 'check' ? job('check', 'failure') : entry)) }, /no successful check/u);
  await fallback({ jobs: greenJobs.filter(({ name }) => name !== 'run storybook') }, /no successful run storybook/u);
  await fallback({ jobs: greenJobs.map((entry) => (entry.name === 'run react' ? job('run react', 'skipped') : entry)) }, /no successful run react/u);
  await fallback({ jobs: greenJobs.map((entry) => (entry.name === 'run checks' ? job('run checks', null, { status: 'in_progress' }) : entry)) }, /no successful run checks/u);
  // A partial plan (a group the full plan has that the run lacks) is not main's full proof.
  await fallback({ planGroups: () => [...groups, 'browser-webkit'] }, /no successful run browser-webkit/u);
  await fallback({ planGroups: () => [] }, /lists no groups/u);
  // A newer failure is never skipped for an older pass.
  await fallback({ runs: [ciRun(100), ciRun(102, { conclusion: 'failure' })] }, /run 102 concluded failure/u);
  // Attempt identity: the attempt listed must read back as that attempt, and its own state decides.
  await fallback({ runs: [ciRun(101, { run_attempt: 2 })], attempt: { run_attempt: 1 } }, /run 101 attempt 2 reads back as run 101 attempt 1/u);
  await fallback({ runs: [ciRun(101, { run_attempt: 2 })], attempt: { conclusion: 'failure' } }, /run 101 concluded failure/u);
  await fallback({ runs: [ciRun(101, { run_attempt: 2 })], attempt: { head_sha: 'c'.repeat(40) } }, /reads back as run 101 attempt 2/u);
  await fallback({ runs: [ciRun(101, { run_attempt: undefined })] }, /reports no attempt/u);
  // Unreadable: the API fails, or the plan cannot be computed.
  await fallback({ [`${base}/workflows/ci.yml/runs`]: new Error('HTTP 403') }, /unreadable \(HTTP 403\)/u);
  await fallback({ [`${base}/runs/`]: new Error('HTTP 500') }, /unreadable \(HTTP 500\)/u);
  await fallback({ planGroups: () => { throw new Error('planner exited 1'); } }, /unreadable \(planner exited 1\)/u);
});

test('main CI jobs are read across pages', async () => {
  const filler = Array.from({ length: 100 }, (_, index) => job(`filler ${index}`));
  const pages = { 1: filler, 2: greenJobs };
  const { result, calls } = await mainCi({ jobs: (path) => pages[/&page=(\d+)/u.exec(path)[1]] });
  assert.equal(result.reused, true);
  assert.equal(calls.filter((path) => path.includes('/jobs')).length, 2);
});

test('the planner CLI supplies the full plan group ids that main CI runs', () => {
  const written = planFullGroups({ run: (_command, _args, { env }) => writeFileSync(env.GITHUB_OUTPUT, 'groups=[{"id":"checks"},{"id":"react"}]\n') });
  assert.deepEqual(written, ['checks', 'react']);
  const real = planFullGroups();
  assert.ok(real.includes('checks') && real.includes('react') && real.includes('storybook'), real.join(','));
});

// The dry run a publish run promotes.
const publishWorkflow = '.github/workflows/npm-publish.yml';
const dryRun = (overrides = {}) => ({
  id: 555, path: publishWorkflow, event: 'workflow_dispatch', head_branch: 'main', head_sha: sha, status: 'completed',
  conclusion: 'success', run_attempt: 1, ...ownRepository, ...overrides,
});
const dryRunJobs = [
  job('prepare', 'success', { steps: [{ name: 'Rehearse npm publish (dry run)', conclusion: 'success' }, { name: 'Upload candidate', conclusion: 'success' }] }),
  job('publish', 'skipped'),
];
const archiveDigest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const candidateArtifact = (overrides = {}) => ({
  id: 9, name: 'npm-candidate', size_in_bytes: 4096, digest: `sha256:${'a'.repeat(64)}`, expired: false, workflow_run: { id: 555, head_sha: sha }, ...overrides,
});

// `latest` answers the run itself; `run` answers `attempts/<n>`, which is what is judged.
function dryRunGithub({ latest = dryRun(), run = dryRun({ run_attempt: latest.run_attempt }), jobs = dryRunJobs, artifacts = [candidateArtifact()] } = {}) {
  return scriptedGithub({
    [`${base}/runs/555/attempts/`]: (path) => (path.includes('/jobs') ? { jobs } : run),
    [`${base}/runs/555/artifacts`]: { artifacts },
    [`${base}/runs/555`]: latest,
  });
}

async function verify({ id = '555', current = '777', ...options } = {}) {
  const { github, calls } = dryRunGithub(options);
  return { ...(await verifyDryRun({ repository, sha, dryRunId: id, currentRunId: current, github })), calls };
}

test('a publish run accepts a successful dry run of this workflow on main at this commit, read as its latest attempt', async () => {
  const { run, attempt, artifact, calls } = await verify({ latest: dryRun({ run_attempt: 2 }) });
  assert.equal(run.id, 555);
  assert.equal(attempt, 2);
  assert.equal(artifact.id, 9);
  assert.deepEqual(calls.slice(0, 3), [`${base}/runs/555`, `${base}/runs/555/attempts/2`, `${base}/runs/555/attempts/2/jobs?per_page=100&page=1`]);
  // A dry run whose publish job is absent from the job list never published.
  await verify({ jobs: dryRunJobs.slice(0, 1) });
});

test('a publish run fails closed on any other run, a doomed dry run, or a lost artifact', async () => {
  const rejects = (options, message) => assert.rejects(verify(options), message);
  const wrong = (overrides) => ({ run: dryRun(overrides) });
  await rejects({ id: '' }, /needs the dry-run-id input/u);
  await rejects({ id: '55x' }, /needs the dry-run-id input/u);
  await rejects({ id: '555', current: '555' }, /names this publish run/u);
  await rejects(wrong({ head_sha: 'c'.repeat(40) }), /ran at c+, not a+/u);
  await rejects(wrong({ event: 'push' }), /ran on push, not workflow_dispatch/u);
  await rejects(wrong({ event: 'pull_request', head_branch: 'feature' }), /ran on pull_request, not workflow_dispatch; ran on feature, not main/u);
  await rejects(wrong({ head_branch: 'feature' }), /ran on feature, not main/u);
  await rejects(wrong({ path: '.github/workflows/ci.yml' }), /is \.github\/workflows\/ci\.yml, not \.github\/workflows\/npm-publish\.yml/u);
  await rejects(wrong({ head_repository: { full_name: 'someone/muxui' } }), /is not a run of ndrewtran\/muxui/u);
  await rejects(wrong({ conclusion: 'failure' }), /completed and failure, not a successful run/u);
  await rejects(wrong({ status: 'in_progress', conclusion: null }), /is in_progress, not a successful run/u);
  await rejects(wrong({ id: 556 }), /is run 556/u);
  // Attempt identity: the latest attempt must read back as that attempt.
  await rejects({ latest: dryRun({ run_attempt: 2 }), run: dryRun({ run_attempt: 1 }) }, /attempt 2 reads back as attempt 1/u);
  await rejects({ latest: dryRun({ run_attempt: undefined }) }, /reports no attempt/u);
  // A publish-mode run is not a dry run, a failed prepare is not a candidate, an upload may not have happened.
  await rejects({ jobs: [dryRunJobs[0], job('publish', 'success')] }, /not a dry run: its publish job ran/u);
  await rejects({ jobs: [job('prepare', 'failure', { steps: [] }), job('publish', 'skipped')] }, /prepare job did not succeed/u);
  await rejects({ jobs: [job('prepare', 'success', { steps: [] }), job('publish', 'skipped')] }, /did not upload a candidate/u);
  // Missing, duplicated, expired, misattributed, or unverifiable artifacts: a new dry run, never a substitute.
  await rejects({ artifacts: [] }, /has 0 npm-candidate artifacts; expected one/u);
  await rejects({ artifacts: [candidateArtifact(), candidateArtifact({ id: 10 })] }, /has 2 npm-candidate artifacts/u);
  await rejects({ artifacts: [candidateArtifact({ name: 'other' })] }, /has 0 npm-candidate artifacts/u);
  await rejects({ artifacts: [candidateArtifact({ expired: true })] }, /has expired/u);
  await rejects({ artifacts: [candidateArtifact({ workflow_run: { id: 999, head_sha: sha } })] }, /does not belong to run 555/u);
  await rejects({ artifacts: [candidateArtifact({ workflow_run: { id: 555, head_sha: 'c'.repeat(40) } })] }, /does not belong to run 555/u);
  await rejects({ artifacts: [candidateArtifact({ digest: null })] }, /no usable id, size, and sha256 digest/u);
  await rejects({ artifacts: [candidateArtifact({ digest: 'sha256:short' })] }, /no usable id, size, and sha256 digest/u);
});

// The artifact ZIP. Built by hand so a test can craft any entry a hostile archive could hold.
function zipOf(entries, { comment = Buffer.alloc(0), trailing = Buffer.alloc(0) } = {}) {
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? 'x');
    const method = entry.method ?? 0;
    const stored = method === 8 ? deflateRawSync(entry.deflated ?? data) : data;
    const name = Buffer.from(entry.name);
    const localName = Buffer.from(entry.localName ?? entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(entry.crc ?? crc32(data), 14);
    local.writeUInt32LE(entry.compressed ?? stored.length, 18);
    local.writeUInt32LE(entry.size ?? data.length, 22);
    local.writeUInt16LE(localName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(((entry.host ?? 3) << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(entry.crc ?? crc32(data), 16);
    central.writeUInt32LE(entry.compressed ?? stored.length, 20);
    central.writeUInt32LE(entry.size ?? data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.attributes ?? (((entry.mode ?? 0o100644) << 16) >>> 0), 38);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    parts.push(local, localName, stored);
    offset += 30 + localName.length + stored.length;
  }
  const centralDirectory = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...parts, centralDirectory, trailing, end, comment]);
}

// Two plain file names stand in for the candidate's files in the archive tests.
const tarballName = 'muxui-react-0.1.0-rc.5.tgz';
const manifestName = PORTFOLIO_MANIFEST_FILE;
const names = [tarballName, manifestName];
const versionsText = '@muxui/schema=0.6.0-rc.1,@muxui/catalog=2.1.0-rc.1,@muxui/tooling=1.1.0-rc.1,@muxui/react=0.1.0-rc.5';
const versions = parseReleaseVersions(versionsText, publishSet, readSourceVersions(publishSet));
const good = [{ name: tarballName, data: 'tarball bytes' }, { name: manifestName, data: '{"manifest":true}', method: 8 }];
const traversal = 'x/../../../../work/muxui/muxui/tooling/audits/repository-policy/src/release-lineage.mjs';

test('the artifact ZIP is inspected before anything is extracted', () => {
  const files = readCandidateZip(zipOf(good), names);
  assert.deepEqual(files.map(({ name, data }) => [name, data.toString()]), [[tarballName, 'tarball bytes'], [manifestName, '{"manifest":true}']]);
  const rejects = (archive, message) => assert.throws(() => readCandidateZip(archive, names), message);
  // Names: a traversal entry beside the two, or in place of one, an extra entry, a duplicate, a missing one.
  rejects(zipOf([...good, { name: traversal }]), /lists .*release-lineage\.mjs.*expected exactly/u);
  rejects(zipOf([good[0], { name: traversal }]), /expected exactly/u);
  rejects(zipOf([...good, { name: 'extra.txt' }]), /expected exactly/u);
  rejects(zipOf([...good, good[0]]), /expected exactly/u);
  rejects(zipOf([good[0], good[0]]), /expected exactly/u);
  rejects(zipOf([good[0]]), /expected exactly/u);
  rejects(zipOf([]), /expected exactly/u);
  for (const name of [`nested/${tarballName}`, `../${tarballName}`, `/tmp/${tarballName}`, `..\\${tarballName}`, 'x/../../escape', `${tarballName}/`, `${tarballName}\u0000.sh`]) {
    rejects(zipOf([{ name }, good[1]]), /expected exactly/u);
  }
  // Entries with the right names but a hostile kind or body.
  const entry = (overrides) => zipOf([{ ...good[0], ...overrides }, good[1]]);
  rejects(entry({ mode: 0o120777 }), /is not a regular file/u);
  rejects(entry({ mode: 0o040755 }), /is not a regular file/u);
  rejects(entry({ host: 0, mode: 0, attributes: 0x10 }), /is a directory/u);
  rejects(entry({ flags: 1 }), /is encrypted/u);
  rejects(entry({ method: 12 }), /compression method 12/u);
  rejects(entry({ localName: 'other.tgz' }), /local header for another file/u);
  rejects(entry({ crc: 1 }), /does not match its CRC-32/u);
  rejects(entry({ size: 3 }), /is 13 bytes, not the declared 3/u);
  rejects(entry({ size: 99 }), /is 13 bytes, not the declared 99/u);
  rejects(entry({ method: 8, deflated: Buffer.alloc(100_000), data: 'tiny', size: 4, crc: crc32(Buffer.from('tiny')) }), /does not inflate to its declared size/u);
  rejects(entry({ compressed: 5_000_000 }), /runs past the central directory/u);
  // Structure: no end record, trailing bytes before it, or an end record with a comment that hides one.
  rejects(Buffer.from('not a zip at all, but long enough to search'), /no end-of-central-directory/u);
  rejects(zipOf(good, { trailing: Buffer.from('extra') }), /does not end at the end record/u);
  const hidden = zipOf(good);
  assert.throws(() => readCandidateZip(hidden.subarray(0, hidden.length - 1), names), /no end-of-central-directory/u);
});

// The verified artifact: id 9, the zip's own sha256 and size.
function fetching({ archive = zipOf(good), artifact = {}, latest, expected = {}, workspace, directory } = {}) {
  // Only this scratch directory is ever removed; an explicit `directory` belongs to the caller.
  const scratch = mkdtempSync(join(tmpdir(), 'muxui-release-fetch-'));
  const target = directory ?? join(scratch, 'promoted');
  const record = candidateArtifact({ digest: archiveDigest(archive), size_in_bytes: archive.length, ...artifact });
  const { github } = dryRunGithub({ latest, artifacts: [record] });
  const downloads = [];
  const run = () => fetchCandidate({
    repository, sha, dryRunId: '555', currentRunId: '777', fileNames: names, directory: target, workspace, github,
    expected: { attempt: '1', artifactId: '9', digest: archiveDigest(archive), size: String(archive.length), ...expected },
    download: async (id) => {
      downloads.push(id);
      return archive;
    },
  });
  return { run, target, downloads, scratch };
}

async function withFetching(options, callback) {
  const scenario = fetching(options);
  try {
    return await callback(scenario);
  } finally {
    rmSync(scenario.scratch, { recursive: true, force: true });
  }
}

test('the verified artifact is downloaded by id, checked against its API digest, and extracted into a fresh directory', async () => {
  await withFetching({}, async ({ run, target, downloads }) => {
    const fetched = await run();
    assert.deepEqual(downloads, [9], 'downloaded by the verified artifact id, never by name');
    assert.equal(fetched.attempt, 1);
    assert.equal(readFileSync(join(target, tarballName), 'utf8'), 'tarball bytes');
    assert.equal(readFileSync(join(target, manifestName), 'utf8'), '{"manifest":true}');
  });
});

test('a hostile, replaced, or mismatched archive writes nothing', async () => {
  const rejects = (options, message) => withFetching(options, async ({ run, target, downloads }) => {
    await assert.rejects(run(), message);
    assert.equal(existsSync(target), false, 'the fresh directory is never created');
    return downloads;
  });
  // Digest and size are judged before the ZIP is parsed: garbage with the wrong digest is a mismatch, not a bad archive.
  const garbage = Buffer.from('definitely not the artifact');
  await withFetching({ archive: garbage, artifact: { digest: `sha256:${'f'.repeat(64)}`, size_in_bytes: garbage.length }, expected: { digest: `sha256:${'f'.repeat(64)}`, size: String(garbage.length) } }, async ({ run }) => {
    await assert.rejects(run(), /downloaded archive is \d+ bytes with sha256:[0-9a-f]{64}; artifact 9 is \d+ bytes with sha256:f+/u);
  });
  await withFetching({ artifact: { size_in_bytes: 1 }, expected: { size: '1' } }, async ({ run }) => {
    await assert.rejects(run(), /downloaded archive is \d+ bytes/u);
  });
  // A correct digest does not make a hostile archive safe: the traversal ZIP is refused before any write.
  const hostile = zipOf([...good, { name: traversal }]);
  await rejects({ archive: hostile }, /expected exactly/u);
  await rejects({ archive: zipOf([{ ...good[0], mode: 0o120777 }, good[1]]) }, /is not a regular file/u);
  await rejects({ archive: zipOf([...good, good[0]]) }, /expected exactly/u);
  // The artifact is not the one the verify step bound: another id, digest, size, or a rerun dry run.
  await rejects({ artifact: { id: 10 } }, /the artifact is 10, not the verified 9/u);
  await rejects({ expected: { artifactId: '8' } }, /the artifact is 9, not the verified 8/u);
  await rejects({ expected: { digest: `sha256:${'c'.repeat(64)}` } }, /artifact digest is sha256:[0-9a-f]+, not the verified sha256:c+/u);
  await rejects({ expected: { size: '1' } }, /bytes, not the verified 1/u);
  await rejects({ latest: dryRun({ run_attempt: 2 }), expected: { attempt: '1' } }, /the dry run is at attempt 2, not the verified 1/u);
  await rejects({ latest: dryRun({ run_attempt: 1 }), expected: { attempt: '2' } }, /the dry run is at attempt 1, not the verified 2/u);
  await rejects({ artifact: { expired: true } }, /has expired/u);
  // A second npm-candidate artifact appearing between the steps is not silently chosen.
  const second = scriptedGithub({
    [`${base}/runs/555/attempts/`]: (path) => (path.includes('/jobs') ? { jobs: dryRunJobs } : dryRun()),
    [`${base}/runs/555/artifacts`]: { artifacts: [candidateArtifact(), candidateArtifact({ id: 10 })] },
    [`${base}/runs/555`]: dryRun(),
  });
  await assert.rejects(fetchCandidate({
    repository, sha, dryRunId: '555', currentRunId: '777', fileNames: names, directory: join(tmpdir(), 'never-created'), github: second.github,
    expected: { attempt: '1', artifactId: '9', digest: candidateArtifact().digest, size: '4096' }, download: async () => assert.fail('no download'),
  }), /has 2 npm-candidate artifacts/u);
});

test('the candidate directory must be fresh and outside the checkout, and the files plain candidate names', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'muxui-release-workspace-'));
  const occupied = mkdtempSync(join(tmpdir(), 'muxui-release-occupied-'));
  try {
    await withFetching({ directory: join(workspace, 'promoted'), workspace }, async ({ run, target }) => {
      await assert.rejects(run(), /is inside the checkout/u);
      assert.equal(existsSync(target), false);
    });
    await withFetching({ directory: workspace, workspace }, async ({ run }) => {
      await assert.rejects(run(), /is inside the checkout/u);
    });
    await withFetching({ directory: occupied }, async ({ run, downloads }) => {
      await assert.rejects(run(), /already exists/u);
      assert.deepEqual(downloads, [], 'nothing is downloaded into an occupied directory');
    });
    // Outside the checkout and fresh is accepted.
    await withFetching({ workspace }, async ({ run }) => {
      await run();
    });
    // The names are written to disk, so a name that is not a plain file name is judged before any read.
    const never = () => assert.fail('no read before the names are judged');
    await assert.rejects(fetchCandidate({
      repository, sha, dryRunId: '555', currentRunId: '777', fileNames: ['../muxui-react-0.1.0-rc.5.tgz'], directory: join(workspace, 'x'), expected: {}, github: never, download: never,
    }), /not plain candidate file names/u);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(occupied, { recursive: true, force: true });
  }
});

test('the artifact ZIP request sends the token to GitHub and not to the redirect target', async () => {
  const seen = [];
  const listen = (handler) => new Promise((done) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => done(server));
  });
  const storage = await listen((request, response) => {
    seen.push(['storage', request.headers.authorization ?? null]);
    response.end('zip bytes');
  });
  const github = await listen((request, response) => {
    seen.push(['github', request.headers.authorization ?? null, request.url]);
    response.writeHead(302, { location: `http://127.0.0.1:${storage.address().port}/blob` });
    response.end();
  });
  try {
    const bytes = await downloadArtifactZip({ repository, artifactId: 9, token: 'secret-token', apiUrl: `http://127.0.0.1:${github.address().port}` });
    assert.equal(bytes.toString(), 'zip bytes');
    assert.deepEqual(seen, [['github', 'Bearer secret-token', `/repos/${repository}/actions/artifacts/9/zip`], ['storage', null]]);
  } finally {
    github.close();
    storage.close();
  }
});

// The downloaded candidate: the tarball of each package and one manifest, verified byte for byte.
const preparation = { mode: 'main-ci-reused', mainCi: { runId: 101, runAttempt: 1 } };

// `fixture` changes the tuple's tarballs, `manifest` edits the written manifest, and `fileVersions` names a tarball by another version.
function candidate({ fixture = {}, manifest = {}, fileVersions = {}, extraFile, omit } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'muxui-release-lineage-'));
  const directory = join(root, 'candidate');
  mkdirSync(directory);
  const tuple = tupleFixture(fixture);
  const artifacts = artifactsOf(tuple);
  const built = buildPortfolioManifest({ publishSet, artifacts, source: { revision: sha, tree }, readCommitted, preparation });
  for (const [name, bytes] of artifacts) {
    if (name !== omit) writeFileSync(join(directory, tarballFileName(name, fileVersions[name] ?? tuple.versions[name])), bytes);
  }
  writeFileSync(join(directory, PORTFOLIO_MANIFEST_FILE), JSON.stringify({ ...built, ...manifest }));
  if (extraFile) writeFileSync(join(directory, extraFile), 'x');
  return { root, directory, built, artifacts, integrity: built.packages.find(({ name }) => name === '@muxui/react').integrity };
}

async function withCandidate(options, callback) {
  const built = candidate(options);
  try {
    return await callback(built);
  } finally {
    rmSync(built.root, { recursive: true, force: true });
  }
}

test('a promoted candidate set must match the authorized digest, the versions, the commit, and its own manifest', async () => {
  await withCandidate({}, ({ directory, integrity, built, artifacts }) => {
    const verified = (overrides = {}) => verifyCandidate({ directory, publishSet, versions, expectedSha512: integrity, sha, tree, readCommitted, ...overrides });
    assert.deepEqual(verified(), { versions, integrity, digest: built.digest, preparation });
    assert.throws(() => verified({ expectedSha512: '' }), /needs the tarball-sha512 input/u);
    assert.equal(verified({ expectedSha512: '', requireDigest: false }).integrity, integrity);
    assert.throws(() => verified({ expectedSha512: 'sha512-other' }), /Promoted tarball is sha512-.*; the tarball-sha512 input is sha512-other/u);
    // The versions name the files, so another version asks for files the artifact does not hold.
    assert.throws(() => verified({ versions: new Map([...versions, ['@muxui/react', '0.1.0-rc.6']]) }), /Expected exactly the tarball of each package and one release manifest/u);
    assert.throws(() => verified({ sha: 'c'.repeat(40) }), /P2_1_MANIFEST_SOURCE_MISMATCH: the manifest source revision is a+, not c+/u);
    assert.throws(() => verified({ tree: 'd'.repeat(40) }), /the manifest source tree is b+, not d+/u);
    // The retained evidence is read as committed at the commit: an index changed since the dry run fails the promotion.
    const edited = committedStore();
    edited.set('tests/evidence/r1.1/index.json', Buffer.from('{"milestone":"R1.1","edited":true}\n'));
    assert.throws(() => verified({ readCommitted: edited.read }), /P2_1_MANIFEST_RECORD_MISMATCH: the recorded evidence is not what/u);
    // One tarball repacked under its recorded version.
    const other = tupleFixture();
    other.files['@muxui/tooling']['src/extra.mjs'] = 'export {};\n';
    writeFileSync(join(directory, tarballFileName('@muxui/tooling', '1.1.0-rc.1')), archiveOf(other.files['@muxui/tooling']));
    assert.throws(() => verified(), /P2_1_MANIFEST_PACKAGE_REPACKED: @muxui\/tooling@1\.1\.0-rc\.1/u);
    writeFileSync(join(directory, tarballFileName('@muxui/tooling', '1.1.0-rc.1')), artifacts.get('@muxui/tooling'));
    assert.equal(verified().digest, built.digest);
  });
  // A published package built from another commit.
  await withCandidate({ fixture: { commits: { '@muxui/catalog': otherCommit } } }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, publishSet, versions, expectedSha512: integrity, sha, tree, readCommitted }), /P2_1_MANIFEST_COMMIT_MISMATCH: @muxui\/catalog is built from b+, not its recorded a+/u);
  });
  // A manifest edited after preparation no longer matches its digest.
  await withCandidate({ manifest: { source: { revision: sha, tree: 'd'.repeat(40) } } }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, publishSet, versions, expectedSha512: integrity, sha, tree, readCommitted }), /P2_1_MANIFEST_DIGEST_MISMATCH/u);
  });
  await withCandidate({ manifest: { schema: 'other' } }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, publishSet, versions, expectedSha512: integrity, sha, tree, readCommitted }), /the manifest schema is other/u);
  });
  // A tarball named for one version that holds another.
  await withCandidate({ fixture: { versions: { '@muxui/react': '0.1.0-rc.6' } }, fileVersions: { '@muxui/react': '0.1.0-rc.5' } }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, publishSet, versions, expectedSha512: integrity, sha, tree, readCommitted }), /@muxui\/react is 0\.1\.0-rc\.6, not the version input 0\.1\.0-rc\.5/u);
  });
  // Files beyond, or short of, the set.
  await withCandidate({ extraFile: 'notes.txt' }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, publishSet, versions, expectedSha512: integrity, sha, tree, readCommitted }), /Expected exactly the tarball of each package and one release manifest/u);
  });
  await withCandidate({ omit: '@muxui/schema' }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, publishSet, versions, expectedSha512: integrity, sha, tree, readCommitted }), /Expected exactly the tarball of each package/u);
  });
});

test('the lineage CLI reports in the lines the R1 exit capture reads, and writes outputs and the summary', async () => {
  const root = mkdtempSync(join(tmpdir(), 'muxui-release-lineage-cli-'));
  try {
    const environment = { GITHUB_REPOSITORY: repository, GITHUB_SHA: sha, GITHUB_OUTPUT: join(root, 'output'), GITHUB_STEP_SUMMARY: join(root, 'summary') };
    const lines = [];
    const take = () => lines.splice(0);
    const read = (file) => readFileSync(join(root, file), 'utf8');
    const io = (github, extra = {}) => ({ github, log: (line) => lines.push(line), planGroups: () => groups, ...extra });
    writeFileSync(environment.GITHUB_OUTPUT, '');
    writeFileSync(environment.GITHUB_STEP_SUMMARY, '');

    const greenGithub = scriptedGithub({
      [`${base}/workflows/ci.yml/runs`]: { workflow_runs: [ciRun(101, { run_attempt: 2 })] },
      [`${base}/runs/101/attempts/2/jobs`]: { jobs: greenJobs },
      [`${base}/runs/101/attempts/2`]: ciRun(101, { run_attempt: 2 }),
    });
    await main('main-ci', environment, io(greenGithub.github));
    assert.deepEqual(take(), [`Main CI proof: reusing run 101 attempt 2 (https://github.com/${repository}/actions/runs/101); running generate:check and release-prepare.mjs instead of the full check graph`]);
    assert.equal(read('output'), 'mode=reuse\nrun-id=101\nattempt=2\n');
    assert.match(read('summary'), /### Main CI proof\n\n- reused: \[run 101\]/u);

    writeFileSync(environment.GITHUB_OUTPUT, '');
    const red = scriptedGithub({ [`${base}/workflows/ci.yml/runs`]: { workflow_runs: [ciRun(101, { conclusion: 'failure' })] }, [`${base}/runs/101/attempts/1`]: ciRun(101, { conclusion: 'failure' }) });
    await main('main-ci', environment, io(red.github));
    assert.deepEqual(take(), [
      'Main CI proof: not reused (main CI run 101 concluded failure); running the full release:prepare',
      '::warning title=Main CI proof not reused::main CI run 101 concluded failure; running the full release:prepare.',
    ]);
    assert.equal(read('output'), 'mode=full\nrun-id=\nattempt=\n');
    // An environment the workflow never produces still falls back instead of failing the run.
    await main('main-ci', { ...environment, GITHUB_SHA: 'HEAD' }, io(red.github));
    assert.match(take()[0], /^Main CI proof: not reused \(GITHUB_SHA is HEAD\.\); running the full release:prepare$/u);

    // The verify step binds the attempt, artifact id, digest, and size that the fetch step must find again.
    const dry = dryRunGithub({ latest: dryRun({ run_attempt: 2 }) });
    writeFileSync(environment.GITHUB_OUTPUT, '');
    await main('dry-run', { ...environment, DRY_RUN_ID: '555', GITHUB_RUN_ID: '777' }, io(dry.github));
    assert.deepEqual(take(), [`Dry run 555 attempt 2 succeeded at ${sha}; npm-candidate artifact 9 (4096 bytes, sha256:${'a'.repeat(64)})`]);
    assert.equal(read('output'), `attempt=2\nartifact-id=9\nartifact-digest=sha256:${'a'.repeat(64)}\nartifact-size=4096\n`);
    await assert.rejects(main('dry-run', { ...environment, DRY_RUN_ID: '' }, io(dry.github)), /needs the dry-run-id input/u);

    // The fetch step reports the artifact it extracted; it fails when the binding does not hold.
    const cliNames = candidateFileNames(publishSet, versions);
    const archive = zipOf(cliNames.map((name) => ({ name, data: `${name} bytes` })));
    const fetchEnvironment = (directory, overrides = {}) => ({
      ...environment, DRY_RUN_ID: '555', GITHUB_RUN_ID: '777', DRY_RUN_ATTEMPT: '1', MUXUI_RELEASE_VERSIONS: versionsText, ARTIFACT_ID: '9', ARTIFACT_DIGEST: archiveDigest(archive),
      ARTIFACT_SIZE: String(archive.length), CANDIDATE_DIR: directory, GITHUB_WORKSPACE: join(root, 'workspace'), ...overrides,
    });
    const fetchGithub = dryRunGithub({ artifacts: [candidateArtifact({ digest: archiveDigest(archive), size_in_bytes: archive.length })] });
    await main('fetch-candidate', fetchEnvironment(join(root, 'promoted')), io(fetchGithub.github, { download: async () => archive }));
    assert.deepEqual(take(), [`Fetched npm-candidate artifact 9 (${archive.length} bytes, ${archiveDigest(archive)}) from dry run 555 attempt 1`]);
    assert.deepEqual(readdirSync(join(root, 'promoted')).sort(), [...cliNames].sort());
    assert.equal(readFileSync(join(root, 'promoted', cliNames[3]), 'utf8'), `${cliNames[3]} bytes`);
    await assert.rejects(main('fetch-candidate', fetchEnvironment(join(root, 'again'), { MUXUI_RELEASE_VERSIONS: '' }), io(fetchGithub.github)), /MUXUI_RELEASE_VERSIONS is not set/u);
    await assert.rejects(main('fetch-candidate', fetchEnvironment(join(root, 'again'), { MUXUI_RELEASE_VERSIONS: versionsText.replace('0.6.0-rc.1', '0.6.0') }), io(fetchGithub.github)), /Release versions invalid|"0\.6\.0" is not an rc version/u);
    await assert.rejects(main('fetch-candidate', fetchEnvironment(join(root, 'again'), { DRY_RUN_ATTEMPT: '2' }), io(fetchGithub.github, { download: async () => archive })), /the dry run is at attempt 1, not the verified 2/u);
    await assert.rejects(main('fetch-candidate', fetchEnvironment(join(root, 'again'), { ARTIFACT_ID: '' }), io(fetchGithub.github)), /ARTIFACT_ID is not set/u);

    await withCandidate({}, async ({ directory, integrity }) => {
      const promoted = { ...environment, DRY_RUN_ID: '555', DRY_RUN_ATTEMPT: '2', CANDIDATE_DIR: directory, MUXUI_RELEASE_VERSIONS: versionsText, EXPECTED_SHA512: integrity };
      await main('candidate', promoted, io(null, { readTree: () => tree, readCommitted }));
      assert.deepEqual(take(), [
        `Promoted candidate 0.1.0-rc.5 ${integrity} from dry run 555 attempt 2`,
        'Dry run preparation: reused main CI run 101 attempt 1',
      ]);
      assert.match(read('summary'), /### Promoted candidate\n\n- @muxui\/schema: `0\.6\.0-rc\.1`\n- @muxui\/catalog: `2\.1\.0-rc\.1`/u);
      // The dry run reads its own candidate the same way, without the authorized digest.
      await main('prepared', { ...promoted, EXPECTED_SHA512: '' }, io(null, { readTree: () => tree, readCommitted }));
      assert.match(take().at(-1), /^Prepared candidate set @muxui\/schema@0\.6\.0-rc\.1, @muxui\/catalog@2\.1\.0-rc\.1, @muxui\/tooling@1\.1\.0-rc\.1, @muxui\/react@0\.1\.0-rc\.5; release manifest sha256:[0-9a-f]{64}; @muxui\/react sha512-/u);
      await assert.rejects(main('prepared', { ...promoted, GITHUB_SHA: 'c'.repeat(40) }, io(null, { readTree: () => tree, readCommitted })), /the manifest source revision is a+, not c+/u);
      await assert.rejects(main('candidate', { ...promoted, EXPECTED_SHA512: 'sha512-other' }, io(null, { readTree: () => tree, readCommitted })), /Promoted tarball is/u);
      assert.deepEqual(take(), []);
      // The attempt the dry-run step verified must reach the promotion line.
      await assert.rejects(main('candidate', { ...promoted, DRY_RUN_ATTEMPT: '' }, io(null, { readTree: () => tree, readCommitted })), /DRY_RUN_ATTEMPT is not set/u);
      await assert.rejects(main('candidate', { ...promoted, DRY_RUN_ATTEMPT: 'unknown' }, io(null, { readTree: () => tree, readCommitted })), /DRY_RUN_ATTEMPT is unknown/u);
    });
    await assert.rejects(main('unknown', environment, io(null)), /Expected main-ci, dry-run, fetch-candidate, candidate, or prepared/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The workflow's safety shape, since the run itself cannot be exercised before a real dispatch.
test('npm-publish.yml promotes in publish mode, prepares only in dry-run mode, and keeps Actions access off the OIDC job', () => {
  const workflow = readFileSync(resolve(import.meta.dirname, '../../../../.github/workflows/npm-publish.yml'), 'utf8');
  const job = (name) => new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'mu').exec(workflow)[1];
  const prepare = job('prepare');
  const publish = job('publish');
  const step = (title) => prepare.split(/^      - /mu).find((entry) => entry.startsWith(`name: ${title}\n`));
  // The set's versions reach every job through one workflow variable, from one input per member.
  for (const [name, input] of [['schema', 'schema-version'], ['catalog', 'catalog-version'], ['tooling', 'tooling-version'], ['react', 'version']]) {
    assert.match(workflow, new RegExp(`^env:\\n  MUXUI_RELEASE_VERSIONS: .*@muxui/${name}=\\$\\{\\{ inputs\\.${input} \\}\\}`, 'mu'), name);
  }
  assert.match(step('Validate release versions'), /release-set\.mjs validate-versions/u);
  assert.match(step('Check candidate against inputs'), /release-lineage\.mjs prepared/u);
  // The ordered publish job replaced the refusal: publish mode promotes and then publishes, behind one approval.
  assert.equal(step('Refuse publishing a package set'), undefined);
  const stepNames = [...prepare.matchAll(/^      - (?:name|uses): (.+)$/gmu)].map(([, title]) => title);
  assert.equal(stepNames[0], 'Require main for publish mode');
  assert.match(step('Find main CI proof'), /if: inputs\.mode == 'dry-run'/u);
  assert.match(step('Prepare release candidate'), /if: inputs\.mode == 'dry-run'/u);
  for (const title of ['Verify dry run', 'Fetch dry-run candidate', 'Verify promoted candidate']) {
    assert.match(step(title), /if: inputs\.mode == 'publish'/u, title);
  }
  // The fetch binds the attempt and artifact the verify step reported, and no general extractor touches the archive.
  const fetch = step('Fetch dry-run candidate');
  for (const [name, output] of [['DRY_RUN_ATTEMPT', 'attempt'], ['ARTIFACT_ID', 'artifact-id'], ['ARTIFACT_DIGEST', 'artifact-digest'], ['ARTIFACT_SIZE', 'artifact-size']]) {
    assert.match(fetch, new RegExp(`${name}: \\$\\{\\{ steps\\.dryrun\\.outputs\\.${output} \\}\\}`, 'u'), name);
  }
  assert.match(fetch, /CANDIDATE_DIR: \$\{\{ runner\.temp \}\}\/promoted/u);
  assert.match(fetch, /release-lineage\.mjs fetch-candidate/u);
  assert.doesNotMatch(prepare, /download-artifact|unzip/u);
  assert.match(step('Verify promoted candidate'), /DRY_RUN_ATTEMPT: \$\{\{ steps\.dryrun\.outputs\.attempt \}\}/u);
  assert.match(prepare, /permissions:\n      contents: read\n      actions: read\n/u);
  assert.match(workflow, /retention-days: 30/u);
  // The job that holds the OIDC identity never reads Actions and never builds.
  assert.match(publish, /id-token: write/u);
  assert.doesNotMatch(publish, /actions: read|release:prepare|release-prepare|release-lineage/u);
});

// The ordered publish job (E-P2.1-06): one approval and one OIDC identity for the set, every input through the environment.
test('npm-publish.yml publishes the set in one approved job and keeps every input out of shell text', () => {
  const workflow = readFileSync(resolve(import.meta.dirname, '../../../../.github/workflows/npm-publish.yml'), 'utf8');
  const job = (name) => new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'mu').exec(workflow)[1];
  const publish = job('publish');
  assert.match(publish, /if: inputs\.mode == 'publish' && github\.ref == 'refs\/heads\/main'\n    needs: prepare\n/u);
  // One environment approval covers every package, and only this job holds the OIDC identity.
  assert.equal(publish.match(/^    environment: npm-publish$/gmu)?.length, 1);
  assert.equal(workflow.match(/^ +id-token: write$/gmu)?.length, 1);
  assert.doesNotMatch(job('prepare') + job('registry-preflight'), /environment:|id-token/u);
  assert.match(publish, /concurrency:\n      group: npm-publish\n      cancel-in-progress: false/u);
  // The checkout holds only the publication script, the set reader it imports, and the set it reads.
  assert.match(publish, /sparse-checkout: \|\n            tooling\/audits\/repository-policy\/publish-set\.json\n            tooling\/audits\/repository-policy\/src\/npm-publication\.mjs\n            tooling\/audits\/repository-policy\/src\/release-set\.mjs\n          sparse-checkout-cone-mode: false/u);
  // Verify, then publish each package in order with its own preflight, recheck, provenance, and read-back (all in the script).
  const commands = [...publish.matchAll(/npm-publication\.mjs (\S+)$/gmu)].map(([, command]) => command);
  assert.deepEqual(commands, ['check-npm', 'verify-candidate', 'publish-set']);
  assert.deepEqual([...publish.matchAll(/^      - name: (.+)$/gmu)].map(([, title]) => title), ['Require trusted-publishing npm', 'Re-verify candidate', 'Publish the set in order']);
  assert.doesNotMatch(publish.replace(/^\s*#.*$/gmu, ''), /npm publish|release-lineage|release:prepare|actions: read/u);
  assert.match(publish, /EXPECTED_SHA512: \$\{\{ inputs\.tarball-sha512 \}\}/u);
  // The temporary first-publish token reaches the publish script's step and no other step or job.
  assert.equal(workflow.match(/secrets\.NPM_TOKEN/gu)?.length, 1);
  const publishStep = publish.split(/^      - /mu).find((entry) => entry.startsWith('name: Publish the set in order\n'));
  assert.match(publishStep, /env:\n[\s\S]*\n          NPM_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}\n        run: /u);
  // The read-only preflight mode reads every package and holds no credential.
  assert.match(job('registry-preflight'), /npm-publication\.mjs preflight-set\n/u);
  // Inputs reach scripts through `env:`; no step interpolates a workflow expression into `run:`.
  for (const step of ['registry-preflight', 'prepare', 'publish'].flatMap((name) => job(name).split(/^ {6}- /mu).slice(1))) {
    const run = step.indexOf('\n        run:');
    if (run >= 0) assert.doesNotMatch(step.slice(run), /\$\{\{/u, step.split('\n')[0]);
  }
});

// E-P2.1-04: a dry run names the release it compares with, only through the environment, and the shape fails before the long preparation.
test('npm-publish.yml names the prior release in a dry run, validates it before preparing, and leaves publish to the recorded outcome', () => {
  const workflow = readFileSync(resolve(import.meta.dirname, '../../../../.github/workflows/npm-publish.yml'), 'utf8');
  const job = (name) => new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'mu').exec(workflow)[1];
  const prepare = job('prepare');
  const step = (title) => prepare.split(/^      - /mu).find((entry) => entry.startsWith(`name: ${title}\n`));
  assert.match(workflow, /^      prior-release:\n        description: .+\n        required: false\n        type: string\n        default: ''$/mu);
  assert.match(workflow, /^      first-portfolio-release:\n        description: .+\n        required: false\n        type: boolean\n        default: false$/mu);
  // The preparing step reads both from its environment; no other job or step does, and publish re-derives nothing.
  const preparing = step('Prepare release candidate');
  assert.match(preparing, /env:\n[\s\S]*\n          MUXUI_PRIOR_RELEASE_MANIFEST: \$\{\{ inputs\.prior-release \}\}\n          MUXUI_FIRST_PORTFOLIO_RELEASE: \$\{\{ inputs\.first-portfolio-release && 'true' \|\| '' \}\}\n        run: /u);
  assert.equal(workflow.match(/MUXUI_(?:PRIOR_RELEASE_MANIFEST|FIRST_PORTFOLIO_RELEASE):/gu)?.length, 2);
  assert.doesNotMatch(job('registry-preflight') + job('publish'), /prior-release|first-portfolio-release|MUXUI_PRIOR|MUXUI_FIRST|versionEffects/u);
  // The input check sits with the version checks, ahead of the install, the checks, and the pack.
  const titles = [...prepare.matchAll(/^      - name: (.+)$/gmu)].map(([, title]) => title);
  assert.ok(titles.indexOf('Validate prior release inputs') > titles.indexOf('Validate release versions'));
  assert.ok(titles.indexOf('Validate prior release inputs') < titles.indexOf('Install workspace'));
  const validating = step('Validate prior release inputs');
  assert.match(validating, /env:\n          MODE: \$\{\{ inputs\.mode \}\}\n          PRIOR_RELEASE: \$\{\{ inputs\.prior-release \}\}\n          FIRST_RELEASE: \$\{\{ inputs\.first-portfolio-release \}\}\n        run: \|/u);
  // Run the step's script: a dry run needs exactly one of the two, and the path is a tracked-evidence JSON path.
  const script = validating.split('        run: |\n')[1].replace(/^ {10}/gmu, '');
  const outcome = (mode, prior, first) => {
    try {
      execFileSync('bash', ['-c', script], { env: { PATH: process.env.PATH, MODE: mode, PRIOR_RELEASE: prior, FIRST_RELEASE: first }, encoding: 'utf8', stdio: 'pipe' });
      return 'accepted';
    } catch (error) {
      return /title=([^:]+)::/u.exec(error.stdout)?.[1] ?? error.message;
    }
  };
  const evidence = 'tests/evidence/p2-1/release-manifest.json';
  assert.equal(outcome('dry-run', evidence, 'false'), 'accepted');
  assert.equal(outcome('dry-run', '', 'true'), 'accepted');
  assert.equal(outcome('dry-run', '', 'false'), 'Prior release required');
  assert.equal(outcome('dry-run', evidence, 'true'), 'Prior release ambiguous');
  for (const bad of ['/etc/release.json', 'release.json', 'docs/release.json', 'tests/evidence/release.txt', 'tests/evidence/../../release.json', 'tests/evidence/a..b.json', 'tests/evidence/a b.json', 'tests/evidence/$(id).json']) {
    assert.equal(outcome('dry-run', bad, 'false'), 'Prior release path', bad);
    assert.equal(outcome('publish', bad, 'false'), 'Prior release path', bad);
  }
  // Publish promotes the dry run's candidate: it neither needs the setting nor reads it.
  assert.equal(outcome('publish', '', 'false'), 'accepted');
  assert.equal(outcome('publish', evidence, 'false'), 'accepted');
});

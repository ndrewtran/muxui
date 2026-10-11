import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const version = '0.1.0-rc.3';
const tarballName = `muxui-react-${version}.tgz`;
const manifestName = `muxui-react-${version}.release-manifest.json`;
const names = [tarballName, manifestName];
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
    repository, sha, dryRunId: '555', currentRunId: '777', version, directory: target, workspace, github,
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
    repository, sha, dryRunId: '555', currentRunId: '777', version, directory: join(tmpdir(), 'never-created'), github: second.github,
    expected: { attempt: '1', artifactId: '9', digest: candidateArtifact().digest, size: '4096' }, download: async () => assert.fail('no download'),
  }), /has 2 npm-candidate artifacts/u);
});

test('the candidate directory must be fresh and outside the checkout, and the version a release candidate', async () => {
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
    // The version names the two files, so it must be an admitted candidate version.
    const never = () => assert.fail('no read before the version is judged');
    await assert.rejects(fetchCandidate({
      repository, sha, dryRunId: '555', currentRunId: '777', version: '../0.1.0', directory: join(workspace, 'x'), expected: {}, github: never, download: never,
    }), /not an admitted candidate version/u);
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

// The downloaded candidate: one tarball and one manifest, verified byte for byte.
const preparation = { mode: 'main-ci-reused', mainCi: { runId: 101, runAttempt: 1 } };

function candidate({ manifest = {}, packed = version, extraFile } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'muxui-release-lineage-'));
  const source = join(root, 'source/package');
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@muxui/react', version: packed }));
  const directory = join(root, 'candidate');
  mkdirSync(directory);
  const tarball = join(directory, `muxui-react-${version}.tgz`);
  execFileSync('tar', ['-czf', tarball, '-C', join(root, 'source'), 'package']);
  const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
  writeFileSync(join(directory, `muxui-react-${version}.release-manifest.json`), JSON.stringify({
    schema: 'muxui-r1-exit-publication-preparation-v1',
    package: { version },
    artifact: { integrity },
    source: { revision: sha },
    correlation: { source: { tree } },
    preparation,
    ...manifest,
  }));
  if (extraFile) writeFileSync(join(directory, extraFile), 'x');
  return { root, directory, integrity, tarball };
}

async function withCandidate(options, callback) {
  const built = candidate(options);
  try {
    return await callback(built);
  } finally {
    rmSync(built.root, { recursive: true, force: true });
  }
}

test('a promoted candidate must match the authorized digest, the version, and the commit', async () => {
  await withCandidate({}, ({ directory, integrity }) => {
    const verified = (overrides = {}) => verifyCandidate({ directory, version, expectedSha512: integrity, sha, tree, ...overrides });
    assert.deepEqual(verified(), { version, integrity, preparation });
    assert.throws(() => verified({ expectedSha512: '' }), /needs the tarball-sha512 input/u);
    assert.throws(() => verified({ expectedSha512: 'sha512-other' }), /Promoted tarball is sha512-.*; the tarball-sha512 input is sha512-other/u);
    assert.throws(() => verified({ version: '0.1.0-rc.4' }), /the tarball is 0\.1\.0-rc\.3, not the version input 0\.1\.0-rc\.4; the manifest is for 0\.1\.0-rc\.3/u);
    assert.throws(() => verified({ sha: 'c'.repeat(40) }), /manifest source revision is a+, not c+/u);
    assert.throws(() => verified({ tree: 'd'.repeat(40) }), /manifest source tree is b+, not d+/u);
  });
  await withCandidate({ manifest: { artifact: { integrity: 'sha512-stale' } } }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, version, expectedSha512: integrity, sha, tree }), /manifest digest is sha512-stale/u);
  });
  await withCandidate({ manifest: { source: { revision: 'c'.repeat(40) } } }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, version, expectedSha512: integrity, sha, tree }), /manifest source revision is c+, not a+/u);
  });
  await withCandidate({ manifest: { schema: 'other' } }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, version, expectedSha512: integrity, sha, tree }), /manifest schema is other/u);
  });
  await withCandidate({ packed: '0.1.0-rc.4' }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, version, expectedSha512: integrity, sha, tree }), /the tarball is 0\.1\.0-rc\.4, not the version input/u);
  });
  await withCandidate({ extraFile: 'notes.txt' }, ({ directory, integrity }) => {
    assert.throws(() => verifyCandidate({ directory, version, expectedSha512: integrity, sha, tree }), /exactly one tarball and one release manifest/u);
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
    const archive = zipOf(good);
    const fetchEnvironment = (directory, overrides = {}) => ({
      ...environment, DRY_RUN_ID: '555', GITHUB_RUN_ID: '777', DRY_RUN_ATTEMPT: '1', VERSION: version, ARTIFACT_ID: '9', ARTIFACT_DIGEST: archiveDigest(archive),
      ARTIFACT_SIZE: String(archive.length), CANDIDATE_DIR: directory, GITHUB_WORKSPACE: join(root, 'workspace'), ...overrides,
    });
    const fetchGithub = dryRunGithub({ artifacts: [candidateArtifact({ digest: archiveDigest(archive), size_in_bytes: archive.length })] });
    await main('fetch-candidate', fetchEnvironment(join(root, 'promoted')), io(fetchGithub.github, { download: async () => archive }));
    assert.deepEqual(take(), [`Fetched npm-candidate artifact 9 (${archive.length} bytes, ${archiveDigest(archive)}) from dry run 555 attempt 1`]);
    assert.equal(readFileSync(join(root, 'promoted', tarballName), 'utf8'), 'tarball bytes');
    await assert.rejects(main('fetch-candidate', fetchEnvironment(join(root, 'again'), { DRY_RUN_ATTEMPT: '2' }), io(fetchGithub.github, { download: async () => archive })), /the dry run is at attempt 1, not the verified 2/u);
    await assert.rejects(main('fetch-candidate', fetchEnvironment(join(root, 'again'), { ARTIFACT_ID: '' }), io(fetchGithub.github)), /ARTIFACT_ID is not set/u);

    await withCandidate({}, async ({ directory, integrity }) => {
      const promoted = { ...environment, DRY_RUN_ID: '555', DRY_RUN_ATTEMPT: '2', CANDIDATE_DIR: directory, VERSION: version, EXPECTED_SHA512: integrity };
      await main('candidate', promoted, io(null, { readTree: () => tree }));
      assert.deepEqual(take(), [
        `Promoted candidate ${version} ${integrity} from dry run 555 attempt 2`,
        'Dry run preparation: reused main CI run 101 attempt 1',
      ]);
      assert.match(read('summary'), /### Promoted candidate\n\n- version: `0\.1\.0-rc\.3`/u);
      await assert.rejects(main('candidate', { ...promoted, EXPECTED_SHA512: 'sha512-other' }, io(null, { readTree: () => tree })), /Promoted tarball is/u);
      // The attempt the dry-run step verified must reach the promotion line.
      await assert.rejects(main('candidate', { ...promoted, DRY_RUN_ATTEMPT: '' }, io(null, { readTree: () => tree })), /DRY_RUN_ATTEMPT is not set/u);
      await assert.rejects(main('candidate', { ...promoted, DRY_RUN_ATTEMPT: 'unknown' }, io(null, { readTree: () => tree })), /DRY_RUN_ATTEMPT is unknown/u);
    });
    await assert.rejects(main('unknown', environment, io(null)), /Expected main-ci, dry-run, fetch-candidate, or candidate/u);
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

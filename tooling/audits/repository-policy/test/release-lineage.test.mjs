import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  findMainCiProof,
  main,
  planFullGroups,
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

// A scripted read-only GitHub client: the first route whose key prefixes the path answers.
function scriptedGithub(routes) {
  const calls = [];
  const github = async (path) => {
    calls.push(path);
    const key = Object.keys(routes).find((candidate) => path.startsWith(candidate));
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

async function mainCi({ runs = [ciRun(101)], jobs = greenJobs, planGroups = () => groups, ...routes } = {}) {
  const { github, calls } = scriptedGithub({
    [`${base}/workflows/ci.yml/runs`]: { workflow_runs: runs },
    [`${base}/runs/`]: { jobs },
    ...routes,
  });
  return { result: await findMainCiProof({ repository, sha, github, planGroups }), calls };
}

test('the dry run reuses the newest green full push run of main for the exact commit', async () => {
  const { result, calls } = await mainCi({ runs: [ciRun(100, { conclusion: 'success' }), ciRun(101, { run_attempt: 2 })] });
  assert.deepEqual(result, { reused: true, runId: 101, attempt: 2, url: `https://github.com/${repository}/actions/runs/101`, groups });
  assert.match(calls[0], new RegExp(`head_sha=${sha}&event=push&branch=main`, 'u'));
  assert.match(calls[1], /\/runs\/101\/jobs\?filter=latest/u);
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
  // Unreadable: the API fails, or the plan cannot be computed.
  await fallback({ [`${base}/workflows/ci.yml/runs`]: new Error('HTTP 403') }, /unreadable \(HTTP 403\)/u);
  await fallback({ [`${base}/runs/`]: new Error('HTTP 500') }, /unreadable \(HTTP 500\)/u);
  await fallback({ planGroups: () => { throw new Error('planner exited 1'); } }, /unreadable \(planner exited 1\)/u);
});

test('main CI jobs are read across pages', async () => {
  const filler = Array.from({ length: 100 }, (_, index) => job(`filler ${index}`));
  const pages = { 1: filler, 2: greenJobs };
  const { result, calls } = await mainCi({ [`${base}/runs/`]: (path) => ({ jobs: pages[/&page=(\d+)/u.exec(path)[1]] }) });
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
const candidateArtifact = (overrides = {}) => ({ id: 9, name: 'npm-candidate', size_in_bytes: 4096, expired: false, workflow_run: { id: 555, head_sha: sha }, ...overrides });

async function verify({ id = '555', current = '777', run = dryRun(), jobs = dryRunJobs, artifacts = [candidateArtifact()] } = {}) {
  const { github } = scriptedGithub({
    [`${base}/runs/555/jobs`]: { jobs },
    [`${base}/runs/555/artifacts`]: { artifacts },
    [`${base}/runs/555`]: run,
  });
  return verifyDryRun({ repository, sha, dryRunId: id, currentRunId: current, github });
}

test('a publish run accepts a successful dry run of this workflow on main at this commit', async () => {
  const { run, artifact } = await verify();
  assert.equal(run.id, 555);
  assert.equal(artifact.id, 9);
  // A dry run whose publish job is absent from the job list never published.
  await verify({ jobs: dryRunJobs.slice(0, 1) });
});

test('a publish run fails closed on any other run, a doomed dry run, or a lost artifact', async () => {
  const rejects = (options, message) => assert.rejects(verify(options), message);
  await rejects({ id: '' }, /needs the dry-run-id input/u);
  await rejects({ id: '55x' }, /needs the dry-run-id input/u);
  await rejects({ id: '555', current: '555' }, /names this publish run/u);
  await rejects({ run: dryRun({ head_sha: 'c'.repeat(40) }) }, /ran at c+, not a+/u);
  await rejects({ run: dryRun({ event: 'push' }) }, /ran on push, not workflow_dispatch/u);
  await rejects({ run: dryRun({ event: 'pull_request', head_branch: 'feature' }) }, /ran on pull_request, not workflow_dispatch; ran on feature, not main/u);
  await rejects({ run: dryRun({ head_branch: 'feature' }) }, /ran on feature, not main/u);
  await rejects({ run: dryRun({ path: '.github/workflows/ci.yml' }) }, /is \.github\/workflows\/ci\.yml, not \.github\/workflows\/npm-publish\.yml/u);
  await rejects({ run: dryRun({ head_repository: { full_name: 'someone/muxui' } }) }, /is not a run of ndrewtran\/muxui/u);
  await rejects({ run: dryRun({ conclusion: 'failure' }) }, /completed and failure, not a successful run/u);
  await rejects({ run: dryRun({ status: 'in_progress', conclusion: null }) }, /is in_progress, not a successful run/u);
  await rejects({ run: dryRun({ id: 556 }) }, /is run 556/u);
  // A publish-mode run is not a dry run, a failed prepare is not a candidate, an upload may not have happened.
  await rejects({ jobs: [dryRunJobs[0], job('publish', 'success')] }, /not a dry run: its publish job ran/u);
  await rejects({ jobs: [job('prepare', 'failure', { steps: [] }), job('publish', 'skipped')] }, /prepare job did not succeed/u);
  await rejects({ jobs: [job('prepare', 'success', { steps: [] }), job('publish', 'skipped')] }, /did not upload a candidate/u);
  // Missing, duplicated, expired, or misattributed artifacts: a new dry run, never a substitute.
  await rejects({ artifacts: [] }, /has 0 npm-candidate artifacts; expected one/u);
  await rejects({ artifacts: [candidateArtifact(), candidateArtifact({ id: 10 })] }, /has 2 npm-candidate artifacts/u);
  await rejects({ artifacts: [candidateArtifact({ name: 'other' })] }, /has 0 npm-candidate artifacts/u);
  await rejects({ artifacts: [candidateArtifact({ expired: true })] }, /has expired/u);
  await rejects({ artifacts: [candidateArtifact({ workflow_run: { id: 999, head_sha: sha } })] }, /does not belong to run 555/u);
  await rejects({ artifacts: [candidateArtifact({ workflow_run: { id: 555, head_sha: 'c'.repeat(40) } })] }, /does not belong to run 555/u);
});

// The downloaded candidate: one tarball and one manifest, verified byte for byte.
const version = '0.1.0-rc.3';
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

    const green = scriptedGithub({ [`${base}/workflows/ci.yml/runs`]: { workflow_runs: [ciRun(101, { run_attempt: 2 })] }, [`${base}/runs/`]: { jobs: greenJobs } });
    await main('main-ci', environment, io(green.github));
    assert.deepEqual(take(), [`Main CI proof: reusing run 101 attempt 2 (https://github.com/${repository}/actions/runs/101); running generate:check and release-prepare.mjs instead of the full check graph`]);
    assert.equal(read('output'), 'mode=reuse\nrun-id=101\nattempt=2\n');
    assert.match(read('summary'), /### Main CI proof\n\n- reused: \[run 101\]/u);

    writeFileSync(environment.GITHUB_OUTPUT, '');
    const red = scriptedGithub({ [`${base}/workflows/ci.yml/runs`]: { workflow_runs: [ciRun(101, { conclusion: 'failure' })] } });
    await main('main-ci', environment, io(red.github));
    assert.deepEqual(take(), [
      'Main CI proof: not reused (main CI run 101 concluded failure); running the full release:prepare',
      '::warning title=Main CI proof not reused::main CI run 101 concluded failure; running the full release:prepare.',
    ]);
    assert.equal(read('output'), 'mode=full\nrun-id=\nattempt=\n');
    // An environment the workflow never produces still falls back instead of failing the run.
    await main('main-ci', { ...environment, GITHUB_SHA: 'HEAD' }, io(red.github));
    assert.match(take()[0], /^Main CI proof: not reused \(GITHUB_SHA is HEAD\.\); running the full release:prepare$/u);

    const dry = scriptedGithub({ [`${base}/runs/555/jobs`]: { jobs: dryRunJobs }, [`${base}/runs/555/artifacts`]: { artifacts: [candidateArtifact()] }, [`${base}/runs/555`]: dryRun() });
    writeFileSync(environment.GITHUB_OUTPUT, '');
    await main('dry-run', { ...environment, DRY_RUN_ID: '555', GITHUB_RUN_ID: '777' }, io(dry.github));
    assert.deepEqual(take(), [`Dry run 555 attempt 1 succeeded at ${sha}; npm-candidate artifact 9 (4096 bytes)`]);
    assert.equal(read('output'), 'attempt=1\n');
    await assert.rejects(main('dry-run', { ...environment, DRY_RUN_ID: '' }, io(dry.github)), /needs the dry-run-id input/u);

    await withCandidate({}, async ({ directory, integrity }) => {
      const promoted = { ...environment, DRY_RUN_ID: '555', DRY_RUN_ATTEMPT: '1', CANDIDATE_DIR: directory, VERSION: version, EXPECTED_SHA512: integrity };
      await main('candidate', promoted, io(null, { readTree: () => tree }));
      assert.deepEqual(take(), [
        `Promoted candidate ${version} ${integrity} from dry run 555 attempt 1`,
        'Dry run preparation: reused main CI run 101 attempt 1',
      ]);
      assert.match(read('summary'), /### Promoted candidate\n\n- version: `0\.1\.0-rc\.3`/u);
      await assert.rejects(main('candidate', { ...promoted, EXPECTED_SHA512: 'sha512-other' }, io(null, { readTree: () => tree })), /Promoted tarball is/u);
    });
    await assert.rejects(main('unknown', environment, io(null)), /Expected main-ci, dry-run, or candidate/u);
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
  for (const title of ['Verify dry run', 'Download dry-run candidate', 'Verify promoted candidate']) {
    assert.match(step(title), /if: inputs\.mode == 'publish'/u, title);
  }
  // The download names the dry run and authenticates with a token that can read Actions.
  assert.match(step('Download dry-run candidate'), /name: npm-candidate\n\s+run-id: \$\{\{ inputs\.dry-run-id \}\}\n\s+github-token: \$\{\{ github\.token \}\}/u);
  assert.match(prepare, /permissions:\n      contents: read\n      actions: read\n/u);
  assert.match(workflow, /retention-days: 30/u);
  // The job that holds the OIDC identity never reads Actions and never builds.
  assert.match(publish, /id-token: write/u);
  assert.doesNotMatch(publish, /actions: read|release:prepare|release-prepare|release-lineage/u);
});

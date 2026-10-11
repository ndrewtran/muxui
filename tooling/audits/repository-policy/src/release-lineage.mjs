// Release lineage checks for .github/workflows/npm-publish.yml: the earlier runs a
// release run relies on instead of repeating their work (Decision 0030). Every
// GitHub call is a read; nothing here writes to GitHub or the registry.
//
//   node release-lineage.mjs main-ci    dry run: reuse main's green full CI run for this commit, or fall back
//   node release-lineage.mjs dry-run    publish: verify the dry run whose candidate is promoted
//   node release-lineage.mjs candidate  publish: verify the downloaded candidate's bytes and manifest
//
// Inputs come from the environment (the GitHub-provided GITHUB_* variables plus the
// workflow's own). `main-ci` never fails the run: any doubt becomes the full
// `pnpm release:prepare`. `dry-run` and `candidate` fail closed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CI_WORKFLOW = '.github/workflows/ci.yml';
export const PUBLISH_WORKFLOW = '.github/workflows/npm-publish.yml';
export const CANDIDATE_ARTIFACT = 'npm-candidate';
const manifestSchema = 'muxui-r1-exit-publication-preparation-v1';
const ciImpact = resolve(import.meta.dirname, 'ci-impact.mjs');

export class ReleaseLineageError extends Error {
  constructor(title, message) {
    super(message);
    this.title = title;
  }
}

const stop = (title, message) => {
  throw new ReleaseLineageError(title, message);
};

// A run's `path` is the workflow file, sometimes with an `@ref` suffix.
const workflowOf = (run) => String(run?.path ?? '').split('@')[0];
const isOwnRun = (run, repository) => run?.repository?.full_name === repository && run?.head_repository?.full_name === repository;

/** A read-only GitHub REST client: `github('/repos/...')` resolves the parsed JSON body. */
export function githubClient({ token, apiUrl = 'https://api.github.com', fetch = globalThis.fetch }) {
  return async (path) => {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GET ${path} returned HTTP ${response.status}`);
    return response.json();
  };
}

// The jobs of a run's latest attempt, across pages.
async function readJobs(github, repository, runId) {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const body = await github(`/repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100&page=${page}`);
    jobs.push(...body.jobs);
    if (body.jobs.length < 100) return jobs;
  }
}

/** The group ids of the full CI plan at this checkout, from the same planner main's CI runs. */
export function planFullGroups({ run = execFileSync, environment = process.env } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'muxui-release-plan-'));
  try {
    const output = join(directory, 'output');
    writeFileSync(output, '');
    run(process.execPath, [ciImpact, '--plan', '--full', '--github-output'], {
      env: { ...environment, GITHUB_OUTPUT: output }, stdio: ['ignore', 'ignore', 'inherit'],
    });
    const groups = /^groups=(.*)$/mu.exec(readFileSync(output, 'utf8'))?.[1];
    return JSON.parse(groups ?? '[]').map(({ id }) => id);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Why a main CI run cannot stand in for the check graph, or null when it can. Reads jobs only for a passed run. */
export async function judgeMainCiRun({ run, readJobs: jobsOf, expectedGroups }) {
  if (run.status !== 'completed') return `main CI run ${run.id} is ${run.status}`;
  if (run.conclusion !== 'success') return `main CI run ${run.id} concluded ${run.conclusion}`;
  const passed = new Set((await jobsOf()).filter((job) => job.status === 'completed' && job.conclusion === 'success').map((job) => job.name));
  // A push run plans the full graph; the plan is checked here rather than trusted from the event.
  const missing = ['plan', 'check', ...expectedGroups.map((id) => `run ${id}`)].filter((name) => !passed.has(name));
  return missing.length > 0 ? `main CI run ${run.id} has no successful ${missing.join(', ')}` : null;
}

/**
 * Finds the green full CI run on main for this exact commit. Returns
 * { reused: true, runId, attempt, url, groups }, or { reused: false, reason } when the
 * dry run must run the full release:prepare: no run, a failed, running, or incomplete
 * run, or anything unreadable. Only the newest run is considered, so a newer failure
 * is never skipped for an older pass.
 */
export async function findMainCiProof({ repository, sha, github, planGroups = planFullGroups }) {
  const fallback = (reason) => ({ reused: false, reason });
  try {
    const expectedGroups = planGroups();
    if (expectedGroups.length === 0) return fallback('the full CI plan lists no groups');
    const { workflow_runs: runs } = await github(`/repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&branch=main&per_page=30`);
    const [run] = runs
      .filter((candidate) => workflowOf(candidate) === CI_WORKFLOW && candidate.event === 'push' && candidate.head_branch === 'main'
        && candidate.head_sha === sha && isOwnRun(candidate, repository))
      .sort((left, right) => right.id - left.id);
    if (!run) return fallback(`no ci.yml push run on main for ${sha}`);
    const reason = await judgeMainCiRun({ run, readJobs: () => readJobs(github, repository, run.id), expectedGroups });
    return reason ? fallback(reason) : { reused: true, runId: run.id, attempt: run.run_attempt, url: run.html_url, groups: expectedGroups };
  } catch (error) {
    return fallback(`the CI proof is unreadable (${error.message})`);
  }
}

/**
 * Verifies the dry run whose candidate a publish run promotes: a successful dispatch
 * of npm-publish.yml in this repository on main at this commit, whose prepare job
 * succeeded and whose publish job never ran, with one unexpired npm-candidate
 * artifact. Returns { run, artifact }.
 */
export async function verifyDryRun({ repository, sha, dryRunId, currentRunId, github }) {
  if (!/^[1-9]\d*$/u.test(dryRunId ?? '')) stop('Dry run required', 'mode=publish needs the dry-run-id input: the id of a successful dry run at this commit.');
  if (String(currentRunId) === dryRunId) stop('Dry run invalid', 'The dry-run-id input names this publish run.');
  const run = await github(`/repos/${repository}/actions/runs/${dryRunId}`);
  const problems = [];
  if (String(run.id) !== dryRunId) problems.push(`is run ${run.id}`);
  if (workflowOf(run) !== PUBLISH_WORKFLOW) problems.push(`is ${workflowOf(run) || 'no workflow'}, not ${PUBLISH_WORKFLOW}`);
  if (run.event !== 'workflow_dispatch') problems.push(`ran on ${run.event}, not workflow_dispatch`);
  if (run.head_branch !== 'main') problems.push(`ran on ${run.head_branch}, not main`);
  if (run.head_sha !== sha) problems.push(`ran at ${run.head_sha}, not ${sha}`);
  if (!isOwnRun(run, repository)) problems.push(`is not a run of ${repository}`);
  if (run.status !== 'completed' || run.conclusion !== 'success') problems.push(`is ${run.status}${run.conclusion ? ` and ${run.conclusion}` : ''}, not a successful run`);
  if (problems.length > 0) stop('Dry run invalid', `Run ${dryRunId} ${problems.join('; ')}.`);

  const jobs = await readJobs(github, repository, dryRunId);
  const prepare = jobs.find((job) => job.name === 'prepare');
  const publish = jobs.find((job) => job.name === 'publish');
  if (prepare?.conclusion !== 'success') problems.push('its prepare job did not succeed');
  if (publish && publish.conclusion !== 'skipped') problems.push('it is not a dry run: its publish job ran');
  const uploaded = prepare?.steps?.find((step) => step.name === 'Upload candidate');
  if (uploaded?.conclusion !== 'success') problems.push('it did not upload a candidate');
  if (problems.length > 0) stop('Dry run invalid', `Run ${dryRunId} ${problems.join('; ')}.`);

  const { artifacts } = await github(`/repos/${repository}/actions/runs/${dryRunId}/artifacts?name=${CANDIDATE_ARTIFACT}&per_page=100`);
  const found = artifacts.filter((artifact) => artifact.name === CANDIDATE_ARTIFACT);
  if (found.length !== 1) stop('Candidate artifact missing', `Run ${dryRunId} has ${found.length} ${CANDIDATE_ARTIFACT} artifacts; expected one. Run a new dry run.`);
  const [artifact] = found;
  if (artifact.expired) stop('Candidate artifact expired', `The ${CANDIDATE_ARTIFACT} artifact of run ${dryRunId} has expired. Run a new dry run.`);
  if (artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_sha !== sha) {
    stop('Candidate artifact invalid', `The ${CANDIDATE_ARTIFACT} artifact does not belong to run ${dryRunId} at ${sha}.`);
  }
  return { run, artifact };
}

function tarballVersion(tarball) {
  return JSON.parse(execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' })).version;
}

/**
 * Verifies the downloaded artifact's bytes without trusting the download action: exactly
 * one tarball and one release manifest; the tarball's version and sha512 are the inputs;
 * the manifest names the same version and digest, this commit as its source revision,
 * and this commit's tree. Returns the paths and facts the workflow reports.
 */
export function verifyCandidate({ directory, version, expectedSha512, sha, tree, readVersion = tarballVersion }) {
  if (!expectedSha512) stop('Digest required', 'mode=publish needs the tarball-sha512 input.');
  const files = readdirSync(directory).sort();
  const tarballs = files.filter((name) => name.endsWith('.tgz'));
  const manifests = files.filter((name) => name.endsWith('.release-manifest.json'));
  if (files.length !== 2 || tarballs.length !== 1 || manifests.length !== 1) {
    stop('Candidate ambiguous', `Expected exactly one tarball and one release manifest in the artifact; found ${JSON.stringify(files)}.`);
  }
  const tarball = join(directory, tarballs[0]);
  const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
  if (integrity !== expectedSha512) stop('Integrity mismatch', `Promoted tarball is ${integrity}; the tarball-sha512 input is ${expectedSha512}.`);
  const manifest = JSON.parse(readFileSync(join(directory, manifests[0]), 'utf8'));
  const packed = readVersion(tarball);
  const mismatches = [
    [manifest.schema === manifestSchema, `the manifest schema is ${manifest.schema}`],
    [packed === version, `the tarball is ${packed}, not the version input ${version}`],
    [manifest.package?.version === version, `the manifest is for ${manifest.package?.version}, not ${version}`],
    [manifest.artifact?.integrity === integrity, `the manifest digest is ${manifest.artifact?.integrity}, not ${integrity}`],
    [manifest.source?.revision === sha, `the manifest source revision is ${manifest.source?.revision}, not ${sha}`],
    [manifest.correlation?.source?.tree === tree, `the manifest source tree is ${manifest.correlation?.source?.tree}, not ${tree}`],
  ].filter(([ok]) => !ok).map(([, text]) => text);
  if (mismatches.length > 0) stop('Candidate mismatch', `${mismatches.join('; ')}.`);
  return { version, integrity, preparation: manifest.preparation ?? null };
}

const describePreparation = (preparation) => {
  if (preparation?.mode === 'main-ci-reused') return `reused main CI run ${preparation.mainCi?.runId} attempt ${preparation.mainCi?.runAttempt}`;
  return 'full release:prepare';
};

function writeOutputs(environment, values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('');
  if (environment.GITHUB_OUTPUT) appendFileSync(environment.GITHUB_OUTPUT, lines);
}

function writeSummary(environment, markdown) {
  if (environment.GITHUB_STEP_SUMMARY) appendFileSync(environment.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function requireEnvironment(environment, names) {
  for (const name of names) if (!environment[name]) stop('Environment missing', `${name} is not set.`);
  if (!/^[0-9a-f]{40}$/u.test(environment.GITHUB_SHA)) stop('Environment invalid', `GITHUB_SHA is ${environment.GITHUB_SHA}.`);
  if (!/^[\w.-]+\/[\w.-]+$/u.test(environment.GITHUB_REPOSITORY)) stop('Environment invalid', `GITHUB_REPOSITORY is ${environment.GITHUB_REPOSITORY}.`);
}

export async function main(command, environment = process.env, io = {}) {
  const log = io.log ?? console.log;
  const github = io.github ?? githubClient({ token: environment.GH_TOKEN, apiUrl: environment.GITHUB_API_URL });
  switch (command) {
    case 'main-ci': {
      const { GITHUB_REPOSITORY: repository, GITHUB_SHA: sha } = environment;
      let proof;
      try {
        requireEnvironment(environment, ['GITHUB_REPOSITORY', 'GITHUB_SHA']);
        proof = await findMainCiProof({ repository, sha, github, planGroups: io.planGroups });
      } catch (error) {
        proof = { reused: false, reason: error.message };
      }
      if (proof.reused) {
        log(`Main CI proof: reusing run ${proof.runId} attempt ${proof.attempt} (${proof.url}); running generate:check and release-prepare.mjs instead of the full check graph`);
        writeOutputs(environment, { mode: 'reuse', 'run-id': proof.runId, attempt: proof.attempt });
        writeSummary(environment, [
          '### Main CI proof',
          '',
          `- reused: [run ${proof.runId}](${proof.url}) attempt ${proof.attempt}, a green full plan of ${proof.groups.length} groups at \`${sha}\``,
          '- this dry run ran generation, `generate:check`, and `release-prepare.mjs`, not the check graph',
        ].join('\n'));
      } else {
        log(`Main CI proof: not reused (${proof.reason}); running the full release:prepare`);
        log(`::warning title=Main CI proof not reused::${proof.reason}; running the full release:prepare.`);
        writeOutputs(environment, { mode: 'full', 'run-id': '', attempt: '' });
        writeSummary(environment, ['### Main CI proof', '', `- not reused: ${proof.reason}`, '- this dry run ran the full `pnpm release:prepare`'].join('\n'));
      }
      return;
    }
    case 'dry-run': {
      requireEnvironment(environment, ['GITHUB_REPOSITORY', 'GITHUB_SHA']);
      const { run, artifact } = await verifyDryRun({
        repository: environment.GITHUB_REPOSITORY,
        sha: environment.GITHUB_SHA,
        dryRunId: environment.DRY_RUN_ID,
        currentRunId: environment.GITHUB_RUN_ID,
        github,
      });
      log(`Dry run ${run.id} attempt ${run.run_attempt} succeeded at ${run.head_sha}; ${CANDIDATE_ARTIFACT} artifact ${artifact.id} (${artifact.size_in_bytes} bytes)`);
      writeOutputs(environment, { attempt: run.run_attempt });
      return;
    }
    case 'candidate': {
      requireEnvironment(environment, ['GITHUB_REPOSITORY', 'GITHUB_SHA', 'CANDIDATE_DIR', 'VERSION', 'DRY_RUN_ID']);
      const { GITHUB_SHA: sha } = environment;
      const tree = (io.readTree ?? ((revision) => execFileSync('git', ['rev-parse', `${revision}^{tree}`], { encoding: 'utf8' }).trim()))(sha);
      const candidate = verifyCandidate({
        directory: environment.CANDIDATE_DIR, version: environment.VERSION, expectedSha512: environment.EXPECTED_SHA512, sha, tree,
      });
      log(`Promoted candidate ${candidate.version} ${candidate.integrity} from dry run ${environment.DRY_RUN_ID} attempt ${environment.DRY_RUN_ATTEMPT || 'unknown'}`);
      log(`Dry run preparation: ${describePreparation(candidate.preparation)}`);
      writeSummary(environment, [
        '### Promoted candidate',
        '',
        `- version: \`${candidate.version}\``,
        `- tarball-sha512: \`${candidate.integrity}\``,
        `- built by dry run ${environment.DRY_RUN_ID} attempt ${environment.DRY_RUN_ATTEMPT || 'unknown'} at \`${sha}\`; this run did not rebuild it`,
        `- dry run preparation: ${describePreparation(candidate.preparation)}`,
      ].join('\n'));
      return;
    }
    default:
      stop('Unknown command', `Expected main-ci, dry-run, or candidate; got ${JSON.stringify(command)}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main(process.argv[2]);
  } catch (error) {
    const title = error instanceof ReleaseLineageError ? error.title : 'Release lineage check failed';
    console.log(`::error title=${title}::${error.message}`);
    process.exitCode = 1;
  }
}

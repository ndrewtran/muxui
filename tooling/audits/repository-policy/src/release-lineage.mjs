// Release lineage checks for .github/workflows/npm-publish.yml: the earlier runs a
// release run relies on instead of repeating their work (Decision 0030). Every
// GitHub call is a read; nothing here writes to GitHub or the registry.
//
//   node release-lineage.mjs main-ci          dry run: reuse main's green full CI run for this commit, or fall back
//   node release-lineage.mjs dry-run          publish: verify the dry run whose candidate is promoted
//   node release-lineage.mjs fetch-candidate  publish: download the verified artifact by id, inspect it, and extract it
//   node release-lineage.mjs candidate        publish: verify the extracted candidate's bytes and manifest
//
// Each judgement reads one attempt of a run (`attempts/<n>`), and the attempt and
// artifact id the dry-run step verified are bound into the fetch step.

// Inputs come from the environment (the GitHub-provided GITHUB_* variables plus the
// workflow's own). `main-ci` never fails the run: any doubt becomes the full
// `pnpm release:prepare`. `dry-run` and `candidate` fail closed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32, inflateRawSync } from 'node:zlib';
import { parseCandidateVersion } from './npm-publication.mjs';

export const CI_WORKFLOW = '.github/workflows/ci.yml';
export const PUBLISH_WORKFLOW = '.github/workflows/npm-publish.yml';
export const CANDIDATE_ARTIFACT = 'npm-candidate';
const manifestSchema = 'muxui-r1-exit-publication-preparation-v1';
const ciImpact = resolve(import.meta.dirname, 'ci-impact.mjs');
// The candidate is a tarball and a manifest of a few megabytes.
const maxArchiveBytes = 256 * 1024 * 1024;

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
const isMainPush = (run, repository, sha) => workflowOf(run) === CI_WORKFLOW && run.event === 'push' && run.head_branch === 'main'
  && run.head_sha === sha && isOwnRun(run, repository);

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

// The jobs of one attempt of a run, across pages. Jobs carried over from an earlier
// attempt appear in a later attempt's list.
async function readJobs(github, repository, runId, attempt) {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const body = await github(`/repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`);
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
 * is never skipped for an older pass, and it is judged as its latest attempt, read as
 * that attempt (`attempts/<n>` and its jobs), so the attempt reported is the attempt judged.
 */
export async function findMainCiProof({ repository, sha, github, planGroups = planFullGroups }) {
  const fallback = (reason) => ({ reused: false, reason });
  try {
    const expectedGroups = planGroups();
    if (expectedGroups.length === 0) return fallback('the full CI plan lists no groups');
    const { workflow_runs: runs } = await github(`/repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&branch=main&per_page=30`);
    const [listed] = runs.filter((candidate) => isMainPush(candidate, repository, sha)).sort((left, right) => right.id - left.id);
    if (!listed) return fallback(`no ci.yml push run on main for ${sha}`);
    const attempt = listed.run_attempt;
    if (!Number.isInteger(attempt) || attempt < 1) return fallback(`main CI run ${listed.id} reports no attempt`);
    const run = await github(`/repos/${repository}/actions/runs/${listed.id}/attempts/${attempt}`);
    if (run.id !== listed.id || run.run_attempt !== attempt || !isMainPush(run, repository, sha)) {
      return fallback(`main CI run ${listed.id} attempt ${attempt} reads back as run ${run.id} attempt ${run.run_attempt}`);
    }
    const reason = await judgeMainCiRun({ run, readJobs: () => readJobs(github, repository, run.id, attempt), expectedGroups });
    return reason ? fallback(reason) : { reused: true, runId: run.id, attempt, url: run.html_url, groups: expectedGroups };
  } catch (error) {
    return fallback(`the CI proof is unreadable (${error.message})`);
  }
}

const candidateDigest = /^sha256:[0-9a-f]{64}$/u;

// The one unexpired npm-candidate artifact of a dry run at this commit, with its API digest.
async function findCandidateArtifact({ github, repository, run, sha }) {
  const { artifacts } = await github(`/repos/${repository}/actions/runs/${run.id}/artifacts?name=${CANDIDATE_ARTIFACT}&per_page=100`);
  const found = artifacts.filter((artifact) => artifact.name === CANDIDATE_ARTIFACT);
  if (found.length !== 1) stop('Candidate artifact missing', `Run ${run.id} has ${found.length} ${CANDIDATE_ARTIFACT} artifacts; expected one. Run a new dry run.`);
  const [artifact] = found;
  if (artifact.expired) stop('Candidate artifact expired', `The ${CANDIDATE_ARTIFACT} artifact of run ${run.id} has expired. Run a new dry run.`);
  if (artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_sha !== sha) {
    stop('Candidate artifact invalid', `The ${CANDIDATE_ARTIFACT} artifact does not belong to run ${run.id} at ${sha}.`);
  }
  if (!Number.isSafeInteger(artifact.id) || !candidateDigest.test(artifact.digest ?? '') || !Number.isSafeInteger(artifact.size_in_bytes)) {
    stop('Candidate artifact unverifiable', `The ${CANDIDATE_ARTIFACT} artifact of run ${run.id} has no usable id, size, and sha256 digest.`);
  }
  return artifact;
}

/**
 * Verifies the dry run whose candidate a publish run promotes: a successful dispatch
 * of npm-publish.yml in this repository on main at this commit, read as its latest
 * attempt, whose prepare job succeeded and whose publish job never ran, with one
 * unexpired npm-candidate artifact that has an id, size, and sha256 digest.
 * Returns { run, attempt, artifact }.
 */
export async function verifyDryRun({ repository, sha, dryRunId, currentRunId, github }) {
  if (!/^[1-9]\d*$/u.test(dryRunId ?? '')) stop('Dry run required', 'mode=publish needs the dry-run-id input: the id of a successful dry run at this commit.');
  if (String(currentRunId) === dryRunId) stop('Dry run invalid', 'The dry-run-id input names this publish run.');
  const latest = await github(`/repos/${repository}/actions/runs/${dryRunId}`);
  const attempt = latest.run_attempt;
  if (!Number.isInteger(attempt) || attempt < 1) stop('Dry run invalid', `Run ${dryRunId} reports no attempt.`);
  const run = await github(`/repos/${repository}/actions/runs/${dryRunId}/attempts/${attempt}`);
  const problems = [];
  if (String(run.id) !== dryRunId) problems.push(`is run ${run.id}`);
  if (run.run_attempt !== attempt) problems.push(`attempt ${attempt} reads back as attempt ${run.run_attempt}`);
  if (workflowOf(run) !== PUBLISH_WORKFLOW) problems.push(`is ${workflowOf(run) || 'no workflow'}, not ${PUBLISH_WORKFLOW}`);
  if (run.event !== 'workflow_dispatch') problems.push(`ran on ${run.event}, not workflow_dispatch`);
  if (run.head_branch !== 'main') problems.push(`ran on ${run.head_branch}, not main`);
  if (run.head_sha !== sha) problems.push(`ran at ${run.head_sha}, not ${sha}`);
  if (!isOwnRun(run, repository)) problems.push(`is not a run of ${repository}`);
  if (run.status !== 'completed' || run.conclusion !== 'success') problems.push(`is ${run.status}${run.conclusion ? ` and ${run.conclusion}` : ''}, not a successful run`);
  if (problems.length > 0) stop('Dry run invalid', `Run ${dryRunId} ${problems.join('; ')}.`);

  const jobs = await readJobs(github, repository, dryRunId, attempt);
  const prepare = jobs.find((job) => job.name === 'prepare');
  const publish = jobs.find((job) => job.name === 'publish');
  if (prepare?.conclusion !== 'success') problems.push('its prepare job did not succeed');
  if (publish && publish.conclusion !== 'skipped') problems.push('it is not a dry run: its publish job ran');
  const uploaded = prepare?.steps?.find((step) => step.name === 'Upload candidate');
  if (uploaded?.conclusion !== 'success') problems.push('it did not upload a candidate');
  if (problems.length > 0) stop('Dry run invalid', `Run ${dryRunId} attempt ${attempt} ${problems.join('; ')}.`);

  return { run, attempt, artifact: await findCandidateArtifact({ github, repository, run, sha }) };
}

// ZIP records, read from the central directory. Only what a candidate artifact needs is accepted.
const zipEndRecord = 0x06054b50;
const zipCentralHeader = 0x02014b50;
const zipLocalHeader = 0x04034b50;
const zipFileMode = 0o100000;
const zipModeMask = 0o170000;

function archiveStop(message) {
  stop('Candidate archive invalid', message);
}

/**
 * Reads the artifact ZIP without extracting it and returns the data of each expected entry
 * as { name, data }. Fails unless the central directory lists exactly `names`: each a plain
 * file name (no directory, `..`, absolute path, or backslash), once, a regular file (no
 * symlink, directory, or device), unencrypted, stored or deflated, with a local header that
 * names the same file and sizes and a CRC-32 that the data matches. Nothing is written.
 */
export function readCandidateZip(zip, names) {
  let end = -1;
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at -= 1) {
    if (zip.readUInt32LE(at) === zipEndRecord && at + 22 + zip.readUInt16LE(at + 20) === zip.length) {
      end = at;
      break;
    }
  }
  if (end < 0) archiveStop('the archive has no end-of-central-directory record');
  const count = zip.readUInt16LE(end + 10);
  const directorySize = zip.readUInt32LE(end + 12);
  const directoryOffset = zip.readUInt32LE(end + 16);
  if (zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0 || zip.readUInt16LE(end + 8) !== count) archiveStop('the archive spans disks');
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) archiveStop('the archive uses ZIP64');
  if (directoryOffset + directorySize !== end) archiveStop('the central directory does not end at the end record');

  const entries = [];
  let at = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > end || zip.readUInt32LE(at) !== zipCentralHeader) archiveStop('the central directory is malformed');
    const entry = {
      madeBy: zip.readUInt16LE(at + 4),
      flags: zip.readUInt16LE(at + 8),
      method: zip.readUInt16LE(at + 10),
      crc: zip.readUInt32LE(at + 16),
      compressed: zip.readUInt32LE(at + 20),
      size: zip.readUInt32LE(at + 24),
      disk: zip.readUInt16LE(at + 34),
      attributes: zip.readUInt32LE(at + 38),
      offset: zip.readUInt32LE(at + 42),
    };
    const nameLength = zip.readUInt16LE(at + 28);
    const next = at + 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    if (next > end) archiveStop('the central directory is malformed');
    entry.name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    entries.push(entry);
    at = next;
  }
  if (at !== end) archiveStop('the central directory has trailing bytes');

  const listed = entries.map(({ name }) => name);
  if (listed.length !== names.length || new Set(listed).size !== listed.length || names.some((name) => !listed.includes(name))) {
    archiveStop(`the archive lists ${JSON.stringify(listed)}; expected exactly ${JSON.stringify(names)}`);
  }
  return entries.map((entry) => {
    const { name } = entry;
    // Unix creators (host 3) keep the file mode in the upper half of the external attributes.
    const mode = entry.madeBy >> 8 === 3 ? entry.attributes >>> 16 : 0;
    if (mode !== 0 && (mode & zipModeMask) !== zipFileMode) archiveStop(`${name} is not a regular file`);
    if (entry.madeBy >> 8 !== 3 && (entry.attributes & 0x10) !== 0) archiveStop(`${name} is a directory`);
    if ((entry.flags & 0x41) !== 0) archiveStop(`${name} is encrypted`);
    if (entry.method !== 0 && entry.method !== 8) archiveStop(`${name} uses compression method ${entry.method}`);
    if (entry.disk !== 0 || entry.size > maxArchiveBytes || entry.compressed === 0xffffffff || entry.size === 0xffffffff) archiveStop(`${name} has unsupported sizes`);
    const local = entry.offset;
    if (local + 30 > directoryOffset || zip.readUInt32LE(local) !== zipLocalHeader) archiveStop(`${name} has no local header`);
    const localLength = zip.readUInt16LE(local + 26);
    const start = local + 30 + localLength + zip.readUInt16LE(local + 28);
    if (zip.subarray(local + 30, local + 30 + localLength).toString('utf8') !== name) archiveStop(`${name} has a local header for another file`);
    if (start + entry.compressed > directoryOffset) archiveStop(`${name} data runs past the central directory`);
    const stored = zip.subarray(start, start + entry.compressed);
    let data;
    try {
      data = entry.method === 0 ? stored : inflateRawSync(stored, { maxOutputLength: Math.max(entry.size, 1) });
    } catch (error) {
      archiveStop(`${name} does not inflate to its declared size (${error.message})`);
    }
    if (data.length !== entry.size) archiveStop(`${name} is ${data.length} bytes, not the declared ${entry.size}`);
    if (crc32(data) !== entry.crc) archiveStop(`${name} does not match its CRC-32`);
    return { name, data };
  });
}

/** Downloads an artifact's ZIP by id. fetch drops the token when GitHub redirects to blob storage. */
export async function downloadArtifactZip({ repository, artifactId, token, apiUrl = 'https://api.github.com', fetch = globalThis.fetch }) {
  const response = await fetch(`${apiUrl}/repos/${repository}/actions/artifacts/${artifactId}/zip`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`GET artifact ${artifactId} zip returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Downloads the dry run's candidate by the artifact id the verify step bound (`expected`:
 * attempt, artifact id, digest, size) and extracts it into a fresh directory outside the
 * checkout. The dry run is verified again first, so a rerun, a replaced artifact, or a
 * second artifact fails. The archive's size and sha256 are checked against the API digest
 * before it is parsed, and this code, not a general extractor, writes only the two expected names.
 */
export async function fetchCandidate({ repository, sha, dryRunId, currentRunId, expected, version, directory, workspace, github, download }) {
  parseCandidateVersion(version);
  const verified = await verifyDryRun({ repository, sha, dryRunId, currentRunId, github });
  const { artifact } = verified;
  const changed = [
    [String(verified.attempt) === expected.attempt, `the dry run is at attempt ${verified.attempt}, not the verified ${expected.attempt}`],
    [String(artifact.id) === expected.artifactId, `the artifact is ${artifact.id}, not the verified ${expected.artifactId}`],
    [artifact.digest === expected.digest, `the artifact digest is ${artifact.digest}, not the verified ${expected.digest}`],
    [String(artifact.size_in_bytes) === expected.size, `the artifact is ${artifact.size_in_bytes} bytes, not the verified ${expected.size}`],
  ].filter(([ok]) => !ok).map(([, text]) => text);
  if (changed.length > 0) stop('Candidate artifact changed', `${changed.join('; ')}.`);
  if (artifact.size_in_bytes > maxArchiveBytes) stop('Candidate artifact invalid', `The artifact is ${artifact.size_in_bytes} bytes.`);

  const target = resolve(directory);
  if (workspace && (target === resolve(workspace) || target.startsWith(`${resolve(workspace)}${sep}`))) {
    stop('Candidate directory invalid', `${target} is inside the checkout.`);
  }
  if (existsSync(target)) stop('Candidate directory invalid', `${target} already exists; the candidate is extracted into a fresh directory.`);

  const zip = await download(artifact.id);
  const digest = `sha256:${createHash('sha256').update(zip).digest('hex')}`;
  if (zip.length !== artifact.size_in_bytes || digest !== artifact.digest) {
    stop('Candidate archive mismatch', `The downloaded archive is ${zip.length} bytes with ${digest}; artifact ${artifact.id} is ${artifact.size_in_bytes} bytes with ${artifact.digest}.`);
  }
  const files = readCandidateZip(zip, [`muxui-react-${version}.tgz`, `muxui-react-${version}.release-manifest.json`]);
  mkdirSync(target);
  for (const { name, data } of files) writeFileSync(join(target, name), data, { flag: 'wx', mode: 0o644 });
  return { artifact, attempt: verified.attempt, run: verified.run, bytes: zip.length, digest };
}

function tarballVersion(tarball) {
  return JSON.parse(execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' })).version;
}

/**
 * Verifies the extracted artifact's bytes: exactly
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
      const { run, attempt, artifact } = await verifyDryRun({
        repository: environment.GITHUB_REPOSITORY,
        sha: environment.GITHUB_SHA,
        dryRunId: environment.DRY_RUN_ID,
        currentRunId: environment.GITHUB_RUN_ID,
        github,
      });
      log(`Dry run ${run.id} attempt ${attempt} succeeded at ${run.head_sha}; ${CANDIDATE_ARTIFACT} artifact ${artifact.id} (${artifact.size_in_bytes} bytes, ${artifact.digest})`);
      // The fetch step binds exactly this attempt and artifact.
      writeOutputs(environment, { attempt, 'artifact-id': artifact.id, 'artifact-digest': artifact.digest, 'artifact-size': artifact.size_in_bytes });
      return;
    }
    case 'fetch-candidate': {
      requireEnvironment(environment, ['GITHUB_REPOSITORY', 'GITHUB_SHA', 'CANDIDATE_DIR', 'VERSION', 'DRY_RUN_ID', 'DRY_RUN_ATTEMPT', 'ARTIFACT_ID', 'ARTIFACT_DIGEST', 'ARTIFACT_SIZE']);
      const { GITHUB_REPOSITORY: repository } = environment;
      const fetched = await fetchCandidate({
        repository,
        sha: environment.GITHUB_SHA,
        dryRunId: environment.DRY_RUN_ID,
        currentRunId: environment.GITHUB_RUN_ID,
        expected: { attempt: environment.DRY_RUN_ATTEMPT, artifactId: environment.ARTIFACT_ID, digest: environment.ARTIFACT_DIGEST, size: environment.ARTIFACT_SIZE },
        version: environment.VERSION,
        directory: environment.CANDIDATE_DIR,
        workspace: environment.GITHUB_WORKSPACE,
        github,
        download: io.download ?? ((artifactId) => downloadArtifactZip({ repository, artifactId, token: environment.GH_TOKEN, apiUrl: environment.GITHUB_API_URL })),
      });
      log(`Fetched ${CANDIDATE_ARTIFACT} artifact ${fetched.artifact.id} (${fetched.bytes} bytes, ${fetched.digest}) from dry run ${fetched.run.id} attempt ${fetched.attempt}`);
      return;
    }
    case 'candidate': {
      requireEnvironment(environment, ['GITHUB_REPOSITORY', 'GITHUB_SHA', 'CANDIDATE_DIR', 'VERSION', 'DRY_RUN_ID', 'DRY_RUN_ATTEMPT']);
      const { GITHUB_SHA: sha, DRY_RUN_ATTEMPT: attempt } = environment;
      if (!/^[1-9]\d*$/u.test(attempt)) stop('Environment invalid', `DRY_RUN_ATTEMPT is ${attempt}.`);
      const tree = (io.readTree ?? ((revision) => execFileSync('git', ['rev-parse', `${revision}^{tree}`], { encoding: 'utf8' }).trim()))(sha);
      const candidate = verifyCandidate({
        directory: environment.CANDIDATE_DIR, version: environment.VERSION, expectedSha512: environment.EXPECTED_SHA512, sha, tree,
      });
      log(`Promoted candidate ${candidate.version} ${candidate.integrity} from dry run ${environment.DRY_RUN_ID} attempt ${attempt}`);
      log(`Dry run preparation: ${describePreparation(candidate.preparation)}`);
      writeSummary(environment, [
        '### Promoted candidate',
        '',
        `- version: \`${candidate.version}\``,
        `- tarball-sha512: \`${candidate.integrity}\``,
        `- built by dry run ${environment.DRY_RUN_ID} attempt ${attempt} at \`${sha}\`; this run did not rebuild it`,
        `- dry run preparation: ${describePreparation(candidate.preparation)}`,
      ].join('\n'));
      return;
    }
    default:
      stop('Unknown command', `Expected main-ci, dry-run, fetch-candidate, or candidate; got ${JSON.stringify(command)}.`);
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

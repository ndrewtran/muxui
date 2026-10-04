// Roadmap "R1 exit — React prerelease publication": retain E-R1-EXIT-01 to 04
// for the exact @muxui/react candidate published through
// .github/workflows/npm-publish.yml. Each phase is separate and re-runnable;
// every run rewrites the records, index, and README from verification.json.
//
//   node tests/evidence/capture-r1-exit.mjs --capture-timestamp=<ISO-8601 UTC> <phase>...
//
// Phases, in release order:
//   --dry-run-run=<id>  the mode=dry-run run on main: execution identity,
//                       sanitized prepare-job excerpts, the npm-candidate
//                       artifact (manifest retained, tarball digested only), and
//                       the pre-publish verify-credentials run. Writes E-R1-EXIT-01
//                       and the pre-publish half of E-R1-EXIT-02.
//   --publish-run=<id>  the mode=publish run: same head commit and digest as the
//                       dry run, preflight, publish, and registry read-back.
//                       Completes E-R1-EXIT-02.
//   --registry          read-only registry observations plus a clean consumer
//                       installed from the registry. Writes E-R1-EXIT-03 and 04.
//
// Options: --out=<dir> writes the route elsewhere (default tests/evidence/r1-exit).
// --rehearsal accepts a non-main run and an uncommitted tool for development
// captures, marks every record as a rehearsal, and refuses the default route.
// Hosted artifacts expire after 3 days and logs after 90; capture promptly.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../tooling/audits/repository-policy/src/canonical-json.mjs';
import { hasUnsanitizedEvidenceOutput } from '../../tooling/audits/repository-policy/src/evidence-verify.mjs';
import {
  assertSingleInstalledVersion,
  collectInstalledClosure,
  findPinnedDuplicateVersions,
  isolatedPackageManagerEnvironment,
} from '../../tooling/audits/repository-policy/src/release-proof.mjs';
import { DEFERRED_R1_EVIDENCE } from '../../packages/react/src/r1-deferred-evidence.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const repository = 'ndrewtran/muxui';
const captureTool = 'tests/evidence/capture-r1-exit.mjs';
export const route = 'tests/evidence/r1-exit';
const workflowPath = '.github/workflows/npm-publish.yml';
const registry = 'https://registry.npmjs.org/';
const packageName = '@muxui/react';
// The read-only mode=verify-credentials run on main before the publish.
const verifyCredentialsRunId = 37130250844;
// Consumer React pins mirror release-prepare.mjs's online consumer matrix.
const consumerReact = '19.2.8';
const consumerSmoke = 'tooling/audits/repository-policy/src/release-consumer/matrix-smoke.mjs';
// The Roadmap entry has no artifact ID; the heading is its stable locator.
const authority = 'strategy/milestone-roadmap.md: R1 exit — React prerelease publication';

export class R1ExitCaptureError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new R1ExitCaptureError(code, message);
};

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/u;
const timestamped = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z /u;
const content = (line) => line.replace(timestamped, '');

// Disclosure, as in capture-r1-ci-logs.mjs: hosted paths, temp directories,
// credential inputs, and escape sequences never enter retained evidence.
export const sanitizationRules = [
  'ANSI escape sequences and the byte-order mark are removed',
  'runner workspace, temp, and home paths become <workspace>, <runner-temp>, and <runner-home>; the system temp directory becomes <tmp>',
  'a credential-named input or env line becomes <redacted credential input>',
  'workflow script lines echoed in a step header are omitted; the script is the workflow file at the run head revision',
  'the output label "visible to this token", with its colon, becomes "visible to this npm credential" so the disclosure check does not read it as a credential value',
];
export function sanitize(line) {
  return line
    .replace(/\u001b\[[0-9;]*[A-Za-z]/gu, '')
    .replace(/^﻿/u, '')
    .replaceAll('/home/runner/work/muxui/muxui', '<workspace>')
    .replace(/\/home\/runner\/work\/_temp\/[A-Za-z0-9._-]+/gu, '<runner-temp>')
    .replace(/\/home\/runner\b/gu, '<runner-home>')
    .replace(/(^|[\s'"(=])\/tmp\//gu, '$1<tmp>/')
    .replace(/^(\S+\s+)[A-Za-z_-]*(?:token|authorization|api[-_]?key)\s*[:=].*$/iu, '$1<redacted credential input>')
    .replaceAll('visible to this token:', 'visible to this npm credential:');
}
// Step-header script lines are the workflow's own `run:` text, echoed in cyan.
const scriptLine = (line) => content(line).startsWith('\u001b[36;1m');

export function assertDisclosable(text, label) {
  if (hasUnsanitizedEvidenceOutput(text, repositoryRoot)) fail('R1_EXIT_UNSANITIZED', label);
  const email = text.match(emailPattern);
  if (email) fail('R1_EXIT_PERSONAL_DATA', `${label} contains an email address`);
}

// The release manifest is public package metadata, but the disclosure check
// reads a credential-named key with a plain value (`publication.authorization:
// "required-external-human-authorization"`) as a possible secret. Such values
// are replaced with <public-id> and listed, original value included, in
// verification.json; the unsanitized manifest digest binds the exact bytes.
const credentialKey = /token|secret|key|password|authorization|auth|credentials/iu;
export function sanitizeManifest(value, pointer = '', rewrites = []) {
  if (Array.isArray(value)) return { value: value.map((entry, index) => sanitizeManifest(entry, `${pointer}/${index}`, rewrites).value), rewrites };
  if (!value || typeof value !== 'object') return { value, rewrites };
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    const path = `${pointer}/${key}`;
    if (typeof entry === 'string' && credentialKey.test(key) && hasUnsanitizedEvidenceOutput(JSON.stringify({ [key]: entry }), repositoryRoot)) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry)) fail('R1_EXIT_UNSANITIZED', `manifest ${path} holds a non-identifier value`);
      rewrites.push({ pointer: path, original: entry });
      result[key] = '<public-id>';
    } else {
      result[key] = sanitizeManifest(entry, path, rewrites).value;
    }
  }
  return { value: result, rewrites };
}

/**
 * Keeps the named workflow steps from a job log. A step starts at its
 * `##[group]Run` line whose script header contains `marker`; `filter` keeps the
 * header plus matching lines only (for long steps).
 */
export function stepExcerpt(lines, steps) {
  const starts = lines.flatMap((line, index) => (line.includes('##[group]Run ') ? [index] : []));
  const output = [];
  const ranges = [];
  for (const { name, marker, filter } of steps) {
    // A step's header runs to its first ##[endgroup], never into the next step.
    const start = starts.find((index, position) => {
      const headerEnd = lines.findIndex((line, at) => at > index && line.includes('##[endgroup]'));
      const limit = Math.min(headerEnd < 0 ? index : headerEnd, (starts[position + 1] ?? lines.length) - 1);
      return lines.slice(index, limit + 1).some((line) => line.includes(marker));
    });
    if (start === undefined) fail('R1_EXIT_EXCERPT_MISSING', `step "${name}"`);
    const next = lines.findIndex((line, index) => index > start && (line.includes('##[group]Run ') || line.includes('Post job cleanup.')));
    const end = next < 0 ? lines.length : next;
    const headerEnd = lines.findIndex((line, index) => index > start && line.includes('##[endgroup]'));
    const kept = lines.slice(start, end)
      .filter((line, offset) => !scriptLine(line) && (!filter || start + offset <= headerEnd || filter.test(content(line))));
    output.push(`# step: ${name} (raw lines ${start + 1}-${end})`, ...kept.map(sanitize));
    ranges.push({ step: name, rawLines: [start + 1, end], filtered: Boolean(filter) });
  }
  return { text: `${output.join('\n')}\n`, ranges };
}

const valueAfter = (lines, pattern) => lines.map((line) => content(line).match(pattern)?.[1]).find((value) => value !== undefined) ?? null;

// The value printed after `prefix` (e.g. `echo "dist-tags: $tags"`), which may span lines.
export function jsonAfter(lines, prefix) {
  const start = lines.findIndex((line) => content(line).startsWith(prefix));
  if (start < 0) return undefined;
  let text = content(lines[start]).slice(prefix.length);
  for (let index = start + 1; ; index += 1) {
    try {
      return JSON.parse(text);
    } catch {
      if (index >= lines.length || index > start + 200) return undefined;
      text += `\n${content(lines[index])}`;
    }
  }
}

function environmentFrom(lines) {
  const imageIndex = lines.findIndex((line) => / Image: /u.test(line));
  return {
    runnerVersion: valueAfter(lines, /Current runner version: '([^']+)'/u),
    runnerImage: valueAfter(lines, /^Image: (\S+)/u),
    runnerImageVersion: imageIndex < 0 ? null : content(lines[imageIndex + 1] ?? '').match(/^Version: (\S+)/u)?.[1] ?? null,
    node: valueAfter(lines, /^node: v(\S+)/u) ?? valueAfter(lines, /Resolved \.node-version as (\S+)/u),
    npm: valueAfter(lines, /^npm: (\S+)/u),
  };
}

function rawLog(text) {
  return { bytes: Buffer.byteLength(text), lines: text.split('\n').length, sha256: sha256(text), retained: false };
}

// Shared identity checks for an npm-publish.yml run.
// `allowFailure` lets a caller accept a failed run and judge its steps itself.
function assertRun(run, { mode, rehearsal, allowFailure = false }) {
  if (run.path !== workflowPath || run.event !== 'workflow_dispatch') fail('R1_EXIT_RUN_INVALID', `run ${run.id} is not a dispatched ${workflowPath} run`);
  if (run.status !== 'completed' || (run.conclusion !== 'success' && !allowFailure)) fail('R1_EXIT_RUN_INVALID', `run ${run.id} did not succeed`);
  if (run.head_branch !== 'main' && !rehearsal) fail('R1_EXIT_RUN_NOT_MAIN', `run ${run.id} ran on ${run.head_branch}; only a main run is release evidence`);
  if (!/^[0-9a-f]{40}$/u.test(run.head_sha ?? '')) fail('R1_EXIT_RUN_INVALID', `run ${run.id} has no head commit`);
  return {
    repository,
    workflow: run.name,
    workflowPath: run.path,
    event: run.event,
    mode,
    runId: run.id,
    runAttempt: run.run_attempt,
    headBranch: run.head_branch,
    headRevision: run.head_sha,
    startedAt: run.run_started_at,
    conclusion: run.conclusion,
  };
}

function successfulJob(jobs, name, runId) {
  const job = jobs.find((candidate) => candidate.name === name);
  if (!job || job.conclusion !== 'success') fail('R1_EXIT_RUN_INVALID', `run ${runId} job ${name} did not succeed`);
  return { jobId: job.id, job: job.name, conclusion: job.conclusion, startedAt: job.started_at, completedAt: job.completed_at };
}

function executedRevision(lines, headRevision, label) {
  const at = lines.findIndex((line) => line.includes('git log -1 --format=%H'));
  const revision = at < 0 ? null : content(lines[at + 1] ?? '').trim();
  if (revision !== headRevision) fail('R1_EXIT_EXECUTED_REVISION_MISMATCH', `${label} checked out ${revision ?? 'nothing'}; the run head is ${headRevision}`);
  return revision;
}

// Workflow env lines (`  MODE: dry-run`) are printed in each step header.
const envValue = (lines, name) => valueAfter(lines, new RegExp(`^\\s+${name}: ?(.*)$`, 'u'))?.trim() ?? null;

export function tarballFacts(bytes, entries) {
  return {
    bytes: bytes.length,
    files: entries.length,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    sha256: sha256(bytes),
    shasum: createHash('sha1').update(bytes).digest('hex'),
    retained: false,
  };
}

const prepareSummary = /^(?:R1 exit |R1\.5 packed |\[E-G0\.0-04\] )/u;
const prepareSteps = [
  { name: 'Prepare release candidate', marker: 'pnpm release:prepare', filter: prepareSummary },
  { name: 'Collect candidate', marker: 'source_dir=' },
  { name: 'Rehearse npm publish (dry run)', marker: '--dry-run' },
  { name: 'Check candidate against inputs', marker: 'EXPECTED_SHA512' },
  { name: 'Upload candidate', marker: 'actions/upload-artifact' },
];

/**
 * Binds the mode=dry-run run, its prepare-job log, the npm-candidate artifact,
 * and the verify-credentials run. Pure: every input is already fetched.
 */
export function bindDryRun({ run, jobs, prepareLog, artifact, sourceTree, credentials, rehearsal = false }) {
  const execution = assertRun(run, { mode: 'dry-run', rehearsal });
  const job = successfulJob(jobs, 'prepare', run.id);
  const lines = prepareLog.split('\n');
  if (envValue(lines, 'MODE') !== 'dry-run') fail('R1_EXIT_RUN_INVALID', `run ${run.id} is not mode=dry-run`);
  const revision = executedRevision(lines, execution.headRevision, `run ${run.id}`);
  if (!artifact?.manifest || !artifact?.tarball) fail('R1_EXIT_ARTIFACT_MISSING', `run ${run.id} npm-candidate needs exactly one tarball and one release manifest`);
  const manifest = JSON.parse(artifact.manifest.bytes.toString('utf8'));
  if (manifest.source?.revision !== execution.headRevision) {
    fail('R1_EXIT_SOURCE_REVISION_MISMATCH', `manifest source.revision ${manifest.source?.revision} differs from run head ${execution.headRevision}`);
  }
  if (manifest.correlation?.source?.tree !== sourceTree) fail('R1_EXIT_SOURCE_REVISION_MISMATCH', `manifest source tree ${manifest.correlation?.source?.tree} differs from ${sourceTree}`);
  const tarball = tarballFacts(artifact.tarball.bytes, artifact.tarball.entries);
  const logged = valueAfter(lines, /^Candidate \S+ (sha512-\S+)$/u);
  const loggedVersion = valueAfter(lines, /^Candidate (\S+) sha512-/u);
  for (const [label, value, expected] of [
    ['manifest integrity', manifest.artifact?.integrity, tarball.integrity],
    ['manifest sha256', manifest.artifact?.sha256, tarball.sha256],
    ['manifest shasum', manifest.artifact?.shasum, tarball.shasum],
    ['manifest bytes', manifest.artifact?.bytes, tarball.bytes],
    ['logged candidate integrity', logged, tarball.integrity],
  ]) {
    if (value !== expected) fail('R1_EXIT_DIGEST_MISMATCH', `${label} ${value} differs from the tarball's ${expected}`);
  }
  const packed = artifact.tarball.packageJson;
  if (packed.name !== manifest.package.name || packed.version !== manifest.package.version || loggedVersion !== packed.version
    || canonicalJson(packed.exports) !== canonicalJson(manifest.package.exports) || artifact.tarball.entries.length !== manifest.files.length) {
    fail('R1_EXIT_TUPLE_MISMATCH', 'the tarball package.json, file list, and release manifest disagree');
  }
  const excerpt = stepExcerpt(lines, prepareSteps);
  return {
    execution: { ...execution, ...job, executedRevision: revision, executedTree: sourceTree },
    environment: environmentFrom(lines),
    rawLog: rawLog(prepareLog),
    excerpt,
    candidate: {
      name: packed.name,
      version: packed.version,
      tarball: { file: artifact.tarball.file, ...tarball },
      manifest: { file: artifact.manifest.file, bytes: artifact.manifest.bytes.length, sha256: sha256(artifact.manifest.bytes) },
    },
    manifest,
    credentials: bindCredentials(credentials),
  };
}

// The mode=verify-credentials run: read-only npm identity and first-publish state.
export function bindCredentials({ run, jobs, log }) {
  if (run.path !== workflowPath || run.conclusion !== 'success' || run.head_branch !== 'main') fail('R1_EXIT_CREDENTIALS_RUN_INVALID', `run ${run.id}`);
  const job = successfulJob(jobs, 'verify-credentials', run.id);
  const lines = log.split('\n').map(content);
  const after = (label) => lines.slice(lines.indexOf(label) + 1).find((line) => !line.startsWith('npm warn')) ?? null;
  if (!lines.includes('npm whoami:')) fail('R1_EXIT_CREDENTIALS_RUN_INVALID', `run ${run.id} printed no npm identity`);
  const excerpt = stepExcerpt(log.split('\n'), [{ name: 'Verify npm credentials (read-only)', marker: 'npm whoami' }]);
  return {
    execution: { repository, workflowPath: run.path, mode: 'verify-credentials', runId: run.id, runAttempt: run.run_attempt, headBranch: run.head_branch, headRevision: run.head_sha, ...job },
    observed: {
      npmUser: after('npm whoami:'),
      scopePackages: after('Packages in @muxui visible to this token:'),
      distTags: lines.some((line) => line.includes('@muxui/react returned E404')) ? 'E404 (not yet published)' : after('@muxui/react dist-tags:'),
    },
    rawLog: rawLog(log),
    excerpt,
  };
}

const publishSteps = [
  { name: 'Re-verify candidate', marker: 'npm-candidate/*.tgz' },
  { name: 'Registry preflight (read-only)', marker: 'publisher=$(npm whoami' },
  { name: 'Publish to next', marker: 'Stop on publisher drift' },
  { name: 'Read back registry state', marker: 'read_back()' },
];

const stepOf = (job, name) => job?.steps?.find((step) => step.name === name);
const provenanceType = /^https:\/\/slsa\.dev\/provenance\//u;

// Approval facts from the approvals API, plus how the approval was submitted,
// which the API does not expose and the operator reports with --approval-method.
function approvalFacts(approvals, method) {
  return approvals.map(({ state, user, environments, comment }) => ({
    state,
    user: user.login,
    environments: environments.map(({ name }) => name),
    ...(comment ? { comment } : {}),
    method: method ? { value: method, source: 'reported by the capture operator; not observable from the approvals API' } : null,
  }));
}

// Preflight, the tarball-sha512 input, and the npm publish notice all name the dry-run candidate.
function bindPublishAttempt({ dryRun, run, jobs, publishLog, rehearsal }) {
  const execution = assertRun(run, { mode: 'publish', rehearsal, allowFailure: true });
  if (execution.headRevision !== dryRun.execution.headRevision) {
    fail('R1_EXIT_HEAD_SHA_MISMATCH', `publish run head ${execution.headRevision} differs from the dry run's ${dryRun.execution.headRevision}`);
  }
  const prepare = successfulJob(jobs, 'prepare', run.id);
  const publishJob = jobs.find((job) => job.name === 'publish');
  if (!publishJob) fail('R1_EXIT_RUN_INVALID', `run ${run.id} has no publish job`);
  for (const name of ['Re-verify candidate', 'Registry preflight (read-only)']) {
    if (stepOf(publishJob, name)?.conclusion !== 'success') fail('R1_EXIT_RUN_INVALID', `run ${run.id} step "${name}" did not succeed`);
  }
  const lines = publishLog.split('\n');
  const { integrity, shasum } = dryRun.candidate.tarball;
  const { version } = dryRun.candidate;
  if (envValue(lines, 'EXPECTED_SHA512') !== integrity) fail('R1_EXIT_DIGEST_MISMATCH', `run ${run.id} tarball-sha512 input differs from the dry-run digest ${integrity}`);
  if (envValue(lines, 'EXPECTED_VERSION') !== version) fail('R1_EXIT_TUPLE_MISMATCH', `run ${run.id} version input differs from ${version}`);
  // npm abbreviates the integrity in its notice; both ends and the shasum must match.
  const notice = valueAfter(lines, /^npm notice integrity: (\S+)$/u);
  const [head, tail] = notice?.split('[...]') ?? [];
  if (valueAfter(lines, /^npm notice shasum: (\S+)$/u) !== shasum || !head || !integrity.startsWith(head) || !integrity.endsWith(tail ?? '')) {
    fail('R1_EXIT_DIGEST_MISMATCH', `run ${run.id} npm publish packed a tarball other than the dry-run candidate`);
  }
  return {
    execution: { ...execution, prepare, publish: { jobId: publishJob.id, job: publishJob.name, conclusion: publishJob.conclusion, startedAt: publishJob.started_at, completedAt: publishJob.completed_at } },
    lines,
    observed: {
      inputDigest: integrity,
      shasum,
      preflight: {
        publisher: valueAfter(lines, /^npm whoami: (\S+)$/u),
        version: valueAfter(lines, /^@muxui\/react@\S+: (E404 \(no collision\))$/u),
        distTags: valueAfter(lines, /^@muxui\/react dist-tags: (E404 \(first publish\))$/u),
      },
      packed: { shasum: valueAfter(lines, /^npm notice shasum: (\S+)$/u), integrity: notice },
      transparencyLog: valueAfter(lines, /transparency log: (\S+)$/u),
    },
  };
}

/**
 * Binds the mode=publish run to the dry run: same head commit, same digest, and
 * a successful "Publish to next". The workflow's own read-back is recorded as an
 * observation only; a read-back that failed because the registry had not yet
 * propagated the package is accepted and recorded as such. Registry proof is
 * the --registry phase.
 */
export function bindPublish({ dryRun, run, jobs, prepareLog, publishLog, approvals = [], approvalMethod, rehearsal = false }) {
  const attempt = bindPublishAttempt({ dryRun, run, jobs, publishLog, rehearsal });
  const prepareLines = prepareLog.split('\n');
  if (envValue(prepareLines, 'MODE') !== 'publish') fail('R1_EXIT_RUN_INVALID', `run ${run.id} is not mode=publish`);
  executedRevision(prepareLines, attempt.execution.headRevision, `run ${run.id} prepare`);
  const { integrity } = dryRun.candidate.tarball;
  const { version } = dryRun.candidate;
  const candidate = valueAfter(prepareLines, /^Candidate \S+ (sha512-\S+)$/u);
  if (candidate !== integrity) fail('R1_EXIT_DIGEST_MISMATCH', `publish-run candidate ${candidate} differs from the dry-run digest ${integrity}`);
  const publishJob = jobs.find((job) => job.name === 'publish');
  const { lines } = attempt;
  if (stepOf(publishJob, 'Publish to next')?.conclusion !== 'success' || !lines.some((line) => content(line) === `+ ${packageName}@${version}`)) {
    fail('R1_EXIT_TUPLE_MISMATCH', `run ${run.id} did not publish ${packageName}@${version}`);
  }
  const readBackStep = stepOf(publishJob, 'Read back registry state');
  let workflowReadBack;
  if (readBackStep?.conclusion === 'success') {
    const attestations = jsonAfter(lines, 'dist.attestations: ');
    workflowReadBack = {
      status: 'passed',
      completedAt: readBackStep.completed_at,
      integrity: valueAfter(lines, /^dist\.integrity: (\S+)$/u),
      provenancePredicateType: attestations?.provenance?.predicateType ?? null,
      distTags: jsonAfter(lines, 'dist-tags: ') ?? null,
    };
  } else if (readBackStep?.conclusion === 'failure'
    && lines.some((line) => content(line) === 'dist.integrity: missing')
    && lines.some((line) => content(line) === `##[error]Registry has nothing; expected ${integrity}.`)) {
    workflowReadBack = {
      status: 'failed-registry-propagation',
      completedAt: readBackStep.completed_at,
      error: `Registry has nothing; expected ${integrity}.`,
      retries: lines.filter((line) => /^Waiting for npm view /u.test(content(line))).length,
    };
  } else {
    fail('R1_EXIT_RUN_INVALID', `run ${run.id} read-back neither passed nor failed on registry propagation`);
  }
  return {
    execution: attempt.execution,
    environment: environmentFrom(lines),
    approvals: approvalFacts(approvals, approvalMethod),
    rawLogs: { prepare: rawLog(prepareLog), publish: rawLog(publishLog) },
    excerpts: { prepare: stepExcerpt(prepareLines, prepareSteps.slice(0, 2)), publish: stepExcerpt(lines, publishSteps) },
    observed: {
      ...attempt.observed,
      published: `${packageName}@${version}`,
      publishedAt: stepOf(publishJob, 'Publish to next').completed_at,
      // An observation of the workflow, not registry proof (see --registry).
      workflowReadBack,
    },
  };
}

/**
 * Binds an earlier publish attempt of the same candidate that failed in
 * "Publish to next" before anything was published (for example EOTP).
 */
export function bindPriorPublish({ dryRun, run, jobs, publishLog, approvals = [], approvalMethod, rehearsal = false }) {
  const attempt = bindPublishAttempt({ dryRun, run, jobs, publishLog, rehearsal });
  const publishJob = jobs.find((job) => job.name === 'publish');
  const step = stepOf(publishJob, 'Publish to next');
  const { lines } = attempt;
  if (step?.conclusion !== 'failure' || lines.some((line) => content(line).startsWith(`+ ${packageName}@`))) {
    fail('R1_EXIT_PRIOR_ATTEMPT_INVALID', `run ${run.id} is not a failed publish attempt that published nothing`);
  }
  return {
    execution: attempt.execution,
    approvals: approvalFacts(approvals, approvalMethod),
    rawLog: rawLog(publishLog),
    excerpt: stepExcerpt(lines, publishSteps.slice(1, 3)),
    observed: {
      ...attempt.observed,
      published: false,
      failedStep: { name: step.name, completedAt: step.completed_at, errorCode: valueAfter(lines, /^npm error code (\S+)$/u) },
      // npm signed and logged provenance before the registry rejected the publish.
      orphanTransparencyLog: attempt.observed.transparencyLog,
    },
  };
}

/** Decodes the registry's attestation bundles and binds the SLSA predicate to the source and run. */
export function bindAttestations(document, { dryRun, publishRunId }) {
  const statements = (document?.attestations ?? []).map(({ predicateType, bundle }) => ({
    predicateType,
    statement: JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8')),
  }));
  const slsa = statements.find(({ predicateType }) => provenanceType.test(predicateType))?.statement;
  if (!slsa) fail('R1_EXIT_PROVENANCE_MISSING', 'the attestation document has no SLSA provenance');
  const { version, tarball } = dryRun.candidate;
  const subject = slsa.subject?.[0];
  const sha512 = Buffer.from(tarball.integrity.slice('sha512-'.length), 'base64').toString('hex');
  const workflow = slsa.predicate?.buildDefinition?.externalParameters?.workflow ?? {};
  const commit = slsa.predicate?.buildDefinition?.resolvedDependencies?.[0]?.digest?.gitCommit;
  const invocation = slsa.predicate?.runDetails?.metadata?.invocationId ?? '';
  if (subject?.name !== `pkg:npm/${encodeURIComponent('@muxui')}/react@${version}` || subject?.digest?.sha512 !== sha512) {
    fail('R1_EXIT_DIGEST_MISMATCH', 'the SLSA subject is not the dry-run candidate');
  }
  if (workflow.repository !== `https://github.com/${repository}` || workflow.path !== workflowPath || commit !== dryRun.execution.headRevision) {
    fail('R1_EXIT_PROVENANCE_MISMATCH', `the SLSA predicate names ${workflow.repository} ${workflow.path} at ${commit}`);
  }
  if (publishRunId && !invocation.startsWith(`https://github.com/${repository}/actions/runs/${publishRunId}/`)) {
    fail('R1_EXIT_PROVENANCE_MISMATCH', `the SLSA invocation ${invocation} is not publish run ${publishRunId}`);
  }
  return {
    predicateTypes: statements.map(({ predicateType }) => predicateType),
    slsa: { subject, workflow, gitCommit: commit, builder: slsa.predicate.runDetails?.builder?.id ?? null, invocationId: invocation },
  };
}

/** Binds read-only registry observations and the clean consumer to the dry-run candidate. */
export function bindRegistry({ dryRun, view, attestations, consumer, publishRunId }) {
  const { version, tarball } = dryRun.candidate;
  if (view.integrity !== tarball.integrity || view.shasum !== tarball.shasum) {
    fail('R1_EXIT_DIGEST_MISMATCH', `registry ${packageName}@${version} has ${view.integrity} / ${view.shasum}; the dry run produced ${tarball.integrity} / ${tarball.shasum}`);
  }
  if (!provenanceType.test(view.attestations?.provenance?.predicateType ?? '')) fail('R1_EXIT_PROVENANCE_MISSING', `${packageName}@${version}`);
  const provenance = bindAttestations(attestations, { dryRun, publishRunId });
  if (view.distTags?.next !== version) fail('R1_EXIT_NEXT_MISMATCH', `next points at ${view.distTags?.next}; the verified rc is ${version}`);
  if (consumer.installedVersion !== version || consumer.lockIntegrity !== tarball.integrity) {
    fail('R1_EXIT_CONSUMER_MISMATCH', `the clean consumer installed ${consumer.installedVersion} (${consumer.lockIntegrity}) from next`);
  }
  const exportsMap = dryRun.manifest.package.exports;
  const expectedJs = Object.keys(exportsMap).filter((subpath) => !subpath.endsWith('.css')).length;
  if (consumer.smoke.imported.length !== expectedJs || consumer.smoke.resolved.length !== Object.keys(exportsMap).length - expectedJs
    || !consumer.smoke.resolved.includes(`${packageName}/styles.css`) || !consumer.smoke.rendered.includes('Button')) {
    fail('R1_EXIT_CONSUMER_MISMATCH', 'the clean consumer did not import every subpath, resolve styles.css, and render Button');
  }
  return { view, provenance, consumer };
}

// ---------------------------------------------------------------------------
// Route assembly: records, index, and README derive only from verification.json.

const nonClaims = [
  'No assistive-technology support claim; rc.1 claims none (Decision 0022).',
  'latest is set by the registry on first publish; it is observed here, not claimed or promoted (Decision 0023).',
  'No stable release, framework-free, native, React Native Web, parity, or equivalence claim.',
  'Completion of the R1 exit is not claimed here; merging the final R1-exit pull request is Andrew\'s separate stop.',
];
const deferred = DEFERRED_R1_EVIDENCE.map(({ id, part, status, deferredTo, provisional }) => ({ id, part, status, deferredTo, ...(provisional ? { provisional } : {}) }));

function record(verification, refs, assertionId, body) {
  const { dryRun } = verification.phases;
  return canonicalJson({
    schema: 'muxui-evidence-record-v1',
    assertionId,
    milestone: 'R1 exit',
    basis: `${assertionId} under the Roadmap R1 exit, muxui:decision:0022, and muxui:decision:0023`,
    proofTool: verification.proofTool,
    ...body,
    candidate: { name: dryRun.candidate.name, version: dryRun.candidate.version, integrity: dryRun.candidate.tarball.integrity },
    sourceRevision: verification.sourceRevision,
    sourceTree: verification.sourceTree,
    nonClaims,
    deferredToS1: deferred,
    validation: refs.validation,
    activeExceptionRefs: [],
    advisoryRefs: [],
    disclosureClass: 'public-sanitized',
    owner: 'ndrewtran',
    ...(verification.rehearsal ? { rehearsal: verification.rehearsal } : {}),
    retentionPolicy: 'Content-addressed Git records retained in default-branch history; hosted logs, workflow artifacts, the tarball, and registry state are mutable or expiring locators bound by digest',
    expiry: 'Retained as R1 exit proof for this exact candidate; a fix-forward rc needs new E-R1-EXIT-01 to 03 evidence rather than an edit',
  });
}

export function buildRoute(verification, refs) {
  const { dryRun, publish, priorPublish, registry: observed } = verification.phases;
  if (!dryRun) fail('R1_EXIT_PHASE_ORDER', 'capture --dry-run-run first');
  const manifest = refs.manifest;
  const records = {};
  records['E-R1-EXIT-01'] = record(verification, refs, 'E-R1-EXIT-01', {
    evidenceKind: 'retained-npm-publish-dry-run',
    claim: 'exact tarball, export, and install tuple',
    outcome: 'pass',
    proofTool: dryRun.proofTool,
    captureTimestamp: dryRun.captureTimestamp,
    execution: dryRun.execution,
    environment: dryRun.environment,
    observed: {
      tarball: dryRun.candidate.tarball,
      exports: Object.keys(dryRun.manifest.package.exports),
      dependencies: dryRun.manifest.package.dependencies,
      peerDependencies: dryRun.manifest.package.peerDependencies,
      files: dryRun.manifest.files.length,
      onlineConsumerMatrix: dryRun.manifest.consumerVerification.onlineMatrix,
      consumerWarnings: dryRun.manifest.consumerVerification.warnings,
    },
    artifact: manifest,
    excerpt: refs.dryRunExcerpt,
  });
  records['E-R1-EXIT-02'] = record(verification, refs, 'E-R1-EXIT-02', {
    evidenceKind: 'retained-npm-registry-provenance-integrity',
    claim: 'registry, provenance, and integrity',
    // Pass needs the pre-publish half, the publish run, and the registry read-back.
    outcome: publish && observed ? 'pass' : 'partial',
    proofTool: (observed ?? publish ?? dryRun).proofTool,
    phaseProofTools: Object.fromEntries(['dryRun', 'priorPublish', 'publish', 'registry'].filter((phase) => verification.phases[phase]).map((phase) => [phase, verification.phases[phase].proofTool])),
    captureTimestamp: (observed ?? publish ?? dryRun).captureTimestamp,
    prePublication: {
      captureTimestamp: dryRun.captureTimestamp,
      manifest: {
        artifact: dryRun.manifest.artifact,
        source: { revision: dryRun.manifest.source.revision, tree: dryRun.manifest.correlation.source.tree, preparationTool: dryRun.manifest.source.preparationTool },
        publication: dryRun.manifest.publication,
        preflightChecks: dryRun.manifest.preflight.checks.map(({ name, command, status }) => ({ name, command, status })),
      },
      verifyCredentials: { execution: dryRun.credentials.execution, observed: dryRun.credentials.observed, excerpt: refs.credentialsExcerpt },
    },
    priorPublishAttempts: priorPublish
      ? [{ captureTimestamp: priorPublish.captureTimestamp, execution: priorPublish.execution, environmentApprovals: priorPublish.approvals, observed: priorPublish.observed, excerpt: refs.priorPublishExcerpt }]
      : [],
    postPublication: publish
      ? { captureTimestamp: publish.captureTimestamp, execution: publish.execution, environmentApprovals: publish.approvals, observed: publish.observed, excerpts: refs.publishExcerpts }
      : { status: 'pending-post-publication' },
    // The workflow's read-back is an observation; this read-back is the proof.
    registryReadBack: observed
      ? {
        captureTimestamp: observed.captureTimestamp,
        integrity: observed.view.integrity,
        shasum: observed.view.shasum,
        attestations: observed.view.attestations,
        provenance: observed.provenance,
        distTags: observed.view.distTags,
        artifact: refs.registry,
      }
      : { status: 'pending-registry-read-back' },
    artifact: manifest,
  });
  if (observed) {
    records['E-R1-EXIT-03'] = record(verification, refs, 'E-R1-EXIT-03', {
      evidenceKind: 'retained-published-clean-consumer',
      claim: 'published clean-consumer verification',
      outcome: 'pass',
      proofTool: observed.proofTool,
      captureTimestamp: observed.captureTimestamp,
      observed: observed.consumer,
      artifact: refs.registry,
    });
    const { latest, next } = observed.view.distTags;
    records['E-R1-EXIT-04'] = record(verification, refs, 'E-R1-EXIT-04', {
      evidenceKind: 'retained-dist-tag-observation',
      claim: 'dist-tag verification with rollback prepared, not exercised',
      outcome: 'pass',
      proofTool: observed.proofTool,
      captureTimestamp: observed.captureTimestamp,
      distTags: {
        next: { observed: next, verifiedRc: dryRun.candidate.version },
        latest: {
          observed: latest ?? null,
          setBy: 'the registry on first publish (Decision 0023)',
          claimed: false,
          promoted: false,
        },
        all: observed.view.distTags,
      },
      rollback: { ...dryRun.manifest.rollback, status: 'prepared-not-exercised' },
      artifact: refs.registry,
    });
  }
  return records;
}

function readme(verification) {
  return `# R1 exit retained publication evidence

Roadmap "R1 exit — React prerelease publication" requires \`E-R1-EXIT-01\` to
\`E-R1-EXIT-04\` for the exact \`@muxui/react\` candidate. This root retains them
from the \`npm-publish.yml\` dry-run and publish runs and from read-only registry
observations, captured by \`node ${captureTool}\`.

- \`E-R1-EXIT-01\`: the dry run's exact tarball, export, and install tuple.
- \`E-R1-EXIT-02\`: the release manifest and \`verify-credentials\` run before
  publish; any earlier failed publish attempt; the publish run's preflight and
  publish, with its own read-back recorded as an observation only; and the
  read-back proof from the registry (integrity, shasum, SLSA provenance bound to
  the source commit and publish run, dist-tags). It stays \`partial\` until both
  the publish run and the registry read-back are captured.
- \`E-R1-EXIT-03\`: a clean consumer installed from the registry's \`next\`.
- \`E-R1-EXIT-04\`: \`next\` and the observed \`latest\`, with the release
  manifest's rollback prepared, not exercised.

\`artifacts/\` holds the sanitized release manifest and the registry observation;
\`validation/\` holds sanitized job-log excerpts; \`verification.json\` binds them
to the unsanitized log, tarball, and manifest digests. The tarball is not
retained; its sha512, sha256, shasum, size, and file count are.

\`latest\` is set by the registry on first publish and is recorded as observed,
not claimed or promoted (Decision 0023). rc.1 makes no assistive-technology
claim (Decision 0022), and every item Decision 0022 defers to \`S1.0\` stays
unmet. These records do not claim the R1 exit is complete; merging the final
R1-exit pull request is Andrew's separate stop.${verification.rehearsal ? '\n\nThis capture is a rehearsal and is not release evidence.' : ''}
`;
}

// ---------------------------------------------------------------------------
// Hosted and registry I/O (read-only).

function createGitHub() {
  const gh = (...args) => execFileSync('gh', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const json = (path) => JSON.parse(gh('api', path));
  return {
    run: (id) => json(`repos/${repository}/actions/runs/${id}`),
    jobs: (id) => json(`repos/${repository}/actions/runs/${id}/jobs?per_page=100`).jobs,
    approvals: (id) => json(`repos/${repository}/actions/runs/${id}/approvals`),
    log: (jobId) => gh('api', '--allow-escape-sequences', `repos/${repository}/actions/jobs/${jobId}/logs`),
    tree: (sha) => json(`repos/${repository}/git/commits/${sha}`).tree.sha,
    download(runId, directory) {
      const result = spawnSync('gh', ['run', 'download', String(runId), '--repo', repository, '--name', 'npm-candidate', '--dir', directory], { encoding: 'utf8' });
      return result.status === 0;
    },
  };
}

function readCandidate(directory) {
  const files = existsSync(directory) ? readdirSync(directory) : [];
  const tarballs = files.filter((file) => file.endsWith('.tgz'));
  const manifests = files.filter((file) => file.endsWith('.release-manifest.json'));
  if (tarballs.length !== 1 || manifests.length !== 1) return null;
  const path = join(directory, tarballs[0]);
  return {
    manifest: { file: manifests[0], bytes: readFileSync(join(directory, manifests[0])) },
    tarball: {
      file: tarballs[0],
      bytes: readFileSync(path),
      entries: execFileSync('tar', ['-tzf', path], { encoding: 'utf8' }).split('\n').filter((entry) => entry && !entry.endsWith('/')),
      packageJson: JSON.parse(execFileSync('tar', ['-xzOf', path, 'package/package.json'], { encoding: 'utf8' })),
    },
  };
}

function runCommand(label, command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600_000, ...options });
  if (result.status !== 0) fail('R1_EXIT_REGISTRY_COMMAND_FAILED', `${label}: ${(result.stderr || result.stdout || '').trim().slice(-2000)}`);
  return result.stdout;
}

// npm and its consumer installs read empty user and global config, so no host
// credential or registry override reaches them (as in release-prepare.mjs).
function withIsolatedNpm(callback) {
  const temp = mkdtempSync(join(tmpdir(), 'muxui-r1-exit-registry-'));
  try {
    const userConfig = join(temp, 'empty-userconfig');
    const globalConfig = join(temp, 'empty-globalconfig');
    writeFileSync(userConfig, '');
    writeFileSync(globalConfig, '');
    const env = isolatedPackageManagerEnvironment(process.env, { userConfig, globalConfig });
    const npm = (label, args, cwd = temp) => runCommand(label, 'npm', [...args, `--registry=${registry}`], { cwd, env });
    return callback({ npm, temp });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

// Read-only registry metadata for the candidate version and the package's
// dist-tags. The registry can serve the version document before the package
// document propagates, so an E404 is retried until `waitSeconds`, then fails closed.
async function observeView(dryRun, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const view = withIsolatedNpm(({ npm }) => {
        const dist = JSON.parse(npm('npm view dist', ['view', `${packageName}@${dryRun.candidate.version}`, 'dist.integrity', 'dist.shasum', 'dist.attestations', '--json']));
        return {
          integrity: dist['dist.integrity'],
          shasum: dist['dist.shasum'],
          attestations: dist['dist.attestations'],
          distTags: JSON.parse(npm('npm view dist-tags', ['view', packageName, 'dist-tags', '--json'])),
        };
      });
      const response = await fetch(view.attestations?.url ?? 'about:blank');
      if (!response.ok) fail('R1_EXIT_PROVENANCE_MISSING', `attestations ${view.attestations?.url} returned ${response.status}`);
      return { view, attestations: await response.json() };
    } catch (error) {
      if (!/E404/u.test(error.message) || Date.now() >= deadline) {
        if (/E404/u.test(error.message)) fail('R1_EXIT_REGISTRY_NOT_PROPAGATED', `${packageName} was still E404 after ${attempt} attempts over ${waitSeconds}s`);
        throw error;
      }
      console.log(`[r1-exit] registry E404 (attempt ${attempt}); retrying in 30s`);
      await new Promise((settle) => setTimeout(settle, 30_000));
    }
  }
}

/**
 * A clean consumer: installs `spec` (the registry's next) with the pinned React,
 * checks registry signatures, imports every public subpath, resolves the
 * stylesheets, and server-renders Button through release-prepare's matrix smoke.
 */
export function observeConsumer(manifest, spec = `${packageName}@next`) {
  return withIsolatedNpm(({ npm, temp }) => {
    const consumerRoot = join(temp, 'consumer');
    mkdirSync(consumerRoot);
    writeFileSync(join(consumerRoot, 'package.json'), `${JSON.stringify({ name: 'muxui-r1-exit-published-consumer', private: true, type: 'module' }, null, 2)}\n`);
    const install = ['install', spec, `react@${consumerReact}`, `react-dom@${consumerReact}`, '--ignore-scripts', '--no-audit', '--no-fund'];
    npm('npm install', install, consumerRoot);
    const audit = npm('npm audit signatures', ['audit', 'signatures'], consumerRoot);
    copyFileSync(join(repositoryRoot, consumerSmoke), join(consumerRoot, 'matrix-smoke.mjs'));
    const smoke = JSON.parse(runCommand('consumer smoke', process.execPath, ['matrix-smoke.mjs', JSON.stringify(manifest.package.exports)], { cwd: consumerRoot }).trim().split('\n').at(-1));
    const installed = JSON.parse(readFileSync(join(consumerRoot, 'package-lock.json'), 'utf8')).packages[`node_modules/${packageName}`];
    const closure = collectInstalledClosure(consumerRoot, packageName, { excludedNames: ['react', 'react-dom'] });
    return {
      install: `npm ${install.join(' ')}`,
      npm: npm('npm version', ['--version']).trim(),
      node: process.version.slice(1),
      installedVersion: installed?.version,
      lockIntegrity: installed?.integrity,
      runtimePackages: closure.size,
      tiptapCore: assertSingleInstalledVersion(closure, '@tiptap/core', 'R1_EXIT_CONSUMER_TIPTAP_CORE_SKEW'),
      duplicatePinnedVersions: findPinnedDuplicateVersions(closure, manifest.package.dependencies),
      auditSignatures: audit.split('\n').map((line) => line.trim()).filter((line) => line && !/^audited \d+ packages? in/u.test(line)),
      smoke,
    };
  });
}

// ---------------------------------------------------------------------------
// Writing.

function parseArguments(argv) {
  const options = { phases: [], approvalMethods: {}, registryWait: 600 };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split(/=(.*)/su);
    const value = () => inline ?? argv[++index];
    if (flag === '--dry-run-run') options.phases.push(['dryRun', Number(value())]);
    else if (flag === '--publish-run') options.phases.push(['publish', Number(value())]);
    else if (flag === '--prior-publish-run') options.phases.push(['priorPublish', Number(value())]);
    else if (flag === '--registry') options.phases.push(['registry']);
    else if (flag === '--registry-wait') options.registryWait = Number(value());
    else if (flag === '--approval-method') {
      // <run id>=<how the environment approval was submitted>
      const [runId, method] = value().split(/=(.*)/su);
      if (!method) fail('R1_EXIT_ARGUMENT_INVALID', '--approval-method needs <run id>=<method>');
      options.approvalMethods[runId] = method;
    }
    else if (flag === '--capture-timestamp') options.captureTimestamp = value();
    else if (flag === '--out') options.out = resolve(value());
    else if (flag === '--rehearsal') options.rehearsal = true;
    else fail('R1_EXIT_ARGUMENT_INVALID', `unknown argument ${argv[index]}`);
  }
  if (options.phases.length === 0) fail('R1_EXIT_ARGUMENT_INVALID', 'pass --dry-run-run=<id>, --publish-run=<id>, or --registry');
  if (options.phases.some(([, id]) => id !== undefined && !Number.isSafeInteger(id))) fail('R1_EXIT_ARGUMENT_INVALID', 'run IDs are integers');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(options.captureTimestamp ?? '')) {
    fail('R1_EXIT_CAPTURE_TIMESTAMP_REQUIRED', 'pass --capture-timestamp=YYYY-MM-DDTHH:MM:SSZ');
  }
  options.out ??= join(repositoryRoot, route);
  if (options.rehearsal && `${options.out}/`.startsWith(join(repositoryRoot, 'tests/evidence/'))) fail('R1_EXIT_REHEARSAL_ROUTE', 'a rehearsal writes only to --out outside tests/evidence');
  return options;
}

function proofToolIdentity(rehearsal) {
  const bytes = readFileSync(join(repositoryRoot, captureTool));
  const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const committed = spawnSync('git', ['show', `HEAD:${captureTool}`], { cwd: repositoryRoot });
  if (committed.status !== 0 || !committed.stdout.equals(bytes)) {
    if (!rehearsal) fail('R1_EXIT_PROOF_TOOL_UNCOMMITTED', `${captureTool} must match HEAD`);
    return { path: captureTool, sha256: sha256(bytes), revision: { status: 'uncommitted-rehearsal' } };
  }
  const revision = git('log', '-1', '--format=%H', '--', captureTool);
  return { path: captureTool, sha256: sha256(bytes), revision, tree: git('rev-parse', `${revision}^{tree}`) };
}

export async function main(argv = process.argv.slice(2), github = createGitHub()) {
  const options = parseArguments(argv);
  const routePath = (relative) => join(options.out, relative.slice(route.length + 1));
  const write = (relative, text) => {
    assertDisclosable(text, relative);
    mkdirSync(dirname(routePath(relative)), { recursive: true });
    writeFileSync(routePath(relative), text);
    return { path: relative, sha256: sha256(readFileSync(routePath(relative))) };
  };
  const verificationRelative = `${route}/verification.json`;
  const verification = existsSync(routePath(verificationRelative))
    ? JSON.parse(readFileSync(routePath(verificationRelative), 'utf8'))
    : { schema: 'muxui-evidence-validation-v1', phases: {} };
  // Retained artifacts and excerpts must still match their recorded digests.
  for (const ref of Object.values(verification.retained ?? {})) {
    if (sha256(readFileSync(routePath(ref.path))) !== ref.sha256) fail('R1_EXIT_RETAINED_CHANGED', `${ref.path} no longer matches its capture digest`);
  }
  verification.retained ??= {};
  // Retained files are keyed; replacing or dropping one removes its old file.
  const drop = (...keys) => {
    for (const key of keys) {
      if (verification.retained[key]) rmSync(routePath(verification.retained[key].path), { force: true });
      delete verification.retained[key];
    }
  };
  const retain = (key, relative, text) => {
    if (verification.retained[key]?.path !== relative) drop(key);
    verification.retained[key] = write(relative, text);
  };
  // Later phases read the candidate's manifest back from its retained, sanitized artifact.
  const capturedDryRun = () => {
    const { dryRun } = verification.phases;
    if (!dryRun) fail('R1_EXIT_PHASE_ORDER', 'capture --dry-run-run first');
    return { ...dryRun, manifest: JSON.parse(readFileSync(routePath(verification.retained.manifest.path), 'utf8')) };
  };
  // Each phase keeps the identity of the tool that captured it; a capture made
  // before per-phase identities inherits the route's earlier tool identity.
  if (verification.phases.dryRun && !verification.phases.dryRun.proofTool) verification.phases.dryRun.proofTool = verification.proofTool;
  verification.proofTool = proofToolIdentity(options.rehearsal);
  if (options.rehearsal) verification.rehearsal = { status: 'rehearsal', note: 'development capture; not release evidence' };
  else if (verification.rehearsal) fail('R1_EXIT_REHEARSAL_ROUTE', 'this route holds a rehearsal capture');

  for (const [phase, runId] of options.phases) {
    if (phase === 'dryRun') {
      const run = github.run(runId);
      const jobs = github.jobs(runId);
      const prepare = jobs.find((job) => job.name === 'prepare');
      const credentialsRun = github.run(verifyCredentialsRunId);
      const credentialsJobs = github.jobs(verifyCredentialsRunId);
      const credentialsJob = credentialsJobs.find((job) => job.name === 'verify-credentials');
      const download = mkdtempSync(join(tmpdir(), 'muxui-r1-exit-candidate-'));
      try {
        const artifact = github.download(runId, download) ? readCandidate(download) : null;
        const bound = bindDryRun({
          run,
          jobs,
          prepareLog: prepare ? github.log(prepare.id) : '',
          artifact,
          sourceTree: github.tree(run.head_sha),
          credentials: { run: credentialsRun, jobs: credentialsJobs, log: credentialsJob ? github.log(credentialsJob.id) : '' },
          rehearsal: options.rehearsal,
        });
        const { value, rewrites } = sanitizeManifest(bound.manifest);
        retain('manifest', `${route}/artifacts/release-manifest.json`, canonicalJson(value));
        retain('dryRunExcerpt', `${route}/validation/dry-run-prepare-${bound.execution.jobId}.txt`, bound.excerpt.text);
        retain('credentialsExcerpt', `${route}/validation/verify-credentials-${bound.credentials.execution.jobId}.txt`, bound.credentials.excerpt.text);
        // The manifest itself lives only in the retained, sanitized artifact.
        const { excerpt, credentials, manifest: _manifest, ...rest } = bound;
        verification.phases.dryRun = {
          ...rest,
          captureTimestamp: options.captureTimestamp,
          excerpt: excerpt.ranges,
          manifestSanitization: rewrites,
          proofTool: verification.proofTool,
          credentials: { ...credentials, excerpt: credentials.excerpt.ranges },
        };
        verification.sourceRevision = bound.execution.headRevision;
        verification.sourceTree = bound.execution.executedTree;
        // A new dry run invalidates later phases bound to the previous candidate.
        if (verification.phases.publish?.execution.headRevision !== bound.execution.headRevision
          || verification.phases.publish?.observed.inputDigest !== bound.candidate.tarball.integrity) {
          delete verification.phases.publish;
          delete verification.phases.registry;
          delete verification.phases.priorPublish;
          drop('publishPrepareExcerpt', 'publishExcerpt', 'priorPublishExcerpt', 'registry');
        }
      } finally {
        rmSync(download, { recursive: true, force: true });
      }
    } else if (phase === 'publish' || phase === 'priorPublish') {
      const dryRun = capturedDryRun();
      const run = github.run(runId);
      const jobs = github.jobs(runId);
      const log = (name) => {
        const job = jobs.find((candidate) => candidate.name === name);
        return job ? github.log(job.id) : '';
      };
      const shared = { dryRun, run, jobs, publishLog: log('publish'), approvals: github.approvals(runId), approvalMethod: options.approvalMethods[runId], rehearsal: options.rehearsal };
      if (phase === 'publish') {
        const bound = bindPublish({ ...shared, prepareLog: log('prepare') });
        retain('publishPrepareExcerpt', `${route}/validation/publish-prepare-${bound.execution.prepare.jobId}.txt`, bound.excerpts.prepare.text);
        retain('publishExcerpt', `${route}/validation/publish-${bound.execution.publish.jobId}.txt`, bound.excerpts.publish.text);
        verification.phases.publish = {
          ...bound,
          captureTimestamp: options.captureTimestamp,
          proofTool: verification.proofTool,
          excerpts: { prepare: bound.excerpts.prepare.ranges, publish: bound.excerpts.publish.ranges },
        };
      } else {
        const bound = bindPriorPublish(shared);
        retain('priorPublishExcerpt', `${route}/validation/prior-publish-${bound.execution.publish.jobId}.txt`, bound.excerpt.text);
        verification.phases.priorPublish = { ...bound, captureTimestamp: options.captureTimestamp, proofTool: verification.proofTool, excerpt: bound.excerpt.ranges };
      }
    } else {
      const dryRun = capturedDryRun();
      const { view, attestations } = await observeView(dryRun, options.registryWait);
      const bound = bindRegistry({ dryRun, view, attestations, consumer: observeConsumer(dryRun.manifest), publishRunId: verification.phases.publish?.execution.runId });
      retain('registry', `${route}/artifacts/registry-observation.json`, canonicalJson({
        schema: 'muxui-r1-exit-registry-observation-v1',
        registry,
        ...bound,
        attestationDocument: { url: view.attestations.url, sha256: sha256(canonicalJson(attestations)), retained: false },
      }));
      verification.phases.registry = { ...bound, captureTimestamp: options.captureTimestamp, proofTool: verification.proofTool };
    }
  }

  verification.captureProcedure = `node ${captureTool} --capture-timestamp=<ISO-8601 UTC> [--dry-run-run=<id>] [--publish-run=<id>] [--prior-publish-run=<id>] [--approval-method=<id>=<method>] [--registry [--registry-wait=<s>]]`;
  verification.sanitizationRules = sanitizationRules;
  const validation = write(verificationRelative, canonicalJson(verification));
  const { retained } = verification;
  const refs = {
    validation,
    manifest: retained.manifest,
    dryRunExcerpt: retained.dryRunExcerpt,
    credentialsExcerpt: retained.credentialsExcerpt,
    publishExcerpts: retained.publishExcerpt ? [retained.publishPrepareExcerpt, retained.publishExcerpt] : [],
    priorPublishExcerpt: retained.priorPublishExcerpt,
    registry: retained.registry,
  };
  const routeView = { ...verification, phases: { ...verification.phases, dryRun: capturedDryRun() } };
  const built = buildRoute(routeView, refs);
  const records = Object.entries(built).map(([assertionId, text]) => ({ assertionId, ...write(`${route}/records/${assertionId}.json`, text) }));
  for (const stale of ['E-R1-EXIT-03', 'E-R1-EXIT-04'].filter((id) => !built[id])) rmSync(routePath(`${route}/records/${stale}.json`), { force: true });
  write(`${route}/README.md`, readme(verification));
  write(`${route}/index.json`, canonicalJson({
    schema: 'muxui-evidence-index-v1',
    milestone: 'R1 exit',
    authority,
    sourceRevision: verification.sourceRevision,
    sourceTree: verification.sourceTree,
    artifacts: Object.values(retained).sort((left, right) => (left.path < right.path ? -1 : 1)),
    records,
    validation,
    disclosureClass: 'public-sanitized',
    owner: 'ndrewtran',
    ...(verification.rehearsal ? { rehearsal: verification.rehearsal } : {}),
    // The evidence head is the commit that retains this root; it is created after capture.
    evidenceHead: { status: 'not-applicable', reason: 'the index digest is the content address; the retaining commit follows capture' },
    retentionPolicy: 'Content-addressed Git records retained in default-branch history; hosted logs and artifacts expire and are bound by digest',
  }));
  return { records: records.map(({ assertionId }) => assertionId), out: options.out };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { records, out } = await main();
    console.log(`[r1-exit] wrote ${records.join(', ')} to ${out}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

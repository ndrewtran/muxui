// Decision 0022: retain the R1.1-R1.5 logged CI check evidence before the
// hosted Actions logs expire. Run once, from a clean checkout, with read-only
// `gh` access:
//   node tests/evidence/capture-r1-ci-logs.mjs --capture-timestamp=<ISO-8601 UTC>
// Each milestone root keeps sanitized step excerpts, the raw-log digests, the
// execution identity, and one record per roadmap assertion. Raw logs are not
// retained; their sha256 binds each excerpt to the exact hosted bytes.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson } from '../../tooling/audits/repository-policy/src/canonical-json.mjs';
import { hasUnsanitizedEvidenceOutput } from '../../tooling/audits/repository-policy/src/evidence-verify.mjs';
import { DEFERRED_R1_EVIDENCE } from '../../packages/react/src/r1-deferred-evidence.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const repository = 'ndrewtran/muxui';
const captureTool = 'tests/evidence/capture-r1-ci-logs.mjs';
const logExpiry = 'GitHub Actions log retention; Decision 0022 records expiry around 2026-11-23';

// Decision 0022 cites one protected pull request per milestone; the roadmap
// owns each milestone's assertion IDs.
const milestones = [
  { milestone: 'R1.1', pullRequest: 102, assertions: 4 },
  { milestone: 'R1.2', pullRequest: 105, assertions: 4 },
  { milestone: 'R1.3', pullRequest: 106, assertions: 5 },
  { milestone: 'R1.4', pullRequest: 107, assertions: 6, issue: 79 },
  { milestone: 'R1.5', pullRequest: 108, assertions: 6 },
];

const timestampArgument = process.argv.find((value) => value.startsWith('--capture-timestamp='));
const captureTimestamp = timestampArgument?.slice('--capture-timestamp='.length);
if (!captureTimestamp || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(captureTimestamp)) {
  throw new Error('R1_CAPTURE_TIMESTAMP_REQUIRED: pass --capture-timestamp=YYYY-MM-DDTHH:MM:SSZ');
}

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const gh = (...args) => execFileSync('gh', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const ghJson = (...args) => JSON.parse(gh(...args));

// Disclosure: hosted paths, temp directories, credential inputs, and escape
// sequences never enter retained evidence.
function sanitize(line) {
  return line
    .replace(/\u001b\[[0-9;]*[A-Za-z]/gu, '')
    .replace(/^﻿/u, '')
    .replaceAll('/home/runner/work/core-ui/core-ui', '<workspace>')
    .replaceAll('/home/runner/work/muxui/muxui', '<workspace>')
    .replace(/\/home\/runner\/work\/_temp\/[A-Za-z0-9._-]+/gu, '<runner-temp>')
    .replace(/\/home\/runner\b/gu, '<runner-home>')
    .replace(/(^|[\s'"(=])\/tmp\//gu, '$1<tmp>/')
    .replace(/^(\S+\s+)[A-Za-z_-]*(?:token|authorization|api[-_]?key)\s*[:=].*$/iu, '$1<redacted credential input>');
}

const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/u;

function assertDisclosable(text, label) {
  if (hasUnsanitizedEvidenceOutput(text, repositoryRoot)) throw new Error(`R1_CAPTURE_UNSANITIZED: ${label}`);
  const email = text.match(emailPattern);
  if (email) throw new Error(`R1_CAPTURE_PERSONAL_DATA: ${label} contains ${email[0]}`);
}

// Keeps every step after checkout/setup through the last workflow step, which
// holds the check commands and their results; checkout and cleanup are omitted.
function excerpt(lines, firstStep) {
  const start = lines.findIndex((line) => line.includes(`##[group]Run ${firstStep}`));
  const end = lines.findIndex((line, index) => index > start && line.includes('Post job cleanup.'));
  if (start < 0 || end < 0) throw new Error(`R1_CAPTURE_EXCERPT_MISSING: ${firstStep}`);
  return { start: start + 1, end, lines: lines.slice(start, end).map(sanitize) };
}

function environmentFrom(lines) {
  const value = (pattern) => lines.map((line) => line.match(pattern)?.[1]).find(Boolean) ?? null;
  const imageIndex = lines.findIndex((line) => /Image: /u.test(line));
  return {
    runnerVersion: value(/Current runner version: '([^']+)'/u),
    runnerImage: value(/ Image: (\S+)/u),
    runnerImageVersion: imageIndex < 0 ? null : lines[imageIndex + 1].match(/Version: (\S+)/u)?.[1] ?? null,
    node: value(/Resolved \.node-version as (\S+)/u),
    pnpm: value(/using pnpm v(\S+)/u),
    browser: value(/\{"browser":"([^"]+)"/u),
  };
}

function testTotals(lines) {
  let tests = 0;
  let pass = 0;
  let fail = 0;
  for (const line of lines) {
    const node = line.match(/ℹ (tests|pass|fail) (\d+)$/u) ?? line.match(/^.{28}\s*# (tests|pass|fail) (\d+)$/u);
    if (node) {
      const count = Number(node[2]);
      if (node[1] === 'tests') tests += count;
      if (node[1] === 'pass') pass += count;
      if (node[1] === 'fail') fail += count;
    }
    const jest = line.match(/Tests:\s+(\d+) passed, (\d+) total/u);
    if (jest) {
      tests += Number(jest[2]);
      pass += Number(jest[1]);
    }
  }
  return { tests, pass, fail };
}

function pullRequestValidation(body) {
  const lines = body.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^## Validation\s*$/u.test(line));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).map(sanitize).filter((line) => line.trim() !== '');
}

function write(path, value) {
  const absolute = join(repositoryRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, value);
  return { path, sha256: sha256(readFileSync(absolute)) };
}

const proofTool = { path: captureTool, sha256: sha256(readFileSync(join(repositoryRoot, captureTool))) };
let retainedBytes = 0;

for (const { milestone, pullRequest, assertions, issue } of milestones) {
  const root = `tests/evidence/${milestone.toLowerCase()}`;
  const pr = ghJson('pr', 'view', String(pullRequest), '--repo', repository, '--json', 'number,title,state,headRefOid,mergeCommit,mergedAt,body,statusCheckRollup');
  if (pr.state !== 'MERGED') throw new Error(`R1_CAPTURE_PR_NOT_MERGED: #${pullRequest}`);
  const sourceRevision = pr.mergeCommit.oid;
  const [baseRevision, headRevision] = git('log', '-1', '--format=%P', sourceRevision).split(' ');
  if (headRevision !== pr.headRefOid) throw new Error(`R1_CAPTURE_SOURCE_MISMATCH: #${pullRequest}`);
  const sourceTree = git('rev-parse', `${sourceRevision}^{tree}`);
  // CI ran the synthetic merge of the same base and head; recomputing it binds
  // the executed tree to the merged source tree.
  const executedTree = git('merge-tree', '--write-tree', baseRevision, headRevision);
  if (executedTree !== sourceTree) throw new Error(`R1_CAPTURE_EXECUTED_TREE_MISMATCH: #${pullRequest}`);

  const results = [];
  for (const check of pr.statusCheckRollup) {
    const [, runId, jobId] = check.detailsUrl.match(/\/actions\/runs\/(\d+)\/job\/(\d+)/u) ?? [];
    if (!runId) throw new Error(`R1_CAPTURE_CHECK_UNRESOLVED: ${check.name}`);
    const run = ghJson('api', `repos/${repository}/actions/runs/${runId}`);
    const job = ghJson('api', `repos/${repository}/actions/jobs/${jobId}`);
    const raw = gh('api', '--allow-escape-sequences', `repos/${repository}/actions/jobs/${jobId}/logs`);
    const lines = raw.split('\n');
    const executed = raw.match(/HEAD is now at \S+ Merge (\S+) into (\S+)/u);
    const executedRevision = lines[lines.findIndex((line) => line.includes('git log -1 --format=%H')) + 1]?.slice(29).trim();
    if (!executed || executed[1] !== headRevision || executed[2] !== baseRevision || !/^[0-9a-f]{40}$/u.test(executedRevision ?? '')) {
      throw new Error(`R1_CAPTURE_EXECUTION_UNBOUND: job ${jobId}`);
    }
    if (run.head_sha !== headRevision || job.conclusion !== 'success' || run.conclusion !== 'success') {
      throw new Error(`R1_CAPTURE_RUN_INVALID: run ${runId}`);
    }
    const firstStep = check.workflowName === 'Deterministic workspace checks' ? 'pnpm check' : 'ruby ';
    const kept = excerpt(lines, firstStep);
    const text = `${kept.lines.join('\n')}\n`;
    assertDisclosable(text, `job ${jobId}`);
    const excerptRef = write(`${root}/validation/${job.name}-${jobId}.txt`, text);
    retainedBytes += Buffer.byteLength(text);
    const generation = raw.match(/\[E-G0\.0-04\] isolated clean checkout [0-9a-f]{40} remained clean after two generation runs \((sha256:[0-9a-f]{64})\)/u)?.[1] ?? null;
    results.push({
      execution: {
        repository,
        workflow: run.name,
        workflowPath: run.path,
        event: run.event,
        runId: Number(runId),
        runAttempt: run.run_attempt,
        jobId: Number(jobId),
        job: job.name,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        headRevision,
        baseRevision,
        executedRevision,
        executedTree,
      },
      environment: environmentFrom(lines),
      exitState: 0,
      observedAssertions: [
        { id: 'test-totals', value: testTotals(kept.lines) },
        ...(generation ? [{ id: 'generation-identity', value: generation }] : []),
      ],
      rawLog: {
        bytes: Buffer.byteLength(raw),
        lines: lines.length,
        sha256: sha256(raw),
        retained: false,
        retention: logExpiry,
      },
      excerpt: { ...excerptRef, rawLines: [kept.start, kept.end], rule: `steps from "Run ${firstStep.trim()}" through the last step before post-job cleanup, sanitized` },
    });
  }
  results.sort((left, right) => left.execution.jobId - right.execution.jobId);

  const verification = write(`${root}/verification.json`, canonicalJson({
    schema: 'muxui-evidence-validation-v1',
    captureProcedure: `node ${captureTool} --capture-timestamp=${captureTimestamp}`,
    proofTool,
    results,
    sourceRevision,
    sourceTree,
  }));

  const validationLines = pullRequestValidation(pr.body);
  const pullRequestArtifact = canonicalJson({
    schema: 'muxui-evidence-pull-request-observation-v1',
    milestone,
    pullRequest: { repository, number: pr.number, title: pr.title, ...(issue ? { closesIssue: issue } : {}) },
    headRevision,
    baseRevision,
    sourceRevision,
    sourceTree,
    mergedAt: pr.mergedAt,
    body: { sha256: sha256(pr.body), bytes: Buffer.byteLength(pr.body) },
    // Author-reported local checks and review statements; hosted review
    // threads were empty, so these lines are observations, not proof.
    authorReportedValidation: validationLines,
    hostedReviews: 0,
  });
  assertDisclosable(pullRequestArtifact, `PR #${pullRequest}`);
  const artifact = write(`${root}/artifacts/pull-request-${pullRequest}.json`, pullRequestArtifact);
  retainedBytes += Buffer.byteLength(pullRequestArtifact);

  const records = [];
  for (let index = 1; index <= assertions; index += 1) {
    const assertionId = `E-${milestone}-${String(index).padStart(2, '0')}`;
    const deferred = DEFERRED_R1_EVIDENCE.find(({ id }) => id === assertionId);
    const record = canonicalJson({
      schema: 'muxui-evidence-record-v1',
      assertionId,
      milestone,
      evidenceKind: 'retained-ci-check-log-capture',
      // Decision 0022: the milestone is complete for the rc prerelease
      // boundary on its logged evidence; deferred halves stay unmet.
      outcome: deferred ? 'partial' : 'pass',
      basis: 'muxui:decision:0022 logged check evidence for the milestone pull request, captured before log expiry',
      ...(deferred ? { deferred: { id: deferred.id, part: deferred.part, status: deferred.status, deferredTo: deferred.deferredTo } } : {}),
      sourceRevision,
      sourceTree,
      executedRevision: results[0].execution.executedRevision,
      executedTree,
      proofTool,
      command: results.map(({ execution }) => `${execution.workflow} / ${execution.job} (run ${execution.runId}, attempt ${execution.runAttempt})`).join('; '),
      environment: results.find(({ execution }) => execution.workflow === 'Deterministic workspace checks')?.environment ?? results[0].environment,
      artifact,
      validation: verification,
      activeExceptionRefs: [],
      advisoryRefs: [],
      disclosureClass: 'public-sanitized',
      owner: 'ndrewtran',
      captureTimestamp,
      retentionPolicy: 'Content-addressed Git records retained in default-branch history; hosted logs, pull-request URLs, and Project items are mutable locators',
      expiry: 'Retained as historical R1 proof; a change to the milestone source, executed tree, or retained bytes requires new evidence rather than an edit',
    });
    records.push({ assertionId, ...write(`${root}/records/${assertionId}.json`, record) });
    retainedBytes += Buffer.byteLength(record);
  }

  write(`${root}/README.md`, `# ${milestone} retained CI evidence

Decision 0022 records ${milestone} as complete for the rc prerelease boundary on
its logged evidence. This root retains that evidence from pull request
#${pullRequest} before the hosted Actions logs expire: sanitized step excerpts
under \`validation/\`, raw-log digests and execution identity in
\`verification.json\`, the pull-request observation under \`artifacts/\`, and
one record per roadmap assertion under \`records/\`.

Deferred halves stay unmet (\`outcome: partial\`). This root makes no
assistive-technology, support, publication, or release claim. Recapture with
\`node ${captureTool}\` only while the hosted logs exist; retained bytes are
never edited.
`);
  write(`${root}/index.json`, canonicalJson({
    schema: 'muxui-evidence-index-v1',
    milestone,
    authority: 'muxui:decision:0022',
    sourceRevision,
    sourceTree,
    artifacts: [artifact],
    records,
    validation: verification,
    disclosureClass: 'public-sanitized',
    owner: 'ndrewtran',
    captureTimestamp,
    retentionPolicy: 'Content-addressed Git records retained in default-branch history; hosted logs expire and are not retained',
  }));
}

console.log(`[r1-capture] retained ${milestones.length} milestone roots; ${retainedBytes} bytes of excerpts, artifacts, and records`);

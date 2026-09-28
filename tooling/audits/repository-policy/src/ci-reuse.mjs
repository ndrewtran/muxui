// Pull-request CI reuse: a group that passed in an earlier run of the same PR
// is skipped when it would run the exact same commands and the changes since
// the commit it was tested on do not route to it. Any doubt means rerun.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const reuseArtifactName = 'ci-reuse-record';
export const reuseRecordFile = 'ci-reuse-record.json';
const earlierRunLimit = 5;
const commitPattern = /^[0-9a-f]{40}$/u;
const signaturePattern = /^[0-9a-f]{64}$/u;

// Changes that alter how groups run rather than what they check: the workflow,
// the planner/runner, dependencies, package scripts, and toolchain pins.
const blockedPrefixes = ['.github/', 'tooling/audits/repository-policy/'];
const blockedPaths = ['pnpm-workspace.yaml', '.node-version', '.npmrc'];
const blockedBasenames = ['package.json', 'pnpm-lock.yaml'];

export function reuseBlockedPath(path) {
  return blockedPrefixes.some((prefix) => path.startsWith(prefix))
    || blockedPaths.includes(path)
    || blockedBasenames.includes(path.split('/').at(-1));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

// Same signature means the group would run exactly the same commands.
export function groupSignature(commands) {
  const normalized = commands.map(({ command, args, env = {}, unsetEnv = [], prerequisite = false }) => ({
    command, args, env, unsetEnv, prerequisite,
  }));
  return createHash('sha256').update(JSON.stringify(canonical(normalized))).digest('hex');
}

export function reuseDisabledReason(environment, { full = false } = {}) {
  if (environment.GITHUB_EVENT_NAME !== 'pull_request') return 'not a pull_request run';
  if (full) return 'the plan is full-workspace';
  if (Number(environment.GITHUB_RUN_ATTEMPT ?? 1) > 1) return `run attempt ${environment.GITHUB_RUN_ATTEMPT} reruns every group`;
  if (environment.MUXUI_CI_REUSE === 'off') return 'MUXUI_CI_REUSE is off';
  const missing = ['GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_HEAD_REF', 'GITHUB_WORKFLOW_REF', 'MUXUI_PR_HEAD_REPO', 'MUXUI_PR_HEAD_SHA']
    .filter((key) => !environment[key]);
  if (missing.length > 0) return `missing GitHub context: ${missing.join(', ')}`;
  // Fork authors could forge earlier records and job results; same-repository
  // authors already have write access.
  if (environment.MUXUI_PR_HEAD_REPO !== environment.GITHUB_REPOSITORY) return 'fork pull request';
  if (!commitPattern.test(environment.MUXUI_PR_HEAD_SHA)) return 'invalid MUXUI_PR_HEAD_SHA';
  if (!workflowFile(environment)) return 'cannot read the workflow file from GITHUB_WORKFLOW_REF';
  return null;
}

function workflowFile(environment) {
  return environment.GITHUB_WORKFLOW_REF?.match(/\/\.github\/workflows\/([^/@]+)@/u)?.[1] ?? null;
}

export const reuseCommandTimeoutMs = 60_000;

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: reuseCommandTimeoutMs });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(' ')} exited ${result.status}: ${result.stderr.trim()}`);
  return result.stdout;
}

export function createGitHubClient({ repository, workflow, gh = runGh }) {
  return {
    listRuns(headBranch) {
      return JSON.parse(gh([
        'api', '-X', 'GET', `repos/${repository}/actions/workflows/${workflow}/runs`,
        '-f', 'event=pull_request', '-f', `branch=${headBranch}`, '-f', 'per_page=30',
      ])).workflow_runs;
    },
    runJobs(runId) {
      const { total_count: total, jobs } = JSON.parse(gh([
        'api', '-X', 'GET', `repos/${repository}/actions/runs/${runId}/jobs`, '-f', 'filter=latest', '-f', 'per_page=100',
      ]));
      if (!Array.isArray(jobs) || total > jobs.length) throw new Error(`unexpected jobs page (${jobs?.length} of ${total})`);
      return jobs;
    },
    downloadRecord(runId) {
      const directory = mkdtempSync(join(tmpdir(), 'ci-reuse-'));
      try {
        gh(['run', 'download', String(runId), '-R', repository, '-n', reuseArtifactName, '-D', directory]);
        return JSON.parse(readFileSync(join(directory, reuseRecordFile), 'utf8'));
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}

export function validRecord(record) {
  return record?.version === 1 && commitPattern.test(record.testedCommit ?? '') && commitPattern.test(record.headCommit ?? '')
    && Array.isArray(record.groups)
    && record.groups.every((group) => typeof group?.id === 'string'
      && signaturePattern.test(group.signature ?? '') && commitPattern.test(group.testedCommit ?? ''));
}

// Earlier runs of this workflow for the same PR head, newest first. A run whose
// jobs or record cannot be read stays in the list with `null` so it is skipped.
export function loadEarlierRuns({ client, environment, log = console.log }) {
  const currentRun = Number(environment.GITHUB_RUN_ID);
  const runs = client.listRuns(environment.GITHUB_HEAD_REF)
    .filter((run) => run.id !== currentRun && run.event === 'pull_request'
      && run.head_branch === environment.GITHUB_HEAD_REF
      && run.head_repository?.full_name === environment.MUXUI_PR_HEAD_REPO)
    .sort((left, right) => right.id - left.id)
    .slice(0, earlierRunLimit);
  return runs.map((run) => {
    const earlier = {
      runId: run.id, runNumber: run.run_number, url: run.html_url, headSha: run.head_sha, jobs: null, record: null,
    };
    try {
      earlier.jobs = client.runJobs(run.id);
    } catch (error) {
      log(`[ci-reuse] run #${run.run_number}: jobs unavailable (${error.message})`);
    }
    try {
      const record = client.downloadRecord(run.id);
      // The API's head SHA ties the record to the commit GitHub actually ran.
      if (!validRecord(record)) log(`[ci-reuse] run #${run.run_number}: reuse record is invalid`);
      else if (!commitPattern.test(run.head_sha ?? '') || record.headCommit !== run.head_sha) {
        log(`[ci-reuse] run #${run.run_number}: reuse record head ${record.headCommit} is not the run head ${run.head_sha}`);
      } else earlier.record = record;
    } catch (error) {
      log(`[ci-reuse] run #${run.run_number}: reuse record unavailable (${error.message})`);
    }
    return earlier;
  });
}

const intersects = (left, right) => left.some((value) => right.includes(value));

// Why the changes since the tested commit affect `group`, or null when they
// do not. `delta` is `{ changedPaths, full?, groupIds?, storyRuns?, storyTooling?, error? }`.
export function affectedReason(group, delta) {
  if (delta.error) return `delta plan failed: ${delta.error}`;
  if (delta.changedPaths.length === 0) return null;
  const blocked = delta.changedPaths.find(reuseBlockedPath);
  if (blocked) return `CI machinery changed: ${blocked}`;
  if (delta.full) return `changes need the full workspace: ${delta.full}`;
  if (!Array.isArray(delta.groupIds) || !Array.isArray(delta.storyRuns)) return 'changes have no group mapping';
  if (['checks', 'react', 'browser', 'tailwind'].includes(group.kind)) {
    // Package-level groups rerun for any change inside the packages (and their
    // dependencies) their commands operate on, not only what the planner routes.
    if (!Array.isArray(group.packageDirectories)) return `package set of ${group.id} is unknown`;
    const touched = delta.changedPaths.find((path) => group.packageDirectories.some((directory) => path.startsWith(`${directory}/`)));
    if (touched) return `changes touch ${touched}`;
    // Browser checks run React browser tests, which React test changes route to `react`.
    const ids = group.kind === 'browser' ? ['browser', 'react'] : [group.id];
    return intersects(ids, delta.groupIds) ? `changes route to ${ids.filter((id) => delta.groupIds.includes(id)).join(', ')}` : null;
  }
  if (group.kind !== 'storybook' || !group.storyRun) return `no reuse rule for group ${group.id}`;
  // Storybook groups trust the planner's family routing: the same routing that
  // selects a PR's Storybook scope, with main's full run as the backstop.
  if (delta.storyTooling) return 'Storybook tooling changed';
  const { proof, families } = group.storyRun;
  if (proof === 'chrome') return delta.storyRuns.some((run) => run.proof === 'chrome') ? 'changes need chrome proof' : null;
  // Empty families select every page.
  const hit = delta.storyRuns.find((run) => run.proof !== 'chrome'
    && (run.families.length === 0 || families.length === 0 || intersects(run.families, families)));
  return hit ? `changes need ${hit.proof} proof for ${hit.families.length ? hit.families.join(', ') : 'every family'}` : null;
}

const shortCommit = (commit) => commit.slice(0, 7);
// A job that never finished or never started proves nothing either way.
const inconclusive = new Set(['cancelled', 'skipped', null, undefined]);

// The newest earlier run with the same group and signature decides: success is
// a candidate, an unfinished job walks back, and any other result means rerun.
function earlierPass(group, earlierRuns) {
  let signatureChanged = false;
  for (const run of earlierRuns) {
    if (!run.jobs) return { reason: `jobs of run #${run.runNumber} are unreadable` };
    const jobs = run.jobs.filter(({ name }) => name === `run ${group.id}`);
    const failed = jobs.find(({ conclusion }) => conclusion !== 'success' && !inconclusive.has(conclusion));
    const entry = run.record?.groups.find(({ id }) => id === group.id);
    if (!entry || entry.signature !== group.signature) {
      if (entry) signatureChanged = true;
      // Without a record the run's signature is unknown, so a failure there counts.
      if (!run.record && failed) return { reason: `${failed.conclusion} in run #${run.runNumber}` };
      continue;
    }
    if (failed) return { reason: `${failed.conclusion} in run #${run.runNumber}` };
    if (jobs.length > 0 && jobs.every(({ conclusion }) => conclusion === 'success')) {
      return { pass: { run, testedCommit: entry.testedCommit } };
    }
  }
  return { reason: signatureChanged ? 'signature changed' : 'no earlier pass' };
}

function memoized(callback, fallback) {
  const results = new Map();
  return (key) => {
    if (!results.has(key)) results.set(key, Promise.resolve().then(() => callback(key)).catch(fallback));
    return results.get(key);
  };
}

// The decision core: pure apart from the injected `deltaFor(testedCommit)` and
// `headChangesFor(earlierHeadSha)` (paths changed between the earlier run's PR
// head and the current one), each called at most once per commit.
export async function decideReuse({ groups, earlierRuns, deltaFor, headChangesFor }) {
  const deltaAt = memoized(deltaFor, (error) => ({ changedPaths: [], error: error.message }));
  const headChangesAt = memoized(headChangesFor, (error) => ({ error: error.message }));
  const decisions = [];
  const rerun = (id, reason) => decisions.push({ id, reusedFrom: '', testedCommit: null, reason });
  for (const group of groups) {
    const { pass, reason } = earlierPass(group, earlierRuns);
    if (!pass) {
      rerun(group.id, reason);
      continue;
    }
    const { run, testedCommit } = pass;
    // The earlier run must have used the same workflow and planner.
    const headChanges = await headChangesAt(run.headSha);
    if (!Array.isArray(headChanges)) {
      rerun(group.id, `cannot compare with run #${run.runNumber}'s head: ${headChanges.error}`);
      continue;
    }
    const machinery = headChanges.find(reuseBlockedPath);
    if (machinery) {
      rerun(group.id, `CI machinery changed since run #${run.runNumber}'s head: ${machinery}`);
      continue;
    }
    const affected = affectedReason(group, await deltaAt(testedCommit));
    if (affected) {
      rerun(group.id, `affected since ${shortCommit(testedCommit)}: ${affected}`);
      continue;
    }
    decisions.push({
      id: group.id,
      reusedFrom: `run #${run.runNumber} (${run.url}) at ${shortCommit(testedCommit)}`,
      testedCommit,
      reason: `passed in run #${run.runNumber}; changes since ${shortCommit(testedCommit)} don't affect it`,
    });
  }
  return decisions;
}

export function reuseRecord({ head, headCommit, groups, decisions }) {
  return {
    version: 1,
    testedCommit: head,
    headCommit,
    groups: groups.map(({ id, signature }) => ({
      id, signature, testedCommit: decisions.find((decision) => decision.id === id)?.testedCommit ?? head,
    })),
  };
}

export function reuseSummary(decisions) {
  const cell = (value) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    '### Check groups',
    '',
    '| Group | Result | Reason |',
    '| --- | --- | --- |',
    ...decisions.map(({ id, reusedFrom, reason }) => `| ${cell(id)} | ${reusedFrom ? 'reused' : 'run'} | ${cell(reason)} |`),
    '',
  ].join('\n');
}

// Never throws: any failure means every group runs. `groups` carry their
// commands and `packageDirectories` (null when unknown).
export async function planReuse({
  groups, head, full = false, environment, deltaFor, headChangesFor, client = null, log = console.log,
}) {
  const runAll = (reason) => groups.map(({ id }) => ({ id, reusedFrom: '', testedCommit: null, reason }));
  let signed = [];
  let decisions;
  const disabled = reuseDisabledReason(environment, { full });
  try {
    signed = groups.map(({ id, kind, storyRun, packageDirectories, commands }) => ({
      id, kind, storyRun, packageDirectories, signature: groupSignature(commands),
    }));
    if (disabled) {
      log(`[ci-reuse] reuse off: ${disabled}`);
      decisions = runAll(`reuse off: ${disabled}`);
    } else {
      const earlierRuns = loadEarlierRuns({
        client: client ?? createGitHubClient({ repository: environment.GITHUB_REPOSITORY, workflow: workflowFile(environment) }),
        environment,
        log,
      });
      log(`[ci-reuse] earlier runs: ${earlierRuns.map(({ runNumber }) => `#${runNumber}`).join(', ') || '(none)'}`);
      decisions = await decideReuse({ groups: signed, earlierRuns, deltaFor, headChangesFor });
    }
  } catch (error) {
    log(`[ci-reuse] reuse lookup failed; running every group: ${error.message}`);
    decisions = runAll(`reuse lookup failed: ${error.message}`);
  }
  for (const { id, reusedFrom, reason } of decisions) log(`[ci-reuse] ${id}: ${reusedFrom ? 'reused' : 'run'} (${reason})`);
  const headCommit = environment.MUXUI_PR_HEAD_SHA;
  // A record needs every signature and the PR head it belongs to.
  const record = signed.length === groups.length && commitPattern.test(headCommit ?? '')
    ? reuseRecord({ head, headCommit, groups: signed, decisions })
    : null;
  return { decisions, record };
}

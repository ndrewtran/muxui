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
  const missing = ['GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_HEAD_REF', 'GITHUB_WORKFLOW_REF', 'MUXUI_PR_HEAD_REPO']
    .filter((key) => !environment[key]);
  if (missing.length > 0) return `missing GitHub context: ${missing.join(', ')}`;
  if (!workflowFile(environment)) return 'cannot read the workflow file from GITHUB_WORKFLOW_REF';
  return null;
}

function workflowFile(environment) {
  return environment.GITHUB_WORKFLOW_REF?.match(/\/\.github\/workflows\/([^/@]+)@/u)?.[1] ?? null;
}

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
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
  return record?.version === 1 && commitPattern.test(record.testedCommit ?? '') && Array.isArray(record.groups)
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
    const earlier = { runId: run.id, runNumber: run.run_number, url: run.html_url, jobs: null, record: null };
    try {
      earlier.jobs = client.runJobs(run.id);
    } catch (error) {
      log(`[ci-reuse] run #${run.run_number}: jobs unavailable (${error.message})`);
    }
    try {
      const record = client.downloadRecord(run.id);
      if (validRecord(record)) earlier.record = record;
      else log(`[ci-reuse] run #${run.run_number}: reuse record is invalid`);
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
  const routed = (ids) => (intersects(ids, delta.groupIds) ? `changes route to ${ids.filter((id) => delta.groupIds.includes(id)).join(', ')}` : null);
  if (['checks', 'react', 'tailwind'].includes(group.kind)) return routed([group.id]);
  // Browser checks run React browser tests, which React test changes route to `react`.
  if (group.kind === 'browser') return routed(['browser', 'react']);
  if (group.kind !== 'storybook' || !group.storyRun) return `no reuse rule for group ${group.id}`;
  if (delta.storyTooling) return 'Storybook tooling changed';
  const { proof, families } = group.storyRun;
  if (proof === 'chrome') return delta.storyRuns.some((run) => run.proof === 'chrome') ? 'changes need chrome proof' : null;
  // Empty families select every page.
  const hit = delta.storyRuns.find((run) => run.proof !== 'chrome'
    && (run.families.length === 0 || families.length === 0 || intersects(run.families, families)));
  return hit ? `changes need ${hit.proof} proof for ${hit.families.length ? hit.families.join(', ') : 'every family'}` : null;
}

const shortCommit = (commit) => commit.slice(0, 7);

// The decision core: pure apart from the injected `deltaFor(testedCommit)`,
// which is called at most once per tested commit.
export async function decideReuse({ groups, earlierRuns, deltaFor }) {
  const deltas = new Map();
  const deltaAt = (commit) => {
    if (!deltas.has(commit)) {
      deltas.set(commit, Promise.resolve().then(() => deltaFor(commit)).catch((error) => ({ changedPaths: [], error: error.message })));
    }
    return deltas.get(commit);
  };
  const decisions = [];
  for (const group of groups) {
    let pass = null;
    let signatureChanged = false;
    for (const run of earlierRuns) {
      const entry = run.record?.groups.find(({ id }) => id === group.id);
      const jobs = run.jobs?.filter(({ name }) => name === `run ${group.id}`) ?? [];
      if (!entry || jobs.length === 0 || jobs.some(({ conclusion }) => conclusion !== 'success')) continue;
      if (entry.signature !== group.signature) {
        signatureChanged = true;
        continue;
      }
      pass = { run, testedCommit: entry.testedCommit };
      break;
    }
    if (!pass) {
      decisions.push({ id: group.id, reusedFrom: '', testedCommit: null, reason: signatureChanged ? 'signature changed' : 'no earlier pass' });
      continue;
    }
    const affected = affectedReason(group, await deltaAt(pass.testedCommit));
    if (affected) {
      decisions.push({ id: group.id, reusedFrom: '', testedCommit: null, reason: `affected since ${shortCommit(pass.testedCommit)}: ${affected}` });
      continue;
    }
    decisions.push({
      id: group.id,
      reusedFrom: `run #${pass.run.runNumber} (${pass.run.url}) at ${shortCommit(pass.testedCommit)}`,
      testedCommit: pass.testedCommit,
      reason: `passed in run #${pass.run.runNumber}; changes since ${shortCommit(pass.testedCommit)} don't affect it`,
    });
  }
  return decisions;
}

export function reuseRecord({ head, groups, decisions }) {
  return {
    version: 1,
    testedCommit: head,
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

// Never throws: any failure means every group runs.
export async function planReuse({
  groups, head, full = false, environment, deltaFor, client = null, log = console.log,
}) {
  const signed = groups.map(({ id, kind, storyRun, commands }) => ({ id, kind, storyRun, signature: groupSignature(commands) }));
  const runAll = (reason) => signed.map(({ id }) => ({ id, reusedFrom: '', testedCommit: null, reason }));
  let decisions;
  const disabled = reuseDisabledReason(environment, { full });
  if (disabled) {
    log(`[ci-reuse] reuse off: ${disabled}`);
    decisions = runAll(`reuse off: ${disabled}`);
  } else {
    try {
      const earlierRuns = loadEarlierRuns({
        client: client ?? createGitHubClient({ repository: environment.GITHUB_REPOSITORY, workflow: workflowFile(environment) }),
        environment,
        log,
      });
      log(`[ci-reuse] earlier runs: ${earlierRuns.map(({ runNumber }) => `#${runNumber}`).join(', ') || '(none)'}`);
      decisions = await decideReuse({ groups: signed, earlierRuns, deltaFor });
    } catch (error) {
      log(`[ci-reuse] reuse lookup failed; running every group: ${error.message}`);
      decisions = runAll(`reuse lookup failed: ${error.message}`);
    }
  }
  for (const { id, reusedFrom, reason } of decisions) log(`[ci-reuse] ${id}: ${reusedFrom ? 'reused' : 'run'} (${reason})`);
  return { decisions, record: reuseRecord({ head, groups: signed, decisions }) };
}

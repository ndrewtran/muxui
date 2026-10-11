import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadPolicy, normalizePath } from './policy.mjs';
import { discoverWorkspacePackages } from './workspace-packages.mjs';
import { prerequisitesReadyVariable } from './prepare-prerequisites.mjs';
import {
  checkStages,
  generationArgs,
  inheritedFullStorybookSelection,
  loadReactFamilyRecords,
  parseTaskArguments,
  planScopedTask,
  storybookPackage,
} from './scoped-verification.mjs';

const repositoryRoot = resolve(
  process.env.MUXUI_TASK_REPOSITORY_ROOT ?? resolve(import.meta.dirname, '../../../..'),
);

function gitLines(args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    return { paths: [], error: result.error?.message ?? `git ${args.join(' ')} exited with ${result.status ?? 'unknown status'}` };
  }
  return {
    paths: result.stdout.split('\n').map((line) => normalizePath(line.trim())).filter(Boolean),
    error: null,
  };
}

const baseRef = process.env.MUXUI_BASE_REF || 'origin/main';

function collectChangedPaths() {
  const verified = gitLines(['rev-parse', '--verify', `${baseRef}^{commit}`]);
  if (verified.error) {
    throw new Error(`MUXUI_BASE_REF_UNAVAILABLE: ${baseRef} could not be resolved (${verified.error})`);
  }
  const commands = [
    ['diff', '--name-only', '--no-renames', `${baseRef}...HEAD`],
    ['diff', '--name-only', '--no-renames'],
    ['diff', '--cached', '--name-only', '--no-renames'],
    ['diff', '--name-only', 'HEAD'],
    ['ls-files', '--others', '--exclude-standard'],
  ];
  const paths = [];
  for (const command of commands) {
    const result = gitLines(command);
    if (result.error) throw new Error(`MUXUI_CHANGED_PATHS_UNAVAILABLE: ${result.error}`);
    paths.push(...result.paths);
  }
  return [...new Set(paths)].sort();
}

function packageNames(items) {
  return items.map(({ name }) => name).join(', ') || '(none)';
}

function commandText(command, args) {
  return [command, ...args].map((value) => (/\s/u.test(value) ? JSON.stringify(value) : value)).join(' ');
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, stdio: 'inherit', env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function environmentFor(plan, options) {
  const environment = { ...process.env };
  // Only this runner's own generation step may mark prerequisites ready.
  delete environment[prerequisitesReadyVariable];
  const familyKeys = [
    'MUXUI_COMPONENT_FAMILIES',
    'MUXUI_STORYBOOK_FAMILIES',
    'MUXUI_STORYBOOK_FAMILY_FILTER',
    'MUXUI_STORYBOOK_FAMILY',
  ];
  if (!plan.focusedComponent) {
    for (const key of familyKeys) delete environment[key];
  }
  if (plan.full) {
    if (options.task === 'check') {
      environment.MUXUI_STORYBOOK_AUDIT_EVENT = 'check:all';
      environment.MUXUI_STORYBOOK_AUDIT_FORCE = '1';
    }
  } else if (plan.focusedComponent) {
    environment.MUXUI_COMPONENT_FAMILIES = plan.familySelection.join(',');
    environment.MUXUI_COMPONENT_INCLUDE_SHARED_SOURCE ??= '1';
    environment.MUXUI_STORYBOOK_FAMILIES = plan.storybookFamilySelection.join(',');
    environment.MUXUI_STORYBOOK_AUDIT_EVENT = 'component';
    environment.MUXUI_STORYBOOK_AUDIT_FORCE = '0';
    environment.MUXUI_STORYBOOK_AUDIT_PROOF ??= 'component';
  }
  return environment;
}

const notice = (message) => console.log(`[workspace-task] notice: ${message}`);

// Storybook's lane runs the story selection CI plans for the paths this check
// covers instead of the full audit. Returns the commands to run, or undefined
// to keep the full audit; the cause is always printed, never silent.
async function storybookCommandsFor(plan, task) {
  if (task !== 'check' || plan.full || plan.focusedComponent) return undefined;
  if (plan.scope !== 'files' && plan.scope !== 'affected') return undefined;
  if (!plan.checkPackages.some(({ name }) => name === storybookPackage)) return undefined;
  if (inheritedFullStorybookSelection()) {
    notice('running the full Storybook audit: a forced-full Storybook event is active');
    return undefined;
  }
  let selection;
  try {
    // Loaded on demand: the planner imports its own heavy dependencies and
    // reads the pullRequestImpact policy, which only Storybook selection needs.
    const { planStorybookCommands } = await import('./ci-impact.mjs');
    selection = await planStorybookCommands({ changedPaths: plan.selectionPaths, baseRef });
  } catch (error) {
    selection = { full: true, reason: `the CI planner could not load (${error.message})` };
  }
  if (selection.full) {
    notice(`running the full Storybook audit: ${selection.reason}`);
    return undefined;
  }
  if (selection.commands.length === 0) {
    notice(`CI plans no Storybook proof for these paths against the merge base with ${baseRef} (an unchanged path plans nothing), so the Storybook audit is skipped`);
  } else {
    console.log(`[workspace-task] Storybook: CI's selection of ${selection.pages} pages in ${selection.commands.length} command(s)`);
  }
  return selection.commands;
}

function focusedCheckCommands(plan) {
  const commands = [];
  if (plan.checkPackages.some(({ name }) => name === '@muxui/react')) {
    commands.push({
      command: 'pnpm',
      args: ['--filter', '@muxui/react', 'run', 'check:component'],
      label: '@muxui/react component tests',
    });
  }
  if (plan.checkPackages.some(({ name }) => name === '@muxui/react-storybook')) {
    commands.push({
      command: 'pnpm',
      args: ['--filter', '@muxui/react-storybook', 'run', 'check:scoped'],
      label: '@muxui/react-storybook selected-family audits',
    });
  }
  return commands;
}

const options = parseTaskArguments(process.argv.slice(2));
const packages = await discoverWorkspacePackages(repositoryRoot);
if (packages.length === 0) {
  console.log(`No workspace packages own the ${options.task} task.`);
  process.exit(0);
}
const policy = await loadPolicy(repositoryRoot);
// The root manifest names the workspace root that affected checks must exclude.
const rootManifestPath = resolve(repositoryRoot, 'package.json');
const rootManifest = await readFile(rootManifestPath, 'utf8').then(JSON.parse).catch((error) => {
  throw new Error(`MUXUI_ROOT_MANIFEST_UNREADABLE: ${rootManifestPath} (${error.message})`);
});
const hasExplicitScope = options.components.length > 0 || options.packages.length > 0 || options.files.length > 0;
const changedPaths = options.affected && !hasExplicitScope ? collectChangedPaths() : [];
const familyRecords = options.components.length > 0 ? await loadReactFamilyRecords(repositoryRoot) : [];
const plan = planScopedTask({ options, packages, policy, familyRecords, changedPaths });

const planLabel = plan.full
  ? 'full graph'
  : plan.scope === 'affected'
    ? 'changed packages plus dependents'
    : `${plan.scope} scope`;
console.log(`[workspace-task] ${options.task}: ${planLabel}`);
console.log(`[workspace-task] reason: ${plan.reason}`);
if (changedPaths.length > 0) console.log(`[workspace-task] changed paths: ${changedPaths.join(', ')}`);
if (plan.storybookFamilySelection.length > 0) console.log(`[workspace-task] Storybook families: ${plan.storybookFamilySelection.join(', ')}`);
console.log(`[workspace-task] generation packages: ${packageNames(plan.generationPackages)}`);
console.log(`[workspace-task] check packages: ${packageNames(plan.checkPackages)}`);

const environment = environmentFor(plan, options);
const shouldGenerate = options.task === 'generate' || options.generate;
if (shouldGenerate) {
  const args = generationArgs(plan);
  console.log(`[workspace-task] generate command: ${commandText('pnpm', args)}`);
  if (!options.preview) {
    // The plan generates every prerequisite of its checks, so package scripts
    // skip their standalone prerequisite generation (prepare-prerequisites.mjs).
    environment[prerequisitesReadyVariable] = '1';
    const status = run('pnpm', args, environment);
    if (status !== 0) process.exit(status);
  }
}

if (options.task === 'generate') {
  if (options.preview) console.log('[workspace-task] preview complete; no commands executed');
  process.exit(0);
}

if (plan.focusedComponent) {
  const commands = focusedCheckCommands(plan);
  if (commands.length === 0) throw new Error('MUXUI_COMPONENT_CHECK_EMPTY: no focused component package checks are available');
  const failures = [];
  for (const { command, args, label } of commands) {
    console.log(`[workspace-task] ${label}: ${commandText(command, args)}`);
    if (options.preview) continue;
    const status = run(command, args, environment);
    if (status !== 0) failures.push({ label, status });
  }
  if (options.preview) console.log('[workspace-task] preview complete; no commands executed');
  for (const { label, status } of failures) console.error(`[workspace-task] failed (exit ${status}): ${label}`);
  process.exit(failures[0]?.status ?? 0);
}

function runConcurrently(command, args, env) {
  return new Promise((resolveStatus, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, stdio: 'inherit', env });
    child.on('error', reject);
    child.on('close', (status) => resolveStatus(status ?? 1));
  });
}

// Planned after generation: the selection reads the page index it produces.
const storybookCommands = await storybookCommandsFor(plan, options.task);
const stages = checkStages(plan, { task: options.task, workspaceRootName: rootManifest.name, storybookCommands });
stages.forEach((lanes, index) => {
  for (const { args, env } of lanes.flat()) {
    console.log(`[workspace-task] check stage ${index + 1}: ${commandText('pnpm', args)}`);
    if (env && Object.keys(env).length > 0) console.log(`[workspace-task] check stage ${index + 1} env: ${JSON.stringify(env)}`);
  }
});
if (options.preview) {
  console.log('[workspace-task] preview complete; no commands executed');
  process.exit(0);
}

// A step starts from the runner environment, clears what it unsets, then sets its own.
function stepEnvironment({ env = {}, unsetEnv = [] }) {
  const stepEnv = { ...environment };
  for (const key of unsetEnv) delete stepEnv[key];
  return Object.assign(stepEnv, env);
}

// Runs a lane's steps in order and reports every step, like --no-bail.
async function runLane(steps) {
  const laneStatuses = [];
  for (const step of steps) laneStatuses.push(await runConcurrently('pnpm', step.args, stepEnvironment(step)));
  return laneStatuses;
}

// Run every stage, even after a failure, then exit with the first failure.
const statuses = [];
for (const lanes of stages) {
  statuses.push(...(await Promise.all(lanes.map(runLane))).flat());
}
process.exit(statuses.find((status) => status !== 0) ?? 0);

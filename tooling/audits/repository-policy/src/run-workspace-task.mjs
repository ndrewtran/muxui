import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadPolicy, normalizePath } from './policy.mjs';
import { discoverWorkspacePackages } from './workspace-packages.mjs';
import {
  loadReactFamilyRecords,
  parseTaskArguments,
  planScopedTask,
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

function collectChangedPaths() {
  const base = process.env.MUXUI_BASE_REF || 'origin/main';
  const verified = gitLines(['rev-parse', '--verify', `${base}^{commit}`]);
  if (verified.error) {
    throw new Error(`MUXUI_BASE_REF_UNAVAILABLE: ${base} could not be resolved (${verified.error})`);
  }
  const commands = [
    ['diff', '--name-only', '--no-renames', `${base}...HEAD`],
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

function filterArguments(items, dependent) {
  return items.flatMap(({ name }) => ['--filter', dependent ? `...${name}` : name]);
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
      environment.MUXUI_STORYBOOK_AUDIT_MODE = 'full';
      environment.MUXUI_STORYBOOK_AUDIT_EVENT = 'check:all';
      environment.MUXUI_STORYBOOK_AUDIT_FORCE = '1';
      environment.MUXUI_STORYBOOK_AUDIT_REASON = 'full graph requires full Storybook coverage';
    }
  } else if (plan.focusedComponent) {
    const families = plan.familySelection.join(',');
    environment.MUXUI_COMPONENT_FAMILIES = families;
    environment.MUXUI_STORYBOOK_FAMILIES = families;
    environment.MUXUI_STORYBOOK_AUDIT_MODE = 'focused';
    environment.MUXUI_STORYBOOK_AUDIT_EVENT = 'component';
    environment.MUXUI_STORYBOOK_AUDIT_FORCE = '0';
    environment.MUXUI_STORYBOOK_AUDIT_REASON = `component scope selected ${families}`;
  }
  return environment;
}

function generationArgs(plan) {
  const args = ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present'];
  if (!plan.full) args.push(...filterArguments(plan.generationPackages, false));
  args.push('run', 'generate');
  return args;
}

function checkArgs(plan, options) {
  const args = ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present'];
  if (plan.scope === 'affected') args.push(...filterArguments(plan.directPackages, true));
  else if (!plan.full && !plan.focusedComponent) args.push(...filterArguments(plan.checkPackages, false));
  args.push('run', options.task);
  return args;
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
      args: ['--filter', '@muxui/react-storybook', 'run', 'check:component'],
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
if (plan.familySelection.length > 0) console.log(`[workspace-task] Storybook families: ${plan.familySelection.join(', ')}`);
console.log(`[workspace-task] generation packages: ${packageNames(plan.generationPackages)}`);
console.log(`[workspace-task] check packages: ${packageNames(plan.checkPackages)}`);

const environment = environmentFor(plan, options);
const shouldGenerate = options.task === 'generate' || options.generate;
if (shouldGenerate) {
  const args = generationArgs(plan);
  console.log(`[workspace-task] generate command: ${commandText('pnpm', args)}`);
  if (!options.preview) {
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
  for (const { command, args, label } of commands) {
    console.log(`[workspace-task] ${label}: ${commandText(command, args)}`);
    if (options.preview) continue;
    const status = run(command, args, environment);
    if (status !== 0) process.exit(status);
  }
  if (options.preview) console.log('[workspace-task] preview complete; no commands executed');
  process.exit(0);
}

const args = checkArgs(plan, options);
console.log(`[workspace-task] check command: ${commandText('pnpm', args)}`);
if (options.preview) {
  console.log('[workspace-task] preview complete; no commands executed');
  process.exit(0);
}
process.exit(run('pnpm', args, environment));

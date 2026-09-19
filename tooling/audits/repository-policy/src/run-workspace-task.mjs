import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadPolicy, normalizePath } from './policy.mjs';
import { discoverWorkspacePackages } from './workspace-packages.mjs';

const repositoryRoot = resolve(
  process.env.MUXUI_TASK_REPOSITORY_ROOT ?? resolve(import.meta.dirname, '../../../..'),
);
const task = process.argv[2];
const affected = process.argv.includes('--affected');

if (!task) {
  console.error('TASK_REQUIRED: pass a package-owned task name');
  process.exit(1);
}

function gitLines(args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout.split('\n').map((line) => normalizePath(line.trim())).filter(Boolean);
}

const packages = await discoverWorkspacePackages(repositoryRoot);
const policy = await loadPolicy(repositoryRoot);
let selected = packages;
let mode = 'all';

if (affected) {
  const base = process.env.MUXUI_BASE_REF || 'origin/main';
  const changed = new Set([
    ...gitLines(['diff', '--name-only', `${base}...HEAD`]),
    ...gitLines(['diff', '--name-only']),
    ...gitLines(['ls-files', '--others', '--exclude-standard']),
  ]);

  const isGlobal = [...changed].some((path) =>
    policy.globalTaskInputs.some((input) =>
      input.endsWith('/') ? path.startsWith(input) : path === input,
    ),
  );
  const directlyChanged = packages.filter(({ path }) =>
    [...changed].some((changedPath) => changedPath === path || changedPath.startsWith(`${path}/`)),
  );
  const unmapped = [...changed].some((path) =>
    !packages.some(({ path: packagePath }) =>
      path === packagePath || path.startsWith(`${packagePath}/`),
    ),
  );

  if (!isGlobal && !unmapped && directlyChanged.length > 0) {
    selected = directlyChanged;
    mode = 'affected';
  }
}

if (packages.length === 0) {
  console.log(`No workspace packages own the ${task} task.`);
  process.exit(0);
}

const args = ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present'];
if (mode === 'affected') {
  for (const item of selected) {
    args.push('--filter', `...${item.name}`);
  }
}
args.push('run', task);

console.log(
  `[workspace-task] ${task}: ${mode === 'all' ? 'full graph' : 'changed packages plus dependents'}`,
);
// check:all (and release:prepare through check:all) invokes this runner without
// --affected. An affected run can still need the full workspace graph while
// retaining the PR selector's skip-heavy decision for the selected packages.
const childEnvironment = task === 'check' && !affected
  ? {
      ...process.env,
      MUXUI_STORYBOOK_AUDIT_MODE: 'full',
      MUXUI_STORYBOOK_AUDIT_EVENT: 'check:all',
      MUXUI_STORYBOOK_AUDIT_FORCE: '1',
      MUXUI_STORYBOOK_AUDIT_REASON: 'check:all requires full Storybook coverage',
    }
  : process.env;
const result = spawnSync('pnpm', args, { cwd: repositoryRoot, stdio: 'inherit', env: childEnvironment });
if (result.error) throw result.error;
process.exit(result.status ?? 1);

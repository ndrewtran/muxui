import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadPolicy } from '../src/policy.mjs';
import { discoverWorkspacePackages } from '../src/workspace-packages.mjs';
import {
  changedPackageSelection,
  checkStages,
  dependencyClosure,
  generationArgs,
  parseTaskArguments,
  planScopedTask,
  resolveComponents,
} from '../src/scoped-verification.mjs';

const packages = [
  { name: '@muxui/schema', path: 'packages/schema', manifest: { dependencies: {} } },
  { name: '@muxui/react', path: 'packages/react', manifest: { dependencies: { '@muxui/schema': 'workspace:*' } } },
  { name: '@muxui/react-storybook', path: 'apps/react-storybook', manifest: { dependencies: { '@muxui/react': 'workspace:*' } } },
  { name: '@muxui/docs', path: 'apps/docs', manifest: { dependencies: { '@muxui/react': 'workspace:*' } } },
  { name: '@muxui/repository-policy', path: 'tooling/audits/repository-policy', manifest: { dependencies: { '@muxui/schema': 'workspace:*' } } },
];
const policy = {
  globalTaskInputs: ['package.json', 'pnpm-lock.yaml'],
  affectedPathOwners: {
    strategy: ['@muxui/repository-policy'],
    'decisions/': ['@muxui/repository-policy'],
    'packages/': ['@muxui/repository-policy'],
    'tooling/': ['@muxui/repository-policy'],
  },
};
const records = [
  { family: 'DatePicker', slug: 'date-picker', source: 'packages/react/src/fields.ts' },
  { family: 'Calendar', slug: 'calendar', source: 'packages/react/src/collections.mjs' },
  { family: 'DateField', slug: 'date-field', source: 'packages/react/src/fields.ts' },
  { family: 'DateRangePicker', slug: 'date-range-picker', source: 'packages/react/src/fields.ts' },
  { family: 'RangeCalendar', slug: 'range-calendar', source: 'packages/react/src/collections.mjs' },
  { family: 'Button', slug: 'button', source: 'packages/react/src/button.mjs' },
  { family: 'Modal', export: 'Dialog', slug: 'dialog', source: 'packages/react/src/overlays.ts' },
];

test('task arguments accept repeatable selectors and reject empty or mixed scopes', () => {
  assert.deepEqual(parseTaskArguments(['check', '--component', 'date-picker', '--component=calendar', '--preview']), {
    task: 'check', affected: false, full: false, generate: false, preview: true,
    components: ['date-picker', 'calendar'], packages: [], files: [],
  });
  assert.throws(() => parseTaskArguments(['check', '--component=']), /MUXUI_TASK_OPTION_VALUE_REQUIRED/u);
  assert.throws(() => planScopedTask({
    options: parseTaskArguments(['check', '--component', 'button', '--package', '@muxui/react']),
    packages, policy, familyRecords: records,
  }), /MUXUI_TASK_SCOPE_CONFLICT/u);
  assert.throws(() => planScopedTask({
    options: parseTaskArguments(['check', '--full', '--component', 'button']),
    packages, policy, familyRecords: records,
  }), /MUXUI_TASK_SCOPE_CONFLICT/u);
});

test('component scope selects the named family and keeps generation prerequisites bounded', () => {
  const plan = planScopedTask({
    options: parseTaskArguments(['check', '--component', 'date-picker']),
    packages,
    policy,
    familyRecords: records,
  });
  assert.equal(plan.scope, 'component');
  assert.deepEqual(plan.familySelection, ['DatePicker']);
  assert.deepEqual(plan.storybookFamilySelection, plan.familySelection);
  assert.deepEqual(plan.checkPackages.map(({ name }) => name).sort(), ['@muxui/react', '@muxui/react-storybook']);
  assert.deepEqual(plan.generationPackages.map(({ name }) => name), ['@muxui/schema', '@muxui/react', '@muxui/react-storybook']);
});

test('component aliases retain substrate families while Storybook selects public exports', () => {
  const plan = planScopedTask({
    options: parseTaskArguments(['check', '--component', 'dialog,Dialog,Modal,muxui:component:dialog#web.react,button']),
    packages,
    policy,
    familyRecords: records,
  });
  assert.deepEqual(plan.familySelection, ['Button', 'Modal']);
  assert.deepEqual(plan.storybookFamilySelection, ['Button', 'Dialog']);
});

test('package and file scopes include dependents while generation includes their prerequisite closure', () => {
  const packagePlan = planScopedTask({
    options: parseTaskArguments(['check', '--package', '@muxui/react']),
    packages,
    policy,
  });
  assert.deepEqual(packagePlan.checkPackages.map(({ name }) => name).sort(), ['@muxui/docs', '@muxui/react', '@muxui/react-storybook']);
  assert.deepEqual(packagePlan.generationPackages.map(({ name }) => name), ['@muxui/schema', '@muxui/react', '@muxui/react-storybook', '@muxui/docs']);

  const filePlan = planScopedTask({
    options: parseTaskArguments(['check', '--files', 'packages/react/src/styles/fields.css']),
    packages,
    policy,
  });
  assert.deepEqual(filePlan.checkPackages.map(({ name }) => name).sort(), ['@muxui/docs', '@muxui/react', '@muxui/react-storybook']);
  assert.throws(() => planScopedTask({
    options: parseTaskArguments(['check', '--files', 'unknown/file.css']),
    packages,
    policy,
  }), /MUXUI_FILE_SCOPE_UNMAPPED/u);
  assert.throws(() => planScopedTask({
    options: parseTaskArguments(['check', '--files', 'packages/react/src/styles/fields.css,unknown/file.css']),
    packages,
    policy,
  }), /MUXUI_FILE_SCOPE_UNMAPPED/u);
  assert.equal(dependencyClosure(packages, ['@muxui/react']).map(({ name }) => name).includes('@muxui/schema'), true);
});

test('affected selection maps owner roots, keeps package changes proportional, and fails unmapped paths', () => {
  const selection = changedPackageSelection({ changedPaths: ['packages/react/src/fields.ts', 'strategy/milestone-roadmap.md'], packages, policy });
  assert.equal(selection.mode, 'affected');
  assert.deepEqual(selection.directPackages.map(({ name }) => name).sort(), ['@muxui/react', '@muxui/repository-policy']);
  const navigationSelection = changedPackageSelection({ changedPaths: ['packages/AGENTS.md', 'tooling/AGENTS.md'], packages, policy });
  assert.equal(navigationSelection.mode, 'affected');
  assert.deepEqual(navigationSelection.directPackages.map(({ name }) => name), ['@muxui/repository-policy']);
  assert.throws(() => changedPackageSelection({ changedPaths: ['unknown/file.txt'], packages, policy }), /MUXUI_AFFECTED_PATH_UNMAPPED/u);
  assert.throws(() => changedPackageSelection({ changedPaths: [], packages, policy }), /MUXUI_AFFECTED_PATHS_EMPTY/u);
  assert.throws(() => changedPackageSelection({ changedPaths: ['package.json', 'unknown/file.txt'], packages, policy }), /MUXUI_AFFECTED_PATH_UNMAPPED/u);
  assert.equal(changedPackageSelection({ changedPaths: ['package.json'], packages, policy }).mode, 'full');
});

test('component resolution fails clearly for unknown IDs', () => {
  assert.deepEqual(resolveComponents(['date-picker'], records).map(({ family }) => family), ['DatePicker']);
  assert.throws(() => resolveComponents(['does-not-exist'], records), /MUXUI_COMPONENT_UNKNOWN/u);
});

// A step is a pnpm argument list; lanes run their steps in order.
const step = (...args) => ({ args });

test('affected check args exclude the workspace root that dependent filters would select', () => {
  const plan = planScopedTask({
    options: parseTaskArguments(['check', '--affected']),
    packages,
    policy,
    changedPaths: ['packages/schema/src/index.mjs'],
  });
  assert.deepEqual(checkStages(plan, { task: 'check', workspaceRootName: '@muxui/workspace' }), [
    [[step('--recursive', '--sort', '--workspace-concurrency=1', '--if-present', '--no-bail', '--filter', '@muxui/react', 'run', 'check')]],
    [
      [step('--stream', '--recursive', '--sort', '--workspace-concurrency=1', '--if-present', '--no-bail', '--filter', '@muxui/react-storybook', 'run', 'check')],
      [step(
        '--stream', '--recursive', '--sort', '--workspace-concurrency=2', '--if-present', '--no-bail',
        '--filter', '...@muxui/schema', '--filter', '!@muxui/react', '--filter', '!@muxui/react-storybook',
        '--filter', '!@muxui/workspace', 'run', 'check',
      )],
    ],
  ]);
});

test('scoped check stages isolate React and run Storybook beside the remaining checks', () => {
  const plan = planScopedTask({
    options: parseTaskArguments(['check', '--package', '@muxui/schema']),
    packages,
    policy,
  });
  assert.deepEqual(checkStages(plan, { task: 'check', workspaceRootName: '@muxui/workspace' }), [
    [[step('--recursive', '--sort', '--workspace-concurrency=1', '--if-present', '--no-bail', '--filter', '@muxui/react', 'run', 'check')]],
    [
      [step('--stream', '--recursive', '--sort', '--workspace-concurrency=1', '--if-present', '--no-bail', '--filter', '@muxui/react-storybook', 'run', 'check')],
      [step(
        '--stream', '--recursive', '--sort', '--workspace-concurrency=2', '--if-present', '--no-bail',
        '--filter', '@muxui/schema', '--filter', '@muxui/docs', '--filter', '@muxui/repository-policy', 'run', 'check',
      )],
    ],
  ]);
  const only = (name) => ({ ...plan, checkPackages: packages.filter((item) => item.name === name) });
  assert.deepEqual(checkStages(only('@muxui/react'), { task: 'check' }).map((stage) => stage.length), [1]);
  assert.deepEqual(checkStages(only('@muxui/react-storybook'), { task: 'check' }), [
    [[step('--recursive', '--sort', '--workspace-concurrency=1', '--if-present', '--no-bail', '--filter', '@muxui/react-storybook', 'run', 'check')]],
  ]);
});

test('full checks separate Storybook after React without changing the command multiset or generation order', () => {
  const plan = planScopedTask({
    options: parseTaskArguments(['check', '--full']), packages, policy,
  });
  const react = [step('--recursive', '--sort', '--workspace-concurrency=1', '--if-present', '--no-bail', '--filter', '@muxui/react', 'run', 'check')];
  const storybook = [step('--stream', '--recursive', '--sort', '--workspace-concurrency=1', '--if-present', '--no-bail', '--filter', '@muxui/react-storybook', 'run', 'check')];
  const remaining = [step(
    '--stream', '--recursive', '--sort', '--workspace-concurrency=2', '--if-present', '--no-bail',
    '--filter', '!@muxui/react', '--filter', '!@muxui/react-storybook', '--filter', '!@muxui/workspace', 'run', 'check',
  )];
  const stages = checkStages(plan, { task: 'check', workspaceRootName: '@muxui/workspace' });
  assert.deepEqual(stages, [[react], [storybook], [remaining]]);
  // The old plan ran these same commands with the last two lanes together.
  const previousStages = [[react], [storybook, remaining]];
  const commands = (value) => value.flat(2).map((command) => JSON.stringify(command)).sort();
  assert.deepEqual(commands(stages), commands(previousStages));
  assert.deepEqual(plan.generationPackages, packages);
  assert.deepEqual(generationArgs(plan), ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present', 'run', 'generate']);
});

test('repository policy routes navigation and CI paths to the policy check with React generation', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../../..');
  const [realPolicy, realPackages] = await Promise.all([
    loadPolicy(repositoryRoot),
    discoverWorkspacePackages(repositoryRoot),
  ]);
  const reactClosure = dependencyClosure(realPackages, ['@muxui/react']).map(({ name }) => name);
  const policyPaths = [
    'README.md', 'ARCHITECTURE.md', 'LICENSE', '.gitignore', 'docs/releasing.md',
    'AGENTS.md', '.github/workflows/ci.yml',
    'tests/fixtures/g0.4/corpus.json',
  ];
  for (const path of policyPaths) {
    const plan = planScopedTask({
      options: parseTaskArguments(['check', '--affected']),
      packages: realPackages,
      policy: realPolicy,
      changedPaths: [path],
    });
    assert.equal(plan.scope, 'affected', path);
    assert.deepEqual(plan.checkPackages.map(({ name }) => name), ['@muxui/repository-policy'], path);
    const generation = plan.generationPackages.map(({ name }) => name);
    for (const name of reactClosure) assert.ok(generation.includes(name), `${path} generates ${name}`);
  }
  for (const path of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.node-version']) {
    assert.equal(changedPackageSelection({ changedPaths: [path], packages: realPackages, policy: realPolicy }).mode, 'full', path);
  }
});

test('shared app source selects its declared consumers without a workspace dependency', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../../..');
  const [realPolicy, realPackages] = await Promise.all([
    loadPolicy(repositoryRoot),
    discoverWorkspacePackages(repositoryRoot),
  ]);
  const selected = (path) => planScopedTask({
    options: parseTaskArguments(['check', '--files', path]),
    packages: realPackages,
    policy: realPolicy,
  }).checkPackages.map(({ name }) => name).sort();
  assert.deepEqual(selected('apps/scale/src/App.jsx'), ['@muxui/docs', '@muxui/scale']);
  assert.deepEqual(selected('apps/scale/test/browser/docs-theme.test.mjs'), ['@muxui/scale']);
  assert.deepEqual(selected('apps/docs/src/pages/scale.astro'), ['@muxui/docs']);
  assert.deepEqual(selected('apps/component-navigation.mjs'), ['@muxui/docs', '@muxui/react-storybook']);
  assert.deepEqual(selected('apps/component-reference.mjs'), ['@muxui/docs', '@muxui/react-storybook']);
  assert.deepEqual(selected('apps/guide-links.mjs'), ['@muxui/docs', '@muxui/react-storybook']);
  // React generation reads catalog/ although the catalog depends on React (Decision 0031),
  // and React output reaches the catalog through that devDependency.
  const catalogInput = selected('catalog/components/button/artifact.json');
  assert.ok(catalogInput.includes('@muxui/catalog') && catalogInput.includes('@muxui/react'), catalogInput.join(', '));
  assert.ok(selected('packages/react/src/button.ts').includes('@muxui/catalog'));
});

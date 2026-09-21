import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changedPackageSelection,
  dependencyClosure,
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
  },
};
const records = [
  { family: 'DatePicker', slug: 'date-picker', source: 'packages/react/src/fields.mjs' },
  { family: 'Calendar', slug: 'calendar', source: 'packages/react/src/collections.mjs' },
  { family: 'DateField', slug: 'date-field', source: 'packages/react/src/fields.mjs' },
  { family: 'DateRangePicker', slug: 'date-range-picker', source: 'packages/react/src/fields.mjs' },
  { family: 'RangeCalendar', slug: 'range-calendar', source: 'packages/react/src/collections.mjs' },
  { family: 'Button', slug: 'button', source: 'packages/react/src/button.mjs' },
  { family: 'Modal', export: 'Dialog', slug: 'dialog', source: 'packages/react/src/overlays.mjs' },
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

test('scoped selectors reject inherited forced-full Storybook events', () => {
  const previousEvent = process.env.MUXUI_STORYBOOK_AUDIT_EVENT;
  const previousForce = process.env.MUXUI_STORYBOOK_AUDIT_FORCE;
  try {
    process.env.MUXUI_STORYBOOK_AUDIT_EVENT = 'release';
    delete process.env.MUXUI_STORYBOOK_AUDIT_FORCE;
    assert.throws(() => planScopedTask({
      options: parseTaskArguments(['check', '--component', 'button']),
      packages,
      policy,
      familyRecords: records,
    }), /forced-full Storybook event/u);

    delete process.env.MUXUI_STORYBOOK_AUDIT_EVENT;
    process.env.MUXUI_STORYBOOK_AUDIT_FORCE = '1';
    assert.throws(() => planScopedTask({
      options: parseTaskArguments(['check', '--package', '@muxui/react']),
      packages,
      policy,
    }), /forced-full Storybook event/u);
  } finally {
    if (previousEvent === undefined) delete process.env.MUXUI_STORYBOOK_AUDIT_EVENT;
    else process.env.MUXUI_STORYBOOK_AUDIT_EVENT = previousEvent;
    if (previousForce === undefined) delete process.env.MUXUI_STORYBOOK_AUDIT_FORCE;
    else process.env.MUXUI_STORYBOOK_AUDIT_FORCE = previousForce;
  }
});

test('component scope expands the canonical date family group and keeps generation prerequisites bounded', () => {
  const plan = planScopedTask({
    options: parseTaskArguments(['check', '--component', 'date-picker']),
    packages,
    policy,
    familyRecords: records,
  });
  assert.equal(plan.scope, 'component');
  assert.deepEqual(plan.familySelection, ['Calendar', 'DateField', 'DatePicker', 'DateRangePicker', 'RangeCalendar']);
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
  const selection = changedPackageSelection({ changedPaths: ['packages/react/src/fields.mjs', 'strategy/milestone-roadmap.md'], packages, policy });
  assert.equal(selection.mode, 'affected');
  assert.deepEqual(selection.directPackages.map(({ name }) => name).sort(), ['@muxui/react', '@muxui/repository-policy']);
  assert.throws(() => changedPackageSelection({ changedPaths: ['unknown/file.txt'], packages, policy }), /MUXUI_AFFECTED_PATH_UNMAPPED/u);
  assert.throws(() => changedPackageSelection({ changedPaths: [], packages, policy }), /MUXUI_AFFECTED_PATHS_EMPTY/u);
  assert.throws(() => changedPackageSelection({ changedPaths: ['package.json', 'unknown/file.txt'], packages, policy }), /MUXUI_AFFECTED_PATH_UNMAPPED/u);
  assert.equal(changedPackageSelection({ changedPaths: ['package.json'], packages, policy }).mode, 'full');
});

test('component resolution fails clearly for unknown IDs', () => {
  assert.deepEqual(resolveComponents(['date-picker'], records).map(({ family }) => family), ['DatePicker']);
  assert.throws(() => resolveComponents(['does-not-exist'], records), /MUXUI_COMPONENT_UNKNOWN/u);
});

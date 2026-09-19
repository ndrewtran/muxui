import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadPolicy } from '../src/policy.mjs';
import {
  collectChangedPaths,
  selectStorybookAudits,
  storybookDependencyPaths,
} from '../src/storybook-audit-selection.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const policy = await loadPolicy(repositoryRoot);
const packages = [
  { name: '@muxui/react-storybook', path: 'apps/react-storybook', manifest: { dependencies: { '@muxui/react': 'workspace:*' } } },
  { name: '@muxui/react', path: 'packages/react', manifest: { dependencies: { '@muxui/catalog': 'workspace:*' }, devDependencies: { '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' } } },
  { name: '@muxui/catalog', path: 'packages/catalog', manifest: { dependencies: { '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' } } },
  { name: '@muxui/schema', path: 'packages/schema', manifest: { dependencies: {} } },
  { name: '@muxui/tokens', path: 'packages/tokens', manifest: { dependencies: { '@muxui/schema': 'workspace:*' } } },
];

function choose(changedPaths, options = {}) {
  return selectStorybookAudits({
    changedPaths,
    packages,
    policy,
    ...options,
  });
}

test('dependency closure is derived from workspace manifests', () => {
  assert.deepEqual(
    storybookDependencyPaths(packages, '@muxui/react-storybook'),
    ['apps/react-storybook', 'packages/catalog', 'packages/react', 'packages/schema', 'packages/tokens'],
  );
});

test('unrelated documentation and independent app changes skip only heavy audits', () => {
  const selection = choose(['apps/docs/src/pages/foundations/index.astro', 'apps/scale/src/App.jsx']);
  assert.equal(selection.mode, 'skip-heavy');
  assert.equal(selection.full, false);
  assert.deepEqual(selection.heavyAudits, []);
  assert.match(selection.reason, /safe unrelated inputs/u);
});

test('React, token, schema, catalog, and canonical example changes run both heavy audits', () => {
  for (const path of [
    'packages/react/src/button.mjs',
    'packages/tokens/src/authoring.mjs',
    'packages/schema/schemas/token-source.schema.json',
    'catalog/components/button/artifact.json',
    'catalog/tokens/default-theme.json',
    'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json',
    'catalog/components/icon-button/examples/react/basic.tsx',
    'catalog/components/link/examples/react/icon-composition.tsx',
    'catalog/components/number-field/examples/react/sizing.tsx',
  ]) {
    const selection = choose([path]);
    assert.equal(selection.mode, 'full', path);
    assert.deepEqual(selection.heavyAudits, ['a11y-families', 'manager-colours'], path);
  }
});

test('lockfiles, toolchain, policy, CI, mixed, and unknown inputs fail closed to full', () => {
  for (const paths of [
    ['pnpm-lock.yaml'],
    ['.node-version'],
    ['tooling/audits/repository-policy/repository-policy.json'],
    ['.github/workflows/ci.yml'],
    ['apps/docs/src/pages/index.astro', 'packages/react/src/button.mjs'],
    ['scripts/new-unknown-input.txt'],
  ]) {
    const selection = choose(paths);
    assert.equal(selection.mode, 'full', paths.join(', '));
    assert.equal(selection.full, true, paths.join(', '));
  }
});

test('manual, scheduled, force, and check:all paths always run full coverage', () => {
  for (const event of ['workflow_dispatch', 'schedule', 'check:all', 'release']) {
    const selection = choose(['apps/docs/src/pages/index.astro'], { event });
    assert.equal(selection.mode, 'full', event);
    assert.match(selection.reason, new RegExp(event, 'u'));
  }
  assert.equal(choose(['apps/docs/src/pages/index.astro'], { force: true }).mode, 'full');
});

test('unavailable diff selects full coverage and preserves the diagnostic reason', () => {
  const selection = choose([], { diffAvailable: false, diffReason: 'base ref is unavailable' });
  assert.equal(selection.mode, 'full');
  assert.equal(selection.full, true);
  assert.match(selection.reason, /base ref is unavailable/u);
});

test('changed path collection uses NUL-delimited no-rename diffs and includes local edits', () => {
  const calls = [];
  const outputs = new Map([
    ['rev-parse', Buffer.from('abc\n')],
    ['diff --name-only -z --no-renames origin/main...HEAD', Buffer.from('old-name.ts\0deleted.ts\0')],
    ['diff --name-only -z --no-renames', Buffer.from('unstaged.ts\0')],
    ['diff --cached --name-only -z --no-renames', Buffer.from('staged.ts\0')],
    ['ls-files --others --exclude-standard -z', Buffer.from('new file.ts\0')],
  ]);
  const result = collectChangedPaths({
    repositoryRoot,
    baseRef: 'origin/main',
    runGitCommand: (_root, args) => {
      const key = args.join(' ');
      calls.push(key);
      if (args[0] === 'rev-parse') return { ok: true, bytes: outputs.get('rev-parse') };
      return { ok: true, bytes: outputs.get(key) };
    },
  });
  assert.equal(result.available, true);
  assert.deepEqual(result.paths, ['deleted.ts', 'new file.ts', 'old-name.ts', 'staged.ts', 'unstaged.ts']);
  assert.ok(calls.some((call) => call.includes('--no-renames')));
});

test('base ref or any diff command failure fails closed', () => {
  const unavailable = collectChangedPaths({
    repositoryRoot,
    baseRef: 'origin/missing',
    runGitCommand: () => ({ ok: false, bytes: Buffer.alloc(0), reason: 'missing ref' }),
  });
  assert.deepEqual(unavailable, { available: false, paths: [], reason: 'base ref origin/missing is unavailable' });

  const failedDiff = collectChangedPaths({
    repositoryRoot,
    baseRef: 'origin/main',
    runGitCommand: (_root, args) => args[0] === 'rev-parse'
      ? { ok: true, bytes: Buffer.from('abc\n') }
      : { ok: false, bytes: Buffer.alloc(0), reason: 'diff failed' },
  });
  assert.equal(failedDiff.available, false);
  assert.match(failedDiff.reason, /diff failed/u);
});

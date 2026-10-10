import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { reactCompatibility } from '../generated/index.mjs';
import { exactLockedProblems, readLockfile } from './support/locked-dependencies.mjs';

const packageRoot = resolve(import.meta.dirname, '..');

test('package has an exact standalone React Aria substrate identity', async () => {
  assert.equal(reactCompatibility.package, '@muxui/react');
  assert.equal(reactCompatibility.upstream.package, 'react-aria-components');
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.private, true);
  // The declared upstream identity is the exact, locked dependency.
  assert.equal(reactCompatibility.upstream.version, manifest.dependencies['react-aria-components']);
  const substrate = { dependencies: { 'react-aria-components': manifest.dependencies['react-aria-components'] } };
  assert.deepEqual(exactLockedProblems(await readLockfile(), 'packages/react', substrate), []);
  assert.equal(manifest.dependencies['@muxui/web'], undefined);
});

test('direct publication fails closed while the package is private', () => {
  const result = spawnSync(process.execPath, ['src/publish-guard.mjs'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MUXUI_REACT_R15_PUBLISH_FORBIDDEN/u);
});

test('generated public types do not expose substrate APIs', async () => {
  const types = await readFile(resolve(packageRoot, 'generated/index.d.ts'), 'utf8');
  assert.doesNotMatch(types, /react-aria-components|react-stately|@internationalized\/date|isPending|isDisabled|isSelected|isExpanded|onPress/u);
  assert.match(types, /export (?:interface|type) ButtonProps/u);
  assert.match(types, /export (?:interface|type) DialogProps/u);
});

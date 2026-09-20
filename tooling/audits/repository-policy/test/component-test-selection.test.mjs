import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { selectComponentTestFiles } from '../src/component-test-selection.mjs';

const packageRoot = resolve(import.meta.dirname, '../../../../packages/react');

async function testFiles(root, prefix = '') {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await testFiles(root, `${relative}/`));
    else if (entry.name.endsWith('.test.mjs')) files.push(relative);
  }
  return files;
}

const contract = JSON.parse(
  (await readFile(resolve(packageRoot, 'generated/r1-6-contract.json'), 'utf8'))
    .split('\n')
    .filter((line) => !line.startsWith('// @generated-'))
    .join('\n'),
);
const records = contract.components;
const availableFiles = (await testFiles(resolve(packageRoot, 'test'))).map((file) => `test/${file}`);
const componentCheck = resolve(import.meta.dirname, '../src/run-component-check.mjs');

test('every generated React family resolves to an existing behavioral test group', () => {
  const selected = selectComponentTestFiles(records, availableFiles);
  assert.ok(selected.includes('test/fixture.test.mjs'));
  assert.ok(selected.includes('test/heavy-components.test.mjs'));
  assert.ok(selected.includes('test/style-scopes.test.mjs'));
});

test('component routing fails when a mapped behavioral test file is unavailable', () => {
  assert.throws(
    () => selectComponentTestFiles([records.find(({ family }) => family === 'Button')], availableFiles.filter((file) => file !== 'test/fixture.test.mjs')),
    /MUXUI_COMPONENT_TEST_ROUTE_FILE_MISSING/u,
  );
});

test('React component runner rejects empty and unknown family entries', () => {
  for (const families of ['DatePicker,', 'DatePicker,NotAComponent']) {
    const result = spawnSync(process.execPath, [componentCheck], {
      cwd: packageRoot,
      encoding: 'utf8',
      env: { ...process.env, MUXUI_COMPONENT_FAMILIES: families },
    });
    assert.notEqual(result.status, 0, families);
    assert.match(`${result.stdout}\n${result.stderr}`, /MUXUI_COMPONENT_(FAMILIES_REQUIRED|TEST_METADATA_UNKNOWN)/u);
  }
});

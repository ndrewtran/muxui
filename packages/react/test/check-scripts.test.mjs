// The package scripts that run the test files: `check` runs every top-level test file, and `check:types` and `check:rest` split the same
// files between them. A file that is renamed, added, or mistyped in the exclusion list must not drop out of the proof or run twice.
import assert from 'node:assert/strict';
import { globSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const packageRoot = resolve(import.meta.dirname, '..');
const { scripts } = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const commands = (script) => script.split(' && ');
const isTestRun = (command) => command.startsWith('node --test ');
/** The files the `node --test` commands of `script` run: each argument, quotes removed, expanded by the same glob engine the runner uses. */
const filesRun = (script) => commands(script).filter(isTestRun)
  .flatMap((command) => command.slice('node --test '.length).split(' ').flatMap((pattern) => globSync(pattern.replaceAll("'", ''), { cwd: packageRoot })));
const testFiles = readdirSync(resolve(packageRoot, 'test')).filter((name) => name.endsWith('.test.mjs')).map((name) => `test/${name}`).sort();

test('check runs every top-level test file once', () => {
  assert.deepEqual(filesRun(scripts.check).sort(), testFiles);
});

test('check:types and check:rest run every top-level test file once between them', () => {
  assert.deepEqual([...filesRun(scripts['check:types']), ...filesRun(scripts['check:rest'])].sort(), testFiles);
});

test('check:rest keeps every command of check that is not a test run', () => {
  const others = (script) => commands(script).filter((command) => !isTestRun(command));
  assert.deepEqual(others(scripts['check:rest']), others(scripts.check));
});

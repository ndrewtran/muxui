import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { readRuntimeSources, runtimeSourceFor, runtimeSourcePaths } from '../src/runtime-sources.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const snapshot = JSON.parse(await readFile(
  resolve(repositoryRoot, 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json'),
  'utf8',
));
// The export name of each canonical family, from the catalog rather than from any source module.
const familyExports = await Promise.all(snapshot.families.map(async ({ family }) => {
  const slug = family === 'Modal' ? 'dialog' : family.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();
  const artifact = JSON.parse(await readFile(resolve(repositoryRoot, `catalog/components/${slug}/artifact.json`), 'utf8'));
  return artifact.name;
}));
const declares = (text, name) => new RegExp(`export\\s+const\\s+${name}\\b`, 'u').test(text);

test('each canonical family is declared by exactly one registry module', async () => {
  const sources = await readRuntimeSources(repositoryRoot);
  assert.equal(familyExports.length, 53);
  for (const name of familyExports) {
    const owners = Object.entries(sources).filter(([, text]) => declares(text, name)).map(([path]) => path);
    assert.deepEqual(owners, [runtimeSourceFor(sources, name)], `${name} needs one owner in runtime-sources.mjs`);
  }
});

test('every registry module owns at least one canonical family', async () => {
  const sources = await readRuntimeSources(repositoryRoot);
  for (const path of runtimeSourcePaths) {
    assert.ok(familyExports.some((name) => declares(sources[path], name)), `${path} owns no canonical family; drop it from runtime-sources.mjs`);
  }
});

test('no module outside the registry declares a canonical family export', async () => {
  const registry = new Set(runtimeSourcePaths);
  const modules = (await readdir(resolve(repositoryRoot, 'packages/react/src'), { recursive: true }))
    .map((file) => `packages/react/src/${file.replaceAll('\\', '/')}`)
    .filter((path) => /\.(?:mjs|ts)$/u.test(path) && !path.endsWith('.d.ts') && !registry.has(path));
  for (const path of modules) {
    const text = await readFile(resolve(repositoryRoot, path), 'utf8');
    assert.deepEqual(
      familyExports.filter((name) => declares(text, name)),
      [],
      `${path} declares a canonical family export, so it belongs in runtime-sources.mjs`,
    );
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { reactCompatibility } from '../generated/compatibility.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const generatedJson = async (name) => JSON.parse(
  (await readFile(resolve(packageRoot, `generated/${name}`), 'utf8'))
    .replace(/^\/\/ @generated-from:.*\n\/\/ @generated-content-sha256:.*\n/u, ''),
);
const readJson = async (path) => JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'));

test('R1.5 family closure retains the fixed 53-family floor', async () => {
  const closure = await generatedJson('r1-5-closure.json');
  const snapshot = await readJson('catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json');
  assert.equal(closure.families.length, 53);
  assert.deepEqual(
    closure.families.map(({ family }) => family).sort(),
    snapshot.families.map(({ family }) => family).sort(),
  );
  assert.equal('donor' in closure, false);
  for (const family of closure.families) {
    assert.equal(family.contract.binding, `muxui:component:${family.slug}#web.react`);
    assert.equal(family.contract.lifecycle, 'experimental');
    assert.equal(family.export.module, '.');
    assert.equal(family.packed.private, true);
  }
});

test('R1.6 contract retains the 53-family floor and 22 supplemental roots', async () => {
  const contract = await generatedJson('r1-6-contract.json');
  assert.equal(contract.current.familyCount, 75);
  assert.equal(contract.current.fixed53Count, 53);
  assert.equal(contract.current.supplementalCount, 22);
  assert.equal(contract.components.length, 75);
  assert.ok(contract.components.every((component) => !('donor' in component)));
});

test('compatibility and publication boundaries remain explicit', async () => {
  const manifest = await readJson('packages/react/package.json');
  const release = await readJson('packages/react/generated/release.json');
  assert.equal(manifest.private, true);
  assert.equal(release.packagePrivate, true);
  assert.equal(release.publication.status, 'disabled');
  assert.equal(reactCompatibility.compatibilityProfile.runtimeProfile, 'web.react');
  assert.equal(reactCompatibility.compatibilityProfile.status, 'representative-baseline');
  assert.equal(reactCompatibility.publication.status, 'disabled');
});

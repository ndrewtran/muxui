import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { reactCompatibility } from '../generated/compatibility.mjs';
import { ASSISTIVE_TECHNOLOGY } from '../src/assistive-technology.mjs';
import { readSupplementalMapping } from '../src/supplemental-mapping.mjs';

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

test('R1.6 contract is the retained 53-family floor plus the supplemental mapping', async () => {
  const contract = await generatedJson('r1-6-contract.json');
  const mapping = readSupplementalMapping(repositoryRoot);
  assert.equal(contract.current.fixed53Count, 53);
  assert.equal(contract.current.supplementalCount, mapping.length);
  assert.equal(contract.current.familyCount, contract.current.fixed53Count + contract.current.supplementalCount);
  assert.equal(contract.components.length, contract.current.familyCount);
  assert.equal(new Set(contract.components.map(({ slug }) => slug)).size, contract.components.length);
  assert.deepEqual(
    contract.components.filter(({ tranche }) => tranche === 'R1.6').map(({ slug }) => slug).sort(),
    mapping.map(({ slug }) => slug).sort(),
  );
  assert.equal(contract.components.filter(({ tranche }) => tranche !== 'R1.6').length, contract.current.fixed53Count);
  // Every component has exactly one package binding and one component export.
  const descriptor = await generatedJson('descriptor.json');
  const bindings = contract.components.map(({ binding }) => binding).sort();
  assert.deepEqual(descriptor.bindings.map(({ binding }) => binding).sort(), bindings);
  assert.deepEqual(descriptor.exports.map(({ binding }) => binding).sort(), bindings);
  assert.ok(contract.components.every((component) => !('donor' in component)));
});

test('the published records claim no stable or assistive-technology support, list what is unverified, and carry no release process', async () => {
  const manifest = await readJson('packages/react/package.json');
  const release = await generatedJson('release.json');
  const closure = await generatedJson('r1-5-closure.json');
  const contract = await generatedJson('r1-6-contract.json');
  const descriptor = await generatedJson('descriptor.json');
  assert.equal(manifest.private, true);
  assert.equal(release.packagePrivate, true);
  assert.equal(reactCompatibility.compatibilityProfile.runtimeProfile, 'web.react');
  assert.equal(reactCompatibility.compatibilityProfile.status, 'representative-baseline');
  assert.ok(reactCompatibility.compatibilityProfile.notClaimed.includes('assistive technology'));
  for (const record of [reactCompatibility, closure, descriptor]) assert.equal(record.support, 'unproved; every export is experimental');

  assert.deepEqual(release.assistiveTechnology, JSON.parse(JSON.stringify(ASSISTIVE_TECHNOLOGY)));
  assert.equal(release.assistiveTechnology.claim, 'none');
  assert.deepEqual(reactCompatibility.compatibilityProfile.assistiveTechnology, release.assistiveTechnology);
  // Every family named as unverified is one the package exports.
  const exported = new Set(closure.families.map((family) => family.export.name));
  for (const { check, families = [] } of release.assistiveTechnology.unverified) {
    for (const name of families) assert.ok(exported.has(name), `${check}: ${name}`);
  }

  // Release process state stays out of the package: no publication, evidence, authorization, or rollback record.
  for (const [name, record] of [['release.json', release], ['r1-5-closure.json', closure], ['r1-6-contract.json', contract], ['compatibility.mjs', reactCompatibility]]) {
    for (const key of ['evidence', 'publication', 'publicationPreparation', 'rollback']) assert.equal(key in record, false, `${name} ${key}`);
    assert.doesNotMatch(JSON.stringify(record), /E-R1|decision:00|authoriz|S1\.0|tests\/evidence/u, name);
  }
  for (const family of closure.families) assert.equal('evidence' in family, false, family.family);
});

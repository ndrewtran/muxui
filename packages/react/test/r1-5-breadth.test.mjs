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

test('R1.6 contract retains the 53-family floor and 26 supplemental roots', async () => {
  const contract = await generatedJson('r1-6-contract.json');
  assert.equal(contract.current.familyCount, 79);
  assert.equal(contract.current.fixed53Count, 53);
  assert.equal(contract.current.supplementalCount, 26);
  assert.equal(contract.components.length, 79);
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
  assert.ok(reactCompatibility.compatibilityProfile.notClaimed.includes('assistive technology'));
  const assistiveTechnology = release.assistiveTechnology;
  assert.equal(assistiveTechnology.claim, 'none');
  assert.equal(assistiveTechnology.decision, 'muxui:decision:0022');
  assert.deepEqual(assistiveTechnology.evidenceRequiredBefore, ['any assistive-technology support claim', 'S1.0 stable promotion']);
  assert.deepEqual(reactCompatibility.compatibilityProfile.assistiveTechnology, assistiveTechnology);
  // Decision 0022's table: deferred IDs, parts, and family counts.
  assert.deepEqual(assistiveTechnology.deferredEvidence.map(({ id, part, status, deferredTo, families }) => [id, part, status, deferredTo, families?.length]), [
    ['E-R1.1-04', 'manual half', 'unmet', 'S1.0', 1],
    ['E-R1.2-03', 'manual and assistive-technology half', 'unmet', 'S1.0', 5],
    ['E-R1.3-04', 'manual and assistive-technology half', 'unmet', 'S1.0', 22],
    ['E-R1.4-04', 'manual and assistive-technology proof', 'unmet', 'S1.0', 7],
    ['E-R1.5-03', 'risk-profile half', 'unmet', 'S1.0', undefined],
  ]);
  const r15Deferred = [assistiveTechnology.deferredEvidence.at(-1)];
  assert.equal(release.historical.evidence.status, 'logged-not-retained');
  assert.deepEqual(release.historical.evidence.deferred, r15Deferred);
  const closure = await generatedJson('r1-5-closure.json');
  assert.equal(closure.evidence.status, 'logged-not-retained');
  assert.deepEqual(closure.evidence.deferred, r15Deferred);
  for (const family of closure.families) {
    const { evidence } = family;
    assert.equal(evidence.status, 'logged-not-retained');
    assert.equal(evidence.retention, release.historical.evidence.retention);
    // Every unmet tranche item covering this family is listed, never hidden under the status.
    const expected = assistiveTechnology.deferredEvidence
      .filter(({ families }) => !families || families.includes(family.export.name))
      .map(({ id }) => id);
    assert.deepEqual(evidence.deferred.map(({ id }) => id), expected, family.export.name);
  }
  const deferredIds = (name) => closure.families.find((family) => family.export.name === name).evidence.deferred.map(({ id }) => id);
  assert.deepEqual(deferredIds('Popover'), ['E-R1.4-04', 'E-R1.5-03']);
  assert.deepEqual(deferredIds('Button'), ['E-R1.5-03']);
  assert.deepEqual(deferredIds('DisclosureGroup'), ['E-R1.1-04', 'E-R1.5-03']);
  assert.equal(release.publicationPreparation.distTag, 'next');
  assert.match(release.publicationPreparation.latestDistTag, /not claimed or promoted/u);
  assert.match(release.publicationPreparation.rollback, /^prepared, not exercised: deprecate a bad 0\.1\.0-rc\.1 .* publish a fixed 0\.1\.0-rc\.2 as a new exact candidate/u);
  assert.match(release.publicationPreparation.rollback, /re-point latest from the deprecated rc to the fixed rc, without stable promotion/u);
});

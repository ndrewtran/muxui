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

test('R1.5 closure reconciles the immutable 53-family snapshot and raw counts', async () => {
  const closure = await readJson('catalog/react-r1-5/closure.json');
  const snapshot = await readJson('catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json');
  assert.equal(closure.schema, 'muxui-react-r1-5-closure-v1');
  assert.equal(closure.tranche, 'R1.5');
  assert.deepEqual(Object.keys(closure).sort(), [
    'advisories', 'agentDiscovery', 'compatibility', 'evidenceCapture', 'exceptions', 'performance', 'publication', 'schema', 'tranche',
  ].sort());
  assert.equal('families' in closure, false);
  assert.equal('upstream' in closure, false);
  assert.equal('donor' in closure, false);
  assert.equal(snapshot.families.length, 53);
});

test('R1.5 generated closure proves each family graph and Mux UI-owned styling', async () => {
  const closure = await generatedJson('r1-5-closure.json');
  const donor = await generatedJson('r1-5-donor-comparison.json');
  const snapshot = await readJson('catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json');
  const descriptor = await readJson('packages/react/generated/descriptor.json');
  const release = await readJson('packages/react/generated/release.json');
  const styles = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  assert.equal(closure.families.length, 53);
  assert.deepEqual(
    closure.families.map(({ family }) => family).sort(),
    snapshot.families.map(({ family }) => family).sort(),
  );
  assert.deepEqual(closure.upstream.rawDispositionCounts, {
    'committed-family-root': 53,
    'family-part': 75,
    'internal-runtime-support': 158,
    'internal-type-support': 327,
  });
  assert.equal(donor.components.length, 53);
  assert.deepEqual(
    donor.components.reduce((counts, { disposition }) => ({ ...counts, [disposition]: (counts[disposition] ?? 0) + 1 }), {}),
    { adapt: 51, 'no-applicable-donor': 2 },
  );
  assert.equal(release.tranche, 'R1.6');
  assert.equal(release.historical.familyCount, 53);
  assert.deepEqual(release.historical.evidence.ids, ['E-R1.5-01', 'E-R1.5-02', 'E-R1.5-03', 'E-R1.5-04', 'E-R1.5-05', 'E-R1.5-06']);
  assert.equal(descriptor.support, 'unproved; R1.6 React current union projection');
  assert.equal(descriptor.historical.familyCount, 53);
  for (const family of closure.families) {
    assert.equal(family.contract.binding, `muxui:component:${family.slug}#web.react`);
    assert.equal(family.contract.lifecycle, 'experimental');
    assert.equal(family.export.module, '.');
    assert.equal(family.lifecycle.binding, 'experimental');
    assert.equal(family.evidence.status, 'pending');
    assert.deepEqual(family.evidence.final, release.historical.evidence.ids);
    assert.equal(family.packed.private, true);
    assert.equal(family.packed.runtimeProfile, 'web.react');
    assert.equal(family.donor.ownership, 'Mux UI-owned token/style results');
    assert.match(styles, new RegExp(`\\.muxui-${family.slug}\\b`, 'u'));
  }
  for (const entry of donor.components) {
    assert.equal('inputs' in entry, false);
    assert.ok(Array.isArray(entry.donorInputs));
    assert.equal(entry.ownership, 'Mux UI-owned token/style results');
  }
});

test('R1.5 retains bounded compatibility, discovery, and publication boundaries', async () => {
  const closure = await readJson('catalog/react-r1-5/closure.json');
  const manifest = await readJson('packages/react/package.json');
  const compatibility = await readFile(resolve(packageRoot, 'generated/compatibility.mjs'), 'utf8');
  const testing = await readFile(resolve(packageRoot, 'generated/testing.mjs'), 'utf8');
  const release = await readJson('packages/react/generated/release.json');
  assert.equal(closure.compatibility.runtimeProfile, 'web.react');
  assert.equal(closure.compatibility.status, 'representative-baseline');
  assert.equal(closure.performance.status, 'representative-baseline');
  assert.deepEqual(closure.performance.budgets, {
    packedImportMilliseconds: 2000,
    ssrMilliseconds: 1000,
  });
  assert.equal(closure.agentDiscovery.status, 'informational');
  assert.equal(closure.agentDiscovery.claim, 'no support or release gate');
  assert.deepEqual(closure.evidenceCapture, {
    collection: 'default-off',
    allowed: ['sanitized repository-relative paths', 'canonical IDs'],
    prohibited: ['credentials', 'consumer data'],
    retention: 'protected PR check/review logs',
  });
  assert.equal(closure.publication.candidateVersion, '0.1.0-rc.1');
  assert.equal(closure.publication.status, 'disabled');
  assert.equal(closure.publication.private, true);
  assert.equal(manifest.version, '0.1.0-alpha.0');
  assert.equal(manifest.private, true);
  assert.match(compatibility, /unproved; R1\.5 React exports only/u);
  assert.match(testing, /componentSupportClaim: 'none'/u);
  assert.equal(release.packagePrivate, true);
  assert.equal(release.publication.status, 'disabled');
  assert.deepEqual(reactCompatibility.compatibilityProfile, {
    runtimeProfile: 'web.react',
    status: 'representative-baseline',
    tested: {
      node: '>=24.19.0 <25',
      react: '>=19.2.0 <20',
      reactDom: '>=19.2.0 <20',
      browserMatrix: closure.compatibility.browserMatrix,
    },
    notClaimed: ['assistive technology', 'zoom', 'locale', 'browsers outside Google Chrome 151'],
  });
  assert.deepEqual(reactCompatibility.performance, closure.performance);
  assert.deepEqual(reactCompatibility.publication, closure.publication);
});

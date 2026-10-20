import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { reactCompatibility } from '../../../packages/react/generated/compatibility.mjs';
import { readCompatibilityProfile, reactCompatibilityProfile } from '../src/lib/compatibility-profile.ts';

const root = resolve(import.meta.dirname, '../../..');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

const record = (change = (value) => value) => change({
  compatibilityProfile: {
    runtimeProfile: 'web.react',
    status: 'representative-baseline',
    tested: {
      node: '>=24 <25',
      react: '>=19 <20',
      reactDom: '>=19 <20',
      browserMatrix: { browser: 'Browser 1', axe: '4.0.0', profiles: ['light/standard'], source: 'test/browser.test.mjs' },
    },
    notClaimed: ['assistive technology'],
    assistiveTechnology: { claim: 'none' },
  },
});

test('the tested profile is read from the compatibility record and nothing is added', () => {
  assert.deepEqual(readCompatibilityProfile(record()), {
    runtimeProfile: 'web.react',
    status: 'representative-baseline',
    node: '>=24 <25',
    react: '>=19 <20',
    reactDom: '>=19 <20',
    browser: 'Browser 1',
    axe: '4.0.0',
    displayProfiles: ['light/standard'],
    testSource: 'test/browser.test.mjs',
    notClaimed: ['assistive technology'],
  });
});

test('a compatibility record that changes shape or stops stating that no assistive-technology support is claimed is refused', () => {
  assert.throws(() => readCompatibilityProfile(undefined), /does not state that it claims no assistive-technology support/u);
  assert.throws(() => readCompatibilityProfile({ compatibilityProfile: { assistiveTechnology: { claim: 'none' } } }), /no runtimeProfile/u);
  assert.throws(() => readCompatibilityProfile(record(({ compatibilityProfile }) => ({ compatibilityProfile: { ...compatibilityProfile, notClaimed: [] } }))), /no notClaimed list/u);
  assert.throws(() => readCompatibilityProfile(record(({ compatibilityProfile }) => ({
    compatibilityProfile: { ...compatibilityProfile, tested: { ...compatibilityProfile.tested, node: undefined } },
  }))), /no node/u);
  assert.throws(() => readCompatibilityProfile(record(({ compatibilityProfile }) => ({
    compatibilityProfile: { ...compatibilityProfile, assistiveTechnology: { claim: 'supported' } },
  }))), /does not state that it claims no assistive-technology support/u);
});

test('the Installation profile is the package record, which its authored closure and manifest decide', () => {
  const closure = readJson('catalog/react-r1-5/closure.json').compatibility;
  const manifest = readJson('packages/react/package.json');
  assert.deepEqual(reactCompatibilityProfile, readCompatibilityProfile(reactCompatibility));
  assert.equal(reactCompatibilityProfile.runtimeProfile, closure.runtimeProfile);
  assert.equal(reactCompatibilityProfile.status, closure.status);
  assert.equal(reactCompatibilityProfile.browser, closure.browserMatrix.browser);
  assert.equal(reactCompatibilityProfile.axe, closure.browserMatrix.axe);
  assert.deepEqual(reactCompatibilityProfile.displayProfiles, closure.browserMatrix.profiles);
  assert.equal(reactCompatibilityProfile.testSource, closure.browserMatrix.source);
  // The prerequisites Installation states from the manifest and the versions the checks ran against are one tuple.
  assert.equal(reactCompatibilityProfile.node, manifest.engines.node);
  assert.equal(reactCompatibilityProfile.react, manifest.peerDependencies.react);
  assert.equal(reactCompatibilityProfile.reactDom, manifest.peerDependencies['react-dom']);
  // The cited test exists, and the non-claims keep the assistive-technology one and the browser limit.
  assert.ok(readFileSync(resolve(root, reactCompatibilityProfile.testSource), 'utf8').length > 0);
  assert.ok(reactCompatibilityProfile.notClaimed.includes('assistive technology'));
  assert.ok(reactCompatibilityProfile.notClaimed.includes(`browsers outside ${reactCompatibilityProfile.browser}`));
});

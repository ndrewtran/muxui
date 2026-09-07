import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { catalogJson } from '@muxui/catalog/bundle';
import { canonicalDigest, canonicalJson } from '@muxui/schema';
import { compileNativeTheme } from '@muxui/tokens';
import {
  assertNativeProfileSupported,
  nativeProfiles,
  queryNativeProfile,
} from '../src/profiles.mjs';
import { createReactNativeWebAdaptations } from '../src/platform.react-native-web.mjs';
import { nativeThemeProjection } from '../generated/native-themes.mjs';
import { selectReactNativeGenerationInputs } from '../src/generation-inputs.mjs';
import {
  assertG12PlatformSafetyFixture,
  projectCurrentNativeComponentForHistoricalFixture,
} from '../../../tests/fixtures/g1.2/profile.mjs';
import { nativeProfileProjection } from '../generated/native-profiles.mjs';

const runtimeSubpaths = Object.freeze([
  ['.', '../src/index.mjs'],
  ['./ios', '../src/platform.ios.mjs'],
  ['./android', '../src/platform.android.mjs'],
  ['./profiles', '../src/profiles.mjs'],
  ['./theme', '../generated/native-themes.mjs'],
]);

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const fixture = JSON.parse(await readFile(resolve(repositoryRoot, 'tests/fixtures/g1.2/platform-safety-native.json'), 'utf8'));
const bundle = JSON.parse(catalogJson);
const component = bundle.artifacts.find(({ id }) => id === 'muxui:component:button');
const tokenArtifact = bundle.artifacts.find(({ id }) => id === 'muxui:token:default-theme');

async function packageFiles(path = packageRoot) {
  const values = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const absolute = resolve(path, entry.name);
    if (entry.isDirectory()) values.push(...await packageFiles(absolute));
    else values.push(absolute);
  }
  return values;
}

test('E-G1.2-01 package graph and exports exclude web and host accidents', async () => {
  assert.equal(manifest.name, '@muxui/react-native');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.private, true);
  assert.deepEqual(Object.keys(manifest.exports), ['.', './ios', './android', './profiles', './theme']);
  assert.deepEqual(manifest.dependencies, { '@muxui/foundation': 'workspace:*' });
  assert.deepEqual(manifest.peerDependencies, { react: '^19.2.3', 'react-native': '^0.87.0' });
  const declaredPackages = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  }).map((name) => name.toLowerCase());
  for (const forbidden of ['@muxui/web', 'react-dom', 'expo', 'storybook']) {
    assert.equal(declaredPackages.some((name) => name === forbidden || name.startsWith(`${forbidden}/`)), false);
  }
  const runtimeFiles = (await packageFiles(resolve(packageRoot, 'src')))
    .filter((path) => path.endsWith('.mjs'));
  const runtimeSource = (await Promise.all(runtimeFiles.map((path) => readFile(path, 'utf8')))).join('\n');
  for (const forbidden of ['document.', 'window.', 'react-dom', '@muxui/web', 'css-tree', 'postcss']) {
    assert.equal(runtimeSource.toLowerCase().includes(forbidden), false, forbidden);
  }
  assert.match(await readFile(resolve(packageRoot, 'src/runtime.mjs'), 'utf8'), /from 'react-native'/);
});

test('E-G1.2-01 every public subpath resolves its declared runtime and type surface', async () => {
  assert.deepEqual(Object.keys(manifest.exports), runtimeSubpaths.map(([name]) => name));
  for (const [name] of runtimeSubpaths) {
    const declaration = manifest.exports[name];
    await readFile(resolve(packageRoot, declaration.types));
    await readFile(resolve(packageRoot, declaration.default));
  }
  const profiles = await import('../src/profiles.mjs');
  const rootSource = await readFile(resolve(packageRoot, manifest.exports['.'].default), 'utf8');
  for (const name of ['assertNativeProfileSupported', 'nativeProfileProjection', 'nativeProfiles', 'queryNativeProfile']) {
    assert.equal(rootSource.includes(name), true, name);
    assert.equal(Object.hasOwn(profiles, name), true, name);
  }
  assert.ok((await import('../generated/native-themes.mjs')).nativeThemeProjection);
});

test('E-G1.2-03 React Native Web remains an explicit unsupported profile', () => {
  assert.deepEqual(queryNativeProfile('native.react-native-web'), {
    platformSafetyRequirementSetDigest: component.platformSafetyRequirementSets[
      'native.react-native:native.react-native-web'
    ].digest,
    profile: 'native.react-native-web',
    reason: 'No responsible implementation in the first proof artifact.',
    strategy: 'unsupported',
    validationProfile: 'native.react-native-web',
  });
  assert.throws(
    () => assertNativeProfileSupported('native.react-native-web'),
    /MUXUI_REACT_NATIVE_PROFILE_UNSUPPORTED/,
  );
  assert.throws(createReactNativeWebAdaptations, /MUXUI_REACT_NATIVE_PROFILE_UNSUPPORTED/);
  assert.equal(Object.hasOwn(nativeThemeProjection.profiles, 'native.react-native-web'), false);
  assert.equal(JSON.stringify(nativeProfiles).includes('web.react"'), false);
});

test('E-G1.2-04 native Button remains a disabled-only deferred boundary', async () => {
  const binding = component.record.bindings['native.react-native'];
  assert.deepEqual(binding.api.props, ['disabled']);
  assert.deepEqual(binding.api.defaults, { disabled: false });
  assert.deepEqual(binding.accessibility, ['Expose accessible name and disabled state']);
  assert.doesNotMatch(JSON.stringify(binding), /pending/iu);
  assert.equal(nativeProfileProjection.componentSupportClaim, 'none');
  assert.doesNotMatch(await readFile(resolve(packageRoot, 'src/index.mjs'), 'utf8'), /\bButton\b/u);
});

test('E-G1.2-04 native themes are exact @muxui/tokens projections with no CSS authority', async () => {
  assert.equal(nativeThemeProjection.componentSupportClaim, 'none');
  assert.equal(nativeThemeProjection.source.tokenId, tokenArtifact.id);
  assert.equal(nativeThemeProjection.source.tokenSourceRevision, tokenArtifact.contentRevision);
  assert.equal(nativeThemeProjection.source.tokenContractVersion, tokenArtifact.record.tokenContractVersion);
  assert.equal(nativeThemeProjection.source.transformOwner, '@muxui/tokens#compileNativeTheme');
  for (const [platform, profile] of [['ios', 'native.ios'], ['android', 'native.android']]) {
    const expected = compileNativeTheme(tokenArtifact.record, { profile });
    assert.equal(canonicalJson(nativeThemeProjection.profiles[platform].theme), canonicalJson(expected));
    assert.equal(nativeThemeProjection.profiles[platform].themeDigest, canonicalDigest(expected));
  }
  const generatedSource = await readFile(resolve(packageRoot, 'generated/native-themes.mjs'), 'utf8');
  assert.equal(/\bcss\b|--muxui-|:root\s*\{/i.test(generatedSource), false);
  const historicalOnlyBundle = {
    artifacts: [
      component,
      { ...tokenArtifact, id: 'muxui:token:button-minimum' },
    ],
  };
  assert.throws(
    () => selectReactNativeGenerationInputs(historicalOnlyBundle),
    /MUXUI_REACT_NATIVE_DEFAULT_THEME_REQUIRED: muxui:token:default-theme/,
  );
});

test('E-G1.2-05 test-only fixture binds the exact compiled three-profile safety matrix', () => {
  const historicalComponent = projectCurrentNativeComponentForHistoricalFixture(component, fixture);
  assert.doesNotThrow(() => assertG12PlatformSafetyFixture(fixture, historicalComponent));
  assert.equal(nativeProfileProjection.bindingRef, `${component.id}#native.react-native`);
  assert.equal(nativeProfileProjection.bindingContentRevision, component.bindingContentRevisions['native.react-native']);
  assert.equal(nativeProfileProjection.bindingSpecRevision, component.bindingSpecRevisions['native.react-native']);
  assert.equal(
    nativeProfileProjection.platformSafetyContractDigest,
    component.platformSafetyRequirementSets['native.react-native:ios'].contractDigest,
  );
  assert.equal(fixture.id, 'fixture:platform-safety-native');
  assert.equal(fixture.bindingRef, 'core:component:button#native.react-native');
  assert.equal(fixture.componentSupportClaim, 'none');
  assert.deepEqual(fixture.tuples.map(({ profile, validationProfile }) => [profile, validationProfile]), [
    ['ios', 'native.ios'],
    ['android', 'native.android'],
    ['native.react-native-web', 'native.react-native-web'],
  ]);
  for (const tuple of fixture.tuples) {
    const historicalRequirementSet = historicalComponent.platformSafetyRequirementSets[
      `native.react-native:${tuple.profile}`
    ];
    const currentRequirementSet = component.platformSafetyRequirementSets[
      `native.react-native:${tuple.profile}`
    ];
    assert.ok(historicalRequirementSet);
    assert.ok(currentRequirementSet);
    assert.equal(tuple.platformSafetyRequirementSetDigest, historicalRequirementSet.digest);
    assert.equal(tuple.validationProfile, historicalRequirementSet.validationProfile);
    assert.equal(nativeProfiles[tuple.profile].platformSafetyRequirementSetDigest, currentRequirementSet.digest);
    if (tuple.profile !== 'native.react-native-web') {
      assert.equal(
        nativeProfiles[tuple.profile].tokenRequirementSetDigest,
        component.tokenRequirementSets[`native.react-native:native.${tuple.profile}`].digest,
      );
    }
    assert.equal(historicalRequirementSet.dispositions.length, 6);
    const disposition = Object.fromEntries(historicalRequirementSet.dispositions.map(({ id, disposition }) => [id, disposition]));
    if (tuple.profile === 'native.react-native-web') {
      assert.deepEqual(new Set(Object.values(disposition)), new Set(['not-applicable']));
      assert.equal(historicalRequirementSet.dispositions.every(({ reason }) => typeof reason === 'string' && reason.length > 0), true);
    } else {
      for (const id of ['native.dynamic-color', 'native.font-metrics', 'layout.direction', 'platform.accessibility-mapping']) {
        assert.equal(disposition[id], 'required');
      }
    }
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalJson, parseJsonStrict } from '@muxui/schema';
import {
  TokenContractError,
  compileNativeTheme,
  compileTokenGraph,
  compileTokenRequirementSet,
  compileWebTheme,
  validateSourceCrosswalk,
  validateThemeForRequirementSet,
} from '../src/index.mjs';
import { consumeButtonStaticWebTransform } from '../../../tests/fixtures/g1.0/consumers/button-web.consumer.mjs';
import { consumeButtonStaticNativeTransform } from '../../../tests/fixtures/g1.0/consumers/button-native.consumer.mjs';

const source = parseJsonStrict(await readFile(
  new URL('../../../catalog/tokens/default-theme.json', import.meta.url),
  'utf8',
));
const recipe = {
  source: source.id,
  requirements: [
    { token: 'component.button.background', requirement: 'required' },
    { token: 'component.button.foreground', requirement: 'required' },
  ],
};

function expectCode(code, operation) {
  assert.throws(operation, (error) => error instanceof TokenContractError && error.code === code);
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = [0, 1, 2].map((index) => Number.parseInt(hex.slice(index * 2 + 1, index * 2 + 3), 16) / 255);
    return channels.reduce((total, channel, index) => {
      const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      return total + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function crosswalkFixture() {
  const occurrences = [
    { ordinal: 1, file: '_color.css', selector: ':root', name: '--action-dark', value: '#1f2937' },
    { ordinal: 2, file: '_color.css', selector: '.dark', name: '--action-dark', value: '#1f2937' },
  ];
  const directTargets = {
    'web.html': 'direct',
    'web.react': 'direct',
    'native.ios': 'direct',
    'native.android': 'direct',
    'native.react-native-web': 'deferred',
  };
  const candidate = structuredClone(source);
  candidate.sourceCrosswalk = {
    baseline: {
      repository: 'reference/tokens',
      revision: 'a'.repeat(40),
      path: 'packages/tokens/tokens.json',
      sha256: `sha256:${'b'.repeat(64)}`,
      baseFontSizePx: 16,
      declarationOccurrences: 2,
      customPropertyOccurrences: 2,
      uniqueCustomPropertyNames: 1,
      nonCustomPropertyOccurrences: 0,
    },
    entries: occurrences.map((occurrence) => ({
      occurrence,
      disposition: 'adopt',
      muxuiTokenId: 'reference.color.neutral-90',
      groupId: 'source.action-dark-equivalence',
      reason: 'Both source occurrences are exactly the canonical dark action reference value.',
      targets: directTargets,
    })),
    groups: [{
      id: 'source.action-dark-equivalence',
      relationship: 'equivalent-source-values',
      muxuiTokenId: 'reference.color.neutral-90',
      members: occurrences.map(({ ordinal }) => ({ ordinal, role: 'equivalent-source-value' })),
    }],
  };
  return { candidate, occurrences: structuredClone(occurrences) };
}

function selectorCrosswalkFixture() {
  const occurrences = [
    { ordinal: 1, file: '_space.css', selector: ':root', name: '--space-m', value: '16px' },
    { ordinal: 2, file: '_space.css', selector: '@media (min-width: 48rem)', name: '--space-m', value: '24px' },
  ];
  const candidate = structuredClone(source);
  candidate.sourceCrosswalk = {
    baseline: {
      repository: 'reference/tokens', revision: 'a'.repeat(40), path: 'catalog/tokens/default-theme.json',
      sha256: `sha256:${'b'.repeat(64)}`, baseFontSizePx: 16, declarationOccurrences: 2,
      customPropertyOccurrences: 2, uniqueCustomPropertyNames: 1, nonCustomPropertyOccurrences: 0,
    },
    entries: [
      {
        occurrence: occurrences[0], disposition: 'adapt', muxuiTokenId: 'reference.dimension.space-xs',
        groupId: 'source.space-m-responsive', reason: 'The base value is portable.',
        targets: { 'web.html': 'direct', 'web.react': 'direct', 'native.ios': 'direct', 'native.android': 'direct', 'native.react-native-web': 'deferred' },
      },
      {
        occurrence: occurrences[1], disposition: 'defer', groupId: 'source.space-m-responsive',
        reason: 'The responsive selector remains deferred.',
        targets: { 'web.html': 'deferred', 'web.react': 'deferred', 'native.ios': 'deferred', 'native.android': 'deferred', 'native.react-native-web': 'deferred' },
      },
    ],
    groups: [{
      id: 'source.space-m-responsive', relationship: 'selector-variants',
      muxuiTokenId: 'reference.dimension.space-xs',
      members: [{ ordinal: 1, role: 'base' }, { ordinal: 2, role: 'web-responsive' }],
    }],
  };
  return { candidate, occurrences: structuredClone(occurrences) };
}

function modeCrosswalkFixture() {
  const occurrences = [
    { ordinal: 1, file: '_motion.css', selector: ':root', name: '--motion', value: '120ms' },
    { ordinal: 2, file: '_motion.css', selector: '@media (prefers-reduced-motion)', name: '--motion', value: '0ms' },
    { ordinal: 3, file: '_motion.css', selector: '[data-reduced-motion]', name: '--motion', value: '0ms' },
  ];
  const deferredTargets = { 'web.html': 'deferred', 'web.react': 'deferred', 'native.ios': 'deferred', 'native.android': 'deferred', 'native.react-native-web': 'deferred' };
  const candidate = structuredClone(source);
  candidate.sourceCrosswalk = {
    baseline: {
      repository: 'reference/tokens', revision: 'a'.repeat(40), path: 'catalog/tokens/default-theme.json',
      sha256: `sha256:${'b'.repeat(64)}`, baseFontSizePx: 16, declarationOccurrences: 3,
      customPropertyOccurrences: 3, uniqueCustomPropertyNames: 1, nonCustomPropertyOccurrences: 0,
    },
    entries: occurrences.map((occurrence) => ({
      occurrence, disposition: 'defer', groupId: 'source.motion-modes',
      reason: 'Motion variants remain deferred.', targets: deferredTargets,
    })),
    groups: [{
      id: 'source.motion-modes', relationship: 'mode-variants',
      members: [
        { ordinal: 1, role: 'default', mode: 'motion.full' },
        { ordinal: 2, role: 'reduced-system', mode: 'motion.reduced' },
        { ordinal: 3, role: 'reduced-explicit', mode: 'motion.reduced' },
      ],
    }],
  };
  return { candidate, occurrences: structuredClone(occurrences) };
}

function expectCrosswalkInvalid(value) {
  assert.throws(
    () => validateSourceCrosswalk(value.candidate, { baselineOccurrences: value.occurrences }),
    (error) => error instanceof TokenContractError && error.code.startsWith('MUXUI_TOKEN_CROSSWALK_'),
  );
}

test('source-crosswalk validation is optional and binds coverage when supplied', () => {
  const canonical = validateSourceCrosswalk(source);
  assert.deepEqual(canonical, { status: 'absent', digest: null, crosswalk: null });
  const { candidate, occurrences } = crosswalkFixture();
  const validated = validateSourceCrosswalk(candidate, { baselineOccurrences: occurrences });
  assert.equal(validated.status, 'available');
  assert.match(validated.digest, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(validated.crosswalk, candidate.sourceCrosswalk);

  for (const mutate of [
    (value) => { value.occurrences[1].value = '#000001'; },
    (value) => { value.candidate.sourceCrosswalk.entries[0].muxuiTokenId = 'semantic.action.background'; },
    (value) => { value.candidate.sourceCrosswalk.entries[1].groupId = 'source.other'; },
    (value) => { value.candidate.sourceCrosswalk.groups[0].members[1].role = 'base'; },
    (value) => { value.candidate.sourceCrosswalk.entries[0].targets['native.ios'] = 'rejected'; },
    (value) => { value.candidate.sourceCrosswalk.entries[1].occurrence.ordinal = 1; },
    (value) => { value.candidate.sourceCrosswalk.entries.pop(); },
    (value) => { value.candidate.sourceCrosswalk.entries.push(structuredClone(value.candidate.sourceCrosswalk.entries[1])); },
    (value) => { value.candidate.sourceCrosswalk.baseline.customPropertyOccurrences = 1; },
    (value) => { value.candidate.sourceCrosswalk.baseline.uniqueCustomPropertyNames = 3; },
    (value) => { value.candidate.sourceCrosswalk.entries[1].occurrence.value = '#000001'; value.occurrences[1].value = '#000001'; },
    (value) => { value.candidate.sourceCrosswalk.entries[1].disposition = 'adapt'; },
    (value) => { delete value.candidate.sourceCrosswalk.groups[0].muxuiTokenId; },
    (value) => { value.candidate.sourceCrosswalk.groups[0].muxuiTokenId = 'reference.color.neutral-5'; },
    (value) => { value.candidate.sourceCrosswalk.groups.push({ ...structuredClone(value.candidate.sourceCrosswalk.groups[0]), id: 'source.second' }); },
    (value) => { delete value.candidate.sourceCrosswalk.entries[0].groupId; delete value.candidate.sourceCrosswalk.entries[1].groupId; value.candidate.sourceCrosswalk.groups = []; },
  ]) {
    const invalid = crosswalkFixture();
    mutate(invalid);
    expectCrosswalkInvalid(invalid);
  }

  for (const fixture of [selectorCrosswalkFixture, modeCrosswalkFixture]) {
    const valid = fixture();
    assert.equal(validateSourceCrosswalk(valid.candidate, { baselineOccurrences: valid.occurrences }).status, 'available');
  }

  for (const mutate of [
    (value) => { value.candidate.sourceCrosswalk.groups[0].members[1].role = 'base'; },
    (value) => {
      value.candidate.sourceCrosswalk.entries[1].disposition = 'reject';
      for (const target of Object.keys(value.candidate.sourceCrosswalk.entries[1].targets)) {
        value.candidate.sourceCrosswalk.entries[1].targets[target] = 'rejected';
      }
    },
    (value) => { delete value.candidate.sourceCrosswalk.groups[0].muxuiTokenId; },
  ]) {
    const invalid = selectorCrosswalkFixture();
    mutate(invalid);
    expectCrosswalkInvalid(invalid);
  }

  for (const mutate of [
    (value) => { value.candidate.sourceCrosswalk.groups[0].members[1].role = 'default'; value.candidate.sourceCrosswalk.groups[0].members[1].mode = 'motion.full'; },
    (value) => { value.candidate.sourceCrosswalk.groups[0].members.pop(); value.candidate.sourceCrosswalk.entries.pop(); value.occurrences.pop(); value.candidate.sourceCrosswalk.baseline.declarationOccurrences = 2; value.candidate.sourceCrosswalk.baseline.customPropertyOccurrences = 2; },
    (value) => { value.candidate.sourceCrosswalk.groups[0].muxuiTokenId = 'reference.duration.fast'; },
    (value) => {
      value.candidate.sourceCrosswalk.entries[1].disposition = 'reject';
      for (const target of Object.keys(value.candidate.sourceCrosswalk.entries[1].targets)) {
        value.candidate.sourceCrosswalk.entries[1].targets[target] = 'rejected';
      }
    },
  ]) {
    const invalid = modeCrosswalkFixture();
    mutate(invalid);
    expectCrosswalkInvalid(invalid);
  }

  const wrongGroupOrder = modeCrosswalkFixture();
  const extraOccurrences = [
    { ordinal: 4, file: '_weight.css', selector: ':root', name: '--weight', value: '400' },
    { ordinal: 5, file: '_weight.css', selector: '.regular', name: '--weight', value: '400' },
  ];
  wrongGroupOrder.occurrences.push(...structuredClone(extraOccurrences));
  wrongGroupOrder.candidate.sourceCrosswalk.baseline.declarationOccurrences = 5;
  wrongGroupOrder.candidate.sourceCrosswalk.baseline.customPropertyOccurrences = 5;
  wrongGroupOrder.candidate.sourceCrosswalk.baseline.uniqueCustomPropertyNames = 2;
  wrongGroupOrder.candidate.sourceCrosswalk.entries.push(...extraOccurrences.map((occurrence) => ({
    occurrence,
    disposition: 'adapt',
    muxuiTokenId: 'reference.dimension.space-xs',
    groupId: 'source.aaa-out-of-order',
    reason: 'Equivalent source values share one Core reference.',
    targets: { 'web.html': 'direct', 'web.react': 'direct', 'native.ios': 'direct', 'native.android': 'direct', 'native.react-native-web': 'deferred' },
  })));
  wrongGroupOrder.candidate.sourceCrosswalk.groups.push({
    id: 'source.aaa-out-of-order',
    relationship: 'equivalent-source-values',
    muxuiTokenId: 'reference.dimension.space-xs',
    members: [{ ordinal: 4, role: 'equivalent-source-value' }, { ordinal: 5, role: 'equivalent-source-value' }],
  });
  expectCrosswalkInvalid(wrongGroupOrder);
});

test('E-G1.0-01 rejects cycles, reverse layers, incompatible units, and overrides', () => {
  const cycle = structuredClone(source);
  cycle.tokens['semantic.test.a'] = {
    layer: 'semantic', type: 'color', unit: 'hex', meaning: 'Cycle A.', overridePolicy: 'fixed',
    alias: 'semantic.test.b', equivalence: 'semantic-equivalence',
  };
  cycle.tokens['semantic.test.b'] = {
    layer: 'semantic', type: 'color', unit: 'hex', meaning: 'Cycle B.', overridePolicy: 'fixed',
    alias: 'semantic.test.a', equivalence: 'semantic-equivalence',
  };
  expectCode('MUXUI_TOKEN_ALIAS_CYCLE', () => compileTokenGraph(cycle));

  const reverse = structuredClone(source);
  delete reverse.tokens['reference.color.neutral-90'].value;
  reverse.tokens['reference.color.neutral-90'].alias = 'semantic.action.background';
  expectCode('MUXUI_TOKEN_LAYER_DIRECTION', () => compileTokenGraph(reverse));

  const incompatible = structuredClone(source);
  incompatible.tokens['semantic.action.background'].unit = 'px';
  expectCode('MUXUI_TOKEN_TYPE_MISMATCH', () => compileTokenGraph(incompatible));

  expectCode('MUXUI_TOKEN_OVERRIDE_UNAUTHORIZED', () => compileTokenGraph(source, {
    overrides: {
      'reference.color.neutral-90': { type: 'color', unit: 'hex', value: '#000000' },
    },
  }));
});

test('E-G1.0-02 web and native transforms retain canonical provenance without cross-target authority', () => {
  const web = compileWebTheme(source);
  const react = compileWebTheme(source);
  const ios = compileNativeTheme(source, { profile: 'native.ios' });
  const android = compileNativeTheme(source, { profile: 'native.android' });
  assert.equal(web.css, react.css);
  const expectedCounts = Object.fromEntries(['reference', 'semantic', 'component'].map((layer) => [layer, Object.values(source.tokens).filter((token) => token.layer === layer).length]));
  assert.equal((web.css.match(/^  --muxui-reference-[^:]+:/gmu) ?? []).length, expectedCounts.reference);
  assert.ok(Object.keys(ios.theme).filter((id) => id.startsWith('reference.')).length < expectedCounts.reference);
  assert.ok(Object.keys(ios.theme).filter((id) => id.startsWith('semantic.')).length <= expectedCounts.semantic);
  assert.ok(Object.keys(ios.theme).filter((id) => id.startsWith('component.')).length <= expectedCounts.component);
  assert.deepEqual(android.theme, ios.theme);
  assert.equal(Object.hasOwn(ios, 'css'), false);
  assert.equal(ios.provenance.digest, web.provenance.digest);
  assert.equal(android.provenance.digest, web.provenance.digest);
  assert.ok(Object.keys(ios.theme).length < Object.keys(source.tokens).length);
  assert.ok(ios.diagnostics.some(({ code }) => code === 'MUXUI_TOKEN_RELATIVE_ROOT_METRIC_REQUIRED'));
  assert.ok(ios.diagnostics.some(({ code }) => code === 'MUXUI_TOKEN_FORMULA_DEFERRED'));
  assert.equal(web.tokenContractVersion, source.tokenContractVersion);
  consumeButtonStaticWebTransform(web, { target: 'web.html' });
  consumeButtonStaticWebTransform(react, { target: 'web.react' });
  consumeButtonStaticNativeTransform(ios, { profile: 'native.ios' });
  consumeButtonStaticNativeTransform(android, { profile: 'native.android' });
  for (const profile of ['native.ios', 'native.android']) {
    for (const field of ['css', 'cssSource']) {
      expectCode('MUXUI_TOKEN_OPTIONS_INVALID', () => compileNativeTheme(source, {
        profile,
        [field]: ':root {}',
      }));
    }
  }
  expectCode('MUXUI_TOKEN_PROFILE_INVALID', () => compileNativeTheme(source, {
    profile: 'native.react-native-web',
  }));
});

test('default theme link and invalid semantic colors meet contrast in both color schemes', () => {
  const references = Object.fromEntries(
    Object.entries(source.tokens)
      .filter(([id]) => id.startsWith('reference.'))
      .map(([id, token]) => [id, token.value]),
  );
  const link = source.tokens['semantic.content.link'];
  const invalid = source.tokens['semantic.feedback.invalid'];
  assert.equal(link.alias, 'semantic.color.color-70');
  assert.equal(link.modes, undefined);
  assert.equal(invalid.alias, 'reference.color.error-60');
  assert.equal(invalid.modes['colorScheme.dark'].alias, 'reference.color.error-30');

  const light = compileTokenGraph(source);
  const dark = compileTokenGraph(source, { modes: { colorScheme: 'dark' } });

  for (const [foreground, background] of [
    [light.tokens['semantic.content.link'].value, light.tokens['semantic.surface.canvas'].value],
    [dark.tokens['semantic.content.link'].value, dark.tokens['semantic.surface.canvas'].value],
    [light.tokens['semantic.feedback.invalid'].value, light.tokens['semantic.surface.canvas'].value],
    [dark.tokens['semantic.feedback.invalid'].value, dark.tokens['semantic.surface.canvas'].value],
  ]) {
    assert.ok(contrastRatio(foreground, background) >= 4.5, `${foreground} on ${background} lacks 4.5:1 contrast`);
  }
});

test('default theme color modes preserve canonical shade positions', () => {
  const dark = compileTokenGraph(source, { modes: { colorScheme: 'dark' } });
  const namedShades = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  for (const shade of namedShades) {
    assert.equal(
      source.tokens[`semantic.color.color-${shade}`].modes['colorScheme.dark'].alias,
      `reference.color.brand-${namedShades[namedShades.length - 1 - namedShades.indexOf(shade)]}`,
    );
  }
  const neutralShades = [5, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];
  assert.deepEqual({ ...source.tokens['semantic.color.neutral-5'].modes['colorScheme.dark'].mix }, {
    space: 'srgb', token: 'semantic.color.neutral-10', color: '#000000', weight: 0.85,
  });
  for (const shade of neutralShades.slice(1)) {
    const target = `semantic.color.neutral-default-${110 - shade}`;
    assert.equal(source.tokens[`semantic.color.neutral-${shade}`].modes['colorScheme.dark'].alias, target);
    assert.equal(dark.tokens[`semantic.color.neutral-${shade}`].value, dark.tokens[target].value);
  }
  assert.equal(dark.tokens['semantic.color.neutral-5'].value, '#0e0e0d');
});

test('changing source identity changes provenance while preserving renderer output', () => {
  const decision0004 = structuredClone(source);
  decision0004.id = 'muxui:token:button-minimum';
  const beforeWeb = compileWebTheme(decision0004);
  const afterWeb = compileWebTheme(source);
  const beforeIos = compileNativeTheme(decision0004, { profile: 'native.ios' });
  const beforeAndroid = compileNativeTheme(decision0004, { profile: 'native.android' });
  const afterIos = compileNativeTheme(source, { profile: 'native.ios' });
  const afterAndroid = compileNativeTheme(source, { profile: 'native.android' });
  assert.equal(beforeWeb.css, afterWeb.css);
  assert.equal(canonicalJson(beforeIos.theme), canonicalJson(afterIos.theme));
  assert.equal(canonicalJson(beforeAndroid.theme), canonicalJson(afterAndroid.theme));
  assert.equal(Object.hasOwn(beforeIos, 'css'), false);
  assert.equal(Object.hasOwn(afterIos, 'css'), false);
  assert.equal(Object.hasOwn(beforeAndroid, 'css'), false);
  assert.equal(Object.hasOwn(afterAndroid, 'css'), false);
  assert.notEqual(beforeWeb.provenance.digest, afterWeb.provenance.digest);
  assert.notEqual(beforeIos.provenance.digest, afterIos.provenance.digest);
  assert.notEqual(beforeAndroid.provenance.digest, afterAndroid.provenance.digest);
  assert.equal(beforeWeb.tokenContractVersion, afterWeb.tokenContractVersion);
  assert.equal(beforeIos.tokenContractVersion, afterIos.tokenContractVersion);
  assert.equal(beforeAndroid.tokenContractVersion, afterAndroid.tokenContractVersion);
});

test('E-G1.0-03 missing required tokens fail per profile and exact proved fallbacks diagnose use', () => {
  for (const profile of ['web.html', 'web.react', 'native.ios', 'native.android']) {
    const set = compileTokenRequirementSet({ source, recipe, bindingId: 'button', profile });
    expectCode('MUXUI_TOKEN_REQUIRED_MISSING', () => validateThemeForRequirementSet({
      requirementSet: set,
      values: {},
    }));
  }

  const fallbackRecipe = structuredClone(recipe);
  fallbackRecipe.requirements[0].fallback = {
    kind: 'value',
    profiles: ['web.html'],
    evidenceIds: ['E-G1.0-03'],
    type: 'color',
    unit: 'hex',
    value: '#000000',
  };
  const set = compileTokenRequirementSet({
    source,
    recipe: fallbackRecipe,
    bindingId: 'web.html',
    profile: 'web.html',
  });
  const result = validateThemeForRequirementSet({
    requirementSet: set,
    values: { 'component.button.foreground': '#ffffff' },
  });
  assert.equal(result.diagnostics[0].code, 'MUXUI_TOKEN_FALLBACK_USED');
  assert.equal(result.diagnostics[0].profile, 'web.html');

  const otherProfile = compileTokenRequirementSet({
    source,
    recipe: fallbackRecipe,
    bindingId: 'web.react',
    profile: 'web.react',
  });
  expectCode('MUXUI_TOKEN_REQUIRED_MISSING', () => validateThemeForRequirementSet({
    requirementSet: otherProfile,
    values: { 'component.button.foreground': '#ffffff' },
  }));

  const tokenFallbackRecipe = structuredClone(recipe);
  tokenFallbackRecipe.requirements[0].fallback = {
    kind: 'token',
    profiles: ['web.html'],
    evidenceIds: ['E-G1.0-03'],
    token: 'semantic.action.background',
  };
  const tokenFallbackSet = compileTokenRequirementSet({
    source,
    recipe: tokenFallbackRecipe,
    bindingId: 'web.html',
    profile: 'web.html',
  });
  assert.ok(tokenFallbackSet.closure.some(({ token }) => token === 'semantic.action.background'));
  expectCode('MUXUI_TOKEN_REQUIRED_MISSING', () => validateThemeForRequirementSet({
    requirementSet: tokenFallbackSet,
    values: { 'component.button.foreground': '#ffffff' },
  }));
  assert.equal(validateThemeForRequirementSet({
    requirementSet: tokenFallbackSet,
    values: {
      'component.button.foreground': '#ffffff',
      'semantic.action.background': '#000000',
    },
  }).diagnostics[0].code, 'MUXUI_TOKEN_FALLBACK_USED');
});

test('E-G1.0-04 requirement digests track exact semantic closure only', () => {
  const base = compileTokenRequirementSet({ source, recipe, bindingId: 'web.html', profile: 'web.html' });
  const unrelated = structuredClone(source);
  unrelated.tokens['semantic.unrelated.value'] = {
    layer: 'semantic', type: 'string', unit: 'string', meaning: 'Unrelated value.',
    overridePolicy: 'theme', value: 'unrelated',
  };
  const unrelatedSet = compileTokenRequirementSet({
    source: unrelated, recipe, bindingId: 'web.html', profile: 'web.html',
  });
  assert.equal(unrelatedSet.digest, base.digest);
  assert.notEqual(unrelatedSet.sourceRevision, base.sourceRevision);

  const dependency = structuredClone(source);
  dependency.tokens['reference.color.brand-60'].value = '#000001';
  const dependencySet = compileTokenRequirementSet({
    source: dependency, recipe, bindingId: 'web.html', profile: 'web.html',
  });
  assert.notEqual(dependencySet.digest, base.digest);
});

test('E-G1.0-06 static mode output works while runtime switching remains unavailable', () => {
  const light = compileWebTheme(source);
  const dark = compileWebTheme(source, { modes: { colorScheme: 'dark' } });
  const reduced = compileNativeTheme(source, {
    profile: 'native.ios',
    modes: { motion: 'reduced' },
  });
  assert.notEqual(light.css, dark.css);
  assert.equal(light.runtimeSwitching, false);
  assert.equal(reduced.runtimeSwitching, false);
  assert.equal(reduced.theme['semantic.motion.feedback'].value, 0);
  assert.equal(source.theme.runtimeSwitching, 'unavailable');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFamily } from '@muxui/schema';
import { compilePureTokenGraph } from '../src/core.mjs';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { compileTokenGraph, compileWebTheme } from '../src/index.mjs';
import {
  compileThemeAuthoringDocument,
  generateScaleTheme,
  serializeThemeAuthoringDocument,
  validateThemeAuthoringDocument,
} from '../src/authoring.mjs';

const base = {
  schema: 'muxui-theme-authoring-v1',
  id: 'muxui:theme:authoring-test',
  source: 'muxui:token:default-theme',
  tokenContractVersion: '2.1.0',
  modes: { colorScheme: ['light', 'dark'], contrast: ['standard'], motion: ['full'], density: ['comfortable'], direction: ['ltr'] },
};

function documentFor(overrides, scale = { mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#79716b', whiteAnchor: false, contrastPivot: 'auto', curvature: 1 }) {
  return { ...base, overrides, scale };
}

function effectSource(value, id = 'semantic.test.effect') {
  const candidate = structuredClone(source);
  candidate.tokens[id] = {
    ...candidate.tokens['reference.effect.shadow-xs'],
    layer: 'semantic',
    overridePolicy: 'theme',
    meaning: 'Effect test token.',
    value,
  };
  return candidate;
}

function effectValue(layer) {
  const value = structuredClone(source.tokens['reference.effect.shadow-xs'].value);
  value.layers[0] = { ...value.layers[0], ...layer };
  return value;
}

test('schema and pure compiler reject ambiguous alias branches', () => {
  for (const decoration of [{ value: 999 }, { relative: { value: 1, unit: 'rem' } }]) {
    for (const dark of [false, true]) {
      const invalid = structuredClone(source);
      const token = invalid.tokens['semantic.control.radius'];
      if (dark) token.modes = { 'colorScheme.dark': { alias: token.alias, ...decoration } };
      else Object.assign(token, decoration);
      assert.throws(() => validateFamily('token-source', invalid), /MUXUI_SCHEMA_INVALID/u);
      assert.throws(() => compilePureTokenGraph(invalid, { modes: { colorScheme: dark ? 'dark' : 'light' } }), /MUXUI_TOKEN_DECORATION_INVALID/u);
    }
  }
  // A mix may retain its concrete fallback; that is distinct from an alias.
  const mixed = structuredClone(source);
  mixed.tokens['semantic.effect.scrim'].value = '#11100f7a';
  validateFamily('token-source', mixed);
  compilePureTokenGraph(mixed);
  const unknownModeField = structuredClone(source);
  unknownModeField.tokens['semantic.control.radius'].modes = {
    'colorScheme.dark': { alias: 'reference.dimension.radius-m', futureDecoration: { ignored: true } },
  };
  assert.throws(() => validateFamily('token-source', unknownModeField), /MUXUI_SCHEMA_INVALID/u);
  assert.throws(() => compilePureTokenGraph(unknownModeField), /MUXUI_TOKEN_DECORATION_INVALID/u);
  const injectedId = structuredClone(source);
  injectedId.tokens['semantic.bad);color:red'] = { ...source.tokens['reference.color.brand-60'], layer: 'semantic' };
  assert.throws(() => compilePureTokenGraph(injectedId), /MUXUI_TOKEN_SOURCE_INVALID/u);
});

test('effect validators reject malformed shadow layers across schema, pure, Node, and authoring paths', () => {
  const cases = [
    ['inset', effectValue({ inset: 'yes' }), /MUXUI_THEME_EFFECT_INVALID/u],
    ['dual opacity', effectValue({ color: { value: '#ff000080', alpha: 1 } }), /MUXUI_THEME_ALPHA_INVALID/u],
    ['negative blur', effectValue({ blur: { value: -1, unit: 'px' } }), /MUXUI_THEME_LENGTH_INVALID/u],
  ];
  for (const [label, value, authoringCode] of cases) {
    const invalid = effectSource(value);
    assert.throws(() => validateFamily('token-source', invalid), /MUXUI_SCHEMA_INVALID/u, label);
    assert.throws(() => compilePureTokenGraph(invalid), /MUXUI_TOKEN_TYPE_MISMATCH/u, label);
    assert.throws(() => compileTokenGraph(invalid), /MUXUI_SCHEMA_INVALID/u, label);
    assert.throws(() => validateThemeAuthoringDocument({ ...base, overrides: {
      'semantic.test.effect': { type: 'effect', unit: 'structured', value },
    } }, { source: invalid }), authoringCode, label);
  }

  const wrongType = effectSource('#000000');
  wrongType.tokens['semantic.test.effect'].unit = 'px';
  assert.throws(() => validateFamily('token-source', wrongType), /MUXUI_SCHEMA_INVALID/u);
  assert.throws(() => compilePureTokenGraph(wrongType), /MUXUI_TOKEN_TYPE_MISMATCH|MUXUI_TOKEN_UNIT_MISMATCH/u);
});

test('effect overrides keep the canonical value and redundant effect structurally aligned', () => {
  const value = effectValue({});
  const candidate = effectSource(value);
  const equivalent = {
    kind: value.kind,
    layers: structuredClone(value.layers),
  };
  assert.doesNotThrow(() => compilePureTokenGraph(candidate, {
    overrides: { 'semantic.test.effect': { type: 'effect', unit: 'structured', value, effect: equivalent } },
  }));

  const conflicting = structuredClone(equivalent);
  conflicting.layers[0].offsetX = { value: 1, unit: 'px' };
  assert.throws(() => compilePureTokenGraph(candidate, {
    overrides: { 'semantic.test.effect': { type: 'effect', unit: 'structured', value, effect: conflicting } },
  }), /MUXUI_TOKEN_DECORATION_INVALID/u);
});

test('schema rejects effect-shaped objects on non-effect literals and mode branches', () => {
  const invalidLiteral = structuredClone(source);
  invalidLiteral.tokens['reference.color.brand-60'].value = effectValue({});
  assert.throws(() => validateFamily('token-source', invalidLiteral), /MUXUI_SCHEMA_INVALID/u);
  assert.throws(() => compilePureTokenGraph(invalidLiteral), /MUXUI_TOKEN_TYPE_MISMATCH/u);
  assert.throws(() => compileTokenGraph(invalidLiteral), /MUXUI_SCHEMA_INVALID/u);

  const invalidMode = structuredClone(source);
  invalidMode.tokens['semantic.control.padding-inline'].modes = {
    'density.compact': { value: effectValue({}) },
  };
  assert.throws(() => validateFamily('token-source', invalidMode), /MUXUI_SCHEMA_INVALID/u);
  assert.throws(() => compilePureTokenGraph(invalidMode, { modes: { density: 'compact' } }), /MUXUI_TOKEN_TYPE_MISMATCH/u);
  assert.throws(() => compileTokenGraph(invalidMode, { modes: { density: 'compact' } }), /MUXUI_SCHEMA_INVALID/u);
  validateFamily('token-source', source);
});

test('effect tokens reject non-effect recipes in schema and compiler', () => {
  for (const field of ['fluid', 'formula', 'relative', 'mix']) {
    const recipe = Object.values(source.tokens).find((token) => Object.hasOwn(token, field))?.[field];
    assert.ok(recipe, `canonical ${field} recipe is available`);
    for (const withValue of [true, false]) {
      const invalid = effectSource(effectValue({}));
      const token = invalid.tokens['semantic.test.effect'];
      token[field] = structuredClone(recipe);
      if (!withValue) delete token.value;
      assert.throws(() => validateFamily('token-source', invalid), /MUXUI_SCHEMA_INVALID/u, field);
      assert.throws(() => compilePureTokenGraph(invalid), /MUXUI_TOKEN_DECORATION_INVALID/u, field);
      assert.throws(() => compileTokenGraph(invalid), /MUXUI_SCHEMA_INVALID/u, field);
    }
  }
});

test('effect mode branches use the same typed shadow validation and retain aliases', () => {
  const invalid = effectSource(structuredClone(source.tokens['reference.effect.shadow-xs'].value));
  invalid.tokens['semantic.test.effect'].modes = {
    'colorScheme.dark': { value: effectValue({ inset: 'yes' }) },
  };
  assert.throws(() => validateFamily('token-source', invalid), /MUXUI_SCHEMA_INVALID/u);
  assert.throws(() => compilePureTokenGraph(invalid, { modes: { colorScheme: 'dark' } }), /MUXUI_TOKEN_TYPE_MISMATCH/u);
  assert.throws(() => compileTokenGraph(invalid, { modes: { colorScheme: 'dark' } }), /MUXUI_SCHEMA_INVALID/u);
  assert.throws(() => compileThemeAuthoringDocument({ ...base, overrides: {} }, {
    source: invalid,
    modes: { colorScheme: 'dark' },
  }), /MUXUI_TOKEN_TYPE_MISMATCH/u);

  const aliasSource = structuredClone(source);
  aliasSource.tokens['semantic.test.effect'] = {
    layer: 'semantic',
    type: 'effect',
    unit: 'structured',
    meaning: 'Effect alias test token.',
    overridePolicy: 'theme',
    alias: 'reference.effect.shadow-xs',
    equivalence: 'semantic-equivalence',
    modes: { 'colorScheme.dark': { alias: 'reference.effect.shadow-s' } },
  };
  validateFamily('token-source', aliasSource);
  assert.equal(compilePureTokenGraph(aliasSource, { modes: { colorScheme: 'dark' } }).tokens['semantic.test.effect'].source, 'alias');
});

test('effect color alpha representations preserve transparency through Node and authoring CSS', () => {
  const candidate = effectSource(effectValue({ color: { value: '#ff0000', alpha: 0.5 } }), 'semantic.test.effect-alpha');
  candidate.tokens['semantic.test.effect-rgba'] = {
    ...candidate.tokens['semantic.test.effect-alpha'],
    meaning: 'RGBA effect test token.',
    value: effectValue({ color: { value: '#00ff0080' } }),
  };
  const nodeCss = compileWebTheme(candidate).css;
  assert.match(nodeCss, /--muxui-semantic-test-effect-alpha: 0px 1px 2px 0px rgba\(255, 0, 0, 0\.5\);/u);
  assert.match(nodeCss, /--muxui-semantic-test-effect-rgba: 0px 1px 2px 0px #00ff0080;/u);
  const authored = compileThemeAuthoringDocument({ ...base, overrides: {} }, { source: candidate });
  assert.match(authored.css, /--muxui-semantic-test-effect-alpha: 0px 1px 2px 0px rgba\(255, 0, 0, 0\.5\);/u);
  assert.match(authored.css, /--muxui-semantic-test-effect-rgba: 0px 1px 2px 0px #00ff0080;/u);
});

test('authoring cannot substitute defaults for absent canonical metadata', () => {
  const document = { ...base, overrides: {} };
  const inputs = { source, mode: 'standard', namedColor: '#025768', neutralColor: '#79716b' };
  for (const key of ['scale', 'fonts', 'typography']) {
    const invalid = structuredClone(source);
    delete invalid.theme[key];
    // The general token schema still admits historical 2.1 records. Scale
    // authoring adds the complete metadata requirement at its entry point.
    validateFamily('token-source', invalid);
    assert.throws(() => serializeThemeAuthoringDocument(document, { source: invalid }), /MUXUI_THEME_SOURCE_METADATA_INVALID/u);
    assert.throws(() => generateScaleTheme({ ...inputs, source: invalid }), /MUXUI_THEME_SOURCE_METADATA_INVALID/u);
  }
  for (const key of ['namedShades', 'neutralShades', 'radius', 'contrast', 'standardPresets']) {
    const invalid = structuredClone(source);
    delete invalid.theme.scale[key];
    assert.throws(() => generateScaleTheme({ ...inputs, source: invalid }), /MUXUI_THEME_SOURCE_METADATA_INVALID/u);
  }
  assert.throws(() => generateScaleTheme({ ...inputs, source: undefined }), /MUXUI_THEME_SOURCE_REQUIRED/u);
  for (const path of [
    ['fonts', 'display', 'assets', 'normal', 'path'],
    ['fonts', 'display', 'assets', 'normal', 'sha256'],
    ['fonts', 'display', 'provenance', 'revision'],
  ]) {
    const invalid = structuredClone(source);
    const parent = path.slice(0, -1).reduce((value, key) => value[key], invalid.theme);
    delete parent[path.at(-1)];
    assert.throws(() => serializeThemeAuthoringDocument(document, { source: invalid }), /MUXUI_THEME_SOURCE_METADATA_INVALID/u);
  }
  const invalidTypography = structuredClone(source);
  Object.values(invalidTypography.theme.typography.roles.display.variants)[0].fontSize = 'reference.color.brand-60';
  assert.throws(() => serializeThemeAuthoringDocument(document, { source: invalidTypography }), /MUXUI_THEME_SOURCE_METADATA_INVALID/u);
});

test('serialization rejects unknown mode axes and duplicate mode values', () => {
  for (const patch of [{ oops: ['x'] }, { colorScheme: ['light', 'light'] }]) {
    const document = { ...base, modes: { ...base.modes, ...patch }, overrides: {} };
    assert.throws(() => serializeThemeAuthoringDocument(document, { source }), /MUXUI_THEME_(?:UNKNOWN_FIELD|MODES_INVALID)/u);
  }
});

test('authoring compile uses canonical scale data and propagates radius and foreground overrides', () => {
  const generated = generateScaleTheme({ source, mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#79716b', contrastPivot: 'auto', whiteAnchor: false, curvature: 1 });
  const document = documentFor(generated.overrides);
  validateThemeAuthoringDocument(document, { source });
  const compiled = compileThemeAuthoringDocument(document, { source, selector: '.muxui-scale-preview' });
  assert.match(compiled.css, /\.muxui-scale-preview \{/u);
  assert.match(compiled.css, /--muxui-reference-dimension-radius-m: 1rem;/u);
  assert.match(compiled.css, /--muxui-semantic-color-color-60-fg:/u);
  assert.equal(compiled.tokens['component.button.radius'].value, 16);
  const curved = generateScaleTheme({ source, mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#79716b', contrastPivot: 'auto', whiteAnchor: false, curvature: 0.5 });
  assert.equal(curved.assignments['reference.dimension.radius-m'].value, 8);
  assert.notEqual(curved.assignments['reference.dimension.radius-m'].value, generated.assignments['reference.dimension.radius-m'].value);
});

test('authoring validation rejects unsafe string overrides', () => {
  const document = documentFor({ 'semantic.typography.display-letter-spacing': { type: 'string', unit: 'string', value: '0;}</style><style>' } });
  assert.throws(() => validateThemeAuthoringDocument(document, { source }), /MUXUI_THEME_STRING_INVALID/u);
});

test('authoring alias overrides are type checked and win over source aliases', () => {
  const overrides = { 'semantic.control.radius': { type: 'dimension', unit: 'px', value: 3 } };
  const document = { ...base, overrides };
  validateThemeAuthoringDocument(document, { source });
  const compiled = compileThemeAuthoringDocument(document, { source });
  assert.equal(compiled.tokens['component.button.radius'].value, 3);
  assert.throws(() => validateThemeAuthoringDocument({ ...base, overrides: { 'semantic.control.radius': { type: 'color', unit: 'hex', value: '#000000' } } }, { source }), /MUXUI_THEME_OVERRIDE_TYPE_INVALID/u);
});

test('authoring requires canonical source, declared modes, exact scale assignments, and closed decorations', () => {
  const generated = generateScaleTheme({ source, mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#79716b', contrastPivot: 'auto', whiteAnchor: false, curvature: 1 });
  const document = documentFor(generated.overrides);
  assert.throws(() => validateThemeAuthoringDocument(document), /MUXUI_THEME_SOURCE_REQUIRED/u);
  assert.throws(() => validateThemeAuthoringDocument({ ...document, overrides: { ...document.overrides, 'reference.dimension.radius-m': { ...document.overrides['reference.dimension.radius-m'], value: 999 } } }, { source }), /MUXUI_THEME_SCALE_ASSIGNMENT_INVALID/u);
  assert.throws(() => validateThemeAuthoringDocument({ ...base, overrides: { 'semantic.control.radius': { type: 'dimension', unit: 'px', value: 3, fluid: { min: 1, max: 2, coefficient: 1, offset: 0, lengthUnit: 'px', viewportUnit: 'vw' }, formula: { kind: 'multiply', token: 'semantic.control.radius', factor: 1 } } } }, { source }), /MUXUI_TOKEN_DECORATION_INVALID/u);
  assert.throws(() => validateThemeAuthoringDocument({ ...base, overrides: { 'semantic.control.radius': { type: 'dimension', unit: 'px', value: 3, formula: { kind: 'multiply', token: 'x); color: red; /*', factor: 1 } } } }, { source }), /MUXUI_TOKEN_DECORATION_INVALID/u);
  const effectSource = structuredClone(source);
  effectSource.tokens['semantic.test.effect'] = { ...effectSource.tokens['reference.effect.shadow-xs'], layer: 'semantic', overridePolicy: 'theme', meaning: 'Effect test token.' };
  assert.throws(() => validateThemeAuthoringDocument({ ...base, overrides: { 'semantic.test.effect': { type: 'effect', unit: 'structured', value: effectSource.tokens['semantic.test.effect'].value, effect: { ...effectSource.tokens['semantic.test.effect'].value, extra: true } } } }, { source: effectSource }), /MUXUI_TOKEN_TYPE_MISMATCH/u);
  const darkOnly = { ...base, modes: { colorScheme: ['dark'], contrast: ['standard'], motion: ['full'], density: ['comfortable'], direction: ['ltr'] }, overrides: {} };
  assert.equal(compileThemeAuthoringDocument(darkOnly, { source }).modes.colorScheme, 'dark');
  assert.throws(() => compileThemeAuthoringDocument(darkOnly, { source, modes: { colorScheme: 'light' } }), /MUXUI_THEME_MODE_UNKNOWN/u);
});

test('formula and relative overrides resolve through aliases while native output defers unsupported recipes', () => {
  const relativeSource = structuredClone(source);
  relativeSource.tokens['semantic.test.relative'] = { layer: 'semantic', type: 'dimension', unit: 'px', meaning: 'Relative test token.', overridePolicy: 'theme', value: 8, relative: { value: 0.5, unit: 'rem' } };
  relativeSource.tokens['component.test.relative'] = { layer: 'component', type: 'dimension', unit: 'px', meaning: 'Relative test alias.', overridePolicy: 'theme', alias: 'semantic.test.relative' };
  const document = { ...base, overrides: { 'semantic.typography.title-l-font-size': { type: 'dimension', unit: 'px', value: 0, formula: { kind: 'multiply', token: 'semantic.typography.title-l-font-size', factor: 1 } } } };
  assert.throws(() => compileThemeAuthoringDocument(document, { source }), /MUXUI_TOKEN_ALIAS_CYCLE/u);
  const compiled = compileThemeAuthoringDocument({ ...base, overrides: {} }, { source: relativeSource, target: 'native.ios' });
  assert.equal(compiled.tokens['semantic.test.relative'], undefined);
  assert.equal(compiled.tokens['component.test.relative'], undefined);
  assert.ok(compiled.diagnostics.some(({ code }) => code === 'MUXUI_THEME_RELATIVE_ROOT_METRIC_REQUIRED'));
  const withMetric = compileThemeAuthoringDocument({ ...base, overrides: {} }, { source: relativeSource, target: 'native.ios', rootFontSizePx: 20 });
  assert.equal(withMetric.tokens['semantic.test.relative'].value, 10);
  assert.equal(withMetric.tokens['component.test.relative'].value, 10);
});

test('bounded srgb mixes resolve to a native fallback and a browser recipe', () => {
  const mixSource = structuredClone(source);
  mixSource.tokens['semantic.test.mixed-color'] = {
    layer: 'semantic', type: 'color', unit: 'hex', meaning: 'Mixed test color.', overridePolicy: 'theme', value: '#000000',
    mix: { space: 'srgb', token: 'semantic.color.neutral-default-10', color: '#00000000', weight: 0.85 },
  };
  const web = compileThemeAuthoringDocument({ ...base, overrides: {} }, { source: mixSource });
  const native = compileThemeAuthoringDocument({ ...base, overrides: {} }, { source: mixSource, target: 'native.ios' });
  assert.match(web.css, /color-mix\(in srgb, var\(--muxui-semantic-color-neutral-default-10\) 85%, #00000000\)/u);
  assert.match(native.tokens['semantic.test.mixed-color'].value, /^#[0-9a-f]{8}$/u);
  assert.throws(() => compileThemeAuthoringDocument({ ...base, overrides: { 'semantic.test.mixed-color': { type: 'color', unit: 'hex', value: '#000000', mix: { space: 'srgb', token: 'component.button.background', color: '#000000', weight: 0.85 } } } }, { source: mixSource }), /MUXUI_TOKEN_LAYER_DIRECTION/u);
});

test('Scale dark compilation selects generated foreground recipes without changing persisted light overrides', () => {
  const darkSource = structuredClone(source);
  darkSource.tokens['semantic.color.neutral-10'] = { layer: 'semantic', type: 'color', unit: 'hex', meaning: 'Dark neutral mix input.', overridePolicy: 'theme', alias: 'reference.color.neutral-10', modes: { 'colorScheme.dark': { alias: 'reference.color.neutral-100' } } };
  const generated = generateScaleTheme({ source: darkSource, mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#79716b', contrastPivot: 'auto', whiteAnchor: false, curvature: 1 });
  const compiled = compileThemeAuthoringDocument(documentFor(generated.overrides), { source: darkSource, modes: { colorScheme: 'dark' } });
  assert.match(compiled.css, /--muxui-semantic-color-neutral-60-fg: color-mix\(in srgb, var\(--muxui-semantic-color-neutral-10\) 85%, #000000\);/u);
  assert.equal(generated.overrides['semantic.color.neutral-60-fg'].mix, undefined);
});

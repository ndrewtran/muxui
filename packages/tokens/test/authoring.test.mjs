import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFamily } from '@muxui/schema';
import { compilePureTokenGraph, cssValue } from '../src/core.mjs';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { compileNativeTheme, compileTokenGraph, compileWebTheme } from '../src/index.mjs';
import {
  compileThemeAuthoringDocument,
  compileScalePresetTheme,
  generateScaleTheme,
  getScaleApcaContrast,
  getScaleContrastRatio,
  scaleForegrounds,
  serializeThemeAuthoringDocument,
  validateThemeAuthoringDocument,
} from '../src/authoring.mjs';

const base = {
  schema: 'muxui-theme-authoring-v1',
  id: 'muxui:theme:authoring-test',
  source: 'muxui:token:default-theme',
  tokenContractVersion: source.tokenContractVersion,
  modes: { colorScheme: ['light', 'dark'], contrast: ['standard'], motion: ['full'], density: ['comfortable'], direction: ['ltr'] },
};

function documentFor(overrides, scale = { mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#79716b', whiteAnchor: false, contrastPivot: 'auto', curvature: 1 }) {
  return { ...base, overrides, scale };
}

test('canonical Scale presets compile through the shared authoring path in both color schemes', () => {
  const presetInputs = [
    ['standard', source.theme.scale.standardPresets],
    ['monochrome', source.theme.scale.monochromePresets],
  ];
  const ids = [];
  for (const [collection, presets] of presetInputs) {
    for (const { id, name, description } of presets) {
      const compiled = compileScalePresetTheme({ source, collection, presetId: id, modes: { colorScheme: 'light' } });
      const dark = compileScalePresetTheme({ source, collection, presetId: id, modes: { colorScheme: 'dark', contrast: 'standard' } });
      const darkMore = compileScalePresetTheme({ source, collection, presetId: id, modes: { colorScheme: 'dark', contrast: 'more' } });
      ids.push(compiled.preset.id);
      assert.equal(compiled.preset.name, name);
      assert.equal(compiled.preset.description, description);
      assert.match(compiled.preset.swatch.primary, /^#[0-9a-f]{6}$/u);
      assert.match(compiled.preset.swatch.secondary, /^#[0-9a-f]{6}$/u);
      assert.equal(compiled.compiled.tokens['semantic.color.color-60'].value, compiled.preset.swatch.primary);
      assert.equal(compiled.compiled.tokens['semantic.color.neutral-20'].value, compiled.preset.swatch.secondary);
      assert.equal(dark.compiled.modes.colorScheme, 'dark');
      assert.equal(darkMore.compiled.modes.contrast, 'more');
      assert.notEqual(compiled.compiled.tokens['component.button.background'].value, dark.compiled.tokens['component.button.background'].value);
      assert.deepEqual(JSON.parse(serializeThemeAuthoringDocument(compiled.document, { source })), compiled.document);
    }
  }
  assert.equal(new Set(ids).size, 15);
  assert.throws(() => compileScalePresetTheme({ source, collection: 'other', presetId: 'harbour' }), /COLLECTION_INVALID/u);
  assert.throws(() => compileScalePresetTheme({ source, collection: 'standard', presetId: 'missing' }), /PRESET_INVALID/u);
});

test('documents, sources and Scale generation stay on the canonical token contract version', () => {
  const offContract = { ...source, tokenContractVersion: `${source.tokenContractVersion}-other` };
  const scale = documentFor({}).scale;
  // On failure, update TOKEN_CONTRACT_VERSION in src/authoring.mjs to the canonical source's version.
  assert.doesNotThrow(() => {
    validateThemeAuthoringDocument({ ...base, overrides: {} }, { source });
    generateScaleTheme({ source, ...scale });
    compileScalePresetTheme({ source, presetId: 'harbour' });
  }, 'src/authoring.mjs must accept the canonical source tokenContractVersion');
  assert.throws(() => validateThemeAuthoringDocument({ ...base, tokenContractVersion: offContract.tokenContractVersion, overrides: {} }, { source: offContract }), /MUXUI_THEME_CONTRACT_INVALID/u);
  assert.throws(() => validateThemeAuthoringDocument({ ...base, overrides: {} }, { source: offContract }), /MUXUI_THEME_CONTRACT_INVALID/u);
  assert.throws(() => generateScaleTheme({ source: offContract, ...scale }), /MUXUI_THEME_CONTRACT_INVALID/u);
  assert.throws(() => compileScalePresetTheme({ source: offContract, presetId: 'harbour' }), /MUXUI_THEME_CONTRACT_INVALID/u);
});

test('authoring documents written for the previous contract version are rejected with the versions and the guide to read', () => {
  assert.equal(source.tokenContractVersion, '8.0.0');
  assert.throws(
    () => validateThemeAuthoringDocument({ ...base, tokenContractVersion: '7.0.0', overrides: {} }, { source }),
    { message: 'MUXUI_THEME_CONTRACT_INVALID: document declares tokenContractVersion 7.0.0, required 8.0.0. See the token contract migration guide.' },
  );
  assert.throws(() => validateThemeAuthoringDocument({ ...base, tokenContractVersion: undefined, overrides: {} }, { source }), /MUXUI_THEME_CONTRACT_INVALID: document declares tokenContractVersion undefined, required 8\.0\.0/u);
  // An off-contract source is a different fault, so it names the source and no guide.
  assert.throws(
    () => validateThemeAuthoringDocument({ ...base, overrides: {} }, { source: { ...source, tokenContractVersion: '7.0.0' } }),
    { message: 'MUXUI_THEME_CONTRACT_INVALID: source declares tokenContractVersion 7.0.0, required 8.0.0' },
  );
});

// 7.0.0 gave a neutral palette under Auto the fixed pivot 60 (shade-5 text from shade 60), and 8.0.0 picks the better endpoint
// for the chosen method. For this palette Auto moves only the shade-60 foreground, so a document written for 7.0.0 keeps the
// old one and carries the Scale-owned assignments of the old rule.
test('a 7.0.0 document with neutral Auto migrates by regenerating its Scale-owned assignments, keeping its extra overrides and modes', () => {
  const scale = { mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#878685', whiteAnchor: false, contrastPivot: 'auto', curvature: 1 };
  const current = generateScaleTheme({ source, ...scale });
  const light = current.palettes.neutral.find(({ shade }) => shade === 5).hex;
  const dark = current.palettes.neutral.find(({ shade }) => shade === 100).hex;
  const legacyForegrounds = Object.fromEntries(current.palettes.neutral.map(({ shade }) => [`semantic.color.neutral-${shade}-fg`, { type: 'color', unit: 'hex', value: shade >= 60 ? light : dark }]));
  const extra = { 'semantic.typography.display-font-weight': { type: 'number', unit: 'unitless', value: 700 } };
  const modes = { colorScheme: ['dark'], contrast: ['standard', 'more'], motion: ['reduced'], density: ['compact'], direction: ['ltr'] };
  const written = { ...base, tokenContractVersion: '7.0.0', modes, overrides: { ...extra, ...current.assignments, ...legacyForegrounds }, scale };
  assert.deepEqual(Object.keys(legacyForegrounds).filter((id) => legacyForegrounds[id].value !== current.assignments[id].value), ['semantic.color.neutral-60-fg']);
  assert.equal(written.overrides['semantic.color.neutral-60-fg'].value, '#f9f7f5');
  assert.equal(current.assignments['semantic.color.neutral-60-fg'].value, '#323130');

  // Changing only the version leaves the old shade-60 foreground in place, which the document's own inputs no longer produce.
  assert.throws(() => validateThemeAuthoringDocument(written, { source }), /MUXUI_THEME_CONTRACT_INVALID: document declares tokenContractVersion 7\.0\.0, required 8\.0\.0/u);
  assert.throws(() => validateThemeAuthoringDocument({ ...written, tokenContractVersion: source.tokenContractVersion }, { source }), /MUXUI_THEME_SCALE_ASSIGNMENT_INVALID: semantic\.color\.neutral-60-fg/u);

  // The recovery: regenerate the assignments from the document's `scale` inputs, keep every other override and the modes.
  const { assignments } = generateScaleTheme({ source, ...written.scale });
  const kept = Object.fromEntries(Object.entries(written.overrides).filter(([id]) => !Object.hasOwn(assignments, id)));
  const migrated = { ...written, tokenContractVersion: source.tokenContractVersion, overrides: { ...kept, ...assignments } };
  assert.equal(validateThemeAuthoringDocument(migrated, { source }), migrated);
  assert.deepEqual(kept, extra);
  assert.deepEqual(migrated.overrides['semantic.typography.display-font-weight'], extra['semantic.typography.display-font-weight']);
  assert.deepEqual(migrated.modes, modes);
  assert.deepEqual(migrated.scale, scale);
  assert.equal(migrated.overrides['semantic.color.neutral-60-fg'].value, '#323130');
  assert.match(compileThemeAuthoringDocument(migrated, { source, modes: { colorScheme: 'dark', motion: 'reduced', density: 'compact' } }).css, /--muxui-semantic-typography-display-font-weight: 700;/u);
});

test('authoring documents that override a removed motion easing token are rejected', () => {
  for (const id of ['semantic.motion.reveal-easing', 'semantic.motion.dismiss-easing', 'semantic.motion.modal-easing']) {
    const overrides = { [id]: { type: 'easing', unit: 'structured', value: { kind: 'keyword', value: 'linear' } } };
    assert.throws(() => validateThemeAuthoringDocument({ ...base, overrides }, { source }), new RegExp(`MUXUI_THEME_OVERRIDE_UNKNOWN: ${id}`, 'u'));
  }
});

test('selection, focus and link interaction roles follow authored palettes in both modes', () => {
  for (const namedColor of ['#9227ad', '#207c39']) {
    const scale = { ...documentFor({}).scale, namedColor };
    const generated = generateScaleTheme({ source, ...scale });
    const document = documentFor(generated.assignments, scale);
    for (const colorScheme of ['light', 'dark']) {
      const { tokens } = compileThemeAuthoringDocument(document, { source, modes: { colorScheme } });
      for (const [role, palette] of [
        ['semantic.selection.track', 'semantic.color.color-60'],
        ['semantic.focus.ring', 'semantic.color.color-60'],
        ['semantic.content.link-hover', 'semantic.color.color-100'],
        ['semantic.content.link-pressed', 'semantic.color.color-90'],
        ['semantic.action.foreground', 'semantic.color.color-60-fg'],
      ]) assert.equal(tokens[role].value, tokens[palette].value, `${colorScheme}: ${role}`);
    }
  }
});

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

test('web serializers preserve authored aliases while resolved graph and native values remain unchanged', () => {
  const graph = compilePureTokenGraph(source);
  const web = compileWebTheme(source);
  const compactWeb = compileWebTheme(source, { modes: { density: 'compact' } });
  const native = compileNativeTheme(source, { profile: 'native.ios' });

  assert.equal(graph.tokens['semantic.control.radius'].value, source.tokens['reference.dimension.radius-m'].value);
  assert.equal(cssValue(graph.tokens['semantic.control.radius']), '0.5rem');
  assert.match(web.css, /--muxui-semantic-control-radius: var\(--muxui-reference-dimension-radius-m\);/u);
  assert.match(web.css, /--muxui-component-button-padding-inline: var\(--muxui-semantic-control-padding-inline\);/u);
  assert.match(compactWeb.css, /--muxui-semantic-control-padding-inline: var\(--muxui-reference-dimension-space-3xs\);/u);
  assert.equal(native.theme['semantic.action.background'].value, graph.tokens['semantic.action.background'].value);
  assert.equal(native.theme['component.button.background'].value, graph.tokens['component.button.background'].value);

  const overridden = compileWebTheme(source, {
    overrides: { 'semantic.control.radius': { type: 'dimension', unit: 'px', value: 3 } },
  });
  assert.match(overridden.css, /--muxui-semantic-control-radius: 3px;/u);
  assert.doesNotMatch(overridden.css, /--muxui-semantic-control-radius: var\(/u);

  assert.match(web.css, /--muxui-reference-dimension-radius-m: 0\.5rem;/u);
  assert.match(web.css, /--muxui-semantic-effect-scrim: color-mix\(in srgb, var\(--muxui-semantic-color-neutral-default-100\) 48%, #00000000\);/u);
  assert.match(compileWebTheme(source, { responsive: true }).css, /--muxui-reference-dimension-section-space-l: clamp\(/u);

  const effectAliasSource = structuredClone(source);
  effectAliasSource.tokens['semantic.test.effect-alias'] = {
    layer: 'semantic',
    type: 'effect',
    unit: 'structured',
    meaning: 'Effect alias serializer test.',
    overridePolicy: 'theme',
    alias: 'reference.effect.shadow-xs',
    equivalence: 'semantic-equivalence',
  };
  const effectGraph = compilePureTokenGraph(effectAliasSource);
  const effectWeb = compileWebTheme(effectAliasSource);
  const effectNative = compileNativeTheme(effectAliasSource, { profile: 'native.ios' });
  assert.match(effectWeb.css, /--muxui-semantic-test-effect-alias: var\(--muxui-reference-effect-shadow-xs\);/u);
  assert.deepEqual(effectNative.theme['semantic.test.effect-alias'], {
    type: 'effect',
    unit: 'structured',
    value: effectGraph.tokens['semantic.test.effect-alias'].value,
    effect: effectGraph.tokens['semantic.test.effect-alias'].effect,
  });
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

test('authoring defaults curvature from the canonical Scale metadata', () => {
  const generated = generateScaleTheme({ source, mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#79716b', whiteAnchor: false });
  assert.equal(source.theme.scale.radius.curvature.default, 0.5);
  assert.equal(generated.radius.curvature, 0.5);
  for (const [name, sourcePx, sourceRem, generatedPx, generatedRem] of [
    ['xs', 4, 0.25, 4, 0.25],
    ['s', 6, 0.375, 6, 0.375],
    ['m', 8, 0.5, 8, 0.5],
    ['l', 12, 0.75, 12, 0.75],
    ['xl', 16, 1, 16, 1],
    ['2xl', 24, 1.5, 24, 1.5],
  ]) {
    const id = `reference.dimension.radius-${name}`;
    assert.deepEqual(source.tokens[id].relative, { value: sourceRem, unit: 'rem' });
    assert.equal(source.tokens[id].value, sourcePx);
    assert.deepEqual(generated.assignments[id], { type: 'dimension', unit: 'px', value: generatedPx, relative: { value: generatedRem, unit: 'rem' } });
  }
});

test('semantic radius aliases track nondefault Scale curvature', () => {
  const scale = { ...documentFor({}).scale, curvature: 1.25 };
  const generated = generateScaleTheme({ source, ...scale });
  const document = documentFor(generated.assignments, scale);
  const { tokens } = compileThemeAuthoringDocument(document, { source });
  assert.equal(tokens['semantic.shape.radius-xs'].value, 10);
  assert.equal(tokens['semantic.shape.radius-s'].value, 15);
  assert.equal(tokens['semantic.shape.radius-xs'].value, tokens['reference.dimension.radius-xs'].value);
  assert.equal(tokens['semantic.shape.radius-s'].value, tokens['reference.dimension.radius-s'].value);
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
  // The mix follows whichever dark neutral shade first takes the blackened shade-5 text, so it moves with the method.
  const apcaScale = { ...documentFor({}).scale, contrastAlgorithm: 'apca-endpoint-v1' };
  const apca = generateScaleTheme({ source: darkSource, mode: 'standard', presetId: 'harbour', ...apcaScale });
  const apcaCompiled = compileThemeAuthoringDocument(documentFor(apca.overrides, apcaScale), { source: darkSource, modes: { colorScheme: 'dark' } });
  assert.match(apcaCompiled.css, /--muxui-semantic-color-neutral-70-fg: color-mix\(in srgb, var\(--muxui-semantic-color-neutral-10\) 85%, #000000\);/u);
  assert.doesNotMatch(apcaCompiled.css, /--muxui-semantic-color-neutral-60-fg: color-mix/u);
});

const WCAG = 'wcag2-endpoint-v1';
const APCA = 'apca-endpoint-v1';

test('APCA 0.0.98G-4g matches the reference lightness contrast values', () => {
  for (const [text, background, lc] of [
    ['#888888', '#ffffff', 63.0565],
    ['#ffffff', '#888888', -68.5415],
    ['#000000', '#aaaaaa', 58.1463],
    ['#aaaaaa', '#000000', -56.2411],
    ['#112233', '#ddeeff', 91.6683],
  ]) assert.equal(Number(getScaleApcaContrast(text, background).toFixed(4)), lc, `${text} on ${background}`);
  assert.equal(getScaleApcaContrast('#777777', '#777777'), 0);
});

test('APCA scores opaque #rrggbb only while the WCAG ratio keeps its lenient parsing', () => {
  for (const invalid of ['#00000000', '#ffffff80', '#fff', 'ffffff', 'red', '', null, undefined, 0x888888]) {
    assert.throws(() => getScaleApcaContrast(invalid, '#ffffff'), /^TypeError: MUXUI_THEME_COLOR_INVALID: textHex$/u, `text ${String(invalid)}`);
    assert.throws(() => getScaleApcaContrast('#000000', invalid), /^TypeError: MUXUI_THEME_COLOR_INVALID: backgroundHex$/u, `background ${String(invalid)}`);
  }
  assert.equal(Number(getScaleApcaContrast('#888888', '#FFFFFF').toFixed(4)), 63.0565, 'hex digits are case-insensitive');
  // getContrastRatio is unchanged: it reads the first six digits and ignores alpha.
  assert.equal(getScaleContrastRatio('#00000080', '#ffffff'), getScaleContrastRatio('#000000', '#ffffff'));
});

test('scaleForegrounds scores every shade under the chosen method and owns the endpoint rules', () => {
  const { palettes } = generateScaleTheme({ source, mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#79716b' });
  const named = (algorithm, pivot = 'auto') => scaleForegrounds(palettes.named, { pivot, algorithm });
  const at = (list, shade) => list.find((entry) => entry.shade === shade);
  // Harbour 40 (#648f9b) is where the two methods disagree.
  const wcag40 = at(named(WCAG), 40);
  assert.equal(wcag40.text, '#00222a');
  assert.equal(wcag40.alternative, '#f2f9fb');
  assert.equal(wcag40.score.toFixed(2), '4.71');
  assert.equal(wcag40.safe, true);
  const apca40 = at(named(APCA), 40);
  assert.equal(apca40.text, '#f2f9fb');
  assert.equal(Math.round(apca40.score), 64);
  assert.ok(apca40.alternativeScore < apca40.score);
  const apca30 = at(named(APCA), 30);
  assert.equal(Math.round(apca30.score), 54);
  assert.equal(apca30.safe, false, 'APCA is safe at |Lc| 60');
  // A manual pivot gives shade-100 text below it and shade-5 text from it, for either palette and method.
  for (const [palette, name] of [[palettes.named, 'named'], [palettes.neutral, 'neutral']]) {
    for (const algorithm of [WCAG, APCA]) {
      for (const { shade, text } of scaleForegrounds(palette, { pivot: 40, algorithm })) assert.equal(text, shade < 40 ? palette.at(-1).hex : palette[0].hex, `${name} ${algorithm} pivot 40: ${shade}`);
    }
  }
  assert.throws(() => scaleForegrounds(palettes.named, { pivot: 'auto', algorithm: 'wcag3' }), /ALGORITHM_INVALID/u);
  assert.throws(() => scaleForegrounds(palettes.named, { pivot: 6, algorithm: WCAG }), /PIVOT_INVALID/u);
  assert.throws(() => scaleForegrounds(palettes.named.slice(1), { pivot: 'auto', algorithm: WCAG }), /PALETTE_INVALID/u);
});

test('Auto picks the higher-scoring text for neutral palettes under each method, with no fixed pivot', () => {
  const inputs = { source, mode: 'standard', presetId: 'harbour', namedColor: '#025768' };
  const firstLightShade = (palette, algorithm) => scaleForegrounds(palette, { pivot: 'auto', algorithm }).find(({ text }) => text === palette[0].hex)?.shade;
  for (const neutralColor of ['#79716b', '#878685']) {
    const { palettes } = generateScaleTheme({ ...inputs, neutralColor });
    for (const algorithm of [WCAG, APCA]) {
      for (const choice of scaleForegrounds(palettes.neutral, { pivot: 'auto', algorithm })) {
        assert.ok(choice.score >= choice.alternativeScore, `${neutralColor} ${algorithm} neutral-${choice.shade} takes the higher score`);
      }
    }
  }
  // The Harbour neutral flips to light text at 60 under WCAG 2 but at 50 under APCA, which a fixed 60 could not do.
  const harbour = generateScaleTheme({ ...inputs, neutralColor: '#79716b' }).palettes.neutral;
  assert.equal(firstLightShade(harbour, WCAG), 60);
  assert.equal(firstLightShade(harbour, APCA), 50);
  const light = (algorithm, shade) => generateScaleTheme({ ...inputs, neutralColor: '#79716b', contrastAlgorithm: algorithm }).assignments[`semantic.color.neutral-${shade}-fg`].value;
  assert.equal(light(WCAG, 50), harbour.at(-1).hex);
  assert.equal(light(APCA, 50), harbour[0].hex);
  // A custom neutral whose WCAG Auto flip is 70: shade 60 keeps dark text, unlike a manual pivot of 60.
  const custom = generateScaleTheme({ ...inputs, neutralColor: '#878685' });
  assert.equal(firstLightShade(custom.palettes.neutral, WCAG), 70);
  assert.equal(custom.assignments['semantic.color.neutral-60-fg'].value, custom.palettes.neutral.at(-1).hex);
  assert.equal(custom.assignments['semantic.color.neutral-70-fg'].value, custom.palettes.neutral[0].hex);
  const pinned = generateScaleTheme({ ...inputs, neutralColor: '#878685', contrastPivot: 60 });
  assert.equal(pinned.assignments['semantic.color.neutral-60-fg'].value, pinned.palettes.neutral[0].hex, 'a manual pivot of 60 still gives shade 60 light text');
});

test('the contrast method reaches generated foregrounds, diagnostics and compiled output', () => {
  const inputs = { source, mode: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#79716b', whiteAnchor: false, curvature: 1 };
  const fallback = generateScaleTheme({ ...inputs, contrastPivot: 'auto' });
  const wcag = generateScaleTheme({ ...inputs, contrastPivot: 'auto', contrastAlgorithm: WCAG });
  const apca = generateScaleTheme({ ...inputs, contrastPivot: 'auto', contrastAlgorithm: APCA });
  assert.equal(fallback.contrast.algorithm, WCAG);
  assert.deepEqual(fallback.assignments, wcag.assignments, 'an absent method is the source default');
  assert.equal(apca.contrast.algorithm, APCA);
  assert.equal(wcag.assignments['semantic.color.color-40-fg'].value, '#00222a');
  assert.equal(apca.assignments['semantic.color.color-40-fg'].value, '#f2f9fb');
  assert.equal(apca.assignmentsByMode.dark['semantic.color.color-40-fg'].value, apca.contrast.foregrounds.dark[40]);
  // An unsafe foreground reports the active method's score fields.
  const manual = { ...inputs, contrastPivot: 5 };
  const wcagUnsafe = generateScaleTheme({ ...manual, contrastAlgorithm: WCAG }).diagnostics.find(({ token, colorScheme }) => token === 'semantic.color.color-5-fg' && !colorScheme);
  assert.deepEqual(Object.keys(wcagUnsafe), ['code', 'token', 'shade', 'algorithm', 'ratio', 'alternativeRatio', 'pivot']);
  assert.deepEqual([wcagUnsafe.algorithm, wcagUnsafe.ratio], [WCAG, 1]);
  const apcaUnsafe = generateScaleTheme({ ...manual, contrastAlgorithm: APCA }).diagnostics.find(({ token, colorScheme }) => token === 'semantic.color.color-5-fg' && !colorScheme);
  assert.deepEqual(Object.keys(apcaUnsafe), ['code', 'token', 'shade', 'algorithm', 'lc', 'alternativeLc', 'pivot']);
  assert.deepEqual([apcaUnsafe.algorithm, apcaUnsafe.lc], [APCA, 0]);
  assert.ok(apcaUnsafe.alternativeLc > 90);
  assert.throws(() => generateScaleTheme({ ...inputs, contrastAlgorithm: 'wcag3' }), /MUXUI_THEME_SCALE_ALGORITHM_INVALID/u);
  assert.throws(() => generateScaleTheme({ ...inputs, contrastAlgorithm: null }), /MUXUI_THEME_SCALE_ALGORITHM_INVALID/u);
  assert.throws(() => generateScaleTheme({ ...inputs, namedColor: '#02576880', contrastAlgorithm: APCA }), /MUXUI_THEME_COLOR_INVALID/u, 'a translucent base cannot be scored by APCA');

  const preset = (contrastAlgorithm) => compileScalePresetTheme({ source, presetId: 'harbour', modes: { colorScheme: 'light' }, contrastAlgorithm });
  assert.equal(preset().inputs.contrastAlgorithm, WCAG, 'preset inputs always carry the method');
  assert.equal(preset(APCA).document.scale.contrastAlgorithm, APCA);
  assert.equal(preset(APCA).compiled.tokens['semantic.color.color-40-fg'].value, '#f2f9fb');
  assert.equal(preset().compiled.tokens['semantic.color.color-40-fg'].value, '#00222a');
  assert.deepEqual(JSON.parse(serializeThemeAuthoringDocument(preset(APCA).document, { source })), preset(APCA).document);
});

test('compileScalePresetTheme defaults only an omitted contrast method', () => {
  const compile = (extra) => compileScalePresetTheme({ source, presetId: 'harbour', modes: { colorScheme: 'light' }, ...extra });
  assert.equal(compile({}).inputs.contrastAlgorithm, WCAG);
  assert.equal(compile({ contrastAlgorithm: undefined }).inputs.contrastAlgorithm, WCAG);
  for (const contrastAlgorithm of [null, '', 'wcag3']) {
    assert.throws(() => compile({ contrastAlgorithm }), /MUXUI_THEME_SCALE_ALGORITHM_INVALID/u, String(contrastAlgorithm));
  }
});

test('authoring documents validate the contrast method against the source and their generated assignments', () => {
  const scale = documentFor({}).scale;
  const apcaScale = { ...scale, contrastAlgorithm: APCA };
  const apcaDocument = documentFor(generateScaleTheme({ source, ...apcaScale }).assignments, apcaScale);
  assert.doesNotThrow(() => validateThemeAuthoringDocument(apcaDocument, { source }));
  assert.doesNotThrow(() => validateThemeAuthoringDocument(documentFor(generateScaleTheme({ source, ...scale }).assignments, scale), { source }), 'an absent method is allowed');
  assert.throws(() => validateThemeAuthoringDocument({ ...apcaDocument, scale: { ...apcaScale, contrastAlgorithm: 'wcag3' } }, { source }), /MUXUI_THEME_SCALE_ALGORITHM_INVALID/u);
  assert.throws(() => validateThemeAuthoringDocument({ ...apcaDocument, scale: { ...apcaScale, contrastAlgorithm: null } }, { source }), /MUXUI_THEME_SCALE_ALGORITHM_INVALID/u);
  const stale = documentFor(generateScaleTheme({ source, ...scale }).assignments, apcaScale);
  assert.throws(() => validateThemeAuthoringDocument(stale, { source }), /MUXUI_THEME_SCALE_ASSIGNMENT_INVALID: semantic\.color\.color-40-fg/u);
});

// One fixture list for both validators: the token-source schema and assertSourceMetadata.
const INVALID_CONTRAST_METADATA = Object.freeze({
  'old algorithm key replacing the pair': (contrast) => { contrast.algorithm = WCAG; delete contrast.algorithms; delete contrast.defaultAlgorithm; },
  'old algorithm key beside the pair': (contrast) => { contrast.algorithm = WCAG; },
  'single method': (contrast) => { contrast.algorithms = [WCAG]; },
  'reversed order': (contrast) => { contrast.algorithms = [APCA, WCAG]; },
  'unknown id': (contrast) => { contrast.algorithms = [WCAG, 'wcag3']; },
  'duplicate id': (contrast) => { contrast.algorithms = [WCAG, WCAG]; },
  'missing list': (contrast) => { delete contrast.algorithms; },
  'missing default': (contrast) => { delete contrast.defaultAlgorithm; },
  'unknown default': (contrast) => { contrast.defaultAlgorithm = 'wcag3'; },
});

test('the source lists both contrast algorithms and both validators reject the same invalid shapes', () => {
  assert.deepEqual(source.theme.scale.contrast.algorithms, [WCAG, APCA]);
  assert.equal(source.theme.scale.contrast.defaultAlgorithm, WCAG);
  validateFamily('token-source', source);
  const inputs = { source, mode: 'standard', namedColor: '#025768', neutralColor: '#79716b' };
  for (const [name, change] of Object.entries(INVALID_CONTRAST_METADATA)) {
    const invalid = structuredClone(source);
    change(invalid.theme.scale.contrast);
    assert.throws(() => validateFamily('token-source', invalid), name);
    assert.throws(() => generateScaleTheme({ ...inputs, source: invalid }), /MUXUI_THEME_(?:SOURCE_METADATA_INVALID|UNKNOWN_FIELD): theme\.scale\.contrast/u, name);
  }
});

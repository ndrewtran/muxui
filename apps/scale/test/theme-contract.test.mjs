import test from 'node:test';
import assert from 'node:assert/strict';
import { compileScalePresetTheme, generateScaleTheme, scaleForegrounds } from '@muxui/tokens/authoring';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import {
  CONTRAST_METHODS,
  DEFAULT_SETTINGS,
  MONO_PRESETS,
  NAMED_STEPS,
  NEUTRAL_STEPS,
  STANDARD_PRESETS,
  TYPOGRAPHY_METRIC_GROUPS,
  TYPOGRAPHY_ROLES,
  createScaleDocument,
  draftScaleDocument,
  previewCss,
  previewPalette,
  previewTheme,
  previewSwatches,
  presetSettings,
  rootCssFromPreview,
  settingsFromDocument,
  validateScaleSettings,
  randomScaleSettings,
  serializeScaleDocument,
  validateScaleDocument,
} from '../src/theme-contract.mjs';

test('every canonical preset round-trips through Scale and matches the shared compiler', () => {
  const collections = [
    ['standard', 'standard', STANDARD_PRESETS],
    ['monochrome', 'mono', MONO_PRESETS],
  ];
  let presetCount = 0;
  for (const [collection, family, presets] of collections) {
    for (const [presetId] of presets) {
      const settings = { ...DEFAULT_SETTINGS, ...presetSettings(family, presetId) };
      const document = createScaleDocument(settings, { slug: `round-trip-${collection}-${presetId}` });
      const restoredDocument = JSON.parse(serializeScaleDocument(document));
      assert.deepEqual(restoredDocument, document, `${collection}-${presetId}: serialized document is stable`);
      const restoredSettings = settingsFromDocument(restoredDocument);
      assert.deepEqual(createScaleDocument(restoredSettings, { slug: document.id.slice('muxui:theme:'.length) }), document, `${collection}-${presetId}: settings reload preserves document`);
      for (const colorScheme of ['light', 'dark']) {
        const compiled = previewTheme({ ...restoredSettings, colorMode: colorScheme, background: colorScheme });
        const shared = compileScalePresetTheme({ source, collection, presetId, modes: { colorScheme, contrast: 'standard' } });
        for (const role of ['semantic.color.color-60', 'semantic.color.neutral-20', 'component.button.background', 'component.button.foreground']) {
          assert.equal(compiled.tokens[role].value, shared.compiled.tokens[role].value, `${collection}-${presetId} ${colorScheme}: ${role}`);
        }
      }
      presetCount += 1;
    }
  }
  assert.equal(presetCount, 15);
});

test('Scale source round-trips through the strict typed document boundary', () => {
  const document = createScaleDocument(DEFAULT_SETTINGS, { slug: 'round-trip' });
  const serialized = serializeScaleDocument(document);
  const restored = JSON.parse(serialized);
  assert.deepEqual(restored, document);
  assert.equal(restored.id, 'muxui:theme:round-trip');
});

test('Scale starts at the canonical radius default and preserves explicit curvature', () => {
  assert.equal(DEFAULT_SETTINGS.curvature, 0.5);
  const fresh = createScaleDocument(DEFAULT_SETTINGS, { slug: 'fresh-default' });
  assert.equal(fresh.scale.curvature, 0.5);
  for (const [name, px] of [['xs', 4], ['s', 6], ['m', 8], ['l', 12], ['xl', 16], ['2xl', 24]]) {
    assert.equal(fresh.overrides[`reference.dimension.radius-${name}`].value, px);
  }

  const saved = createScaleDocument({ ...DEFAULT_SETTINGS, curvature: 1.25 }, { slug: 'saved-custom' });
  const restored = settingsFromDocument(JSON.parse(serializeScaleDocument(saved)));
  assert.equal(restored.curvature, 1.25);
  assert.equal(createScaleDocument(restored, { slug: 'saved-custom' }).scale.curvature, 1.25);
});

test('Scale source rejects unknown fields and unsafe slugs', () => {
  const document = createScaleDocument(DEFAULT_SETTINGS, { slug: 'safe-theme' });
  assert.throws(() => validateScaleDocument({ ...document, extra: true }), /UNKNOWN_FIELD/u);
  assert.throws(() => createScaleDocument(DEFAULT_SETTINGS, { slug: '../escape' }), /SLUG_INVALID/u);
  assert.throws(() => validateScaleDocument({ ...document, id: 'muxui:theme:../escape' }), /SLUG_INVALID/u);
});

test('Scale source rejects invalid colors and mode shapes', () => {
  const document = createScaleDocument(DEFAULT_SETTINGS, { slug: 'invalid' });
  assert.throws(() => validateScaleDocument({
    ...document,
    scale: { ...document.scale, namedColor: 'red' },
  }), /COLOR_INVALID/u);
  assert.throws(() => validateScaleDocument({ ...document, scale: { ...document.scale, unknown: true } }), /UNKNOWN_FIELD/u);
});

test('Scale projects shared palettes, scoped CSS, and deterministic WCAG randomization', () => {
  const settings = { ...DEFAULT_SETTINGS, whiteAnchor: true };
  const named = previewPalette(settings, 'named', [5, 60, 100]);
  const neutral = previewPalette(settings, 'neutral', [5, 50, 100]);
  assert.deepEqual(named.map(({ step }) => step), [5, 60, 100]);
  assert.deepEqual(neutral.map(({ step }) => step), [5, 50, 100]);
  assert.equal(neutral[0].value, '#ffffff');
  const randomized = randomScaleSettings(settings, { random: () => 0.5 });
  assert.equal(randomized.presetId, 'custom');
  assert.match(randomized.namedColor, /^#[0-9a-f]{6}$/u);
  assert.match(randomized.neutralColor, /^#[0-9a-f]{6}$/u);
  assert.match(previewCss(randomized), /^\.muxui-scale-preview \{/u);
});


test('import, edit and export preserve additional typed overrides and constrained modes', () => {
  const original = createScaleDocument(DEFAULT_SETTINGS, { slug: 'custom-source' });
  original.overrides['semantic.action.background'] = {
    type: 'color', unit: 'hex', value: '#123456',
    mix: { space: 'srgb', token: 'reference.color.brand-60', weight: 0.5, color: '#00000000' },
  };
  original.modes = { colorScheme: ['dark'], contrast: ['more'], motion: ['reduced'], density: ['compact'], direction: ['rtl'] };
  validateScaleDocument(original);
  const restored = settingsFromDocument(original);
  assert.equal(restored.background, 'dark');
  assert.deepEqual(createScaleDocument(restored, { slug: 'custom-source' }), original);
  const edited = { ...restored, ...presetSettings('mono', 'forest'), curvature: 1.5 };
  const exported = createScaleDocument(edited, { slug: 'custom-source' });
  assert.deepEqual(exported.modes, original.modes);
  assert.deepEqual(exported.overrides['semantic.action.background'], original.overrides['semantic.action.background']);
  const compiled = previewTheme(edited);
  assert.deepEqual(compiled.modes, { colorScheme: 'dark', contrast: 'more', motion: 'reduced', density: 'compact', direction: 'rtl' });
  assert.match(previewCss(edited, { selector: ':root' }), /^:root \{/u);
});

test('motion easing and transition overrides round-trip through Scale authoring', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    additionalOverrides: {
      'semantic.motion.interaction-easing': {
        type: 'easing', unit: 'structured',
        value: { kind: 'cubic-bezier', x1: 0.2, y1: 0, x2: 0, y2: 1 },
      },
      'semantic.motion.interaction-transition': {
        type: 'transition', unit: 'structured',
        value: {
          kind: 'transition',
          duration: 'semantic.motion.interaction-duration',
          spring: {
            kind: 'time',
            visualDuration: 'semantic.motion.interaction-duration',
            bounce: 0.25,
          },
        },
      },
    },
  };
  const document = createScaleDocument(settings, { slug: 'motion-roundtrip' });
  const restored = settingsFromDocument(JSON.parse(serializeScaleDocument(document)));
  assert.deepEqual(restored.additionalOverrides, settings.additionalOverrides);
  assert.deepEqual(createScaleDocument(restored, { slug: 'motion-roundtrip' }), document);
  const compiled = previewTheme(settings);
  assert.deepEqual(compiled.tokens['semantic.motion.interaction-transition'].value.spring, {
    kind: 'time', visualDuration: 150, bounce: 0.25,
  });
});

const WCAG = 'wcag2-endpoint-v1';
const APCA = 'apca-endpoint-v1';

test('swatches use compiled backgrounds and foregrounds for both color modes', () => {
  for (const colorMode of ['light', 'dark']) {
    const compiled = previewTheme({ ...DEFAULT_SETTINGS, colorMode, background: colorMode });
    for (const [kind, prefix, steps] of [['named', 'color', [5, 60, 100]], ['neutral', 'neutral', [5, 10, 12, 98, 100]]]) {
      for (const swatch of previewSwatches(compiled, kind, steps, { pivot: 'auto', algorithm: WCAG })) {
        assert.equal(swatch.background, compiled.tokens[`semantic.color.${prefix}-${swatch.step}`].value);
        assert.equal(swatch.foreground, compiled.tokens[`semantic.color.${prefix}-${swatch.step}-fg`].value);
        assert.ok(Number.isFinite(swatch.ratio));
      }
    }
  }
});

test('Scale defaults, validates and round-trips the contrast method', () => {
  assert.equal(DEFAULT_SETTINGS.contrastAlgorithm, WCAG);
  assert.deepEqual(CONTRAST_METHODS.map(([id, name]) => [id, name]), [[WCAG, 'WCAG 2'], [APCA, 'APCA']]);
  const settings = { ...DEFAULT_SETTINGS, contrastAlgorithm: APCA };
  const document = createScaleDocument(settings, { slug: 'apca-method' });
  assert.equal(document.scale.contrastAlgorithm, APCA);
  assert.equal(document.overrides['semantic.color.color-40-fg'].value, '#f7fbfc');
  const restored = settingsFromDocument(JSON.parse(serializeScaleDocument(document)));
  assert.equal(restored.contrastAlgorithm, APCA);
  assert.deepEqual(createScaleDocument(restored, { slug: 'apca-method' }), document);
  // Documents written before the method existed (no key) load with the default.
  const current = createScaleDocument(DEFAULT_SETTINGS, { slug: 'legacy-method' });
  const { contrastAlgorithm: omitted, ...legacyScale } = current.scale;
  assert.equal(omitted, WCAG);
  assert.equal(settingsFromDocument({ ...current, scale: legacyScale }).contrastAlgorithm, WCAG);
  for (const invalid of ['wcag3', null, 1]) {
    assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, contrastAlgorithm: invalid }), /contrastAlgorithm/u);
  }
  assert.throws(() => validateScaleDocument({ ...document, scale: { ...document.scale, contrastAlgorithm: 'wcag3' } }), /MUXUI_THEME_SCALE_ALGORITHM_INVALID/u);
});

test('without overrides each method row matches scaleForegrounds and the active choice is the compiled foreground', () => {
  for (const settings of [DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, ...presetSettings('mono', MONO_PRESETS[0][0]) }, { ...DEFAULT_SETTINGS, contrastPivot: 40 }]) {
    for (const contrastAlgorithm of [WCAG, APCA]) {
      for (const colorMode of ['light', 'dark']) {
        const compiled = previewTheme({ ...settings, contrastAlgorithm, colorMode, background: colorMode });
        for (const [kind, prefix, steps] of [['named', 'color', NAMED_STEPS], ['neutral', 'neutral', NEUTRAL_STEPS]]) {
          const palette = steps.map((shade) => ({ shade, hex: compiled.tokens[`semantic.color.${prefix}-${shade}`].value }));
          const chosen = Object.fromEntries([WCAG, APCA].map((algorithm) => [algorithm, new Map(scaleForegrounds(palette, { pivot: settings.contrastPivot, algorithm }).map((choice) => [choice.shade, choice]))]));
          for (const swatch of previewSwatches(compiled, kind, steps, { pivot: settings.contrastPivot, algorithm: contrastAlgorithm })) {
            const label = `${settings.family} ${contrastAlgorithm} ${colorMode} ${kind}-${swatch.step}`;
            assert.equal(chosen[contrastAlgorithm].get(swatch.step).text, swatch.foreground, `${label}: the active choice is the compiled foreground`);
            for (const row of swatch.methods) assert.equal(row.text, chosen[row.algorithm].get(swatch.step).text, `${label}: ${row.algorithm} text`);
            const active = swatch.methods.find(({ algorithm }) => algorithm === contrastAlgorithm);
            assert.deepEqual([active.score, active.label, active.badge], [swatch.ratio, swatch.label, swatch.badge], label);
          }
        }
      }
    }
  }
});

test('an imported shade override changes the readout background while the active row keeps the compiled foreground', () => {
  const override = { type: 'color', unit: 'hex', value: '#000000' };
  const imported = createScaleDocument({ ...DEFAULT_SETTINGS, additionalOverrides: { 'semantic.color.color-40': override } }, { slug: 'recoloured-shade' });
  const settings = settingsFromDocument(JSON.parse(serializeScaleDocument(imported)));
  assert.deepEqual(settings.additionalOverrides['semantic.color.color-40'], override);
  const read = (algorithm) => previewSwatches(previewTheme({ ...settings, contrastAlgorithm: algorithm }), 'named', [40], { pivot: settings.contrastPivot, algorithm })[0];
  const wcag = read(WCAG);
  // The generated foreground is untouched (dark Harbour text), so on the new black it really is 1.19:1.
  assert.deepEqual([wcag.background, wcag.foreground, wcag.label, wcag.badge], ['#000000', '#001c23', '1.19:1', 'Fail']);
  assert.deepEqual(wcag.methods.map(({ algorithm, text, label, badge }) => [algorithm, text, label, badge]), [
    [WCAG, '#001c23', '1.19:1', 'Fail'],
    [APCA, '#f7fbfc', 'Lc 105', '75+'],
  ]);
  const apca = read(APCA);
  assert.deepEqual([apca.background, apca.foreground, apca.label, apca.badge], ['#000000', '#f7fbfc', 'Lc 105', '75+']);
  assert.deepEqual(apca.methods.map(({ algorithm, text, label, badge }) => [algorithm, text, label, badge]), [
    [WCAG, '#f7fbfc', '20.16:1', 'AAA'],
    [APCA, '#f7fbfc', 'Lc 105', '75+'],
  ]);
});

test('translucent shade overrides read as n/a without a badge instead of failing', () => {
  const settingsWith = (overrides) => ({ ...DEFAULT_SETTINGS, additionalOverrides: Object.fromEntries(Object.entries(overrides).map(([id, value]) => [id, { type: 'color', unit: 'hex', value }])) });
  const read = (settings, algorithm, steps = [5, 40, 60]) => previewSwatches(previewTheme({ ...settings, contrastAlgorithm: algorithm }), 'named', steps, { pivot: 'auto', algorithm });
  const rows = (swatch) => swatch.methods.map(({ text, score, label, badge }) => [text, score, label, badge]);
  for (const value of ['#00000080', '#00000000']) {
    const settings = settingsWith({ 'semantic.color.color-40': value });
    validateScaleSettings(settings);
    for (const algorithm of [WCAG, APCA]) {
      const [first, translucent, last] = read(settings, algorithm);
      assert.deepEqual([translucent.background, translucent.ratio, translucent.label, translucent.badge], [value, null, 'n/a', null], `${value} ${algorithm}`);
      assert.deepEqual(translucent.methods.map(({ score, label, badge }) => [score, label, badge]), [[null, 'n/a', null], [null, 'n/a', null]], `${value} ${algorithm}`);
      // Other shades keep their real scores for both methods.
      for (const swatch of [first, last]) {
        assert.ok(Number.isFinite(swatch.ratio));
        assert.ok(swatch.methods.every(({ score, badge }) => Number.isFinite(score) && badge));
      }
    }
  }
  // A translucent endpoint leaves the active scores but cannot choose the other method's text.
  const endpoint = read(settingsWith({ 'semantic.color.color-5': '#ffffff80' }), WCAG, [5, 40]);
  assert.deepEqual(rows(endpoint[0]), [['#001c23', null, 'n/a', null], [null, null, 'n/a', null]]);
  assert.equal(endpoint[1].label, '4.99:1');
  assert.deepEqual(rows(endpoint[1]).map(([text, , label]) => [text, label]), [['#001c23', '4.99:1'], [null, 'n/a']]);
  // A mix toward a transparent colour compiles to a translucent value too.
  const mixed = createScaleDocument({ ...DEFAULT_SETTINGS, additionalOverrides: { 'semantic.color.color-40': { type: 'color', unit: 'hex', value: '#648f9b', mix: { space: 'srgb', token: 'reference.color.brand-60', weight: 0.5, color: '#00000000' } } } }, { slug: 'mixed-shade' });
  const [mixedSwatch] = read(settingsFromDocument(mixed), APCA, [40]);
  assert.match(mixedSwatch.background, /^#[0-9a-f]{8}$/u);
  assert.deepEqual([mixedSwatch.label, mixedSwatch.badge], ['n/a', null]);
});

// The recovery recipe from catalog/guides/token-migration.md.
function recover(document) {
  const { assignments } = generateScaleTheme({ source, ...document.scale });
  const kept = Object.fromEntries(Object.entries(document.overrides).filter(([id]) => !Object.hasOwn(assignments, id)));
  return { ...document, tokenContractVersion: source.tokenContractVersion, overrides: { ...kept, ...assignments } };
}

const MIGRATION_SETTINGS = { ...DEFAULT_SETTINGS, family: 'standard', presetId: 'harbour', namedColor: '#025768', neutralColor: '#878685', whiteAnchor: false, contrastPivot: 'auto', curvature: 1,
  additionalOverrides: { 'semantic.typography.display-font-weight': { type: 'number', unit: 'unitless', value: 700 } },
  themeModes: { colorScheme: ['dark'], contrast: ['standard', 'more'], motion: ['reduced'], density: ['compact'], direction: ['ltr'] } };

test('Scale rejects a 7.0.0 document with both versions and the guide, and imports it once its assignments are regenerated', () => {
  const settings = MIGRATION_SETTINGS;
  const current = createScaleDocument(settings, { slug: 'previous-contract' });
  // 7.0.0 gave neutral Auto the fixed pivot 60, so its shade-60 foreground was the light endpoint.
  const light = current.overrides['reference.color.neutral-5'].value;
  const written = structuredClone(current);
  written.tokenContractVersion = '7.0.0';
  written.overrides['semantic.color.neutral-60-fg'].value = light;
  assert.notEqual(current.overrides['semantic.color.neutral-60-fg'].value, light);
  const before = structuredClone(written);

  assert.throws(() => validateScaleDocument(written), { message: 'MUXUI_THEME_CONTRACT_INVALID: document declares tokenContractVersion 7.0.0, required 8.0.0. See the token contract migration guide.' });
  assert.throws(() => settingsFromDocument({ ...written, tokenContractVersion: source.tokenContractVersion }), /MUXUI_THEME_SCALE_ASSIGNMENT_INVALID: semantic\.color\.neutral-60-fg/u);
  assert.deepEqual(written, before, 'rejecting a document does not rewrite it');

  const restored = settingsFromDocument(recover(written));
  assert.deepEqual(restored.additionalOverrides, settings.additionalOverrides);
  assert.deepEqual(restored.themeModes, settings.themeModes);
  assert.deepEqual(createScaleDocument(restored, { slug: 'previous-contract' }), current);
});

test('Scale rejects a 7.0.0 Harbour document with muxui-oklch-v1 palettes, and imports it once they are regenerated', () => {
  const settings = { ...MIGRATION_SETTINGS, neutralColor: '#79716b' };
  const current = createScaleDocument(settings, { slug: 'previous-palettes' });
  // The six Harbour shades that muxui-oklch-v2 changes, as 7.0.0 stored them.
  const v1 = { 'brand-5': '#f2f9fb', 'brand-30': '#8cacb6', 'brand-100': '#00222a', 'neutral-5': '#faf7f5', 'neutral-50': '#9e9792', 'neutral-100': '#2c2825' };
  const written = structuredClone(current);
  written.tokenContractVersion = '7.0.0';
  for (const [name, value] of Object.entries(v1)) {
    assert.notEqual(current.overrides[`reference.color.${name}`].value, value, name);
    written.overrides[`reference.color.${name}`].value = value;
  }
  const before = structuredClone(written);

  assert.throws(() => validateScaleDocument(written), { message: 'MUXUI_THEME_CONTRACT_INVALID: document declares tokenContractVersion 7.0.0, required 8.0.0. See the token contract migration guide.' });
  assert.throws(() => settingsFromDocument({ ...written, tokenContractVersion: source.tokenContractVersion }), /MUXUI_THEME_SCALE_ASSIGNMENT_INVALID: reference\.color\.brand-5/u);
  assert.deepEqual(written, before, 'rejecting a document does not rewrite it');

  const restored = settingsFromDocument(recover(written));
  assert.deepEqual(restored.additionalOverrides, settings.additionalOverrides);
  assert.deepEqual(restored.themeModes, settings.themeModes);
  assert.deepEqual(createScaleDocument(restored, { slug: 'previous-palettes' }), current);
});

test('neutral Auto follows the contrast method like the named palette', () => {
  // The Auto marker sits where the compiled foreground first changes.
  const boundary = (algorithm, kind, steps) => {
    const settings = { ...DEFAULT_SETTINGS, contrastAlgorithm: algorithm };
    const swatches = previewSwatches(previewTheme(settings), kind, steps, { pivot: 'auto', algorithm });
    return swatches.find(({ foreground }, index) => index > 0 && foreground !== swatches[index - 1].foreground)?.step;
  };
  assert.equal(boundary(WCAG, 'named', NAMED_STEPS), 50);
  assert.equal(boundary(APCA, 'named', NAMED_STEPS), 40);
  assert.equal(boundary(WCAG, 'neutral', NEUTRAL_STEPS), 60);
  assert.equal(boundary(APCA, 'neutral', NEUTRAL_STEPS), 50);
});

test('swatch readouts name the score and badge each method reports', () => {
  const swatch = (contrastAlgorithm, step) => {
    const settings = { ...DEFAULT_SETTINGS, contrastAlgorithm };
    return previewSwatches(previewTheme(settings), 'named', [step], { pivot: settings.contrastPivot, algorithm: contrastAlgorithm })[0];
  };
  // Harbour light 40 is #648f9b: WCAG picks dark text at 4.99:1, APCA light text at Lc 65.
  const wcag = swatch(WCAG, 40);
  assert.deepEqual([wcag.value, wcag.foreground, wcag.label, wcag.badge], ['#648f9b', '#001c23', '4.99:1', 'AA']);
  assert.deepEqual(wcag.methods.map(({ name, text, label, badge }) => [name, text, label, badge]), [['WCAG 2', '#001c23', '4.99:1', 'AA'], ['APCA', '#f7fbfc', 'Lc 65', '60+']]);
  const apca = swatch(APCA, 40);
  assert.deepEqual([apca.foreground, apca.label, apca.badge], ['#f7fbfc', 'Lc 65', '60+']);
  assert.deepEqual(apca.methods.map(({ text }) => text), ['#001c23', '#f7fbfc']);
  // Tuning lifted shade 30 to the Lc 60 line; a recoloured grey in the dead band still reads 45+.
  assert.deepEqual([swatch(APCA, 30).label, swatch(APCA, 30).badge], ['Lc 60', '60+']);
  const grey = { ...DEFAULT_SETTINGS, contrastAlgorithm: APCA, additionalOverrides: { 'semantic.color.color-30': { type: 'color', unit: 'hex', value: '#9c9c9c' } } };
  const [dead] = previewSwatches(previewTheme(grey), 'named', [30], { pivot: 'auto', algorithm: APCA });
  assert.deepEqual([dead.foreground, dead.label, dead.badge], ['#001c23', 'Lc 49', '45+']);
  assert.equal(swatch(APCA, 100).badge, '75+');
  assert.equal(swatch(WCAG, 100).badge, 'AAA');
  assert.throws(() => previewSwatches(previewTheme(DEFAULT_SETTINGS), 'named', [40], { pivot: 'auto', algorithm: 'wcag3' }), /contrastAlgorithm/u);
});

test('manual contrast pivots survive serialization and reach preview, CSS export and contrast diagnostics', () => {
  const settings = { ...DEFAULT_SETTINGS, contrastPivot: 5 };
  const document = createScaleDocument(settings, { slug: 'manual-pivot' });
  const restored = settingsFromDocument(JSON.parse(serializeScaleDocument(document)));
  assert.equal(restored.contrastPivot, 5);
  for (const colorMode of ['light', 'dark']) {
    const selected = { ...restored, colorMode, background: colorMode };
    const compiled = previewTheme(selected);
    const swatch = previewSwatches(compiled, 'named', [5], { pivot: restored.contrastPivot, algorithm: restored.contrastAlgorithm })[0];
    assert.equal(swatch.foreground, swatch.background);
    assert.equal(swatch.ratio, 1);
    assert.equal(swatch.badge, 'Fail');
    assert.ok(compiled.diagnostics.some(({ code, token, colorScheme }) => code === 'MUXUI_SCALE_CONTRAST_UNSAFE'
      && token === 'semantic.color.color-5-fg' && (colorScheme ?? 'light') === colorMode));
    assert.ok(previewCss(selected, { selector: ':root' }).includes(`--muxui-semantic-color-color-5-fg: ${swatch.foreground};`));
  }
});

test('active-palette randomization preserves the other anchor and mono uses one anchor', () => {
  const random = () => 0.5;
  const named = randomScaleSettings(DEFAULT_SETTINGS, { random, kind: 'named' });
  assert.equal(named.neutralColor, DEFAULT_SETTINGS.neutralColor);
  const neutral = randomScaleSettings(DEFAULT_SETTINGS, { random, kind: 'neutral' });
  assert.equal(neutral.namedColor, DEFAULT_SETTINGS.namedColor);
  const mono = randomScaleSettings({ ...DEFAULT_SETTINGS, family: 'mono' }, { random, kind: 'neutral' });
  assert.equal(mono.namedColor, mono.neutralColor);
});

test('stored UI settings reject invalid palettes, modes and hidden override conflicts', () => {
  assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, family: 'unknown' }));
  for (const curvature of ['0.5', -1, 3, null]) {
    assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, curvature }), /curvature/u);
  }
  for (const contrastPivot of ['60', 6, null]) {
    assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, contrastPivot }), /contrastPivot/u);
  }
  assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, whiteAnchor: 'false' }));
  assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, background: 'dark', colorMode: 'light' }));
  assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, themeModes: { ...DEFAULT_SETTINGS.themeModes, extra: ['value'] } }));
  assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, additionalOverrides: { 'reference.color.brand-60': { type: 'color', value: '#123456' } } }));
});

test('typography matrix metadata follows canonical roles and round-trips linked metric overrides', () => {
  assert.deepEqual(TYPOGRAPHY_ROLES.map(({ id }) => id), ['display', 'heading', 'title', 'label', 'body', 'mono', 'expressive']);
  assert.equal(TYPOGRAPHY_ROLES.reduce((count, role) => count + role.variants.length, 0), 25);
  assert.equal(TYPOGRAPHY_METRIC_GROUPS.length, 6);
  const body = TYPOGRAPHY_ROLES.find(({ id }) => id === 'body');
  const expressive = TYPOGRAPHY_ROLES.find(({ id }) => id === 'expressive');
  assert.notEqual(body.family, expressive.family);
  assert.deepEqual(expressive.metrics, body.metrics);

  const settings = {
    ...DEFAULT_SETTINGS,
    additionalOverrides: {
      [body.metrics.fontWeight]: { type: 'number', unit: 'unitless', value: 450 },
      [body.metrics.lineHeight]: { type: 'number', unit: 'unitless', value: 1.4 },
      [body.metrics.letterSpacing]: { type: 'string', unit: 'string', value: '0.02em' },
      ['semantic.typography.display-font-weight']: { type: 'number', unit: 'unitless', value: 700 },
    },
  };
  const document = createScaleDocument(settings, { slug: 'typography-matrix' });
  assert.equal(document.overrides[expressive.metrics.fontWeight].value, 450);
  const compiled = previewTheme(settings);
  assert.equal(compiled.tokens[body.metrics.fontWeight].value, 450);
  assert.equal(compiled.tokens[expressive.metrics.fontWeight].value, 450);
  assert.equal(compiled.tokens[body.metrics.lineHeight].value, 1.4);
  assert.equal(compiled.tokens[body.metrics.letterSpacing].value, '0.02em');

  const restored = settingsFromDocument(JSON.parse(serializeScaleDocument(document)));
  assert.deepEqual(restored.additionalOverrides[body.metrics.fontWeight], settings.additionalOverrides[body.metrics.fontWeight]);
  assert.deepEqual(createScaleDocument(restored, { slug: 'typography-matrix' }), document);
});

test('reused settings work matches fresh documents and root CSS compiles', () => {
  for (const settings of [DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, ...presetSettings('mono', MONO_PRESETS[0][0]), colorMode: 'dark', background: 'dark' }]) {
    validateScaleSettings(settings);
    assert.deepEqual(draftScaleDocument(settings, 'reused-draft'), createScaleDocument(settings, { slug: 'reused-draft' }));
    assert.equal(rootCssFromPreview(previewCss(settings)), previewCss(settings, { selector: ':root' }));
  }
  assert.throws(() => draftScaleDocument(DEFAULT_SETTINGS, '../escape'), /SLUG_INVALID/u);
  assert.throws(() => rootCssFromPreview(previewCss(DEFAULT_SETTINGS, { selector: ':root' })), /CSS_PROJECTION_INVALID/u);
});

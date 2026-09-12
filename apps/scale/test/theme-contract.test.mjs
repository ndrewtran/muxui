import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  createScaleDocument,
  previewCss,
  previewPalette,
  previewTheme,
  previewSwatches,
  presetSettings,
  settingsFromDocument,
  validateScaleSettings,
  randomScaleSettings,
  serializeScaleDocument,
  validateScaleDocument,
} from '../src/theme-contract.mjs';

test('Scale source round-trips through the strict typed document boundary', () => {
  const document = createScaleDocument(DEFAULT_SETTINGS, { slug: 'round-trip' });
  const serialized = serializeScaleDocument(document);
  const restored = JSON.parse(serialized);
  assert.deepEqual(restored, document);
  assert.equal(restored.id, 'muxui:theme:round-trip');
});

test('Scale starts at the canonical radius default and preserves explicit curvature', () => {
  assert.equal(DEFAULT_SETTINGS.curvature, 1);
  const fresh = createScaleDocument(DEFAULT_SETTINGS, { slug: 'fresh-default' });
  assert.equal(fresh.scale.curvature, 1);
  for (const [name, px] of [['xs', 8], ['s', 12], ['m', 16], ['l', 24], ['xl', 32], ['2xl', 48]]) {
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

test('swatches use compiled backgrounds and foregrounds for both color modes', () => {
  for (const colorMode of ['light', 'dark']) {
    const compiled = previewTheme({ ...DEFAULT_SETTINGS, colorMode, background: colorMode });
    for (const [kind, prefix, steps] of [['named', 'color', [5, 60, 100]], ['neutral', 'neutral', [5, 10, 12, 98, 100]]]) {
      for (const swatch of previewSwatches(compiled, kind, steps)) {
        assert.equal(swatch.background, compiled.tokens[`semantic.color.${prefix}-${swatch.step}`].value);
        assert.equal(swatch.foreground, compiled.tokens[`semantic.color.${prefix}-${swatch.step}-fg`].value);
        assert.ok(Number.isFinite(swatch.ratio));
      }
    }
  }
});

test('manual contrast pivots survive serialization and reach preview, CSS export and contrast diagnostics', () => {
  const settings = { ...DEFAULT_SETTINGS, contrastPivot: 5 };
  const document = createScaleDocument(settings, { slug: 'manual-pivot' });
  const restored = settingsFromDocument(JSON.parse(serializeScaleDocument(document)));
  assert.equal(restored.contrastPivot, 5);
  for (const colorMode of ['light', 'dark']) {
    const selected = { ...restored, colorMode, background: colorMode };
    const compiled = previewTheme(selected);
    const swatch = previewSwatches(compiled, 'named', [5])[0];
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
  assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, whiteAnchor: 'false' }));
  assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, background: 'dark', colorMode: 'light' }));
  assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, themeModes: { ...DEFAULT_SETTINGS.themeModes, extra: ['value'] } }));
  assert.throws(() => validateScaleSettings({ ...DEFAULT_SETTINGS, additionalOverrides: { 'reference.color.brand-60': { type: 'color', value: '#123456' } } }));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileScalePresetTheme } from '@muxui/tokens/authoring';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import {
  DEFAULT_SETTINGS,
  MONO_PRESETS,
  STANDARD_PRESETS,
  TYPOGRAPHY_METRIC_GROUPS,
  TYPOGRAPHY_ROLES,
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
          easing: 'semantic.motion.interaction-easing',
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

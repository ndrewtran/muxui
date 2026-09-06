import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  createScaleDocument,
  digestScaleDocument,
  previewCss,
  previewPalette,
  randomScaleSettings,
  serializeScaleDocument,
  validateScaleDocument,
} from '../src/theme-contract.mjs';

test('Scale source round-trips through the strict typed document boundary', () => {
  const document = createScaleDocument(DEFAULT_SETTINGS, { slug: 'round-trip' });
  const serialized = serializeScaleDocument(document);
  const restored = JSON.parse(serialized);
  assert.deepEqual(restored, document);
  assert.equal(digestScaleDocument(restored), 'source:muxui:theme:round-trip');
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

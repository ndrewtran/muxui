import assert from 'node:assert/strict';
import test from 'node:test';
import { converter } from 'culori';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { generateScaleTheme } from '../src/authoring.mjs';
import {
  BLACKEN_WEIGHT,
  blackenHex,
  generateMonochromePalette,
  generatePalette,
  tuneScalePalette,
} from '../src/scale-palette.mjs';

const toOklch = converter('oklch');
const lightness = (hex) => toOklch(hex).l;
const shade = (palette, number) => palette.find((entry) => entry.shade === number).hex;
const WCAG = 'wcag2-endpoint-v1';
const APCA = 'apca-endpoint-v1';

const value = (token) => source.tokens[token].value;
const presets = [
  ...source.theme.scale.standardPresets.map(({ id, namedColor, neutralColor }) => ({ id, mode: 'standard', namedColor: value(namedColor), neutralColor: value(neutralColor) })),
  ...source.theme.scale.monochromePresets.map(({ id, color }) => ({ id: `mono-${id}`, mode: 'mono', namedColor: value(color), neutralColor: value(color) })),
];
const themeFor = (preset, extra = {}) => generateScaleTheme({ source, presetId: preset.id.replace(/^mono-/u, ''), ...preset, ...extra });
const harbour = presets.find(({ id }) => id === 'harbour');

test('every preset shade passes WCAG 2 and APCA against its endpoint texts in both schemes, except three dark neutral base colours', () => {
  assert.equal(presets.length, 15);
  // Foreground diagnostics cover all 11 named and 27 neutral shades, light and dark, with Auto text.
  const unsafe = (algorithm) => presets.flatMap((preset) => themeFor(preset, { contrastAlgorithm: algorithm }).diagnostics.map(({ token, colorScheme = 'light' }) => `${preset.id} ${colorScheme} ${token}`));
  assert.deepEqual(unsafe(APCA), []);
  // Dark neutral-50 is the base colour (the light neutral-60 hex), which tuning never moves.
  assert.deepEqual(unsafe(WCAG), ['harbour', 'lagoon', 'blueprint'].map((id) => `${id} dark semantic.color.neutral-50-fg`));
});

test('Harbour tunes to the approved ladder: lighter shade 5, darker shade 100, and one moved mid shade per palette', () => {
  const { palettes } = themeFor(harbour);
  const changes = (palette, kind, base) => generatePalette(base, kind, { tune: false }).flatMap(({ shade: number, hex }) => (shade(palette, number) === hex ? [] : [`${number}:${hex}>${shade(palette, number)}`])).join(' ');
  assert.equal(palettes.named.map(({ shade: number, hex }) => `${number}:${hex}`).join(' '), '5:#f7fbfc 10:#dde9ed 20:#b4cad1 30:#96b7c1 40:#648f9b 50:#3b7381 60:#025768 70:#004958 80:#003b48 90:#002e39 100:#001c23');
  assert.equal(changes(palettes.named, 'named', harbour.namedColor), '5:#f2f9fb>#f7fbfc 30:#8cacb6>#96b7c1 100:#00222a>#001c23');
  assert.equal(changes(palettes.neutral, 'neutral', harbour.neutralColor), '5:#faf7f5>#fbfaf8 50:#9e9792>#8f8884 100:#2c2825>#25211e');
});

test('shade 5 and shade 100 are strengthened and the other fixed shades never move', () => {
  for (const preset of presets) {
    for (const [kind, base] of [['named', preset.namedColor], ['neutral', preset.neutralColor]]) {
      const raw = generatePalette(base, kind, { tune: false });
      const tuned = generatePalette(base, kind);
      assert.equal(shade(tuned, 10), shade(raw, 10), `${preset.id} ${kind} 10`);
      assert.equal(shade(tuned, 60), base.toLowerCase(), `${preset.id} ${kind} 60 is the base input`);
      assert.ok(Math.abs(lightness(shade(tuned, 5)) - 0.985) < 0.004, `${preset.id} ${kind} 5 sits at L 0.985`);
      assert.ok(Math.abs(lightness(shade(tuned, 100)) - 0.9 * lightness(shade(raw, 100))) < 0.004, `${preset.id} ${kind} 100 keeps 0.9x of its lightness`);
    }
  }
});

test('tuned lightness stays strictly monotonic from shade 5 to shade 100', () => {
  const decreasing = (palette, label) => palette.forEach(({ hex }, index) => {
    if (index > 0) assert.ok(lightness(hex) < lightness(palette[index - 1].hex), `${label} ${palette[index].shade}`);
  });
  for (const preset of presets) {
    const { palettes } = themeFor(preset);
    decreasing(palettes.named, `${preset.id} named`);
    decreasing(palettes.neutral, `${preset.id} neutral`);
  }
  // Bases outside the presets, from a fixed sequence.
  let seed = 7;
  const channel = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return Math.floor(40 + (seed / 4294967296) * 160).toString(16); };
  for (let index = 0; index < 40; index += 1) {
    const base = `#${channel()}${channel()}${channel()}`;
    for (const kind of ['named', 'neutral']) decreasing(generatePalette(base, kind), `${base} ${kind}`);
    decreasing(generateMonochromePalette(base), `${base} monochrome`);
  }
});

test('the neutral white anchor survives tuning, in neutral and monochrome palettes', () => {
  const anchored = themeFor(harbour, { whiteAnchor: true }).palettes;
  assert.equal(shade(anchored.neutral, 5), '#ffffff');
  assert.equal(shade(anchored.named, 5), '#f7fbfc', 'the named palette has no anchor');
  assert.equal(shade(generatePalette(harbour.neutralColor, 'neutral', { whiteAnchor: true }), 5), '#ffffff');
  assert.equal(shade(generateMonochromePalette(harbour.namedColor, { whiteAnchor: true }), 5), '#ffffff');
  // Shade 100 is still darkened, and the rest still passes against the white end.
  assert.equal(shade(anchored.neutral, 100), shade(themeFor(harbour).palettes.neutral, 100));
  assert.deepEqual(themeFor(harbour, { whiteAnchor: true, contrastAlgorithm: APCA }).diagnostics, []);
});

test('tuneScalePalette leaves a shade unchanged when no lightness between its neighbours passes', () => {
  // Shade 20 is boxed between the fixed shades 10 and 60, inside the grey band where neither end reaches APCA Lc 60.
  const boxed = [
    { shade: 5, hex: '#ffffff' },
    { shade: 10, hex: '#a2a2a2' },
    { shade: 20, hex: '#9c9c9c' },
    { shade: 60, hex: '#969696' },
    { shade: 100, hex: '#000000' },
  ];
  const tuned = tuneScalePalette(boxed, 'named');
  assert.deepEqual(tuned.slice(1).map(({ hex }) => hex), ['#a2a2a2', '#9c9c9c', '#969696', '#000000']);
  assert.deepEqual(tuned.map(({ shade: number }) => number), [5, 10, 20, 60, 100]);
  // With room above, the same shade moves to the nearest passing lightness between its neighbours.
  const roomy = tuneScalePalette(boxed.map((entry) => (entry.shade === 10 ? { ...entry, hex: '#f0f0f0' } : entry)), 'named');
  assert.equal(shade(roomy, 20), '#aeaeae');
  assert.ok(lightness(shade(roomy, 20)) < lightness(shade(roomy, 10)) - 0.004);
  assert.ok(lightness(shade(roomy, 20)) > lightness(shade(roomy, 60)) + 0.004, 'a darker pass below shade 60 is out of range');
  assert.throws(() => tuneScalePalette(boxed.filter((entry) => entry.shade !== 100), 'named'), /MUXUI_THEME_SCALE_PALETTE_INVALID/u);
  assert.throws(() => tuneScalePalette(boxed.filter((entry) => entry.shade !== 10), 'neutral'), /MUXUI_THEME_SCALE_PALETTE_INVALID/u);
  assert.deepEqual(tuneScalePalette([], 'named'), []);
});

test('the dark neutral canvas comes from one blackening helper that the tuner and the dark palettes share', () => {
  assert.equal(BLACKEN_WEIGHT, 0.85);
  assert.equal(blackenHex('#25211e'), '#1f1c1a');
  assert.equal(blackenHex('#ffffff'), '#d9d9d9');
  const generated = themeFor(harbour);
  const canvas = blackenHex(shade(generated.palettes.neutral, 100));
  // Dark shades that take the blackened canvas as text carry it as the same value and the mix weight.
  const dark = generated.assignmentsByMode.dark['semantic.color.neutral-60-fg'];
  assert.equal(dark.value, canvas);
  assert.equal(dark.mix.weight, BLACKEN_WEIGHT);
});

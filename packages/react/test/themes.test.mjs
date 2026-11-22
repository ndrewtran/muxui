import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { compileTokenGraph } from '@muxui/tokens';
import { compileScalePresetTheme, getScaleApcaContrast, scaleForegrounds } from '@muxui/tokens/authoring';
import { cssName, cssValue } from '@muxui/tokens/core';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import {
  MUXUI_DEFAULT_THEME_PRESET_ID,
  MUXUI_THEME_ACTION_BACKGROUNDS,
  MUXUI_THEME_PRESETS,
  MUXUI_THEME_PRESETS_BY_ID,
} from '../generated/themes.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const themeRuntime = await readFile(resolve(packageRoot, 'generated/themes.mjs'), 'utf8');
const themeTypes = await readFile(resolve(packageRoot, 'generated/themes.d.ts'), 'utf8');
const themeCss = await readFile(resolve(packageRoot, 'generated/themes.css'), 'utf8');
const apcaThemeCss = await readFile(resolve(packageRoot, 'generated/themes-apca.css'), 'utf8');
const baseCss = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');

function cssSelector(collection, id, colorScheme, contrast) {
  const themeId = `${collection}-${id}`;
  const scheme = colorScheme === 'dark' ? `[data-muxui-color-scheme='dark']` : `:not([data-muxui-color-scheme='dark'])`;
  const contrastSelector = contrast === 'more' ? `[data-muxui-contrast='more']` : `:not([data-muxui-contrast='more'])`;
  return `[data-muxui-theme='${themeId}']${scheme}${contrastSelector}`;
}

function declarationsFor(selector) {
  const start = themeCss.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `generated theme selector exists: ${selector}`);
  const end = themeCss.indexOf('\n}', start);
  assert.ok(end > start, `generated theme selector closes: ${selector}`);
  return new Map([...themeCss.slice(start, end).matchAll(/^  (--[^:]+): (.+);$/gmu)].map((match) => [match[1], match[2]]));
}

const collections = [
  ['standard', source.theme.scale.standardPresets],
  ['monochrome', source.theme.scale.monochromePresets],
];
const expectedPresetCount = collections.reduce((count, [, presets]) => count + presets.length, 0);

test('theme metadata exposes every canonical Scale preset and derived swatches', () => {
  assert.deepEqual(manifest.exports['./themes'], {
    types: './generated/themes.d.ts',
    default: './generated/themes.mjs',
  });
  assert.equal(manifest.exports['./themes.css'], './generated/themes.css');
  assert.doesNotMatch(themeRuntime, /@muxui\/(?:tokens|scale)|from ['"]/u);
  assert.doesNotMatch(themeTypes, /@muxui\/(?:tokens|scale)|from ['"]/u);
  assert.equal(MUXUI_THEME_PRESETS.length, expectedPresetCount);
  assert.equal(MUXUI_THEME_PRESETS.length, 15);
  assert.equal(MUXUI_DEFAULT_THEME_PRESET_ID, `standard-${source.theme.scale.defaults.standard}`);
  assert.equal(Object.keys(MUXUI_THEME_PRESETS_BY_ID).length, expectedPresetCount);

  for (const [collection, presets] of collections) {
    for (const preset of presets) {
      const metadata = MUXUI_THEME_PRESETS_BY_ID[`${collection}-${preset.id}`];
      const compiled = compileScalePresetTheme({ source, collection, presetId: preset.id, modes: { colorScheme: 'light', contrast: 'standard' } });
      assert.deepEqual(metadata, compiled.preset);
      assert.equal(metadata.name, preset.name);
      assert.equal(metadata.description, preset.description);
      assert.match(metadata.swatch.primary, /^#[0-9a-f]{6}$/u);
      assert.match(metadata.swatch.secondary, /^#[0-9a-f]{6}$/u);
    }
  }
});

test('theme metadata gives every preset its action background in each color scheme, from the compiled theme', () => {
  assert.deepEqual(Object.keys(MUXUI_THEME_ACTION_BACKGROUNDS).sort(), MUXUI_THEME_PRESETS.map(({ id }) => id).sort());
  for (const [collection, presets] of collections) {
    for (const { id } of presets) {
      for (const colorScheme of ['light', 'dark']) {
        // Contrast does not change the action background, so both contrast modes give the one value.
        for (const contrast of ['standard', 'more']) {
          const { compiled } = compileScalePresetTheme({ source, collection, presetId: id, modes: { colorScheme, contrast } });
          assert.equal(MUXUI_THEME_ACTION_BACKGROUNDS[`${collection}-${id}`][colorScheme], cssValue(compiled.tokens['semantic.action.background']), `${collection}-${id} ${colorScheme} ${contrast}`);
        }
      }
    }
  }
  assert.ok(Object.isFrozen(MUXUI_THEME_ACTION_BACKGROUNDS['standard-harbour']));
});

test('preset CSS covers all combined color and contrast modes without layout repainting', () => {
  const representativeRoles = [
    'component.button.background',
    'component.button.foreground',
    'semantic.content.default',
    'semantic.effect.scrim',
  ];
  for (const [collection, presets] of collections) {
    for (const { id } of presets) {
      for (const colorScheme of ['light', 'dark']) {
        for (const contrast of ['standard', 'more']) {
          const compiled = compileScalePresetTheme({ source, collection, presetId: id, modes: { colorScheme, contrast } });
          const declarations = declarationsFor(cssSelector(collection, id, colorScheme, contrast));
          for (const role of representativeRoles) {
            const token = compiled.compiled.tokens[role];
            assert.ok(token, `${collection}-${id}: ${role} is compiled`);
            assert.equal(declarations.get(cssName(role)), cssValue(token), `${collection}-${id}: ${role} matches compiler`);
          }
          assert.ok(declarations.size > 200, `${collection}-${id}: dependency closure is complete`);
          assert.ok(declarations.has(cssName('semantic.color.neutral-20')), `${collection}-${id}: neutral swatch seed is emitted`);
        }
      }
    }
  }
  assert.match(themeCss, /--muxui-semantic-effect-scrim:/u);
  assert.doesNotMatch(themeCss, /--muxui-reference-dimension-/u);
  assert.doesNotMatch(themeCss, /--muxui-semantic-typography-[^:;]*(?:font-size|font-weight|line-height|letter-spacing):/u);
  assert.match(baseCss, /--muxui-component-button-background:/u);
});

// themes.css and themes-apca.css hold the same 60 blocks (15 presets x light/dark x standard/more) and differ in
// the method that picks each shade's text color. The fixture compiles every block once per method.
const WCAG2 = 'wcag2-endpoint-v1';
const APCA = 'apca-endpoint-v1';
const blockOrder = collections.flatMap(([collection, presets]) => presets.flatMap(({ id }) => ['light', 'dark'].flatMap(
  (colorScheme) => ['standard', 'more'].map((contrast) => ({ collection, id, colorScheme, contrast, selector: cssSelector(collection, id, colorScheme, contrast) })),
)));
const compilations = Object.fromEntries([WCAG2, APCA].map((contrastAlgorithm) => [contrastAlgorithm, blockOrder.map((block) => compileScalePresetTheme({
  source, collection: block.collection, presetId: block.id, contrastAlgorithm, modes: { colorScheme: block.colorScheme, contrast: block.contrast },
}))]));

/** Selector -> (custom property -> value), in file order. */
function blocksOf(css) {
  return new Map([...css.matchAll(/^(\[data-muxui-theme=[^\n]+) \{\n([\s\S]*?)\n\}$/gmu)].map(([, selector, body]) => [
    selector, new Map([...body.matchAll(/^  (--[^:]+): (.+);$/gmu)].map(([, property, value]) => [property, value])),
  ]));
}
const wcagBlocks = blocksOf(themeCss);
const apcaBlocks = blocksOf(apcaThemeCss);

// The tokens a preset re-declares: the color tokens its compile assigns and every color or effect token that reads one,
// through the base token graph.
const graph = compileTokenGraph(source);
const dependents = new Map();
for (const [id, dependencies] of Object.entries(graph.dependencies)) {
  for (const dependency of dependencies) dependents.set(dependency, [...(dependents.get(dependency) ?? []), id]);
}
function withDependents(seeds) {
  const found = new Set(seeds);
  for (const id of found) for (const dependent of dependents.get(id) ?? []) found.add(dependent);
  return found;
}

test('themes-apca.css is a second export, and each stylesheet is its own method compiled for every block', () => {
  assert.equal(manifest.exports['./themes-apca.css'], './generated/themes-apca.css');
  for (const [blocks, algorithm] of [[wcagBlocks, WCAG2], [apcaBlocks, APCA]]) {
    assert.deepEqual([...blocks.keys()], blockOrder.map(({ selector }) => selector), `${algorithm}: selectors in rule order`);
    blockOrder.forEach(({ selector }, index) => {
      const { compiled, generated, preset } = compilations[algorithm][index];
      const seeds = Object.keys(generated.assignments).filter((id) => source.tokens[id]?.type === 'color');
      const expected = [...withDependents(seeds)].filter((id) => ['color', 'effect'].includes(compiled.tokens[id]?.type));
      const block = blocks.get(selector);
      // Each sheet is held to its own method's compile, so a property missing from both sheets still fails.
      assert.deepEqual([...block.keys()].sort(), expected.map(cssName).sort(), `${algorithm}: ${selector} declares exactly the seeded tokens and what reads them`);
      for (const id of expected) assert.equal(block.get(cssName(id)), cssValue(compiled.tokens[id]), `${algorithm}: ${selector} ${id}`);
      assert.deepEqual(preset, MUXUI_THEME_PRESETS_BY_ID[preset.id], `${algorithm}: ${preset.id} metadata is method-independent`);
    });
  }
});

test('themes-apca.css differs from themes.css only in text tokens and the declarations that read them', () => {
  const allowed = new Set([...withDependents(Object.keys(source.tokens).filter((id) => /^semantic\.color\.(?:color|neutral)-\d+-fg$/u.test(id)))].map(cssName));

  assert.deepEqual([...apcaBlocks.keys()], [...wcagBlocks.keys()]);
  let differing = 0;
  for (const [selector, wcag] of wcagBlocks) {
    const apca = apcaBlocks.get(selector);
    assert.deepEqual([...apca.keys()], [...wcag.keys()], `${selector}: same properties in the same order`);
    for (const [property, value] of apca) {
      if (value === wcag.get(property)) continue;
      differing += 1;
      assert.ok(allowed.has(property), `${selector}: ${property} differs but is neither a text token nor reads one`);
    }
  }
  assert.ok(differing > 0, 'the two methods choose a different text color somewhere');
});

test('APCA text colors are scaleForegrounds endpoints, including the blackened dark neutral', () => {
  let blackened = 0;
  blockOrder.forEach(({ selector, colorScheme }, index) => {
    const { tokens } = compilations[APCA][index].compiled;
    const block = apcaBlocks.get(selector);
    for (const family of ['color', 'neutral']) {
      const palette = Object.keys(tokens).flatMap((id) => {
        const shade = new RegExp(`^semantic\\.color\\.${family}-(\\d+)-fg$`, 'u').exec(id)?.[1];
        return shade === undefined ? [] : [{ shade: Number(shade), hex: tokens[`semantic.color.${family}-${shade}`].value }];
      });
      assert.ok(palette.length > 0, `${selector}: ${family} palette is found`);
      const endpoint = `--muxui-semantic-color-${family}-5`;
      for (const { shade, text } of scaleForegrounds(palette, { pivot: 'auto', algorithm: APCA })) {
        const actual = block.get(`--muxui-semantic-color-${family}-${shade}-fg`);
        // The dark neutral canvas is a color-mix of neutral-10 with black, so text that is that endpoint keeps the mix.
        const isEndpoint = text === tokens[`semantic.color.${family}-5`].value;
        assert.equal(actual, isEndpoint ? block.get(endpoint) : text, `${selector}: ${family}-${shade}-fg`);
        if (colorScheme === 'dark' && family === 'neutral' && isEndpoint) {
          assert.match(actual, /^color-mix\(in srgb, var\(--muxui-semantic-color-neutral-10\) 85%, #000000\)$/u, `${selector}: neutral-${shade}-fg keeps the blackened mix`);
          blackened += 1;
        } else {
          assert.match(actual, /^#[0-9a-f]{6}$/u, `${selector}: ${family}-${shade}-fg is a plain color`);
        }
      }
    }
  });
  assert.ok(blackened > 0, 'some dark neutral text is the blackened endpoint');
});

test('roles that alias a text token follow it in themes-apca.css', () => {
  for (const { selector, colorScheme } of blockOrder) {
    const block = apcaBlocks.get(selector);
    const text = (shade) => block.get(`--muxui-semantic-color-color-${shade}-fg`);
    const action = block.get('--muxui-semantic-action-foreground');
    assert.equal(action, text(60), `${selector}: action foreground`);
    for (const role of ['--muxui-semantic-action-foreground-hover', '--muxui-semantic-action-foreground-pressed', '--muxui-component-button-foreground', '--muxui-component-taggroup-brand-selected-foreground']) {
      assert.equal(block.get(role), action, `${selector}: ${role}`);
    }
    assert.equal(block.get('--muxui-component-checkbox-selected-foreground-hover'), text(colorScheme === 'dark' ? 50 : 60), `${selector}: checkbox glyph`);
  }
});

// Base-sheet declarations a theme block's var() may fall back to: :root, then the block's colour scheme.
const baseScopes = new Map([...baseCss.matchAll(/^(:root|\[data-muxui-color-scheme='(?:light|dark)'\]) \{\n([\s\S]*?)\n\}$/gmu)].map(([, selector, body]) => [
  selector, new Map([...body.matchAll(/^  (--[^:]+): (.+);$/gmu)].map(([, property, value]) => [property, value])),
]));

/** Splits a function's arguments on top-level commas. */
function topLevelArguments(text) {
  const parts = ['']; let depth = 0;
  for (const character of text) {
    if (character === ',' && depth === 0) { parts.push(''); continue; }
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    parts[parts.length - 1] += character;
  }
  return parts.map((part) => part.trim());
}

/** Resolves a generated colour value to straight-alpha sRGB channels in 0..1, following var() and srgb color-mix(). */
function resolveColor(value, lookup, seen = []) {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/iu.exec(value);
  if (hex) return [...[0, 2, 4].map((offset) => Number.parseInt(hex[1].slice(offset, offset + 2), 16) / 255), hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1];
  const reference = /^var\((--[a-z0-9-]+)\)$/u.exec(value);
  if (reference) {
    assert.ok(!seen.includes(reference[1]), `var() cycle through ${reference[1]}`);
    const target = lookup(reference[1]);
    assert.ok(target !== undefined, `${reference[1]} is declared`);
    return resolveColor(target, lookup, [...seen, reference[1]]);
  }
  const mix = /^color-mix\(in srgb, (.+)\)$/u.exec(value);
  assert.ok(mix, `supported colour: ${value}`);
  const [first, second] = topLevelArguments(mix[1]);
  const weighted = /^(.+) (\d+(?:\.\d+)?)%$/u.exec(first);
  assert.ok(weighted && !/%$/u.test(second), `color-mix weights only its first colour: ${value}`);
  const weight = Number(weighted[2]) / 100;
  const left = resolveColor(weighted[1], lookup, seen);
  const right = resolveColor(second, lookup, seen);
  // CSS mixes premultiplied channels, then divides by the mixed alpha.
  const alpha = left[3] * weight + right[3] * (1 - weight);
  return [0, 1, 2].map((channel) => alpha === 0 ? 0 : (left[channel] * left[3] * weight + right[channel] * right[3] * (1 - weight)) / alpha).concat(alpha);
}

const over = (foreground, background) => [0, 1, 2].map((channel) => foreground[channel] * foreground[3] + background[channel] * (1 - foreground[3])).concat(1);
const toHex = (color) => `#${color.slice(0, 3).map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;

// Readable text roles and the grounds they sit on, each ground listed bottom layer first and composited over the page.
// content-faint and content-secondary are left out: they colour separators, disabled controls and non-text marks,
// which APCA does not hold to the body-text mark. Placeholders take field-placeholder, held to WCAG 4.5:1 per family
// in test/browser/placeholder-contrast.test.mjs.
const TEXT_CHECKS = [
  {
    text: ['semantic-content-default', 'semantic-content-muted', 'semantic-field-label', 'semantic-content-link'],
    grounds: ['surface-background', 'surface-canvas', 'surface-raised', 'surface-subtle', 'surface-hover'].map((role) => [`semantic-${role}`]),
  },
  {
    // Unselected tab labels (collections.css). The tab list is transparent, so a label sits on the page surface;
    // underline tabs hover on a surface-hover layer, and pill, segment and overflow tabs sit in a neutral action fill.
    text: ['component-tabs-tab-foreground'],
    grounds: [
      ['semantic-surface-background'],
      ['semantic-surface-canvas'],
      ['semantic-surface-raised'],
      ['semantic-surface-canvas', 'semantic-surface-hover'],
      ['semantic-surface-canvas', 'semantic-action-neutral-background'],
    ],
  },
];
const MIN_TEXT_LC = 60;

test('readable text roles score at least APCA Lc 60 on their grounds in both sheets, both schemes, standard contrast', () => {
  const failures = [];
  let scored = 0;
  for (const [name, blocks] of [['themes.css', wcagBlocks], ['themes-apca.css', apcaBlocks]]) {
    for (const { selector, colorScheme, contrast } of blockOrder) {
      if (contrast !== 'standard') continue;
      const block = blocks.get(selector);
      const scope = baseScopes.get(`[data-muxui-color-scheme='${colorScheme}']`);
      const lookup = (property) => block.get(property) ?? scope.get(property) ?? baseScopes.get(':root').get(property);
      const color = (name) => resolveColor(`var(--muxui-${name})`, lookup);
      const page = colorScheme === 'dark' ? [0, 0, 0, 1] : [1, 1, 1, 1];
      for (const { text, grounds } of TEXT_CHECKS) {
        for (const layers of grounds) {
          const ground = layers.reduce((below, layer) => over(color(layer), below), page);
          for (const role of text) {
            const lc = Math.abs(getScaleApcaContrast(toHex(over(color(role), ground)), toHex(ground)));
            scored += 1;
            if (lc < MIN_TEXT_LC) failures.push(`${name} ${selector}: ${role} on ${layers.join(' + ')} is Lc ${lc.toFixed(1)}`);
          }
        }
      }
    }
  }
  const pairs = TEXT_CHECKS.reduce((count, { text, grounds }) => count + text.length * grounds.length, 0);
  assert.equal(pairs, 4 * 5 + 5);
  assert.equal(scored, 2 * expectedPresetCount * 2 * pairs);
  assert.deepEqual(failures, []);
});

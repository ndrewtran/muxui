import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { compileTokenGraph } from '@muxui/tokens';
import { compileScalePresetTheme, scaleForegrounds } from '@muxui/tokens/authoring';
import { cssName, cssValue } from '@muxui/tokens/core';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import {
  MUXUI_DEFAULT_THEME_PRESET_ID,
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

test('themes-apca.css is a second export, and each stylesheet is its own method compiled for every block', () => {
  assert.equal(manifest.exports['./themes-apca.css'], './generated/themes-apca.css');
  for (const [blocks, algorithm] of [[wcagBlocks, WCAG2], [apcaBlocks, APCA]]) {
    assert.deepEqual([...blocks.keys()], blockOrder.map(({ selector }) => selector), `${algorithm}: selectors in rule order`);
    blockOrder.forEach(({ selector }, index) => {
      const { compiled, preset } = compilations[algorithm][index];
      const properties = new Map(Object.keys(compiled.tokens).map((id) => [cssName(id), id]));
      for (const [property, value] of blocks.get(selector)) {
        assert.equal(value, cssValue(compiled.tokens[properties.get(property)]), `${algorithm}: ${selector} ${property}`);
      }
      assert.deepEqual(preset, MUXUI_THEME_PRESETS_BY_ID[preset.id], `${algorithm}: ${preset.id} metadata is method-independent`);
    });
  }
});

test('themes-apca.css differs from themes.css only in text tokens and the declarations that read them', () => {
  const graph = compileTokenGraph(source);
  const dependents = new Map();
  for (const [id, dependencies] of Object.entries(graph.dependencies)) {
    for (const dependency of dependencies) dependents.set(dependency, [...(dependents.get(dependency) ?? []), id]);
  }
  const reachable = Object.keys(source.tokens).filter((id) => /^semantic\.color\.(?:color|neutral)-\d+-fg$/u.test(id));
  for (const id of reachable) for (const dependent of dependents.get(id) ?? []) if (!reachable.includes(dependent)) reachable.push(dependent);
  const allowed = new Set(reachable.map(cssName));

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

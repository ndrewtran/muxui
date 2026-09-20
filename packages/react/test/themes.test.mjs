import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { compileScalePresetTheme } from '@muxui/tokens/authoring';
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

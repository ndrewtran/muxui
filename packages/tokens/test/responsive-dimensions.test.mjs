import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compilePureTokenGraph, cssValue } from '../src/core.mjs';
import { compileNativeTheme, compileWebTheme } from '../src/index.mjs';
import { compileThemeAuthoringDocument } from '../src/authoring.mjs';

const source = JSON.parse(await readFile(new URL('../../../catalog/tokens/default-theme.json', import.meta.url), 'utf8'));

test('default dimensions preserve static rem values and responsive dimensions are explicitly selected', () => {
  const normal = compilePureTokenGraph(source);
  const responsive = compilePureTokenGraph(source, { responsive: true });
  assert.equal(cssValue(normal.tokens['reference.dimension.space-3xl']), '6.99375rem');
  assert.equal(cssValue(normal.tokens['semantic.typography.display-s-font-size']), '2.125rem');
  assert.equal(cssValue(normal.tokens['semantic.typography.text-xs-font-size']), '0.76875rem');
  assert.equal(cssValue(responsive.tokens['semantic.typography.display-s-font-size']), 'clamp(1.61875rem, calc(2.05vw + 0.075rem), 2.125rem)');
  assert.equal(cssValue(responsive.tokens['reference.dimension.text-8xl']), 'clamp(1.9625rem, calc(4vw + -1.1875rem), 2.8125rem)');
  assert.equal(Object.values(source.tokens).filter((token) => token.fluid?.default).length, 28);
  assert.throws(() => compilePureTokenGraph(source, { responsive: 'yes' }), /OPTIONS_INVALID/u);
  const malformed = structuredClone(source);
  malformed.tokens['reference.dimension.space-m'].fluid.default.unknown = true;
  assert.throws(() => compilePureTokenGraph(malformed), /DECORATION_INVALID/u);
});

test('Node and browser authoring share static and responsive choices; native requires its root metric', () => {
  const document = { schema: 'muxui-theme-authoring-v1', id: 'muxui:theme:responsive', source: source.id, tokenContractVersion: source.tokenContractVersion, modes: source.theme.modeAxes, overrides: {} };
  for (const responsive of [false, true]) {
    assert.equal(compileThemeAuthoringDocument(document, { source, responsive }).css.trim(), compileWebTheme(source, { responsive }).css.trim());
  }
  const native = compileNativeTheme(source, { profile: 'native.ios', rootFontSizePx: 20 });
  assert.equal(native.theme['reference.dimension.space-3xl'].value, 139.875);
  const fluidNative = compileNativeTheme(source, { profile: 'native.ios', rootFontSizePx: 20, responsive: true });
  assert.ok(fluidNative.diagnostics.some(({ code, id }) => code === 'MUXUI_TOKEN_FLUID_RECIPE_DEFERRED' && id === 'reference.dimension.space-3xl'));
});

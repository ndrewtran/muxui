import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { compileTailwindConsumer, compileTailwindTheme } from '../src/tailwind.mjs';

test('Tailwind adapter aliases Mux-owned token namespaces without importing Tailwind', async () => {
  const css = compileTailwindTheme(source);
  assert.match(css, /^@theme inline \{/u);
  assert.match(css, /--color-muxui-component-button-background: var\(--muxui-component-button-background\);/u);
  assert.match(css, /--spacing-muxui-component-button-padding-inline: var\(--muxui-component-button-padding-inline\);/u);
  assert.match(css, /--radius-muxui-component-button-radius: var\(--muxui-component-button-radius\);/u);
  assert.match(css, /--text-muxui-semantic-typography-body-size: var\(--muxui-semantic-typography-body-size\);/u);
  assert.match(css, /--leading-muxui-semantic-typography-body-line-height: var\(--muxui-semantic-typography-body-line-height\);/u);
  assert.match(css, /--font-weight-muxui-semantic-typography-body-weight: var\(--muxui-semantic-typography-body-weight\);/u);
  assert.match(css, /--tracking-muxui-semantic-typography-display-letter-spacing: var\(--muxui-semantic-typography-display-letter-spacing\);/u);
  assert.match(css, /--shadow-muxui-reference-effect-shadow-m: var\(--muxui-reference-effect-shadow-m\);/u);
  assert.match(css, /--font-muxui-reference-typography-body-font: var\(--muxui-reference-typography-body-font\);/u);
  assert.match(css, /--ease-muxui-reference-motion-easing-linear: var\(--muxui-reference-motion-easing-linear\);/u);
  assert.doesNotMatch(css, /--font-muxui-reference-motion-easing/u);
  assert.match(css, /--transition-duration-muxui-reference-duration-fast: var\(--muxui-reference-duration-fast\);/u);

  const consumer = compileTailwindConsumer(source, { muxuiCss: ':root { --muxui-component-button-background: #025768; }' });
  assert.ok(consumer.indexOf(':root {') < consumer.indexOf('@theme inline'));
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dependencies?.tailwindcss, undefined);
  assert.equal(manifest.peerDependencies?.tailwindcss, undefined);
});

test('Tailwind adapter keeps its output contract closed to arbitrary selectors', () => {
  assert.throws(() => compileTailwindTheme(source, { selector: ':root' }), /MUXUI_TAILWIND_SELECTOR_INVALID/u);
  assert.throws(() => compileTailwindConsumer(source, { muxuiCss: null }), /MUXUI_TAILWIND_CSS_INVALID/u);
  const malformed = structuredClone(source);
  malformed.tokens['semantic.bad{}'] = {
    layer: 'semantic', type: 'color', unit: 'hex', meaning: 'Malformed fixture token.', overridePolicy: 'theme', value: '#000000',
  };
  assert.throws(() => compileTailwindTheme(malformed), /MUXUI_TAILWIND_TOKEN_ID_INVALID/u);
});

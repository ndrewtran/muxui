import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import defaultTheme from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import {
  FOUNDATIONS_CATEGORY_INVENTORY,
  FoundationsGallery,
  copyTextToClipboard,
  foundationComparisonPanels,
  foundationCategoryCounts,
  foundationTokenRows,
  foundationVisualSpecimenKind,
  responsiveFoundationRows,
  resolveTokenValue,
} from '../src/foundations-gallery.mjs';

const appRoot = resolve(import.meta.dirname, '..');

test('Foundations binds directly to the canonical token source and covers every supported token', async () => {
  const source = await readFile(resolve(appRoot, 'src/foundations-gallery.mjs'), 'utf8');
  assert.match(source, /catalog\/tokens\/default-theme\.json/u);
  assert.equal(foundationTokenRows(defaultTheme).length, 813);
  assert.equal(Object.keys(defaultTheme.tokens).length - foundationTokenRows(defaultTheme).length, 0);
  assert.deepEqual(
    FOUNDATIONS_CATEGORY_INVENTORY.map(({ id }) => id),
    ['colors', 'typography', 'spacing', 'radii-shadows', 'motion', 'component'],
  );
  assert.deepEqual(
    Object.keys(foundationCategoryCounts(defaultTheme)),
    FOUNDATIONS_CATEGORY_INVENTORY.map(({ id }) => id),
  );
  assert.equal(foundationCategoryCounts(defaultTheme).colors, 641);
  assert.equal(foundationCategoryCounts(defaultTheme).component, 5);
  const rows = foundationTokenRows(defaultTheme);
  const coveredIds = new Set(rows.flatMap(({ id, facets }) => facets.map(() => id)));
  assert.equal(rows.length, 813);
  assert.equal(new Set(rows.map(({ id }) => id)).size, 813);
  assert.equal(new Set(rows.filter(({ facets }) => facets.includes('colors')).map(({ id }) => id)).size, 641);
  assert.equal(new Set(rows.filter(({ facets }) => facets.includes('component')).map(({ id }) => id)).size, 5);
  assert.equal(coveredIds.size, 813);
  assert.ok(foundationTokenRows(defaultTheme).every(({ cssVariable }) => cssVariable.startsWith('--muxui-')));
});

test('every category emits a visual specimen kind and every color token gets a swatch', () => {
  const rows = foundationTokenRows(defaultTheme);
  const expectedKinds = {
    colors: 'color-swatch',
    typography: 'typography-sample',
    spacing: 'measurement-ruler',
    'radii-shadows': 'shape-box',
    motion: 'motion-timeline',
    component: 'component-schematic',
  };
  for (const row of rows) assert.equal(row.visualKind, expectedKinds[row.category], row.id);
  assert.equal(rows.filter(({ facets }) => facets.includes('colors')).length, 641);
  const markup = renderToStaticMarkup(React.createElement(FoundationsGallery, { theme: defaultTheme }));
  assert.equal((markup.match(/data-muxui-foundations-color-swatch=/gu) ?? []).length, 641);
  assert.equal(foundationVisualSpecimenKind('semantic.control.radius', defaultTheme.tokens['semantic.control.radius']), 'shape-box');
  assert.equal(foundationVisualSpecimenKind('semantic.control.padding-inline', defaultTheme.tokens['semantic.control.padding-inline']), 'measurement-ruler');
});

test('Foundations routes terminal shape names to the intended categories', () => {
  const rows = foundationTokenRows(defaultTheme);
  const categoryFor = (id) => rows.find((row) => row.id === id)?.category;
  assert.equal(categoryFor('semantic.control.radius'), 'radii-shadows');
  assert.equal(categoryFor('reference.dimension.radius-m'), 'radii-shadows');
  assert.equal(categoryFor('semantic.control.padding-inline'), 'spacing');

  const shadowFixture = {
    ...defaultTheme,
    tokens: {
      ...defaultTheme.tokens,
      'semantic.control.shadow': {
        layer: 'semantic',
        type: 'string',
        unit: 'css',
        value: '0 1px 2px rgb(0 0 0 / 20%)',
      },
    },
  };
  assert.equal(categoryFor('semantic.control.shadow'), undefined);
  assert.equal(foundationTokenRows(shadowFixture).find((row) => row.id === 'semantic.control.shadow')?.category, 'radii-shadows');
});

test('alias chains and selected mode overrides resolve from source data', () => {
  const light = resolveTokenValue(defaultTheme, 'semantic.action.background', { colorScheme: 'light' });
  const dark = resolveTokenValue(defaultTheme, 'semantic.action.background', { colorScheme: 'dark' });
  assert.equal(light.status, 'resolved');
  assert.equal(dark.status, 'resolved');
  assert.equal(light.value, defaultTheme.tokens[light.sourceTokenId].value);
  assert.equal(dark.value, defaultTheme.tokens[dark.sourceTokenId].value);
  assert.deepEqual(light.chain, ['semantic.action.background', 'semantic.color.color-60', 'reference.color.brand-60']);
  assert.deepEqual(dark.chain, ['semantic.action.background', 'semantic.color.color-60', 'reference.color.brand-40']);

  const compact = resolveTokenValue(defaultTheme, 'semantic.control.padding-inline', { density: 'compact' });
  assert.equal(compact.value, defaultTheme.tokens['reference.dimension.space-3xs'].value);
  const reduced = resolveTokenValue(defaultTheme, 'reference.duration.fast', { motion: 'reduced' });
  assert.equal(reduced.value, 0);
  const title = resolveTokenValue(defaultTheme, 'semantic.typography.title-l-font-size');
  assert.equal(title.value, defaultTheme.tokens['reference.dimension.text-xl'].value * 1.1);
  assert.deepEqual(title.formula, defaultTheme.tokens['semantic.typography.title-l-font-size'].formula);
});

test('malformed aliases and unsupported token facts fail closed', () => {
  const malformed = {
    ...defaultTheme,
    tokens: {
      ...defaultTheme.tokens,
      'semantic.action.background': {
        ...defaultTheme.tokens['semantic.action.background'],
        alias: 'reference.color.does-not-exist',
      },
      'semantic.action.foreground': {
        ...defaultTheme.tokens['semantic.action.foreground'],
        modes: { 'colorScheme.dark': { alias: 'reference.color.does-not-exist' } },
      },
      'reference.unsupported.gradient': {
        layer: 'reference',
        type: 'gradient',
        unit: 'css',
        value: 'linear-gradient(red, blue)',
      },
    },
  };
  const result = resolveTokenValue(malformed, 'semantic.action.background');
  assert.equal(result.status, 'unresolved');
  assert.equal(result.reason, 'missing-alias-target');
  assert.equal(foundationTokenRows(malformed).some(({ id }) => id === 'reference.unsupported.gradient'), false);
  assert.equal(foundationTokenRows(malformed).find(({ id }) => id === 'semantic.action.background').defaultDisplay, 'Unavailable');
  assert.equal(resolveTokenValue(malformed, 'reference.unsupported.gradient').status, 'unresolved');
  assert.equal(resolveTokenValue(malformed, 'semantic.action.foreground', { colorScheme: 'dark' }).status, 'unresolved');
});

test('rendered gallery exposes category navigation, searchable rows, mode comparisons, and copy controls', () => {
  const markup = renderToStaticMarkup(React.createElement(FoundationsGallery, { theme: defaultTheme }));
  const responsiveRows = responsiveFoundationRows(defaultTheme);
  assert.equal(responsiveRows.length, 5);
  assert.ok(responsiveRows.every(({ staticValue, responsiveValue }) => staticValue !== responsiveValue));
  assert.match(markup, /data-muxui-foundations-gallery="true"/u);
  for (const { id } of FOUNDATIONS_CATEGORY_INVENTORY) assert.match(markup, new RegExp(`data-muxui-foundations-category="${id}"`, 'u'));
  assert.match(markup, /data-muxui-foundations-search/iu);
  assert.match(markup, /data-muxui-foundations-mode="colorScheme"/u);
  assert.match(markup, /data-muxui-foundations-mode="contrast"/u);
  assert.match(markup, /data-muxui-foundations-mode="density"/u);
  assert.match(markup, /data-muxui-foundations-mode="motion"/u);
  assert.match(markup, /Visual mode comparisons/u);
  assert.equal((markup.match(/data-muxui-foundations-comparison-panel=/gu) ?? []).length, 8);
  for (const axis of ['colorScheme', 'contrast', 'density', 'motion']) {
    assert.match(markup, new RegExp(`data-muxui-foundations-comparison-axis="${axis}"`, 'u'));
  }
  assert.match(markup, /data-muxui-foundations-alias-chain="semantic.action.background"/u);
  assert.match(markup, /data-muxui-foundations-alias-node="reference.color.bluegreen-60"/u);
  assert.match(markup, /data-muxui-foundations-alias-link=/u);
  assert.match(markup, /data-muxui-foundations-copy="--muxui-semantic-action-background"/u);
  assert.match(markup, /Copy CSS variable --muxui-semantic-action-background/u);
  assert.match(markup, /data-muxui-foundations-responsive="true"/u);
  assert.match(markup, /Static by default, responsive by choice/u);
  assert.match(markup, /data-muxui-foundations-responsive-mode="static"/u);
  assert.match(markup, /data-muxui-foundations-responsive-mode="responsive"/u);
  assert.match(markup, /data-muxui-responsive/u);
});

test('visual comparison panels resolve canonical values and reduced motion is one-shot safe', () => {
  const panels = foundationComparisonPanels(defaultTheme);
  assert.equal(panels.length, 8);
  assert.ok(panels.every(({ resolved }) => resolved.status === 'resolved'));
  assert.equal(panels.find(({ id }) => id === 'density-compact').resolved.value, 7);
  assert.equal(panels.find(({ id }) => id === 'motion-reduced').resolved.value, 0);
  const contrastPanel = panels.find(({ id }) => id === 'contrast-more');
  assert.deepEqual(contrastPanel.comparison, { sameResolvedAppearance: true, hasCanonicalOverride: false });
  const markup = renderToStaticMarkup(React.createElement(FoundationsGallery, { theme: defaultTheme }));
  assert.match(markup, /data-muxui-foundations-comparison-panel="motion-reduced"[\s\S]*--muxui-foundations-motion-duration:0ms/u);
  assert.match(markup, /data-muxui-foundations-contrast-relationship="same-resolved-appearance"/u);
  assert.match(markup, /data-muxui-foundations-motion-comparison="true"/u);
  assert.match(markup, /data-muxui-foundations-motion-comparison-fill="full"[^>]+--muxui-foundations-motion-duration:120ms/u);
  assert.match(markup, /data-muxui-foundations-motion-comparison-fill="reduced"[^>]+--muxui-foundations-motion-duration:0ms/u);
  assert.match(markup, /data-muxui-foundations-comparison-motion-mark="motion-full"[^>]+aria-hidden="true"[^>]*><\/span>/u);
  assert.match(markup, /data-muxui-foundations-comparison-motion-mark="motion-reduced"[^>]+aria-hidden="true"[^>]*><\/span>/u);
});

test('color, typography, and component facets render exact visual contracts', () => {
  const rows = foundationTokenRows(defaultTheme);
  const componentRows = rows.filter(({ facets }) => facets.includes('component'));
  assert.equal(componentRows.length, 5);
  assert.ok(rows.filter(({ facets }) => facets.includes('colors')).every(({ visualKind }) => visualKind === 'color-swatch' || visualKind === 'component-schematic'));
  assert.equal(rows.find(({ id }) => id === 'reference.typography.heading-font-family').category, 'typography');
  assert.equal(rows.find(({ id }) => id === 'reference.motion.easing-linear').category, 'motion');
  assert.equal(rows.find(({ id }) => id === 'semantic.effect.scrim').category, 'colors');
  assert.equal(foundationVisualSpecimenKind('reference.typography.heading-font-family', defaultTheme.tokens['reference.typography.heading-font-family']), 'typography-sample');
  assert.equal(foundationVisualSpecimenKind('reference.motion.easing-linear', defaultTheme.tokens['reference.motion.easing-linear']), 'motion-timeline');
  assert.equal(foundationVisualSpecimenKind('semantic.effect.scrim', defaultTheme.tokens['semantic.effect.scrim']), 'color-swatch');
  const markup = renderToStaticMarkup(React.createElement(FoundationsGallery, { theme: defaultTheme }));
  assert.match(markup, /data-muxui-foundations-color-fill="semantic.effect.scrim"[^>]+style="background-color:#11100f7a"/u);
  assert.match(markup, /data-muxui-foundations-color-fill="semantic\.effect\.scrim"[^>]+style="background-color:#11100f7a"><\/div>/u);
});

test('structured elevation captions preserve shared inset and alpha formatting', () => {
  const row = foundationTokenRows(defaultTheme).find(({ id }) => id === 'semantic.elevation.control');
  assert.ok(row);
  assert.match(row.defaultDisplay, /inset 0px 0px 0px 1px rgba\(0, 0, 0, 0\)/u);
  assert.match(row.defaultDisplay, /inset 0px 0px 0px 1px rgba\(10, 13, 18, 0\.18\)/u);
});

test('copy helper reports Clipboard API success and graceful unavailability', async () => {
  let copied;
  const success = await copyTextToClipboard('--muxui-semantic-action-background', {
    async writeText(value) {
      copied = value;
    },
  });
  assert.deepEqual(success, { ok: true, method: 'clipboard' });
  assert.equal(copied, '--muxui-semantic-action-background');
  assert.deepEqual(await copyTextToClipboard(''), { ok: false, method: 'invalid' });
});

test('generated Foundations story has the standard identity markers', async () => {
  const source = await readFile(resolve(appRoot, '.storybook/generated/foundations.stories.mjs'), 'utf8');
  const match = source.match(/^\/\/ @generated-from: ([^\n]+)\n\/\/ @generated-content-sha256: (sha256:[a-f0-9]{64})\n([\s\S]+)$/u);
  assert.ok(match);
  assert.equal(match[1], 'apps/react-storybook/src/generate-stories.mjs');
  assert.equal(match[2], `sha256:${createHash('sha256').update(match[3]).digest('hex')}`);
  assert.match(match[3], /title: 'Foundations'/u);
  assert.match(match[3], /export const Gallery/u);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TagGroup } from '../../generated/index.mjs';
import { MUXUI_THEME_PRESETS } from '../../generated/themes.mjs';
import { launchBrowser } from './harness.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');
const h = React.createElement;
const variants = ['soft', 'outline', 'dot', 'strong'];
const surfaces = ['background', 'raised', 'hover'];

// The colours are the public TagGroupColor type, so a colour added there is covered here.
const types = await readFile(resolve(packageRoot, 'generated/tag-group.d.ts'), 'utf8');
const colours = [...types.match(/export type TagGroupColor = ([^;]+);/u)[1].matchAll(/'(\w+)'/gu)].map(([, name]) => name);

async function loadStyles() {
  const [styles, themes] = await Promise.all(['generated/styles.css', 'generated/themes.css'].map((path) => readFile(resolve(packageRoot, path), 'utf8')));
  return `${styles}\n${themes}`;
}

// One group per variant on each surface, plus a fully selected set on the page background.
function markup() {
  const items = colours.map((color) => ({ id: color, label: color, color }));
  const group = (key, props) => h(TagGroup, { key, 'aria-label': key, items, selectionMode: 'multiple', ...props });
  return renderToString(h('main', null,
    ...surfaces.map((surface) => h('section', { key: surface, 'data-surface': surface, style: { backgroundColor: `var(--muxui-semantic-surface-${surface})` } },
      ...variants.map((variant) => group(`${surface}-${variant}`, { variant })))),
    h('section', { 'data-surface': 'background', style: { backgroundColor: 'var(--muxui-semantic-surface-background)' } },
      ...variants.map((variant) => group(`selected-${variant}`, { variant, defaultSelectedKeys: new Set(colours) })))));
}

// Runs in the page: the WCAG contrast of each tag's text over its painted fill, over the surface it sits on.
function measureContrast({ colours: measured, states }) {
  const parse = (value) => {
    const channels = value.match(/-?[\d.]+/gu)?.map(Number);
    if (!/^(?:rgba?|color\(srgb)/u.test(value) || !channels) throw new Error(`unreadable colour ${value}`);
    const scale = value.startsWith('color(') ? 1 : 255;
    const alpha = channels.length > 3 ? channels[3] : 1;
    return { r: channels[0] / scale, g: channels[1] / scale, b: channels[2] / scale, alpha };
  };
  const over = (top, bottom) => ({
    r: top.r * top.alpha + bottom.r * (1 - top.alpha),
    g: top.g * top.alpha + bottom.g * (1 - top.alpha),
    b: top.b * top.alpha + bottom.b * (1 - top.alpha),
    alpha: 1,
  });
  const linear = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = ({ r, g, b }) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const ratio = (first, second) => {
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };
  const stateAttributes = { rest: [], hover: ['data-hovered'], pressed: ['data-hovered', 'data-pressed'] };
  const results = [];
  for (const tag of document.querySelectorAll('.muxui-tag')) {
    const colour = tag.getAttribute('data-color');
    if (!measured.includes(colour)) continue;
    const surface = tag.closest('[data-surface]');
    const backdrop = parse(getComputedStyle(surface).backgroundColor);
    if (backdrop.alpha !== 1) throw new Error('a surface must be opaque');
    for (const state of states) {
      for (const name of stateAttributes[state]) tag.setAttribute(name, '');
      const style = getComputedStyle(tag);
      // A selected tag's hover and pressed overlay is a gradient of one colour over its fill.
      const overlay = style.backgroundImage.match(/(?:rgba?|color)\([^)]+\)/u)?.[0];
      let fill = over(parse(style.backgroundColor), backdrop);
      if (overlay) fill = over(parse(overlay), fill);
      const text = parse(style.color);
      for (const name of stateAttributes[state]) tag.removeAttribute(name);
      results.push({
        label: `${surface.getAttribute('data-surface')} ${tag.hasAttribute('data-selected') ? 'selected ' : ''}${tag.getAttribute('data-variant')} ${colour} ${state}`,
        ratio: ratio(text, fill),
      });
    }
  }
  return results;
}

test('every TagGroup colour and variant keeps 4.5:1 text contrast on every surface and when selected', { timeout: 120_000 }, async (context) => {
  const css = await loadStyles();
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.setContent(`<!doctype html><html data-muxui-motion="reduced"><head><style>${css}</style></head><body>${markup()}</body></html>`);
    const measurements = [];
    const check = async (scope, measured, states) => {
      const results = await page.evaluate(measureContrast, { colours: measured, states });
      assert.ok(results.length > 0, `${scope} measured no tags`);
      measurements.push(...results.map(({ label, ratio }) => ({ label: `${scope} ${label}`, ratio })));
    };
    const scope = (attributes) => page.evaluate((next) => {
      for (const [name, value] of Object.entries(next)) {
        if (value === null) document.documentElement.removeAttribute(name);
        else document.documentElement.setAttribute(name, value);
      }
    }, attributes);

    for (const mode of ['light', 'dark']) {
      await scope({ 'data-muxui-color-scheme': mode, 'data-muxui-theme': null });
      await check(`default ${mode}`, colours, ['rest', 'hover', 'pressed']);
    }
    // Presets re-tune the brand and neutral ramps, so the surfaces under every colour move: measure them all in each preset.
    for (const { id } of MUXUI_THEME_PRESETS) {
      for (const mode of ['light', 'dark']) {
        await scope({ 'data-muxui-color-scheme': mode, 'data-muxui-theme': id });
        await check(`${id} ${mode}`, colours, ['rest', 'hover', 'pressed']);
      }
    }
    measurements.sort((a, b) => a.ratio - b.ratio);
    context.diagnostic(`${measurements.length} measurements; lowest: ${measurements.slice(0, 5).map(({ label, ratio }) => `${label} ${ratio.toFixed(3)}:1`).join('; ')}`);
    assert.deepEqual(measurements.filter(({ ratio }) => ratio < 4.5).map(({ label, ratio }) => `${label} ${ratio.toFixed(3)}:1`), [], 'text contrast must be at least 4.5:1');
  } finally {
    await browser.close();
  }
});

test('TagGroup tags focus with an offset outline, keep the outline edge off the outline, and stay legible in forced colours', { timeout: 30_000 }, async () => {
  const css = await loadStyles();
  const items = [{ id: 'one', label: 'One', color: 'red' }, { id: 'two', label: 'Two', color: 'red' }];
  const group = (variant) => h(TagGroup, { key: variant, 'aria-label': variant, variant, items, selectionMode: 'multiple', defaultSelectedKeys: new Set(['two']) });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="reduced"><head><style>${css}</style></head><body>${renderToString(h('main', null, ...variants.map(group)))}</body></html>`);
    const tag = (variant, name) => page.locator(`.muxui-tag[data-variant="${variant}"]`, { hasText: name });
    const read = (locator, property) => locator.evaluate((element, name) => getComputedStyle(element)[name], property);
    const probe = (property, value) => page.evaluate(([name, next]) => {
      const element = document.createElement('span');
      element.style[name] = next;
      document.body.append(element);
      const resolved = getComputedStyle(element)[name];
      element.remove();
      return resolved;
    }, [property, value]);

    const outlined = tag('outline', 'One');
    assert.equal(await read(outlined, 'outlineStyle'), 'none', 'an unfocused tag draws no outline');
    assert.match(await read(outlined, 'boxShadow'), /inset/u, 'the outline variant paints its edge as an inset shadow');
    await outlined.evaluate((element) => element.setAttribute('data-focus-visible', ''));
    assert.equal(await read(outlined, 'outlineStyle'), 'solid');
    assert.equal(await read(outlined, 'outlineWidth'), '2px');
    assert.equal(await read(outlined, 'outlineOffset'), '2px');
    assert.equal(await read(outlined, 'outlineColor'), await probe('outlineColor', 'var(--muxui-semantic-focus-ring)'), 'focus uses the focus ring colour');
    assert.match(await read(outlined, 'boxShadow'), /inset/u, 'focus leaves the edge in place');
    const soft = tag('soft', 'One');
    await soft.evaluate((element) => element.setAttribute('data-focus-visible', ''));
    assert.equal(await read(soft, 'boxShadow'), 'none', 'focus adds no two-tone shadow ring');

    await page.emulateMedia({ forcedColors: 'active' });
    const [highlight, highlightText, canvasText, buttonText] = await Promise.all([
      probe('backgroundColor', 'Highlight'), probe('color', 'HighlightText'), probe('backgroundColor', 'CanvasText'), probe('outlineColor', 'ButtonText'),
    ]);
    for (const variant of variants) {
      const selected = tag(variant, 'Two');
      assert.equal(await read(selected, 'backgroundColor'), highlight, `${variant}: a selected tag fills with Highlight`);
      assert.equal(await read(selected, 'color'), highlightText, `${variant}: a selected tag uses HighlightText`);
      assert.notEqual(await read(tag(variant, 'One'), 'backgroundColor'), highlight, `${variant}: an unselected tag stays distinguishable from a selected one`);
    }
    const dot = (name) => tag('dot', name).evaluate((element) => getComputedStyle(element, '::before').backgroundColor);
    assert.equal(await dot('One'), canvasText, 'the dot stays visible against the canvas');
    assert.equal(await dot('Two'), highlightText, 'a selected tag draws its dot in HighlightText');
    assert.equal(await read(tag('outline', 'One'), 'outlineColor'), await probe('outlineColor', 'Highlight'), 'a focused tag uses the forced-colors highlight');
    assert.equal(await read(tag('outline', 'One'), 'outlineOffset'), '2px');
    const edged = tag('outline', 'Two');
    assert.equal(await read(edged, 'outlineStyle'), 'solid', 'the outline variant keeps a visible edge in forced colours');
    assert.equal(await read(edged, 'outlineColor'), buttonText);
  } finally {
    await browser.close();
  }
});

// The fills mix two basis tints, so the visible weights are asserted here rather than read off the stylesheet.
test('TagGroup fills and outline edges use the specified weights in each scheme', { timeout: 30_000 }, async () => {
  const css = await loadStyles();
  const items = [{ id: 'hue', label: 'Hue', color: 'red' }, { id: 'neutral', label: 'Neutral' }];
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html data-muxui-motion="reduced"><head><style>${css}</style></head><body>${renderToString(h('main', null,
      ...variants.map((variant) => h(TagGroup, { key: variant, 'aria-label': variant, variant, items, selectionMode: 'multiple' }))))}</body></html>`);
    // Percent alpha of the fill at rest, hovered, and pressed (hovering adds 6 points, pressing 12), and of the outline edge.
    const hue = { light: { soft: 12, outline: 8, dot: 10, strong: 24, edge: 32 }, dark: { soft: 20, outline: 14, dot: 16, strong: 34, edge: 40 } };
    const neutral = { soft: [8, 12, 16], outline: [8, 12, 16], dot: [8, 12, 16], strong: [12, 16, 20], edge: 20 };
    const measure = () => page.evaluate(() => {
      const alpha = (value) => Number(/\/\s*([\d.]+)\)/u.exec(value)?.[1] ?? 1) * 100;
      const states = { rest: [], hover: ['data-hovered'], pressed: ['data-hovered', 'data-pressed'] };
      const found = {};
      for (const tag of document.querySelectorAll('.muxui-tag')) {
        const key = `${tag.dataset.color} ${tag.dataset.variant}`;
        found[key] = {};
        for (const [state, attributes] of Object.entries(states)) {
          for (const name of attributes) tag.setAttribute(name, '');
          found[key][state] = alpha(getComputedStyle(tag).backgroundColor);
          for (const name of attributes) tag.removeAttribute(name);
        }
        const edge = getComputedStyle(tag).boxShadow;
        found[key].edge = edge === 'none' ? null : alpha(edge);
      }
      return found;
    });
    const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.05, `${message}: ${actual} !== ${expected}`);
    for (const scheme of ['light', 'dark']) {
      await page.evaluate((next) => document.documentElement.setAttribute('data-muxui-color-scheme', next), scheme);
      const found = await measure();
      for (const variant of variants) {
        const base = hue[scheme][variant];
        const painted = found[`red ${variant}`];
        close(painted.rest, base, `${scheme} red ${variant} rest`);
        close(painted.hover, base + 6, `${scheme} red ${variant} hover`);
        // Strong pressed adds 11 in dark so its label keeps 4.5:1 on the lightest hues.
        close(painted.pressed, base + (variant === 'strong' && scheme === 'dark' ? 11 : 12), `${scheme} red ${variant} pressed`);
        if (variant === 'outline') close(painted.edge, hue[scheme].edge, `${scheme} red outline edge`);
        else assert.equal(painted.edge, null, `${scheme} red ${variant} has no edge`);
        const grey = found[`neutral ${variant}`];
        neutral[variant].forEach((expected, index) => close(grey[['rest', 'hover', 'pressed'][index]], expected, `${scheme} neutral ${variant} ${['rest', 'hover', 'pressed'][index]}`));
        if (variant === 'outline') close(grey.edge, neutral.edge, `${scheme} neutral outline edge`);
      }
    }
  } finally {
    await browser.close();
  }
});

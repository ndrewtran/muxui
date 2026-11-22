import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import * as M from '../../generated/index.mjs';
import { contrastRatio } from '../support/contrast.mjs';
import { browserEngines, launchBrowser, packageRoot } from './harness.mjs';

// Enabled placeholder text is text: it reaches 4.5:1 against the field surface it is drawn on, in both schemes of the default theme
// (WCAG 1.4.3). Disabled fields are exempt and not rendered. Server markup only: an empty field shows its placeholder before
// hydration, a date or time field its placeholder segments, and a Select or MultiSelect its placeholder value.
const h = React.createElement;
const items = ['Melbourne', 'Sydney'];
const options = [{ id: 'react', label: 'React' }, { id: 'css', label: 'CSS' }];
const families = {
  'text-field': h(M.TextField, { label: 'Name', placeholder: 'Ada Lovelace' }),
  'text-area': h(M.TextArea.Root, null, h(M.TextArea.Label, null, 'Notes'), h(M.TextArea.TextArea, { rows: 3, placeholder: 'Write a note' })),
  input: h(M.Input.Root, null, h(M.Input.Label, null, 'Name'), h(M.Input.Input, { placeholder: 'Ada Lovelace' })),
  'payment-input': h(M.PaymentInput.Root, null, h(M.PaymentInput.Label, null, 'Card number'), h(M.PaymentInput.Group, null, h(M.PaymentInput.Input, { placeholder: '1234 1234 1234 1234' }))),
  'search-field': h(M.SearchField, { label: 'Search', placeholder: 'Search files' }),
  'number-field': h(M.NumberField, { label: 'Quantity', placeholder: 'Any amount' }),
  'color-field': h(M.ColorField, { label: 'Colour', placeholder: '#000000' }),
  'combo-box': h(M.ComboBox, { label: 'City', items, placeholder: 'Choose a city' }),
  autocomplete: h(M.Autocomplete, { label: 'City', items, placeholder: 'Find a city' }),
  select: h(M.Select, { label: 'City', items, placeholder: 'Choose a city' }),
  'multi-select': h(M.MultiSelect.Root, { label: 'Technologies', items: options, placeholder: 'Choose' }, (item) => h(M.MultiSelect.Item, { id: item.id, textValue: item.label }, item.label)),
  'tag-select': h(M.TagSelect.Root, { label: 'Tags', items: options, placeholder: 'Add a tag' }, (item) => item.label),
  'token-field': h(M.TokenField, { label: 'Tags', placeholder: 'Add a tag' }),
  'input-tags': h(M.InputTags.Root, { label: 'Technologies', placeholder: 'Add a tag' }),
  'date-field': h(M.DateField, { label: 'Birthday' }),
  'time-field': h(M.TimeField, { label: 'Start time' }),
  'date-picker': h(M.DatePicker, { label: 'Due date' }),
  'date-range-picker': h(M.DateRangePicker, { label: 'Stay' }),
  sidebar: h('div', { style: { width: '16rem' } }, h(M.Sidebar.Root, { 'aria-label': 'Workspace' }, h(M.Sidebar.Header, null, h(M.Sidebar.Search)))),
};

const stylesheet = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
const body = Object.entries(families).map(([family, element]) => `<div data-family="${family}" style="padding:8px">${renderToString(element)}</div>`).join('');
const documentFor = (scheme) => `<!doctype html><html data-muxui-color-scheme="${scheme}"><head><meta charset="utf-8"><style>${stylesheet}</style></head>`
  + `<body style="margin:0;background:var(--muxui-semantic-surface-canvas)">${body}</body></html>`;

/**
 * Runs in the page: each placeholder's colour and the surface below it, both composited through a canvas so every engine resolves
 * colour functions the same way. The surface is every background from the root down to the field, over white; the placeholder adds
 * its colour at its own opacity. A native placeholder is read from `::placeholder`, a placeholder value, segment or token-field prompt from itself.
 */
function placeholders() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const paint = (layers) => {
    context.clearRect(0, 0, 1, 1);
    context.globalAlpha = 1;
    context.fillStyle = 'white';
    context.fillRect(0, 0, 1, 1);
    for (const { color, opacity = 1 } of layers) {
      context.globalAlpha = opacity;
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  };
  const surfaces = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) layers.unshift({ color: getComputedStyle(node).backgroundColor });
    return layers;
  };
  const rows = [];
  const add = (element, style, own) => {
    const ground = surfaces(element);
    rows.push({
      family: element.closest('[data-family]').dataset.family,
      part: [...element.classList].find((name) => name.startsWith('muxui-')) ?? element.localName,
      own,
      color: style.color,
      text: paint([...ground, { color: style.color, opacity: Number(style.opacity) }]),
      ground: paint(ground),
    });
  };
  for (const element of document.querySelectorAll('input[placeholder]:placeholder-shown, textarea[placeholder]:placeholder-shown')) {
    if (element.getClientRects().length === 0) continue;
    add(element, getComputedStyle(element, '::placeholder'), getComputedStyle(element).color);
  }
  for (const element of document.querySelectorAll('[data-muxui-state-placeholder]:not([data-muxui-state-type="literal"]), .muxui-multi-select__value--placeholder, .muxui-token-field__placeholder')) {
    if (element.getClientRects().length === 0 || element.querySelector('[data-muxui-state-placeholder]') || element.textContent.trim() === '') continue;
    add(element, getComputedStyle(element), null);
  }
  return rows;
}

for (const engine of browserEngines()) {
  test(`Enabled placeholder text reaches 4.5:1 on its field surface in both schemes in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage();
      const shortfalls = [];
      for (const scheme of ['light', 'dark']) {
        await tab.setContent(documentFor(scheme));
        const rows = await tab.evaluate(placeholders);
        assert.deepEqual(Object.keys(families).filter((family) => !rows.some((row) => row.family === family)), [], `${scheme}: every family shows a placeholder`);
        // A native placeholder read back as the field's own colour would mean the engine ignored the pseudo-element.
        assert.deepEqual(rows.filter((row) => row.own !== null && row.own === row.color).map((row) => row.family), [], `${scheme}: placeholder colours are read from ::placeholder`);
        for (const { family, part, text, ground } of rows) {
          const ratio = contrastRatio(text, ground);
          if (ratio < 4.5) shortfalls.push(`${scheme} ${family} ${part}: ${ratio.toFixed(2)}`);
        }
      }
      assert.deepEqual([...new Set(shortfalls)], []);
    } finally {
      await browser.close();
    }
  });
}

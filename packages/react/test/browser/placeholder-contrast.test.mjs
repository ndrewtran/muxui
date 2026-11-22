import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import * as M from '../../generated/index.mjs';
import { contrastRatio } from '../support/contrast.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, packageRoot, pageShell, startServer } from './harness.mjs';

// Enabled placeholder text is text: it reaches 4.5:1 against the field surface it is drawn on, in both schemes of the default theme
// (WCAG 1.4.3). Disabled fields are exempt and not rendered. The fields are server markup: an empty field shows its placeholder
// before hydration, a date or time field its placeholder segments, and a Select or MultiSelect its placeholder value. The parts
// that exist only on the client (a CommandPalette's search row, a TextEditor's document and selection bar, a MultiSelect's
// search) are rendered on a page of their own.
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
  // PromptComposer keeps a placeholder colour of its own; only its ratio is held here.
  'prompt-composer': h(M.PromptComposer, { inputProps: { placeholder: 'Ask anything' } }),
};

// Disabled placeholders are exempt from the contrast rule and keep the colour they had before it: the role each family drew a
// disabled placeholder in, per scheme. The disabled treatment's opacity is declared elsewhere and comes on top of that colour.
const disabledFamilies = {
  'text-field': h(M.TextField, { label: 'Name', placeholder: 'Ada Lovelace', disabled: true }),
  'text-area': h(M.TextArea.Root, { disabled: true }, h(M.TextArea.Label, null, 'Notes'), h(M.TextArea.TextArea, { rows: 3, placeholder: 'Write a note' })),
  input: h(M.Input.Root, { disabled: true }, h(M.Input.Label, null, 'Name'), h(M.Input.Input, { placeholder: 'Ada Lovelace' })),
  'payment-input': h(M.PaymentInput.Root, { disabled: true }, h(M.PaymentInput.Label, null, 'Card number'), h(M.PaymentInput.Group, null, h(M.PaymentInput.Input, { placeholder: '1234 1234 1234 1234' }))),
  'search-field': h(M.SearchField, { label: 'Search', placeholder: 'Search files', disabled: true }),
  'number-field': h(M.NumberField, { label: 'Quantity', placeholder: 'Any amount', disabled: true }),
  'color-field': h(M.ColorField, { label: 'Colour', placeholder: '#000000', disabled: true }),
  'combo-box': h(M.ComboBox, { label: 'City', items, placeholder: 'Choose a city', disabled: true }),
  autocomplete: h(M.Autocomplete, { label: 'City', items, placeholder: 'Find a city', disabled: true }),
  select: h(M.Select, { label: 'City', items, placeholder: 'Choose a city', disabled: true }),
  'multi-select': h(M.MultiSelect.Root, { label: 'Technologies', items: options, placeholder: 'Choose', disabled: true }, (item) => h(M.MultiSelect.Item, { id: item.id, textValue: item.label }, item.label)),
  'tag-select': h(M.TagSelect.Root, { label: 'Tags', items: options, placeholder: 'Add a tag', disabled: true }, (item) => item.label),
  'input-tags': h(M.InputTags.Root, { label: 'Technologies', placeholder: 'Add a tag', disabled: true }),
  'date-field': h(M.DateField, { label: 'Birthday', disabled: true }),
  'time-field': h(M.TimeField, { label: 'Start time', disabled: true }),
  'date-picker': h(M.DatePicker, { label: 'Due date', disabled: true }),
  'date-range-picker': h(M.DateRangePicker, { label: 'Stay', disabled: true }),
};
const neutral50 = '--muxui-semantic-color-neutral-50';
const fixed60 = '--muxui-semantic-color-neutral-default-60';
const disabledRoles = {
  'number-field': { light: '--muxui-semantic-content-muted', dark: fixed60 },
  'color-field': { light: fixed60, dark: fixed60 },
  'multi-select': { light: '--muxui-semantic-color-neutral-60', dark: '--muxui-semantic-color-neutral-60' },
  ...Object.fromEntries(['date-field', 'time-field', 'date-picker', 'date-range-picker'].map((family) => [family, { light: fixed60, dark: fixed60 }])),
};
const disabledRole = (family, scheme) => disabledRoles[family]?.[scheme] ?? neutral50;

const [stylesheet, themes] = await Promise.all(['styles', 'themes'].map((name) => readFile(resolve(packageRoot, `generated/${name}.css`), 'utf8')));
const disabledBody = Object.entries(disabledFamilies).map(([family, element]) => `<div data-family="${family}" style="padding:8px">${renderToString(element)}</div>`).join('');
const disabledDocument = (scheme) => `<!doctype html><html data-muxui-color-scheme="${scheme}"><head><meta charset="utf-8"><style>${stylesheet}</style></head>`
  + `<body style="margin:0;background:var(--muxui-semantic-surface-canvas)">${disabledBody}</body></html>`;
const body = Object.entries(families).map(([family, element]) => `<div data-family="${family}" style="padding:8px">${renderToString(element)}</div>`).join('');
const documentFor = (scheme) => `<!doctype html><html data-muxui-color-scheme="${scheme}"><head><meta charset="utf-8"><style>${stylesheet}</style></head>`
  + `<body style="margin:0;background:var(--muxui-semantic-surface-canvas)">${body}</body></html>`;

/**
 * Runs in the page: each placeholder's colour and the surface below it, both composited through a canvas so every engine resolves
 * colour functions the same way. The surface is every background from the root down to the field, over white; the placeholder adds
 * its colour at its own opacity. A native placeholder is read from `::placeholder`, a placeholder value, segment or token-field prompt from itself.
 */
function placeholders({ values = false } = {}) {
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
      // A portaled popup is outside every [data-family] wrapper; its page names the family on the body.
      family: (element.closest('[data-family]') ?? document.body).dataset.family,
      part: [...element.classList].find((name) => name.startsWith('muxui-')) ?? element.localName,
      own,
      kind: own === undefined ? 'value' : 'placeholder',
      color: style.color,
      text: paint([...ground, { color: style.color, opacity: Number(style.opacity) }]),
      // The colour itself, and the field placeholder role where the element sits, to tell whether it follows the role.
      painted: paint([{ color: style.color }]),
      role: paint([{ color: getComputedStyle(element).getPropertyValue('--muxui-semantic-field-placeholder') }]),
      ground: paint(ground),
    });
  };
  for (const element of document.querySelectorAll('input[placeholder]:placeholder-shown, textarea[placeholder]:placeholder-shown')) {
    if (element.getClientRects().length === 0) continue;
    add(element, getComputedStyle(element, '::placeholder'), getComputedStyle(element).color);
  }
  // The typed value of a field, read the same way, where `values` asks for it.
  for (const element of document.querySelectorAll('.ProseMirror p.is-editor-empty:first-child')) add(element, getComputedStyle(element, '::before'), null);
  if (values) for (const element of document.querySelectorAll('input:not(:placeholder-shown)')) add(element, getComputedStyle(element), undefined);
  for (const element of document.querySelectorAll('[data-muxui-state-placeholder]:not([data-muxui-state-type="literal"]), .muxui-multi-select__value--placeholder, .muxui-token-field__placeholder')) {
    if (element.getClientRects().length === 0 || element.querySelector('[data-muxui-state-placeholder]') || element.textContent.trim() === '') continue;
    add(element, getComputedStyle(element), null);
  }
  return rows;
}

// Every shipped theme preset, read from the generated theme stylesheet.
const presets = [...new Set([...themes.matchAll(/\[data-muxui-theme='([a-z-]+)'\]/gu)].map(([, id]) => id))];
// The families whose placeholder is the field placeholder role; PromptComposer and TokenField keep colours of their own.
const ownColours = new Set(['prompt-composer', 'token-field']);
// Each preset four ways, scheme and contrast named on its scope, and once more nested under a dark page without a scheme of
// its own, where it is light: a variable resolved on the page and not on the preset's scope would keep the page's value.
const presetScopes = presets.flatMap((preset) => [
  ...['light', 'dark'].flatMap((scheme) => ['standard', 'more'].map((contrast) => ({
    name: `${preset} ${scheme} ${contrast}`,
    attributes: `data-muxui-theme="${preset}" data-muxui-color-scheme="${scheme}"${contrast === 'more' ? ' data-muxui-contrast="more"' : ''}`,
  }))),
  { name: `${preset} nested under dark`, attributes: `data-muxui-theme="${preset}"`, nested: true },
]);
const presetDocument = () => `<!doctype html><html data-muxui-color-scheme="dark"><head><meta charset="utf-8"><style>${stylesheet}</style><style>${themes}</style></head>`
  + '<body style="margin:0;background:var(--muxui-semantic-surface-canvas)">'
  + presetScopes.map(({ name, attributes }) => `<section ${attributes} style="background:var(--muxui-semantic-surface-canvas)">`
    + Object.entries(families).map(([family, element]) => `<div data-family="${name}|${family}" style="padding:8px">${renderToString(element)}</div>`).join('')
    + '</section>').join('')
  + '</body></html>';

/** The rows of `rows` below 4.5:1, labelled for the failure list. */
const below = (rows, label) => rows.flatMap(({ family, part, kind, text, ground }) => {
  const ratio = contrastRatio(text, ground);
  return ratio < 4.5 ? [`${label} ${family} ${part}${kind === 'value' ? ' value' : ''}: ${ratio.toFixed(2)}`] : [];
});

// The client-rendered parts. A translucent CommandPalette shows the page through its search row, so it is measured over the
// darkest and the lightest page a backdrop can show (a blur of one colour is that colour) as well as over the canvas.
const clientCases = [
  { family: 'command-palette', ready: '.muxui-command-palette__input', value: 'Open settings' },
  { family: 'command-palette-translucent', backdrops: ['canvas', 'black', 'white'], ready: '.muxui-command-palette__input', value: 'Open settings' },
  { family: 'text-editor', ready: '.ProseMirror p.is-editor-empty' },
  { family: 'text-editor-selection', loaded: '.ProseMirror p', ready: '.muxui-text-editor__selection-input' },
  { family: 'multi-select-search', open: '.muxui-multi-select__trigger', ready: '.muxui-multi-select__search-input' },
];
const clientEntries = ['src/supplemental/command-palette.ts', 'src/text-editor/index.ts', 'src/supplemental/multi-select.ts'];
const clientEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CommandPalette } from '/src/supplemental/command-palette.ts';
import { MultiSelect } from '/src/supplemental/multi-select.ts';
import { TextEditor } from '/src/text-editor/index.ts';

const h = React.createElement;
const family = new URLSearchParams(location.search).get('family');
document.body.dataset.family = family;
const palette = (translucent) => h(CommandPalette.Root, { defaultOpen: true },
  h(CommandPalette.Trigger, null, 'Commands'),
  h(CommandPalette.Backdrop, null, h(CommandPalette.Popup, { translucent, 'aria-label': 'Commands' },
    h(CommandPalette.Content, null,
      h(CommandPalette.SearchField, null, h(CommandPalette.Input, { 'aria-label': 'Search commands', placeholder: 'Search commands' })),
      h(CommandPalette.ListBox, null, h(CommandPalette.Item, { id: 'settings', title: 'Open settings', textValue: 'Open settings' }))))));
const text = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A sentence to select.' }] }] };
const parts = {
  'command-palette': () => palette(false),
  'command-palette-translucent': () => palette(true),
  'text-editor': () => h(TextEditor, { label: 'Note', placeholder: 'Write a note', toolbar: false }),
  'text-editor-selection': () => h(TextEditor, { label: 'Draft', defaultValue: text, toolbar: false, selectionActions: [{ id: 'explain', label: 'Explain' }], onSelectionRequest: () => {} }),
  'multi-select-search': () => h(MultiSelect.Root, { label: 'Technologies', items: [{ id: 'react', label: 'React' }] }, (item) => h(MultiSelect.Item, { id: item.id, textValue: item.label }, item.label)),
};
createRoot(document.getElementById('root')).render(parts[family]());
`;
const backdrops = { canvas: 'var(--muxui-semantic-surface-canvas)', black: '#000', white: '#fff' };
const clientPage = (url) => pageShell({
  attributes: `lang="en" data-muxui-color-scheme="${url.searchParams.get('scheme')}"`,
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: `style="margin:24px;background:${backdrops[url.searchParams.get('backdrop')]}"`,
  body: '<div id="root"></div>',
  entry: '/placeholders-entry.mjs',
});

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
        shortfalls.push(...below(rows, scheme));
      }
      assert.deepEqual([...new Set(shortfalls)], []);
    } finally {
      await browser.close();
    }
  });

  test(`Disabled placeholders keep the colour each family drew them in before in both schemes in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage();
      const changed = [];
      for (const scheme of ['light', 'dark']) {
        await tab.setContent(disabledDocument(scheme));
        const rows = await tab.evaluate(placeholders);
        assert.deepEqual(Object.keys(disabledFamilies).filter((family) => !rows.some((row) => row.family === family)), [], `${scheme}: every disabled family shows a placeholder`);
        const expected = await tab.evaluate((names) => {
          const probe = document.createElement('div');
          document.body.append(probe);
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          return Object.fromEntries(names.map((name) => {
            probe.style.color = `var(${name})`;
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = getComputedStyle(probe).color;
            context.fillRect(0, 0, 1, 1);
            const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
            return [name, { r, g, b }];
          }));
        }, [...new Set(Object.keys(disabledFamilies).map((family) => disabledRole(family, scheme)))]);
        for (const { family, part, painted } of rows) {
          const want = expected[disabledRole(family, scheme)];
          if (painted.r !== want.r || painted.g !== want.g || painted.b !== want.b) changed.push(`${scheme} ${family} ${part}: ${JSON.stringify(painted)}, was ${JSON.stringify(want)}`);
        }
      }
      assert.deepEqual([...new Set(changed)], []);
    } finally {
      await browser.close();
    }
  });

  test(`Placeholders follow every theme preset's role and reach 4.5:1 in each scheme and contrast in ${engine}`, { timeout: 180_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage();
      await tab.setContent(presetDocument());
      const rows = (await tab.evaluate(placeholders)).map((row) => {
        const [scope, family] = row.family.split('|');
        return { ...row, scope, family };
      });
      assert.equal(presets.length, 15, 'the shipped presets are found');
      assert.deepEqual(presetScopes.filter(({ name }) => !rows.some((row) => row.scope === name)).map(({ name }) => name), [], 'every scope shows placeholders');
      const same = (left, right) => left.r === right.r && left.g === right.g && left.b === right.b;
      const strays = rows.filter((row) => !ownColours.has(row.family) && !same(row.painted, row.role)).map((row) => `${row.scope} ${row.family} ${row.part}`);
      assert.deepEqual([...new Set(strays)], [], 'each placeholder takes the field placeholder role of its scope');
      assert.deepEqual([...new Set(rows.flatMap((row) => below([row], row.scope)))], []);
    } finally {
      await browser.close();
    }
  });

  test(`The placeholders of client-rendered parts reach 4.5:1 on their surface in both schemes in ${engine}`, { timeout: 180_000 }, async () => {
    const { url, close } = await startServer({ entries: clientEntries, pages: { '/placeholders.html': clientPage }, modules: { '/placeholders-entry.mjs': clientEntry } });
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 900, height: 700 } });
      const shortfalls = [];
      const seen = [];
      for (const scheme of ['light', 'dark']) {
        for (const { family, backdrops = ['canvas'], loaded, open, ready, value } of clientCases) {
          for (const backdrop of backdrops) {
            await tab.goto(`${url}/placeholders.html?family=${family}&scheme=${scheme}&backdrop=${backdrop}`, { waitUntil: 'load' });
            await tab.locator(loaded ?? open ?? ready).first().waitFor();
            if (open) await tab.locator(open).first().click();
            if (family === 'text-editor-selection') {
              // A double click on a word shows the selection bar and its instruction field. Focus first and wait out
              // ProseMirror's 20 ms selection re-sync, which could otherwise overwrite the pointer selection.
              await tab.locator('.ProseMirror').focus();
              await tab.evaluate(() => new Promise((resolve) => setTimeout(resolve, 20)));
              const word = await tab.evaluate(() => {
                const range = document.createRange();
                const node = document.querySelector('.ProseMirror p').firstChild;
                range.setStart(node, 2);
                range.setEnd(node, 10);
                const { left, top, width, height } = range.getBoundingClientRect();
                return { x: left + width / 2, y: top + height / 2 };
              });
              await tab.mouse.dblclick(word.x, word.y);
            }
            await tab.locator(ready).first().waitFor();
            await awaitFontsAndFrames(tab);
            const label = `${scheme} over ${backdrop}`;
            const rows = await tab.evaluate(placeholders);
            assert.ok(rows.length > 0, `${label}: ${family} shows a placeholder`);
            seen.push(family);
            shortfalls.push(...below(rows, label));
            if (value) {
              // The typed value in the same row, over the same backdrop, stays readable too.
              await tab.locator(ready).first().fill(value);
              const typed = (await tab.evaluate(placeholders, { values: true })).filter((row) => row.kind === 'value');
              assert.ok(typed.length > 0, `${label}: ${family} shows its value`);
              shortfalls.push(...below(typed, `${label} value`));
            }
          }
        }
      }
      assert.deepEqual(clientCases.map(({ family }) => family).filter((family) => !seen.includes(family)), []);
      assert.deepEqual([...new Set(shortfalls)], []);
    } finally {
      await browser.close();
      await close();
    }
  });
}

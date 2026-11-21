import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, launchBrowser, pageShell, startServer } from './harness.mjs';

// Each case renders one field, the selection cases inside a form. onSelect and submit events are logged to
// window.events so the test can assert what the browser actually reported.
// The page cannot scroll, because a scroll closes the open list and commits the field.
// The submit button sits above the field so the open list never covers it.
const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { ComboBox } from '/src/collections.mjs';
  import '/generated/styles.css';
  const h = React.createElement;
  window.events = [];
  const log = (...event) => window.events.push(event);
  const cities = [{ id: 'mel', label: 'Melbourne' }, { id: 'syd', label: 'Sydney' }];
  const towns = [{ id: 'mel', label: 'Melbourne' }, { id: 'syd', label: 'Sydney', disabled: true }, { id: 'per', label: 'Perth' }];
  const submit = (event) => {
    event.preventDefault();
    log('submit', new FormData(event.currentTarget).getAll('city'));
  };
  const cases = {
    uncontrolled: () => h('form', { onSubmit: submit },
      h('button', { type: 'submit' }, 'Submit'),
      h(ComboBox, { label: 'City', name: 'city', items: cities, onSelect: (item) => log('select', item?.id ?? 'none') })),
    controlled: function Controlled() {
      const [text, setText] = React.useState('');
      const [selectedId, setSelectedId] = React.useState(null);
      return h('form', { onSubmit: submit },
        h('button', { type: 'submit' }, 'Submit'),
        h(ComboBox, {
          label: 'City', name: 'city', items: cities, value: text, onChange: setText, selectedId,
          onSelect: (item) => {
            log('select', item?.id ?? 'none');
            setSelectedId(item?.id ?? null);
            setText(item === undefined ? '' : item.label);
          },
        }),
        h('button', { type: 'button', id: 'app-clear', onClick: () => { setText(''); setSelectedId(null); } }, 'Clear'),
        h('output', null, 'selected ' + (selectedId ?? 'none')));
    },
    // A field far wider than its options, so a list sized by its options alone shows as narrower than the field.
    list: () => h('div', { style: { width: '600px', padding: '24px' } }, h(ComboBox, { label: 'Town', items: towns })),
  };
  const name = new URLSearchParams(location.search).get('case');
  createRoot(document.getElementById('root')).render(h(cases[name]));
  document.documentElement.dataset.ready = name;`;

let server;
let browser;
before(async () => {
  server = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/combo-box.html': pageShell({ head: '<style>html, body { margin: 0; overflow: hidden; }</style>', body: '<div id="root"></div>', entry: '/combo-box-entry.mjs' }) },
    modules: { '/combo-box-entry.mjs': entry },
  });
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

test('real browser ComboBox reports a cleared selection and submits an empty value', { timeout: 90_000 }, async () => {
  const { url } = server;
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  try {
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
    const input = page.getByRole('combobox', { name: 'City' });
    const events = () => page.evaluate(() => window.events);
    // React Aria reports a cleared selection from an effect, so wait for the logged events.
    const untilEvents = (count) => page.waitForFunction((expected) => window.events.length >= expected, count);
    const submit = async () => {
      await page.locator('button[type="submit"]').click();
      return (await events()).findLast(([type]) => type === 'submit')[1];
    };
    // Typing the start of a name filters the options; choosing one selects it.
    const choose = async () => {
      await input.pressSequentially('Syd');
      await page.locator('.muxui-combo-box__option', { hasText: 'Sydney' }).click();
      await page.waitForFunction(() => document.querySelector('input[role="combobox"]').value === 'Sydney');
    };

    for (const mode of ['uncontrolled', 'controlled']) {
      await page.goto(`${url}/combo-box.html?case=${mode}`, { waitUntil: 'load' });
      await page.waitForFunction((expected) => document.documentElement.dataset.ready === expected, mode);
      await awaitFontsAndFrames(page);

      await choose();
      await untilEvents(1);
      assert.deepEqual(await submit(), ['syd'], `${mode}: the form submits the selected id`);

      // Clear by typing: delete the text one character at a time.
      await input.focus();
      await input.press('End');
      for (let index = 0; index < 'Sydney'.length; index += 1) await input.press('Backspace');
      assert.equal(await input.inputValue(), '', mode);
      await untilEvents(3);
      assert.deepEqual(await events(), [['select', 'syd'], ['submit', ['syd']], ['select', 'none']], `${mode}: typing the text away reports no item once`);
      assert.deepEqual(await submit(), [''], `${mode}: the form submits an empty value`);

      // Clear by an action: empty the input in one step.
      await choose();
      await input.clear();
      assert.equal(await input.inputValue(), '', mode);
      await untilEvents(6);
      assert.deepEqual((await events()).filter(([type]) => type === 'select'), [['select', 'syd'], ['select', 'none'], ['select', 'syd'], ['select', 'none']], mode);
      assert.deepEqual(await submit(), [''], mode);
      // Open the list: nothing is selected.
      await page.locator('.muxui-combo-box__trigger').click();
      assert.equal(await page.locator('.muxui-combo-box__option[aria-selected="true"]').count(), 0, mode);
      await page.keyboard.press('Escape');
    }

    // A controlled field also follows the application clearing its own state.
    await choose();
    await page.getByText('selected syd').waitFor();
    const eventCount = (await events()).length;
    await page.locator('#app-clear').click();
    await page.getByText('selected none').waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal((await events()).length, eventCount, 'the application clearing its state is not reported back');
    assert.deepEqual(await submit(), ['']);
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('real browser ComboBox opens its list at the field\'s width and draws each option by its real state', { timeout: 90_000 }, async () => {
  const { url } = server;
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  try {
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
    const input = page.getByRole('combobox', { name: 'Town' });
    const popover = page.locator('.muxui-combo-box__popover');
    const unfilled = 'rgba(0, 0, 0, 0)';
    // Each option's fill and opacity, beside whether React Aria has it focused.
    const options = () => page.locator('.muxui-combo-box__option').evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      return { label: node.textContent, focused: node.hasAttribute('data-muxui-state-focused'), fill: style.backgroundColor, opacity: Number(style.opacity) };
    }));
    // Opens the list from its button: it starts at the field's start edge and, its options being short, is as wide as the field.
    const openFlush = async (label) => {
      await page.locator('.muxui-combo-box__trigger').click();
      await popover.waitFor();
      const [field, list] = await Promise.all([page.locator('.muxui-combo-box__control').boundingBox(), popover.boundingBox()]);
      assert.ok(Math.abs(list.x - field.x) < 0.5, `${label}: the list starts ${list.x - field.x}px from the field's start`);
      assert.ok(Math.abs(list.width - field.width) < 0.5, `${label}: a ${list.width}px list under a ${field.width}px field`);
    };
    // Reduced motion settles the popover and the option fills at once, so they are read at rest.
    const open = async (name, scheme) => {
      await page.goto(`${url}/combo-box.html?case=${name}`, { waitUntil: 'load' });
      await page.waitForFunction((expected) => document.documentElement.dataset.ready === expected, name);
      await awaitFontsAndFrames(page);
      await page.evaluate((value) => { Object.assign(document.documentElement.dataset, { muxuiColorScheme: value, muxuiMotion: 'reduced' }); }, scheme);
    };

    for (const scheme of ['light', 'dark']) {
      await open('list', scheme);
      await openFlush(scheme);
      // No option is focused yet, so none is filled, and the disabled option is dimmed rather than filled.
      let drawn = await options();
      assert.deepEqual(drawn.map(({ label, focused, fill }) => [label, focused, fill]), [['Melbourne', false, unfilled], ['Sydney', false, unfilled], ['Perth', false, unfilled]], scheme);
      assert.deepEqual(drawn.map(({ opacity }) => opacity < 1), [false, true, false], `${scheme}: only the disabled option is dimmed`);
      await page.keyboard.press('Escape');
      await popover.waitFor({ state: 'detached' });

      // Typing opens the list with no option focused, so no option is drawn highlighted...
      await input.pressSequentially('e');
      await popover.waitFor();
      assert.equal(await input.getAttribute('aria-activedescendant'), null, `${scheme}: typing focuses no option`);
      assert.deepEqual((await options()).map(({ fill }) => fill), [unfilled, unfilled, unfilled], `${scheme}: typing highlights no option`);
      // ...until ArrowDown focuses the first option, which then carries the highlight alone.
      await input.press('ArrowDown');
      await page.locator('.muxui-combo-box__option[data-muxui-state-focused]').waitFor();
      drawn = await options();
      assert.deepEqual(drawn.map(({ focused }) => focused), [true, false, false], scheme);
      assert.notEqual(drawn[0].fill, unfilled, `${scheme}: the focused option is highlighted`);
      assert.deepEqual(drawn.slice(1).map(({ fill }) => fill), [unfilled, unfilled], scheme);
    }

    // A field that spans the page keeps its list flush with it too, and the list does not widen the page, whose scroll would close it.
    await open('uncontrolled', 'light');
    await openFlush('edge to edge');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the list does not widen the page');

    // Forced colours paint every option in system colours, so the disabled option keeps full opacity there, as before.
    await page.emulateMedia({ forcedColors: 'active' });
    await open('list', 'light');
    await openFlush('forced colours');
    assert.deepEqual((await options()).map(({ opacity }) => opacity), [1, 1, 1], 'forced colours: no option is dimmed');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

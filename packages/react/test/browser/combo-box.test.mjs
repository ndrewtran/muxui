import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

// Each case renders one form. onSelect and submit events are logged to
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
  };
  const name = new URLSearchParams(location.search).get('case');
  createRoot(document.getElementById('root')).render(h(cases[name]));
  document.documentElement.dataset.ready = name;`;

test('real browser ComboBox reports a cleared selection and submits an empty value', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/combo-box-clear.html': pageShell({ head: '<style>html, body { margin: 0; overflow: hidden; }</style>', body: '<div id="root"></div>', entry: '/combo-box-clear-entry.mjs' }) },
    modules: { '/combo-box-clear-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
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
      await page.locator('.muxui-combo-box-option', { hasText: 'Sydney' }).click();
      await page.waitForFunction(() => document.querySelector('input[role="combobox"]').value === 'Sydney');
    };

    for (const mode of ['uncontrolled', 'controlled']) {
      await page.goto(`${url}/combo-box-clear.html?case=${mode}`, { waitUntil: 'networkidle' });
      await page.waitForFunction((expected) => document.documentElement.dataset.ready === expected, mode);

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
      await page.locator('.muxui-combo-box-trigger').click();
      assert.equal(await page.locator('.muxui-combo-box-option[aria-selected="true"]').count(), 0, mode);
      await page.keyboard.press('Escape');
    }

    // A controlled field also follows the application clearing its own state.
    await choose();
    await page.getByText('selected syd').waitFor();
    const before = (await events()).length;
    await page.locator('#app-clear').click();
    await page.getByText('selected none').waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal((await events()).length, before, 'the application clearing its state is not reported back');
    assert.deepEqual(await submit(), ['']);
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});

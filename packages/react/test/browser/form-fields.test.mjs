import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

// Each case renders one Form; submit, change, and select events are logged to
// window.events so tests can assert what the browser actually submitted.
const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { Checkbox } from '/src/components.mjs';
  import { Autocomplete, CheckboxGroup, Form } from '/src/fields.mjs';
  import '/generated/styles.css';
  const h = React.createElement;
  window.events = [];
  const log = (...event) => window.events.push(event);
  const submit = (event) => {
    event.preventDefault();
    log('submit', Object.fromEntries([...new FormData(event.currentTarget)].map(([key]) => [key, new FormData(event.currentTarget).getAll(key).join(',')])));
  };
  const cases = {
    'checkbox-group': () => h(Form, { onSubmit: submit },
      h(CheckboxGroup, { label: 'Alerts', name: 'alerts', required: true },
        h(Checkbox, { value: 'email' }, 'Email'),
        h(Checkbox, { value: 'sms' }, 'SMS')),
      h('button', { type: 'submit' }, 'Submit')),
    autocomplete: () => h(Form, { onSubmit: submit },
      h(Autocomplete, { label: 'City', name: 'city', items: ['Melbourne', 'Sydney'], onChange: (value) => log('change', value), onSelect: (item) => log('select', item?.value) }),
      h('button', { type: 'submit' }, 'Submit')),
  };
  const name = new URLSearchParams(location.search).get('case');
  createRoot(document.getElementById('root')).render(h(cases[name]));
  document.documentElement.dataset.ready = name;`;

async function withPage(run) {
  const html = pageShell({ body: '<div id="root"></div>', entry: '/form-fields-entry.mjs' });
  const { url, close } = await startServer({
    entries: ['src/components.mjs', 'src/fields.mjs'],
    pages: { '/form-fields.html': html },
    modules: { '/form-fields-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
    const open = async (name) => {
      await page.goto(`${url}/form-fields.html?case=${name}`, { waitUntil: 'networkidle' });
      await page.waitForFunction((expected) => document.documentElement.dataset.ready === expected, name);
    };
    const events = () => page.evaluate(() => window.events);
    await run({ page, open, events });
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
}

test('a required CheckboxGroup blocks native submission and shows its error', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('checkbox-group');
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), []);
    assert.equal(await page.locator('.muxui-checkbox-group').getAttribute('data-invalid'), 'true');
    assert.notEqual((await page.locator('.muxui-checkbox-group .muxui-field-error').textContent())?.trim() ?? '', '');

    await page.locator('.muxui-checkbox', { hasText: 'SMS' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), [['submit', { alerts: 'sms' }]]);
  });
});

test('Autocomplete Escape and Enter act on the open list before the field and form', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('autocomplete');
    const input = page.getByRole('combobox', { name: 'City' });
    const list = page.locator('.muxui-autocomplete-list');
    await input.click();
    await page.keyboard.type('Syd');
    assert.equal(await input.getAttribute('aria-expanded'), 'true');
    assert.equal(await input.getAttribute('aria-controls'), await list.getAttribute('id'));

    await page.keyboard.press('Escape');
    await list.waitFor({ state: 'detached' });
    assert.equal(await input.inputValue(), 'Syd', 'Escape on an open list keeps the text');
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Escape');
    assert.equal(await input.inputValue(), '', 'Escape on a closed list clears the text');

    // Press Enter at once: RAC delays aria-activedescendant while typing but
    // already selects its first option.
    await page.keyboard.type('Syd');
    await page.evaluate(() => { window.events.length = 0; });
    await page.keyboard.press('Enter');
    await list.waitFor({ state: 'detached' });
    assert.equal(await input.inputValue(), 'Sydney');
    assert.deepEqual(await events(), [['change', 'Sydney'], ['select', 'Sydney']], 'Enter on an active option selects without submitting');

    await page.keyboard.press('Enter');
    assert.deepEqual((await events()).at(-1), ['submit', { city: 'Sydney' }]);

    await input.fill('');
    await page.keyboard.type('Mel');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('[role="combobox"]').getAttribute('aria-activedescendant')?.endsWith('Melbourne'));
    await page.keyboard.press('Enter');
    assert.equal(await input.inputValue(), 'Melbourne');
    assert.notDeepEqual((await events()).at(-1), ['submit', { city: 'Mel' }]);
  });
});

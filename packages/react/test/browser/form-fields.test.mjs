import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

// Each case renders one Form; submit, change, and select events are logged to
// window.events so tests can assert what the browser actually submitted.
const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { Checkbox } from '/src/components.mjs';
  import { Autocomplete, CheckboxGroup, DateField, Form, NumberField, SearchField, Switch, TextField, TimeField } from '/src/fields.mjs';
  import { ColorField } from '/src/collections.mjs';
  import { SelectNative } from '/src/supplemental/select-native.mjs';
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
    controlled: function Controlled() {
      const [text, setText] = React.useState('Andrew');
      const [quantity, setQuantity] = React.useState(2);
      const [search, setSearch] = React.useState('');
      const [enabled, setEnabled] = React.useState(false);
      return h(Form, { onSubmit: submit },
        h(TextField, { label: 'Name', name: 'name', value: text, onChange: setText }),
        h(NumberField, { label: 'Quantity', name: 'quantity', value: quantity, onChange: setQuantity }),
        h(SearchField, { label: 'Search', name: 'search', value: search, onChange: setSearch }),
        h(Switch, { label: 'Enabled', name: 'enabled', selected: enabled, onChange: setEnabled }),
        h('output', { 'data-state': true }, JSON.stringify({ text, quantity, search, enabled })),
        h('button', { type: 'submit' }, 'Submit'));
    },
    required: () => h(Form, { onSubmit: submit },
      h(TextField, { label: 'Name', name: 'name', required: true }),
      h(NumberField, { label: 'Quantity', name: 'quantity', required: true }),
      h(SearchField, { label: 'Search', name: 'search', required: true }),
      h(Autocomplete, { label: 'City', name: 'city', items: ['Melbourne'], required: true }),
      h(DateField, { label: 'Date', name: 'date', required: true }),
      h(TimeField, { label: 'Time', name: 'time', required: true }),
      h(Switch, { label: 'Accept', name: 'accept', required: true }),
      h('button', { type: 'submit' }, 'Submit')),
    countries: () => h(Form, { onSubmit: submit },
      h(Autocomplete, { label: 'Country', name: 'country', items: [{ label: 'Australia', value: 'AU' }, { label: 'Austria', value: 'AT' }, { label: 'Belgium', value: 'BE' }], onChange: (value) => log('change', value) }),
      h('button', { type: 'submit' }, 'Submit'),
      h('button', { type: 'reset' }, 'Reset')),
    'error-message': () => h(Form, { onSubmit: submit },
      h(TextField, { label: 'Email', name: 'email', defaultValue: 'a@b.co', errorMessage: 'Enter your work email' }),
      h(TextField, { label: 'Name', name: 'name', required: true, errorMessage: 'Tell us your name' }),
      h('button', { type: 'submit' }, 'Submit')),
    'native-validation': () => h(Form, { onSubmit: submit },
      h(TextField, { label: 'Name', name: 'name', required: true, errorMessage: 'Enter your name.' }),
      h(TextField, { label: 'Email', name: 'email', type: 'email', required: true, errorMessage: 'Enter an email address.' }),
      h('button', { type: 'submit' }, 'Submit')),
    'select-native': () => h(Form, { onSubmit: submit },
      h(SelectNative, { label: 'City', name: 'city', invalid: true, onChange: (event) => log('change', event.target.value) },
        h('option', { value: 'a' }, 'Alpha'),
        h('option', { value: 'b' }, 'Beta')),
      h('button', { type: 'submit' }, 'Submit')),
    'color-field': function ColorFieldCase() {
      const [color, setColor] = React.useState('#336699');
      return h(Form, { onSubmit: submit },
        h(ColorField, { label: 'Brand', name: 'brand', value: color, onChange: (next) => { log('change', next); setColor(next); } }),
        h('output', { 'data-state': true }, color),
        h('button', { type: 'submit' }, 'Submit'));
    },
    'color-field-standalone': () => h(ColorField, { label: 'Accent', defaultValue: '#336699', onChange: (next) => log('change', next) }),
    'server-error': () => h(Form, { onSubmit: submit, validationErrors: { email: 'Already registered.' } },
      h(TextField, { label: 'Email', name: 'email', type: 'email' }),
      h('button', { type: 'submit' }, 'Submit')),
  };
  const name = new URLSearchParams(location.search).get('case');
  createRoot(document.getElementById('root')).render(h(cases[name]));
  document.documentElement.dataset.ready = name;`;

async function withPage(run) {
  const html = pageShell({ body: '<div id="root"></div>', entry: '/form-fields-entry.mjs' });
  const { url, close } = await startServer({
    entries: ['src/components.mjs', 'src/fields.mjs', 'src/collections.mjs', 'src/supplemental/select-native.mjs'],
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
    await page.locator('.muxui-checkbox-group .muxui-field-error').waitFor();
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

test('controlled text, number, search, and switch fields follow typing and submit their values', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('controlled');
    const state = () => page.locator('[data-state]').textContent().then(JSON.parse);
    await page.getByRole('textbox', { name: 'Name' }).fill('Andy');
    await page.getByRole('textbox', { name: 'Quantity' }).fill('5');
    await page.getByRole('textbox', { name: 'Quantity' }).blur();
    await page.getByRole('searchbox', { name: 'Search' }).fill('mux');
    await page.locator('.muxui-switch').click();
    assert.deepEqual(await state(), { text: 'Andy', quantity: 5, search: 'mux', enabled: true });
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), [['submit', { name: 'Andy', quantity: '5', search: 'mux', enabled: 'on' }]]);
  });
});

test('required fields block native submission and show their invalid state', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('required');
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), []);
    await page.locator('.muxui-switch-field[data-invalid]').waitFor();
    for (const selector of ['.muxui-text-field', '.muxui-number-field', '.muxui-search-field', '.muxui-autocomplete-search', '.muxui-date-field', '.muxui-time-field', '.muxui-switch-field']) {
      assert.equal(await page.locator(selector).getAttribute('data-invalid'), 'true', `${selector} is not invalid after a blocked submit`);
    }
  });
});

test('errorMessage submits while valid and replaces the built-in message when validation fails', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('error-message');
    const email = page.locator('.muxui-text-field').first();
    const name = page.locator('.muxui-text-field').nth(1);
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), []);
    await name.locator('.muxui-field-error').waitFor();
    assert.equal(await email.getAttribute('data-invalid'), null);
    assert.equal(await email.locator('.muxui-field-error').count(), 0);
    assert.equal(await name.getAttribute('data-invalid'), 'true');
    assert.equal((await name.locator('.muxui-field-error').textContent())?.trim(), 'Tell us your name');

    // The error leaves as the value becomes valid, not on blur, so the click below does not land on a moved button.
    await page.getByRole('textbox', { name: 'Name' }).fill('Andrew');
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), [['submit', { email: 'a@b.co', name: 'Andrew' }]]);
    assert.equal(await name.locator('.muxui-field-error').count(), 0);
  });
});

test('a native error leaves a field once its value is valid, so the first click on Submit after a failed submit lands', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('native-validation');
    const errorOf = (label) => page.locator('.muxui-text-field').filter({ has: page.getByRole('textbox', { name: label }) }).locator('.muxui-field-error');
    const submit = page.getByRole('button', { name: 'Submit' });
    await submit.click();
    await errorOf('Name').waitFor();
    await errorOf('Email').waitFor();

    // Each error goes while its field is still focused. Waiting for blur would move the button on mousedown.
    await page.getByRole('textbox', { name: 'Name' }).fill('Ada');
    await errorOf('Name').waitFor({ state: 'detached' });
    await page.getByRole('textbox', { name: 'Email' }).fill('ada');
    assert.equal(await errorOf('Email').count(), 1, 'a value that still fails its type keeps the error');
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com');
    await errorOf('Email').waitFor({ state: 'detached' });

    await submit.click();
    assert.deepEqual(await events(), [['submit', { name: 'Ada', email: 'ada@example.com' }]], 'the first click submitted the form');
  });
});

test('a native error appears when a field is left or submitted, never while its value is typed', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open }) => {
    await open('native-validation');
    const name = page.getByRole('textbox', { name: 'Name' });
    const email = page.getByRole('textbox', { name: 'Email' });
    const errors = page.locator('.muxui-field-error');
    await name.fill('Ada');
    await email.fill('ada');
    assert.equal(await errors.count(), 0, 'typing a valid or an unfinished value shows no error');
    await email.blur();
    await errors.waitFor();
    assert.equal((await errors.allTextContents()).join(), 'Enter an email address.', 'leaving the unfinished field shows its error');
    await name.fill('');
    await name.fill('Ada');
    assert.equal(await errors.count(), 1, 'editing another field does not show or clear this one');
  });
});

test('a server error stays on the field until it is left, as before', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open }) => {
    await open('server-error');
    const email = page.getByRole('textbox', { name: 'Email' });
    const error = page.locator('.muxui-field-error');
    await error.waitFor();
    await email.fill('new@example.com');
    assert.equal(await error.count(), 1, 'typing a different valid value keeps the server error showing');
    await email.blur();
    await error.waitFor({ state: 'detached' });
  });
});

test('a select inside a Form reports one change per choice, even with an error showing', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('select-native');
    await page.getByRole('combobox', { name: 'City' }).selectOption('b');
    assert.deepEqual(await events(), [['change', 'b']], 'the early dismissal fires change only for controls that wait for blur');
  });
});

test('Enter in a ColorField inside a Form commits the typed colour before the form submits it', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('color-field');
    const field = page.getByRole('textbox', { name: 'Brand' });
    const state = () => page.locator('[data-state]').textContent();
    const type = async (text) => {
      await field.press('ControlOrMeta+a');
      await page.keyboard.type(text);
    };
    await field.click();
    await type('112233');
    assert.deepEqual(await events(), [], 'typing alone applies nothing');
    await page.keyboard.press('Enter');
    // One change, then the submit, which read the normalized hex rather than the typed text.
    assert.deepEqual(await events(), [['change', 'rgba(17, 34, 51, 1)'], ['submit', { brand: '#112233' }]]);
    assert.equal(await state(), 'rgba(17, 34, 51, 1)', 'a controlled owner holds the committed colour');
    assert.equal(await field.inputValue(), '#112233');

    // A short hex is a whole colour: it expands before it is submitted.
    await type('445');
    await page.keyboard.press('Enter');
    assert.deepEqual((await events()).slice(2), [['change', 'rgba(68, 68, 85, 1)'], ['submit', { brand: '#444455' }]]);

    // Text that is not a whole colour reverts as it does on blur, and the form still submits the last colour.
    await type('11223');
    await page.keyboard.press('Enter');
    assert.deepEqual((await events()).slice(4), [['submit', { brand: '#444455' }]]);
    assert.equal(await field.inputValue(), '#444455');
    assert.equal(await state(), 'rgba(68, 68, 85, 1)');
  });
});

test('Enter in a ColorField outside a Form commits the typed colour once', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('color-field-standalone');
    const field = page.getByRole('textbox', { name: 'Accent' });
    await field.click();
    await field.press('ControlOrMeta+a');
    await page.keyboard.type('445566');
    await page.keyboard.press('Enter');
    assert.deepEqual(await events(), [['change', 'rgba(68, 85, 102, 1)']]);
    assert.equal(await field.inputValue(), '#445566', 'the field shows the normalized hex while still focused');
    assert.equal(await field.evaluate((node) => node === document.activeElement), true);
    // Leaving the field applies the same colour, which reports nothing new.
    await field.blur();
    assert.deepEqual(await events(), [['change', 'rgba(68, 85, 102, 1)']]);
  });
});

test('Autocomplete shows the chosen label, submits its value, filters after selection, and resets', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('countries');
    const input = page.getByRole('combobox', { name: 'Country' });
    const options = page.locator('.muxui-autocomplete-option');
    await input.click();
    await page.keyboard.type('Australia');
    await options.filter({ hasText: 'Australia' }).click();
    assert.equal(await input.inputValue(), 'Australia');
    assert.deepEqual((await events()).at(-1), ['change', 'AU']);
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual((await events()).at(-1), ['submit', { country: 'AU' }]);

    await input.click();
    await input.press('ControlOrMeta+a');
    await page.keyboard.type('Aust');
    assert.deepEqual(await options.allTextContents(), ['Australia', 'Austria']);
    assert.deepEqual((await events()).at(-1), ['change', 'Aust']);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Reset' }).click();
    assert.equal(await input.inputValue(), '');
    assert.equal(await page.locator('input[type="hidden"][name="country"]').inputValue(), '');
  });
});

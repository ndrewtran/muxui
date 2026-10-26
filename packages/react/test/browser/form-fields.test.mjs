import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

// Each case renders one Form; submit, change, and select events are logged to
// window.events so tests can assert what the browser actually submitted.
const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { Checkbox } from '/src/components.ts';
  import { RadioGroup } from '/src/collections.mjs';
  import { RadioField } from '/src/supplemental/radio-field.ts';
  import { Autocomplete, CheckboxGroup, DateField, Form, NumberField, SearchField, Switch, TextField, TimeField } from '/src/fields.ts';
  import { ColorField } from '/src/collections.mjs';
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
    // RadioField options with one error on the group, as the RadioField options example recommends.
    'radio-group': () => h(Form, { onSubmit: submit },
      h(RadioGroup, { label: 'Plan', name: 'plan', required: true, errorMessage: 'Choose a plan to continue.' },
        ['monthly', 'yearly'].map((value) => h(RadioField.Root, { key: value, value },
          h(RadioField.Button, null, h(RadioField.Indicator, null, h(RadioField.Dot)), value)))),
      h('button', { type: 'submit' }, 'Submit')),
    // Without errorMessage the group shows the browser's own message.
    'radio-group-native': () => h(Form, { onSubmit: submit },
      h(RadioGroup, { label: 'Plan', name: 'plan', required: true, options: [{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }] }),
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
      h('button', { type: 'submit' }, 'Submit')),
    'color-field': function ColorFieldCase() {
      const [color, setColor] = React.useState('#336699');
      return h(Form, { onSubmit: submit },
        h(ColorField, { label: 'Brand', name: 'brand', value: color, onChange: (next) => { log('change', next); setColor(next); } }),
        h('output', { 'data-state': true }, color),
        h('button', { type: 'submit' }, 'Submit'));
    },
    'color-field-standalone': () => h(ColorField, { label: 'Accent', defaultValue: '#336699', onChange: (next) => log('change', next) }),
  };
  const name = new URLSearchParams(location.search).get('case');
  createRoot(document.getElementById('root')).render(h(cases[name]));
  document.documentElement.dataset.ready = name;`;

async function withPage(run) {
  const html = pageShell({ body: '<div id="root"></div>', entry: '/form-fields-entry.mjs' });
  const { url, close } = await startServer({
    entries: ['src/components.ts', 'src/fields.ts', 'src/collections.mjs', 'src/supplemental/radio-field.ts'],
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
    assert.equal(await page.locator('.muxui-checkbox-group').getAttribute('data-muxui-state-invalid'), 'true');
    assert.notEqual((await page.locator('.muxui-checkbox-group .muxui-field-error').textContent())?.trim() ?? '', '');

    await page.locator('.muxui-checkbox', { hasText: 'SMS' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), [['submit', { alerts: 'sms' }]]);
  });
});

test('a required RadioGroup blocks native submission and shows its group error once', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('radio-group');
    const group = page.getByRole('radiogroup', { name: 'Plan' });
    assert.equal(await page.locator('.muxui-field-error').count(), 0, 'no error before the first submit');
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), [], 'the browser blocks the submit');
    await page.locator('.muxui-radio-group-error').waitFor();
    const errors = page.locator('.muxui-field-error');
    assert.equal(await errors.count(), 1, 'the message shows once for the group');
    assert.equal((await errors.textContent())?.trim(), 'Choose a plan to continue.');
    const errorId = await errors.getAttribute('id');
    assert.ok(errorId && (await group.getAttribute('aria-describedby'))?.split(' ').includes(errorId), 'the group is described by its error');
    assert.equal(await page.getByText('Choose a plan to continue.').count(), 1, 'no option repeats the message');

    await page.locator('.muxui-radio-field__button', { hasText: 'yearly' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), [['submit', { plan: 'yearly' }]]);
    assert.equal(await page.locator('.muxui-field-error').count(), 0, 'the error leaves once a plan is chosen');
  });
});

test('a required RadioGroup without errorMessage shows the browser message once', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('radio-group-native');
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), [], 'the browser blocks the submit');
    await page.locator('.muxui-radio-group-error').waitFor();
    assert.equal(await page.locator('.muxui-field-error').count(), 1);
    assert.notEqual((await page.locator('.muxui-radio-group-error').textContent())?.trim() ?? '', '', 'the default message is the browser validation message');
    await page.getByRole('radio', { name: 'Yearly' }).evaluate((node) => node.closest('label').click());
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), [['submit', { plan: 'yearly' }]]);
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
    await page.locator('.muxui-switch-field[data-muxui-state-invalid]').waitFor();
    for (const selector of ['.muxui-text-field', '.muxui-number-field', '.muxui-search-field', '.muxui-autocomplete-search', '.muxui-date-field', '.muxui-time-field', '.muxui-switch-field']) {
      assert.equal(await page.locator(selector).getAttribute('data-muxui-state-invalid'), 'true', `${selector} is not invalid after a blocked submit`);
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
    assert.equal(await email.getAttribute('data-muxui-state-invalid'), null);
    assert.equal(await email.locator('.muxui-field-error').count(), 0);
    assert.equal(await name.getAttribute('data-muxui-state-invalid'), 'true');
    assert.equal((await name.locator('.muxui-field-error').textContent())?.trim(), 'Tell us your name');

    // Commit the edit first: the error collapses on change and would move the button mid-click.
    await page.getByRole('textbox', { name: 'Name' }).fill('Andrew');
    await page.getByRole('textbox', { name: 'Name' }).blur();
    await page.getByRole('button', { name: 'Submit' }).click();
    assert.deepEqual(await events(), [['submit', { email: 'a@b.co', name: 'Andrew' }]]);
    assert.equal(await name.locator('.muxui-field-error').count(), 0);
  });
});

test('typing in a field that shows a native error broadcasts no change event until the field is left', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open }) => {
    await open('native-validation');
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.locator('.muxui-field-error').waitFor();
    // Native listeners, such as autosave or validation, must not run mid-edit on an event the browser did not send.
    await page.locator('form').evaluate((form) => {
      window.changes = [];
      form.addEventListener('change', (event) => window.changes.push(event.isTrusted));
    });
    await page.getByRole('textbox', { name: 'Name' }).pressSequentially('Ab');
    assert.deepEqual(await page.evaluate(() => window.changes), [], 'no change while typing');
    await page.getByRole('textbox', { name: 'Name' }).blur();
    assert.deepEqual(await page.evaluate(() => window.changes), [true], 'one trusted change when the field is left');
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

test('the Enter that confirms an input method composition does not commit a ColorField', { timeout: 90_000 }, async () => {
  await withPage(async ({ page, open, events }) => {
    await open('color-field-standalone');
    const field = page.getByRole('textbox', { name: 'Accent' });
    await field.click();
    await field.press('ControlOrMeta+a');
    await page.keyboard.type('445');
    // The browser marks the Enter that ends a composition with isComposing; the typed text is not a colour yet.
    await field.evaluate((node) => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
    assert.deepEqual(await events(), [], 'composition Enter reports nothing');
    assert.equal(await field.inputValue(), '445', 'composition Enter leaves the typed text alone');
    await page.keyboard.press('Enter');
    assert.deepEqual(await events(), [['change', 'rgba(68, 68, 85, 1)']], 'a plain Enter commits it');
    assert.equal(await field.inputValue(), '#444455');
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

import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function ErrorMessageFixture() {
  const h = React.createElement;
  const [submitted, setSubmitted] = React.useState('');
  const mode = new URLSearchParams(window.location.search).get('mode');
  const valid = mode === 'valid';
  return h('form', { id: 'form', onSubmit: (event) => { event.preventDefault(); setSubmitted(JSON.stringify([...new FormData(event.currentTarget).entries()])); } },
    h(Select, { label: 'Select', name: 'select', required: true, items: [{ id: 'red', label: 'Red' }], errorMessage: 'Pick a colour', defaultValue: valid ? 'red' : undefined }),
    h(ComboBox, { label: 'Combo', name: 'combo', required: true, items: [{ id: 'red', label: 'Red' }], errorMessage: 'Pick a city', defaultSelectedId: valid ? 'red' : undefined }),
    h(ColorField, { label: 'Colour', name: 'colour', required: true, errorMessage: 'Enter a colour', defaultValue: valid ? '#ff0000' : undefined }),
    h('button', { type: 'submit', id: 'submit' }, 'Submit'),
    h('output', { id: 'submitted' }, submitted));
}

test('real browser errorMessage stays hidden for valid fields and replaces failed required messages', { timeout: 90_000 }, async () => {
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { ColorField, ComboBox, Select } from '/src/collections.mjs';
    import '/generated/styles.css';
    ${ErrorMessageFixture.toString()}
    createRoot(document.getElementById('root')).render(React.createElement(ErrorMessageFixture));`;
  const { url, close } = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/field-error.html': pageShell({ body: '<div id="root"></div>', entry: '/field-error-entry.mjs' }) },
    modules: { '/field-error-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const shown = () => page.locator('.muxui-field-error').allTextContents();

    await page.goto(`${url}/field-error.html?mode=valid`, { waitUntil: 'networkidle' });
    await page.locator('#submit').click();
    assert.equal(await page.locator('#submitted').textContent(), JSON.stringify([['select', 'red'], ['combo', 'red'], ['colour', '#FF0000']]));
    assert.deepEqual(await shown(), []);
    assert.equal(await page.locator('[data-invalid]').count(), 0);

    await page.goto(`${url}/field-error.html?mode=empty`, { waitUntil: 'networkidle' });
    await page.locator('#submit').click();
    assert.equal(await page.locator('#submitted').textContent(), '');
    assert.deepEqual((await shown()).sort(), ['Enter a colour', 'Pick a city', 'Pick a colour']);
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});

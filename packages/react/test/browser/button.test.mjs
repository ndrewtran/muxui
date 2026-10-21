import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SubmitForms, submitControls } from './button-submit-fixture.mjs';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// A Button's icon and label share one cross-axis center and sit one size-recipe
// gap apart, whichever side the icon is on and while pending with visible text.
// A pending submit Button or Card.Button starts no form submission by click or Enter, in a
// client render and in server markup before hydration (implicit submission needs a real
// browser). Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '/src/button.ts';

const h = React.createElement;
const icon = () => h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none' },
  h('path', { d: 'M8 3v10M3 8h10', stroke: 'currentColor', strokeWidth: 2 }));
const label = (text) => h('span', null, text);

createRoot(document.getElementById('root')).render(h('div', null, ['sm', 'md', 'lg'].map((size) => h('div', { key: size, 'data-size-row': size },
  h(Button, { id: size + '-leading', size, variant: 'ghost' }, icon(), label('New')),
  h(Button, { id: size + '-trailing', size, variant: 'ghost' }, label('Next'), icon()),
  h(Button, { id: size + '-pending', size, variant: 'ghost', pending: true, showTextWhileLoading: true }, icon(), label('Saving'))))));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px"',
  body: '<div id="root"></div>',
  entry: '/button-entry.mjs',
});

const styles = '<link rel="stylesheet" href="/generated/styles.css">';
const fixtureModule = '/test/browser/button-submit-fixture.mjs';
const fixtureEntries = ['src/button.ts', 'test/browser/button-submit-fixture.mjs'];

const formsEntry = (control) => `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SubmitForms, trackSubmits } from '${fixtureModule}';

trackSubmits();
createRoot(document.getElementById('root')).render(React.createElement(SubmitForms, { control: ${JSON.stringify(control)} }));
`;
const formsPage = pageShell({ attributes: 'data-muxui-color-scheme="light"', head: styles, body: '<div id="root"></div>', entry: '/forms-entry.mjs' });

// Server markup is in the page and hydration waits for the test, so a pending submit
// Button can be used before its click handler exists.
const hydrationEntry = (control) => `
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { SubmitForms, trackSubmits } from '${fixtureModule}';

trackSubmits();
await new Promise((resolve) => { window.__hydrate = resolve; });
hydrateRoot(document.getElementById('root'), React.createElement(SubmitForms, { control: ${JSON.stringify(control)} }));
`;
const hydrationPage = (control) => pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: styles,
  body: `<div id="root">${renderToString(React.createElement(SubmitForms, { control }))}</div>`,
  entry: '/hydration-entry.mjs',
});

/** Opens a test page and returns its tab, collected page errors, and cleanup. */
async function openPage(engine, { pages, modules, path, ready }) {
  const { url, close } = await startServer({ entries: fixtureEntries, pages, modules });
  const browser = await launchBrowser(engine);
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(error.message));
  tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await tab.goto(`${url}${path}`, { waitUntil: 'networkidle' });
  await tab.locator(ready).first().waitFor();
  return { tab, errors, close: async () => { await browser.close(); await close(); } };
}

/** Submissions an action caused, by form id. */
async function submitsFrom(tab, action) {
  const read = () => tab.evaluate(() => ({ ...window.__submits }));
  const before = await read();
  await action();
  const after = await read();
  return Object.fromEntries(Object.keys({ ...before, ...after })
    .map((id) => [id, (after[id] ?? 0) - (before[id] ?? 0)]).filter(([, change]) => change > 0));
}

// Every way a user can start a submission in #one and #two.
function submissionPaths(tab) {
  const saveButton = (id) => tab.locator(`#${id}-save`);
  return {
    'Enter in the field': (id) => async () => { await tab.locator(`#${id}-a`).focus(); await tab.keyboard.press('Enter'); },
    // Playwright treats aria-disabled as not actionable, so force the real mouse click a user can make.
    'click on the Button': (id) => () => saveButton(id).click({ force: true }),
    'Enter on the focused Button': (id) => async () => { await saveButton(id).focus(); await tab.keyboard.press('Enter'); },
    'Space on the focused Button': (id) => async () => { await saveButton(id).focus(); await tab.keyboard.press('Space'); },
  };
}

async function submissionsByPath(tab, names) {
  const counts = {};
  for (const id of ['one', 'two']) {
    for (const [name, path] of Object.entries(submissionPaths(tab))) {
      if (!names || names.includes(name)) counts[`${id}-field form, ${name}`] = await submitsFrom(tab, path(id));
    }
  }
  return counts;
}

/** The fixture forms start pending: nothing submits, then everything does once pending clears. */
async function assertPendingThenSettled(tab, errors) {
  const pending = await submissionsByPath(tab);
  assert.deepEqual(pending, Object.fromEntries(Object.keys(pending).map((name) => [name, {}])), 'a pending submit Button starts no submission');
  const pendingButton = tab.locator('#one-save');
  await pendingButton.focus();
  assert.equal(await pendingButton.evaluate((button) => button === document.activeElement), true, 'the pending Button stays focusable');
  assert.equal(await tab.locator('#locked-save').evaluate((button) => button.disabled), true, 'an explicit disabled prop still disables the Button');
  const activations = () => tab.evaluate(() => window.__activations);
  assert.equal(await activations(), 0, 'a pending Button does not call onActivate');

  await tab.locator('#toggle').click();
  const settled = await submissionsByPath(tab);
  assert.deepEqual(settled, Object.fromEntries(Object.keys(settled).map((name) => [name, { [name.startsWith('one-') ? 'one' : 'two']: 1 }])),
    'a settled submit Button submits by every path');
  assert.ok(await activations() > 0, 'a settled Button calls onActivate');

  // Reset is unaffected by a pending sibling submit Button.
  await tab.locator('#toggle').click();
  await tab.locator('#reset-a').fill('edited');
  await tab.locator('#reset-reset').click();
  assert.equal(await tab.locator('#reset-a').inputValue(), 'start', 'the reset Button still restores the field');
  assert.deepEqual(errors, [], errors.join('\n'));
}

for (const engine of browserEngines()) {
  test(`Button centers its icon and label one size gap apart in ${engine}`, { timeout: 120_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/button.ts'],
      pages: { '/button.html': page },
      modules: { '/button-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage();
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await tab.goto(`${url}/button.html`, { waitUntil: 'networkidle' });
      await tab.locator('#lg-pending').waitFor();
      for (const size of ['sm', 'md', 'lg']) {
        for (const kind of ['leading', 'trailing', 'pending']) {
          const m = await tab.locator(`#${size}-${kind}`).evaluate((button) => {
            const content = button.querySelector('.muxui-button-content');
            const box = (node) => node.getBoundingClientRect();
            const [first, second] = [...content.children];
            const [iconBox, labelBox] = first.localName === 'svg' ? [box(first), box(second)] : [box(second), box(first)];
            return {
              gap: parseFloat(getComputedStyle(button).columnGap),
              spacing: iconBox.left > labelBox.left ? iconBox.left - labelBox.right : labelBox.left - iconBox.right,
              offset: (iconBox.top + iconBox.bottom) / 2 - (labelBox.top + labelBox.bottom) / 2,
            };
          });
          const name = `${size} ${kind}`;
          assert.ok(m.gap > 0, `${name}: the size recipe sets a gap`);
          assert.ok(Math.abs(m.offset) < 0.5, `${name}: icon and label centers differ by ${m.offset}px`);
          assert.ok(Math.abs(m.spacing - m.gap) < 0.5, `${name}: icon and label are ${m.spacing}px apart, expected ${m.gap}px`);
        }
      }
      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });

  for (const control of Object.keys(submitControls)) {
    test(`A pending submit ${control} starts no form submission in ${engine}`, { timeout: 120_000 }, async () => {
      const { tab, errors, close } = await openPage(engine, { pages: { '/forms.html': formsPage }, modules: { '/forms-entry.mjs': formsEntry(control) }, path: '/forms.html', ready: '#one-save' });
      try {
        await assertPendingThenSettled(tab, errors);
      } finally {
        await close();
      }
    });

    test(`A server-rendered pending submit ${control} starts no submission before hydration in ${engine}`, { timeout: 120_000 }, async () => {
      const { tab, errors, close } = await openPage(engine, { pages: { '/hydration.html': hydrationPage(control) }, modules: { '/hydration-entry.mjs': hydrationEntry(control) }, path: '/hydration.html', ready: '#one-save' });
      try {
        await tab.waitForFunction(() => typeof window.__hydrate === 'function');
        // Nothing has hydrated the control, so it is natively disabled: click and Enter do nothing.
        assert.equal(await tab.locator('#one-save').evaluate((button) => button.disabled), true, `the server-rendered pending ${control} is disabled`);
        const before = await submissionsByPath(tab, ['Enter in the field', 'click on the Button']);
        assert.deepEqual(before, Object.fromEntries(Object.keys(before).map((name) => [name, {}])), 'before hydration');

        await tab.evaluate(() => window.__hydrate());
        await tab.waitForFunction(() => !document.getElementById('one-save').disabled);
        // Hydrated: focusable again, its click cancelled, and submitting once pending clears.
        await assertPendingThenSettled(tab, errors);
      } finally {
        await close();
      }
    });
  }
}

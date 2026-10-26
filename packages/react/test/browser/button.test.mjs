import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Button, ButtonGroup, IconButton, LightboxClose, Toolbar } from '../../generated/index.mjs';
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

// Button reads three component roles: the primary variant's background and foreground, and the corner radius of a
// Button or IconButton at the md and lg sizes. Four things keep their own corner geometry and do not follow the radius
// role: the sm size (option radius), the controls of an attached ButtonGroup (outer corners at the control radius, joins
// square), Toolbar buttons and the Lightbox close control. A scheme scope assigns distinct values and the computed style
// must follow, in each scheme. A stylesheet with the three reads removed, leaving their fallbacks, must fail the checks.
const generatedStyles = await readFile(resolve(import.meta.dirname, '../../generated/styles.css'), 'utf8');
const roleVariants = ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse'];
const roleSizes = ['sm', 'md', 'lg'];
const assignedRoles = { background: 'rgb(10, 20, 30)', foreground: 'rgb(240, 230, 220)', radius: '3px' };
// The roles a consumer assigned before the component roles were read: semantic roles on a nested element.
const semanticRoles = { background: 'rgb(30, 120, 40)', foreground: 'rgb(200, 100, 50)', radius: '5px' };
const roleStyle = ({ background, foreground, radius }) => ({ '--muxui-component-button-background': background, '--muxui-component-button-foreground': foreground, '--muxui-component-button-radius': radius });
const semanticStyle = { '--muxui-semantic-selection-track': semanticRoles.background, '--muxui-semantic-action-foreground': semanticRoles.foreground, '--muxui-semantic-control-radius': semanticRoles.radius };
// The escape hatch: `initial` makes the component role undefined again, so the read falls back to the semantic role.
const hatchStyle = { ...semanticStyle, ...roleStyle({ background: 'initial', foreground: 'initial', radius: 'initial' }) };

// Every variant and size of both controls, then the geometry exceptions (attached groups, Toolbar, Lightbox close).
function roleControls(scope) {
  const h = React.createElement;
  const attached = ['horizontal', 'vertical'].flatMap((orientation) => roleSizes.map((size) => h(ButtonGroup, { key: `group-${orientation}-${size}`, attached: true, orientation, 'aria-label': 'Group' },
    h(Button, { id: `${scope}-group-${orientation}-${size}-0`, size }, 'One'),
    h(IconButton, { id: `${scope}-group-${orientation}-${size}-1`, size, 'aria-label': 'Add' }, '+'),
    h(Button, { id: `${scope}-group-${orientation}-${size}-2`, size }, 'Three'))));
  return [
    ...roleVariants.flatMap((variant) => roleSizes.flatMap((size) => [
      h(Button, { key: `button-${variant}-${size}`, id: `${scope}-button-${variant}-${size}`, variant, size }, 'Save'),
      h(IconButton, { key: `icon-${variant}-${size}`, id: `${scope}-icon-${variant}-${size}`, variant, size, 'aria-label': 'Add' }, '+'),
    ])),
    ...attached,
    h(Toolbar, { key: 'toolbar', 'aria-label': 'Tools' }, h(Button, { id: `${scope}-toolbar` }, 'Cut')),
    h(LightboxClose, { key: 'lightbox', id: `${scope}-lightbox` }),
  ];
}

// Scopes: `assigned` takes the component roles, `plain` is the default theme, `semantic` assigns only semantic roles on a
// nested element and `hatch` adds `initial` for the component roles beside them.
function roleFixture(css, scheme) {
  const h = React.createElement;
  const probe = (scope) => [h(Button, { key: 'button', id: `${scope}-probe-button`, variant: 'primary', size: 'md' }, 'Save'), h(IconButton, { key: 'icon', id: `${scope}-probe-icon`, variant: 'primary', size: 'md', 'aria-label': 'Add' }, '+')];
  const body = renderToString(h('div', { 'data-muxui-color-scheme': scheme },
    h('div', { style: roleStyle(assignedRoles) }, ...roleControls('assigned')),
    h('div', null, ...roleControls('plain')),
    h('div', { style: semanticStyle }, ...probe('semantic')),
    h('div', { style: hatchStyle }, ...probe('hatch'))));
  return `<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`;
}

// Runs in the page; returns the names of the checks that fail. Check names start with the role they exercise.
function observeRoles({ variants, sizes, assigned, semantic }) {
  const corners = (id) => { const style = getComputedStyle(document.getElementById(id)); return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].join(' '); };
  const read = (id) => { const style = getComputedStyle(document.getElementById(id)); return { background: style.backgroundColor, foreground: style.color, radius: style.borderTopLeftRadius }; };
  // What the plain scope resolves a default role to, so the default theme is compared and no default is written down.
  const resolved = (id, property, role) => {
    const node = document.createElement('span');
    node.style.setProperty(property, `var(--muxui-semantic-${role})`);
    document.getElementById(id).parentElement.append(node);
    const value = getComputedStyle(node).getPropertyValue(property);
    node.remove();
    return value;
  };
  const failures = [];
  const check = (ok, name) => { if (!ok) failures.push(name); };
  for (const kind of ['button', 'icon']) {
    for (const variant of variants) {
      for (const size of sizes) {
        const name = `${kind}-${variant}-${size}`;
        const set = read(`assigned-${name}`);
        const plain = read(`plain-${name}`);
        const primary = variant === 'primary';
        if (primary) {
          check(set.background === assigned.background, `background ${name}`);
          check(set.foreground === assigned.foreground, `foreground ${name}`);
        } else {
          check(set.background === plain.background && set.foreground === plain.foreground, `other variants keep their colours ${name}`);
        }
        // sm keeps the option radius; md and lg follow the role and default to the control radius.
        check(set.radius === (size === 'sm' ? plain.radius : assigned.radius), `radius ${name}`);
        check(plain.radius === resolved(`plain-${name}`, 'border-top-left-radius', size === 'sm' ? 'shape-option-radius' : 'control-radius'), `default radius ${name}`);
        if (primary && size === 'md') {
          check(plain.background === resolved(`plain-${name}`, 'background-color', 'selection-track'), `default background ${name}`);
          check(plain.foreground === resolved(`plain-${name}`, 'color', 'action-foreground'), `default foreground ${name}`);
        }
      }
    }
  }
  // Attached groups keep their outer corners at the control radius and square joins, whatever the role says.
  const control = resolved('plain-group-horizontal-md-0', 'border-top-left-radius', 'control-radius');
  const geometry = { first: [control, '0px', '0px', control], middle: ['0px', '0px', '0px', '0px'], last: ['0px', control, control, '0px'] };
  const vertical = { first: [control, control, '0px', '0px'], middle: geometry.middle, last: ['0px', '0px', control, control] };
  for (const [orientation, expected] of [['horizontal', geometry], ['vertical', vertical]]) {
    for (const size of sizes) {
      ['first', 'middle', 'last'].forEach((position, index) => {
        const name = `${orientation}-${size}-${index}`;
        check(corners(`assigned-group-${name}`) === corners(`plain-group-${name}`), `attached corners ignore the role ${name}`);
        if (size !== 'sm') check(corners(`plain-group-${name}`) === expected[position].join(' '), `attached geometry ${name}`);
      });
    }
  }
  check(read('assigned-toolbar').radius === read('plain-toolbar').radius, 'toolbar radius ignores the role');
  check(read('plain-toolbar').radius === resolved('plain-toolbar', 'border-top-left-radius', 'control-radius'), 'toolbar default radius');
  check(read('assigned-lightbox').radius === read('plain-lightbox').radius, 'lightbox close radius ignores the role');
  check(read('plain-lightbox').radius === resolved('plain-lightbox', 'border-top-left-radius', 'shape-option-radius'), 'lightbox close default radius');
  // Semantic roles assigned on a nested element no longer reach the component; `initial` restores them.
  for (const kind of ['button', 'icon']) {
    const plain = read(`plain-${kind}-primary-md`);
    const nested = read(`semantic-probe-${kind}`);
    const hatch = read(`hatch-probe-${kind}`);
    check(nested.background === plain.background && nested.foreground === plain.foreground && nested.radius === plain.radius, `semantic roles alone do not reach ${kind}`);
    check(hatch.background === semantic.background && hatch.foreground === semantic.foreground && hatch.radius === semantic.radius, `initial restores the semantic roles ${kind}`);
  }
  return failures;
}

for (const engine of browserEngines()) {
  test(`Button and IconButton read their component color and radius roles in each scheme in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage();
      const failures = async (css, scheme) => {
        await tab.setContent(roleFixture(css, scheme));
        return tab.evaluate(observeRoles, { variants: roleVariants, sizes: roleSizes, assigned: assignedRoles, semantic: semanticRoles });
      };
      // The three reads removed, leaving their fallbacks: the stylesheet as it was before the roles were wired.
      const withoutReads = generatedStyles.replaceAll(/var\(--muxui-component-button-(?:background|foreground|radius), (var\(--muxui-[\w-]+\))\)/gu, '$1');
      for (const scheme of ['light', 'dark']) {
        assert.deepEqual(await failures(generatedStyles, scheme), [], `${scheme}: every role check passes`);
        assert.notEqual(withoutReads, generatedStyles, 'the stylesheet has component reads to strip');
        const broken = await failures(withoutReads, scheme);
        for (const role of ['background', 'foreground', 'radius', 'semantic roles alone']) assert.ok(broken.some((name) => name.startsWith(role)), `${scheme}: dropping the reads must fail the ${role} checks`);
      }
    } finally {
      await browser.close();
    }
  });

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
            const content = button.querySelector('.muxui-button__label');
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

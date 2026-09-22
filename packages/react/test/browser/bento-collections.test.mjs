import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { ListBox, Menu, Select } from '../../src/collections.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

function CollectionsFixture() {
  const h = React.createElement;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [action, setAction] = React.useState('');
  const [actionCount, setActionCount] = React.useState(0);
  const [itemActionCount, setItemActionCount] = React.useState(0);
  const [selected, setSelected] = React.useState(['one']);
  const [city, setCity] = React.useState('melbourne');
  const [selectOpen, setSelectOpen] = React.useState(false);
  const [clicks, setClicks] = React.useState(0);
  const [keys, setKeys] = React.useState(0);
  const [submitted, setSubmitted] = React.useState('');
  const [readOnlyChanges, setReadOnlyChanges] = React.useState(0);
  const anchor = React.useRef(null);
  const trigger = React.useRef(null);
  const label = React.useRef(null);
  const description = React.useRef(null);
  const error = React.useRef(null);
  React.useEffect(() => { document.documentElement.dataset.ready = [trigger.current?.tagName, label.current?.tagName, description.current?.tagName, error.current?.tagName].join(','); }, []);
  return h('main', null,
    h(Menu.Root, { open: menuOpen, onOpenChange: setMenuOpen, onAction: (item) => { setAction(item.id); setActionCount((count) => count + 1); } },
      h(Menu.Trigger, { id: 'menu-trigger' }, 'Actions'),
      h(Menu.Popup, null,
        h(Menu.List, { 'aria-label': 'Actions' },
          h(Menu.Section, null, h(Menu.Header, null, 'Editing'), h(Menu.Item, { id: 'cut' }, 'Cut')),
          h(Menu.Separator),
          h(Menu.Item, { id: 'disabled', disabled: true }, 'Unavailable'),
          h(Menu.Submenu, { delay: 20 },
            h(Menu.Item, { id: 'share', textValue: 'Share' }, h('strong', null, 'Share')),
            h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Share' },
              h(Menu.Item, { id: 'email' }, 'Email'),
              h(Menu.Submenu, { delay: 20 },
                h(Menu.Item, { id: 'more' }, 'More'),
                h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'More' }, h(Menu.Item, { id: 'copy-link', onAction: () => setItemActionCount((count) => count + 1) }, 'Copy link')))))))))),
    h('output', { id: 'action' }, action),
    h('output', { id: 'action-count' }, String(actionCount)), h('output', { id: 'item-action-count' }, String(itemActionCount)),
    h('output', { id: 'menu-open' }, String(menuOpen)),
    h(Menu.Root, { disabled: true }, h(Menu.Trigger, { disabled: false, id: 'disabled-menu' }, 'Disabled menu'), h(Menu.Popup, null, h(Menu.List, null, h(Menu.Item, { id: 'never' }, 'Never')))),
    h('span', { ref: anchor, id: 'coordinate-anchor', style: { position: 'absolute', left: 500, top: 100, width: 0, height: 0 } }),
    h(Menu.Root, null, h(Menu.Trigger, { id: 'coordinate-trigger' }, 'Coordinate menu'), h(Menu.Popup, { anchorRef: anchor, offset: 0, containerPadding: 0, shouldFlip: false, 'data-testid': 'coordinate-popup' }, h(Menu.List, { 'aria-label': 'Coordinate actions' }, h(Menu.Item, { id: 'inspect' }, 'Inspect')))),
    h(ListBox.Root, { 'aria-label': 'Palette', layout: 'grid', selectedIds: selected, onSelectionChange: setSelected, style: { width: 252, gridTemplateColumns: 'repeat(3, 1fr)' } },
      h(ListBox.Section, { title: 'Numbers' }, ['one', 'two', 'three', 'four', 'five', 'six'].map((id) => h(ListBox.Item, { id, key: id, textValue: id, style: { minHeight: 40 } }, h('strong', null, id))))),
    h('output', { id: 'selected' }, selected.join(',')),
    h('form', { onSubmit: (event) => { event.preventDefault(); setSubmitted(new FormData(event.currentTarget).get('city')); } },
      h(Select, { label: 'City', name: 'city', value: city, onChange: setCity, open: selectOpen, onOpenChange: setSelectOpen, modal: false,
        items: [{ id: 'melbourne', label: h('strong', null, 'Melbourne'), textValue: 'Melbourne' }, { id: 'sydney', label: h('strong', null, 'Sydney'), textValue: 'Sydney' }, { id: 'perth', label: 'Perth', disabled: true }],
        trigger: h('button', { id: 'native-select-trigger', ref: trigger, className: 'consumer-trigger', onClick: () => setClicks((value) => value + 1), onKeyDown: () => setKeys((value) => value + 1) }, h(Select.Value)) }),
      h('button', { type: 'submit', id: 'submit' }, 'Submit')),
    h('output', { id: 'city' }, city), h('output', { id: 'clicks' }, String(clicks)), h('output', { id: 'keys' }, String(keys)), h('output', { id: 'submitted' }, submitted),
    h('input', { id: 'outside', 'aria-label': 'Outside' }),
    h(Select.Root, { defaultValue: 'rich', invalid: true, modal: false },
      h(Select.Label, { ref: label }, 'Compound choice'),
      h(Select.Trigger, { id: 'compound-trigger' }, h(Select.Value)),
      h(Select.Popup, null, h(Select.List, null, h(Select.Item, { id: 'rich', textValue: 'Rich choice' }, h('strong', { id: 'rich-content' }, 'Rich choice')), h(Select.Item, { id: 'other' }, 'Other choice'))),
      h(Select.Description, { ref: description }, 'A description'), h(Select.Error, { ref: error }, 'A validation error')),
    h(Select, { label: 'Read only', defaultValue: 'fixed', readOnly: true, items: ['fixed', 'changed'], onChange: () => setReadOnlyChanges((value) => value + 1) }),
    h('output', { id: 'readonly-changes' }, String(readOnlyChanges)));
}

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

test('Bento collections hydrate and preserve nested menu, spatial grid, and Select form/focus contracts', { timeout: 90_000 }, async () => {
  const entry = `import React from 'react';
    import { hydrateRoot } from 'react-dom/client';
    import { ListBox, Menu, Select } from '/src/collections.mjs';
    import '/generated/styles.css';
    import '/src/styles/collections.css';
    ${CollectionsFixture.toString()}
    hydrateRoot(document.getElementById('root'), React.createElement(CollectionsFixture));`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root">${renderToString(React.createElement(CollectionsFixture))}</div><script type="module" src="/bento-collections-entry.mjs"></script></body></html>`;
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-collections-vite-'));
  const server = await createServer({ configFile: false, root: join(repositoryRoot, 'packages/react'), cacheDir, logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['src/collections.mjs'], include: ['react', 'react-dom/client', 'react-aria-components'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'bento-collections-fixture', resolveId(id) { if (id === '/bento-collections-entry.mjs') return fileURLToPath(new URL('./bento-collections-entry.mjs', import.meta.url)); }, load(id) { if (id === fileURLToPath(new URL('./bento-collections-entry.mjs', import.meta.url))) return entry; }, configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url === '/bento-collections.html') { response.setHeader('content-type', 'text/html'); response.end(html); }
        else next();
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/bento-collections.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.ready, null, { timeout: 10000 }).catch((error) => { throw new Error(`${error.message}\n${errors.join('\n')}`); });
    assert.equal(await page.locator('html').getAttribute('data-ready'), 'BUTTON,SPAN,SPAN,SPAN');
    assert.deepEqual(errors, []);
    const menuTrigger = page.locator('#menu-trigger');
    await menuTrigger.focus();
    await menuTrigger.press('ArrowDown');
    await page.getByRole('menuitem', { name: 'Cut', exact: true }).waitFor();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.getByRole('menuitem', { name: 'Share', exact: true }).evaluate((node) => document.activeElement === node), true);
    assert.equal(await page.getByRole('menuitem', { name: 'Share', exact: true }).getAttribute('data-has-submenu'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('menuitem', { name: 'Share', exact: true }).getAttribute('data-open'), 'true');
    await page.getByRole('menuitem', { name: 'Email', exact: true }).waitFor();
    assert.equal(await page.getByRole('menuitem', { name: 'Email', exact: true }).evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.getByRole('menuitem', { name: 'Share', exact: true }).evaluate((node) => document.activeElement === node), true);
    await page.getByRole('menuitem', { name: 'Share', exact: true }).hover();
    await page.getByRole('menuitem', { name: 'More', exact: true }).hover();
    await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
    assert.equal(await page.locator('#action').textContent(), 'copy-link');
    assert.equal(await page.locator('#action-count').textContent(), '1');
    assert.equal(await page.locator('#item-action-count').textContent(), '1');
    assert.equal(await page.locator('#menu-open').textContent(), 'false');
    await page.waitForFunction(() => document.activeElement?.id === 'menu-trigger');
    assert.equal(await page.locator('#disabled-menu').isDisabled(), true);
    await page.locator('#coordinate-trigger').click();
    const popup = page.getByTestId('coordinate-popup');
    await popup.waitFor();
    await page.waitForFunction(() => {
      const box = document.querySelector('[data-testid="coordinate-popup"]')?.getBoundingClientRect();
      return box && Math.abs(box.x - 500) <= 1 && Math.abs(box.y - 100) <= 1;
    });
    const coordinateBox = await popup.boundingBox();
    assert.ok(Math.abs(coordinateBox.x - 500) <= 1);
    assert.ok(Math.abs(coordinateBox.y - 100) <= 1);
    await page.keyboard.press('Escape');
    const palette = page.getByRole('listbox', { name: 'Palette' });
    await palette.getByRole('option', { name: 'one', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await palette.getByRole('option', { name: 'two', exact: true }).evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await palette.getByRole('option', { name: 'five', exact: true }).evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press(' ');
    assert.equal(await page.locator('#selected').textContent(), 'five');
    const nativeTrigger = page.locator('#native-select-trigger');
    await nativeTrigger.focus();
    await nativeTrigger.press('ArrowDown');
    await page.getByRole('option', { name: 'Sydney', exact: true }).click();
    assert.equal(await page.locator('#city').textContent(), 'sydney');
    assert.ok(Number(await page.locator('#keys').textContent()) > 0);
    await page.waitForFunction(() => document.activeElement?.id === 'native-select-trigger');
    await nativeTrigger.click();
    assert.equal(await page.locator('#clicks').textContent(), '1');
    assert.equal(await page.getByRole('option', { name: 'Perth', exact: true }).getAttribute('aria-disabled'), 'true');
    assert.equal(await page.locator('#outside').evaluate((node) => node.closest('[aria-hidden="true"]') === null), true);
    await page.locator('#outside').click();
    assert.equal(await page.locator('#outside').evaluate((node) => document.activeElement === node), true);
    await page.locator('#submit').click();
    assert.equal(await page.locator('#submitted').textContent(), 'sydney');
    assert.equal(await nativeTrigger.locator('strong').textContent(), 'Sydney');
    assert.equal(await page.locator('#compound-trigger strong').textContent(), 'Rich choice');
    await page.getByRole('button', { name: /Read only/ }).click();
    await page.getByRole('option', { name: 'changed', exact: true }).click();
    assert.equal(await page.locator('#readonly-changes').textContent(), '0');
    assert.ok((await page.getByRole('button', { name: /Read only/ }).textContent()).includes('fixed'));
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

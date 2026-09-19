import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { TextField, SearchField } from '../../src/fields.mjs';
import { Button } from '../../src/button.mjs';
import { IconButton } from '../../src/supplemental/icon-button.mjs';
import { CommandPalette } from '../../src/supplemental/command-palette.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

// This same fixture renders on the server and hydrates in the browser.
function InputControlsFixture() {
  const h = React.createElement;
  const [text, setText] = React.useState('alpha beta');
  const [search, setSearch] = React.useState('alpha beta');
  const [query, setQuery] = React.useState('');
  const [wrapped, setWrapped] = React.useState(false);
  const [cancelFieldKeys, setCancelFieldKeys] = React.useState(true);
  const [activated, setActivated] = React.useState('');
  const textRef = React.useRef(null);
  const textRootRef = React.useRef(null);
  const searchRef = React.useRef(null);
  const searchRootRef = React.useRef(null);
  const buttonRef = React.useRef(null);
  const iconRef = React.useRef(null);
  const paletteRef = React.useRef(null);
  const pendingSelection = React.useRef(null);
  const record = (event) => {
    window.inputEvents.push({ type: event.type, id: event.currentTarget.id, tag: event.currentTarget.tagName, pointerId: event.pointerId });
  };
  const paste = (setValue) => (event) => {
    record(event);
    event.preventDefault();
    const input = event.currentTarget;
    const value = event.clipboardData.getData('text/plain');
    const start = input.selectionStart ?? 0;
    setValue(input.value.slice(0, start) + value + input.value.slice(input.selectionEnd ?? start));
    pendingSelection.current = { input, position: start + value.length };
  };
  React.useLayoutEffect(() => {
    if (pendingSelection.current) {
      const { input, position } = pendingSelection.current;
      input.setSelectionRange(position, position);
      pendingSelection.current = null;
    }
  }, [text, search, query]);
  React.useEffect(() => {
    window.inputEvents = [];
    window.fieldActions = [];
    window.hostRefs = { text: textRef.current, textRoot: textRootRef.current, search: searchRef.current, searchRoot: searchRootRef.current, button: buttonRef.current, icon: iconRef.current };
    document.documentElement.dataset.ready = 'true';
  }, []);
  const inputProps = (setValue) => ({
    className: 'consumer-input',
    value: 'must not replace the root value',
    onChange() { throw new Error('inputProps must not replace root onChange'); },
    onInput() { throw new Error('inputProps must not replace root onInput'); },
    onKeyDown(event) {
      record(event);
      if (event.key === 'Enter' || event.key === 'Escape') {
        window.fieldActions.push(`native:${event.currentTarget.id}:${event.key}`);
        if (cancelFieldKeys) event.preventDefault();
      }
    },
    onPaste: paste(setValue),
    onFocus: record,
    onBlur: record,
    onSelect: record,
  });
  const pointerProps = {
    onPointerDown(event) {
      record(event);
      if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId);
    },
    onGotPointerCapture: record,
    onPointerMove: record,
    onPointerUp(event) {
      record(event);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: record,
    onLostPointerCapture: record,
    onAuxClick: record,
    onContextMenu(event) { record(event); event.preventDefault(); },
  };
  // Results deliberately come from the application, independently of query text.
  const results = query === 'none' || query === 'loading' ? [] : [{ id: 'external', title: 'External result' }];
  const queryInput = h(CommandPalette.Input, {
    id: 'palette-input',
    'aria-label': 'Command query',
    className: 'consumer-command-input',
    value: query,
    onChange: (event) => setQuery(event.currentTarget.value),
    onPaste: paste(setQuery),
    onKeyDown(event) { record(event); if (event.key === 'Enter' && event.shiftKey) event.preventDefault(); },
    ref: (node) => { paletteRef.current = node; if (node) window.paletteInput = node; },
  });
  return h(React.Fragment, null,
    h('form', { onSubmit(event) { event.preventDefault(); window.fieldActions.push('form:submit'); } },
      h(TextField, { id: 'text-input', label: 'Text', ref: textRootRef, inputRef: textRef, value: text, onChange: setText, inputProps: inputProps(setText) }),
      h(SearchField, {
        id: 'search-input', label: 'Search', ref: searchRootRef, inputRef: searchRef, value: search,
        onChange(value) { window.fieldActions.push(`change:${value}`); setSearch(value); },
        onSubmit: (value) => window.fieldActions.push(`submit:${value}`),
        inputProps: inputProps(setSearch),
      }),
      h('button', { type: 'submit' }, 'Submit fields')),
    h('button', { id: 'allow-field-keys', onClick: () => setCancelFieldKeys(false) }, 'Allow field shortcuts'),
    h(Button, { ...pointerProps, id: 'pointer-button', ref: buttonRef, onActivate: () => setActivated('button') }, 'Drag action'),
    h(IconButton, { ...pointerProps, id: 'pointer-icon', ref: iconRef, 'aria-label': 'Drag icon', onActivate: () => setActivated('icon') }, 'X'),
    h('output', { id: 'activation' }, activated),
    h('button', { id: 'wrap-palette', onClick: () => setWrapped(true) }, 'Use search field'),
    h(CommandPalette.Root, null,
      h(CommandPalette.Trigger, { id: 'palette-trigger' }, 'Commands'),
      h(CommandPalette.Backdrop, null,
        h(CommandPalette.Popup, { 'aria-label': 'Commands' },
          h(CommandPalette.Title, null, 'Commands'),
          h(CommandPalette.Close, { id: 'palette-close' }),
          h(CommandPalette.Content, null,
            wrapped ? h(CommandPalette.SearchField, null, queryInput) : queryInput,
            query === 'loading' && h('div', { role: 'status' }, 'Loading commands'),
            query === 'none' && h(CommandPalette.Empty, null, 'No commands'),
            h(CommandPalette.ListBox, null, results.map((item) => h(CommandPalette.Item, {
              key: item.id,
              id: item.id,
              title: item.title,
              onActivate: ({ id }) => setActivated(id),
            }))),
            h(CommandPalette.Footer, null, 'Application results'))))));
}

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

test('Bento input and control host contracts in a real browser', { timeout: 90_000 }, async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-input-controls-'));
  const entryPath = fileURLToPath(new URL('bento-input-controls-entry.mjs', import.meta.url));
  const entry = `import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { TextField, SearchField } from '/src/fields.mjs';
import { Button } from '/src/button.mjs';
import { IconButton } from '/src/supplemental/icon-button.mjs';
import { CommandPalette } from '/src/supplemental/command-palette.mjs';
import '/generated/styles.css';
${InputControlsFixture.toString()}
hydrateRoot(document.getElementById('root'), React.createElement(InputControlsFixture));`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root">${renderToString(React.createElement(InputControlsFixture))}</div><script type="module" src="/bento-input-controls-entry.mjs"></script></body></html>`;
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL('../..', import.meta.url)), cacheDir, logLevel: 'error',
    optimizeDeps: { entries: ['src/fields.mjs', 'src/button.mjs', 'src/supplemental/command-palette.mjs'], include: ['react', 'react-dom/client', 'react-aria-components'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'bento-input-controls-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url === '/bento-input-controls.html') {
          response.setHeader('content-type', 'text/html'); response.end(html);
        } else next();
      });
    }, resolveId(id) { if (id === '/bento-input-controls-entry.mjs') return entryPath; }, load(id) { if (id === entryPath) return entry; } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const newPage = async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/bento-input-controls.html`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 10_000 }).catch((error) => {
        throw new Error(`${error.message}\n${errors.join('\n')}`);
      });
      return { page, errors };
    };
    await t.test('fields hydrate with distinct host refs, native events, controlled paste and cursor restoration', async () => {
      const { page, errors } = await newPage();
      try {
        assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(window.hostRefs).map(([key, node]) => [key, node.tagName]))),
          { text: 'INPUT', textRoot: 'DIV', search: 'INPUT', searchRoot: 'DIV', button: 'BUTTON', icon: 'BUTTON' });
        for (const id of ['text-input', 'search-input']) {
          const input = page.locator(`#${id}`);
          await input.focus();
          await input.evaluate((node) => node.setSelectionRange(0, 5));
          await input.evaluate((node) => {
            const clipboardData = new DataTransfer();
            clipboardData.setData('text/plain', 'mux');
            node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
          });
          assert.equal(await input.inputValue(), 'mux beta');
          assert.deepEqual(await input.evaluate((node) => [node.selectionStart, node.selectionEnd]), [3, 3]);
          await input.press('ArrowRight');
          await input.press('Z');
          assert.equal(await input.inputValue(), 'mux Zbeta');
          await input.blur();
          assert.match(await input.getAttribute('class'), /muxui-field-input consumer-input/u);
          const events = await page.evaluate((id) => window.inputEvents.filter((event) => event.id === id).map((event) => event.type), id);
          for (const type of ['focus', 'paste', 'keydown', 'select', 'blur']) assert.ok(events.includes(type), `${id}: ${type}`);
        }
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
    await t.test('field keyboard handlers cancel submit and clear while normal and composing keys retain native behavior', async () => {
      const { page, errors } = await newPage();
      try {
        const textInput = page.locator('#text-input');
        const searchInput = page.locator('#search-input');
        await textInput.press('Enter');
        await searchInput.press('Enter');
        await searchInput.press('Escape');
        assert.deepEqual(await page.evaluate(() => window.fieldActions), [
          'native:text-input:Enter', 'native:search-input:Enter', 'native:search-input:Escape',
        ]);
        assert.equal(await searchInput.inputValue(), 'alpha beta');

        await page.locator('#allow-field-keys').click();
        await searchInput.focus();
        await searchInput.evaluate((node) => {
          window.fieldActions = [];
          node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
          for (const key of ['Enter', 'Escape']) {
            node.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
            node.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, isComposing: true, bubbles: true }));
          }
          node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
        });
        assert.deepEqual(await page.evaluate(() => window.fieldActions), ['native:search-input:Enter', 'native:search-input:Escape']);
        assert.equal(await searchInput.inputValue(), 'alpha beta');

        await page.evaluate(() => { window.fieldActions = []; });
        await searchInput.press('Enter');
        await searchInput.press('Escape');
        assert.deepEqual(await page.evaluate(() => window.fieldActions), [
          'native:search-input:Enter', 'submit:alpha beta', 'native:search-input:Escape', 'change:',
        ]);
        assert.equal(await searchInput.inputValue(), '');
        await page.evaluate(() => { window.fieldActions = []; });
        await textInput.press('Enter');
        assert.deepEqual(await page.evaluate(() => window.fieldActions), ['native:text-input:Enter', 'form:submit']);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
    await t.test('buttons deliver native pointer capture, cancellation, auxiliary click and context menu events', async () => {
      const { page, errors } = await newPage();
      try {
        for (const id of ['pointer-button', 'pointer-icon']) {
          const button = page.locator(`#${id}`);
          const box = await button.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          const pointerId = await page.evaluate((id) => window.inputEvents.findLast((event) => event.id === id && event.type === 'pointerdown')?.pointerId, id);
          assert.equal(typeof pointerId, 'number', `${id}: pointerdown reaches the native host`);
          assert.equal(await button.evaluate((node, id) => node.hasPointerCapture(id), pointerId), true);
          await page.mouse.move(box.x + box.width + 150, box.y + box.height + 100);
          await page.mouse.up();
          assert.equal(await button.evaluate((node, id) => node.hasPointerCapture(id), pointerId), false);
          await button.dispatchEvent('pointercancel', { pointerId, pointerType: 'mouse', bubbles: true });
          await button.click({ button: 'middle' });
          await button.click({ button: 'right' });
          const events = await page.evaluate((id) => window.inputEvents.filter((event) => event.id === id), id);
          for (const type of ['pointerdown', 'gotpointercapture', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'auxclick', 'contextmenu']) {
            assert.ok(events.some((event) => event.type === type && event.tag === 'BUTTON'), `${id}: ${type}`);
          }
          await button.focus();
          await button.press('Enter');
          assert.equal(await page.locator('#activation').textContent(), id === 'pointer-button' ? 'button' : 'icon');
        }
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
    for (const wrapped of [false, true]) await t.test(`palette ${wrapped ? 'SearchField' : 'direct Input'} keeps controlled query, external states, safe activation and reopen focus`, async () => {
      const { page, errors } = await newPage();
      try {
        const trigger = page.locator('#palette-trigger');
        if (wrapped) await page.locator('#wrap-palette').click();
        await trigger.click();
        const input = page.locator('#palette-input');
        await input.waitFor();
        assert.equal(await input.evaluate((node) => node === window.paletteInput && node === document.activeElement), true);
        assert.match(await input.getAttribute('class'), /muxui-command-palette__input consumer-command-input/u);
        await input.fill('loading');
        assert.equal(await page.locator('.muxui-command-palette__content [role="status"]').textContent(), 'Loading commands');
        await input.fill('none');
        assert.equal(await page.locator('.muxui-command-palette__empty').textContent(), 'No commands');
        await input.fill('query');
        assert.equal(await page.getByRole('option', { name: 'External result' }).count(), 1);
        await input.evaluate((node) => {
          node.setSelectionRange(0, 5);
          const clipboardData = new DataTransfer();
          clipboardData.setData('text/plain', 'pasted query');
          node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
        });
        assert.equal(await input.inputValue(), 'pasted query');
        assert.deepEqual(await input.evaluate((node) => [node.selectionStart, node.selectionEnd]), [12, 12]);
        await input.press('ArrowDown');
        await page.waitForFunction(() => document.querySelector('#palette-input')?.getAttribute('aria-activedescendant'));
        await input.press('Shift+Enter');
        assert.equal(await page.locator('#activation').textContent(), '');
        await input.evaluate((node) => {
          node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
          node.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true }));
          node.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter', isComposing: true }));
        });
        assert.equal(await page.locator('#activation').textContent(), '');
        assert.equal(await input.count(), 1);
        await input.evaluate((node) => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'query' })));
        if (wrapped) await page.locator('#palette-close').click();
        else await input.press('Escape');
        await input.waitFor({ state: 'detached' });
        await page.waitForFunction(() => document.activeElement?.id === 'palette-trigger');
        await trigger.press('Enter');
        await input.waitFor();
        assert.equal(await input.evaluate((node) => node === document.activeElement), true);
        assert.equal(await input.inputValue(), 'pasted query');
        await input.press('ArrowDown');
        await input.press('Enter');
        assert.equal(await page.locator('#activation').textContent(), 'external');
        await input.waitFor({ state: 'detached' });
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

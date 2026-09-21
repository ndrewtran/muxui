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
import { Dialog, Popover, Tooltip, PreviewTrigger } from '../../src/overlays.mjs';
import { AlertDialog } from '../../src/supplemental/index.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

function StatefulPopoverContent() {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    window.consumerMounts += 1;
    return () => { window.consumerUnmounts += 1; };
  }, []);
  return React.createElement(React.Fragment, null,
    React.createElement('input', { id: 'draft', 'aria-label': 'Draft', defaultValue: 'Initial draft' }),
    React.createElement('button', { id: 'inside', onClick: () => setCount((value) => value + 1) }, `Count ${count}`));
}

function OverlayFixture() {
  const h = React.createElement;
  const [config, setConfig] = React.useState({ kind: 'none', run: 0 });
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);
  React.useEffect(() => {
    window.configureOverlay = (value) => { setOpen(false); setConfig((previous) => ({ run: previous.run + 1, ...value })); };
    window.setOverlayModal = (modal) => setConfig((previous) => ({ ...previous, modal }));
    window.setOverlayDismissable = (dismissable) => setConfig((previous) => ({ ...previous, dismissable }));
    document.documentElement.dataset.ready = 'true';
  }, []);
  const onOpenChange = (value) => {
    window.openChanges.push(value);
    if (!config.rejectClose || value) setOpen(value);
  };
  const trigger = h('button', { id: 'trigger', style: { position: 'fixed', left: 360, top: config.nearEdge ? 590 : 280, width: 100, height: 40 } }, 'Open overlay');
  const geometry = { placement: config.placement, offset: config.offset ?? 8, crossOffset: config.crossOffset ?? 0,
    containerPadding: config.containerPadding ?? 12, shouldFlip: config.shouldFlip ?? false,
    anchorRef: config.anchor ? anchorRef : undefined };
  let overlay;
  if (config.kind === 'popover') overlay = h(Popover, { ...geometry, trigger, modal: config.modal ?? true, dismissable: config.dismissable ?? true,
    'aria-label': 'Popover details', onOpenChange, className: 'consumer-popup' }, config.stateful ? h(StatefulPopoverContent) : h('button', { id: 'inside' }, 'Inside action'));
  if (config.kind === 'tooltip') overlay = h(Tooltip, { ...geometry, trigger, delay: 0, content: 'Helpful description', onOpenChange });
  if (config.kind === 'preview') overlay = h(PreviewTrigger, { placement: config.placement, trigger, delay: 0, closeDelay: 0, 'aria-label': 'Preview details' }, 'Preview content');
  if (config.kind === 'dialog') overlay = h(Dialog, {
    trigger, title: 'Review changes', description: 'These changes will be saved.', actions: h('button', { id: 'save' }, 'Save changes'),
    'aria-describedby': 'external-description', dismissable: config.dismissable ?? true, open, onOpenChange,
    backdropClassName: 'consumer-backdrop', panelClassName: config.frameless ? 'consumer-frameless' : 'consumer-panel',
    contentClassName: 'consumer-content', actionsClassName: 'consumer-actions', closeClassName: 'consumer-close',
  }, h('input', { id: 'first', 'aria-label': 'Name' }), h('button', { id: 'second' }, 'Second action'));
  if (config.kind === 'alert') overlay = h(AlertDialog.Root, { open, onOpenChange },
    h(AlertDialog.Trigger, { id: 'trigger' }, 'Delete item'),
    h(AlertDialog.Backdrop, { className: 'consumer-alert-backdrop' }, h(AlertDialog.Popup, { className: 'consumer-alert-popup' },
      h(AlertDialog.Content, { 'aria-describedby': 'external-description', className: 'consumer-alert-content' },
        h(AlertDialog.Title, null, 'Delete item?'),
        h(AlertDialog.Description, null, 'This cannot be undone.'),
        h(AlertDialog.Actions, { className: 'consumer-alert-actions' },
          h(AlertDialog.Close, { id: 'cancel' }, 'Cancel'), h('button', { id: 'delete' }, 'Delete'))))));
  return h(React.Fragment, null,
    h('button', { id: 'outside', style: { position: 'fixed', top: 20, left: 20 } }, 'Outside action'),
    h('p', { id: 'external-description' }, 'Additional context.'),
    h('div', { ref: anchorRef, id: 'anchor', style: { position: 'fixed', left: 180, top: 180, width: 140, height: 30 } }, 'Known anchor'),
    h('div', { id: 'fixture', 'data-run': config.run, key: config.run }, overlay));
}

const fixtureCss = `
  body { margin: 0; }
  .muxui-popover, .muxui-tooltip, .muxui-preview-trigger { box-sizing: border-box; width: 180px; height: 80px; }
  .muxui-popover-positioner[data-placement='bottom'] .muxui-popover { margin-block-start: 0; }
  .muxui-dialog, .muxui-dialog-backdrop, .muxui-alert-dialog__popup, .muxui-tooltip, .muxui-preview-trigger { transition: none; }
  .consumer-frameless { background: transparent; border: 0; box-shadow: none; padding: 0; }
`;

async function withFixture(run, direction = 'ltr') {
  const html = `<!doctype html><html dir="${direction}" lang="${direction === 'rtl' ? 'ar' : 'en'}"><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root">${renderToString(React.createElement(OverlayFixture))}</div><script type="module" src="/overlay-fixture.mjs"></script></body></html>`;
  const entry = `import React from 'react';
    import { hydrateRoot } from 'react-dom/client';
    import { Dialog, Popover, Tooltip, PreviewTrigger } from '/packages/react/src/overlays.mjs';
    import { AlertDialog } from '/packages/react/src/supplemental/index.mjs';
    import '/packages/react/generated/styles.css';
    import '/packages/react/src/styles/overlays.css';
    ${StatefulPopoverContent.toString()}
    ${OverlayFixture.toString()}
    window.openChanges = [];
    window.consumerMounts = 0;
    window.consumerUnmounts = 0;
    const style = document.createElement('style'); style.textContent = ${JSON.stringify(fixtureCss)}; document.head.append(style);
    const root = hydrateRoot(document.getElementById('root'), React.createElement(OverlayFixture));
    window.unmountFixture = () => root.unmount();`;
  const virtualEntry = fileURLToPath(new URL('./bento-overlays-fixture.mjs', import.meta.url));
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-overlay-vite-'));
  const server = await createServer({
    cacheDir,
    resolve: { alias: { 'react-dom': fileURLToPath(new URL('../../node_modules/react-dom', import.meta.url)), react: fileURLToPath(new URL('../../node_modules/react', import.meta.url)) } },
    configFile: false, root: repositoryRoot, logLevel: 'error',
    optimizeDeps: { entries: ['packages/react/src/overlays.mjs', 'packages/react/src/supplemental/index.mjs'], include: ['react', 'react-dom/client'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'bento-overlay-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url === '/overlay-fixture.html') { response.setHeader('content-type', 'text/html'); response.end(html); }
        else next();
      });
    }, resolveId(id) { if (id === '/overlay-fixture.mjs') return virtualEntry; }, load(id) { if (id === virtualEntry) return entry; } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ locale: direction === 'rtl' ? 'ar-EG' : 'en-US', viewport: { width: 900, height: 640 } });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/overlay-fixture.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true').catch((error) => { throw new Error(`${error.message}\n${errors.join('\n')}`); });
    await run(page);
    await page.evaluate(() => window.unmountFixture());
    assert.equal(await page.locator('.muxui-popover-positioner, .muxui-tooltip, .muxui-dialog-backdrop, .muxui-alert-dialog__backdrop').count(), 0);
    assert.equal(await page.locator('#root').getAttribute('inert'), null);
    assert.equal(await page.locator('#root').getAttribute('aria-hidden'), null);
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally { await browser?.close(); await server.close(); await rm(cacheDir, { recursive: true, force: true }); }
}

async function configure(page, config) {
  const previous = await page.locator('#fixture').getAttribute('data-run');
  await page.evaluate((value) => { window.openChanges = []; window.configureOverlay(value); }, config);
  await page.waitForFunction((previous) => document.querySelector('#fixture')?.dataset.run !== previous, previous);
  await page.locator('#trigger').waitFor();
}

function near(actual, expected, message) { assert.ok(Math.abs(actual - expected) < 1.5, `${message}: ${actual} ≠ ${expected}`); }

async function waitForOverlayMotionSettled(page, selector) {
  await page.waitForFunction((value) => {
    const node = document.querySelector(value);
    if (!node) return false;
    const style = getComputedStyle(node);
    return Number(style.opacity) >= 0.999 && /^(?:none|0px(?: 0px)?)$/u.test(style.translate);
  }, selector);
}

function assertPlacement(box, anchor, placement, offset, crossOffset, rtl) {
  const [logicalSide, alignment] = placement.split('-');
  const side = logicalSide === 'start' ? (rtl ? 'right' : 'left') : logicalSide === 'end' ? (rtl ? 'left' : 'right') : logicalSide;
  if (side === 'top') near(box.y + box.height, anchor.y - offset, placement);
  if (side === 'bottom') near(box.y, anchor.y + anchor.height + offset, placement);
  if (side === 'left') near(box.x + box.width, anchor.x - offset, placement);
  if (side === 'right') near(box.x, anchor.x + anchor.width + offset, placement);
  if (side === 'top' || side === 'bottom') {
    const alignRight = alignment === (rtl ? 'start' : 'end');
    const x = alignment ? (alignRight ? anchor.x + anchor.width - box.width : anchor.x) : anchor.x + (anchor.width - box.width) / 2;
    near(box.x, x + crossOffset, `${placement} horizontal alignment`);
  } else {
    const y = alignment ? (alignment === 'bottom' ? anchor.y + anchor.height - box.height : anchor.y) : anchor.y + (anchor.height - box.height) / 2;
    near(box.y, y + crossOffset, `${placement} vertical alignment`);
  }
}

test('anchored overlays position on every logical alignment, use independent anchors, and flip at viewport edges', { timeout: 90_000 }, async () => {
  for (const direction of ['ltr', 'rtl']) await withFixture(async (page) => {
    const placements = ['top', 'bottom', 'start', 'end', 'top-start', 'top-end', 'bottom-start', 'bottom-end', 'start-top', 'start-bottom', 'end-top', 'end-bottom'];
    for (const placement of placements) {
        await configure(page, { kind: 'popover', placement, offset: 11, crossOffset: 3 });
        await page.locator('#trigger').click();
        const popup = page.locator('.muxui-popover-positioner');
        await popup.waitFor();
        await page.waitForFunction(() => document.querySelector('.muxui-popover-positioner')?.hasAttribute('data-placement'));
        await waitForOverlayMotionSettled(page, '.muxui-popover-positioner');
        assertPlacement(await popup.boundingBox(), await page.locator('#trigger').boundingBox(), placement, 11, 3, direction === 'rtl');
        await page.keyboard.press('Escape');
        await popup.waitFor({ state: 'detached' });
    }
    if (direction === 'rtl') return;
    for (const kind of ['popover', 'tooltip']) {
      await configure(page, { kind, placement: 'bottom-end', offset: 6, anchor: true });
      if (kind === 'popover') await page.locator('#trigger').click();
      else { await page.locator('#outside').focus(); await page.keyboard.press('Tab'); }
      const selector = kind === 'popover' ? '.muxui-popover-positioner' : '.muxui-tooltip';
      await page.locator(selector).waitFor();
      await page.waitForFunction((selector) => document.querySelector(selector)?.hasAttribute('data-placement'), selector);
      if (kind === 'popover') await waitForOverlayMotionSettled(page, selector);
      assertPlacement(await page.locator(selector).boundingBox(), await page.locator('#anchor').boundingBox(), 'bottom-end', 6, 0, false);
      if (kind === 'tooltip') {
        assert.equal(await page.locator('#trigger').getAttribute('aria-describedby'), await page.locator(selector).getAttribute('id'));
        assert.equal(await page.locator('#trigger').evaluate((node) => document.activeElement === node), true);
      }
      await page.keyboard.press('Escape');
      await page.locator(selector).waitFor({ state: 'detached' });
    }
    await configure(page, { kind: 'popover', placement: 'bottom-start', shouldFlip: true, nearEdge: true, containerPadding: 20 });
    await page.locator('#trigger').click();
    await page.waitForFunction(() => document.querySelector('.muxui-popover-positioner')?.dataset.placement === 'top');
    await waitForOverlayMotionSettled(page, '.muxui-popover-positioner');
    const box = await page.locator('.muxui-popover-positioner').boundingBox();
    const anchor = await page.locator('#trigger').boundingBox();
    near(box.y + box.height, anchor.y - 8, 'flipped top gap');
    assert.ok(box.y >= 20 && box.y + box.height <= 620);
    await page.keyboard.press('Escape');
    await configure(page, { kind: 'popover', placement: 'bottom-start', shouldFlip: false, nearEdge: true });
    await page.locator('#trigger').click();
    await page.waitForFunction(() => document.querySelector('.muxui-popover-positioner')?.dataset.placement === 'bottom');
    await waitForOverlayMotionSettled(page, '.muxui-popover-positioner');
    await page.keyboard.press('Escape');
    await configure(page, { kind: 'preview', placement: 'end-bottom' });
    await page.locator('#outside').focus();
    await page.keyboard.press('Tab');
    await page.locator('.muxui-preview-trigger').waitFor();
    assertPlacement(await page.locator('.muxui-preview-trigger').boundingBox(), await page.locator('#trigger').boundingBox(), 'end-bottom', 8, 0, false);
  }, direction);
});

test('nonmodal Popover preserves outside interaction and respects dismissal policy', { timeout: 60_000 }, async () => {
  await withFixture(async (page) => {
    await configure(page, { kind: 'popover', placement: 'bottom', modal: false, dismissable: false });
    await page.locator('#trigger').click();
    const popup = page.locator('.muxui-popover-positioner');
    await popup.waitFor();
    assert.equal(await popup.getAttribute('data-modal'), 'false');
    assert.equal(await page.locator('#root').getAttribute('inert'), null);
    assert.equal(await page.locator('#root').getAttribute('aria-hidden'), null);
    assert.equal(await page.locator('#trigger').evaluate((node) => document.activeElement === node), true);
    assert.equal(await page.locator('#trigger').getAttribute('aria-controls'), await page.getByRole('dialog').getAttribute('id'));
    await page.locator('#inside').focus();
    await page.locator('#outside').focus();
    assert.equal(await page.locator('#outside').evaluate((node) => document.activeElement === node), true);
    await page.locator('#inside').focus();
    await page.keyboard.press('Escape');
    assert.equal(await popup.count(), 1);
    await page.locator('#outside').click();
    assert.equal(await popup.count(), 1);
    await configure(page, { kind: 'popover', placement: 'bottom', modal: false });
    await page.locator('#trigger').click();
    await page.locator('#inside').focus();
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    await page.locator('#trigger').click();
    await page.locator('#inside').focus();
    await page.locator('#outside').click();
    await popup.waitFor({ state: 'detached' });
    await configure(page, { kind: 'popover', placement: 'bottom', dismissable: false });
    await page.locator('#trigger').click();
    await popup.waitFor();
    await page.evaluate(() => window.setOverlayModal(false));
    await page.waitForFunction(() => document.querySelector('.muxui-popover-positioner')?.dataset.modal === 'false');
    await page.locator('#inside').focus();
    await page.locator('#outside').focus();
    assert.equal(await page.locator('#outside').evaluate((node) => document.activeElement === node), true, 'switching to non-modal releases the prior focus scope');
  });
});

test('Popover modality changes preserve consumer state and DOM identity while containment changes', { timeout: 60_000 }, async () => {
  await withFixture(async (page) => {
    await configure(page, { kind: 'popover', stateful: true, dismissable: false });
    const popup = page.locator('.muxui-popover-positioner');
    const surface = page.locator('.muxui-popover');
    await page.locator('#trigger').focus();
    await page.keyboard.press('Enter');
    await popup.waitFor();
    assert.equal(await surface.evaluate((node) => document.activeElement === node), true, 'modal open focuses the dialog surface');
    assert.equal(await page.locator('#trigger').getAttribute('aria-controls'), await surface.getAttribute('id'));
    await page.locator('#draft').fill('Unsaved draft');
    await page.locator('#inside').click();
    await page.locator('#inside').click();
    await page.evaluate(() => {
      window.originalDraft = document.querySelector('#draft');
      window.originalSurface = document.querySelector('.muxui-popover');
    });
    const assertPreserved = async () => {
      assert.equal(await page.locator('#draft').inputValue(), 'Unsaved draft');
      assert.equal(await page.locator('#inside').textContent(), 'Count 2');
      assert.deepEqual(await page.evaluate(() => ({
        sameDraft: window.originalDraft === document.querySelector('#draft'),
        sameSurface: window.originalSurface === document.querySelector('.muxui-popover'),
        mounts: window.consumerMounts,
        unmounts: window.consumerUnmounts,
      })), { sameDraft: true, sameSurface: true, mounts: 1, unmounts: 0 });
    };
    await page.evaluate(() => window.setOverlayModal(false));
    await page.waitForFunction(() => document.querySelector('.muxui-popover-positioner')?.dataset.modal === 'false');
    await assertPreserved();
    await page.locator('#outside').focus();
    assert.equal(await page.locator('#outside').evaluate((node) => document.activeElement === node), true);
    assert.equal(await page.locator('#root').evaluate((node) => node.inert || node.getAttribute('aria-hidden') === 'true'), false);

    await page.evaluate(() => window.setOverlayModal(true));
    await page.waitForFunction(() => document.querySelector('.muxui-popover-positioner')?.dataset.modal === 'true');
    await assertPreserved();
    assert.equal(await surface.evaluate((node) => document.activeElement === node), true, 'reentering modal mode brings outside focus into the existing surface');
    assert.equal(await page.locator('#root').evaluate((node) => node.inert || node.getAttribute('aria-hidden') === 'true'), true);
    await page.locator('#inside').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#draft').evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#inside').evaluate((node) => document.activeElement === node), true);
    await page.evaluate(() => window.setOverlayModal(false));
    await page.waitForFunction(() => document.querySelector('.muxui-popover-positioner')?.dataset.modal === 'false');
    await assertPreserved();
    assert.equal(await page.locator('#inside').evaluate((node) => document.activeElement === node), true, 'releasing containment preserves focus within the existing content');
    await page.evaluate(() => window.setOverlayDismissable(true));
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'trigger');
    assert.equal(await page.evaluate(() => window.consumerUnmounts), 1);

    await configure(page, { kind: 'popover', stateful: true, modal: false });
    await page.locator('#trigger').focus();
    await page.keyboard.press('Enter');
    await popup.waitFor();
    assert.equal(await page.locator('#trigger').evaluate((node) => document.activeElement === node), true, 'keyboard-open nonmodal popover keeps trigger focus');
    await page.locator('#inside').focus();
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'trigger');
    assert.deepEqual(await page.evaluate(() => [window.consumerMounts, window.consumerUnmounts]), [2, 2]);
  });
});

test('Dialog and AlertDialog retain focus entry, containment, controlled dismissal, return, and customizable parts', { timeout: 60_000 }, async () => {
  await withFixture(async (page) => {
    await page.evaluate(() => {
      window.focusDescriptions = [];
      document.addEventListener('focusin', (event) => {
        const dialog = event.target.closest('[role="dialog"], [role="alertdialog"]');
        if (dialog) window.focusDescriptions.push(dialog.getAttribute('aria-describedby')?.split(/\s+/u).map((id) => document.getElementById(id)?.textContent));
      });
    });
    for (const kind of ['dialog', 'alert']) {
      await configure(page, { kind });
      await page.evaluate(() => { window.focusDescriptions = []; });
      await page.locator('#trigger').focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole(kind === 'alert' ? 'alertdialog' : 'dialog');
      await dialog.waitFor();
      assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true);
      assert.equal(await page.locator('#root').evaluate((node) => node.inert || node.getAttribute('aria-hidden') === 'true'), true);
      const descriptions = await dialog.evaluate((node) => node.getAttribute('aria-describedby').split(/\s+/u).map((id) => document.getElementById(id)?.textContent));
      assert.deepEqual(descriptions, ['Additional context.', kind === 'alert' ? 'This cannot be undone.' : 'These changes will be saved.']);
      assert.deepEqual(await page.evaluate(() => window.focusDescriptions[0]), descriptions, 'description is associated when focus first enters');
      const first = page.locator(kind === 'alert' ? '#cancel' : '#first');
      const last = page.locator(kind === 'alert' ? '#delete' : '.muxui-dialog-close');
      await last.focus();
      await page.keyboard.press('Tab');
      assert.equal(await first.evaluate((node) => document.activeElement === node), true, 'Tab wraps to the first control');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await last.evaluate((node) => document.activeElement === node), true, 'Shift+Tab wraps to the last control');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.activeElement?.id === 'trigger');
      assert.deepEqual(await page.evaluate(() => window.openChanges), [true, false]);
    }
    await configure(page, { kind: 'dialog', dismissable: false, frameless: true });
    await page.locator('#trigger').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 620);
    assert.equal(await dialog.count(), 1);
    assert.equal(await page.locator('.muxui-dialog-close').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.openChanges), [true]);
    assert.equal(await dialog.evaluate((node) => getComputedStyle(node).boxShadow), 'none');
    assert.equal(await page.locator('.muxui-dialog-actions.consumer-actions').count(), 1);
    await configure(page, { kind: 'dialog', rejectClose: true });
    await page.locator('#trigger').click();
    await dialog.waitFor();
    await page.locator('.muxui-dialog-close').click();
    assert.equal(await dialog.count(), 1);
    assert.deepEqual(await page.evaluate(() => window.openChanges), [true, false]);
    await configure(page, { kind: 'dialog' });
    await page.locator('#trigger').click();
    await dialog.waitFor();
    await page.locator('.muxui-dialog-close').click();
    await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'trigger');
  });
});

import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { recordFrames } from '../fixtures/frame-recorder.mjs';
import { GridListMotionFixture } from '../fixtures/grid-list-motion-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const packageRoot = resolve(repositoryRoot, 'packages/react');

async function chromePath() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

async function startServer() {
  const markup = renderToString(React.createElement(GridListMotionFixture));
  assert.doesNotMatch(markup, /data-muxui-grid-list-motion-ready|data-muxui-grid-list-hover/u);
  const html = `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/collections.css"><style>:root { --muxui-semantic-motion-state-transition-duration: 320ms; --muxui-semantic-motion-state-transition-spring-visual-duration: 320ms; }</style></head><body style="margin:32px;background:var(--muxui-semantic-surface-canvas);color:var(--muxui-semantic-content-strong)"><div id="root">${markup}</div><script type="module" src="/test/fixtures/grid-list-motion-browser-entry.mjs"></script></body></html>`;
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-grid-list-motion-vite-'));
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    cacheDir,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['test/fixtures/grid-list-motion-browser-entry.mjs'], include: ['react', 'react-dom/client', 'react-aria-components', 'motion/react'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'grid-list-motion-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url === '/grid-list-motion.html') {
          response.setHeader('content-type', 'text/html');
          response.end(html);
          return;
        }
        next();
      });
    } }],
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.equal(typeof address, 'object');
  assert.ok(address?.port);
  return { server, cacheDir, url: `http://127.0.0.1:${address.port}/grid-list-motion.html` };
}

async function rowRect(page, label) {
  const row = page.getByRole('row', { name: label, exact: true });
  await row.scrollIntoViewIfNeeded();
  const rect = await row.boundingBox();
  assert.ok(rect, `${label} row should be visible`);
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

async function layerRect(page, selector) {
  return page.locator(`${selector} .muxui-grid-list-hover`).evaluate((layer) => {
    const rect = layer.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      opacity: Number(getComputedStyle(layer).opacity), display: getComputedStyle(layer).display };
  });
}

async function moveToRow(page, label) {
  const rect = await rowRect(page, label);
  await page.mouse.move(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
  return rect;
}

async function waitForLayerAlignment(page, selector, label) {
  await page.waitForFunction(({ listSelector, rowLabel }) => {
    const root = document.querySelector(listSelector);
    const row = [...(root?.querySelectorAll('[role="row"]') ?? [])]
      .find((item) => item.textContent.trim() === rowLabel);
    const layer = root?.querySelector('.muxui-grid-list-hover');
    if (!row || !layer) return false;
    const a = row.getBoundingClientRect();
    const b = layer.getBoundingClientRect();
    return Math.abs(a.left - b.left) < 0.75 && Math.abs(a.top - b.top) < 0.75
      && Math.abs(a.width - b.width) < 0.75 && Math.abs(a.height - b.height) < 0.75;
  }, { listSelector: selector, rowLabel: label });
}

test('GridList hover overlay travels between rows and falls back for motion preferences', { timeout: 90_000 }, async () => {
  const { server, cacheDir, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.gridListMotionHydrated === 'true');
    assert.deepEqual(errors, []);

    const primary = '#primary-list';
    const layer = page.locator(`${primary} .muxui-grid-list-hover`);
    await moveToRow(page, 'One');
    await page.waitForFunction((selector) => Number(getComputedStyle(document.querySelector(selector)).opacity) >= 0.99, `${primary} .muxui-grid-list-hover`);
    const first = await layerRect(page, primary);
    assert.equal(await layer.getAttribute('aria-hidden'), 'true');
    assert.equal(await layer.evaluate((node) => getComputedStyle(node).pointerEvents), 'none');
    assert.ok(Math.abs(first.top - (await rowRect(page, 'One')).top) < 0.75);

    const travelRecording = await recordFrames(page, (selector) => {
      const rect = document.querySelector(`${selector} .muxui-grid-list-hover`)?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
    }, primary);
    const target = await moveToRow(page, 'Two');
    await waitForLayerAlignment(page, primary, 'Two');
    const travelFrames = await travelRecording.stop();
    const middle = travelFrames.find(({ top }) => top > Math.min(first.top, target.top) + 0.75 && top < Math.max(first.top, target.top) - 0.75);
    assert.ok(middle && middle.top > Math.min(first.top, target.top) + 0.75
      && middle.top < Math.max(first.top, target.top) - 0.75,
    `overlay should be between rows during travel: ${JSON.stringify({ first, travelFrames, target })}`);
    assert.deepEqual(errors, []);

    await page.mouse.move(800, 580);
    await page.waitForFunction((selector) => Number(getComputedStyle(document.querySelector(selector)).opacity) < 0.01, `${primary} .muxui-grid-list-hover`);
    await moveToRow(page, 'Selected');
    await page.waitForTimeout(150);
    const selected = await page.getByRole('row', { name: 'Selected', exact: true }).evaluate((row) => ({
      selected: row.getAttribute('aria-selected'),
      background: getComputedStyle(row).backgroundColor,
    }));
    assert.equal(selected.selected, 'true');
    assert.notEqual(selected.background, 'rgba(0, 0, 0, 0)');
    assert.ok((await layerRect(page, primary)).opacity < 0.01);

    await moveToRow(page, 'Disabled');
    await page.waitForTimeout(150);
    assert.equal(await page.getByRole('row', { name: 'Disabled', exact: true }).getAttribute('aria-disabled'), 'true');
    assert.ok((await layerRect(page, primary)).opacity < 0.01);

    await moveToRow(page, 'One');
    await page.waitForFunction((selector) => Number(getComputedStyle(document.querySelector(selector)).opacity) >= 0.99, `${primary} .muxui-grid-list-hover`);
    const secondary = '#secondary-list';
    await moveToRow(page, 'Secondary One');
    await page.waitForFunction((selector) => Number(getComputedStyle(document.querySelector(selector)).opacity) >= 0.99, `${secondary} .muxui-grid-list-hover`);
    await page.waitForFunction((selector) => Number(getComputedStyle(document.querySelector(selector)).opacity) < 0.01, `${primary} .muxui-grid-list-hover`);

    await page.evaluate(() => document.documentElement.setAttribute('data-reduced-motion', 'true'));
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector);
      return root?.hasAttribute('data-muxui-grid-list-motion-reduced')
        && !root.hasAttribute('data-muxui-grid-list-motion-ready');
    }, secondary);
    await moveToRow(page, 'Secondary Two');
    await page.waitForFunction(() => document.querySelector('#secondary-list [role="row"][data-hovered]'));
    assert.equal(await page.getByRole('row', { name: 'Secondary Two', exact: true }).evaluate((row) => getComputedStyle(row).backgroundImage.includes('linear-gradient')), true);

    await page.evaluate(() => document.documentElement.removeAttribute('data-reduced-motion'));
    await page.waitForFunction((selector) => document.querySelector(selector)?.hasAttribute('data-muxui-grid-list-motion-ready'), secondary);
    await waitForLayerAlignment(page, secondary, 'Secondary Two');

    await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      root.style.setProperty('--muxui-semantic-motion-state-transition-duration', '0ms');
      root.style.setProperty('--muxui-semantic-motion-state-transition-spring-visual-duration', '0ms');
      root.style.setProperty('--muxui-semantic-motion-state-duration', '0ms');
    }, secondary);
    const offTarget = await moveToRow(page, 'Secondary One');
    const immediate = await layerRect(page, secondary);
    assert.ok(Math.abs(immediate.top - offTarget.top) < 0.75, 'zero-duration motion should place the overlay immediately');

    await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      root.style.setProperty('--muxui-semantic-motion-state-transition-duration', '120ms');
      root.style.setProperty('--muxui-semantic-motion-state-transition-spring-visual-duration', '120ms');
    }, primary);
    const oneRow = page.locator(`${primary} [role="row"]`).first();
    await oneRow.scrollIntoViewIfNeeded();
    const oneRect = await oneRow.boundingBox();
    assert.ok(oneRect);
    const pressPoint = { x: oneRect.x + oneRect.width * 0.28, y: oneRect.y + oneRect.height * 0.58 };
    await page.mouse.move(pressPoint.x, pressPoint.y);
    const sampleRipple = (selector) => {
      const node = document.querySelector(`${selector} .muxui-grid-list-ripple`);
      if (!node) return null;
      const style = getComputedStyle(node);
      return { scale: new DOMMatrixReadOnly(style.transform).a, opacity: Number(style.opacity) };
    };
    const expandRecording = await recordFrames(page, sampleRipple, primary);
    await page.mouse.down();
    const ripple = page.locator(`${primary} .muxui-grid-list-ripple`);
    await ripple.waitFor({ state: 'attached' });
    const initialRipple = await ripple.evaluate((node) => {
      const row = node.closest('[role="row"]');
      const rect = row.getBoundingClientRect();
      const host = node.parentElement;
      return {
        left: Number.parseFloat(node.style.left),
        top: Number.parseFloat(node.style.top),
        rowWidth: rect.width,
        rowHeight: rect.height,
        opacity: Number(getComputedStyle(node).opacity),
        hidden: host.getAttribute('aria-hidden'),
        pointerEvents: getComputedStyle(host).pointerEvents,
      };
    });
    assert.ok(Math.abs(initialRipple.left - (pressPoint.x - oneRect.x)) < 1);
    assert.ok(Math.abs(initialRipple.top - (pressPoint.y - oneRect.y)) < 1);
    assert.equal(initialRipple.opacity, 0.08);
    assert.equal(initialRipple.hidden, 'true');
    assert.equal(initialRipple.pointerEvents, 'none');
    await expandRecording.waitFor(({ frames }) => frames.some(({ scale }) => scale > 0 && scale < 1), { timeout: 2_000 });
    const expandFrames = await expandRecording.stop();
    const scale = expandFrames.find((frame) => frame.scale > 0 && frame.scale < 1)?.scale;
    assert.ok(scale > 0 && scale < 1, `ripple should be expanding: ${JSON.stringify(expandFrames)}`);
    const fadeRecording = await recordFrames(page, sampleRipple, primary);
    await page.mouse.up();
    await page.waitForFunction((selector) => document.querySelectorAll(`${selector} .muxui-grid-list-ripple`).length === 0, primary);
    const fadeFrames = await fadeRecording.stop();
    const fadingOpacity = fadeFrames.find(({ opacity }) => opacity > 0 && opacity < 0.08)?.opacity;
    assert.ok(fadingOpacity > 0 && fadingOpacity < 0.08, `released ripple should fade: ${JSON.stringify(fadeFrames)}`);

    const selectedRow = page.locator(`${primary} [role="row"][aria-selected="true"]`);
    await selectedRow.scrollIntoViewIfNeeded();
    await selectedRow.click();
    assert.equal(await selectedRow.getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator(`${primary} .muxui-grid-list-ripple`).count(), 1);
    await page.waitForFunction((selector) => document.querySelectorAll(`${selector} .muxui-grid-list-ripple`).length === 0, primary);

    await oneRow.evaluate((row) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'Independent row action');
      button.textContent = '⋯';
      Object.assign(button.style, { position: 'absolute', right: '4px', top: '4px', zIndex: '3' });
      row.append(button);
    });
    await page.getByRole('button', { name: 'Independent row action' }).click();
    assert.equal(await page.locator(`${primary} .muxui-grid-list-ripple`).count(), 0);

    await oneRow.evaluate((row) => {
      const label = document.createElement('label');
      label.style.cssText = 'position:absolute;left:88px;top:4px;z-index:3';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'row-choice';
      radio.id = 'row-choice';
      radio.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
      const text = document.createElement('span');
      text.textContent = 'Choose option';
      label.append(radio, text);
      row.append(label);
    });
    await page.getByText('Choose option', { exact: true }).click();
    assert.equal(await page.locator('#row-choice').isChecked(), true, 'the label should still activate its native radio');
    assert.equal(await page.locator(`${primary} .muxui-grid-list-ripple`).count(), 0, 'label-backed controls should not start a row ripple');

    const twoRow = page.getByRole('row', { name: 'Two', exact: true });
    await twoRow.focus();
    const twoRect = await twoRow.boundingBox();
    await page.keyboard.down('Enter');
    await ripple.waitFor({ state: 'attached' });
    const keyboardOrigin = await ripple.evaluate((node) => ({
      left: Number.parseFloat(node.style.left),
      top: Number.parseFloat(node.style.top),
      width: node.closest('[role="row"]').getBoundingClientRect().width,
      height: node.closest('[role="row"]').getBoundingClientRect().height,
    }));
    assert.ok(twoRect);
    assert.ok(Math.abs(keyboardOrigin.left - keyboardOrigin.width / 2) < 1);
    assert.ok(Math.abs(keyboardOrigin.top - keyboardOrigin.height / 2) < 1);
    await oneRow.focus();
    await page.waitForFunction((selector) => document.querySelectorAll(`${selector} .muxui-grid-list-ripple`).length === 0, primary);
    await page.keyboard.up('Enter');

    const disabledRow = page.getByRole('row', { name: 'Disabled', exact: true });
    await disabledRow.scrollIntoViewIfNeeded();
    const disabledRect = await disabledRow.boundingBox();
    assert.ok(disabledRect);
    const disabledPoint = { x: disabledRect.x + disabledRect.width / 2, y: disabledRect.y + disabledRect.height / 2 };
    await page.mouse.click(disabledPoint.x, disabledPoint.y, { button: 'right' });
    await page.mouse.move(disabledPoint.x, disabledPoint.y);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal(await page.locator(`${primary} .muxui-grid-list-ripple`).count(), 0);

    await oneRow.scrollIntoViewIfNeeded();
    const pointOnOne = await oneRow.boundingBox();
    assert.ok(pointOnOne);
    await page.mouse.move(pointOnOne.x + 70, pointOnOne.y + 20);
    await page.mouse.down();
    await ripple.waitFor({ state: 'attached' });
    await page.evaluate(() => document.documentElement.setAttribute('data-reduced-motion', 'true'));
    await page.waitForFunction((selector) => document.querySelectorAll(`${selector} .muxui-grid-list-ripple`).length === 0, primary);
    await page.mouse.up();
    await page.mouse.move(pointOnOne.x + 70, pointOnOne.y + 20);
    await page.mouse.down();
    await ripple.waitFor({ state: 'attached' });
    assert.equal(await ripple.getAttribute('data-static'), 'true');
    assert.equal(await ripple.evaluate((node) => getComputedStyle(node).transform), 'none');
    await page.mouse.up();
    await page.waitForFunction((selector) => document.querySelectorAll(`${selector} .muxui-grid-list-ripple`).length === 0, primary);
    await page.evaluate(() => document.documentElement.removeAttribute('data-reduced-motion'));
    await page.waitForFunction((selector) => document.querySelector(selector)?.hasAttribute('data-muxui-grid-list-motion-ready'), primary);

    await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      root.style.setProperty('--muxui-semantic-motion-state-transition-duration', '0ms');
      root.style.setProperty('--muxui-semantic-motion-state-transition-spring-visual-duration', '0ms');
    }, primary);
    await page.mouse.move(pointOnOne.x + 70, pointOnOne.y + 20);
    await page.mouse.down();
    await ripple.waitFor({ state: 'attached' });
    assert.equal(await ripple.getAttribute('data-static'), 'true');
    await page.mouse.up();
    await page.waitForFunction((selector) => document.querySelectorAll(`${selector} .muxui-grid-list-ripple`).length === 0, primary);
    await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      root.style.removeProperty('--muxui-semantic-motion-state-transition-duration');
      root.style.removeProperty('--muxui-semantic-motion-state-transition-spring-visual-duration');
    }, primary);

    await moveToRow(page, 'Seven');
    await page.waitForFunction((selector) => Number(getComputedStyle(document.querySelector(selector)).opacity) >= 0.99, `${primary} .muxui-grid-list-hover`);
    const sevenRow = page.getByRole('row', { name: 'Seven', exact: true });
    const sevenRect = await sevenRow.boundingBox();
    assert.ok(sevenRect);
    await page.mouse.move(sevenRect.x + sevenRect.width / 2, sevenRect.y + sevenRect.height / 2);
    await page.mouse.down();
    await ripple.waitFor({ state: 'attached' });
    await page.evaluate(() => window.gridListMotionFixture.clearPrimary());
    await page.waitForFunction((selector) => document.querySelectorAll(`${selector} .muxui-grid-list-ripple`).length === 0, primary);
    await page.mouse.up();
    await page.waitForFunction((selector) => Number(getComputedStyle(document.querySelector(selector)).opacity) < 0.01, `${primary} .muxui-grid-list-hover`);
    await page.evaluate(() => window.gridListMotionFixture.removePrimary());
    await page.waitForFunction(() => !document.querySelector('#primary-list'));
    const refEvents = await page.evaluate(() => window.gridListRefEvents);
    assert.ok(refEvents.includes('cleanup'));
    assert.equal(refEvents.includes('detached'), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

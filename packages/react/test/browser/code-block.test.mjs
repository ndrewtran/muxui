import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

const source = 'export async function loadPanel() {\n  const panel = await workspace.read("research");\n  if (!panel.visible) return null;\n  return panel.title;\n}';
const before = source.replace('research', 'inbox').replace('  if (!panel.visible) return null;\n', '');
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeBlock } from '/src/supplemental/code-block.mjs';
const root = createRoot(document.querySelector('#root'));
window.formSubmissions = 0;
document.querySelector('form').addEventListener('submit', (event) => { event.preventDefault(); window.formSubmissions++; });
window.mountCodeBlock = (props = {}) => root.render(React.createElement('div', {style: {display: 'grid', gap: '24px'}},
  React.createElement(CodeBlock, {filename: 'panel.ts', language: 'typescript', source: ${JSON.stringify(source)}, ...props}),
  React.createElement(CodeBlock, {filename: 'panel.ts', language: 'typescript', mode: 'diff', before: ${JSON.stringify(before)}, after: ${JSON.stringify(source)}})));
window.mountCodeBlock();
`;
const fixture = pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin:0;padding:24px;box-sizing:border-box;background:var(--muxui-semantic-surface-canvas)"',
  body: '<main style="max-width:420px;margin:auto"><form><div id="root"></div></form></main>',
  entry: '/code-block-entry.mjs',
});

test('CodeBlock copied feedback expires from fulfillment and follows actual-button mouse and touch departure', { timeout: 120_000 }, async () => {
  const server = await startServer({ entries: ['src/supplemental/code-block.mjs'], pages: { '/code-block.html': fixture }, modules: { '/code-block-entry.mjs': entry } });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, hasTouch: true });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.copyWrites = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(value) {
        window.copyWrites.push(value);
        if (window.pendingCopy) await new Promise((resolve) => { window.finishCopy = resolve; });
      } } });
    });
    await page.goto(`${server.url}/code-block.html`);
    const block = page.locator('.muxui-code-block').first();
    const copy = page.getByRole('button', { name: 'Copy code', exact: true });
    const tooltip = page.getByRole('tooltip');
    const reset = async () => {
      assert.equal(await block.getAttribute('data-copy-state'), 'idle');
      assert.equal(await copy.locator('.lucide-copy').count(), 1);
      await tooltip.waitFor({ state: 'hidden' });
    };

    await page.evaluate(() => { window.pendingCopy = true; });
    await copy.click();
    await page.waitForTimeout(3100);
    assert.equal(await block.getAttribute('data-copy-state'), 'pending');
    assert.equal(await tooltip.count(), 0);
    await page.evaluate(() => { window.pendingCopy = false; window.finishCopy(); });
    await tooltip.waitFor();
    assert.equal(await tooltip.textContent(), 'Copied');
    await page.waitForTimeout(2000);
    assert.equal(await block.getAttribute('data-copy-state'), 'copied');
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'idle');
    await reset();
    assert.equal(await block.getByRole('status').textContent(), 'Code copied.');

    await copy.click();
    await tooltip.waitFor();
    await page.waitForTimeout(1800);
    await copy.click();
    await tooltip.waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await block.getAttribute('data-copy-state'), 'copied', 'the previous deadline cannot dismiss a new success');
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'idle');
    await reset();

    await copy.click();
    await tooltip.waitFor();
    const button = await copy.boundingBox();
    await page.mouse.move(button.x - 4, button.y + button.height / 2);
    await reset();
    assert.equal(await copy.evaluate((node) => node.parentElement.contains(document.elementFromPoint(node.getBoundingClientRect().left - 4, node.getBoundingClientRect().top + node.getBoundingClientRect().height / 2))), true, 'departure stays inside the header');

    await page.evaluate(() => { window.pendingCopy = true; });
    await copy.click();
    await page.mouse.move(button.x - 4, button.y + button.height / 2);
    await page.evaluate(() => { window.pendingCopy = false; window.finishCopy(); });
    await reset();
    assert.equal(await block.getByRole('status').textContent(), 'Code copied.');
    await copy.hover();
    await page.waitForTimeout(1000);
    assert.equal(await tooltip.count(), 0, 'reentering after a departed write cannot reopen feedback');

    await page.mouse.move(0, 0);
    await copy.tap();
    await tooltip.waitFor();
    await copy.evaluate((node) => node.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'touch', relatedTarget: document.body })));
    assert.equal(await block.getAttribute('data-copy-state'), 'copied');
    assert.equal(await copy.locator('.lucide-check').count(), 1);
    assert.equal(await tooltip.textContent(), 'Copied');
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'idle');
    await reset();
    await copy.click();
    await tooltip.waitFor();
    await page.mouse.move(button.x - 4, button.y + button.height / 2);
    await reset();
    assert.deepEqual(await page.evaluate(() => window.copyWrites), Array(7).fill(source));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});

test('CodeBlock keyboard copying, narrow overflow/wrap, and forced-color change semantics work in an isolated browser', { timeout: 120_000 }, async () => {
  const server = await startServer({ entries: ['src/supplemental/code-block.mjs'], pages: { '/code-block.html': fixture }, modules: { '/code-block-entry.mjs': entry } });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Isolated local clipboard fulfills/rejects writes without touching the OS clipboard.
    await page.addInitScript(() => {
      window.copyWrites = [];
      window.clipboardReads = 0;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, get() {
        window.clipboardReads++;
        return { async writeText(value) {
          window.copyWrites.push(value);
          if (window.rejectCopy) throw new Error('Denied');
          if (window.pendingCopy) await new Promise((resolve) => { window.finishCopy = resolve; });
        } };
      } });
    });
    await page.goto(`${server.url}/code-block.html`);
    await page.locator('.muxui-code-block').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.muxui-code-block')].every((block) => block.querySelector('.muxui-code-block-token-link')));
    assert.equal(await page.locator('code').first().textContent(), source);
    assert.equal(await page.evaluate(() => window.clipboardReads), 0);
    for (const scheme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.dataset.muxuiColorScheme = value, scheme);
      const colors = await page.locator('.muxui-code-block').first().evaluate((block) => {
        const style = getComputedStyle(block);
        const color = (selector) => getComputedStyle(block.querySelector(selector)).color;
        return { link: color('.muxui-code-block-token-link'), strong: color('.muxui-code-block-token-strong'), background: style.backgroundColor };
      });
      assert.notEqual(colors.link, colors.strong);
      assert.notEqual(colors.link, colors.background);
      assert.notEqual(colors.strong, colors.background);
      const directory = process.env.MUXUI_CODE_BLOCK_SCREENSHOTS;
      if (directory) {
        await mkdir(directory, { recursive: true });
        await page.screenshot({ path: join(directory, `code-block-${scheme}.png`) });
      }
    }
    const copy = page.getByRole('button', { name: 'Copy code', exact: true });
    assert.equal(await copy.textContent(), '');
    assert.equal(await copy.locator('.lucide-copy').count(), 1);
    await copy.focus();
    assert.equal(await copy.evaluate((node) => getComputedStyle(node).outlineStyle), 'solid');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'copied');
    assert.deepEqual(await page.evaluate(() => window.copyWrites), [source]);
    assert.equal(await copy.locator('.lucide-check').count(), 1);
    assert.equal(await copy.getAttribute('aria-label'), 'Copy code');
    assert.equal(await page.getByRole('tooltip').textContent(), 'Copied');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'idle');
    assert.equal(await copy.locator('.lucide-copy').count(), 1);
    await page.getByRole('tooltip').waitFor({ state: 'hidden' });
    await copy.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('tooltip').waitFor();
    await page.getByRole('button', { name: 'Copy updated code' }).focus();
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'idle');
    await page.getByRole('tooltip').waitFor({ state: 'hidden' });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.copyWrites.length === 3);
    assert.equal((await page.evaluate(() => window.copyWrites)).at(-1), source);
    assert.equal(await page.getByRole('tooltip').textContent(), 'Copied');

    const exact = '\t<x>\r\n  trailing  \n';
    await page.evaluate((value) => window.mountCodeBlock({ source: value }), exact);
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'idle');
    await copy.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.copyWrites.length === 4);
    assert.equal((await page.evaluate(() => window.copyWrites)).at(-1), exact);
    await page.evaluate(() => { window.rejectCopy = true; });
    await copy.click();
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'error');
    assert.match(await page.locator('.muxui-code-block').first().getByRole('status').textContent(), /Could not copy/u);
    assert.equal(await copy.locator('.lucide-copy').count(), 1);
    await page.evaluate(() => { window.rejectCopy = false; window.pendingCopy = true; });
    await copy.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'pending');
    assert.equal(await copy.isDisabled(), true);
    assert.equal(await copy.getAttribute('aria-busy'), 'true');
    assert.equal(await copy.locator('.muxui-button-spinner').count(), 1);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.copyWrites.length), 6);
    await page.evaluate(() => { window.pendingCopy = false; window.finishCopy(); });
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'copied');
    assert.equal(await copy.locator('.lucide-check').count(), 1);
    assert.equal(await page.evaluate(() => window.formSubmissions), 0);
    await copy.focus();
    await page.keyboard.press('Escape');
    await page.getByRole('tooltip').waitFor({ state: 'hidden' });

    await page.setViewportSize({ width: 390, height: 700 });
    await page.evaluate(() => { window.rejectCopy = false; window.mountCodeBlock(); });
    const pre = page.locator('pre').first();
    await page.waitForFunction(() => document.querySelector('code').textContent.includes('loadPanel'));
    await page.waitForFunction(() => document.querySelector('.muxui-code-block-token-link'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await pre.evaluate((node) => node.scrollWidth > node.clientWidth), true);
    await pre.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await pre.evaluate((node) => node === document.activeElement), true);
    const directory = process.env.MUXUI_CODE_BLOCK_SCREENSHOTS;
    if (directory) await page.screenshot({ path: join(directory, 'code-block-dark-390.png') });
    await page.evaluate(() => window.mountCodeBlock({ wrap: true }));
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').hasAttribute('data-wrap'));
    assert.equal(await pre.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true);
    if (directory) await page.screenshot({ path: join(directory, 'code-block-dark-390-wrap.png') });

    await page.emulateMedia({ forcedColors: 'active' });
    const changes = await page.locator('[data-mode="diff"] .muxui-code-block-line:not([data-change="context"])').evaluateAll((rows) => rows.map((row) => ({
      text: row.querySelector('.muxui-code-block-sr-only').textContent,
      marker: getComputedStyle(row.querySelector('.muxui-code-block-marker'), '::before').content,
      foreground: getComputedStyle(row).color, background: getComputedStyle(row).backgroundColor,
    })));
    assert.ok(changes.some((row) => row.text.startsWith('Added') && row.marker.includes('+')));
    assert.ok(changes.some((row) => row.text.startsWith('Removed') && row.marker.includes('−')));
    assert.ok(changes.every((row) => row.foreground !== row.background));
    const tokens = await page.locator('.muxui-code-block-text span').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));
    assert.ok(tokens.length > 0);
    assert.equal(new Set(tokens).size, 1, 'forced colors override every syntax token');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});

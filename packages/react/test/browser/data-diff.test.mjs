import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DataDiff } from '/generated/data-diff.mjs';
const columns = [{id:'flavor',label:'Flavor'},{id:'category',label:'Category'},{id:'supplier',label:'Supplier'}];
const rows = [
  {id:'rocky',label:'Rocky Road',kind:'removed',values:{flavor:'Rocky Road',category:'Classic',supplier:'aurora-scoops'}},
  {id:'bubblegum',label:'Bubblegum',kind:'removed',values:{flavor:'Bubblegum',category:'Retro',supplier:'kumo-creamery'}},
  {id:'mint',label:'Mint Chip',kind:'unchanged',values:{flavor:'Mint Chip',category:'Classic',supplier:'maple-orbit'}},
  {id:'pistachio',label:'Pistachio',kind:'added',values:{flavor:'Pistachio',category:'Seasonal',supplier:'maple-orbit'}},
];
window.dataDiffChanges = [];
window.dataDiffApplications = [];
const root=createRoot(document.querySelector('#root'));
window.mountDataDiff = (props={}) => root.render(React.createElement(DataDiff,{
  label:'Proposed menu cleanup',columns,rows,
  onSelectionChange:(ids)=>window.dataDiffChanges.push(ids),
  onApply:(ids)=>window.dataDiffApplications.push(ids),...props
}));
window.mountDataDiff();
`;

const fixture = pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin:0;padding:24px;box-sizing:border-box;background:var(--muxui-semantic-surface-canvas)"',
  body: '<main style="max-width:480px;margin:auto"><div id="root"></div></main>',
  entry: '/data-diff-entry.mjs',
});

test('DataDiff native keyboard selection, Apply, narrow/long data, and forced colors work in an isolated browser', { timeout: 120_000 }, async () => {
  const server = await startServer({ entries: ['generated/data-diff.mjs'], pages: { '/data-diff.html': fixture }, modules: { '/data-diff-entry.mjs': entry } });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const directory = process.env.MUXUI_DATA_DIFF_SCREENSHOTS;
  const capture = async (name) => {
    if (!directory) return;
    await mkdir(directory, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(directory, name), fullPage: true });
  };
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${server.url}/data-diff.html`);
    await page.getByRole('table', { name: 'Proposed menu cleanup' }).waitFor();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 4);
    for (const scheme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.dataset.muxuiColorScheme = value, scheme);
      await capture(`data-diff-${scheme}.png`);
    }
    const rocky = page.getByRole('checkbox', { name: 'Select Rocky Road (removed)' });
    const all = page.getByRole('checkbox', { name: 'Select all proposed changes' });
    await rocky.focus();
    assert.equal(await rocky.evaluate((node) => getComputedStyle(node).appearance), 'auto');
    assert.notEqual(await rocky.evaluate((node) => getComputedStyle(node.closest('label').querySelector('.muxui-checkbox-indicator')).boxShadow), 'none');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.dataDiffChanges.length === 1);
    assert.deepEqual(await page.evaluate(() => window.dataDiffChanges.at(-1)), ['bubblegum', 'pistachio']);
    assert.equal(await all.evaluate((node) => node.indeterminate), true);
    await capture('data-diff-dark-mixed.png');
    await all.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.dataDiffChanges.length === 2);
    assert.deepEqual(await page.evaluate(() => window.dataDiffChanges.at(-1)), ['rocky', 'bubblegum', 'pistachio']);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.dataDiffChanges.length === 3);
    assert.equal(await page.getByRole('button', { name: 'Apply 0 changes' }).isDisabled(), true);
    await page.locator('[data-row-id="pistachio"] .muxui-data-diff-cell').first().click();
    const apply = page.getByRole('button', { name: 'Apply 1 change', exact: true });
    await apply.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.dataDiffApplications.length === 1);
    assert.deepEqual(await page.evaluate(() => window.dataDiffApplications), [['pistachio']]);
    assert.equal(await apply.evaluate((node) => node === document.activeElement), true);
    assert.equal(await page.evaluate(() => window.dataDiffChanges.length), 4);
    await rocky.click();
    assert.equal(await page.evaluate(() => window.dataDiffChanges.length), 5);
    assert.deepEqual(await page.evaluate(() => window.dataDiffChanges.at(-1)), ['rocky', 'pistachio']);
    await page.locator('[data-row-id="rocky"] .muxui-data-diff-cell').first().click();
    assert.equal(await page.evaluate(() => window.dataDiffChanges.length), 6);
    assert.deepEqual(await page.evaluate(() => window.dataDiffChanges.at(-1)), ['pistachio']);

    await page.evaluate(() => window.mountDataDiff({ pending: true }));
    await page.getByRole('button', { name: 'Applying…' }).waitFor();
    assert.ok((await page.getByRole('checkbox').evaluateAll((inputs) => inputs.map((input) => input.disabled))).every(Boolean));
    assert.equal(await page.locator('.muxui-data-diff').getAttribute('aria-busy'), 'true');
    await page.locator('[data-row-id="rocky"] .muxui-data-diff-cell').first().click();
    assert.equal(await page.evaluate(() => window.dataDiffChanges.length), 6);
    await capture('data-diff-dark-pending.png');
    await page.evaluate(() => window.mountDataDiff({ disabled: true }));
    await page.getByRole('button', { name: 'Apply 1 change', exact: true }).waitFor();
    assert.ok((await page.getByRole('checkbox').evaluateAll((inputs) => inputs.map((input) => input.disabled))).every(Boolean));
    await page.locator('[data-row-id="rocky"] .muxui-data-diff-cell').first().click();
    assert.equal(await page.evaluate(() => window.dataDiffChanges.length), 6);
    await capture('data-diff-dark-disabled.png');

    await page.setViewportSize({ width: 360, height: 700 });
    await page.evaluate(() => window.mountDataDiff());
    await page.locator('.muxui-data-diff:not([data-disabled])').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.muxui-data-diff-viewport').evaluate((node) => node.scrollWidth > node.clientWidth), true);
    const viewport = page.getByRole('region', { name: 'Proposed menu cleanup' });
    const selection = page.locator('[data-row-id="pistachio"] > .muxui-data-diff-selection');
    const edge = () => selection.evaluate((node) => {
      const style = getComputedStyle(node, '::before');
      return { width: style.borderInlineStartWidth, color: style.borderInlineStartColor, content: style.content };
    });
    for (const scheme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.dataset.muxuiColorScheme = value, scheme);
      for (const direction of ['ltr', 'rtl']) {
        await page.evaluate((value) => document.documentElement.dir = value, direction);
        await viewport.evaluate((node) => node.scrollLeft = 0);
        await page.mouse.move(0, 0);
        await page.locator('body').click({ position: { x: 2, y: 2 } });
        const initial = await selection.boundingBox();
        const region = await viewport.boundingBox();
        assert.ok(Math.abs(direction === 'ltr' ? initial.x - region.x : initial.x + initial.width - region.x - region.width) <= 1);
        assert.equal(await selection.evaluate((node) => getComputedStyle(node).position), 'sticky');
        assert.match(await selection.evaluate((node) => getComputedStyle(node).backgroundColor), /^rgb\(/u);
        assert.notEqual(await selection.evaluate((node) => getComputedStyle(node).backgroundImage), 'none');
        await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
        const beforeScroll = await selection.screenshot();
        await viewport.evaluate((node) => node.scrollLeft = document.documentElement.dir === 'rtl' ? -node.scrollWidth : node.scrollWidth);
        const scrolled = await selection.boundingBox();
        assert.ok(Math.abs(scrolled.x - initial.x) <= 1);
        const afterScroll = await selection.screenshot();
        if (directory) {
          await writeFile(join(directory, `pinned-cell-${scheme}-${direction}-before.png`), beforeScroll);
          await writeFile(join(directory, `pinned-cell-${scheme}-${direction}-after.png`), afterScroll);
        }
        assert.ok(beforeScroll.equals(afterScroll), 'Pinned paint stays opaque as supplied data scrolls beneath it.');
        const header = await all.boundingBox();
        assert.ok(header.x >= region.x && header.x + header.width <= region.x + region.width);
        assert.equal(await all.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === node;
        }), true);
        const selectedEdge = await edge();
        assert.equal(selectedEdge.width, '2px');
        assert.equal(selectedEdge.color, await selection.locator('.muxui-checkbox-indicator').evaluate((node) => getComputedStyle(node).backgroundColor));
        assert.equal(await page.locator('[data-row-id="rocky"] > .muxui-data-diff-selection').evaluate((node) => getComputedStyle(node, '::before').content), 'none');
        const changesBefore = await page.evaluate(() => window.dataDiffChanges.length);
        await page.getByRole('checkbox', { name: 'Select Pistachio (added)' }).click();
        assert.equal(await page.evaluate(() => window.dataDiffChanges.length), changesBefore + 1);
        assert.equal((await edge()).content, 'none');
        assert.deepEqual(await selection.boundingBox(), scrolled);
        await page.getByRole('checkbox', { name: 'Select Pistachio (added)' }).click();
        assert.equal(await page.evaluate(() => window.dataDiffChanges.length), changesBefore + 2);
        assert.equal((await edge()).width, '2px');
        await capture(`data-diff-${scheme}-360-${direction}-scrolled.png`);
      }
      await page.evaluate(() => document.documentElement.dir = 'ltr');
      await viewport.evaluate((node) => node.scrollLeft = 0);
      await capture(`data-diff-${scheme}-360.png`);
    }
    await page.evaluate(() => window.mountDataDiff({ rows: [
      { id: 'changed', label: 'Long scalar value', kind: 'updated', before: { flavor: 'Vanilla', category: false, supplier: null }, after: { flavor: 'Vanilla Madagascar', category: true, supplier: 'long-supplier-'.repeat(8) } },
      { id: 'escaped', label: 'Escaped text', kind: 'added', values: { flavor: '<script>window.bad=true</script>', category: 'Seasonal', supplier: 0 } },
    ], selectedIds: ['changed', 'escaped'] }));
    await page.getByRole('checkbox', { name: 'Select Long scalar value (updated)' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => window.bad), undefined);
    const contained = await viewport.evaluate((node) => node.scrollWidth >= node.clientWidth && getComputedStyle(node).overflowX === 'auto');
    assert.equal(contained, true);
    await viewport.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await viewport.evaluate((node) => node === document.activeElement), true);
    assert.match(await page.locator('[data-row-id="changed"]').textContent(), /Before: falseAfter: true/u);
    assert.match(await page.locator('[data-row-id="changed"]').textContent(), /Before: nullAfter:/u);
    assert.match(await page.locator('[data-row-id="escaped"]').textContent(), /<script>window.bad=true<\/script>/u);
    await capture('data-diff-dark-360-updated.png');

    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    const changes = await page.locator('[data-change]').evaluateAll((nodes) => nodes.map((node) => ({
      text: node.textContent, marker: node.querySelector('.muxui-data-diff-change').textContent, updatedIcon: Boolean(node.querySelector('.lucide-refresh-cw')),
      color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor,
    })));
    assert.ok(changes.some((row) => row.updatedIcon && row.text.includes('Before:')));
    assert.ok(changes.some((row) => row.marker === '+' && row.text.includes('Added row')));
    assert.ok(changes.every((row) => row.color !== row.background));
    const forcedSelection = page.locator('[data-row-id="changed"] > .muxui-data-diff-selection');
    assert.equal(await forcedSelection.evaluate((node) => getComputedStyle(node, '::before').borderInlineStartWidth), '2px');
    assert.notEqual(await forcedSelection.evaluate((node) => getComputedStyle(node, '::before').borderInlineStartColor), await forcedSelection.evaluate((node) => getComputedStyle(node).backgroundColor));
    assert.equal(await forcedSelection.locator('.lucide-check').count(), 1);
    assert.notEqual(await forcedSelection.locator('.lucide-check').evaluate((node) => getComputedStyle(node).color), await forcedSelection.locator('.muxui-checkbox-indicator').evaluate((node) => getComputedStyle(node).backgroundColor));
    await capture('data-diff-forced-colors-360.png');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.evaluate(() => window.mountDataDiff({ rows: [], selectedIds: [] }));
    await page.getByText('No rows to review.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Apply 0 changes' }).isDisabled(), true);
    await capture('data-diff-dark-empty.png');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});

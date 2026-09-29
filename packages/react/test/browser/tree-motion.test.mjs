import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { TreeMotionFixture } from '../fixtures/tree-motion-fixture.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function documentHtml() {
  const body = renderToString(React.createElement(TreeMotionFixture));
  return pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: `<link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/collections.css"><style>
    :root { --muxui-semantic-motion-interaction-duration: 360ms; --muxui-semantic-motion-interaction-easing: cubic-bezier(0.2, 0, 0, 1); --muxui-semantic-motion-state-duration: 300ms; }
    body { margin: 32px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong); }
    .tree-motion-fixture { display: grid; grid-template-columns: 320px 320px; gap: 48px; align-items: start; }
    .tree-motion-fixture h2 { margin: 0 0 12px; font: inherit; }
    .muxui-tree { width: 320px; }
  </style>`, body: `<div id="root">${body}</div>`, entry: '/test/fixtures/tree-motion-browser-entry.mjs' });
}

function row(tree, key) {
  return tree.locator(`.muxui-tree-item[data-key="${key}"]`);
}

async function bounds(locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
  });
}

async function waitForRevealToSettle(page, selector) {
  await page.waitForFunction((query) => document.querySelector(query)?.hasAttribute('data-muxui-tree-revealing'), selector);
  await page.waitForFunction((query) => {
    const row = document.querySelector(query);
    return row && row.style.height === '' && !row.hasAttribute('data-muxui-tree-revealing');
  }, selector);
}

test('Tree coordinates branch motion and full-row hover while collapse stays semantic', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ entries: ['test/fixtures/tree-motion-browser-entry.mjs'], pages: { '/tree-motion.html': documentHtml() } });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${url}/tree-motion.html`);

    const trees = page.locator('.muxui-tree');
    const primary = trees.nth(0);
    const independent = trees.nth(1);
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree[data-muxui-tree-motion-ready="true"]').length === 2);
    assert.equal(await row(primary, 'child-a').count(), 0, 'initial render does not reveal collapsed rows');

    const parent = row(primary, 'parent');
    const parentToggle = parent.locator('.muxui-tree-toggle');
    await parentToggle.click();
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="child-a"]'));
    assert.equal(await parent.getAttribute('aria-expanded'), 'true');
    await page.waitForFunction(() => {
      const row = document.querySelector('.muxui-tree [data-key="child-a"]');
      return row?.style.height && row.getBoundingClientRect().height > 1;
    });
    const enteringHeight = (await bounds(row(primary, 'child-a'))).height;
    await waitForRevealToSettle(page, '.muxui-tree [data-key="child-a"]');
    const expandedHeight = (await bounds(row(primary, 'child-a'))).height;
    assert.ok(enteringHeight > 0 && enteringHeight < expandedHeight - 1,
      `new rows reveal from zero height (${enteringHeight}px to ${expandedHeight}px)`);
    assert.equal(await row(primary, 'child-a').evaluate((node) => node.style.height), '', 'completed rows return to natural sizing');

    await page.evaluate(() => window.setFirstTreeExpanded(['parent', 'child-a']));
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="grandchild"]'));
    await waitForRevealToSettle(page, '.muxui-tree [data-key="grandchild"]');
    const liveIndent = await primary.evaluate((node) => Object.fromEntries(['child-a', 'grandchild'].map((key) => {
      const label = node.querySelector(`[data-key="${key}"] .muxui-tree-item-label`);
      return [key, label.getBoundingClientRect().left];
    })));
    await page.evaluate(() => window.setFirstTreeExpanded(['parent']));
    await page.waitForFunction(() => !document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="grandchild"]'));
    assert.equal(await row(primary, 'grandchild').count(), 0, 'nested collapse removes its descendants from the active collection');
    await primary.locator(':scope > [data-muxui-tree-exit]').waitFor();
    const nestedGhostIndent = await primary.locator(':scope > [data-muxui-tree-exit] [data-muxui-tree-ghost-key="grandchild"] .muxui-tree-item-label')
      .evaluate((label) => label.getBoundingClientRect().left);
    assert.ok(Math.abs(nestedGhostIndent - liveIndent.grandchild) < 0.5,
      `a depth-three exit snapshot preserves its live indentation (${nestedGhostIndent}px vs ${liveIndent.grandchild}px)`);
    await parentToggle.click();
    assert.equal(await parent.getAttribute('aria-expanded'), 'false', 'collapse state is immediate');
    assert.equal(await row(primary, 'child-a').count(), 0, 'collapsed descendants leave the active collection immediately');
    const exit = primary.locator(':scope > [data-muxui-tree-exit]');
    await exit.waitFor();
    assert.equal(await exit.count(), 1, 'ancestor collapse absorbs the active nested exit into one normal-flow placeholder');
    assert.match(await exit.textContent(), /Grandchild/u, 'the outer snapshot retains nested branch content');
    assert.equal(await exit.getAttribute('aria-hidden'), 'true');
    assert.equal(await exit.evaluate((node) => node.inert), true);
    assert.equal(await exit.locator('[role]').count(), 0, 'exit snapshots carry no duplicate collection roles');
    assert.equal(await exit.locator('[id]').count(), 0, 'exit snapshots carry no duplicate ids');
    assert.equal(await exit.locator('[name]').count(), 0, 'exit snapshots cannot submit duplicate named fields');
    assert.equal(await exit.locator('input').evaluate((node) => node.disabled), true);
    const flowGeometry = await primary.evaluate((node) => {
      const placeholder = node.querySelector(':scope > [data-muxui-tree-exit]')?.getBoundingClientRect();
      const tail = node.querySelector('[data-key="tail"]')?.getBoundingClientRect();
      return { placeholderBottom: placeholder?.bottom, tailTop: tail?.top };
    });
    assert.ok(flowGeometry.tailTop >= flowGeometry.placeholderBottom - 1,
      `the following row stays after the exit placeholder (${flowGeometry.tailTop}px vs ${flowGeometry.placeholderBottom}px)`);
    const ancestorGhostIndent = await primary.evaluate((node) => {
      const exit = node.querySelector(':scope > [data-muxui-tree-exit]');
      return Object.fromEntries(['child-a', 'grandchild'].map((key) => {
        const label = exit.querySelector(`[data-muxui-tree-ghost-key="${key}"] .muxui-tree-item-label`);
        return [key, label?.getBoundingClientRect().left];
      }));
    });
    for (const key of ['child-a', 'grandchild']) {
      assert.ok(Math.abs(ancestorGhostIndent[key] - liveIndent[key]) < 0.5,
        `the absorbed ${key} snapshot preserves its live indentation (${ancestorGhostIndent[key]}px vs ${liveIndent[key]}px)`);
    }
    await exit.waitFor({ state: 'detached', timeout: 1500 });

    await parentToggle.click();
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="child-a"]'));
    await waitForRevealToSettle(page, '.muxui-tree [data-key="child-a"]');
    const parentBranchTargetHeight = await primary.evaluate((node) => (
      ['child-a', 'child-b', 'disabled-child'].reduce((sum, key) => (
        sum + node.querySelector(`[data-key="${key}"]`).getBoundingClientRect().height
      ), 0)
    ));
    await page.evaluate(() => window.setFirstTreeExpanded(['parent', 'child-a']));
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="grandchild"]'));
    await waitForRevealToSettle(page, '.muxui-tree [data-key="grandchild"]');
    await page.evaluate(() => window.setFirstTreeExpanded(['parent']));
    await page.waitForFunction(() => {
      const root = document.querySelectorAll('.muxui-tree').item(0);
      return root?.querySelector(':scope > [data-muxui-tree-exit] [data-muxui-tree-ghost-key="grandchild"]');
    }, null, { polling: 'raf' });
    const nestedReversalStart = await primary.evaluate((node) => new Promise((resolve, reject) => {
      const view = node.ownerDocument.defaultView;
      const observer = new MutationObserver(() => {
        const exit = node.querySelector(':scope > [data-muxui-tree-exit]');
        if (!exit?.textContent.includes('Child A') || !exit.textContent.includes('Grandchild')) return;
        const before = exit.getBoundingClientRect().height;
        observer.disconnect();
        view.clearTimeout(timeout);
        window.treeMotionNestedExitStartHeight = before;
        window.setFirstTreeExpanded(['parent']);
        resolve(before);
      });
      const timeout = view.setTimeout(() => {
        observer.disconnect();
        reject(new Error('ancestor exit placeholder did not absorb the active nested exit'));
      }, 1500);
      observer.observe(node, { subtree: true, childList: true });
      window.setFirstTreeExpanded([]);
    }));
    const nestedReversalHandle = await page.waitForFunction((targetHeight) => {
      const root = document.querySelectorAll('.muxui-tree').item(0);
      const rows = ['child-a', 'child-b', 'disabled-child'].map((key) => root?.querySelector(`[data-key="${key}"]`));
      if (!rows.every((row) => row?.hasAttribute('data-muxui-tree-revealing'))) return false;
      return {
        before: window.treeMotionNestedExitStartHeight,
        after: rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0),
        targetHeight,
        exitCount: root.querySelectorAll(':scope > [data-muxui-tree-exit]').length,
        parentExpanded: root.querySelector('[data-key="parent"]')?.getAttribute('aria-expanded'),
        childExpanded: root.querySelector('[data-key="child-a"]')?.getAttribute('aria-expanded'),
      };
    }, parentBranchTargetHeight, { polling: 'raf' });
    const nestedReversal = await nestedReversalHandle.jsonValue();
    assert.ok(nestedReversalStart > nestedReversal.targetHeight * 1.1
      && nestedReversal.before > nestedReversal.targetHeight * 1.1
      && nestedReversal.after > nestedReversal.targetHeight * 1.05
      && Math.abs(nestedReversal.before - nestedReversal.after) < Math.max(12, nestedReversal.before * 0.2),
    `nested collapse-to-reopen keeps aggregate height continuous (${nestedReversal.before}px to ${nestedReversal.after}px)`);
    assert.equal(nestedReversal.parentExpanded, 'true');
    assert.equal(nestedReversal.childExpanded, 'false', 'reopening the parent keeps its child branch collapsed');
    assert.equal(nestedReversal.exitCount, 0, 'nested reversal removes its stale ghost immediately');
    await waitForRevealToSettle(page, '.muxui-tree [data-key="child-a"]');

    await page.evaluate(() => window.setFirstTreeExpanded([]));
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector(':scope > [data-muxui-tree-exit]'));
    assert.equal(await row(primary, 'child-a').count(), 0, 'controlled collapse also exits visually after collection removal');

    await primary.evaluate((node) => node.setAttribute('data-reduced-motion', 'true'));
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.hasAttribute('data-muxui-tree-motion-reduced'));
    await page.evaluate(() => window.setFirstTreeExpanded(['parent']));
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="child-a"]'));
    assert.equal(await row(primary, 'child-a').evaluate((node) => node.style.height), '', 'reduced-motion expansion settles immediately');
    await page.evaluate(() => window.setFirstTreeExpanded([]));
    await page.waitForFunction(() => !document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="child-a"]'));
    assert.equal(await primary.locator(':scope > [data-muxui-tree-exit]').count(), 0, 'reduced-motion collapse does not retain visual ghosts');
    await primary.evaluate((node) => node.removeAttribute('data-reduced-motion'));
    await page.waitForFunction(() => !document.querySelectorAll('.muxui-tree').item(0)?.hasAttribute('data-muxui-tree-motion-reduced'));

    const selectedBackground = await parent.evaluate((node) => getComputedStyle(node).backgroundColor);
    const primaryParentBox = await parent.boundingBox();
    await page.mouse.move(primaryParentBox.x + primaryParentBox.width / 2, primaryParentBox.y + primaryParentBox.height / 2);
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="parent"][data-hovered]'));
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('.muxui-tree-hover:not([hidden])'));
    assert.equal(await parent.evaluate((node) => getComputedStyle(node).backgroundColor), selectedBackground,
      'hovering a selected row preserves its selection fill');
    assert.equal(await independent.locator('.muxui-tree-hover').evaluate((node) => node.hidden), true,
      'hover state remains local to its Tree');

    await page.evaluate(() => window.setFirstTreeExpanded(['parent']));
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="child-b"]'));
    await waitForRevealToSettle(page, '.muxui-tree [data-key="child-b"]');
    const hover = primary.locator('.muxui-tree-hover');
    const start = await bounds(hover);
    const childBox = await row(primary, 'child-b').boundingBox();
    await page.mouse.move(childBox.x + 48, childBox.y + childBox.height / 2);
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="child-b"][data-hovered]'));
    const motionSampleHandle = await page.waitForFunction((startTop) => {
      const root = document.querySelectorAll('.muxui-tree')[0];
      const shape = root?.querySelector('.muxui-tree-hover');
      const destination = root?.querySelector('[data-key="child-b"]');
      if (!shape || shape.hidden || !destination) return false;
      const top = shape.getBoundingClientRect().top;
      const targetTop = destination.getBoundingClientRect().top;
      if (top <= Math.min(startTop, targetTop) + 1 || top >= Math.max(startTop, targetTop) - 1) return false;
      return { top, targetTop, transform: getComputedStyle(shape).transform };
    }, start.top);
    const motionSample = await motionSampleHandle.jsonValue();
    assert.ok(motionSample.top > Math.min(start.top, motionSample.targetTop) + 1
      && motionSample.top < Math.max(start.top, motionSample.targetTop) - 1
      && motionSample.transform !== 'none', 'the hover overlay is visibly in flight between enabled rows');
    await page.waitForFunction(() => {
      const root = document.querySelectorAll('.muxui-tree')[0];
      const shape = root?.querySelector('.muxui-tree-hover')?.getBoundingClientRect();
      const target = root?.querySelector('[data-key="child-b"]')?.getBoundingClientRect();
      return shape && target && Math.abs(shape.top - target.top) < 1 && Math.abs(shape.height - target.height) < 1;
    });
    const settledGeometry = await primary.evaluate((node) => {
      const shape = node.querySelector('.muxui-tree-hover').getBoundingClientRect();
      const target = node.querySelector('[data-key="child-b"]').getBoundingClientRect();
      return { topDelta: Math.abs(shape.top - target.top), heightDelta: Math.abs(shape.height - target.height) };
    });
    assert.ok(settledGeometry.topDelta < 1 && settledGeometry.heightDelta < 1,
      'the traveling overlay settles on the hovered row');

    await page.evaluate(() => window.setFirstTreeExpanded([]));
    await page.waitForFunction(() => !document.querySelectorAll('.muxui-tree').item(0)?.querySelector('[data-key="child-b"]'));
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(0)?.querySelector('.muxui-tree-hover[hidden]'));
    assert.equal(await primary.locator(':scope > [data-muxui-tree-exit]').count(), 1,
      'collapsing the hovered branch clears the stale overlay while its visual exit completes');

    const independentParentBox = await row(independent, 'parent').boundingBox();
    await page.mouse.move(independentParentBox.x + independentParentBox.width / 2, independentParentBox.y + independentParentBox.height / 2);
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(1)?.querySelector('.muxui-tree-hover:not([hidden])'));
    assert.equal(await primary.locator('.muxui-tree-hover').evaluate((node) => node.hidden), true,
      'transferring hover clears the previous Tree overlay');
    const independentToggle = row(independent, 'parent').locator('.muxui-tree-toggle');
    await independentToggle.click();
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(1)?.querySelector('[data-key="disabled-child"]'));
    await waitForRevealToSettle(page, '.muxui-tree[aria-label="Independent tree"] [data-key="disabled-child"]');
    const disabledBounds = await bounds(row(independent, 'disabled-child'));
    await page.mouse.move(480, disabledBounds.top + disabledBounds.height / 2);
    await page.waitForFunction(() => document.querySelectorAll('.muxui-tree').item(1)?.querySelector('.muxui-tree-hover[hidden]'));
    assert.equal(await independent.locator('.muxui-tree-hover').evaluate((node) => node.hidden), true,
      'disabled rows do not receive the hover overlay');
    await page.mouse.move(1050, 760);
    assert.equal(await independent.locator('.muxui-tree-hover').evaluate((node) => node.hidden), true,
      'pointer leave clears the overlay');

    assert.deepEqual(pageErrors, [], 'browser has no uncaught runtime errors');
  } finally {
    await browser.close();
    await close();
  }
});

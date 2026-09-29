import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { recordFrames } from '../fixtures/frame-recorder.mjs';
import { ListBoxMotionFixture } from '../fixtures/listbox-motion-fixture.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function documentHtml() {
  return pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: '<link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/collections.css"><style>:root { --muxui-semantic-motion-state-duration: 400ms; }</style>', bodyAttributes: 'style="margin:32px;background:var(--muxui-semantic-surface-canvas);color:var(--muxui-semantic-content-strong)"', body: `<div id="root">${renderToString(React.createElement(ListBoxMotionFixture))}</div>`, entry: '/test/fixtures/listbox-motion-browser-entry.mjs' });
}

function rect(node) {
  const value = node?.getBoundingClientRect();
  return value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null;
}

async function labelRects(page, selector) {
  return page.locator(`${selector} [role="option"]`).evaluateAll((options) => options.map((option) => {
    const walker = document.createTreeWalker(option, NodeFilter.SHOW_TEXT);
    let textNode = null;
    while (walker.nextNode()) {
      const candidate = walker.currentNode;
      if (candidate.textContent?.trim() && !candidate.parentElement?.closest('[aria-hidden="true"]')) {
        textNode = candidate;
        break;
      }
    }
    const range = textNode ? document.createRange() : null;
    if (range) range.selectNodeContents(textNode);
    const value = range?.getBoundingClientRect();
    return { id: option.id, rect: value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null };
  }));
}

// Serialized into the page by recordFrames, so it must stay self-contained.
function sampleShape(selector) {
  const rect = document.querySelector(`${selector} [data-muxui-list-box-selection]`)?.getBoundingClientRect();
  return rect ? { shape: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } } : null;
}

async function waitForSelected(page, selector, label) {
  await page.waitForFunction(({ selector: rootSelector, label: expected }) => {
    const selected = document.querySelector(`${rootSelector} [role="option"][aria-selected="true"]`);
    return selected?.textContent.trim() === expected;
  }, { selector, label });
}

async function waitForShapeAlignment(page, selector) {
  await page.waitForFunction((rootSelector) => {
    const root = document.querySelector(rootSelector);
    const selected = root?.querySelector('[role="option"][aria-selected="true"]');
    const shape = root?.querySelector('[data-muxui-list-box-selection]');
    if (!selected || !shape) return false;
    const a = selected.getBoundingClientRect();
    const b = shape.getBoundingClientRect();
    return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5
      && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
  }, selector);
}

function assertRectsClose(actual, expected, message = 'rectangles should align') {
  assert.ok(actual && expected, message);
  for (const key of ['left', 'top', 'width', 'height']) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 0.75, `${message}: ${key} ${actual[key]} vs ${expected[key]}`);
  }
}

async function resolveBackgroundToken(page, token) {
  return page.evaluate((tokenName) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${tokenName})`;
    document.body.append(probe);
    const backgroundColor = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return backgroundColor;
  }, token);
}

async function readListBox(page, selector) {
  return page.locator(selector).evaluate((root) => {
    const options = [...root.querySelectorAll('[role="option"]')];
    const selected = options.filter((option) => option.getAttribute('aria-selected') === 'true');
    const shape = root.querySelector('[data-muxui-list-box-selection]');
    const itemRect = (node) => {
      const value = node?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null;
    };
    const styles = shape ? getComputedStyle(shape) : null;
    return {
      selected: selected.map((option) => option.textContent.trim()),
      selectedRects: selected.map(itemRect),
      shape: itemRect(shape),
      shapeBackground: styles?.backgroundColor ?? null,
      shapeTransform: shape?.style.transform ?? '',
      shapeHidden: shape?.hidden ?? false,
      shapeDisplay: styles?.display ?? null,
      shapeVisibility: styles?.visibility ?? null,
      shapeCount: root.querySelectorAll('[data-muxui-list-box-selection]').length,
      rootReduced: root.hasAttribute('data-muxui-list-box-reduced'),
    };
  });
}

test('ListBox selection backdrop moves independently from focus and honors collection motion contracts', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ entries: ['test/fixtures/listbox-motion-browser-entry.mjs'], pages: { '/listbox-motion.html': documentHtml() } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/listbox-motion.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.listBoxMotionHydrated === 'true');
    assert.deepEqual(errors, []);

    const single = '#single-list';
    const initial = await readListBox(page, single);
    assert.deepEqual(initial.selected, ['One']);
    assert.equal(initial.shapeCount, 1);
    assert.ok(initial.shape && initial.shapeBackground && initial.shapeBackground !== 'rgba(0, 0, 0, 0)');
    assert.deepEqual(initial.shape, initial.selectedRects[0]);

    const labelsBefore = await labelRects(page, single);
    const travelRecording = await recordFrames(page, sampleShape, single);
    await page.evaluate(() => window.__listBoxSetSingle('three'));
    await waitForSelected(page, single, 'Three');
    const target = await readListBox(page, single);
    assert.deepEqual(target.selected, ['Three']);
    await waitForShapeAlignment(page, single);
    const travelFrames = await travelRecording.stop();
    assert.ok(target.shape && initial.shape);
    const minTop = Math.min(initial.shape.top, target.selectedRects[0].top);
    const maxTop = Math.max(initial.shape.top, target.selectedRects[0].top);
    const middle = travelFrames.find(({ shape }) => shape.top > minTop + 0.5 && shape.top < maxTop - 0.5);
    assert.ok(middle, `selection shape should be in flight: ${JSON.stringify({ initial, travelFrames, target })}`);
    const settled = await readListBox(page, single);
    assertRectsClose(settled.shape, settled.selectedRects[0]);
    const labelsAfter = await labelRects(page, single);
    assert.deepEqual(labelsAfter, labelsBefore);

    await page.evaluate(() => window.__listBoxSetSingle('one'));
    await waitForSelected(page, single, 'One');
    await waitForShapeAlignment(page, single);
    // Interrupt from inside the page while the shape travels, then compare the last frame
    // of the interrupted animation with the first frame of its replacement, so the pair
    // straddles the retarget instead of a Node round trip.
    const interruptRecording = await recordFrames(page, (selector, state) => {
      const root = document.querySelector(selector);
      const rect = (node) => {
        const value = node?.getBoundingClientRect();
        return value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null;
      };
      const selected = root.querySelector('[role="option"][aria-selected="true"]');
      const shapeNode = root.querySelector('[data-muxui-list-box-selection]');
      const animation = shapeNode?.getAnimations()[0] ?? null;
      state.ids ??= new WeakMap();
      state.nextId ??= 1;
      if (animation && !state.ids.has(animation)) state.ids.set(animation, state.nextId++);
      const frame = {
        selected: selected?.textContent.trim(),
        selectedRects: selected ? [rect(selected)] : [],
        shape: rect(shapeNode),
        animation: animation ? state.ids.get(animation) : null,
      };
      if (!state.started) {
        state.started = true;
        state.startTop = frame.shape?.top;
        window.__listBoxSetSingle('three');
        return null;
      }
      if (!state.interrupted) {
        // Interrupt early in the travel, once the shape is clear of the 5px in-flight bound.
        if (frame.selected !== 'Three' || !frame.shape || Math.abs(frame.shape.top - state.startTop) < 10) return null;
        state.interrupted = true;
        state.interruptedAnimation = frame.animation;
        window.__listBoxSetSingle('one');
        return frame;
      }
      if (state.done) return null;
      state.done = frame.animation !== state.interruptedAnimation;
      return frame;
    }, single);
    await interruptRecording.waitFor(({ state }) => state.done);
    const interruptFrames = await interruptRecording.stop();
    const retarget = interruptFrames.findIndex(({ animation }) => animation !== interruptFrames[0].animation);
    const beforeInterrupt = interruptFrames[retarget - 1];
    const interruptedTarget = interruptFrames[retarget];
    assert.ok(beforeInterrupt?.shape && interruptedTarget?.shape && interruptedTarget.selectedRects[0]);
    assert.ok(Math.abs(interruptedTarget.shape.top - beforeInterrupt.shape.top) < 8, `selection shape should continue from its interrupted position: ${JSON.stringify({ beforeInterrupt, interruptedTarget })}`);
    assert.ok(Math.abs(interruptedTarget.shape.top - interruptedTarget.selectedRects[0].top) > 5, `interruption should retain an in-flight position: ${JSON.stringify({ beforeInterrupt, interruptedTarget })}`);
    await waitForShapeAlignment(page, single);

    await page.evaluate(() => window.__listBoxClearSingle());
    await page.waitForFunction(() => !document.querySelector('#single-list [role="option"][aria-selected="true"]'));
    await page.waitForFunction(() => document.querySelector('#single-list [data-muxui-list-box-selection]')?.hidden === true);
    const cleared = await readListBox(page, single);
    assert.equal(cleared.shapeHidden, true);
    await page.evaluate(() => window.__listBoxSetSingle('one'));
    await waitForSelected(page, single, 'One');
    await waitForShapeAlignment(page, single);

    const dynamic = await readListBox(page, '#dynamic-list');
    await page.evaluate(() => window.__listBoxSetDynamicItems([
      { id: 'inserted', label: 'Inserted before the selected row' },
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ]));
    await page.waitForFunction(() => document.querySelector('#dynamic-list [role="option"][data-key="inserted"]'));
    await waitForShapeAlignment(page, '#dynamic-list');
    const dynamicAfter = await readListBox(page, '#dynamic-list');
    assert.ok(dynamicAfter.selectedRects[0].top > dynamic.selectedRects[0].top);
    assertRectsClose(dynamicAfter.shape, dynamicAfter.selectedRects[0]);
    await page.evaluate(() => window.__listBoxSetDynamicMode('multiple'));
    await page.waitForFunction(() => !document.querySelector('#dynamic-list [data-muxui-list-box-selection]'));
    assert.equal((await readListBox(page, '#dynamic-list')).shapeCount, 0);
    await page.evaluate(() => window.__listBoxSetDynamicMode('single'));
    await waitForShapeAlignment(page, '#dynamic-list');
    assert.equal((await readListBox(page, '#dynamic-list')).shapeCount, 1);

    const multi = '#multiple-list';
    const multiInitial = await readListBox(page, multi);
    assert.deepEqual(multiInitial.selected.sort(), ['Alpha', 'Gamma']);
    assert.equal(multiInitial.shapeCount, 0);
    assert.equal(
      await page.locator(`${multi} [role="option"][aria-selected="true"]`).first().evaluate((node) => getComputedStyle(node).backgroundColor),
      await resolveBackgroundToken(page, '--muxui-semantic-color-neutral-90'),
      'multiple selection uses the neutral-90 token',
    );
    await page.evaluate(() => window.__listBoxSetMultiple(['beta', 'gamma']));
    await page.waitForFunction(() => document.querySelectorAll('#multiple-list [role="option"][aria-selected="true"]').length === 2);
    await page.waitForFunction(() => document.querySelector('#multiple-list [role="option"][data-key="alpha"]')?.getAttribute('aria-selected') === 'false');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#multiple-list [role="option"][data-key="alpha"]')).backgroundColor === 'rgba(0, 0, 0, 0)');
    const multiNext = await readListBox(page, multi);
    assert.deepEqual(multiNext.selected.sort(), ['Beta', 'Gamma']);
    assert.equal(multiNext.shapeCount, 0);

    await page.getByRole('option', { name: 'Alpha', exact: true }).focus();
    const focused = await page.getByRole('option', { name: 'Alpha', exact: true }).evaluate((node) => {
      const style = getComputedStyle(node);
      return { active: document.activeElement === node, focused: node.hasAttribute('data-focused'), background: style.backgroundColor, outline: style.outlineWidth };
    });
    assert.equal(focused.active, true);
    assert.equal(focused.focused, true);
    assert.equal(focused.background, 'rgba(0, 0, 0, 0)');
    assert.equal(focused.outline, '2px');

    await page.locator('#uncontrolled-list').getByRole('option', { name: 'Two', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#uncontrolled-value')?.textContent === 'two');
    assert.equal((await readListBox(page, '#uncontrolled-list')).selected[0], 'Two');

    const empty = '#empty-uncontrolled-list';
    const emptyOption = page.locator(`${empty} [role="option"]`).first();
    await emptyOption.hover();
    await page.waitForFunction((rootSelector) => {
      const option = document.querySelector(`${rootSelector} [role="option"]`);
      return option && getComputedStyle(option).backgroundColor !== 'rgba(0, 0, 0, 0)';
    }, empty);
    await emptyOption.click();
    await page.waitForFunction((rootSelector) => document.querySelector(`${rootSelector} [role="option"][aria-selected="true"]`), empty);
    await waitForShapeAlignment(page, empty);
    const emptySelected = await readListBox(page, empty);
    assert.deepEqual(emptySelected.selected, ['One']);
    assertRectsClose(emptySelected.shape, emptySelected.selectedRects[0]);
    assert.equal(await page.locator(`${empty} [role="option"][aria-selected="true"]`).evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'ready moving backdrop owns the selected fill');

    assert.equal((await readListBox(page, '#disabled-list')).shapeCount, 1);
    await page.getByRole('option', { name: 'Two', exact: true }).last().click({ force: true });
    assert.equal((await readListBox(page, '#disabled-list')).selected[0], 'One');
    assert.equal((await readListBox(page, '#none-list')).shapeCount, 0);

    const compound = await readListBox(page, '#compound-list');
    assert.deepEqual(compound.selected, ['Section two']);
    assertRectsClose(compound.shape, compound.selectedRects[0]);

    const scroll = page.locator('#scroll-list');
    await scroll.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await page.getByRole('option', { name: 'Scroll 8', exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const scrollShapeBefore = await readListBox(page, '#scroll-list');
    assert.ok(scrollShapeBefore.shape);
    await page.evaluate(() => window.__listBoxSetScroll('scroll-8'));
    await waitForSelected(page, '#scroll-list', 'Scroll 8');
    await waitForShapeAlignment(page, '#scroll-list');
    const scrollShapeAfter = await readListBox(page, '#scroll-list');
    assertRectsClose(scrollShapeAfter.shape, scrollShapeAfter.selectedRects[0]);

    await page.evaluate(() => window.__listBoxSetSingle('one'));
    await waitForSelected(page, single, 'One');
    await waitForShapeAlignment(page, single);
    await page.evaluate(() => window.__listBoxSetSingle('three'));
    await waitForSelected(page, single, 'Three');
    // Let the shape travel briefly so reduction interrupts it mid-flight.
    await page.waitForTimeout(22);
    const reducedStart = await readListBox(page, single);
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => document.querySelector('#single-list')?.hasAttribute('data-muxui-list-box-reduced'));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const reducedSettled = await readListBox(page, single);
    assert.ok(reducedStart.shape && reducedSettled.shape);
    assertRectsClose(reducedSettled.shape, reducedSettled.selectedRects[0]);
    assert.equal(reducedSettled.shapeVisibility, 'hidden', JSON.stringify(reducedSettled));

    await page.evaluate(() => document.documentElement.removeAttribute('data-muxui-motion'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#single-list')?.hasAttribute('data-muxui-list-box-reduced'));
    await page.evaluate(() => window.__listBoxSetSingle('two'));
    await waitForSelected(page, single, 'Two');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const systemReducedSettled = await readListBox(page, single);
    assertRectsClose(systemReducedSettled.shape, systemReducedSettled.selectedRects[0]);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.emulateMedia({ forcedColors: 'active' });
    const forced = await page.locator('#single-list [role="option"][aria-selected="true"]').evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      color: getComputedStyle(node).color,
    }));
    assert.notEqual(forced.background, 'rgba(0, 0, 0, 0)');
    assert.notEqual(forced.color, 'rgba(0, 0, 0, 0)');
    const forcedShape = await readListBox(page, single);
    assert.equal(forcedShape.shapeDisplay, 'none');
    await page.emulateMedia({ forcedColors: 'none' });

    await page.screenshot({ path: '/tmp/muxui-listbox-motion-light.png', fullPage: true });
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'dark'));
    await page.screenshot({ path: '/tmp/muxui-listbox-motion-dark.png', fullPage: true });
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});

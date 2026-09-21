import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';

const packageRoot = resolve(import.meta.dirname, '../..');
const chromeCandidates = [
  process.env.MUXUI_CHROME_EXECUTABLE,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

async function chromePath() {
  for (const path of chromeCandidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['test/fixtures/tabs-variant-preview-browser-entry.mjs'], include: ['react', 'react-dom/client', 'react-aria-components'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(packageRoot, '../..')] } },
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.equal(typeof address, 'object');
  assert.ok(address?.port);
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function readGeometry(page, selector) {
  return page.locator(selector).evaluate((root) => {
    const selected = root.querySelector('[role="tab"][aria-selected="true"]');
    const label = selected?.querySelector('.muxui-tab-label');
    const indicator = root.querySelector('.muxui-tabs-motion-underline');
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null;
    };
    return {
      selected: selected?.textContent?.trim(),
      label: rect(label),
      trigger: rect(selected),
      indicator: rect(indicator),
      animationCount: indicator?.getAnimations().length ?? 0,
    };
  });
}

test('Tabs variants render A contrast geometry, overflow affordances, and isolated motion', { timeout: 90_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/test/fixtures/tabs-variant-preview.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiTabsHydrated === 'true');
    assert.deepEqual(errors, []);

    const initialLabel = page.locator('#light-underline-tabs [aria-selected="true"] .muxui-tab-label');
    await initialLabel.evaluate((label) => { label.style.letterSpacing = '3px'; });
    const initialLabelAligned = () => {
      const root = document.querySelector('#light-underline-tabs');
      const label = root.querySelector('[aria-selected="true"] .muxui-tab-label').getBoundingClientRect();
      const indicator = root.querySelector('.muxui-tabs-motion-underline').getBoundingClientRect();
      return Math.abs(label.width - indicator.width) < 1;
    };
    await page.waitForFunction(initialLabelAligned);
    await initialLabel.evaluate((label) => { label.style.letterSpacing = ''; });
    await page.waitForFunction(initialLabelAligned);

    for (const scheme of ['light', 'dark']) {
      const canvas = `#tabs-preview-${scheme}`;
      for (const variant of ['underline', 'pill', 'overflow', 'segment']) {
        const root = `${canvas} #${scheme}-${variant}-tabs`;
        assert.equal(await page.locator(root).getAttribute('data-variant'), variant);
        assert.equal(await page.locator(`${root} .muxui-tabs-motion`).getAttribute('data-muxui-tabs-variant'), variant);
      }

      const underline = await readGeometry(page, `${canvas} #${scheme}-underline-tabs`);
      assert.ok(underline.label && underline.indicator);
      assert.ok(Math.abs(underline.indicator.width - underline.label.width) < 1, `${scheme} underline follows label width`);

      const pill = await readGeometry(page, `${canvas} #${scheme}-pill-tabs`);
      assert.ok(pill.trigger && pill.indicator);
      assert.ok(Math.abs(pill.indicator.width - pill.trigger.width) < 1, `${scheme} pill follows trigger width`);
      assert.notEqual(await page.locator(`${canvas} #${scheme}-pill-tabs .muxui-tabs-motion-underline`).evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');

      const segmentTabs = page.locator(`${canvas} #${scheme}-segment-tabs [role="tab"]`);
      const segmentGeometry = await segmentTabs.evaluateAll((tabs) => tabs.map((tab) => {
        const label = tab.querySelector('.muxui-tab-label');
        const style = getComputedStyle(tab);
        return {
          width: tab.getBoundingClientRect().width,
          labelWidth: label?.getBoundingClientRect().width ?? 0,
          padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
        };
      }));
      const segmentWidths = segmentGeometry.map(({ width }) => width);
      assert.ok(new Set(segmentWidths.map((width) => Math.round(width))).size > 1, `${scheme} segment tabs adapt to varied labels`);
      for (const { width, labelWidth, padding } of segmentGeometry) {
        assert.ok(Math.abs(width - labelWidth - padding) < 1, `${scheme} segment tab width follows label plus padding`);
      }

      // Filled variants keep the standard RAC interaction states visible while
      // their selected shape and inverse-contrast layer move underneath.
      for (const variant of ['pill', 'overflow', 'segment']) {
        const variantRoot = `${canvas} #${scheme}-${variant}-tabs`;
        const tab = page.locator(`${variantRoot} [role="tab"]`).nth(variant === 'segment' ? 0 : 1);
        const states = await tab.evaluate((node) => {
          const read = () => {
            const style = getComputedStyle(node);
            return {
              background: style.backgroundColor,
              outline: style.outlineWidth,
              outlineOffset: style.outlineOffset,
              boxShadow: style.boxShadow,
              opacity: style.opacity,
              pointerEvents: style.pointerEvents,
            };
          };
          const base = read();
          node.setAttribute('data-hovered', '');
          const hovered = read();
          node.removeAttribute('data-hovered');
          node.setAttribute('data-pressed', '');
          const pressed = read();
          node.removeAttribute('data-pressed');
          node.setAttribute('data-focus-visible', '');
          const focused = read();
          node.removeAttribute('data-focus-visible');
          node.setAttribute('data-disabled', '');
          const disabled = read();
          node.removeAttribute('data-disabled');
          return { base, hovered, pressed, focused, disabled };
        });
        assert.notEqual(states.hovered.background, states.base.background, `${scheme} ${variant} hover state is visible`);
        assert.notEqual(states.pressed.background, states.base.background, `${scheme} ${variant} pressed state is visible`);
        assert.equal(states.focused.outline, '2px', `${scheme} ${variant} focus outline is visible`);
        assert.equal(states.focused.outlineOffset, '-2px', `${scheme} ${variant} focus outline stays inside the shape`);
        assert.equal(states.focused.boxShadow, 'none', `${scheme} ${variant} focus state avoids a clipped shadow`);
        assert.equal(states.disabled.opacity, '0.45', `${scheme} ${variant} disabled state is visible`);
        assert.equal(states.disabled.pointerEvents, 'none', `${scheme} ${variant} disabled state blocks interaction`);
      }

      await page.locator(`${canvas} #${scheme}-pill-tabs [role="tab"]`).nth(0).click();
      await page.waitForFunction((selector) => document.querySelector(`${selector} [role="tab"][aria-selected="true"]`)?.textContent?.trim() === 'Overview', `${canvas} #${scheme}-pill-tabs`);
      await page.waitForFunction((selector) => {
        const root = document.querySelector(selector);
        const selected = root?.querySelector('[role="tab"][aria-selected="true"]');
        const indicator = root?.querySelector('.muxui-tabs-motion-underline');
        return Boolean(selected && indicator && Math.abs(indicator.getBoundingClientRect().width - selected.getBoundingClientRect().width) < 1);
      }, `${canvas} #${scheme}-pill-tabs`);
      const pillAfter = await readGeometry(page, `${canvas} #${scheme}-pill-tabs`);
      assert.ok(pillAfter.indicator && pillAfter.trigger);
      assert.ok(Math.abs(pillAfter.indicator.width - pillAfter.trigger.width) < 1);
    }

    const motionPill = '#tabs-preview-light #light-pill-tabs';
    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '1200ms'));
    await page.locator(`${motionPill} [role="tab"]`).nth(1).click();
    await page.waitForFunction((selector) => document.querySelector(`${selector} [role="tab"][aria-selected="true"]`)?.textContent?.trim() === 'Activity', motionPill);
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector);
      const selected = root?.querySelector('[role="tab"][aria-selected="true"]');
      const indicator = root?.querySelector('.muxui-tabs-motion-underline');
      return Boolean(selected && indicator && (indicator.getAnimations().length > 0 || Math.abs(indicator.getBoundingClientRect().width - selected.getBoundingClientRect().width) > 0.5));
    }, motionPill);
    await page.locator(`${motionPill} [role="tab"]`).nth(0).click();
    await page.locator('#tabs-preview-light').evaluate((canvas) => canvas.setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector);
      const selected = root?.querySelector('[role="tab"][aria-selected="true"]');
      const indicator = root?.querySelector('.muxui-tabs-motion-underline');
      return Boolean(root?.querySelector('.muxui-tabs-motion')?.hasAttribute('data-muxui-tabs-reduced')
        && selected && indicator && Math.abs(indicator.getBoundingClientRect().width - selected.getBoundingClientRect().width) < 1);
    }, motionPill, { timeout: 1000 });
    await page.locator('#tabs-preview-light').evaluate((canvas) => canvas.removeAttribute('data-muxui-motion'));
    await page.evaluate(() => document.documentElement.style.removeProperty('--muxui-semantic-motion-state-duration'));

    const overflowRoot = '#tabs-preview-light #light-overflow-tabs';
    await page.locator(overflowRoot).evaluate((root) => { root.style.inlineSize = '220px'; });
    await page.waitForFunction((selector) => document.querySelector(`${selector} .muxui-tabs-motion`)?.hasAttribute('data-muxui-tabs-overflow'), overflowRoot);
    const overflowMotion = page.locator(`${overflowRoot} .muxui-tabs-motion`);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs left"]').count(), 1);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs right"]').count(), 1);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs left"]').isDisabled(), true);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs right"]').isDisabled(), false);

    const edgeStates = await overflowMotion.locator('button[aria-label="Scroll tabs right"]').evaluate((node) => {
      const read = () => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, image: style.backgroundImage, outline: style.outlineWidth };
      };
      const base = read();
      node.setAttribute('data-hovered', '');
      const hovered = read();
      node.removeAttribute('data-hovered');
      node.setAttribute('data-pressed', '');
      const pressed = read();
      node.removeAttribute('data-pressed');
      node.focus();
      const focused = read();
      return { base, hovered, pressed, focused };
    });
    assert.notEqual(edgeStates.hovered.image, 'none', 'overflow next hover state is visible');
    assert.notEqual(edgeStates.pressed.image, 'none', 'overflow next pressed state is visible');
    assert.ok(parseFloat(edgeStates.focused.outline) >= 2, 'overflow next focus state is visible');
    const disabledEdge = await overflowMotion.locator('button[aria-label="Scroll tabs left"]').evaluate((node) => ({
      opacity: getComputedStyle(node).opacity,
      iconOpacity: getComputedStyle(node.querySelector('svg')).opacity,
      background: getComputedStyle(node).backgroundColor,
    }));
    assert.equal(disabledEdge.opacity, '1', 'disabled overflow edge keeps its opaque mask');
    assert.equal(disabledEdge.iconOpacity, '0.45', 'disabled overflow edge communicates through its icon');
    assert.notEqual(disabledEdge.background, 'rgba(0, 0, 0, 0)', 'disabled overflow edge keeps a base surface');

    // The shape and inverse-contrast layer must share one geometry timeline.
    // This catches the screenshot regression at intermediate selection frames,
    // including the native reveal scroll that happens before RAC updates ARIA.
    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '900ms'));
    await overflowMotion.locator('[role="tab"]').filter({ hasText: 'Team' }).click();
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() === 'Team');
    const contrastSamples = [];
    for (let index = 0; index < 8; index += 1) {
      contrastSamples.push(await overflowMotion.evaluate((root) => {
        const selected = root.querySelector('[role="tab"][aria-selected="true"]');
        const label = selected?.querySelector('.muxui-tab-label');
        const foreground = root.querySelector('.muxui-tabs-motion-foreground');
        const indicator = root.querySelector('.muxui-tabs-motion-underline');
        const copy = [...(foreground?.querySelectorAll('.muxui-tabs-motion-label') ?? [])]
          .find((node) => node.textContent?.trim() === selected?.textContent?.trim());
        const rangeRect = (node) => {
          if (!node) return null;
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        };
        const indicatorRect = indicator?.getBoundingClientRect();
        const foregroundRect = foreground?.getBoundingClientRect();
        const clip = foreground ? getComputedStyle(foreground).clipPath : '';
        const clipValues = clip.match(/^inset\(([-\d.]+)px calc\(100% - ([-\d.]+)px\) calc\(100% - ([-\d.]+)px\) ([-\d.]+)px/u);
        const left = (indicatorRect?.left ?? 0) - (foregroundRect?.left ?? 0);
        const top = (indicatorRect?.top ?? 0) - (foregroundRect?.top ?? 0);
        return {
          aligned: Boolean(label && copy && Math.abs(rangeRect(label).left - rangeRect(copy).left) < 0.5
            && Math.abs(rangeRect(label).top - rangeRect(copy).top) < 0.5),
          clipAligned: Boolean(clipValues && indicatorRect && foregroundRect
            && Math.abs(Number(clipValues[1]) - top) < 0.75
            && Math.abs(Number(clipValues[2]) - (left + indicatorRect.width)) < 0.75
            && Math.abs(Number(clipValues[3]) - (top + indicatorRect.height)) < 0.75
            && Math.abs(Number(clipValues[4]) - left) < 0.75),
          originalColor: label ? getComputedStyle(label).color : '',
          contrastColor: copy ? getComputedStyle(copy).color : '',
          indicatorWidth: indicatorRect?.width ?? 0,
          selectedWidth: selected?.getBoundingClientRect().width ?? 0,
        };
      }));
      await page.waitForTimeout(60);
    }
    assert.ok(contrastSamples.every(({ aligned, clipAligned }) => aligned && clipAligned), 'selected text and mask stay aligned during overflow selection');
    assert.ok(contrastSamples.some(({ indicatorWidth, selectedWidth }) => Math.abs(indicatorWidth - selectedWidth) > 0.5), 'selection captures an intermediate shape position');
    const settledContrast = contrastSamples.at(-1);
    assert.notEqual(settledContrast.originalColor, settledContrast.contrastColor, 'selected contrast text uses the inverse foreground layer');

    const overflowViewport = overflowMotion.locator('.muxui-tabs-motion-overflow-viewport');
    await overflowViewport.evaluate((node) => { node.scrollLeft = 0; });
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs button[aria-label="Scroll tabs left"]')?.disabled);
    const initialScroll = await overflowViewport.evaluate((node) => node.scrollLeft);
    await overflowMotion.locator('button[aria-label="Scroll tabs right"]').click();
    await page.waitForTimeout(80);
    const inFlightScroll = await overflowViewport.evaluate((node) => node.scrollLeft);
    assert.ok(inFlightScroll > initialScroll, 'next arrow starts an animated scroll');
    const maxScroll = await overflowViewport.evaluate((node) => node.scrollWidth - node.clientWidth);
    assert.ok(inFlightScroll < maxScroll - 0.5, 'next arrow remains observable before settling');
    const reversalStart = await overflowMotion.evaluate((root) => {
      const position = root.querySelector('.muxui-tabs-motion-overflow-viewport').scrollLeft;
      root.querySelector('button[aria-label="Scroll tabs left"]').click();
      return position;
    });
    await page.waitForTimeout(80);
    const reversedScroll = await overflowViewport.evaluate((node) => node.scrollLeft);
    assert.ok(reversedScroll < reversalStart, `opposite arrow interrupts and reverses the scroll (${reversalStart} -> ${reversedScroll})`);
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs .muxui-tabs-motion-overflow-viewport')?.scrollLeft < 1);

    const scrollDestination = await overflowViewport.evaluate((node) => Math.min(node.scrollWidth - node.clientWidth, node.scrollLeft + node.clientWidth * 0.8));
    await overflowMotion.locator('button[aria-label="Scroll tabs right"]').click();
    await page.waitForFunction((destination) => {
      const offset = document.querySelector('#light-overflow-tabs .muxui-tabs-motion-overflow-viewport').scrollLeft;
      return offset > 1 && offset < destination - 1;
    }, scrollDestination);
    await page.locator(overflowRoot).evaluate((root) => root.setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs .muxui-tabs-motion')?.hasAttribute('data-muxui-tabs-reduced'));
    assert.ok(Math.abs(await overflowViewport.evaluate((node) => node.scrollLeft) - scrollDestination) < 1, 'enabling reduced motion settles an active scroll at its destination');
    await overflowMotion.locator('button[aria-label="Scroll tabs left"]').click();
    const reducedScrollBefore = await overflowViewport.evaluate((node) => node.scrollLeft);
    await overflowMotion.locator('button[aria-label="Scroll tabs right"]').click();
    const reducedScrollAfter = await overflowViewport.evaluate((node) => node.scrollLeft);
    assert.ok(reducedScrollAfter > reducedScrollBefore, 'reduced motion scrolls immediately');
    await page.locator(overflowRoot).evaluate((root) => root.removeAttribute('data-muxui-motion'));
    await page.evaluate(() => document.documentElement.style.removeProperty('--muxui-semantic-motion-state-duration'));

    await overflowMotion.locator('.muxui-tabs-motion-overflow-viewport').evaluate((node) => { node.scrollLeft = 8; });
    await page.waitForFunction(() => !document.querySelector('#light-overflow-tabs button[aria-label="Scroll tabs left"]')?.disabled);
    const beforeScroll = await overflowMotion.locator('.muxui-tabs-motion-overflow-viewport').evaluate((node) => node.scrollLeft);
    await overflowMotion.locator('button[aria-label="Scroll tabs right"]').click();
    await page.waitForFunction((before) => document.querySelector('#tabs-preview-light #light-overflow-tabs .muxui-tabs-motion-overflow-viewport')?.scrollLeft > before, beforeScroll);
    await page.waitForFunction(() => !document.querySelector('#tabs-preview-light #light-overflow-tabs button[aria-label="Scroll tabs left"]')?.disabled);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs left"]').isDisabled(), false);

    await overflowMotion.locator('[role="tab"]').first().focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('#tabs-preview-light #light-overflow-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() === 'Billing');
    await page.waitForFunction(() => {
      const root = document.querySelector('#tabs-preview-light #light-overflow-tabs');
      const selected = root?.querySelector('[role="tab"][aria-selected="true"]');
      const indicator = root?.querySelector('.muxui-tabs-motion-underline');
      return Boolean(selected && indicator && Math.abs(indicator.getBoundingClientRect().width - selected.getBoundingClientRect().width) < 1);
    });
    const overflowAfter = await readGeometry(page, overflowRoot);
    assert.ok(overflowAfter.trigger && overflowAfter.indicator);
    assert.ok(Math.abs(overflowAfter.indicator.width - overflowAfter.trigger.width) < 1);
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector);
      const selected = root.querySelector('[role="tab"][aria-selected="true"]').getBoundingClientRect();
      const left = root.querySelector('button[aria-label="Scroll tabs left"]').getBoundingClientRect();
      const right = root.querySelector('button[aria-label="Scroll tabs right"]').getBoundingClientRect();
      return selected.left >= left.right - 1 && selected.right <= right.left + 1;
    }, overflowRoot);
    const overflowFocus = await overflowMotion.locator('[role="tab"][aria-selected="true"]').evaluate((tab) => ({
      shadow: getComputedStyle(tab).boxShadow, offset: getComputedStyle(tab).outlineOffset,
    }));
    assert.equal(overflowFocus.shadow, 'none', 'overflow uses an inset focus outline rather than a clipped outer shadow');
    assert.equal(overflowFocus.offset, '-2px');

    const verticalRoot = '#tabs-preview-dark #dark-vertical-overflow-tabs';
    await page.waitForFunction((selector) => document.querySelector(`${selector} .muxui-tabs-motion`)?.hasAttribute('data-muxui-tabs-overflow'), verticalRoot);
    const verticalMotion = page.locator(`${verticalRoot} .muxui-tabs-motion`);
    assert.equal(await verticalMotion.locator('button[aria-label="Scroll tabs up"]').count(), 1);
    assert.equal(await verticalMotion.locator('button[aria-label="Scroll tabs down"]').count(), 1);
    assert.equal(await verticalMotion.locator('button:enabled').count(), 0, 'disabling Tabs also disables its scroll controls');
    const verticalScroll = await verticalMotion.locator('.muxui-tabs-motion-overflow-viewport').evaluate((node) => node.scrollTop);
    assert.ok(verticalScroll > 0, 'vertical overflow reveals the default selected tab');

    await page.locator('#tabs-preview-dark #dark-overflow-tabs').evaluate((root) => { root.dir = 'rtl'; });
    await page.waitForFunction(() => document.querySelector('#tabs-preview-dark #dark-overflow-tabs .muxui-tabs-motion')?.dataset.muxuiTabsDirection === 'rtl');
    const rtlMotion = page.locator('#tabs-preview-dark #dark-overflow-tabs .muxui-tabs-motion');
    const rtlBeforeScroll = await rtlMotion.locator('.muxui-tabs-motion-overflow-viewport').evaluate((node) => node.scrollLeft);
    await rtlMotion.locator('button[aria-label="Scroll tabs left"]').click();
    await page.waitForFunction((before) => document.querySelector('#tabs-preview-dark #dark-overflow-tabs .muxui-tabs-motion-overflow-viewport')?.scrollLeft < before, rtlBeforeScroll);
    await rtlMotion.locator('[role="tab"]').last().click();
    await page.waitForFunction(() => document.querySelector('#tabs-preview-dark #dark-overflow-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() === 'Billing');
    assert.equal(await page.locator('#tabs-preview-light #light-overflow-tabs [role="tab"][aria-selected="true"]').textContent(), 'Billing', 'instances remain independent');

    const segmentRoot = '#tabs-preview-light #light-segment-tabs';
    await page.locator(`${segmentRoot} [role="tab"]`).last().click();
    await page.waitForFunction((selector) => document.querySelector(`${selector} [role="tab"][aria-selected="true"]`)?.textContent?.trim() === 'Month', segmentRoot);
    assert.equal(await page.locator(`${segmentRoot} .muxui-tab-panel:not([data-hidden])`).textContent(), 'Month');

    const pillTabs = page.locator(`${motionPill} [role="tab"]`);
    await pillTabs.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator(`${motionPill} [role="tab"][aria-selected="true"]`).textContent(), 'Overview', 'manual activation keeps selection while focus moves');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(`${motionPill} [role="tab"][aria-selected="true"]`).textContent(), 'Activity');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Settings', 'keyboard navigation skips disabled tabs');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const root = document.querySelector('#light-pill-tabs');
      const shape = root.querySelector('.muxui-tabs-motion-underline').getBoundingClientRect();
      const selected = root.querySelector('[role="tab"][aria-selected="true"]').getBoundingClientRect();
      return Math.abs(shape.left - selected.left) < 1 && Math.abs(shape.width - selected.width) < 1;
    });
    const foreground = await page.locator(`${motionPill} .muxui-tabs-motion-foreground`).evaluate((node) => ({
      hidden: node.getAttribute('aria-hidden'), inert: node.inert, clip: getComputedStyle(node).clipPath,
      labels: node.children.length, duplicateIds: node.querySelectorAll('[id]').length,
    }));
    assert.equal(foreground.hidden, 'true');
    assert.equal(foreground.inert, true);
    assert.equal(foreground.labels, 4);
    assert.equal(foreground.duplicateIds, 0);
    assert.notEqual(foreground.clip, 'inset(100%)', 'contrast layer follows the measured shape');
    const textAlignment = await page.locator(motionPill).evaluate((root) => {
      const textBounds = (node) => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect(); };
      const original = textBounds(root.querySelector('[role="tab"][aria-selected="true"] .muxui-tab-label'));
      const copy = textBounds(root.querySelectorAll('.muxui-tabs-motion-label')[2]);
      return Math.abs(original.left - copy.left) < 0.5 && Math.abs(original.top - copy.top) < 0.5;
    });
    assert.ok(textAlignment, 'contrast text stays aligned with its original label');
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await page.locator(`${motionPill} .muxui-tabs-motion-foreground`).evaluate((node) => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator(`${motionPill} [role="tab"][aria-selected="true"]`).evaluate((node) => getComputedStyle(node).forcedColorAdjust), 'none');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});

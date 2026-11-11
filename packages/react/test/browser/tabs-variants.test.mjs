import assert from 'node:assert/strict';
import test from 'node:test';
import { recordFrames } from '../fixtures/frame-recorder.mjs';
import { awaitFontsAndFrames, launchBrowser, startServer } from './harness.mjs';
import { assertCrossesCorners, assertCrossesSelected, assertFillClear, assertJumped, assertLayerColor, assertSkipsItem, assertTravelled, faded, pointOnto, settledOn, travel } from './hover-layer-probes.mjs';

async function readGeometry(page, selector) {
  return page.locator(selector).evaluate((root) => {
    const selected = root.querySelector('[role="tab"][aria-selected="true"]');
    const label = selected?.querySelector('.muxui-tabs__tab-label');
    const indicator = root.querySelector('.muxui-tabs__motion-underline');
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

// Each overflow edge is a circle the size of a tab, set in from the rail's end as far as the tabs are
// from its sides and centred across it. Tabs clip at its inner edge, and its icon sits on its centre.
async function assertRoundEdges(rail, scrollAxis, message) {
  const edges = await rail.evaluate((node, axis) => {
    const [size, start, end, across, acrossStart] = axis === 'x' ? ['width', 'left', 'right', 'height', 'top'] : ['height', 'top', 'bottom', 'width', 'left'];
    const railBox = node.getBoundingClientRect();
    const tabBox = node.querySelector('[role="tab"]').getBoundingClientRect();
    const clip = getComputedStyle(node.querySelector('.muxui-tabs__motion-overflow-viewport')).clipPath.match(/[\d.]+/gu).map(Number);
    return [...node.querySelectorAll('.muxui-tabs__motion-edge')].map((edge) => {
      const edgeBox = edge.getBoundingClientRect();
      const iconBox = edge.querySelector('svg').getBoundingClientRect();
      const style = getComputedStyle(edge);
      return {
        width: edgeBox.width,
        height: edgeBox.height,
        tabHeight: tabBox.height,
        radius: Math.min(...['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((corner) => parseFloat(style[`border${corner}Radius`]))),
        endGap: Math.min(edgeBox[start] - railBox[start], railBox[end] - edgeBox[end]),
        tabInset: (railBox[across] - tabBox[across]) / 2,
        offCentre: edgeBox[acrossStart] + edgeBox[across] / 2 - (railBox[acrossStart] + railBox[across] / 2),
        iconOffset: Math.hypot(iconBox.left + iconBox.width / 2 - edgeBox.left - edgeBox.width / 2, iconBox.top + iconBox.height / 2 - edgeBox.top - edgeBox.height / 2),
        length: edgeBox[size],
        clip: axis === 'x' ? clip[1] : clip[0],
      };
    });
  }, scrollAxis);
  assert.equal(edges.length, 2, `${message}: two edges`);
  const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.5, `${message}: ${what} (${actual}, wanted ${expected})`);
  for (const edge of edges) {
    close(edge.width, edge.tabHeight, 'edge width matches the tab height');
    close(edge.height, edge.tabHeight, 'edge height matches the tab height');
    assert.ok(edge.radius >= edge.width / 2, `${message}: edge is a full circle (${edge.radius})`);
    close(edge.endGap, edge.tabInset, 'edge is set in from the rail end as far as the tabs are from its sides');
    close(edge.offCentre, 0, 'edge is centred across the rail');
    close(edge.iconOffset, 0, 'chevron sits on the edge centre');
    close(edge.clip, edge.endGap + edge.length, 'tabs clip at the inner edge of the circle');
  }
}

// One frame of the contrast tabs: selected text against its foreground-layer copy, and the mask against the shape.
function sampleContrast(selector) {
  const root = document.querySelector(selector);
  const selected = root.querySelector('[role="tab"][aria-selected="true"]');
  const label = selected?.querySelector('.muxui-tabs__tab-label');
  const foreground = root.querySelector('.muxui-tabs__motion-foreground');
  const indicator = root.querySelector('.muxui-tabs__motion-underline');
  const copy = [...(foreground?.querySelectorAll('.muxui-tabs__motion-label') ?? [])]
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
}

const STATE_DURATIONS = ['--muxui-semantic-motion-state-duration', '--muxui-semantic-motion-state-transition-duration', '--muxui-semantic-motion-state-transition-spring-visual-duration'];

// Hover needs only a short state motion; other steps of this test set a slow one to observe selection travel.
function setStateDuration(page, duration) {
  return page.evaluate(([properties, value]) => {
    for (const property of properties) {
      if (value) document.documentElement.style.setProperty(property, value);
      else document.documentElement.style.removeProperty(property);
    }
  }, [STATE_DURATIONS, duration]);
}

test('Tabs variants render A contrast geometry, overflow affordances, and isolated motion', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ entries: ['test/fixtures/tabs-variant-preview-browser-entry.mjs'] });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/test/fixtures/tabs-variant-preview.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiTabsHydrated === 'true');
    await awaitFontsAndFrames(page);
    // The first styles are read at once, so let the transitions that hydration starts finish.
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
    assert.deepEqual(errors, []);

    const initialLabel = page.locator('#light-underline-tabs [aria-selected="true"] .muxui-tabs__tab-label');
    await initialLabel.evaluate((label) => { label.style.letterSpacing = '3px'; });
    const initialLabelAligned = () => {
      const root = document.querySelector('#light-underline-tabs');
      const label = root.querySelector('[aria-selected="true"] .muxui-tabs__tab-label').getBoundingClientRect();
      const indicator = root.querySelector('.muxui-tabs__motion-underline').getBoundingClientRect();
      return Math.abs(label.width - indicator.width) < 1;
    };
    await page.waitForFunction(initialLabelAligned);
    await initialLabel.evaluate((label) => { label.style.letterSpacing = ''; });
    await page.waitForFunction(initialLabelAligned);

    for (const scheme of ['light', 'dark']) {
      const canvas = `#tabs-preview-${scheme}`;
      for (const variant of ['underline', 'pill', 'overflow', 'segment']) {
        const root = `${canvas} #${scheme}-${variant}-tabs`;
        assert.equal(await page.locator(root).getAttribute('data-muxui-variant'), variant);
        assert.equal(await page.locator(`${root} .muxui-tabs__motion`).getAttribute('data-muxui-tabs-variant'), variant);
      }

      const underline = await readGeometry(page, `${canvas} #${scheme}-underline-tabs`);
      assert.ok(underline.label && underline.indicator);
      assert.ok(Math.abs(underline.indicator.width - underline.label.width) < 1, `${scheme} underline follows label width`);

      const pill = await readGeometry(page, `${canvas} #${scheme}-pill-tabs`);
      assert.ok(pill.trigger && pill.indicator);
      assert.ok(Math.abs(pill.indicator.width - pill.trigger.width) < 1, `${scheme} pill follows trigger width`);
      assert.notEqual(await page.locator(`${canvas} #${scheme}-pill-tabs .muxui-tabs__motion-underline`).evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');

      const segmentTabs = page.locator(`${canvas} #${scheme}-segment-tabs [role="tab"]`);
      const segmentGeometry = await segmentTabs.evaluateAll((tabs) => tabs.map((tab) => {
        const label = tab.querySelector('.muxui-tabs__tab-label');
        const style = getComputedStyle(tab);
        return {
          width: tab.getBoundingClientRect().width,
          labelWidth: label?.getBoundingClientRect().width ?? 0,
          padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
          minWidth: parseFloat(style.minWidth),
        };
      }));
      const segmentWidths = segmentGeometry.map(({ width }) => width);
      assert.ok(new Set(segmentWidths.map((width) => Math.round(width))).size > 1, `${scheme} segment tabs adapt to varied labels`);
      for (const { width, labelWidth, padding, minWidth } of segmentGeometry) {
        assert.equal(minWidth, 80, `${scheme} segment tab keeps its 5rem minimum`);
        assert.ok(Math.abs(width - Math.max(labelWidth + padding, minWidth)) < 1, `${scheme} segment tab width follows label plus padding above its minimum`);
      }

      // The settled shape, its foreground label and the pre-hydration tab are a light fill with dark text in
      // both schemes: the lightest neutral of each, neutral-5 in light and neutral-100 in dark, with its
      // foreground and the indicator elevation. A probe in this canvas resolves the same tokens, so no colour is hard-coded.
      const fill = scheme === 'dark' ? 'neutral-100' : 'neutral-5';
      const filledPaint = await page.locator(canvas).evaluate((canvasNode, [id, step]) => {
        const probe = document.createElement('div');
        probe.style.cssText = `background-color: var(--muxui-semantic-color-${step}); color: var(--muxui-semantic-color-${step}-fg); box-shadow: var(--muxui-semantic-elevation-indicator)`;
        canvasNode.append(probe);
        const read = (style) => ({ background: style.backgroundColor, color: style.color, shadow: style.boxShadow });
        const wanted = read(getComputedStyle(probe));
        probe.remove();
        const settled = ['pill', 'segment', 'overflow'].map((variant) => {
          const root = canvasNode.querySelector(`#${id}-${variant}-tabs`);
          const shape = read(getComputedStyle(root.querySelector('.muxui-tabs__motion-underline')));
          const label = read(getComputedStyle(root.querySelector('.muxui-tabs__motion-label')));
          return { variant, shape: { background: shape.background, shadow: shape.shadow }, label: { color: label.color } };
        });
        const motion = canvasNode.querySelector(`#${id}-pill-tabs .muxui-tabs__motion`);
        const tab = motion.querySelector('[role="tab"][aria-selected="true"]');
        tab.style.transition = 'none';
        motion.removeAttribute('data-muxui-tabs-ready');
        const beforeHydration = read(getComputedStyle(tab));
        motion.setAttribute('data-muxui-tabs-ready', '');
        void tab.offsetWidth; // Flush while transitions are off so restoring does not fade the tab.
        tab.style.transition = '';
        return { wanted, settled, beforeHydration };
      }, [scheme, fill]);
      for (const { variant, shape, label } of filledPaint.settled) {
        assert.equal(shape.background, filledPaint.wanted.background, `${scheme} ${variant} shape uses the ${fill} background`);
        assert.equal(shape.shadow, filledPaint.wanted.shadow, `${scheme} ${variant} shape carries the indicator elevation`);
        assert.equal(label.color, filledPaint.wanted.color, `${scheme} ${variant} foreground label uses the ${fill} foreground`);
      }
      assert.deepEqual(filledPaint.beforeHydration, filledPaint.wanted, `${scheme} pill selected tab matches the settled shape before hydration`);

      // Filled variants keep the standard RAC interaction states visible while
      // their selected shape and foreground layer move underneath.
      for (const variant of ['pill', 'overflow', 'segment']) {
        const variantRoot = `${canvas} #${scheme}-${variant}-tabs`;
        const tab = page.locator(`${variantRoot} [role="tab"]`).nth(variant === 'overflow' ? 1 : 0);
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
          node.setAttribute('data-muxui-state-pressed', '');
          const pressed = read();
          node.removeAttribute('data-muxui-state-pressed');
          node.setAttribute('data-muxui-state-focus-visible', '');
          const focused = read();
          node.removeAttribute('data-muxui-state-focus-visible');
          node.setAttribute('data-muxui-state-disabled', '');
          const disabled = read();
          node.removeAttribute('data-muxui-state-disabled');
          return { base, pressed, focused, disabled };
        });
        assert.notEqual(states.pressed.background, states.base.background, `${scheme} ${variant} pressed state is visible`);
        assert.equal(states.focused.outline, '2px', `${scheme} ${variant} focus outline is visible`);
        assert.equal(states.focused.outlineOffset, '-2px', `${scheme} ${variant} unselected focus outline stays inside the shape`);
        assert.equal(states.focused.boxShadow, 'none', `${scheme} ${variant} focus state avoids a clipped shadow`);
        assert.equal(states.disabled.opacity, '0.45', `${scheme} ${variant} disabled state is visible`);
        assert.equal(states.disabled.pointerEvents, 'none', `${scheme} ${variant} disabled state blocks interaction`);

        // A forced hover state, with no pointer, paints through the hover layer once the motion is ready.
        const hover = { page, layer: `${variantRoot} .muxui-tabs__hover`, items: `${variantRoot} [role="tab"]` };
        const hoverIndex = variant === 'overflow' ? 1 : 0;
        await tab.evaluate((node) => node.setAttribute('data-muxui-state-hovered', ''));
        await settledOn(hover, hoverIndex);
        await assertFillClear(hover, hoverIndex, `${scheme} ${variant} hovered tab leaves its fill to the hover layer`);
        await assertLayerColor(hover, 'var(--muxui-semantic-action-neutral-background-hover)', `${scheme} ${variant} hover layer paints the unselected hover colour`);
        const layerRadius = await page.locator(hover.layer).evaluate((node) => getComputedStyle(node).borderTopLeftRadius);
        const tabRadius = await tab.evaluate((node) => getComputedStyle(node).borderTopLeftRadius);
        assert.equal(layerRadius, tabRadius, `${scheme} ${variant} hover layer has the radius of its tab`);
        await tab.evaluate((node) => node.removeAttribute('data-muxui-state-hovered'));
        await faded(hover);
      }

      // Selected tabs preserve their moving identity while the selected-only
      // hover background and keyboard-visible focus ring remain independently visible.
      for (const variant of ['underline', 'pill', 'overflow', 'segment']) {
        const variantRoot = `${canvas} #${scheme}-${variant}-tabs`;
        const selectedTab = page.locator(`${variantRoot} [role="tab"][aria-selected="true"]`);
        const states = await selectedTab.evaluate((node) => {
          const read = () => {
            const style = getComputedStyle(node);
            return {
              background: style.backgroundColor,
              boxShadow: style.boxShadow,
              outline: style.outlineWidth,
              outlineOffset: style.outlineOffset,
              outlineColor: style.outlineColor,
              pointerEvents: style.pointerEvents,
              opacity: style.opacity,
            };
          };
          const base = read();
          node.setAttribute('data-muxui-state-hovered', '');
          const hovered = read();
          node.setAttribute('data-muxui-state-focus-visible', '');
          const focusHovered = read();
          node.removeAttribute('data-muxui-state-hovered');
          const focused = read();
          node.removeAttribute('data-muxui-state-focus-visible');
          node.setAttribute('data-muxui-state-disabled', '');
          const disabled = read();
          node.removeAttribute('data-muxui-state-disabled');
          return { base, hovered, focused, focusHovered, disabled };
        });
        assert.equal(states.base.boxShadow, 'none', `${scheme} ${variant} selected tab starts without a focus or hover shadow`);
        // Filled variants keep a wash on the selected tab itself; the underline tab leaves all of its hover to the layer.
        const tabPaintsHover = variant !== 'underline';
        (tabPaintsHover ? assert.notEqual : assert.equal)(states.hovered.background, states.base.background, `${scheme} ${variant} selected hover background is owned by ${tabPaintsHover ? 'the tab' : 'the layer'}`);
        assert.equal(states.hovered.boxShadow, 'none', `${scheme} ${variant} selected hover does not add a shadow`);
        assert.equal(states.focused.outline, '2px', `${scheme} ${variant} selected keyboard focus ring is visible`);
        assert.equal(states.focused.outlineOffset, '2px', `${scheme} ${variant} selected focus ring keeps its separation`);
        assert.notEqual(states.focused.outlineColor, 'rgba(0, 0, 0, 0)', `${scheme} ${variant} selected focus ring has a semantic color`);
        assert.equal(states.focused.boxShadow, 'none', `${scheme} ${variant} selected focus ring does not mask its moving layer`);
        (tabPaintsHover ? assert.notEqual : assert.equal)(states.focusHovered.background, states.base.background, `${scheme} ${variant} selected hover plus focus keeps the same owner of the hover background`);
        assert.equal(states.focusHovered.boxShadow, 'none', `${scheme} ${variant} selected hover plus focus does not add a shadow`);
        assert.equal(states.disabled.background, states.base.background, `${scheme} ${variant} disabled selected tab has no hover background`);
        assert.equal(states.disabled.boxShadow, states.base.boxShadow, `${scheme} ${variant} disabled selected tab has no hover shadow`);
        assert.equal(states.disabled.opacity, '0.45', `${scheme} ${variant} disabled selected tab keeps disabled opacity`);
        assert.equal(states.disabled.pointerEvents, 'none', `${scheme} ${variant} disabled selected tab blocks interaction`);

        if (variant === 'underline') {
          // The layer also covers the selected underline tab, in the surface hover colour.
          const hover = { page, layer: `${variantRoot} .muxui-tabs__hover`, items: `${variantRoot} [role="tab"]` };
          const selectedIndex = await selectedTab.evaluate((node) => [...node.parentElement.children].indexOf(node));
          await selectedTab.evaluate((node) => node.setAttribute('data-muxui-state-hovered', ''));
          await settledOn(hover, selectedIndex);
          await assertLayerColor(hover, 'var(--muxui-semantic-surface-hover)', `${scheme} underline hover layer paints the surface hover colour`);
          await selectedTab.evaluate((node) => node.removeAttribute('data-muxui-state-hovered'));
          await faded(hover);
        }
      }

      await page.locator(`${canvas} #${scheme}-pill-tabs [role="tab"]`).nth(0).click();
      await page.waitForFunction((selector) => document.querySelector(`${selector} [role="tab"][aria-selected="true"]`)?.textContent?.trim() === 'Overview', `${canvas} #${scheme}-pill-tabs`);
      await page.waitForFunction((selector) => {
        const root = document.querySelector(selector);
        const selected = root?.querySelector('[role="tab"][aria-selected="true"]');
        const indicator = root?.querySelector('.muxui-tabs__motion-underline');
        return Boolean(selected && indicator && Math.abs(indicator.getBoundingClientRect().width - selected.getBoundingClientRect().width) < 1);
      }, `${canvas} #${scheme}-pill-tabs`);
      const pillAfter = await readGeometry(page, `${canvas} #${scheme}-pill-tabs`);
      assert.ok(pillAfter.indicator && pillAfter.trigger);
      assert.ok(Math.abs(pillAfter.indicator.width - pillAfter.trigger.width) < 1);
    }

    const motionPill = '#tabs-preview-light #light-pill-tabs';
    await page.evaluate(() => { document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '1200ms'); document.documentElement.style.setProperty('--muxui-semantic-motion-state-transition-duration', '1200ms'); });
    await page.locator(`${motionPill} [role="tab"]`).nth(1).click();
    await page.waitForFunction((selector) => document.querySelector(`${selector} [role="tab"][aria-selected="true"]`)?.textContent?.trim() === 'Activity', motionPill);
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector);
      const selected = root?.querySelector('[role="tab"][aria-selected="true"]');
      const indicator = root?.querySelector('.muxui-tabs__motion-underline');
      return Boolean(selected && indicator && (indicator.getAnimations().length > 0 || Math.abs(indicator.getBoundingClientRect().width - selected.getBoundingClientRect().width) > 0.5));
    }, motionPill);
    await page.locator(`${motionPill} [role="tab"]`).nth(0).click();
    await page.locator('#tabs-preview-light').evaluate((canvas) => canvas.setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector);
      const selected = root?.querySelector('[role="tab"][aria-selected="true"]');
      const indicator = root?.querySelector('.muxui-tabs__motion-underline');
      return Boolean(root?.querySelector('.muxui-tabs__motion')?.hasAttribute('data-muxui-tabs-reduced')
        && selected && indicator && Math.abs(indicator.getBoundingClientRect().width - selected.getBoundingClientRect().width) < 1);
    }, motionPill, { timeout: 1000 });
    await page.locator('#tabs-preview-light').evaluate((canvas) => canvas.removeAttribute('data-muxui-motion'));
    await page.evaluate(() => { document.documentElement.style.removeProperty('--muxui-semantic-motion-state-duration'); document.documentElement.style.removeProperty('--muxui-semantic-motion-state-transition-duration'); });

    // With the real pointer, one hover layer travels between pill tabs, skips the disabled one, and rides under the selected one.
    const pillHover = { page, layer: `${motionPill} .muxui-tabs__hover`, items: `${motionPill} [role="tab"]` };
    await setStateDuration(page, '160ms');
    assertTravelled(await travel(pillHover, 1, 2), 'pill hover');
    await assertCrossesCorners(pillHover, 1, 'pill hover along the top edge');
    await assertSkipsItem(pillHover, 2, 3, 'disabled pill tab');
    await pointOnto(pillHover, 0);
    await settledOn(pillHover, 0);
    assert.notEqual(await page.locator(`${motionPill} [role="tab"]`).first().evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'selected pill tab keeps its own hover wash');
    // The segment's selected tab sits between its neighbours: the layer crosses it, under the shape, and comes out the other side.
    const segmentHover = { page, layer: '#tabs-preview-light #light-segment-tabs .muxui-tabs__hover', items: '#tabs-preview-light #light-segment-tabs [role="tab"]' };
    await assertCrossesSelected(segmentHover, 0, 1, 2, 'segment hover crossing the selected tab');
    await assertCrossesCorners(segmentHover, 1, 'segment hover along the top edge');
    await page.locator('#tabs-preview-light').evaluate((canvas) => canvas.setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction((selector) => document.querySelector(selector)?.hasAttribute('data-muxui-hover-reduced'), pillHover.layer);
    assertJumped(await travel(pillHover, 1, 2), 'reduced pill hover');
    await page.locator('#tabs-preview-light').evaluate((canvas) => canvas.removeAttribute('data-muxui-motion'));
    await page.mouse.move(0, 0);
    await setStateDuration(page);

    const overflowRoot = '#tabs-preview-light #light-overflow-tabs';
    await page.locator(overflowRoot).evaluate((root) => { root.style.inlineSize = '220px'; });
    await page.waitForFunction((selector) => document.querySelector(`${selector} .muxui-tabs__motion`)?.hasAttribute('data-muxui-tabs-overflow'), overflowRoot);
    const overflowMotion = page.locator(`${overflowRoot} .muxui-tabs__motion`);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs left"]').count(), 1);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs right"]').count(), 1);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs left"]').isDisabled(), true);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs right"]').isDisabled(), false);

    const edgeStates = await overflowMotion.locator('button[aria-label="Scroll tabs right"]').evaluate((node) => {
      const read = () => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, image: style.backgroundImage, outline: style.outlineWidth, shadow: style.boxShadow };
      };
      const base = read();
      node.setAttribute('data-muxui-state-hovered', '');
      const hovered = read();
      node.removeAttribute('data-muxui-state-hovered');
      node.setAttribute('data-muxui-state-pressed', '');
      const pressed = read();
      node.removeAttribute('data-muxui-state-pressed');
      node.focus();
      const focused = read();
      return { base, hovered, pressed, focused };
    });
    assert.notEqual(edgeStates.hovered.image, 'none', 'overflow next hover state is visible');
    assert.notEqual(edgeStates.pressed.image, 'none', 'overflow next pressed state is visible');
    assert.ok(parseFloat(edgeStates.focused.outline) >= 2, 'overflow next focus state is visible');
    assert.equal(edgeStates.focused.shadow, 'none', 'overflow next focus is one ring, like a tab');
    const disabledEdge = await overflowMotion.locator('button[aria-label="Scroll tabs left"]').evaluate((node) => {
      const viewport = node.parentElement?.querySelector('.muxui-tabs__motion-overflow-viewport');
      return {
        opacity: getComputedStyle(node).opacity,
        iconOpacity: getComputedStyle(node.querySelector('svg')).opacity,
        background: getComputedStyle(node).backgroundColor,
        viewportClip: viewport ? getComputedStyle(viewport).clipPath : '',
      };
    });
    assert.equal(disabledEdge.opacity, '1', 'disabled overflow edge keeps its opacity');
    assert.equal(disabledEdge.iconOpacity, '0.45', 'disabled overflow edge communicates through its icon');
    assert.equal(disabledEdge.background, 'rgba(0, 0, 0, 0)', 'disabled overflow edge keeps the rail visible through its transparent background');
    assert.match(disabledEdge.viewportClip, /^inset\(0px [\d.]+px\)$/u, 'overflow viewport clips content behind its horizontal edges');
    await assertRoundEdges(overflowMotion, 'x', 'horizontal overflow');

    // The shape and foreground layer must share one geometry timeline.
    // This catches the screenshot regression at intermediate selection frames,
    // including the native reveal scroll that happens before RAC updates ARIA.
    await page.evaluate(() => { document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '900ms'); document.documentElement.style.setProperty('--muxui-semantic-motion-state-transition-duration', '900ms'); });
    await overflowMotion.locator('[role="tab"]').filter({ hasText: 'Team' }).click();
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() === 'Team');
    const contrastRecording = await recordFrames(page, sampleContrast, '#light-overflow-tabs');
    await contrastRecording.waitFor(({ frames }) => frames.some(({ indicatorWidth, selectedWidth }) => Math.abs(indicatorWidth - selectedWidth) > 0.5)
      && Math.abs(frames.at(-1).indicatorWidth - frames.at(-1).selectedWidth) < 0.5);
    const contrastSamples = await contrastRecording.stop();
    assert.ok(contrastSamples.every(({ aligned, clipAligned }) => aligned && clipAligned), 'selected text and mask stay aligned during overflow selection');
    assert.ok(contrastSamples.some(({ indicatorWidth, selectedWidth }) => Math.abs(indicatorWidth - selectedWidth) > 0.5), 'selection captures an intermediate shape position');
    const settledContrast = contrastSamples.at(-1);
    assert.notEqual(settledContrast.originalColor, settledContrast.contrastColor, 'selected text takes its colour from the foreground layer');

    const overflowViewport = overflowMotion.locator('.muxui-tabs__motion-overflow-viewport');
    await overflowViewport.evaluate((node) => { node.scrollLeft = 0; });
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs button[aria-label="Scroll tabs left"]')?.disabled);
    const initialScroll = await overflowViewport.evaluate((node) => node.scrollLeft);
    const maxScroll = await overflowViewport.evaluate((node) => node.scrollWidth - node.clientWidth);
    const scrollRecording = await recordFrames(page, () => document.querySelector('#light-overflow-tabs .muxui-tabs__motion-overflow-viewport').scrollLeft);
    await overflowMotion.locator('button[aria-label="Scroll tabs right"]').click();
    // The reversal must interrupt a scroll that is under way and has enabled the opposite arrow.
    await page.waitForFunction((start) => {
      const root = document.querySelector('#light-overflow-tabs');
      return root.querySelector('.muxui-tabs__motion-overflow-viewport').scrollLeft > start
        && !root.querySelector('button[aria-label="Scroll tabs left"]').disabled;
    }, initialScroll);
    const reversalStart = await overflowMotion.evaluate((root) => {
      const position = root.querySelector('.muxui-tabs__motion-overflow-viewport').scrollLeft;
      root.querySelector('button[aria-label="Scroll tabs left"]').click();
      return position;
    });
    await page.waitForFunction((start) => document.querySelector('#light-overflow-tabs .muxui-tabs__motion-overflow-viewport').scrollLeft < start, reversalStart);
    const reversedScroll = await overflowViewport.evaluate((node) => node.scrollLeft);
    const scrollFrames = await scrollRecording.stop();
    const inFlightScroll = scrollFrames.find((offset) => offset > initialScroll && offset < maxScroll - 0.5) ?? scrollFrames.at(-1);
    assert.ok(inFlightScroll > initialScroll, `next arrow starts an animated scroll: ${JSON.stringify(scrollFrames)}`);
    assert.ok(inFlightScroll < maxScroll - 0.5, 'next arrow remains observable before settling');
    assert.ok(reversedScroll < reversalStart, `opposite arrow interrupts and reverses the scroll (${reversalStart} -> ${reversedScroll})`);
    // A late reversal would first carry the scroll well past where the click landed.
    const forwardFrames = scrollFrames.filter((offset) => offset <= reversalStart);
    const frameStep = Math.max(0, ...forwardFrames.slice(1).map((offset, index) => offset - forwardFrames[index]));
    const peakScroll = Math.max(...scrollFrames);
    assert.ok(peakScroll <= reversalStart + frameStep + 0.5 && peakScroll < maxScroll - 0.5,
      `reversal stops the forward scroll within one frame (${reversalStart} + ${frameStep} -> peak ${peakScroll} of ${maxScroll})`);
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs .muxui-tabs__motion-overflow-viewport')?.scrollLeft < 1);

    // The hover layer lives in the scrolling content, so it scrolls with its tab and the viewport clips it.
    // This rail is 220px wide, so the first tab is the one whose centre stays clear of the scroll controls.
    const overflowHover = { page, layer: `${overflowRoot} .muxui-tabs__hover`, items: `${overflowRoot} [role="tab"]` };
    await setStateDuration(page, '160ms');
    await pointOnto(overflowHover, 0);
    await settledOn(overflowHover, 0);
    const scrolled = await overflowViewport.evaluate((viewport) => {
      const layer = viewport.querySelector('.muxui-tabs__hover');
      const tab = viewport.querySelector('[role="tab"][data-muxui-state-hovered]');
      const read = () => ({ layer: layer.getBoundingClientRect().left, tab: tab.getBoundingClientRect().left });
      const before = read();
      viewport.scrollLeft += 24;
      const after = read();
      return { layerMoved: before.layer - after.layer, tabMoved: before.tab - after.tab, clipped: viewport.contains(layer) };
    });
    assert.ok(scrolled.tabMoved > 20, 'the viewport scrolled');
    assert.ok(Math.abs(scrolled.layerMoved - scrolled.tabMoved) < 0.5, 'the hover layer stays on its tab through a scroll');
    assert.equal(scrolled.clipped, true, 'the viewport clips the hover layer');
    await overflowViewport.evaluate((viewport) => { viewport.scrollLeft = 0; });
    await pointOnto(overflowHover, 0);
    await settledOn(overflowHover, 0);
    // A scroll chevron counts as leaving the tabs and keeps its own hover.
    await overflowMotion.locator('button[aria-label="Scroll tabs right"]').hover();
    await faded(overflowHover);
    assert.notEqual(await overflowMotion.locator('button[aria-label="Scroll tabs right"]').evaluate((node) => getComputedStyle(node).backgroundImage), 'none', 'a hovered scroll chevron paints its own hover');
    await page.mouse.move(0, 0);
    await setStateDuration(page, '900ms');
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs .muxui-tabs__motion-overflow-viewport')?.scrollLeft < 1);

    // Keyboard, element.click(), and assistive-tech activation reverse without a pointerdown stopping
    // the scroll first. Both clicks run inside the recorder so Motion's frame step precedes each sample;
    // the spin lands activation late in the frame, where a stale final step would overshoot.
    const clickReversal = await recordFrames(page, (spinMs, state) => {
      const root = document.querySelector('#light-overflow-tabs');
      const viewport = root.querySelector('.muxui-tabs__motion-overflow-viewport');
      if (!state.started) {
        state.started = true;
        root.querySelector('button[aria-label="Scroll tabs right"]').click();
        return null;
      }
      if (state.base !== undefined) return viewport.scrollLeft;
      // The left arrow enables a render after the scroll leaves the start edge.
      const previous = root.querySelector('button[aria-label="Scroll tabs left"]');
      if (viewport.scrollLeft < 6 || previous.disabled) return null;
      state.base = viewport.scrollLeft;
      const until = performance.now() + spinMs;
      while (performance.now() < until) { /* busy frame */ }
      previous.click();
      // Recorded after the click: this is the position the activation frame paints.
      return { base: state.base, painted: viewport.scrollLeft };
    }, 8);
    await clickReversal.waitFor(({ frames }) => frames.length > 8);
    const [clickActivation, ...clickFrames] = await clickReversal.stop();
    const clickPainted = [clickActivation.painted, ...clickFrames];
    assert.ok(clickPainted.every((offset) => offset <= clickActivation.base + 0.5), `click reversal never paints past the activation position ${clickActivation.base}: ${JSON.stringify(clickPainted)}`);
    assert.ok(clickPainted.at(-1) < clickActivation.base, `click reversal moves backwards: ${JSON.stringify(clickPainted)}`);
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs .muxui-tabs__motion-overflow-viewport')?.scrollLeft < 1);

    const scrollDestination = await overflowViewport.evaluate((node) => Math.min(node.scrollWidth - node.clientWidth, node.scrollLeft + node.clientWidth * 0.8));
    await overflowMotion.locator('button[aria-label="Scroll tabs right"]').click();
    await page.waitForFunction((destination) => {
      const offset = document.querySelector('#light-overflow-tabs .muxui-tabs__motion-overflow-viewport').scrollLeft;
      return offset > 1 && offset < destination - 1;
    }, scrollDestination);
    await page.locator(overflowRoot).evaluate((root) => root.setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => document.querySelector('#light-overflow-tabs .muxui-tabs__motion')?.hasAttribute('data-muxui-tabs-reduced'));
    assert.ok(Math.abs(await overflowViewport.evaluate((node) => node.scrollLeft) - scrollDestination) < 1, 'enabling reduced motion settles an active scroll at its destination');
    await overflowMotion.locator('button[aria-label="Scroll tabs left"]').click();
    const reducedScrollBefore = await overflowViewport.evaluate((node) => node.scrollLeft);
    await overflowMotion.locator('button[aria-label="Scroll tabs right"]').click();
    const reducedScrollAfter = await overflowViewport.evaluate((node) => node.scrollLeft);
    assert.ok(reducedScrollAfter > reducedScrollBefore, 'reduced motion scrolls immediately');
    await page.locator(overflowRoot).evaluate((root) => root.removeAttribute('data-muxui-motion'));
    await page.evaluate(() => { document.documentElement.style.removeProperty('--muxui-semantic-motion-state-duration'); document.documentElement.style.removeProperty('--muxui-semantic-motion-state-transition-duration'); });

    await overflowMotion.locator('.muxui-tabs__motion-overflow-viewport').evaluate((node) => { node.scrollLeft = 8; });
    await page.waitForFunction(() => !document.querySelector('#light-overflow-tabs button[aria-label="Scroll tabs left"]')?.disabled);
    const beforeScroll = await overflowMotion.locator('.muxui-tabs__motion-overflow-viewport').evaluate((node) => node.scrollLeft);
    await overflowMotion.locator('button[aria-label="Scroll tabs right"]').click();
    await page.waitForFunction((before) => document.querySelector('#tabs-preview-light #light-overflow-tabs .muxui-tabs__motion-overflow-viewport')?.scrollLeft > before, beforeScroll);
    await page.waitForFunction(() => !document.querySelector('#tabs-preview-light #light-overflow-tabs button[aria-label="Scroll tabs left"]')?.disabled);
    assert.equal(await overflowMotion.locator('button[aria-label="Scroll tabs left"]').isDisabled(), false);

    await overflowMotion.locator('[role="tab"]').first().focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('#tabs-preview-light #light-overflow-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() === 'Billing');
    await page.waitForFunction(() => {
      const root = document.querySelector('#tabs-preview-light #light-overflow-tabs');
      const selected = root?.querySelector('[role="tab"][aria-selected="true"]');
      const indicator = root?.querySelector('.muxui-tabs__motion-underline');
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
    assert.equal(overflowFocus.shadow, 'none', 'overflow uses an outline rather than a clipped focus shadow');
    assert.equal(overflowFocus.offset, '2px');

    const verticalRoot = '#tabs-preview-dark #dark-vertical-overflow-tabs';
    await page.waitForFunction((selector) => document.querySelector(`${selector} .muxui-tabs__motion`)?.hasAttribute('data-muxui-tabs-overflow'), verticalRoot);
    const verticalMotion = page.locator(`${verticalRoot} .muxui-tabs__motion`);
    assert.equal(await verticalMotion.locator('button[aria-label="Scroll tabs up"]').count(), 1);
    assert.equal(await verticalMotion.locator('button[aria-label="Scroll tabs down"]').count(), 1);
    assert.equal(await verticalMotion.locator('button:enabled').count(), 0, 'disabling Tabs also disables its scroll controls');
    const verticalScroll = await verticalMotion.locator('.muxui-tabs__motion-overflow-viewport').evaluate((node) => node.scrollTop);
    assert.ok(verticalScroll > 0, 'vertical overflow reveals the default selected tab');
    assert.match(await verticalMotion.locator('.muxui-tabs__motion-overflow-viewport').evaluate((node) => getComputedStyle(node).clipPath), /^inset\([\d.]+px 0px\)$/u, 'overflow viewport clips content behind its vertical edges');
    await assertRoundEdges(verticalMotion, 'y', 'vertical overflow');

    await page.locator('#tabs-preview-dark #dark-overflow-tabs').evaluate((root) => { root.dir = 'rtl'; });
    await page.waitForFunction(() => document.querySelector('#tabs-preview-dark #dark-overflow-tabs .muxui-tabs__motion')?.dataset.muxuiTabsDirection === 'rtl');
    const rtlMotion = page.locator('#tabs-preview-dark #dark-overflow-tabs .muxui-tabs__motion');
    const rtlBeforeScroll = await rtlMotion.locator('.muxui-tabs__motion-overflow-viewport').evaluate((node) => node.scrollLeft);
    await rtlMotion.locator('button[aria-label="Scroll tabs left"]').click();
    await page.waitForFunction((before) => document.querySelector('#tabs-preview-dark #dark-overflow-tabs .muxui-tabs__motion-overflow-viewport')?.scrollLeft < before, rtlBeforeScroll);
    await rtlMotion.locator('[role="tab"]').last().click();
    await page.waitForFunction(() => document.querySelector('#tabs-preview-dark #dark-overflow-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() === 'Billing');
    assert.equal(await page.locator('#tabs-preview-light #light-overflow-tabs [role="tab"][aria-selected="true"]').textContent(), 'Billing', 'instances remain independent');

    const segmentRoot = '#tabs-preview-light #light-segment-tabs';
    await page.locator(`${segmentRoot} [role="tab"]`).last().click();
    await page.waitForFunction((selector) => document.querySelector(`${selector} [role="tab"][aria-selected="true"]`)?.textContent?.trim() === 'Month', segmentRoot);
    assert.equal(await page.locator(`${segmentRoot} .muxui-tabs__panel:not([data-muxui-hidden])`).textContent(), 'Month');

    const pillTabs = page.locator(`${motionPill} [role="tab"]`);
    await pillTabs.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator(`${motionPill} [role="tab"][aria-selected="true"]`).textContent(), 'Overview', 'manual activation keeps selection while focus moves');
    const selectedAfterFocusMove = await pillTabs.first().evaluate((tab) => ({
      outline: getComputedStyle(tab).outlineWidth,
      outlineStyle: getComputedStyle(tab).outlineStyle,
      active: document.activeElement === tab,
      focusVisible: tab.hasAttribute('data-muxui-state-focus-visible'),
      selected: tab.getAttribute('aria-selected'),
    }));
    assert.equal(selectedAfterFocusMove.selected, 'true', 'moving keyboard focus keeps the selected tab selected');
    assert.equal(selectedAfterFocusMove.focusVisible, false, 'moving keyboard focus clears the selected tab focus-visible state');
    assert.equal(selectedAfterFocusMove.outlineStyle, 'none', 'moving keyboard focus clears the selected tab accent ring');
    await page.keyboard.press('ArrowLeft');
    const selectedKeyboardFocus = await pillTabs.first().evaluate((tab) => ({
      background: getComputedStyle(tab).backgroundColor,
      outline: getComputedStyle(tab).outlineWidth,
      offset: getComputedStyle(tab).outlineOffset,
      boxShadow: getComputedStyle(tab).boxShadow,
      focusVisible: tab.hasAttribute('data-muxui-state-focus-visible'),
    }));
    assert.equal(selectedKeyboardFocus.focusVisible, true, 'keyboard navigation exposes focus-visible on the selected tab');
    assert.equal(selectedKeyboardFocus.outline, '2px', 'selected keyboard focus uses the accent ring');
    assert.equal(selectedKeyboardFocus.offset, '2px', 'selected keyboard focus keeps the ring separated');
    assert.equal(selectedKeyboardFocus.boxShadow, 'none', 'keyboard focus does not add a second selected shadow');
    await pillTabs.first().hover();
    const selectedFocusHover = await pillTabs.first().evaluate((tab) => ({
      background: getComputedStyle(tab).backgroundColor,
      outline: getComputedStyle(tab).outlineWidth,
      boxShadow: getComputedStyle(tab).boxShadow,
    }));
    assert.equal(selectedFocusHover.outline, '2px', 'selected hover plus keyboard focus keeps the accent ring');
    assert.notEqual(selectedFocusHover.background, selectedKeyboardFocus.background, 'selected hover plus keyboard focus changes the background');
    assert.equal(selectedFocusHover.boxShadow, 'none', 'selected hover plus keyboard focus does not add a shadow');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(`${motionPill} [role="tab"][aria-selected="true"]`).textContent(), 'Activity');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Settings', 'keyboard navigation skips disabled tabs');
    const selectedAfterSecondFocusMove = await pillTabs.nth(1).evaluate((tab) => ({
      outline: getComputedStyle(tab).outlineWidth,
      outlineStyle: getComputedStyle(tab).outlineStyle,
      focusVisible: tab.hasAttribute('data-muxui-state-focus-visible'),
      selected: tab.getAttribute('aria-selected'),
    }));
    assert.equal(selectedAfterSecondFocusMove.selected, 'true', 'manual activation keeps the previous selection while focus moves again');
    assert.equal(selectedAfterSecondFocusMove.focusVisible, false, 'moving focus away clears the selected tab focus-visible state');
    assert.equal(selectedAfterSecondFocusMove.outlineStyle, 'none', 'moving focus away clears the selected tab accent ring');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const root = document.querySelector('#light-pill-tabs');
      const shape = root.querySelector('.muxui-tabs__motion-underline').getBoundingClientRect();
      const selected = root.querySelector('[role="tab"][aria-selected="true"]').getBoundingClientRect();
      return Math.abs(shape.left - selected.left) < 1 && Math.abs(shape.width - selected.width) < 1;
    });
    const selectedSettings = pillTabs.filter({ hasText: 'Settings' });
    assert.equal(await selectedSettings.count(), 1);
    await selectedSettings.click();
    const clickedSelected = await selectedSettings.evaluate((tab) => ({
      active: document.activeElement === tab,
      selected: tab.getAttribute('aria-selected'),
      focusVisible: tab.hasAttribute('data-muxui-state-focus-visible'),
      outline: getComputedStyle(tab).outlineWidth,
      boxShadow: getComputedStyle(tab).boxShadow,
      background: getComputedStyle(tab).backgroundColor,
      outlineStyle: getComputedStyle(tab).outlineStyle,
    }));
    assert.equal(clickedSelected.active, true, 'pointer click leaves DOM focus on the selected tab');
    assert.equal(clickedSelected.selected, 'true', 'pointer click keeps the selected tab selected');
    assert.equal(clickedSelected.focusVisible, false, 'pointer click clears the selected tab focus-visible state');
    assert.equal(clickedSelected.outlineStyle, 'none', 'pointer click does not leave the accent ring behind');
    assert.equal(clickedSelected.boxShadow, 'none', 'pointer click does not leave a selected hover shadow behind');
    assert.notEqual(clickedSelected.background, selectedKeyboardFocus.background, 'pointer click keeps selected hover background visible');
    await page.evaluate(() => document.activeElement?.blur());
    const blurredSelected = await selectedSettings.evaluate((tab) => ({
      active: document.activeElement === tab,
      selected: tab.getAttribute('aria-selected'),
      focusVisible: tab.hasAttribute('data-muxui-state-focus-visible'),
      outline: getComputedStyle(tab).outlineWidth,
      outlineStyle: getComputedStyle(tab).outlineStyle,
    }));
    assert.equal(blurredSelected.active, false, 'blur removes DOM focus from the selected tab');
    assert.equal(blurredSelected.selected, 'true', 'blur does not change selection');
    assert.equal(blurredSelected.focusVisible, false, 'blur clears the selected tab focus-visible state');
    assert.equal(blurredSelected.outlineStyle, 'none', 'blur clears the selected tab accent ring');
    const foreground = await page.locator(`${motionPill} .muxui-tabs__motion-foreground`).evaluate((node) => ({
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
      const original = textBounds(root.querySelector('[role="tab"][aria-selected="true"] .muxui-tabs__tab-label'));
      const copy = textBounds(root.querySelectorAll('.muxui-tabs__motion-label')[2]);
      return Math.abs(original.left - copy.left) < 0.5 && Math.abs(original.top - copy.top) < 0.5;
    });
    assert.ok(textAlignment, 'contrast text stays aligned with its original label');
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await page.locator(`${motionPill} .muxui-tabs__motion-foreground`).evaluate((node) => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator(`${motionPill} [role="tab"][aria-selected="true"]`).evaluate((node) => getComputedStyle(node).forcedColorAdjust), 'none');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});

import assert from 'node:assert/strict';

// Page-side probes shared by the GridList browser tests. Each probe is passed to
// `page.evaluate` or `page.waitForFunction`, so it must stay self-contained. The
// two helpers at the end run in Node.

/** Reads the focused row's painted ring, and every ancestor that would clip it. */
export function measureFocusRing() {
  const row = document.activeElement;
  const root = row.closest('[role="grid"]');
  const styles = getComputedStyle(row);
  const rect = row.getBoundingClientRect();
  const outline = styles.outlineStyle === 'none' ? 0 : Math.max(0, parseFloat(styles.outlineWidth) + parseFloat(styles.outlineOffset));
  const outsetSpreads = styles.boxShadow === 'none' ? [] : styles.boxShadow.split(/,(?![^(]*\))/u)
    .filter((shadow) => !shadow.includes('inset'))
    .map((shadow) => parseFloat(shadow.match(/-?[\d.]+px/gu)?.[3] ?? '0'));
  const extent = Math.max(outline, ...outsetSpreads, 0);
  const ring = { left: rect.left - extent, top: rect.top - extent, right: rect.right + extent, bottom: rect.bottom + extent };
  const within = (node) => {
    const box = node.getBoundingClientRect();
    const left = box.left + node.clientLeft;
    const top = box.top + node.clientTop;
    return ring.left >= left - 0.5 && ring.top >= top - 0.5 && ring.right <= left + node.clientWidth + 0.5 && ring.bottom <= top + node.clientHeight + 0.5;
  };
  const clippedBy = [];
  for (let node = row.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if ((overflowX !== 'visible' || overflowY !== 'visible') && !within(node)) clippedBy.push(node.tagName.toLowerCase() + (node.className ? `.${node.className}` : ''));
  }
  return {
    focusVisible: row.hasAttribute('data-focus-visible'),
    painted: styles.outlineStyle !== 'none' || styles.boxShadow !== 'none',
    insideRoot: within(root),
    clippedBy,
  };
}

/**
 * Contrast of a selected row's nested link text against the row's effective
 * background: every translucent layer from the page down to the row is painted
 * onto a canvas, which resolves color-mix() and color() values in every engine.
 */
export function measureSelectedContrast(rowSelector) {
  const row = document.querySelector(rowSelector);
  const link = row.querySelector('a');
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const paint = (color) => {
    // An unparseable color leaves fillStyle untouched, so detect that instead of reusing a stale one.
    context.fillStyle = '#010203';
    context.fillStyle = color;
    if (context.fillStyle === '#010203') throw new Error(`Unparseable color: ${color}`);
    context.fillRect(0, 0, 1, 1);
  };
  const pixel = () => [...context.getImageData(0, 0, 1, 1).data];
  const layers = [];
  for (let node = row; node; node = node.parentElement) layers.unshift(getComputedStyle(node).backgroundColor);
  layers.forEach(paint);
  const background = pixel();
  paint(getComputedStyle(link).color);
  const text = pixel();
  const luminance = ([red, green, blue]) => {
    const [r, g, b] = [red, green, blue].map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(background), luminance(text)].sort((left, right) => right - left);
  return { ratio: (lighter + 0.05) / (darker + 0.05), background, text, opaque: background[3] === 255 };
}

/** For `waitForFunction`: true once the selected row's background stops transitioning between polls. */
export function selectedBackgroundSettled(rowSelector) {
  const color = getComputedStyle(document.querySelector(rowSelector)).backgroundColor;
  const settled = color === window.__lastSelectedBackground;
  window.__lastSelectedBackground = color;
  return settled;
}

/** The selected row's painted background, ring, and text color beside the same values built from the selection tokens. */
export function measureSelectedPaint(rowSelector) {
  const row = document.querySelector(rowSelector);
  const probe = document.createElement('div');
  probe.style.cssText = 'background-color: var(--muxui-semantic-selection-background); box-shadow: inset 0 0 0 2px var(--muxui-semantic-selection-track); color: var(--muxui-semantic-content-strong)';
  document.body.append(probe);
  const expected = getComputedStyle(probe);
  const actual = getComputedStyle(row);
  const result = {
    backgroundColor: [actual.backgroundColor, expected.backgroundColor],
    boxShadow: [actual.boxShadow, expected.boxShadow],
    color: [actual.color, expected.color],
  };
  probe.remove();
  return result;
}

/** In forced-colors mode, the focused selected row and its nested link beside the matching system colors. */
export function measureForcedSelection(rowSelector) {
  const row = document.querySelector(rowSelector);
  const probe = document.createElement('div');
  probe.style.cssText = 'background-color: Highlight; color: HighlightText; outline: 2px solid HighlightText';
  document.body.append(probe);
  const expected = getComputedStyle(probe);
  const actual = getComputedStyle(row);
  const result = {
    backgroundColor: [actual.backgroundColor, expected.backgroundColor],
    color: [actual.color, expected.color],
    outlineColor: [actual.outlineColor, expected.outlineColor],
    linkColor: [getComputedStyle(row.querySelector('a')).color, expected.color],
    boxShadow: [actual.boxShadow, 'none'],
  };
  probe.remove();
  return result;
}

/**
 * Polls `condition` in the page, every frame by default, until it holds. On timeout it
 * fails with `message` and what the page-side `report` returns, so a failure shows the
 * state the page held instead of a bare timeout. Errors other than a timeout propagate.
 */
export async function pollUntil(page, condition, argument, { message, report, timeout = 3000, polling } = {}) {
  try {
    await page.waitForFunction(condition, argument, { timeout, polling });
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    const held = report ? JSON.stringify(await page.evaluate(report, argument).catch((reason) => String(reason))) : 'no report';
    assert.fail(`${message ?? 'the condition'} did not hold within ${timeout}ms; the page held ${held}`);
  }
}

/**
 * A cold Vite server can finish optimizing dependencies while the first page loads,
 * which blanks that page with a duplicate-React error. Loading a throwaway page first
 * lets the pages under test start against a settled server.
 */
export async function warmUpServer(browser, pageUrl, readySelector) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(pageUrl, { waitUntil: 'networkidle' });
      await page.locator(readySelector).first().waitFor({ timeout: 15_000 });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    } finally {
      await context.close();
    }
  }
}

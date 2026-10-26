import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { patternVariantExamples } from '../../../../tooling/audits/repository-policy/src/pattern-variants.mjs';
import { pollUntil, settleMotion } from './grid-list-probes.mjs';
import { packageRoot, pageShell, repositoryRoot, startServer } from './harness.mjs';

// Shared by the block browser tests (E-BL1-04, E-BL1-06): load a variant from its
// canonical catalog source through the public `@muxui/react` entry, then probe it.

/** The page widths E-BL1-06 holds marketing blocks to. */
export const pageWidths = [360, 768, 1280];

/** The widths an application block holds to: the page widths and a 390 px phone. */
export const blockWidths = [360, 390, 768, 1280];

/** The catalog variant record for `variantSlug` of `patternSlug`; fails when the catalog does not ship it. */
export async function patternVariant(patternSlug, variantSlug) {
  const variants = await patternVariantExamples(repositoryRoot);
  const variant = variants.find((candidate) => candidate.patternSlug === patternSlug && candidate.variantSlug === variantSlug);
  assert.ok(variant, `the catalog ships ${patternSlug}/${variantSlug}`);
  return variant;
}

const entry = (variant) => `
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Variant from '/${variant.source}';

const Example = Object.values(Variant).find((value) => typeof value === 'function');
// Marks the document and records every submit event after React has handled it,
// so a block that lets the browser submit shows up as an event that was not prevented.
window.__sentinel = 'alive';
window.__submits = [];
document.addEventListener('submit', (event) => window.__submits.push(event.defaultPrevented));
// \`?copies=2\` mounts the example twice, to prove its ids stay unique across instances.
const copies = Number(new URLSearchParams(location.search).get('copies') ?? 1);
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null, Array.from({ length: copies }, (_, index) => React.createElement(Example, { key: index }))));
`;

/**
 * Serves one variant at `/block.html?scheme=light|dark`, between two tab stops
 * (`#before` and `#after`). WebKit on macOS skips plain buttons in sequential
 * navigation, so the stops carry tabindex.
 */
export function startVariantServer(variant) {
  return startServer({
    root: 'repository',
    aliasReact: true,
    // The subpath comes first: an alias matches by prefix, so the package name alone would swallow it.
    alias: {
      '@muxui/react/markdown': resolve(packageRoot, 'generated/markdown.js'),
      '@muxui/react': resolve(packageRoot, 'generated/index.mjs'),
    },
    entries: ['packages/react/generated/index.mjs', 'packages/react/generated/markdown.js', variant.source],
    pages: {
      '/block.html': (url) => pageShell({
        attributes: `data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}" data-muxui-motion="full"`,
        head: '<link rel="stylesheet" href="/packages/react/generated/styles.css">',
        bodyAttributes: 'style="margin: 0; background: var(--muxui-semantic-surface-canvas)"',
        body: '<button id="before" tabindex="0">Before</button><div id="root"></div><button id="after" tabindex="0">After</button>',
        entry: '/block-entry.mjs',
      }),
    },
    modules: { '/block-entry.mjs': entry(variant) },
  });
}

/**
 * Opens a block page in a fresh context. The context collects page and console
 * errors in `errors`; the caller closes the context.
 */
export async function openBlock(browser, url, { width = 1280, height = 900, scheme = 'light', copies = 1 } = {}) {
  const context = await browser.newContext({ locale: 'en-US', viewport: { width, height } });
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(error.message));
  tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await tab.goto(`${url}/block.html?scheme=${scheme}${copies > 1 ? `&copies=${copies}` : ''}`, { waitUntil: 'networkidle' });
  await tab.locator('#root > *').first().waitFor({ timeout: 15_000 });
  return { context, tab, errors };
}

/**
 * The paint a focus ring is made of: outline and box shadow on the element, on its
 * label, and on their `::before` and `::after`. A switch's input sits inside a 1px
 * clipped wrapper, where a browser's own focus outline is never seen, so its own paint
 * is left out and the ring has to come from the label's `::before`. `group`, a selector,
 * names an ancestor that shows a text entry's focus with its border colour, such as a
 * composer form around its textarea; its border colour joins that entry's snapshot.
 */
export function paintSnapshot([element, group]) {
  const clipped = (node) => {
    for (let ancestor = node.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const styles = getComputedStyle(ancestor);
      if (parseFloat(styles.width) <= 1 && parseFloat(styles.height) <= 1 && styles.overflow === 'hidden') return true;
    }
    return false;
  };
  const owner = group && element.matches('input, textarea') ? element.closest(group) : null;
  // A radio or checkbox paints its ring on an indicator inside the label, and a number field on the group
  // around its input, so each scope's descendants count too.
  const scopes = [element, element.closest('label'), element.closest('[data-muxui-state-focus-within]'), owner].filter(Boolean);
  const paint = [...new Set(scopes.flatMap((node) => [node, ...node.querySelectorAll('*')]))].filter((node) => !clipped(node)).flatMap((node) => [null, '::before', '::after'].map((pseudo) => {
    const styles = getComputedStyle(node, pseudo);
    return `${styles.outlineStyle} ${styles.outlineWidth} ${styles.outlineColor} ${styles.outlineOffset} ${styles.boxShadow}`;
  })).join(' | ');
  return owner ? `${paint} | ${getComputedStyle(owner).borderColor}` : paint;
}

/** Whether keyboard focus is visible on the element: `:focus-visible`, or React Aria's `data-muxui-state-focus-visible` on it or its label. */
export function isFocusVisible(element) {
  return element.matches(':focus-visible') || element.hasAttribute('data-muxui-state-focus-visible') || element.closest('label')?.hasAttribute('data-muxui-state-focus-visible') === true;
}

/** The node whose subtree holds the focus-ring paint `paintSnapshot` reads: the group, else the control's label or focus group when it has one. Runs in the page. */
const paintScope = ([element, group]) => (group && element.matches('input, textarea') ? element.closest(group) : null) ?? element.closest('label') ?? element.closest('[data-muxui-state-focus-within]') ?? element;

/**
 * `paintSnapshot` once the control's motion has ended. A read taken sooner can land on a
 * transition's start, which equals the paint it is leaving, or on a blend of the two.
 */
async function settledPaint(tab, handle, group) {
  const scope = await tab.evaluateHandle(paintScope, [handle, group]);
  try {
    await settleMotion(scope);
  } finally {
    await scope.dispose();
  }
  return tab.evaluate(paintSnapshot, [handle, group]);
}

/**
 * Proves each keyboard stop paints a focus ring, against its own rest state. A box
 * shadow alone proves nothing: a primary Button rests on its elevation shadow. Call
 * `land(name)` right after Tab reaches a control, and `finish()` after focus has left
 * the last one. Each stop must match `:focus-visible` (or `data-muxui-state-focus-visible`) and
 * paint something different focused than after focus moves on. `group` is passed to
 * `paintSnapshot` for text entries.
 */
export function ringWalk(tab, group) {
  let stop;
  const check = async () => {
    if (!stop) return;
    const rest = await settledPaint(tab, stop.handle, group);
    assert.equal(stop.focusVisible, true, `${stop.name} matches :focus-visible when Tab reaches it`);
    assert.notEqual(stop.paint, rest, `${stop.name} paints a focus ring that differs from its rest state (${rest})`);
    await stop.handle.dispose();
    stop = undefined;
  };
  return {
    async land(name) {
      await check();
      const handle = await tab.evaluateHandle(() => document.activeElement);
      const focusVisible = await tab.evaluate(isFocusVisible, handle);
      stop = { name, handle, focusVisible, paint: await settledPaint(tab, handle, group) };
    },
    finish: check,
  };
}

/** The role and accessible name of the focused element, as Playwright's accessibility tree reports them. */
export async function focusedStop(tab) {
  const [first] = (await tab.locator(':focus').ariaSnapshot()).split('\n');
  const [, role, name] = /^- (\S+) "((?:[^"\\]|\\.)*)"/u.exec(first) ?? [];
  return `${role} ${name}`;
}

/**
 * The role and accessible name of the focused element, as Playwright's accessibility tree reports them.
 * A name with a colon is quoted as 'role "name"', which `focusedStop` does not read, so this reads both forms.
 */
export async function stopOf(tab) {
  const [first] = (await tab.locator(':focus').ariaSnapshot()).split('\n');
  const plain = /^- (\w+) "((?:[^"\\]|\\.)*)"/u.exec(first);
  const quoted = /^- '(\w+) "((?:[^']|'')*)"'/u.exec(first);
  const [, role, name] = plain ?? quoted ?? [];
  if (role !== undefined) return `${role} ${name?.replaceAll("''", "'")}`;
  // An element with no role, such as a native summary, is named by its tag and first line of text.
  return tab.evaluate(() => `${document.activeElement.tagName.toLowerCase()} ${document.activeElement.innerText.split('\n')[0].trim()}`);
}

/**
 * Presses Tab from `#before` until focus reaches `#after`, landing each stop in `walk` (a `ringWalk`),
 * and returns the stops in order. Fails when Tab never leaves the block within `limit` presses.
 */
export async function tabWalk(tab, walk, label, limit = 16) {
  await tab.locator('#before').focus();
  const seen = [];
  for (let step = 0; step < limit; step += 1) {
    await tab.evaluate(() => { window.__previousFocus = document.activeElement; });
    await tab.keyboard.press('Tab');
    await pollUntil(tab, () => document.activeElement !== window.__previousFocus, undefined, { message: `${label}: Tab moves focus on step ${step + 1}`, report: () => document.activeElement?.outerHTML.slice(0, 160) });
    if (await tab.evaluate(() => document.activeElement.id === 'after')) {
      await walk.finish();
      return seen;
    }
    const stop = await stopOf(tab);
    seen.push(stop);
    await walk.land(stop);
  }
  assert.fail(`${label}: Tab never reached the control after the block`);
}

/**
 * Holds the block to no horizontal page overflow in light and dark at every block width, with its root
 * (`root`, a selector) inside the viewport and no page or console error.
 */
export async function assertFits(browser, url, root, label) {
  for (const scheme of ['light', 'dark']) {
    for (const width of blockWidths) {
      const { context, tab, errors } = await openBlock(browser, url, { width, scheme });
      try {
        const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
        assert.ok(scrollWidth <= innerWidth, `${label} ${scheme} ${width}px: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
        const box = await tab.evaluate(measureBox, root);
        assert.ok(box.left >= 0 && box.right <= innerWidth, `${label} ${scheme} ${width}px: the block stays inside the viewport`);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
  }
}

/**
 * The stops a Tab walk reaches in this browser. WebKit on macOS does not Tab to a native button that has no
 * tabindex (React Aria's buttons carry one; Activity's trigger and the composer's Send do not), so the
 * `nativeButtons` stops are left out of the expected walk there and keyboard-reachable everywhere else,
 * including WebKit on Linux.
 */
export function reachableStops(browser, stops, nativeButtons) {
  const skipsNativeButtons = browser.browserType().name() === 'webkit' && process.platform === 'darwin';
  return skipsNativeButtons ? stops.filter((stop) => !nativeButtons.includes(stop)) : stops;
}

/**
 * Waits until the first match is rendered (`true`) or not (`false`), as `checkVisibility` reads it. Folded content
 * is `hidden="until-found"`, which skips its contents without removing their boxes; WebKit's own box test still
 * calls such text visible, so Playwright's `waitFor` cannot tell open from folded there.
 */
export async function expectRendered(locator, expected, { timeout = 5000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const rendered = await locator.first().evaluate((node) => node.checkVisibility());
    if (rendered === expected) return;
    assert.ok(Date.now() < deadline, `${locator} did not become ${expected ? 'rendered' : 'folded'} within ${timeout}ms`);
    await locator.page().waitForTimeout(50);
  }
}

/**
 * Mounts the block twice and holds the document to unique ids, so no id is a fixed literal of the example.
 * `prepare(tab)` opens whatever renders more ids (a tab, a disclosure, an overlay) before the check.
 */
export async function assertUniqueIds(browser, url, label, prepare = async () => {}) {
  const { context, tab, errors } = await openBlock(browser, url, { copies: 2 });
  try {
    await prepare(tab);
    const duplicates = await tab.evaluate(() => {
      const counts = new Map();
      for (const node of document.querySelectorAll('[id]')) counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
      return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
    });
    assert.deepEqual(duplicates, [], `${label}: two instances share these ids`);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

/** The page scroll width and the viewport width, for the horizontal overflow check. */
export function measurePageFit() {
  return { scrollWidth: document.scrollingElement.scrollWidth, innerWidth: window.innerWidth };
}

/** Left, top, right, and bottom of the first match for `selector`. */
export function measureBox(selector) {
  const { left, top, right, bottom } = document.querySelector(selector).getBoundingClientRect();
  return { left, top, right, bottom };
}

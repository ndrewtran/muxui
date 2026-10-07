import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { patternVariantExamples } from '../../../../tooling/audits/repository-policy/src/pattern-variants.mjs';
import { packageRoot, pageShell, repositoryRoot, startServer } from './harness.mjs';

// Shared by the block browser tests (E-BL1-04, E-BL1-06): load a variant from its
// canonical catalog source through the public `@muxui/react` entry, then probe it.

/** The page widths E-BL1-06 holds marketing blocks to. */
export const pageWidths = [360, 768, 1280];

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
createRoot(document.getElementById('root')).render(React.createElement(Example));
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
    alias: { '@muxui/react': resolve(packageRoot, 'generated/index.mjs') },
    entries: ['packages/react/generated/index.mjs', variant.source],
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
export async function openBlock(browser, url, { width = 1280, height = 900, scheme = 'light' } = {}) {
  const context = await browser.newContext({ locale: 'en-US', viewport: { width, height } });
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(error.message));
  tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await tab.goto(`${url}/block.html?scheme=${scheme}`, { waitUntil: 'networkidle' });
  await tab.locator('#root > *').first().waitFor({ timeout: 15_000 });
  return { context, tab, errors };
}

/**
 * The paint a focus ring is made of: outline and box shadow on the element, on its
 * label, and on their `::before` and `::after`. A switch's input sits inside a 1px
 * clipped wrapper, where a browser's own focus outline is never seen, so its own paint
 * is left out and the ring has to come from the label's `::before`.
 */
export function paintSnapshot(element) {
  const clipped = (node) => {
    for (let ancestor = node.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const styles = getComputedStyle(ancestor);
      if (parseFloat(styles.width) <= 1 && parseFloat(styles.height) <= 1 && styles.overflow === 'hidden') return true;
    }
    return false;
  };
  return [clipped(element) ? null : element, element.closest('label')].filter(Boolean).flatMap((node) => [null, '::before', '::after'].map((pseudo) => {
    const styles = getComputedStyle(node, pseudo);
    return `${styles.outlineStyle} ${styles.outlineWidth} ${styles.outlineColor} ${styles.outlineOffset} ${styles.boxShadow}`;
  })).join(' | ');
}

/** Whether keyboard focus is visible on the element: `:focus-visible`, or React Aria's `data-focus-visible` on it or its label. */
export function isFocusVisible(element) {
  return element.matches(':focus-visible') || element.hasAttribute('data-focus-visible') || element.closest('label')?.hasAttribute('data-focus-visible') === true;
}

/** Reads until two reads agree, so a transition has finished; the last read after three seconds. */
async function settled(tab, read) {
  let previous;
  for (const deadline = Date.now() + 3000; Date.now() < deadline;) {
    const value = await read();
    if (value === previous) return value;
    previous = value;
    await tab.waitForTimeout(100);
  }
  return previous;
}

/**
 * Proves each keyboard stop paints a focus ring, against its own rest state. A box
 * shadow alone proves nothing: a primary Button rests on its elevation shadow. Call
 * `land(name)` right after Tab reaches a control, and `finish()` after focus has left
 * the last one. Each stop must match `:focus-visible` (or `data-focus-visible`) and
 * paint something different focused than after focus moves on.
 */
export function ringWalk(tab) {
  let stop;
  const check = async () => {
    if (!stop) return;
    const rest = await settled(tab, () => tab.evaluate(paintSnapshot, stop.handle));
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
      stop = { name, handle, focusVisible, paint: await settled(tab, () => tab.evaluate(paintSnapshot, handle)) };
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

/** The page scroll width and the viewport width, for the horizontal overflow check. */
export function measurePageFit() {
  return { scrollWidth: document.scrollingElement.scrollWidth, innerWidth: window.innerWidth };
}

/** Left, top, right, and bottom of the first match for `selector`. */
export function measureBox(selector) {
  const { left, top, right, bottom } = document.querySelector(selector).getBoundingClientRect();
  return { left, top, right, bottom };
}

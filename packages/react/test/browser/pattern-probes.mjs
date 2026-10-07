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
 * Whether the focused control paints a focus indicator: an outline or box shadow
 * on it or on its label, or on their `::before` (a switch paints its ring there,
 * around a visually hidden input).
 */
export function measureFocusIndicator() {
  const painted = (styles) => (styles.outlineStyle !== 'none' && parseFloat(styles.outlineWidth) > 0) || styles.boxShadow !== 'none';
  const node = document.activeElement;
  return [node, node.closest('label')]
    .filter(Boolean)
    .some((candidate) => painted(getComputedStyle(candidate)) || painted(getComputedStyle(candidate, '::before')));
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

import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { PopoverColorSchemeFixture } from '../fixtures/popover-color-scheme-fixture.mjs';
import { pollUntil } from './grid-list-probes.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof that a Popover with colorScheme is a scope of that scheme: its surface is the scheme's raised
// popup surface with the scheme's text on it, and the tokens and a Mux UI button inside resolve as they do on a
// page of that scheme, for a dark panel on a light page and a light panel on a dark one, with and without a preset
// theme and more contrast. An unscoped Popover keeps its own surface. The open panel follows a theme change on the
// document root, density, motion, and direction on the root reach a scoped panel as they reach a plain one, a forced
// colours page paints both the same, and server markup hydrates without a mismatch. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs).

const ROOT_AXES = { scheme: 'color-scheme', theme: 'theme', contrast: 'contrast', density: 'density', motion: 'motion', dir: 'direction' };
// The document root's attributes for a query such as ?scheme=light&theme=standard-harbour.
function pageAttributes(url) {
  return Object.entries(ROOT_AXES).flatMap(([key, axis]) => url.searchParams.has(key) ? [`data-muxui-${axis}="${url.searchParams.get(key)}"`] : []).join(' ');
}
function documentHtml(url) {
  const body = url.searchParams.get('hydrate') === '1'
    ? renderToString(React.createElement(PopoverColorSchemeFixture, { colorScheme: url.searchParams.get('cs') ?? undefined, defaultOpen: url.searchParams.get('open') === '1' }))
    : '';
  return pageShell({ attributes: pageAttributes(url), bodyAttributes: 'style="margin: 32px; background: var(--muxui-semantic-surface-canvas);"', body: `<div id="root">${body}</div>`, entry: '/test/fixtures/popover-color-scheme-browser-entry.mjs' });
}

const TOKENS = [
  '--muxui-semantic-surface-raised',
  '--muxui-semantic-content-default',
  '--muxui-semantic-surface-strong',
  '--muxui-semantic-content-on-strong',
  '--muxui-semantic-color-neutral-default-20',
  '--muxui-semantic-color-neutral-default-90',
];

// What a panel paints: the surface, the text on it, and a Mux UI button in it, and the colours the scope's tokens
// resolve to, read through a probe element inside the panel.
const paintOf = (page) => page.evaluate((tokens) => {
  const panel = document.querySelector('.muxui-popover');
  const read = (selector, properties) => {
    const style = getComputedStyle(document.querySelector(selector));
    return Object.fromEntries(properties.map((name) => [name, style.getPropertyValue(name)]));
  };
  const resolve = (name) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(${name})`;
    panel.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  };
  return {
    surface: read('.muxui-popover', ['background-color', 'color', 'border-top-color']),
    text: read('#panel-text', ['color']),
    button: read('#panel-button', ['background-color', 'color', 'border-top-color']),
    tokens: Object.fromEntries(tokens.map((name) => [name, resolve(name)])),
  };
}, TOKENS);

// What a scope of a scheme resolves, apart from the surface and the text on it, which a Popover paints its own way.
const resolvedIn = ({ button, tokens }) => ({ button, tokens });

const CASES = [
  { name: 'dark on a light page', page: { scheme: 'light' }, scoped: 'dark' },
  { name: 'light on a dark page', page: { scheme: 'dark' }, scoped: 'light' },
  { name: 'dark on a light page with a preset', page: { scheme: 'light', theme: 'monochrome-mountain-meadow' }, scoped: 'dark' },
  { name: 'light on a dark page with a preset and more contrast', page: { scheme: 'dark', theme: 'standard-harbour', contrast: 'more' }, scoped: 'light' },
];

for (const engine of browserEngines()) {
  test(`a Popover with colorScheme is a scope of that scheme and follows the root's theme in ${engine}`, { timeout: 180_000 }, async (t) => {
    const server = await startServer({ entries: ['test/fixtures/popover-color-scheme-browser-entry.mjs'], pages: { '/popover-color-scheme.html': documentHtml } });
    let browser;
    try {
      browser = await launchBrowser(engine);

      // Opens the Popover on a page, with a press on its trigger unless the page opens it itself (open=1), and returns
      // the page with the errors it logged.
      const open = async (query, contextOptions) => {
        const context = await browser.newContext({ viewport: { width: 900, height: 700 }, ...contextOptions });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(`${server.url}/popover-color-scheme.html?${new URLSearchParams(query)}`, { waitUntil: 'load' });
        if (query.open === undefined) await page.locator('#trigger').click();
        await page.locator('.muxui-popover').waitFor();
        await awaitFontsAndFrames(page);
        return { context, page, errors };
      };
      // Opens, reads, and closes the page again, so each case holds one page at a time.
      const paint = async (query, contextOptions) => {
        const { context, page, errors } = await open(query, contextOptions);
        try {
          return { paint: await paintOf(page), errors };
        } finally {
          await context.close();
        }
      };

      for (const { name, page, scoped } of CASES) {
        await t.test(`${name} is a raised surface of that scheme with its tokens and components`, async () => {
          const scopedPaint = await paint({ ...page, cs: scoped });
          const reference = await paint({ ...page, scheme: scoped });
          const control = await paint(page);
          assert.deepEqual(scopedPaint.errors, []);
          const { surface, tokens } = scopedPaint.paint;
          assert.equal(surface['background-color'], tokens['--muxui-semantic-surface-raised'], 'the surface is the scheme\'s raised surface');
          assert.equal(surface.color, tokens['--muxui-semantic-content-default'], 'the text on it is the scheme\'s default text');
          assert.equal(scopedPaint.paint.text.color, tokens['--muxui-semantic-content-default'], 'content inherits it');
          assert.deepEqual(resolvedIn(scopedPaint.paint), resolvedIn(reference.paint), `tokens and a button resolve as they do on a ${scoped} page`);

          // Unset, the Popover keeps the surface it has always had on that page: strong on a light page, the inverted neutral on a dark one.
          const [background, text] = page.scheme === 'light'
            ? ['--muxui-semantic-surface-strong', '--muxui-semantic-content-on-strong']
            : ['--muxui-semantic-color-neutral-default-20', '--muxui-semantic-color-neutral-default-90'];
          assert.equal(control.paint.surface['background-color'], control.paint.tokens[background]);
          assert.equal(control.paint.surface.color, control.paint.tokens[text]);
          assert.notEqual(control.paint.surface['background-color'], surface['background-color'], 'the scope changed the surface');
        });
      }

      await t.test('an open dark panel follows a theme change on the document root', async () => {
        const { context, page, errors } = await open({ scheme: 'light', theme: 'monochrome-mountain-meadow', cs: 'dark' });
        try {
          const positioner = page.locator('.muxui-popover__positioner');
          assert.equal(await positioner.getAttribute('data-muxui-theme'), 'monochrome-mountain-meadow');
          const before = await paintOf(page);

          await page.evaluate(() => document.documentElement.setAttribute('data-muxui-theme', 'monochrome-terracotta'));
          const reference = await paint({ scheme: 'dark', theme: 'monochrome-terracotta' });
          // The button inside transitions its colours, so wait for the whole panel to settle on the reference.
          let followed = await paintOf(page);
          for (let attempt = 0; attempt < 60 && JSON.stringify(resolvedIn(followed)) !== JSON.stringify(resolvedIn(reference.paint)); attempt += 1) {
            await page.waitForTimeout(50);
            followed = await paintOf(page);
          }
          assert.deepEqual(resolvedIn(followed), resolvedIn(reference.paint), 'the open panel resolves as a dark page with the new theme does');
          assert.equal(followed.surface['background-color'], followed.tokens['--muxui-semantic-surface-raised']);
          assert.equal(await positioner.getAttribute('data-muxui-theme'), 'monochrome-terracotta');
          assert.notEqual(before.surface['background-color'], followed.surface['background-color'], 'the two themes differ, so the change is visible');

          await page.evaluate(() => document.documentElement.removeAttribute('data-muxui-theme'));
          await pollUntil(page, () => !document.querySelector('.muxui-popover__positioner').hasAttribute('data-muxui-theme'), undefined, { message: 'the panel drops a theme the page no longer has' });
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('density, motion, and direction on the document root reach a scoped panel as they reach a plain one', async () => {
        const axes = { scheme: 'light', density: 'compact', motion: 'reduced', dir: 'rtl' };
        const probe = async (query) => {
          const { context, page } = await open(query);
          try {
            return await page.evaluate(() => {
              const panel = getComputedStyle(document.querySelector('.muxui-popover'));
              const button = getComputedStyle(document.querySelector('#panel-button'));
              return {
                direction: panel.direction,
                panelTransition: panel.transitionDuration,
                buttonPadding: button.paddingLeft,
                reduced: document.querySelector('.muxui-popover__positioner').hasAttribute('data-muxui-motion-reduced'),
              };
            });
          } finally {
            await context.close();
          }
        };
        const plain = await probe(axes);
        const scoped = await probe({ ...axes, cs: 'dark' });
        // React Aria writes its locale's dir on the panel, so data-muxui-direction on the root does not reach it, scoped or not.
        assert.equal(plain.reduced, true, 'the probe sees the motion');
        assert.deepEqual(scoped, plain);
        const comfortable = await probe({ ...axes, density: 'comfortable' });
        assert.notEqual(plain.buttonPadding, comfortable.buttonPadding, 'the probe sees the density');
      });

      // WebKit matches the forced-colors query under emulation but does not replace authored colours, so there is nothing to compare.
      await t.test('forced colours paint a scoped panel as a plain one', { skip: engine === 'webkit' && 'WebKit does not replace authored colours in forced colours' }, async () => {
        const forced = { forcedColors: 'active' };
        const plain = await paint({ scheme: 'light' }, forced);
        const scoped = await paint({ scheme: 'light', cs: 'dark' }, forced);
        // The system colours replace the author's, so the scope's own surface rule changes nothing.
        assert.deepEqual(scoped.paint.surface, plain.paint.surface);
      });

      await t.test('server markup hydrates into a scoped, open panel without a mismatch', async () => {
        const { context, page, errors } = await open({ hydrate: '1', scheme: 'light', theme: 'standard-harbour', cs: 'dark', open: '1' });
        try {
          assert.equal(await page.locator('.muxui-popover__positioner').getAttribute('data-muxui-color-scheme'), 'dark');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });
    } finally {
      await browser?.close();
      await server.close();
    }
  });
}

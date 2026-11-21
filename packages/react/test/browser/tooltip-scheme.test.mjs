import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// A Tooltip draws the inverse of its page, so its content resolves in that inverse scheme: a tinted hint and a Mux UI
// component inside resolve as they do on a page of the other scheme, with the page's preset theme and contrast, and an
// open tooltip follows a scheme change on the page. A plain text tooltip keeps the surface, shadow, and text it has
// always had. Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const ROOT_AXES = { scheme: 'color-scheme', theme: 'theme', contrast: 'contrast' };
function documentHtml(url) {
  const attributes = Object.entries(ROOT_AXES).flatMap(([key, axis]) => url.searchParams.has(key) ? [`data-muxui-${axis}="${url.searchParams.get(key)}"`] : []).join(' ');
  return pageShell({ attributes, bodyAttributes: 'style="margin: 0; background: var(--muxui-semantic-surface-canvas);"', body: '<div id="root"></div>', entry: '/test/fixtures/tooltip-scheme-browser-entry.mjs' });
}

// What the hint paints: the tinted keyboard hint and the ColorSwatch's border.
const hintPaint = (page, id) => page.evaluate((selector) => {
  const read = (element, properties) => Object.fromEntries(properties.map((name) => [name, getComputedStyle(element).getPropertyValue(name)]));
  const hint = document.querySelector(selector);
  return { kbd: read(hint.querySelector('kbd'), ['background-color', 'color', 'border-top-color']), swatch: read(hint.querySelector('.muxui-color-swatch'), ['border-top-color']) };
}, `#${id}`);

// A token resolved on the page itself, outside the tooltip, through the property that uses it.
const pageToken = (page, name, property = 'background-color') => page.evaluate(([token, cssProperty]) => {
  const probe = document.createElement('div');
  probe.style.setProperty(cssProperty, `var(${token})`);
  document.body.append(probe);
  const value = getComputedStyle(probe).getPropertyValue(cssProperty);
  probe.remove();
  return value;
}, [name, property]);

const inverse = { light: 'dark', dark: 'light' };
const CASES = [
  { name: 'a light page', page: { scheme: 'light' } },
  { name: 'a dark page', page: { scheme: 'dark' } },
  { name: 'a light page with a preset', page: { scheme: 'light', theme: 'monochrome-mountain-meadow' } },
  { name: 'a dark page with a preset and more contrast', page: { scheme: 'dark', theme: 'standard-harbour', contrast: 'more' } },
];

for (const engine of browserEngines()) {
  test(`Tooltip content resolves in the scheme its surface is drawn in, in ${engine}`, { timeout: 180_000 }, async (t) => {
    const server = await startServer({ entries: ['test/fixtures/tooltip-scheme-browser-entry.mjs'], pages: { '/tooltip-scheme.html': documentHtml } });
    let browser;
    try {
      browser = await launchBrowser(engine);
      // Opens a fresh page, waits for the open tooltip when the page opens one, and passes it and its errors to body.
      const withPage = async (query, body) => {
        const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        try {
          await page.goto(`${server.url}/tooltip-scheme.html?${new URLSearchParams(query)}`, { waitUntil: 'load' });
          await page.locator(query.open ? '.muxui-tooltip' : '#page-hint').waitFor();
          await awaitFontsAndFrames(page);
          return await body(page, errors);
        } finally {
          await context.close();
        }
      };

      for (const { name, page: axes } of CASES) {
        await t.test(`on ${name} tinted content inside resolves in the inverse scheme`, async () => {
          const inside = await withPage({ ...axes, open: '1' }, async (page, errors) => {
            assert.deepEqual(errors, []);
            return hintPaint(page, 'tooltip-hint');
          });
          const reference = await withPage({ ...axes, scheme: inverse[axes.scheme] }, (page) => hintPaint(page, 'page-hint'));
          const onPage = await withPage(axes, (page) => hintPaint(page, 'page-hint'));
          assert.deepEqual(inside, reference, `the content resolves as it does on a ${inverse[axes.scheme]} page`);
          assert.notDeepEqual(inside.kbd, onPage.kbd, 'the two schemes differ, so the probe sees the scope');
          assert.notDeepEqual(inside.swatch, onPage.swatch, 'the swatch\'s scheme rule differs too');
        });

        await t.test(`on ${name} a plain text tooltip keeps its surface, shadow, and text`, async () => {
          await withPage({ ...axes, content: 'text', open: '1' }, async (page) => {
            const [background, text] = axes.scheme === 'light'
              ? ['--muxui-semantic-surface-emphasis', '--muxui-semantic-content-on-solid']
              : ['--muxui-semantic-color-neutral-default-30', '--muxui-semantic-color-neutral-default-100'];
            const painted = await page.locator('.muxui-tooltip').evaluate((node) => {
              const style = getComputedStyle(node);
              const text = [...node.querySelectorAll('*')].map((element) => getComputedStyle(element).color);
              return { background: style.backgroundColor, color: style.color, shadow: style.boxShadow, text };
            });
            assert.deepEqual(painted, {
              background: await pageToken(page, background),
              color: await pageToken(page, text, 'color'),
              shadow: await pageToken(page, '--muxui-semantic-elevation-tooltip', 'box-shadow'),
              text: painted.text.map(() => painted.color),
            });
          });
        });
      }

      await t.test('an open tooltip follows a scheme change on the page', async () => {
        const reference = await withPage({ scheme: 'light' }, (page) => hintPaint(page, 'page-hint'));
        await withPage({ scheme: 'light', open: '1' }, async (page) => {
          await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'dark'));
          await page.waitForFunction(() => document.querySelector('.muxui-tooltip [data-muxui-color-scheme]')?.getAttribute('data-muxui-color-scheme') === 'light', undefined, { timeout: 5000 });
          assert.deepEqual(await hintPaint(page, 'tooltip-hint'), reference, 'on a page turned dark the content resolves as on a light page');
        });
      });
    } finally {
      await browser?.close();
      await server.close();
    }
  });
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { awaitFontsAndFrames, launchBrowser, packageRoot } from './harness.mjs';

// Builds a small Astro site against the packed @muxui/react, installed from the tarball as a
// consumer would and not linked from the workspace, then checks the rendered output. A passing
// build is not enough: ProgressCircle parts used straight from an .astro file build fine and
// render indeterminate. Astro is installed beside the tarball, as in code-block-package-boundary,
// so the test adds no dependency to this package and its lockfile. The install needs the npm
// registry unless pnpm's cache has the packages. Bump the pins deliberately and keep them level
// with apps/docs; a docs bump does not plan this test.
const astroVersion = '7.3.1';
const astroReactVersion = '5.0.7';
const fixture = resolve(packageRoot, 'test/fixtures/astro-host');
// Copied one by one. Naming each file here also lets the CI planner run this test when one changes, instead of the whole React proof.
const fixtureFiles = [
  'astro.config.mjs',
  'src/pages/index.astro',
  'src/pages/static.astro',
  'src/components/ProgressIsland.jsx',
  'src/components/DisclosureIsland.jsx',
  'src/components/TabsIsland.jsx',
  'src/components/PendingIsland.jsx',
  'src/styles/reset.css',
  'src/styles/app.css',
];
const initialScriptBudget = 150 * 1024;
// A hung subprocess blocks the test timer, so each command has its own bound and fails the test, which still cleans up.
const commandTimeout = 60_000;
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));

let directory;
let origin;
let browser;

/** Runs a command to completion and returns its output, failing with a clear message if it exits non-zero or times out. */
function run(command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: commandTimeout, ...options });
  assert.equal(result.status, 0, `${command} ${args[0]} failed${result.error ? `: ${result.error.message}` : ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

/** Packs the package, installs it with Astro into a copy of the fixture, builds it, and returns the built site. */
async function buildSite() {
  directory = await mkdtemp(join(tmpdir(), 'muxui-astro-host-'));
  // Packing skips lifecycle scripts: prepack would regenerate generated/, which the package check proves current.
  const packed = run('pnpm', ['pack', '--pack-destination', directory, '--json', '--config.ignore-scripts=true'], { cwd: packageRoot });
  const site = join(directory, 'site');
  await Promise.all(fixtureFiles.map((file) => cp(join(fixture, file), join(site, file))));
  await writeFile(join(site, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: {
    '@muxui/react': `file:${JSON.parse(packed).filename}`,
    '@astrojs/react': astroReactVersion,
    astro: astroVersion,
    react: manifest.devDependencies.react,
    'react-dom': manifest.devDependencies['react-dom'],
  } }));
  run('pnpm', ['install', '--prefer-offline', '--ignore-scripts'], { cwd: site });
  run(process.execPath, [join(site, 'node_modules/astro/bin/astro.mjs'), 'build'], { cwd: site, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  return join(site, 'dist');
}

const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' };

/** Serves a static directory on a random local port. */
function serve(root) {
  const http = createServer(async (request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1');
    try {
      const body = await readFile(join(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname));
      response.writeHead(200, { 'content-type': contentTypes[extname(pathname)] ?? 'text/html' }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((done) => http.listen(0, '127.0.0.1', () => done({ http, origin: `http://127.0.0.1:${http.address().port}` })));
}

/**
 * Opens a page in its own context. `errors` collects page errors and console errors, and
 * `scriptSizes` the gzipped size of each script response, which the page needs by `load`.
 */
async function open(path, { javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({ javaScriptEnabled });
  const page = await context.newPage();
  const errors = [];
  const scriptSizes = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') scriptSizes.push(response.body().then((body) => gzipSync(body).length));
  });
  await page.goto(`${origin}${path}`, { waitUntil: 'load' });
  return { page, errors, scriptSizes, close: () => context.close() };
}

/** What the ProgressCircle inside `selector` shows. */
const progress = (page, selector) => page.locator(selector).evaluate((node) => ({
  dashoffset: node.querySelector('.muxui-progress-circle__indicator')?.getAttribute('stroke-dashoffset') ?? null,
  indeterminate: node.querySelector('[data-muxui-state-indeterminate]') !== null,
  value: node.querySelector('.muxui-progress-circle__value')?.textContent ?? null,
}));

const hydrated = (page) => page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
const isActive = (locator) => locator.evaluate((node) => node === document.activeElement);

// One top-level test, so the build and browser launch count toward the file's cost entry.
test('Astro hosts the packed @muxui/react', { timeout: 180_000 }, async (t) => {
  let server;
  try {
    ({ http: server, origin } = await serve(await buildSite()));
    browser = await launchBrowser();

    await t.test('islands render their state in the HTML, and the .astro ProgressCircle control does not', async () => {
      const { page, close } = await open('/', { javaScriptEnabled: false });
      assert.deepEqual(await progress(page, '#island-progress'), { dashoffset: '50', indeterminate: false, value: '50%' });
      // The negative control: parts used straight from .astro are separate React roots with no context.
      assert.deepEqual(await progress(page, '#astro-progress'), { dashoffset: null, indeterminate: true, value: '' });

      assert.equal(await page.locator('#disclosure .muxui-disclosure__trigger').getAttribute('aria-expanded'), 'false');
      assert.notEqual(await page.locator('#disclosure .muxui-disclosure__motion-panel').getAttribute('inert'), null);
      const pending = page.locator('#pending button');
      assert.notEqual(await pending.getAttribute('disabled'), null);
      assert.equal(await pending.getAttribute('aria-busy'), 'true');

      // Every island hydrates a local component, never a package export.
      const islands = await page.locator('astro-island').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('component-url')));
      assert.deepEqual(islands.map((url) => url.replace(/\.[\w-]+\.js$/u, '')), ['/_astro/ProgressIsland', '/_astro/DisclosureIsland', '/_astro/TabsIsland', '/_astro/PendingIsland']);
      await close();
    });

    await t.test('islands hydrate cleanly under the initial script budget and respond to input', async () => {
      const { page, errors, scriptSizes, close } = await open('/');
      await hydrated(page);
      await awaitFontsAndFrames(page);
      const gzipped = (await Promise.all(scriptSizes)).reduce((total, size) => total + size, 0);
      assert.ok(gzipped < initialScriptBudget, `initial scripts are ${(gzipped / 1024).toFixed(1)} KiB gzipped, over ${initialScriptBudget / 1024} KiB`);

      // A pending submit Button is enabled and focusable once hydrated, and never submits.
      const pending = page.locator('#pending button');
      await page.evaluate(() => {
        window.submits = 0;
        document.querySelector('#pending form').addEventListener('submit', (event) => { event.preventDefault(); window.submits += 1; });
      });
      assert.equal(await pending.evaluate((node) => node.disabled), false);
      await pending.focus();
      assert.ok(await isActive(pending));
      await pending.click({ force: true });
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.submits), 0);

      // Disclosure opens, keeps focus on its trigger, and Tab reaches the button inside.
      const trigger = page.locator('#disclosure .muxui-disclosure__trigger');
      await trigger.click();
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      assert.ok(await isActive(trigger));
      await page.waitForFunction(() => !document.querySelector('#disclosure .muxui-disclosure__motion-panel').inert, undefined, { timeout: 5_000 });
      await page.keyboard.press('Tab');
      assert.ok(await isActive(page.locator('#disclosure .muxui-disclosure__panel button')));

      // Tabs name their tablist, make the selected tab the one tab stop, and a click selects another.
      assert.equal(await page.getByRole('tablist', { name: 'Sections' }).count(), 1);
      const tabs = page.locator('#tabs [role="tab"]');
      assert.deepEqual(await tabs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('tabindex'))), ['0', '-1']);
      await tabs.nth(1).click();
      assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#tabs [role="tabpanel"]').textContent(), 'Recent project activity');

      assert.deepEqual(errors, []);
      await close();
    });

    await t.test('a page with no island ships no script, keeps Button states, and shows the Link focus ring and hover colour', async () => {
      const { page, errors, scriptSizes, close } = await open('/static/');
      assert.equal(scriptSizes.length, 0);
      assert.equal(await page.locator('script, astro-island').count(), 0);
      assert.equal(await page.locator('#reset-case button').getAttribute('disabled'), null);
      const pending = page.locator('form button');
      assert.notEqual(await pending.getAttribute('disabled'), null);
      assert.equal(await pending.getAttribute('aria-busy'), 'true');

      await page.keyboard.press('Tab');
      const link = page.locator('a.muxui-link');
      assert.ok(await isActive(link));
      assert.deepEqual(await link.evaluate((node) => ({ width: getComputedStyle(node).outlineWidth, style: getComputedStyle(node).outlineStyle })), { width: '2px', style: 'solid' });

      // With no script on the page, :hover alone paints the hover colour.
      const color = (name) => page.evaluate((role) => {
        const probe = document.body.appendChild(document.createElement('span'));
        probe.style.color = `var(--muxui-semantic-content-${role})`;
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      }, name);
      const [rest, hover] = [await color('link'), await color('link-hover')];
      assert.notEqual(rest, hover);
      assert.equal(await link.evaluate((node) => getComputedStyle(node).color), rest);
      await link.hover();
      assert.equal(await link.evaluate((node) => getComputedStyle(node).color), hover);
      assert.deepEqual(errors, []);
      await close();
    });

    await t.test('the stylesheet order is reset, then Mux UI, then the app layer, then scoped Astro styles', async () => {
      const { page, close } = await open('/static/');
      await awaitFontsAndFrames(page);
      const background = (selector) => page.locator(selector).evaluate((node) => getComputedStyle(node).backgroundColor);
      // The reset layer paints every button red and the app layer paints .app-button green, but only an unlayered scoped rule paints blue.
      const mux = await page.evaluate(() => {
        const probe = document.body.appendChild(document.createElement('span'));
        probe.style.backgroundColor = 'var(--muxui-component-button-background)';
        const resolved = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return resolved;
      });
      assert.notEqual(mux, 'rgb(255, 0, 0)');
      assert.equal(await background('#reset-case button'), mux);
      assert.equal(await background('#app-case button'), 'rgb(0, 128, 0)');
      assert.equal(await background('#scoped-case button'), 'rgb(0, 0, 255)');
      await close();
    });
  } finally {
    await browser?.close();
    await new Promise((done) => (server ? server.close(done) : done()));
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

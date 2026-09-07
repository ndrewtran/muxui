import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_SETTINGS, createScaleDocument, validateScaleDocument } from '../../src/theme-contract.mjs';
import { createScaleThemeMiddleware } from '../../src/theme-server.mjs';
import { chromeExecutable } from './chrome.mjs';

const appRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(appRoot, '../..');

async function settingsIn(page) {
  return page.evaluate(() => JSON.parse(decodeURIComponent(location.hash.slice(1))));
}

async function ready(page, url) {
  await page.goto(url);
  await page.getByRole('heading', { name: 'Theme Playground', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test('Scale supports live theme editing, lossless import/export and guarded save/load in a browser', { timeout: 90_000 }, async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'muxui-scale-browser-'));
  let middleware;
  const server = await createServer({
    configFile: false, root: appRoot, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'scale-browser-store', configureServer(vite) {
      vite.middlewares.use((request, response, next) => middleware(request, response, next));
    } }],
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.equal(typeof address, 'object');
    const url = `http://127.0.0.1:${address.port}`;
    middleware = createScaleThemeMiddleware({ workspaceRoot, allowedHost: `127.0.0.1:${address.port}`, allowedOrigin: url });
    browser = await chromium.launch({ executablePath: await chromeExecutable(), headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await ready(page, url);
    assert.equal(await page.locator('.theme-card').count(), 15);
    assert.equal(await page.locator('.theme-card').first().evaluate((node) => getComputedStyle(node).flexDirection), 'row');
    assert.equal(await page.locator('h1').evaluate((node) => getComputedStyle(node).fontWeight), '600');
    assert.equal(await page.locator('h1').evaluate((node) => getComputedStyle(node).fontSize), '34px');
    await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
    assert.equal(await page.locator('h1').evaluate((node) => getComputedStyle(node).fontSize), '42.5px');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

    await page.getByRole('radio', { name: 'Neutral', exact: true }).click();
    const before = await settingsIn(page);
    await page.getByRole('button', { name: 'Randomize', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Generated'));
    assert.equal((await settingsIn(page)).namedColor, before.namedColor);
    await page.getByRole('button', { name: 'Forest', exact: true }).click();
    const hexInput = page.getByRole('textbox', { name: 'BASE colour (–60) hex', exact: true });
    await hexInput.fill('127d40');
    await hexInput.press('Enter');
    await page.waitForFunction(() => JSON.parse(decodeURIComponent(location.hash.slice(1))).namedColor === '#127d40');
    assert.equal((await settingsIn(page)).neutralColor, '#127d40');
    await page.getByRole('button', { name: 'Dark background', exact: true }).click();
    assert.equal(await page.locator('.scale-app').getAttribute('data-muxui-color-scheme'), 'dark');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.theme-card')).backgroundColor === getComputedStyle(document.querySelector('.scale-app')).backgroundColor);
    assert.equal(await page.locator('.theme-card').first().evaluate((node) => getComputedStyle(node).backgroundColor), await page.locator('.scale-app').evaluate((node) => getComputedStyle(node).backgroundColor));
    await page.locator('.muxui-select-trigger').click();
    await page.locator('.muxui-select-popover').waitFor();
    assert.equal(await page.locator('.muxui-select-popover').evaluate((node) => getComputedStyle(node).getPropertyValue('--muxui-semantic-color-neutral-5').trim()), await page.locator('.scale-app').evaluate((node) => getComputedStyle(node).getPropertyValue('--muxui-semantic-color-neutral-5').trim()));
    await page.keyboard.press('Escape');
    const screenshotDir = process.env.MUXUI_SCALE_SCREENSHOT_DIR;
    if (screenshotDir) { await mkdir(screenshotDir, { recursive: true }); await page.screenshot({ path: join(screenshotDir, 'scale-dark.png') }); }

    const document = createScaleDocument({ ...DEFAULT_SETTINGS, namedColor: '#663399' }, { slug: 'browser-theme' });
    document.modes = { colorScheme: ['dark'], contrast: ['more'], motion: ['reduced'], density: ['compact'], direction: ['rtl'] };
    document.overrides['component.button.min-height'] = { type: 'dimension', unit: 'px', value: 48 };
    const serialized = JSON.stringify(document);
    await page.locator('input[type=file]').setInputFiles({ name: 'browser-theme.json', mimeType: 'application/json', buffer: Buffer.from(serialized) });
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Imported and validated'));
    assert.equal(await page.getByRole('textbox', { name: 'Theme slug', exact: true }).inputValue(), 'browser-theme');
    assert.equal(await page.getByRole('button', { name: 'Light background', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Saved browser-theme.');
    const savedPath = join(workspaceRoot, 'catalog/tokens/themes/browser-theme.json');
    assert.deepEqual(JSON.parse(await readFile(savedPath, 'utf8')), document);

    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
    const file = await downloaded;
    assert.deepEqual(JSON.parse(await readFile(await file.path(), 'utf8')), document);
    await page.getByRole('button', { name: 'Copy CSS', exact: true }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^:root \{/u);

    const second = await context.newPage();
    await ready(second, url);
    await second.getByRole('textbox', { name: 'Theme slug', exact: true }).fill('browser-theme');
    await second.getByRole('button', { name: 'Load', exact: true }).click();
    await second.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Loaded browser-theme.');
    await second.getByRole('button', { name: 'Lagoon', exact: true }).click();
    const savedAgain = second.waitForResponse((response) => response.url().endsWith('/__muxui/scale/themes/browser-theme') && response.request().method() === 'PUT');
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    const savedAgainResponse = await savedAgain;
    assert.equal(savedAgainResponse.status(), 200, await savedAgainResponse.text());
    await second.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Saved browser-theme.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('has changed'));
    const latest = JSON.parse(await readFile(savedPath, 'utf8'));
    assert.equal(latest.scale.presetId, 'lagoon');
    assert.deepEqual(latest.overrides['component.button.min-height'], document.overrides['component.button.min-height']);
    validateScaleDocument(latest);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Loaded browser-theme.');
    assert.equal((await settingsIn(page)).presetId, 'lagoon');

    await page.getByRole('button', { name: 'Reset to defaults', exact: true }).click();
    await page.getByRole('button', { name: 'Light background', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'scale-light.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

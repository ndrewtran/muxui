import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { ImageAvatarConsumerFixture } from '../fixtures/image-avatar-consumer-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

function contrastRatio(first, second) {
  const parse = (value) => {
    const channels = value.match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/u);
    assert.ok(channels, `expected an sRGB computed color, got ${value}`);
    return channels.slice(1, 4).map(Number).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = ([red, green, blue]) => 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const firstLuminance = luminance(parse(first));
  const secondLuminance = luminance(parse(second));
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

test('Image and Avatar load, recover, preserve native callbacks, and hydrate in light/dark themes', { timeout: 90_000 }, async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root">${renderToString(React.createElement(ImageAvatarConsumerFixture))}</div><script type="module" src="/packages/react/test/fixtures/image-avatar-browser-entry.mjs"></script></body></html>`;
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    optimizeDeps: {
      entries: ['packages/react/test/fixtures/image-avatar-browser-entry.mjs'],
      include: ['react', 'react-dom/client', 'react-aria-components'],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'image-avatar-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/missing-')) return next();
        response.statusCode = 404;
        response.end();
      });
      vite.middlewares.use((request, response, next) => {
        if (request.url !== '/image-avatar.html') return next();
        response.setHeader('content-type', 'text/html');
        response.end(html);
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().includes('Failed to load resource: the server responded with a status of 404')) return;
      errors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/image-avatar.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.imageAvatarReady === 'true');

    const image = page.locator('#image-case .muxui-image').first();
    const avatar = page.locator('#avatar-case .muxui-avatar').first();
    await page.waitForFunction(() => document.querySelector('#image-case .muxui-image')?.hasAttribute('data-fallback'));
    await page.waitForFunction(() => document.querySelector('#avatar-case .muxui-avatar')?.getAttribute('data-image-state') === 'error');
    assert.equal(await image.getAttribute('alt'), 'Workspace logo');
    assert.equal(await image.getAttribute('data-fallback'), '');
    assert.equal(await image.getAttribute('src'), 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Crect width="8" height="8" fill="black"/%3E%3C/svg%3E');
    assert.equal(await page.locator('#image-errors').textContent(), '0');
    assert.equal(await page.locator('#image-loads').textContent(), '1');
    assert.equal(await avatar.getAttribute('data-image-state'), 'error');
    assert.equal(await avatar.locator('.muxui-avatar__image').getAttribute('hidden'), '');
    assert.equal(await avatar.locator('.muxui-avatar__fallback').getAttribute('hidden'), null);
    assert.equal(await avatar.getAttribute('role'), 'img');
    assert.equal(await avatar.getAttribute('aria-label'), 'Alex avatar');
    assert.equal(await page.locator('#avatar-errors').textContent(), '0');
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      const colors = await page.locator('#avatar-case .muxui-avatar').first().evaluate((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, color: style.color };
      });
      assert.notEqual(colors.background, 'rgba(0, 0, 0, 0)', `${colorScheme} avatar should use a token-backed surface`);
      assert.notEqual(colors.color, '', `${colorScheme} avatar should expose computed foreground`);
      assert.ok(
        contrastRatio(colors.background, colors.color) >= 4.5,
        `${colorScheme} avatar fallback foreground/background must meet 4.5:1 contrast (${colors.color} on ${colors.background})`,
      );
    }
    const cachedImage = page.locator('#cached-image');
    await page.waitForFunction(() => document.querySelector('#cached-avatar')?.getAttribute('data-image-state') === 'loaded');
    assert.equal(await cachedImage.getAttribute('alt'), 'Cached workspace logo');
    assert.equal(await cachedImage.evaluate((node) => node.complete && node.naturalWidth > 0), true);
    assert.equal(await page.locator('#cached-avatar').getAttribute('data-image-state'), 'loaded');

    await page.evaluate(() => window.__muxuiImageAvatarSwitch());
    await page.waitForFunction(() => document.querySelector('#avatar-case .muxui-avatar')?.getAttribute('data-image-state') === 'loading');
    await page.waitForFunction(() => document.querySelector('#image-case .muxui-image')?.getAttribute('data-fallback') === null);
    await page.waitForFunction(() => document.querySelector('#avatar-case .muxui-avatar__image')?.getAttribute('hidden') === null);
    assert.equal(await avatar.getAttribute('role'), null);
    assert.equal(await avatar.getAttribute('aria-label'), null);
    await page.waitForFunction(() => document.querySelector('#image-loads')?.textContent === '2');
    await page.waitForFunction(() => document.querySelector('#avatar-loads')?.textContent === '1');
    assert.equal(await page.locator('#image-errors').textContent(), '0');
    assert.equal(await page.locator('#avatar-errors').textContent(), '0');

    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});

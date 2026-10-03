import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ImageAvatarConsumerFixture } from '../fixtures/image-avatar-consumer-fixture.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

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

// Reads one screenshot pixel; a 1x1 PNG row is a filter byte then RGBA, and
// every PNG filter leaves the first pixel of the first row unchanged.
async function pixelAt(page, x, y) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const [, red, green, blue] = inflateSync(Buffer.concat(chunks));
  return `rgb(${red}, ${green}, ${blue})`;
}

// What the avatar paints: each part's computed display, and the colour drawn
// near the left edge (clear of fallback text) compared with the avatar surface.
async function avatarPaint(page, selector, imageColor) {
  const avatar = page.locator(selector).first();
  const state = await avatar.evaluate((node) => {
    const display = (name) => getComputedStyle(node.querySelector(`.muxui-avatar__${name}`)).display;
    const box = node.getBoundingClientRect();
    return {
      image: display('image'),
      fallback: display('fallback'),
      surface: getComputedStyle(node).backgroundColor,
      x: Math.round(box.left + Math.max(3, box.width * 0.12)),
      y: Math.round(box.top + box.height / 2),
    };
  });
  const pixel = await pixelAt(page, state.x, state.y);
  const drawn = pixel === imageColor ? 'image' : pixel === state.surface ? 'surface' : pixel;
  return { image: state.image, fallback: state.fallback, drawn };
}

const teal = 'rgb(0, 128, 128)';
const black = 'rgb(0, 0, 0)';
const square = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="teal"/></svg>';

test('Image and Avatar load, recover, preserve native callbacks, and hydrate in light/dark themes', { timeout: 90_000 }, async () => {
  // /slow-* responses wait here until released, so loading states are observable.
  const heldSources = [];
  const releaseSlowSources = () => heldSources.splice(0).forEach((release) => release());
  // A linked stylesheet lets the no-JavaScript pass paint with Mux styles.
  const html = pageShell({ head: '<link rel="stylesheet" href="/packages/react/generated/styles.css">', body: `<div id="root">${renderToString(React.createElement(ImageAvatarConsumerFixture))}</div>`, entry: '/packages/react/test/fixtures/image-avatar-browser-entry.mjs' });
  const { url, close } = await startServer({
    root: 'repository',
    entries: ['packages/react/test/fixtures/image-avatar-browser-entry.mjs'],
    pages: { '/image-avatar.html': html },
    middleware(request, response, next) {
      if (request.url?.startsWith('/slow-')) {
        heldSources.push(() => {
          response.setHeader('content-type', 'image/svg+xml');
          response.end(square);
        });
        return undefined;
      }
      if (!request.url?.startsWith('/missing-')) return next();
      response.statusCode = 404;
      response.end();
      return undefined;
    },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().includes('Failed to load resource: the server responded with a status of 404')) return;
      errors.push(message.text());
    });
    // Held /slow-* images keep the page from reaching load or network idle.
    await page.goto(`${url}/image-avatar.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.imageAvatarReady === 'true');

    // Loading: the stacked image is unpainted, so the fallback shows; the root carries the alt name.
    const slowAvatar = page.locator('#slow-avatar');
    assert.equal(await slowAvatar.getAttribute('data-image-state'), 'loading');
    assert.deepEqual(await avatarPaint(page, '#slow-avatar', teal), { image: 'block', fallback: 'grid', drawn: 'surface' });
    assert.equal(await slowAvatar.getAttribute('role'), 'img');
    assert.equal(await slowAvatar.getAttribute('aria-label'), 'Sam avatar');

    // A square source in a 320x180 box keeps the declared box before and after load.
    const fitImage = page.locator('#fit-image');
    const fitBox = () => fitImage.evaluate((node) => {
      const { width, height } = node.getBoundingClientRect();
      return { width, height, objectFit: getComputedStyle(node).objectFit, natural: node.naturalWidth };
    });
    assert.deepEqual(await fitBox(), { width: 320, height: 180, objectFit: 'cover', natural: 0 });
    releaseSlowSources();
    await page.waitForFunction(() => document.querySelector('#fit-image')?.naturalWidth === 200);
    assert.deepEqual(await fitBox(), { width: 320, height: 180, objectFit: 'cover', natural: 200 });

    // A consumer class can still set aspect-ratio over the declared ratio.
    await page.addStyleTag({ content: '.consumer-square { aspect-ratio: 1 / 1; }' });
    assert.deepEqual(await page.locator('#class-ratio-image').evaluate((node) => {
      const { width, height } = node.getBoundingClientRect();
      return { width, height };
    }), { width: 320, height: 320 });

    await page.waitForFunction(() => document.querySelector('#slow-avatar')?.getAttribute('data-image-state') === 'loaded');
    assert.deepEqual(await avatarPaint(page, '#slow-avatar', teal), { image: 'block', fallback: 'none', drawn: 'image' });
    assert.equal(await slowAvatar.getAttribute('role'), null);
    assert.equal(await slowAvatar.locator('img').getAttribute('aria-hidden'), null);

    // A source change after load returns to the fallback until the new source loads.
    await page.evaluate(() => window.__muxuiSlowAvatarSwitch('/slow-avatar-next.svg'));
    await page.waitForFunction(() => document.querySelector('#slow-avatar')?.getAttribute('data-image-state') === 'loading');
    assert.deepEqual(await avatarPaint(page, '#slow-avatar', teal), { image: 'block', fallback: 'grid', drawn: 'surface' });
    assert.equal(await slowAvatar.getAttribute('aria-label'), 'Sam avatar');
    releaseSlowSources();
    await page.waitForFunction(() => document.querySelector('#slow-avatar')?.getAttribute('data-image-state') === 'loaded');
    assert.deepEqual(await avatarPaint(page, '#slow-avatar', teal), { image: 'block', fallback: 'none', drawn: 'image' });

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
    // Failed: only the fallback is drawn.
    assert.deepEqual(await avatarPaint(page, '#avatar-case .muxui-avatar', teal), { image: 'none', fallback: 'grid', drawn: 'surface' });
    assert.equal(await avatar.getAttribute('role'), 'img');
    assert.equal(await avatar.getAttribute('aria-label'), 'Alex avatar');
    assert.equal(await page.locator('#avatar-errors').textContent(), '0');
    // The theme switches on the scheme attribute, not the media query.
    const schemeColors = {};
    for (const colorScheme of ['light', 'dark']) {
      await page.evaluate((scheme) => { document.documentElement.dataset.muxuiColorScheme = scheme; }, colorScheme);
      const colors = await page.locator('#avatar-case .muxui-avatar').first().evaluate((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, color: style.color };
      });
      schemeColors[colorScheme] = colors;
      assert.notEqual(colors.background, 'rgba(0, 0, 0, 0)', `${colorScheme} avatar should use a token-backed surface`);
      assert.notEqual(colors.color, '', `${colorScheme} avatar should expose computed foreground`);
      assert.ok(
        contrastRatio(colors.background, colors.color) >= 4.5,
        `${colorScheme} avatar fallback foreground/background must meet 4.5:1 contrast (${colors.color} on ${colors.background})`,
      );
    }
    assert.notEqual(schemeColors.dark.background, schemeColors.light.background, 'the dark pass paints the dark surface');
    await page.evaluate(() => { delete document.documentElement.dataset.muxuiColorScheme; });
    const cachedImage = page.locator('#cached-image');
    await page.waitForFunction(() => document.querySelector('#cached-avatar')?.getAttribute('data-image-state') === 'loaded');
    assert.equal(await cachedImage.getAttribute('alt'), 'Cached workspace logo');
    assert.equal(await cachedImage.evaluate((node) => node.complete && node.naturalWidth > 0), true);
    assert.equal(await page.locator('#cached-avatar').getAttribute('data-image-state'), 'loaded');
    // Loaded: the image is drawn and the hidden fallback is not painted over it.
    assert.deepEqual(await avatarPaint(page, '#cached-avatar', black), { image: 'block', fallback: 'none', drawn: 'image' });

    await page.evaluate(() => window.__muxuiImageAvatarSwitch());
    await page.waitForFunction(() => document.querySelector('#image-case .muxui-image')?.getAttribute('data-fallback') === null);
    await page.waitForFunction(() => document.querySelector('#avatar-case .muxui-avatar')?.getAttribute('data-image-state') === 'loaded');
    assert.equal(await avatar.getAttribute('role'), null);
    assert.equal(await avatar.getAttribute('aria-label'), null);
    assert.equal((await avatarPaint(page, '#avatar-case .muxui-avatar', 'rgb(255, 255, 255)')).drawn, 'image');
    await page.waitForFunction(() => document.querySelector('#image-loads')?.textContent === '2');
    await page.waitForFunction(() => document.querySelector('#avatar-loads')?.textContent === '1');
    assert.equal(await page.locator('#image-errors').textContent(), '0');
    assert.equal(await page.locator('#avatar-errors').textContent(), '0');

    assert.deepEqual(errors, [], errors.join('\n'));

    // Without JavaScript, server markup still paints a cached image over its fallback.
    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 900, height: 900 } });
    const staticPage = await noScript.newPage();
    await staticPage.goto(`${url}/image-avatar.html`, { waitUntil: 'domcontentloaded' });
    await staticPage.waitForFunction(() => document.querySelector('#cached-avatar img')?.complete);
    assert.equal(await staticPage.locator('#cached-avatar').getAttribute('data-image-state'), 'loading');
    assert.deepEqual(await avatarPaint(staticPage, '#cached-avatar', black), { image: 'block', fallback: 'grid', drawn: 'image' });
    await noScript.close();
  } finally {
    releaseSlowSources();
    await browser?.close();
    await close();
  }
});

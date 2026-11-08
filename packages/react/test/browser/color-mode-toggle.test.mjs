import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { ColorModeToggle } from '../../generated/index.mjs';
import { awaitFontsAndFrames, launchBrowser, pageShell, startServer } from './harness.mjs';

const e = React.createElement;
function ColorModeFixture() {
  const [mode, setMode] = React.useState('light');
  return e('main', { id: 'outer' }, e('section', { id: 'inner' },
    e(ColorModeToggle, { mode, onModeChange: setMode, storageKey: 'color-mode-motion', 'aria-label': 'Color mode' })));
}
const entry = `
import React from 'react'; import { hydrateRoot } from 'react-dom/client';
import { ColorModeToggle } from '/generated/index.mjs';
const e = React.createElement;
${ColorModeFixture.toString()}
hydrateRoot(document.querySelector('#root'), e(ColorModeFixture));
window.ready = true;
`;
const fixture = pageShell({
  attributes: 'data-muxui-motion="full" data-muxui-color-scheme="light"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  body: `<div id="root">${renderToString(e(ColorModeFixture))}</div>`,
  entry: '/color-mode-toggle-entry.mjs',
});

async function glyph(page) {
  return page.locator('.muxui-color-mode-toggle').evaluate((node) => {
    const style = getComputedStyle(node, '::before');
    return { transform: style.transform, boxShadow: style.boxShadow, duration: style.transitionDuration,
      animations: node.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length };
  });
}

async function settled(page) {
  await page.waitForFunction(() => document.querySelector('.muxui-color-mode-toggle').getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running'));
}

async function nextFrame(page) {
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}

test('ColorModeToggle preserves full glyph motion and snaps system, self and ancestor reduced motion during changes', { timeout: 30_000 }, async () => {
  const server = await startServer({ entries: ['generated/index.mjs'], pages: { '/color-mode-toggle.html': fixture }, modules: { '/color-mode-toggle-entry.mjs': entry } });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${server.url}/color-mode-toggle.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.ready);
    await awaitFontsAndFrames(page);
    const toggle = page.getByRole('switch', { name: 'Color mode', exact: true });
    await toggle.focus();
    await settled(page);
    const light = await glyph(page);
    assert.equal(light.duration, '0.4s');
    await toggle.press('Space');
    await nextFrame(page);
    const moving = await glyph(page);
    assert.notEqual(moving.transform, light.transform);
    assert.ok(moving.animations > 0, 'the native glyph transition runs');
    await settled(page);
    const dark = await glyph(page);
    assert.notEqual(moving.transform, dark.transform, 'scale interpolates before reaching the dark glyph');
    assert.notEqual(moving.boxShadow, dark.boxShadow, 'the sun/moon shape interpolates');
    assert.equal(await toggle.isChecked(), true);

    for (const scope of ['system', 'self', 'ancestor', 'outer-reduced-inner-full']) {
      await toggle.press('Space');
      await settled(page);
      assert.equal((await glyph(page)).transform, light.transform);

      const reduce = async () => {
        if (scope === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
        else await page.evaluate((scope) => {
          const target = scope === 'self' ? document.querySelector('.muxui-color-mode-toggle') : document.querySelector('#outer');
          target.setAttribute('data-muxui-motion', 'reduced');
          if (scope === 'outer-reduced-inner-full') document.querySelector('#inner').setAttribute('data-muxui-motion', 'full');
        }, scope);
      };
      const restore = async () => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => {
          for (const selector of ['.muxui-color-mode-toggle', '#outer', '#inner']) document.querySelector(selector).removeAttribute('data-muxui-motion');
        });
      };

      await reduce();
      await toggle.press('Space');
      await nextFrame(page);
      assert.deepEqual(await glyph(page), { ...dark, duration: '0s' }, `${scope}: scale and shape reach the checked endpoint without interpolation`);
      assert.equal(await toggle.isChecked(), true);
      assert.equal(await toggle.evaluate((node) => node === document.activeElement), true);

      await restore();
      assert.equal((await glyph(page)).duration, '0.4s');
      await toggle.press('Space');
      await nextFrame(page);
      assert.ok((await glyph(page)).animations > 0, `${scope}: restoring full motion restores interpolation`);
      await reduce();
      await nextFrame(page);
      assert.deepEqual(await glyph(page), { ...light, duration: '0s' }, `${scope}: an in-flight transition settles immediately when reduced motion is requested`);
      assert.equal(await toggle.isChecked(), false);
      await restore();
      await toggle.press('Space');
      await settled(page);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

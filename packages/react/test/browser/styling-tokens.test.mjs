import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import test from 'node:test';

const packageRoot = resolve(import.meta.dirname, '../..');

async function chromePath() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for styling verification.');
}

test('calendar, field and collection hooks respond independently to gap and inset overrides', { timeout: 30_000 }, async () => {
  const base = await readFile(resolve(packageRoot, 'src/styles/base.css'), 'utf8');
  const css = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  const calendarRule = base.match(/\.muxui-calendar,\s*\.muxui-range-calendar\s*\{([^}]+)\}/u)?.[1];
  assert.ok(calendarRule);
  const calendarInset = calendarRule.match(/padding:\s*var\((--muxui-semantic-[\w-]+)\)/u)?.[1];
  const calendarGap = calendarRule.match(/gap:\s*var\((--muxui-semantic-[\w-]+)\)/u)?.[1];
  assert.match(calendarInset, /inset/u);
  assert.match(calendarGap, /gap/u);
  const browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
  try {
    const page = await browser.newPage();
    // These are the renderer's public styling hooks; DOM/interaction contracts are
    // covered by the component tests. Keep this fixture focused on CSS inheritance.
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>
      <div class="muxui-calendar">Calendar</div><div class="muxui-range-calendar">Range calendar</div>
      <input class="muxui-input" aria-label="Name"><div class="muxui-list-box-item">Item</div>
    </body></html>`);
    const observe = () => page.evaluate(() => Object.fromEntries(['.muxui-calendar', '.muxui-range-calendar', '.muxui-input', '.muxui-list-box-item'].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return [selector, { padding: style.padding, gap: style.gap, color: style.color, radius: style.borderRadius }];
    })));
    const override = (variable, value) => page.evaluate(([name, next]) => document.documentElement.style.setProperty(name, next), [variable, value]);
    for (const mode of ['light', 'dark']) {
      await page.evaluate((scheme) => {
        document.documentElement.removeAttribute('style');
        document.documentElement.setAttribute('data-muxui-color-scheme', scheme);
      }, mode);
      const initial = await observe();
      for (const name of ['--muxui-semantic-layout-section-gap', '--muxui-semantic-layout-control-gap', '--muxui-semantic-layout-group-gap']) await override(name, '41px');
      const gapsChanged = await observe();
      for (const selector of Object.keys(initial)) assert.equal(gapsChanged[selector].padding, initial[selector].padding, `${mode}: gaps must not change ${selector} padding`);
      await override(calendarInset, '23px');
      const insetChanged = await observe();
      for (const selector of ['.muxui-calendar', '.muxui-range-calendar']) {
        assert.equal(insetChanged[selector].padding, '23px');
        assert.equal(insetChanged[selector].gap, gapsChanged[selector].gap);
        assert.equal(insetChanged[selector].color, initial[selector].color);
        assert.equal(insetChanged[selector].radius, initial[selector].radius);
      }
      await override(calendarGap, '17px');
      const final = await observe();
      for (const selector of ['.muxui-calendar', '.muxui-range-calendar']) {
        assert.equal(final[selector].gap, '17px');
        assert.equal(final[selector].padding, '23px');
      }
    }
  } finally {
    await browser.close();
  }
});

test('focus, choice geometry, and validation text have independent semantic overrides', { timeout: 30_000 }, async () => {
  const css = (await Promise.all(['generated/styles.css', 'generated/supplemental.css', 'src/text-editor/text-editor.css']
    .map((path) => readFile(resolve(packageRoot, path), 'utf8')))).join('\n');
  const browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>
      <label class="muxui-radio muxui-radio--sm" data-focus-visible><span class="muxui-radio-indicator"></span></label>
      <div class="muxui-radio-field muxui-radio-field--sm"><label class="muxui-radio-field__button" data-focus-visible><span class="muxui-radio-field__indicator"></span></label></div>
      <div class="muxui-text-editor" data-invalid><label class="muxui-text-editor__label">Label</label><p class="muxui-text-editor__description">Validation</p></div>
    </body></html>`);
    for (const mode of ['light', 'dark']) {
      await page.evaluate((scheme) => {
        const root = document.documentElement;
        root.setAttribute('data-muxui-color-scheme', scheme);
        root.style.setProperty('--muxui-semantic-layout-inset-medium', '41px');
        root.style.setProperty('--muxui-semantic-layout-icon-size', '19px');
        root.style.setProperty('--muxui-semantic-focus-inner', '#ff00ff');
        root.style.setProperty('--muxui-semantic-feedback-invalid-border', '#00ff00');
        root.style.setProperty('--muxui-semantic-feedback-invalid-content', '#ff8000');
      }, mode);
      for (const selector of ['.muxui-radio-indicator', '.muxui-radio-field__indicator']) {
        const style = await page.locator(selector).evaluate(async (element) => {
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
          const computed = getComputedStyle(element);
          return { width: computed.width, height: computed.height, shadow: computed.boxShadow };
        });
        assert.equal(style.width, '19px', `${mode}: ${selector} width follows indicator size, not inset`);
        assert.equal(style.height, style.width, `${mode}: ${selector} remains circular`);
        assert.match(style.shadow, /rgb\(255, 0, 255\)/u, `${mode}: ${selector} uses the inner focus role`);
      }
      for (const selector of ['.muxui-text-editor__label', '.muxui-text-editor__description']) {
        assert.equal(await page.locator(selector).evaluate((element) => getComputedStyle(element).color), 'rgb(255, 128, 0)', `${mode}: ${selector} uses validation content, not border`);
      }
    }
  } finally {
    await browser.close();
  }
});

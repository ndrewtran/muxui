import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

function indicatorPaint(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      opacity: style.opacity,
    };
  });
}

async function settledIndicatorPaint(locator) {
  await locator.evaluate(async (element) => {
    await Promise.all([...element.getAnimations()].map((animation) => animation.finished.catch(() => undefined)));
  });
  return indicatorPaint(locator);
}

async function resolvedTokenPaint(page, token) {
  return page.evaluate((tokenName) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${tokenName})`;
    probe.style.borderColor = `var(${tokenName})`;
    probe.style.position = 'absolute';
    probe.style.inlineSize = '1px';
    probe.style.blockSize = '1px';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const paint = { backgroundColor: style.backgroundColor, borderColor: style.borderColor };
    probe.remove();
    return paint;
  }, token);
}

function assertPaintMatchesToken(paint, tokens, label) {
  assert.equal(paint.backgroundColor, tokens.backgroundColor, `${label} background`);
  assert.equal(paint.borderColor, tokens.borderColor, `${label} border`);
}

function assertNoFocusPaint(paint, label) {
  assert.equal(paint.boxShadow, 'none', `${label} pointer focus shadow`);
  assert.ok(paint.outlineStyle === 'none' || paint.outlineWidth === '0px', `${label} pointer focus outline`);
}

function assertKeyboardFocusPaint(paint, label) {
  assert.notEqual(paint.boxShadow, 'none', `${label} keyboard focus shadow`);
}

test('Checkbox and CheckboxField share pointer and keyboard focus modality in light, dark, and forced colors', { timeout: 120_000 }, async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-checkbox-focus-vite-'));
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Checkbox } from '/src/components.mjs';
    import { CheckboxField } from '/src/supplemental/index.mjs';
    import '/generated/styles.css';
    const h = React.createElement;
    function App() {
      return h('main', { 'data-checkbox-focus-fixture': true },
        h('button', { type: 'button', 'data-focus-start': true }, 'Start'),
        h(Checkbox, { 'data-testid': 'core', defaultChecked: false }, 'Core'),
        h(CheckboxField.Root, { 'data-testid': 'field', defaultChecked: false },
          h(CheckboxField.Button, null, h(CheckboxField.Indicator, null), h('span', null, 'Field'))),
        h(Checkbox, { 'data-testid': 'core-indeterminate', indeterminate: true }, 'Core indeterminate'),
        h(CheckboxField.Root, { 'data-testid': 'field-indeterminate', indeterminate: true },
          h(CheckboxField.Button, null, h(CheckboxField.Indicator, null), h('span', null, 'Field indeterminate'))),
        h(Checkbox, { 'data-testid': 'core-invalid', invalid: true }, 'Core invalid'),
        h(CheckboxField.Root, { 'data-testid': 'field-invalid', invalid: true },
          h(CheckboxField.Button, null, h(CheckboxField.Indicator, null), h('span', null, 'Field invalid'))),
        h(Checkbox, { 'data-testid': 'core-disabled', defaultChecked: true, disabled: true }, 'Core disabled'),
        h(CheckboxField.Root, { 'data-testid': 'field-disabled', defaultChecked: true, disabled: true },
          h(CheckboxField.Button, null, h(CheckboxField.Indicator, null), h('span', null, 'Field disabled'))));
    }
    createRoot(document.getElementById('root')).render(h(App));`;
  const entryPath = join(cacheDir, 'checkbox-focus-states-entry.mjs');
  await writeFile(entryPath, entry);
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>
    html, body { min-height: 100%; margin: 0; }
    body { padding: 48px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong); }
    main { display: grid; gap: 12px; }
  </style></head><body><div id="root"></div><script type="module" src="/checkbox-focus-states-entry.mjs"></script></body></html>`;
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    cacheDir,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: [entryPath], include: ['react', 'react-dom/client', 'react-aria', 'react-aria-components'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot, cacheDir] } },
    plugins: [{
      name: 'muxui-checkbox-focus-fixture',
      resolveId(id) {
        if (id === '/checkbox-focus-states-entry.mjs') return entryPath;
        return undefined;
      },
      load(id) {
        if (id === entryPath) return entry;
        return undefined;
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/checkbox-focus.html') {
            response.setHeader('content-type', 'text/html');
            response.end(html);
          } else next();
        });
      },
    }],
  });
  let browser;
  const evidenceDir = process.env.MUXUI_CHECKBOX_FOCUS_EVIDENCE_DIR ?? '/tmp/muxui-checkbox-focus-evidence';
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/checkbox-focus.html`, { waitUntil: 'networkidle' });
    try {
      await page.locator('[data-checkbox-focus-fixture]').waitFor();
    } catch (error) {
      throw new Error(`${error.message}\n${errors.join('\n')}`);
    }
    const core = page.locator('[data-testid="core"]');
    const coreIndicator = core.locator('.muxui-checkbox-indicator');
    const field = page.locator('[data-testid="field"]');
    const fieldButton = field.locator('.muxui-checkbox-field__button');
    const fieldIndicator = field.locator('.muxui-checkbox-field__indicator');
    const coreIndeterminate = page.locator('[data-testid="core-indeterminate"]');
    const coreIndeterminateIndicator = coreIndeterminate.locator('.muxui-checkbox-indicator');
    const fieldIndeterminate = page.locator('[data-testid="field-indeterminate"]');
    const fieldIndeterminateIndicator = fieldIndeterminate.locator('.muxui-checkbox-field__indicator');
    const coreInvalid = page.locator('[data-testid="core-invalid"]');
    const coreInvalidIndicator = coreInvalid.locator('.muxui-checkbox-indicator');
    const fieldInvalid = page.locator('[data-testid="field-invalid"]');
    const fieldInvalidIndicator = fieldInvalid.locator('.muxui-checkbox-field__indicator');
    const coreDisabled = page.locator('[data-testid="core-disabled"]');
    const fieldDisabledButton = page.locator('[data-testid="field-disabled"] .muxui-checkbox-field__button');
    await coreIndicator.waitFor();
    await fieldIndicator.waitFor();
    await mkdir(evidenceDir, { recursive: true });

    for (const mode of ['light', 'dark']) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('[data-checkbox-focus-fixture]').waitFor();
      await page.emulateMedia({ forcedColors: 'none', colorScheme: mode });
      await page.evaluate((scheme) => {
        document.documentElement.setAttribute('data-muxui-color-scheme', scheme);
        document.documentElement.style.setProperty('--muxui-semantic-motion-interaction-duration', '0ms');
        document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '0ms');
      }, mode);
      await page.locator('[data-focus-start]').click();

      const expectedTokens = {
        selected: mode === 'dark' ? '--muxui-semantic-action-selection-background' : '--muxui-semantic-selection-track',
        selectedHover: '--muxui-semantic-action-background-hover',
        unchecked: mode === 'dark'
          ? ['--muxui-semantic-color-neutral-default-98', '--muxui-semantic-color-neutral-default-60']
          : ['--muxui-semantic-surface-raised', '--muxui-semantic-border-indicator'],
        uncheckedHover: mode === 'dark'
          ? ['--muxui-semantic-color-neutral-default-94', '--muxui-semantic-color-neutral-default-40']
          : ['--muxui-semantic-surface-hover', '--muxui-semantic-border-indicator-hover'],
        invalid: mode === 'dark'
          ? ['--muxui-semantic-color-neutral-default-98', '--muxui-semantic-feedback-invalid-border']
          : ['--muxui-semantic-surface-raised', '--muxui-semantic-feedback-invalid-border'],
      };
      const expectedSelected = await resolvedTokenPaint(page, expectedTokens.selected);
      const expectedSelectedHover = await resolvedTokenPaint(page, expectedTokens.selectedHover);
      const expectedUnchecked = {
        backgroundColor: (await resolvedTokenPaint(page, expectedTokens.unchecked[0])).backgroundColor,
        borderColor: (await resolvedTokenPaint(page, expectedTokens.unchecked[1])).borderColor,
      };
      const expectedUncheckedHover = {
        backgroundColor: (await resolvedTokenPaint(page, expectedTokens.uncheckedHover[0])).backgroundColor,
        borderColor: (await resolvedTokenPaint(page, expectedTokens.uncheckedHover[1])).borderColor,
      };
      const expectedInvalid = {
        backgroundColor: (await resolvedTokenPaint(page, expectedTokens.invalid[0])).backgroundColor,
        borderColor: (await resolvedTokenPaint(page, expectedTokens.invalid[1])).borderColor,
      };

      await core.click();
      await page.mouse.move(0, 0);
      const coreSelected = await settledIndicatorPaint(coreIndicator);
      assertNoFocusPaint(coreSelected, `${mode} core checked`);
      await fieldButton.click();
      await page.mouse.move(0, 0);
      const fieldSelected = await settledIndicatorPaint(fieldIndicator);
      assertNoFocusPaint(fieldSelected, `${mode} field checked`);
      assert.deepEqual(
        { backgroundColor: fieldSelected.backgroundColor, borderColor: fieldSelected.borderColor },
        { backgroundColor: coreSelected.backgroundColor, borderColor: coreSelected.borderColor },
        `${mode} selected indicator paint`,
      );
      assertPaintMatchesToken(coreSelected, expectedSelected, `${mode} selected token`);
      await core.hover();
      const coreSelectedHover = await settledIndicatorPaint(coreIndicator);
      await fieldButton.hover();
      const fieldSelectedHover = await settledIndicatorPaint(fieldIndicator);
      assert.deepEqual(
        { backgroundColor: fieldSelectedHover.backgroundColor, borderColor: fieldSelectedHover.borderColor },
        { backgroundColor: coreSelectedHover.backgroundColor, borderColor: coreSelectedHover.borderColor },
        `${mode} selected hover indicator paint`,
      );
      assertPaintMatchesToken(coreSelectedHover, expectedSelectedHover, `${mode} selected hover token`);

      await core.click();
      await page.mouse.move(0, 0);
      const coreUnchecked = await settledIndicatorPaint(coreIndicator);
      assertNoFocusPaint(coreUnchecked, `${mode} core unchecked`);
      await fieldButton.click();
      await page.mouse.move(0, 0);
      const fieldUnchecked = await settledIndicatorPaint(fieldIndicator);
      assertNoFocusPaint(fieldUnchecked, `${mode} field unchecked`);
      assert.deepEqual(
        { backgroundColor: fieldUnchecked.backgroundColor, borderColor: fieldUnchecked.borderColor },
        { backgroundColor: coreUnchecked.backgroundColor, borderColor: coreUnchecked.borderColor },
        `${mode} unchecked indicator paint`,
      );
      assertPaintMatchesToken(coreUnchecked, expectedUnchecked, `${mode} unchecked token`);
      await core.hover();
      const coreUncheckedHover = await settledIndicatorPaint(coreIndicator);
      await fieldButton.hover();
      const fieldUncheckedHover = await settledIndicatorPaint(fieldIndicator);
      assert.deepEqual(
        { backgroundColor: fieldUncheckedHover.backgroundColor, borderColor: fieldUncheckedHover.borderColor },
        { backgroundColor: coreUncheckedHover.backgroundColor, borderColor: coreUncheckedHover.borderColor },
        `${mode} unchecked hover indicator paint`,
      );
      assertPaintMatchesToken(coreUncheckedHover, expectedUncheckedHover, `${mode} unchecked hover token`);

      const coreIndeterminatePaint = await settledIndicatorPaint(coreIndeterminateIndicator);
      const fieldIndeterminatePaint = await settledIndicatorPaint(fieldIndeterminateIndicator);
      assert.deepEqual(
        { backgroundColor: fieldIndeterminatePaint.backgroundColor, borderColor: fieldIndeterminatePaint.borderColor },
        { backgroundColor: coreIndeterminatePaint.backgroundColor, borderColor: coreIndeterminatePaint.borderColor },
        `${mode} indeterminate indicator paint`,
      );
      assertPaintMatchesToken(coreIndeterminatePaint, expectedSelected, `${mode} indeterminate token`);

      const coreInvalidPaint = await settledIndicatorPaint(coreInvalidIndicator);
      const fieldInvalidPaint = await settledIndicatorPaint(fieldInvalidIndicator);
      assert.deepEqual(
        { backgroundColor: fieldInvalidPaint.backgroundColor, borderColor: fieldInvalidPaint.borderColor },
        { backgroundColor: coreInvalidPaint.backgroundColor, borderColor: coreInvalidPaint.borderColor },
        `${mode} invalid indicator paint`,
      );
      assertPaintMatchesToken(coreInvalidPaint, expectedInvalid, `${mode} invalid token`);

      await page.locator('[data-focus-start]').focus();
      await page.keyboard.press('Tab');
      assert.equal(await core.evaluate((element) => element.contains(document.activeElement)), true, `${mode} core receives keyboard focus`);
      await page.keyboard.press('Space');
      const coreKeyboard = await settledIndicatorPaint(coreIndicator);
      assertKeyboardFocusPaint(coreKeyboard, `${mode} core checked`);
      await page.keyboard.press('Tab');
      assert.equal(await field.evaluate((element) => element.contains(document.activeElement)), true, `${mode} field receives keyboard focus`);
      await page.keyboard.press('Space');
      const fieldKeyboard = await settledIndicatorPaint(fieldIndicator);
      assertKeyboardFocusPaint(fieldKeyboard, `${mode} field checked`);
      assert.equal(fieldKeyboard.boxShadow, coreKeyboard.boxShadow, `${mode} shared keyboard focus shadow`);
      await page.screenshot({ path: join(evidenceDir, `checkbox-focus-${mode}.png`), fullPage: true });
    }

    await page.emulateMedia({ forcedColors: 'active' });
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'light'));
    assert.equal((await indicatorPaint(coreDisabled)).opacity, '1', 'forced-colors core disabled opacity');
    assert.equal((await indicatorPaint(fieldDisabledButton)).opacity, '1', 'forced-colors field disabled opacity');
    await page.locator('[data-focus-start]').focus();
    await page.keyboard.press('Tab');
    const forcedCore = await indicatorPaint(coreIndicator);
    assert.equal(forcedCore.boxShadow, 'none', 'forced-colors core shadow');
    assert.notEqual(forcedCore.outlineStyle, 'none', 'forced-colors core focus outline');
    assert.notEqual(forcedCore.outlineWidth, '0px', 'forced-colors core focus outline width');
    await page.keyboard.press('Tab');
    const forcedField = await indicatorPaint(fieldIndicator);
    assert.equal(forcedField.boxShadow, 'none', 'forced-colors field shadow');
    assert.notEqual(forcedField.outlineStyle, 'none', 'forced-colors field focus outline');
    assert.notEqual(forcedField.outlineWidth, '0px', 'forced-colors field focus outline width');
    assert.equal(forcedField.outlineStyle, forcedCore.outlineStyle, 'forced-colors shared focus outline style');
    assert.equal(forcedField.outlineWidth, forcedCore.outlineWidth, 'forced-colors shared focus outline width');
    assert.equal(forcedField.borderColor, forcedCore.borderColor, 'forced-colors shared indicator border');
    assert.equal(forcedField.backgroundColor, forcedCore.backgroundColor, 'forced-colors shared indicator background');
    await page.screenshot({ path: join(evidenceDir, 'checkbox-focus-forced-colors.png'), fullPage: true });
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

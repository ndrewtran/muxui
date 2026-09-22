import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { FieldStatesBrowserFixture } from '../fixtures/field-states-browser-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

const families = Object.freeze([
  ['text', '.muxui-field-input'],
  ['search', '.muxui-field-input'],
  ['number', '.muxui-number-control'],
  ['date', '.muxui-date-input'],
  ['time', '.muxui-date-input'],
  ['date-picker', '.muxui-date-control'],
  ['date-range', '.muxui-date-range-control'],
  ['autocomplete', '.muxui-field-input'],
  ['color', '.muxui-field-input'],
  ['combo', '.muxui-combo-control'],
  ['select', '.muxui-select-trigger'],
  ['token', '.muxui-token-field'],
  ['input', '.muxui-input'],
  ['textarea', '.muxui-text-area__textarea'],
  ['input-tags', '.muxui-input-tags__group'],
  ['multi-select', '.muxui-multi-select__trigger'],
  ['payment', '.muxui-payment-input__input'],
  ['tag-select', '.muxui-tag-select__group'],
  ['select-native', '.muxui-select-native'],
]);

const labelSelectors = Object.freeze({
  text: '.muxui-field-label',
  search: '.muxui-field-label',
  number: '.muxui-field-label',
  date: '.muxui-field-label',
  time: '.muxui-field-label',
  'date-picker': '.muxui-field-label',
  'date-range': '.muxui-field-label',
  autocomplete: '.muxui-field-label',
  color: '.muxui-field-label',
  combo: '.muxui-field-label',
  select: '.muxui-field-label',
  token: '.muxui-field-label',
  input: '.muxui-input__label',
  textarea: '.muxui-text-area__label',
  'input-tags': '.muxui-input-tags__label',
  'multi-select': '.muxui-multi-select__label',
  payment: '.muxui-payment-input__label',
  'tag-select': '.muxui-tag-select__label',
  'select-native': '.muxui-select-native__label',
});

const readonlyFamilies = Object.freeze([
  ['text', '.muxui-field-input'],
  ['search', '.muxui-field-input'],
  ['number', '.muxui-number-control'],
  ['date', '.muxui-date-input'],
  ['time', '.muxui-date-input'],
  ['date-picker', '.muxui-date-control'],
  ['date-range', '.muxui-date-range-control'],
  ['color', '.muxui-field-input'],
  ['combo', '.muxui-combo-control'],
  ['select', '.muxui-select-trigger'],
  ['autocomplete', '.muxui-field-input'],
  ['token', '.muxui-token-field'],
  ['input', '.muxui-input'],
  ['textarea', '.muxui-text-area__textarea'],
  ['payment', '.muxui-payment-input__input'],
]);

const foregroundFamilies = new Set([
  'text', 'search', 'autocomplete', 'color', 'input', 'textarea', 'payment', 'select-native',
]);

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

function ownerLocator(page, testId, selector) {
  return selector === null
    ? page.locator(`[data-testid="${testId}"]`).first()
    : page.locator(`[data-testid="${testId}"] ${selector}`).first();
}

function labelLocator(page, testId, family) {
  return page.locator(`[data-testid="${testId}"] ${labelSelectors[family]}`).first();
}

async function computedState(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
      opacity: style.opacity,
      color: style.color,
      position: style.position,
      zIndex: style.zIndex,
    };
  });
}

async function focusOwner(page, anchorId, testId, selector) {
  await page.locator('h1').hover();
  const anchor = page.locator(`[data-focus-anchor="${anchorId}"]`);
  await anchor.focus();
  await anchor.press('Tab');
  const locator = ownerLocator(page, testId, selector);
  const focusState = await locator.evaluate((element) => {
    const active = document.activeElement;
    const activeStyle = active ? getComputedStyle(active) : null;
    const rect = active?.getBoundingClientRect();
    return {
      contained: Boolean(active && element.contains(active)),
      visible: Boolean(active && activeStyle && activeStyle.display !== 'none' && activeStyle.visibility !== 'hidden' && rect && rect.width > 0 && rect.height > 0),
      activeTag: active?.tagName,
      activeClass: active?.className,
    };
  });
  assert.equal(focusState.contained, true, `${anchorId} keyboard focus target is outside ${testId} (${focusState.activeTag}.${focusState.activeClass})`);
  assert.equal(focusState.visible, true, `${anchorId} keyboard focus target is hidden (${focusState.activeTag}.${focusState.activeClass})`);
  return locator;
}

async function focusDateTrigger(page, anchorId, testId, selector) {
  await page.locator('h1').hover();
  const anchor = page.locator(`[data-focus-anchor="${anchorId}"]`);
  await anchor.focus();
  await anchor.press('Tab');
  const shell = ownerLocator(page, testId, selector);
  const segmentFocus = await shell.evaluate((element) => {
    const active = document.activeElement;
    const activeStyle = active ? getComputedStyle(active) : null;
    const rect = active?.getBoundingClientRect();
    return {
      contained: Boolean(active && element.contains(active)),
      visible: Boolean(active && activeStyle && activeStyle.display !== 'none' && activeStyle.visibility !== 'hidden' && rect && rect.width > 0 && rect.height > 0),
      activeClass: active?.className,
    };
  });
  assert.equal(segmentFocus.contained, true, `${anchorId} first keyboard target is outside ${testId} (${segmentFocus.activeClass})`);
  assert.equal(segmentFocus.visible, true, `${anchorId} first keyboard target is hidden (${segmentFocus.activeClass})`);
  const segmentState = await computedState(shell);
  const trigger = ownerLocator(page, testId, '.muxui-date-trigger');
  let triggerFocus = null;
  for (let tabCount = 0; tabCount < 12; tabCount += 1) {
    await page.keyboard.press('Tab');
    const candidate = await trigger.evaluate((element) => {
      const active = document.activeElement;
      const style = getComputedStyle(element);
      const rect = active?.getBoundingClientRect();
      return {
        focused: active === element,
        visible: Boolean(active === element && style.display !== 'none' && style.visibility !== 'hidden' && rect && rect.width > 0 && rect.height > 0),
        focusVisible: element.matches(':focus-visible, [data-focus-visible]'),
        activeTag: active?.tagName,
        activeClass: active?.className,
        activeLabel: active?.getAttribute('aria-label'),
      };
    });
    if (candidate.focused) {
      triggerFocus = candidate;
      break;
    }
    const stillInShell = await shell.evaluate((element) => element.contains(document.activeElement));
    assert.equal(stillInShell, true, `${anchorId} keyboard focus left the field before reaching its trigger`);
  }
  assert.ok(triggerFocus, `${anchorId} keyboard tabs did not reach the date trigger`);
  assert.equal(triggerFocus.focused, true, `${anchorId} keyboard target is not the date trigger (${triggerFocus.activeTag}.${triggerFocus.activeClass}, ${triggerFocus.activeLabel})`);
  assert.equal(triggerFocus.visible, true, `${anchorId} date trigger keyboard target is hidden (${triggerFocus.activeTag}.${triggerFocus.activeClass})`);
  assert.equal(triggerFocus.focusVisible, true, `${anchorId} date trigger has no keyboard-focus state`);
  const triggerState = await computedState(trigger);
  assert.equal(triggerState.position, 'relative', `${anchorId} date trigger focus cue is not layered above the shell`);
  assert.equal(triggerState.zIndex, '1', `${anchorId} date trigger focus cue has no stacking priority`);
  assert.ok(
    triggerState.outlineColor !== segmentState.outlineColor
      || triggerState.outlineStyle !== segmentState.outlineStyle
      || triggerState.outlineWidth !== segmentState.outlineWidth
      || triggerState.outlineOffset !== segmentState.outlineOffset
      || triggerState.boxShadow !== segmentState.boxShadow
      || triggerState.zIndex !== segmentState.zIndex,
    `${anchorId} trigger cue is indistinguishable from segment/shell focus`,
  );
  return { shell, trigger, segmentState, triggerState };
}

async function blurPage(page) {
  await page.locator('h1').click();
}

async function setMode(page, mode) {
  await page.evaluate((nextMode) => document.documentElement.setAttribute('data-muxui-color-scheme', nextMode), mode);
  await page.waitForTimeout(0);
}

async function assertStateMatches(page, state, reference, stateName, options = {}) {
  const { skip = new Set(), compareLabels = state === 'invalid' || state === 'disabled' } = options;
  const referenceLabel = compareLabels ? await computedState(labelLocator(page, `text-${state}`, 'text')) : null;
  for (const [name, selector] of families) {
    if (skip.has(name)) continue;
    const testId = `${name}-${state}`;
    const locator = ownerLocator(page, testId, selector);
    await locator.waitFor();
    const current = await computedState(locator);
    assert.equal(current.outlineColor, reference.outlineColor, `${stateName} ${name} outline`);
    assert.equal(current.outlineStyle, reference.outlineStyle, `${stateName} ${name} outline style`);
    assert.equal(current.outlineWidth, reference.outlineWidth, `${stateName} ${name} outline width`);
    assert.equal(current.boxShadow, reference.boxShadow, `${stateName} ${name} shadow`);
    if (state === 'disabled') {
      assert.equal(current.backgroundColor, reference.backgroundColor, `${stateName} ${name} background`);
      assert.equal(current.opacity, reference.opacity, `${stateName} ${name} opacity`);
    }
    if ((state === 'invalid' || state === 'disabled') && foregroundFamilies.has(name)) {
      assert.equal(current.color, reference.color, `${stateName} ${name} foreground`);
    }
    if (compareLabels) {
      const currentLabel = await computedState(labelLocator(page, testId, name));
      assert.equal(currentLabel.color, referenceLabel.color, `${stateName} ${name} label color`);
      assert.equal(currentLabel.opacity, referenceLabel.opacity, `${stateName} ${name} label opacity`);
    }
  }
}

function assertFocusedMatch(current, reference, stateName) {
  assert.equal(current.outlineColor, reference.outlineColor, `${stateName} outline`);
  assert.equal(current.outlineStyle, reference.outlineStyle, `${stateName} outline style`);
  assert.equal(current.outlineWidth, reference.outlineWidth, `${stateName} outline width`);
  assert.equal(current.boxShadow, reference.boxShadow, `${stateName} shadow`);
}

test('field families share TextField interaction states in light, dark, and forced colors', { timeout: 120_000 }, async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-field-states-vite-'));
  const entryPath = fileURLToPath(new URL('./field-states-browser-entry.mjs', import.meta.url));
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { FieldStatesBrowserFixture } from '/test/fixtures/field-states-browser-fixture.mjs';
    import '/generated/styles.css';
createRoot(document.getElementById('root')).render(React.createElement(FieldStatesBrowserFixture));`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/field-states-browser-entry.mjs"></script></body></html>`;
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    cacheDir,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['src/fields.mjs', 'src/collections.mjs', 'src/supplemental/index.mjs', 'src/supplemental/select-native.mjs'], include: ['react', 'react-dom/client', 'react-aria', 'react-aria-components'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'muxui-field-states-fixture',
      resolveId(id) { return id === '/field-states-browser-entry.mjs' ? entryPath : undefined; },
      load(id) { return id === entryPath ? entry : undefined; },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/field-states.html') {
            response.setHeader('content-type', 'text/html');
            response.end(html);
          } else next();
        });
      },
    }],
  });
  let browser;
  const evidenceDir = process.env.MUXUI_FIELD_STATES_EVIDENCE_DIR ?? '/tmp/muxui-field-states-evidence';
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/field-states.html`, { waitUntil: 'networkidle' });
    await page.locator('[data-muxui-field-states-fixture]').waitFor();
    await page.addStyleTag({ content: `
      *,:before,:after { transition: none !important; animation: none !important; }
      @media (forced-colors: none) {
        html,
        body,
        [data-muxui-field-states-fixture] {
          background-color: var(--muxui-semantic-surface-canvas);
          color: var(--muxui-semantic-content-default);
        }
      }
    ` });
    assert.deepEqual(errors, [], errors.join('\n'));

    await mkdir(evidenceDir, { recursive: true });
    for (const mode of ['light', 'dark']) {
      await page.emulateMedia({ forcedColors: 'none' });
      await setMode(page, mode);
      const textNormal = ownerLocator(page, 'text-normal', '.muxui-field-input');
      const textInvalid = ownerLocator(page, 'text-invalid', '.muxui-field-input');
      const textDisabled = ownerLocator(page, 'text-disabled', '.muxui-field-input');
      await blurPage(page);
      const textIdle = await computedState(textNormal);
      const textHover = await textNormal.hover().then(() => computedState(textNormal));
      const textFocus = await focusOwner(page, 'text-normal', 'text-normal', '.muxui-field-input').then(computedState);
      assert.ok(
        textFocus.outlineColor !== textIdle.outlineColor
          || textFocus.outlineStyle !== textIdle.outlineStyle
          || textFocus.outlineWidth !== textIdle.outlineWidth
          || textFocus.boxShadow !== textIdle.boxShadow,
        `${mode} TextField focus must differ from idle`,
      );
      await textNormal.screenshot({ path: join(evidenceDir, `field-states-${mode}-text-focus.png`) });
      await blurPage(page);
      const textInvalidNormal = await computedState(textInvalid);
      const textInvalidFocus = await focusOwner(page, 'text-invalid', 'text-invalid', '.muxui-field-input').then(computedState);
      await blurPage(page);
      const textDisabledState = await computedState(textDisabled);
      await assertStateMatches(page, 'invalid', textInvalidNormal, `${mode} invalid`, { skip: new Set(['token']) });

      for (const [name, selector] of families) {
        const normal = ownerLocator(page, `${name}-normal`, selector);
        await normal.waitFor();
        await blurPage(page);
        const hover = await normal.hover().then(() => computedState(normal));
        assert.equal(hover.outlineColor, textHover.outlineColor, `${mode} hover ${name} outline`);
        assert.equal(hover.outlineStyle, textHover.outlineStyle, `${mode} hover ${name} outline style`);
        assert.equal(hover.outlineWidth, textHover.outlineWidth, `${mode} hover ${name} outline width`);
        assert.equal(hover.boxShadow, textHover.boxShadow, `${mode} hover ${name} shadow`);
        const focused = await focusOwner(page, `${name}-normal`, `${name}-normal`, selector).then(computedState);
        assertFocusedMatch(focused, textFocus, `${mode} focus ${name}`);
        if (name === 'color') {
          await normal.screenshot({ path: join(evidenceDir, `field-states-${mode}-color-focus.png`) });
        }
        const focusedHovered = await normal.hover().then(() => computedState(normal));
        assertFocusedMatch(focusedHovered, textFocus, `${mode} hover+focus ${name}`);
        await blurPage(page);
      }

      for (const [name, selector] of families) {
        if (name === 'token') continue;
        const invalid = ownerLocator(page, `${name}-invalid`, selector);
        const focused = await focusOwner(page, `${name}-invalid`, `${name}-invalid`, selector).then(computedState);
        assertFocusedMatch(focused, textInvalidFocus, `${mode} invalid focus ${name}`);
        const focusedHovered = await invalid.hover().then(() => computedState(invalid));
        assertFocusedMatch(focusedHovered, textInvalidFocus, `${mode} invalid hover+focus ${name}`);
        await blurPage(page);
      }

      await assertStateMatches(page, 'disabled', textDisabledState, `${mode} disabled`, { skip: new Set() });

      const textDisabledInvalid = await computedState(ownerLocator(page, 'text-disabled-invalid', '.muxui-field-input'));
      const colorDisabledInvalid = await computedState(ownerLocator(page, 'color-disabled-invalid', '.muxui-field-input'));
      assert.equal(colorDisabledInvalid.outlineColor, textDisabledInvalid.outlineColor, `${mode} disabled+invalid ColorField outline`);
      assert.equal(colorDisabledInvalid.boxShadow, textDisabledInvalid.boxShadow, `${mode} disabled+invalid ColorField shadow`);
      assert.equal(colorDisabledInvalid.backgroundColor, textDisabledInvalid.backgroundColor, `${mode} disabled+invalid ColorField background`);
      assert.equal(colorDisabledInvalid.opacity, textDisabledInvalid.opacity, `${mode} disabled+invalid ColorField opacity`);

      for (const [name, selector] of readonlyFamilies) {
        const normal = ownerLocator(page, `${name}-normal`, selector);
        const readonly = ownerLocator(page, `${name}-readonly`, selector);
        const baseline = await computedState(normal);
        const readonlyState = await computedState(readonly);
        assert.equal(readonlyState.outlineColor, baseline.outlineColor, `${mode} read-only ${name} outline`);
        assert.equal(readonlyState.backgroundColor, baseline.backgroundColor, `${mode} read-only ${name} background`);
        const focused = await focusOwner(page, `readonly-${name}`, `${name}-readonly`, selector).then(computedState);
        const normalFocused = await focusOwner(page, `${name}-normal`, `${name}-normal`, selector).then(computedState);
        assertFocusedMatch(focused, normalFocused, `${mode} read-only focus ${name}`);
        await blurPage(page);
      }

      for (const [name, selector] of [['date-picker', '.muxui-date-control'], ['date-range', '.muxui-date-range-control']]) {
        await focusDateTrigger(page, `${name}-normal`, `${name}-normal`, selector);
        await blurPage(page);
      }

      await page.screenshot({ path: join(evidenceDir, `field-states-${mode}.png`), fullPage: true });

      await page.emulateMedia({ forcedColors: 'active' });
      await setMode(page, mode);
      await blurPage(page);
      const forcedTextNormal = await computedState(textNormal);
      const forcedTextFocus = await focusOwner(page, 'text-normal', 'text-normal', '.muxui-field-input').then(computedState);
      await blurPage(page);
      const forcedTextInvalid = await computedState(textInvalid);
      const forcedTextInvalidFocus = await focusOwner(page, 'text-invalid', 'text-invalid', '.muxui-field-input').then(computedState);
      await blurPage(page);
      const forcedTextDisabled = await computedState(textDisabled);
      assert.equal(forcedTextDisabled.opacity, '1', `${mode} forced-colors TextField disabled opacity`);
      for (const [name, selector] of families) {
        const normal = ownerLocator(page, `${name}-normal`, selector);
        const focused = await focusOwner(page, `${name}-normal`, `${name}-normal`, selector).then(computedState);
        assertFocusedMatch(focused, forcedTextFocus, `${mode} forced-colors focus ${name}`);
        await blurPage(page);
        const currentNormal = await computedState(normal);
        assert.equal(currentNormal.outlineColor, forcedTextNormal.outlineColor, `${mode} forced-colors normal ${name} outline`);
        assert.equal(currentNormal.outlineStyle, forcedTextNormal.outlineStyle, `${mode} forced-colors normal ${name} outline style`);
        assert.equal(currentNormal.outlineWidth, forcedTextNormal.outlineWidth, `${mode} forced-colors normal ${name} outline width`);
        const disabled = await computedState(ownerLocator(page, `${name}-disabled`, selector));
        assert.equal(disabled.opacity, '1', `${mode} forced-colors disabled ${name} opacity`);
        assert.equal(disabled.backgroundColor, forcedTextDisabled.backgroundColor, `${mode} forced-colors disabled ${name} background`);
        if (foregroundFamilies.has(name)) {
          assert.equal(disabled.color, forcedTextDisabled.color, `${mode} forced-colors disabled ${name} foreground`);
        }
      }

      for (const [name, selector] of families) {
        if (name === 'token') continue;
        const invalid = ownerLocator(page, `${name}-invalid`, selector);
        const focused = await focusOwner(page, `${name}-invalid`, `${name}-invalid`, selector).then(computedState);
        assertFocusedMatch(focused, forcedTextInvalidFocus, `${mode} forced-colors invalid focus ${name}`);
        await blurPage(page);
        const currentInvalid = await computedState(invalid);
        assert.equal(currentInvalid.outlineColor, forcedTextInvalid.outlineColor, `${mode} forced-colors invalid ${name} outline`);
        assert.equal(currentInvalid.outlineStyle, forcedTextInvalid.outlineStyle, `${mode} forced-colors invalid ${name} outline style`);
        assert.equal(currentInvalid.outlineWidth, forcedTextInvalid.outlineWidth, `${mode} forced-colors invalid ${name} outline width`);
        assert.equal(currentInvalid.boxShadow, forcedTextInvalid.boxShadow, `${mode} forced-colors invalid ${name} shadow`);
        const currentLabel = await computedState(labelLocator(page, `${name}-invalid`, name));
        const referenceLabel = await computedState(labelLocator(page, 'text-invalid', 'text'));
        assert.equal(currentLabel.color, referenceLabel.color, `${mode} forced-colors invalid ${name} label color`);
        assert.equal(currentLabel.opacity, referenceLabel.opacity, `${mode} forced-colors invalid ${name} label opacity`);
      }

      for (const [name, selector] of [['date-picker', '.muxui-date-control'], ['date-range', '.muxui-date-range-control']]) {
        await focusDateTrigger(page, `${name}-normal`, `${name}-normal`, selector);
        await blurPage(page);
      }
      await page.screenshot({ path: join(evidenceDir, `field-states-${mode}-forced-colors.png`), fullPage: true });
    }
    assert.deepEqual(errors, [], errors.join('\n'));
    await page.close();
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

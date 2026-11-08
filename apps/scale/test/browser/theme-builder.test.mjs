import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_SETTINGS, STANDARD_PRESETS, MONO_PRESETS, createScaleDocument, validateScaleDocument } from '../../src/theme-contract.mjs';
import { createScaleThemeMiddleware } from '../../src/theme-server.mjs';
import { chromeExecutable } from './chrome.mjs';

const appRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(appRoot, '../..');

async function settingsIn(page) {
  return page.evaluate(() => JSON.parse(decodeURIComponent(location.hash.slice(1))));
}

async function ready(page, url) {
  await page.goto(url);
  await page.getByRole('heading', { name: 'Scale', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function editor(page, name) {
  await page.getByRole('button', { name: `${name} editor`, exact: true }).click();
}

async function selectRole(page, name, checked = true) {
  const checkbox = page.getByRole('checkbox', { name: `Select ${name} role`, exact: true });
  if (await checkbox.isChecked() !== checked) { await checkbox.focus(); await checkbox.press('Space'); }
  assert.equal(await checkbox.isChecked(), checked);
}

async function assertMotionOff(page) {
  assert.deepEqual(await page.evaluate(() => {
    const panel = document.querySelector('.inspector-panel:not([hidden])');
    return {
      inspectorAnimation: getComputedStyle(panel).animationName,
      inspectorAnimations: panel.getAnimations().length,
      markerTransition: getComputedStyle(document.querySelector('.scale-rail'), '::after').transitionDuration,
    };
  }), { inspectorAnimation: 'none', inspectorAnimations: 0, markerTransition: '0s' });
}

// Boxes of the contrast readout parts, so narrow layouts can be checked for overlap and overflow.
async function readoutLayout(page) {
  return page.evaluate(() => {
    const box = (node) => { const { left, right, top, bottom } = node.getBoundingClientRect(); return { left, right, top, bottom }; };
    const inspector = document.querySelector('.scale-inspector');
    return {
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      inspectorOverflow: inspector.scrollWidth > inspector.clientWidth,
      inspector: box(inspector),
      rows: [...document.querySelectorAll('.contrast-methods li')].map((row) => ({
        ...box(row),
        parts: [...row.children].map((part) => ({ name: part.className, clipped: part.scrollWidth > part.clientWidth, ...box(part) })),
      })),
    };
  });
}

function assertReadoutFits(layout, label) {
  assert.equal(layout.pageOverflow, false, `${label}: no horizontal page scroll`);
  assert.equal(layout.inspectorOverflow, false, `${label}: no horizontal inspector scroll`);
  const parts = layout.rows.flatMap(({ parts: rowParts }) => rowParts);
  assert.equal(parts.length, 8, `${label}: two rows of four parts`);
  for (const part of parts) {
    assert.equal(part.clipped, false, `${label}: ${part.name} is not clipped`);
    assert.ok(part.left >= layout.inspector.left - 0.5 && part.right <= layout.inspector.right + 0.5, `${label}: ${part.name} stays inside the inspector`);
  }
  parts.forEach((a, index) => parts.slice(index + 1).forEach((b) => {
    const overlaps = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    assert.equal(overlaps, false, `${label}: ${a.name} and ${b.name} do not overlap`);
  }));
}

async function openExport(page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export theme', exact: true }).waitFor();
}

async function closeExport(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Export theme', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Export', exact: true }).evaluate((node) => node === document.activeElement), true, 'closing export restores its trigger focus');
}

async function choosePreset(page, name) {
  await page.getByRole('button', { name: MONO_PRESETS.some(([, preset]) => preset === name) ? 'Monochrome themes' : 'Standard themes', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

async function verifyPreviewColours(page, url) {
  const families = ['button', 'toggle-button', 'text-field', 'checkbox', 'switch', 'progress-bar', 'meter', 'search-field', 'number-field', 'radio-group', 'select', 'tabs', 'disclosure', 'tag-group', 'grid-list', 'calendar', 'menu', 'table', 'breadcrumbs', 'separator', 'link'];
  for (const colorMode of ['light', 'dark']) {
    const snapshots = [];
    for (const [namedColor, neutralColor] of [['#9227ad', '#765078'], ['#207c39', '#765078'], ['#207c39', '#4b6852']]) {
      const settings = { ...DEFAULT_SETTINGS, namedColor, neutralColor, colorMode, background: colorMode };
      await ready(page, `${url}/?colour-proof=${colorMode}-${namedColor.slice(1)}-${neutralColor.slice(1)}#${encodeURIComponent(JSON.stringify(settings))}`);
      await page.mouse.move(0, 0);
      snapshots.push(await page.evaluate((families) => {
        const canvas = document.querySelector('.preview-canvas');
        const resolveColour = (token) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${token})`;
          canvas.append(probe);
          const colour = getComputedStyle(probe).color;
          probe.remove();
          return colour;
        };
        const checks = [
          ['.muxui-button[data-muxui-variant="primary"]', null, 'backgroundColor', '--muxui-semantic-selection-track'],
          ['.muxui-checkbox__indicator[data-muxui-state-selected]', null, 'backgroundColor', '--muxui-semantic-selection-track'],
          ['.muxui-switch[data-muxui-state-selected]', '::before', 'backgroundColor', '--muxui-semantic-selection-track'],
          ['.muxui-grid-list__item[data-muxui-state-selected]', null, 'backgroundColor', '--muxui-semantic-selection-track'],
          ['.muxui-calendar', null, 'backgroundColor', '--muxui-semantic-surface-raised'],
          ['.muxui-menu', null, 'backgroundColor', '--muxui-semantic-surface-raised'],
        ].map(([selector, pseudo, property, token]) => {
          const node = canvas.querySelector(selector);
          if (!node) throw new Error(`Missing colour proof target: ${selector}`);
          return { selector, actual: getComputedStyle(node, pseudo)[property], expected: resolveColour(token) };
        });
        // Exercise the endpoint/outside-month cascade using the renderer's exact state hooks.
        for (const endpoint of ['data-muxui-state-selection-start', 'data-muxui-state-selection-end']) {
          const cell = document.createElement('button');
          cell.className = 'muxui-range-calendar__cell';
          for (const attribute of [endpoint, 'data-muxui-state-selected', 'data-muxui-state-outside-month']) cell.setAttribute(attribute, 'true');
          canvas.append(cell);
          for (const [property, token] of [['backgroundColor', '--muxui-semantic-selection-track'], ['color', '--muxui-semantic-action-foreground']]) {
            checks.push({ selector: `RangeCalendar ${endpoint} outside-month ${property}`, actual: getComputedStyle(cell)[property], expected: resolveColour(token) });
          }
          cell.remove();
        }
        const colours = Object.fromEntries(families.map((family) => {
          const nodes = [...canvas.querySelectorAll(`.muxui-${family}`)];
          if (!nodes.length) throw new Error(`Missing preview family: ${family}`);
          const values = nodes.flatMap((node) => [node, ...node.querySelectorAll('*')]).flatMap((node) => [null, '::before', '::after'].map((pseudo) => {
            const style = getComputedStyle(node, pseudo);
            return [style.color, style.backgroundColor, style.borderTopColor, style.outlineColor];
          }));
          return [family, JSON.stringify(values)];
        }));
        return { checks, colours };
      }, families));
      for (const { selector, actual, expected } of snapshots.at(-1).checks) assert.equal(actual, expected, `${colorMode}: ${selector}`);
      const screenshotDir = process.env.MUXUI_SCALE_SCREENSHOT_DIR;
      if (screenshotDir) {
        await mkdir(screenshotDir, { recursive: true });
        await page.locator('.preview-canvas').screenshot({ path: join(screenshotDir, `components-${colorMode}-${namedColor.slice(1)}.png`) });
      }
      await page.locator('.muxui-select__trigger').click();
      await page.locator('.muxui-select__popup').waitFor();
      assert.equal(await page.locator('.muxui-select__popup').evaluate((node) => getComputedStyle(node).backgroundColor), await page.locator('.muxui-menu').evaluate((node) => getComputedStyle(node).backgroundColor), `${colorMode}: portal surface follows preview`);
      await page.keyboard.press('Escape');
      // Prime pointer modality after Escape before entering the tooltip trigger.
      await page.mouse.move(4, 4);
      await page.getByRole('button', { name: 'Hover me', exact: true }).hover();
      await page.getByRole('tooltip').waitFor();
      snapshots.at(-1).colours.tooltip = await page.getByRole('tooltip').evaluate((node) => {
        const style = getComputedStyle(node);
        return JSON.stringify([style.color, style.backgroundColor, style.borderTopColor]);
      });
      await page.mouse.move(0, 0);
      await page.keyboard.press('Escape');
    }
    for (const family of ['button', 'checkbox', 'switch', 'radio-group', 'grid-list', 'link']) assert.notEqual(snapshots[0].colours[family], snapshots[1].colours[family], `${colorMode}: ${family} must respond to named-only changes`);
    for (const family of [...families, 'tooltip']) assert.notEqual(snapshots[0].colours[family], snapshots[2].colours[family], `${colorMode}: ${family} must respond to palette changes`);
  }
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await verifyPreviewColours(page, url);
    await page.goto('about:blank');
    await ready(page, `${url}/#${encodeURIComponent(JSON.stringify(DEFAULT_SETTINGS))}`);
    await ready(page, url);
    assert.deepEqual(await page.locator('.scale-header, .scale-rail, .scale-inspector, .preview-surface').evaluateAll((nodes) => nodes.map((node) => { const { x, y, width, height } = node.getBoundingClientRect(); return [x, y, width, height]; })), [[0, 0, 1440, 64], [0, 64, 64, 936], [64, 64, 352, 936], [448, 152, 960, 816]]);
    await page.getByRole('button', { name: 'Standard themes', exact: true }).click();
    assert.equal(await page.getByRole('menu', { name: 'Standard themes', exact: true }).getByRole('menuitem').count(), STANDARD_PRESETS.length);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Monochrome themes', exact: true }).click();
    assert.equal(await page.getByRole('menu', { name: 'Monochrome themes', exact: true }).getByRole('menuitem').count(), MONO_PRESETS.length);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('main').count(), 1, 'standalone editor has one main landmark');
    assert.equal(await page.locator('main main').count(), 0);
    await page.getByRole('radio', { name: 'Neutral 27', exact: true }).click();
    await page.getByRole('button', { name: /^Copy Neutral 94,/u }).click();
    await page.getByRole('radio', { name: 'Named 11', exact: true }).click();
    assert.equal(await page.locator('.palette-swatch[aria-pressed="true"]').count(), 1);
    assert.match(await page.locator('.palette-swatch[aria-pressed="true"]').getAttribute('aria-label'), /^Copy Named 60,/u);
    assert.equal(await page.locator('.palette-details dt').first().textContent(), 'Named 60');
    assert.equal(await page.locator('.palette-swatch[aria-pressed="true"] .palette-swatch-color').evaluate((node) => getComputedStyle(node).outlineWidth), '2px');
    await page.getByRole('radio', { name: 'Neutral 27', exact: true }).click();
    assert.match(await page.locator('.palette-swatch[aria-pressed="true"]').getAttribute('aria-label'), /^Copy Neutral 94,/u);
    await page.getByRole('button', { name: /^Copy Neutral 60,/u }).click();
    await page.getByRole('radio', { name: 'Named 11', exact: true }).click();
    const pivot = page.getByRole('combobox', { name: 'Contrast pivot', exact: true });
    const pivotSwatches = page.locator('.palette-swatch:has(.swatch-pivot)');
    await pivot.selectOption('5');
    assert.match(await pivotSwatches.getAttribute('aria-label'), /^Copy Named 5,.*Contrast pivot 5$/u);
    assert.equal(await page.locator('.palette-details dt').first().textContent(), 'Named 60', 'pivot changes do not select a shade');
    const shade30 = page.getByRole('button', { name: /^Copy Named 30,/u });
    await shade30.click();
    assert.equal(await page.locator('.palette-details dt').first().textContent(), 'Named 30');
    assert.match(await pivotSwatches.getAttribute('title'), /Contrast pivot 5$/u, 'copying a shade keeps the configured pivot');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.locator('.palette-details dd').first().textContent());
    await shade30.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.palette-details dt').first().textContent(), 'Named 40', 'keyboard activation still selects and copies the focused shade');
    await pivot.selectOption('80');
    assert.match(await pivotSwatches.getAttribute('aria-label'), /^Copy Named 80,.*Contrast pivot 80$/u);
    await pivot.selectOption('auto');
    assert.equal(await pivotSwatches.count(), 1);
    assert.match(await pivotSwatches.getAttribute('aria-label'), /Automatic foreground boundary$/u);
    await page.getByRole('button', { name: /^Copy Named 60,/u }).click();
    const WCAG_ID = 'wcag2-endpoint-v1';
    const APCA_ID = 'apca-endpoint-v1';
    // Harbour with Auto: shade 40 takes dark text under WCAG 2 (4.71:1) and light text under APCA (Lc 64).
    assert.equal(await page.locator('.pivot-selector + .method-selector').count(), 1, 'the contrast method row sits under the pivot row');
    const wcagMethod = page.getByRole('radio', { name: 'WCAG 2', exact: true });
    const apcaMethod = page.getByRole('radio', { name: 'APCA', exact: true });
    const methodRows = page.locator('.contrast-methods li');
    const readout = () => methodRows.evaluateAll((rows) => rows.map((row) => [row.querySelector('.contrast-method-name').textContent, row.dataset.active ?? null, row.querySelector('.contrast-method-text').textContent, row.querySelector('.contrast-method-score').textContent]));
    const compiledText = (shade) => page.locator('.scale-app').evaluate((node, token) => getComputedStyle(node).getPropertyValue(token).trim(), `--muxui-semantic-color-color-${shade}-fg`);
    await page.getByRole('button', { name: /^Copy Named 40,/u }).click();
    assert.equal(await wcagMethod.isChecked(), true);
    assert.equal(await compiledText(40), '#00222a');
    assert.match(await pivotSwatches.getAttribute('aria-label'), /^Copy Named 50,.*Automatic foreground boundary$/u);
    assert.match(await page.getByRole('button', { name: /^Copy Named 40,/u }).getAttribute('aria-label'), /, 4\.71 to 1, AA$/u);
    assert.deepEqual(await readout(), [['WCAG 2', 'true', '#00222a', '4.71:1 · AA'], ['APCA', null, '#f2f9fb', 'Lc 64 · 60+']]);
    await apcaMethod.click();
    assert.equal(await apcaMethod.isChecked(), true);
    assert.equal(await compiledText(40), '#f2f9fb');
    assert.match(await pivotSwatches.getAttribute('aria-label'), /^Copy Named 40,.*Automatic foreground boundary$/u);
    assert.match(await page.getByRole('button', { name: /^Copy Named 40,/u }).getAttribute('aria-label'), /, Lc 64, 60\+/u);
    assert.deepEqual(await readout(), [['WCAG 2', null, '#00222a', '4.71:1 · AA'], ['APCA', 'true', '#f2f9fb', 'Lc 64 · 60+']]);
    assert.deepEqual(await methodRows.evaluateAll((rows) => rows.map((row) => [getComputedStyle(row).fontWeight, getComputedStyle(row).color])), [['400', 'rgb(102, 102, 102)'], ['600', 'rgb(0, 0, 0)']], 'the active method reads as primary text');
    assert.equal(await page.locator('.palette-details dt').first().textContent(), 'Named 40', 'changing the method keeps the selected shade');
    assert.equal((await settingsIn(page)).contrastAlgorithm, 'apca-endpoint-v1');
    await page.reload();
    await page.getByRole('heading', { name: 'Scale', exact: true }).waitFor();
    assert.equal(await apcaMethod.isChecked(), true, 'reload keeps the method from the URL');
    assert.equal(await compiledText(40), '#f2f9fb');
    await ready(page, url);
    assert.equal(await apcaMethod.isChecked(), true, 'a fresh visit keeps the method from the saved draft');
    assert.match(await pivotSwatches.getAttribute('aria-label'), /^Copy Named 40,.*Automatic foreground boundary$/u);
    // The readout keeps one line per method at 390px and wraps the score onto its own line at 320px.
    for (const [width, colorMode, contrastAlgorithm] of [[390, 'dark', APCA_ID], [320, 'light', WCAG_ID]]) {
      const narrow = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const narrowPage = await narrow.newPage();
      await ready(narrowPage, `${url}/#${encodeURIComponent(JSON.stringify({ ...DEFAULT_SETTINGS, contrastAlgorithm, colorMode, background: colorMode }))}`);
      await narrowPage.getByRole('button', { name: /^Copy Named 40,/u }).click();
      const check = async (label) => {
        const layout = await readoutLayout(narrowPage);
        assertReadoutFits(layout, `${width}px ${label}`);
        for (const row of layout.rows) {
          const [name, chip, text, score] = row.parts;
          if (width >= 390) assert.ok([name, chip, text, score].every((part) => Math.abs((part.top + part.bottom) / 2 - (name.top + name.bottom) / 2) < 3), `${width}px ${label}: a method stays on one line`);
          else {
            assert.ok(score.top >= text.bottom - 0.5, `${width}px ${label}: the score wraps below the hex`);
            assert.ok(Math.abs(score.right - row.right) < 1, `${width}px ${label}: the wrapped score stays right-aligned`);
          }
        }
      };
      await check(contrastAlgorithm);
      if (width < 390) {
        await narrowPage.getByRole('radio', { name: 'APCA', exact: true }).click();
        await check('after switching to APCA');
      }
      await narrow.close();
    }
    // An imported translucent shade has no single score: it reads n/a without a badge and does not break the panel.
    const translucent = await context.newPage();
    const translucentErrors = [];
    translucent.on('pageerror', (error) => translucentErrors.push(error.message));
    await ready(translucent, `${url}/#${encodeURIComponent(JSON.stringify({ ...DEFAULT_SETTINGS, contrastAlgorithm: APCA_ID, additionalOverrides: { 'semantic.color.color-40': { type: 'color', unit: 'hex', value: '#00000080' } } }))}`);
    await translucent.getByRole('button', { name: /^Copy Named 40,/u }).click();
    assert.match(await translucent.getByRole('button', { name: /^Copy Named 40,/u }).getAttribute('aria-label'), /^Copy Named 40, #00000080, n\/a(?:,|$)/u);
    assert.deepEqual(await translucent.locator('.contrast-method-score').allTextContents(), ['n/a', 'n/a']);
    await translucent.getByRole('button', { name: /^Copy Named 60,/u }).click();
    assert.deepEqual(await translucent.locator('.contrast-method-score').allTextContents(), ['7.69:1 · AAA', 'Lc 88 · 75+'], 'other shades keep their scores');
    assert.deepEqual(translucentErrors, []);
    await translucent.close();
    await wcagMethod.click();
    assert.equal(await compiledText(40), '#00222a');
    assert.match(await pivotSwatches.getAttribute('aria-label'), /^Copy Named 50,.*Automatic foreground boundary$/u);
    await page.getByRole('button', { name: /^Copy Named 60,/u }).click();
    assert.equal(await page.locator('h1').evaluate((node) => getComputedStyle(node).fontSize), '18px');
    await editor(page, 'Typography');
    await assertMotionOff(page);
    await page.getByRole('button', { name: 'Individual role metrics', exact: true }).click();
    assert.equal(await page.locator('.typography-selection-row').count(), 7);
    assert.equal(await page.locator('.typography-matrix-row').count(), 8);
    for (const [key, label] of [['fontWeight', 'Weight'], ['lineHeight', 'Leading'], ['letterSpacing', 'Tracking']]) {
      const metricLabel = page.locator(`label[for="typography-display-${key}"]`);
      assert.equal(await metricLabel.locator('.typography-metric-label').textContent(), label);
      assert.equal(await metricLabel.isVisible(), true);
      await metricLabel.locator('.typography-metric-label').click();
      assert.equal(await page.locator(`#typography-display-${key}`).evaluate((node) => node === document.activeElement), true, `${label} visibly labels its input`);
      assert.equal(await page.getByRole('columnheader', { name: label, exact: true }).count(), 1);
    }
    const untouchedLabelWeight = page.getByRole('spinbutton', { name: 'label weight', exact: true });
    await untouchedLabelWeight.focus();
    await untouchedLabelWeight.blur();
    assert.equal(Object.hasOwn((await settingsIn(page)).additionalOverrides, 'semantic.typography.label-font-weight'), false);
    const bulkWeight = page.getByRole('spinbutton', { name: 'Bulk weight', exact: true });
    const bulkLeading = page.getByRole('spinbutton', { name: 'Bulk leading', exact: true });
    const bulkTracking = page.getByRole('textbox', { name: 'Bulk tracking', exact: true });
    assert.equal(await page.locator('.typography-bulk-control .typography-control-label span').count(), 0);
    await bulkWeight.fill('700');
    await bulkWeight.press('Enter');
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Weight updated'));
    await bulkLeading.fill('1.4');
    await bulkLeading.press('Enter');
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Leading updated'));
    await bulkTracking.fill('0.02em');
    await bulkTracking.press('Enter');
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Tracking updated'));
    for (const role of ['display', 'heading', 'title']) {
      assert.equal(await page.getByRole('spinbutton', { name: `${role} weight`, exact: true }).inputValue(), '700');
      assert.equal(await page.getByRole('spinbutton', { name: `${role} leading`, exact: true }).inputValue(), '1.4');
      assert.equal(await page.getByRole('textbox', { name: `${role} tracking`, exact: true }).inputValue(), '0.02em');
    }
    assert.equal(await page.locator('.typography-specimen[data-role="display"] p').evaluate((node) => getComputedStyle(node).fontWeight), '700');
    const bodyWeight = page.getByRole('spinbutton', { name: 'body weight', exact: true });
    await bodyWeight.fill('450');
    await bodyWeight.press('Enter');
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Weight updated'));
    assert.equal(await page.locator('.typography-matrix-row[data-role="expressive"] .typography-linked-value').first().textContent(), '450');
    await page.locator('.typography-matrix-row[data-role="body"]').getByRole('button', { name: 'Reset role', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('body restored'));
    assert.equal(await bodyWeight.inputValue(), '400');
    assert.equal(await page.locator('.typography-matrix-row[data-role="expressive"] .typography-linked-value').first().textContent(), '400');
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await bulkWeight.isDisabled(), true);
    for (const role of ['display', 'heading', 'title']) await selectRole(page, role);
    await selectRole(page, 'body', true);
    assert.equal(await page.locator('.typography-bulk-control').first().getByText('Body + expressive share text metrics', { exact: true }).count(), 1);
    assert.equal(await bulkWeight.getAttribute('placeholder'), 'Mixed');
    await page.waitForFunction(() => document.querySelector('#typography-bulk-fontWeight').value === '');
    assert.equal(await bulkWeight.inputValue(), '');
    await selectRole(page, 'body', false);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await selectRole(page, 'expressive', true);
    assert.equal(await page.locator('.typography-bulk-control').first().getByText('Body + expressive share text metrics', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    for (const role of ['display', 'heading', 'title']) await selectRole(page, role);
    // Navigation retains selected roles and in-progress metric text.
    await bulkTracking.fill('0.03');
    await editor(page, 'Colours');
    await editor(page, 'Typography');
    assert.equal(await bulkTracking.inputValue(), '0.03');
    assert.equal(await page.getByRole('checkbox', { name: 'Select display role', exact: true }).isChecked(), true);
    await bulkTracking.fill('0.02em');
    await bulkTracking.press('Enter');
    await editor(page, 'Radius');
    const radius = page.getByRole('slider', { name: 'Border radius factor', exact: true });
    assert.equal(await page.locator('.radius-header output').textContent(), '0.50x (default)');
    await radius.press('End');
    await page.waitForFunction(() => document.querySelector('.radius-header output').textContent === '2.00x');
    await page.locator('.radius-section').getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.radius-header output').textContent === '0.50x (default)');
    await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
    assert.equal(await page.locator('h1').evaluate((node) => getComputedStyle(node).fontSize), '18px');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

    await editor(page, 'Colours');
    await page.getByRole('radio', { name: 'Neutral 27', exact: true }).click();
    const before = await settingsIn(page);
    await page.getByRole('button', { name: 'Randomize', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Generated'));
    assert.equal((await settingsIn(page)).namedColor, before.namedColor);
    await choosePreset(page, 'Forest');
    const hexInput = page.getByRole('textbox', { name: 'BASE colour (–60) hex', exact: true });
    await hexInput.fill('127d40');
    await hexInput.press('Enter');
    await page.waitForFunction(() => JSON.parse(decodeURIComponent(location.hash.slice(1))).namedColor === '#127d40');
    assert.equal((await settingsIn(page)).neutralColor, '#127d40');
    await hexInput.fill('12');
    await editor(page, 'Typography');
    await editor(page, 'Colours');
    assert.equal(await hexInput.inputValue(), '12');
    await hexInput.fill('127d40');
    await hexInput.press('Enter');
    const colorModeToggle = page.getByRole('switch', { name: 'Preview dark mode', exact: true });
    assert.equal(await colorModeToggle.isChecked(), false);
    await colorModeToggle.focus();
    await colorModeToggle.press('Space');
    assert.equal(await colorModeToggle.isChecked(), true);
    assert.equal(await colorModeToggle.evaluate((node) => node === document.activeElement), true);
    assert.deepEqual([(await settingsIn(page)).background, (await settingsIn(page)).colorMode], ['dark', 'dark']);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('muxui-scale:preferences:v1')).background), 'dark');
    await ready(page, page.url());
    assert.equal(await colorModeToggle.isChecked(), true, 'reload preserves the current Scale mode');
    assert.equal(await page.locator('.scale-app').getAttribute('data-preview-background'), 'dark');
    assert.equal(await page.locator('.scale-app').getAttribute('data-muxui-color-scheme'), 'dark');
    assert.equal(await page.locator('.scale-header').evaluate((node) => getComputedStyle(node).backgroundColor), 'rgb(0, 0, 0)');
    const fixedChrome = await page.locator('.scale-header').evaluate((node) => [getComputedStyle(node).fontFamily, getComputedStyle(node).getPropertyValue('--muxui-semantic-control-radius')]);
    await page.getByRole('button', { name: 'Standard themes', exact: true }).click();
    assert.deepEqual(await page.locator('.scale-preset-popup').evaluate((node) => [getComputedStyle(node).fontFamily, getComputedStyle(node).getPropertyValue('--muxui-semantic-control-radius')]), fixedChrome);
    await page.keyboard.press('Escape');
    await page.locator('.muxui-select__trigger').click();
    await page.locator('.muxui-select__popup').waitFor();
    assert.equal(await page.locator('.muxui-select__popup').evaluate((node) => getComputedStyle(node).getPropertyValue('--muxui-semantic-color-neutral-5').trim()), await page.locator('.scale-app').evaluate((node) => getComputedStyle(node).getPropertyValue('--muxui-semantic-color-neutral-5').trim()));
    await page.keyboard.press('Escape');
    const screenshotDir = process.env.MUXUI_SCALE_SCREENSHOT_DIR;
    if (screenshotDir) {
      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: join(screenshotDir, 'scale-dark.png') });
      await editor(page, 'Typography');
      await page.locator('.typography-editor').screenshot({ path: join(screenshotDir, 'matrix-dark.png') });
    }

    const document = createScaleDocument({ ...DEFAULT_SETTINGS, namedColor: '#663399' }, { slug: 'browser-theme' });
    document.modes = { colorScheme: ['dark'], contrast: ['more'], motion: ['reduced'], density: ['compact'], direction: ['rtl'] };
    document.overrides['component.button.min-height'] = { type: 'dimension', unit: 'px', value: 48 };
    document.overrides['semantic.typography.text-font-weight'] = { type: 'number', unit: 'unitless', value: 450 };
    document.overrides['semantic.typography.heading-line-height'] = { type: 'number', unit: 'unitless', value: 1.25 };
    document.overrides['semantic.typography.heading-letter-spacing'] = { type: 'string', unit: 'string', value: '0.01em' };
    const serialized = JSON.stringify(document);
    await openExport(page);
    await page.locator('input[type=file]').setInputFiles({ name: 'browser-theme.json', mimeType: 'application/json', buffer: Buffer.from(serialized) });
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Imported and validated'));
    assert.equal(await page.getByRole('textbox', { name: 'Theme slug', exact: true }).inputValue(), 'browser-theme');
    const importedSettings = await settingsIn(page);
    const explicitContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    const explicitPage = await explicitContext.newPage();
    await ready(explicitPage, `${url}/#${encodeURIComponent(JSON.stringify(importedSettings))}`);
    assert.equal(await explicitPage.locator('.scale-app').getAttribute('data-muxui-motion'), 'reduced');
    await assertMotionOff(explicitPage);
    await editor(explicitPage, 'Typography');
    await assertMotionOff(explicitPage);
    await explicitContext.close();
    await page.locator('input[type=file]').setInputFiles({ name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.alloc(256 * 1024 + 1) });
    await page.getByRole('status').filter({ hasText: '256 KiB' }).waitFor();
    assert.deepEqual(await settingsIn(page), importedSettings);
    await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...document, unknown: true })) });
    await page.getByRole('status').filter({ hasText: 'Import rejected' }).waitFor();
    assert.deepEqual(await settingsIn(page), importedSettings);
    // FileTrigger resets its picker before each press, so the same file can be imported again.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.getByRole('button', { name: 'Copy CSS', exact: true }).click();
      const fileChooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
      await (await fileChooser).setFiles({ name: 'browser-theme.json', mimeType: 'application/json', buffer: Buffer.from(serialized) });
      await page.getByRole('status').filter({ hasText: 'Imported and validated' }).waitFor();
    }
    assert.deepEqual(await page.getByRole('dialog', { name: 'Export theme', exact: true }).evaluate((node) => [getComputedStyle(node).fontFamily, getComputedStyle(node).getPropertyValue('--muxui-semantic-control-radius')]), fixedChrome, 'authoring overrides do not change shell dialog type or radius');
    await closeExport(page);
    assert.equal(await colorModeToggle.isDisabled(), true);
    assert.equal(await colorModeToggle.isChecked(), true, 'a dark-only theme stays dark');
    await editor(page, 'Typography');
    assert.equal(await bodyWeight.inputValue(), '450');
    assert.equal(await page.locator('.typography-matrix-row[data-role="expressive"] .typography-linked-value').first().textContent(), '450');
    assert.equal(await page.getByRole('spinbutton', { name: 'heading leading', exact: true }).inputValue(), '1.25');
    assert.equal(await page.getByRole('textbox', { name: 'heading tracking', exact: true }).inputValue(), '0.01em');
    await openExport(page);
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
    await page.getByRole('button', { name: 'Share URL', exact: true }).click();
    assert.deepEqual(JSON.parse(decodeURIComponent(new URL(await page.evaluate(() => navigator.clipboard.readText())).hash.slice(1))), await settingsIn(page));

    const second = await context.newPage();
    await ready(second, url);
    await openExport(second);
    await second.getByRole('textbox', { name: 'Theme slug', exact: true }).fill('browser-theme');
    await second.getByRole('button', { name: 'Load', exact: true }).click();
    await second.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Loaded browser-theme.');
    await closeExport(second);
    await editor(second, 'Typography');
    await second.getByRole('button', { name: 'Individual role metrics', exact: true }).click();
    assert.equal(await second.getByRole('spinbutton', { name: 'body weight', exact: true }).inputValue(), '450');
    assert.equal(await second.locator('.typography-matrix-row[data-role="expressive"] .typography-linked-value').first().textContent(), '450');
    await choosePreset(second, 'Lagoon');
    await openExport(second);
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
    await page.getByRole('status').filter({ hasText: 'Draft reset.' }).waitFor();
    await page.getByLabel('Preview canvas', { exact: true }).selectOption('accent');
    await closeExport(page);
    assert.equal(await colorModeToggle.isChecked(), true, 'accent uses the dark color mode');
    await colorModeToggle.focus();
    await colorModeToggle.press('Space');
    assert.deepEqual([(await settingsIn(page)).background, (await settingsIn(page)).colorMode], ['light', 'light']);
    await colorModeToggle.press('Space');
    assert.equal((await settingsIn(page)).background, 'dark');
    await colorModeToggle.press('Space');
    assert.equal(await colorModeToggle.isChecked(), false);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (screenshotDir) {
      await page.screenshot({ path: join(screenshotDir, 'scale-light.png') });
      await editor(page, 'Typography');
      await page.locator('.typography-editor').screenshot({ path: join(screenshotDir, 'matrix-light.png') });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await openExport(page);
    const exportBounds = await page.getByRole('dialog', { name: 'Export theme', exact: true }).boundingBox();
    assert.ok(exportBounds.x >= 0 && exportBounds.y >= 0 && exportBounds.x + exportBounds.width <= 390 && exportBounds.y + exportBounds.height <= 844, 'mobile export stays inside the viewport');
    for (const name of ['Copy CSS', 'Export JSON', 'Import JSON', 'Save', 'Load', 'Share URL', 'Reset to defaults']) {
      const action = page.getByRole('button', { name, exact: true });
      await action.scrollIntoViewIfNeeded();
      await action.focus();
      const bounds = await action.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844, `${name} remains reachable in mobile export`);
      assert.equal(await action.evaluate((node) => node === document.activeElement), true);
    }
    await closeExport(page);
    if (screenshotDir) {
      await page.screenshot({ path: join(screenshotDir, 'scale-narrow.png'), fullPage: false });
      await editor(page, 'Typography');
      await page.locator('.typography-editor').screenshot({ path: join(screenshotDir, 'matrix-narrow.png') });
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

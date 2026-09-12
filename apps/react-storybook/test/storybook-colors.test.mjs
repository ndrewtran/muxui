import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { compilePureTokenGraph } from '@muxui/tokens/core';
import defaultTheme from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { collectStorybookPaints } from './helpers/color-audit.mjs';
import { backgroundOptions, buildTheme, managerThemeCss, previewThemeCss } from '../.storybook/theme.mjs';
import { projectMeasurePalette } from '../.storybook/measure-palette.mjs';

const appRoot = resolve(import.meta.dirname, '..');
const graphs = Object.fromEntries(['light', 'dark'].map((colorScheme) => [
  colorScheme, compilePureTokenGraph(defaultTheme, { modes: { colorScheme } }).tokens,
]));

async function browserPath() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN, process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Chrome or Chromium is required for the Storybook colour audit');
}

async function startStorybook() {
  if (process.env.MUXUI_STORYBOOK_COLORS_URL) return { url: process.env.MUXUI_STORYBOOK_COLORS_URL, stop() {} };
  const reservation = createServer();
  await new Promise((done) => reservation.listen(0, '127.0.0.1', done));
  const { port } = reservation.address();
  await new Promise((done) => reservation.close(done));
  const child = spawn('pnpm', ['exec', 'storybook', 'dev', '--ci', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' },
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  const stop = () => child.kill('SIGTERM');
  const url = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Storybook exited: ${output}`);
      try { if ((await fetch(`${url}/index.json`)).ok) return { url, stop }; } catch { /* Wait for startup. */ }
      await delay(250);
    }
    throw new Error(`Storybook did not start: ${output}`);
  } catch (error) { stop(); throw error; }
}

function colourAuditArtifactDirectory() {
  return process.env.MUXUI_STORYBOOK_COLORS_ARTIFACT_DIR ?? process.env.RUNNER_TEMP ?? tmpdir();
}

async function captureToolState(page, previewFrame, { label, stylePrefix, expected, stage }) {
  const directory = colourAuditArtifactDirectory();
  await mkdir(directory, { recursive: true });
  const stem = `storybook-colours-${process.pid}-${Date.now()}`;
  const state = {
    stage,
    label,
    stylePrefix,
    expected,
    manager: await page.evaluate(() => ({
      url: location.href,
      switches: [...document.querySelectorAll('[role="switch"]')].map((element) => ({
        label: element.getAttribute('aria-label'),
        checked: element.getAttribute('aria-checked'),
      })),
    })).catch((error) => ({ error: String(error) })),
    preview: await previewFrame.locator('body').evaluate((_, prefix) => ({
      url: location.href,
      styles: [...document.querySelectorAll(`style[id^="${prefix}"]`)].map((element) => element.id),
    }), stylePrefix).catch((error) => ({ error: String(error) })),
  };
  const statePath = resolve(directory, `${stem}.json`);
  const screenshotPath = resolve(directory, `${stem}.png`);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  return { statePath, screenshotPath, state };
}

async function waitForToolStyle(page, previewFrame, tool, { label, stylePrefix, enabled, stage }) {
  const expected = String(enabled);
  try {
    await page.waitForFunction(({ label: expectedLabel, expectedState }) => [...document.querySelectorAll('[role="switch"]')]
      .some((element) => element.getAttribute('aria-label') === expectedLabel
        && element.getAttribute('aria-checked') === expectedState), { label, expectedState: expected });
    await previewFrame.locator(`style[id^="${stylePrefix}"]`).first().waitFor({ state: enabled ? 'attached' : 'detached' });
  } catch (error) {
    const diagnostics = await captureToolState(page, previewFrame, { label, stylePrefix, expected, stage });
    throw new Error(`${stage}: Storybook did not reach ${label}=${expected}; diagnostics: ${diagnostics.statePath}, ${diagnostics.screenshotPath}`, { cause: error });
  }
  assert.equal(await tool.getAttribute('aria-checked'), expected, `${stage}: ${label} state`);
}

async function ensureToolState(page, previewFrame, tool, { label, stylePrefix, enabled, stage }) {
  const current = await tool.getAttribute('aria-checked');
  assert.ok(current === 'true' || current === 'false', `${stage}: ${label} must expose aria-checked`);
  if (current !== String(enabled)) await tool.click();
  await waitForToolStyle(page, previewFrame, tool, { label, stylePrefix, enabled, stage });
}

async function exactPreviewFrame(page) {
  const iframe = page.locator('#storybook-preview-iframe');
  await iframe.waitFor();
  const handle = await iframe.elementHandle();
  assert.ok(handle, 'Storybook preview iframe element must exist');
  const frame = await handle.contentFrame();
  assert.ok(frame, 'Storybook preview iframe content must exist');
  return frame;
}

test('Storybook colour audit detects solid, alpha, shadow, gradient, SVG and pseudo-element leaks', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage();
    const foreground = graphs.light['semantic.content.strong'].value;
    await page.setContent(`<style>
      body { color:${foreground}; background:${graphs.light['semantic.surface.canvas'].value} }
      div { width:80px; height:25px }
      #pseudo::before { content:""; display:block; width:8px; height:8px; background:rgb(1,2,3) }
      #marker::marker { color:rgb(2,3,4) }
      #selection::selection { background:rgb(2,3,4); color:rgb(1,2,3) }
    </style>
    <div id="solid" style="color:rgb(1,2,3)">solid</div>
    <div id="alpha" style="color:rgb(from ${foreground} r g b / .123)">alpha</div>
    <div id="shadow" style="box-shadow:0 0 2px rgb(1,2,3)">shadow</div>
    <div id="text-shadow" style="text-shadow:0 1px 2px rgb(1,2,3)">text</div>
    <div id="filter" style="filter:drop-shadow(0 0 2px rgb(1,2,3))">filter</div>
    <div id="gradient" style="background:linear-gradient(rgb(1,2,3),${foreground})"></div>
    <div id="border" style="border:1px solid rgb(1,2,3)"></div>
    <div id="outline" style="outline:1px solid rgb(1,2,3)"></div>
    <div id="pseudo"></div><svg width="10" height="10"><rect id="svg" width="10" height="10" fill="rgb(1,2,3)"/></svg>
    <svg width="10" height="10"><defs><symbol id="shape"><rect width="10" height="10"/></symbol></defs>
      <use id="svg-use" href="#shape" fill="rgb(1,2,3)"/></svg>
    <svg width="10" height="10"><defs><linearGradient id="paint"><stop stop-color="rgb(1,2,3)"/>
      <stop offset="1" stop-color="${foreground}" stop-opacity=".123"/></linearGradient></defs>
      <rect id="svg-gradient" width="10" height="10" fill="url(#paint)"/></svg>
    <ul><li id="marker">marker</li></ul><div id="selection">selection</div>
    <div id="scrollbar" style="height:20px;overflow:scroll;scrollbar-color:rgb(3,4,5) ${foreground}"><div style="height:80px"></div></div>
    <svg width="50" height="50"><defs><text id="text-shape" y="20" fill="rgb(3,4,5)">Hi</text>
      <rect id="hidden-fill" width="10" height="10" fill="rgb(1,2,3)" fill-opacity="0"/>
      <rect id="hidden-stroke" width="10" height="10" fill="none" stroke="rgb(1,2,3)" stroke-width="0"/>
      </defs><use id="svg-text-use" href="#text-shape"/><use id="no-paint-fill" href="#hidden-fill"/>
      <use id="no-paint-stroke" href="#hidden-stroke"/></svg><canvas id="canvas" width="10" height="10"></canvas>
      <img width="10" height="10" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='red'/%3E%3C/svg%3E">`);
    await page.locator('#selection').evaluate((element) => {
      const range = document.createRange(); range.selectNodeContents(element);
      document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
    });
    const canvasPaints = await page.locator('#canvas').evaluate((element) => {
      const context = element.getContext('2d');
      context.fillStyle = 'rgb(1,2,3)'; context.fillRect(0, 0, 10, 10);
      return [{ id: element.id, property: 'fillStyle', value: context.fillStyle, alpha: context.globalAlpha, composite: context.globalCompositeOperation }];
    });
    const report = await page.evaluate(collectStorybookPaints, { tokens: graphs.light, canvasPaints });
    assert.deepEqual(report.problems, []);
    assert.ok(report.media.some((source) => source.startsWith('img: data:image/svg+xml,')), 'Image paint cannot be silently excluded');
    for (const id of ['solid', 'alpha', 'shadow', 'text-shadow', 'filter', 'gradient', 'border', 'outline', 'pseudo', 'svg', 'svg-use', 'svg-gradient', 'svg-text-use', 'marker', 'selection', 'scrollbar', 'canvas']) {
      assert.ok(report.nonToken.some((paint) => paint.examples.some((example) => example.includes(`#${id}`))), `audit missed ${id}`);
    }
    assert.ok(report.nonToken.some((paint) => paint.rgba.endsWith(',0.123')), 'alpha must remain part of colour identity');
    assert.ok(!report.nonToken.some((paint) => paint.examples.some((example) => example.includes('#no-paint-'))), 'Unpainted SVG fill/stroke must remain unpainted');
  } finally { await browser.close(); }
});

test('Storybook colour declarations reference Mux tokens, including values that happen to match the palette', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage();
    const css = [managerThemeCss(), previewThemeCss(), await readFile(resolve(appRoot, '.storybook/preview.css'), 'utf8')];
    const known = [...new Set(Object.values(graphs).flatMap((graph) => Object.values(graph)
      .filter((token) => token.type === 'color').map((token) => token.value)))];
    const otherValues = Object.values(graphs).flatMap((graph) => Object.values(graph)
      .filter((token) => token.type !== 'color').map((token) => String(token.value)));
    const variables = [...new Set(Object.values(graphs).flatMap((graph) => Object.values(graph)
      .filter((token) => token.type === 'color').map(({ id }) => `--muxui-${id.replaceAll('.', '-')}`)))];
    const result = await page.evaluate(({ css, known, otherValues, variables }) => {
      const declared = new Set(variables);
      const errors = [];
      const sheets = css.map((text) => { const sheet = new CSSStyleSheet(); sheet.replaceSync(text); return sheet; });
      const rules = sheets.flatMap((sheet) => [...sheet.cssRules]).filter((rule) => rule.style);
      for (const rule of rules) for (const property of rule.style) if (property.startsWith('--muxui-')) {
        const value = rule.style.getPropertyValue(property).trim();
        if (known.includes(value)) declared.add(property);
        else if (!otherValues.includes(value)) errors.push(`Unowned variable: ${property}`);
      }
      function audit(property, value) {
        if (!/^(?:color|(?:background|border|outline)(?:-(?:color|image|top|right|bottom|left|top-color|right-color|bottom-color|left-color))?|(?:box|text)-shadow|(?:-webkit-)?text-(?:fill|stroke|decoration)-color|fill|stroke|caret-color|accent-color|scrollbar-color|stop-color|flood-color|lighting-color|filter|backdrop-filter)$/u.test(property)) return [];
        const issues = [];
        // CSSOM expands a transparent background shorthand to an initial image (none).
        if (property === 'background-image' && value === 'initial') return issues;
        const neutral = new Set(['none', 'transparent', 'currentcolor', 'inherit', 'auto']);
        const rest = value.replace(/var\((--[\w-]+)\)/gu, (_, name) => {
          if (!declared.has(name)) issues.push(`Unknown token ${name}`);
          return '';
        });
        if (/#(?:[a-f\d]{3,8})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/iu.test(rest)) issues.push('Literal or generated colour');
        for (const word of rest.match(/[a-z-]+/giu) ?? []) {
          if (CSS.supports('color', word) && !neutral.has(word.toLowerCase())) issues.push(`Literal colour ${word}`);
        }
        return issues;
      }
      for (const rule of rules) for (const property of rule.style) {
        for (const issue of audit(property, rule.style.getPropertyValue(property))) errors.push(`${rule.selectorText} ${property}: ${issue}`);
      }
      return { errors, declarations: rules.reduce((sum, rule) => sum + rule.style.length, 0),
        literalNegativeControl: audit('color', known[0]) };
    }, { css, known, otherValues, variables });
    assert.ok(result.declarations > 0);
    assert.deepEqual(result.errors, []);
    assert.ok(result.literalNegativeControl.length, 'A literal matching a token must still fail provenance');
    for (const [scheme, option] of Object.entries(backgroundOptions())) {
      assert.equal(option.value, graphs[scheme]['semantic.surface.canvas'].value);
    }
    for (const scheme of ['light', 'dark']) {
      const theme = buildTheme(scheme);
      for (const [field, value] of Object.entries(theme)) {
        if (/(?:color|bg)$/iu.test(field)) assert.ok(known.includes(value), `${scheme}: ${field} must resolve from the canonical graph`);
      }
    }
  } finally { await browser.close(); }
});

test('Storybook canvas palette adapter rejects upstream drift and removes generated alpha', async () => {
  const source = await readFile(new URL(import.meta.resolve('storybook/internal/preview/runtime')), 'utf8');
  const projected = projectMeasurePalette(source);
  assert.ok(!projected.includes('`${colors[type5]}dd`'));
  assert.throws(() => projectMeasurePalette(source.replace('#f6b26b', '#123456')), /palette changed/u);
  assert.throws(() => projectMeasurePalette(source.replaceAll('`${colors[type5]}dd`', 'colors[type5]')), /label alpha changed/u);
});

test('Storybook manager and docs paint only canonical Mux colours in light and dark', { timeout: 420000 }, async (t) => {
  const server = await startStorybook();
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  const report = { storybookVersion: '10.5.10', tokenSource: 'catalog/tokens/default-theme.json', states: [] };
  const reportPath = process.env.MUXUI_STORYBOOK_COLORS_REPORT
    ?? resolve(colourAuditArtifactDirectory(), `muxui-storybook-colors-${process.pid}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      globalThis.__muxuiCanvasPaints = [];
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.id === 'storybook-addon-measure') globalThis.__muxuiCanvasPaints = [];
        return Reflect.apply(clear, this, args);
      };
      for (const [method, property] of [['fill', 'fillStyle'], ['fillRect', 'fillStyle'], ['fillText', 'fillStyle'], ['stroke', 'strokeStyle']]) {
        const original = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          if (this.canvas.id === 'storybook-addon-measure') globalThis.__muxuiCanvasPaints.push({
            id: this.canvas.id, property, value: this[property], alpha: this.globalAlpha, composite: this.globalCompositeOperation,
          });
          return Reflect.apply(original, this, args);
        };
      }
    });
    page.setDefaultTimeout(15000);
    async function snapshot(scheme, state, target = page, scope = 'manager', additionalTokens = {}) {
      const canvasPaints = await target.evaluate(() => globalThis.__muxuiCanvasPaints ?? []);
      const result = await target.evaluate(collectStorybookPaints, { tokens: { ...graphs[scheme], ...additionalTokens }, scope, canvasPaints });
      assert.ok(result.elements > 0 && result.paintOccurrences > 0, `${scheme}/${state}: empty audit`);
      assert.deepEqual(result.media, [], `${scheme}/${state}: image colours require explicit verification`);
      if (result.nonToken.some((paint) => paint.property === 'fill')) result.svgSources = await target.evaluate(() =>
        [...document.querySelectorAll('[role=option] use')].map((element) => ({
          html: element.outerHTML, color: getComputedStyle(element).color, fill: getComputedStyle(element).fill,
          transition: getComputedStyle(element).transition,
          parent: element.parentElement.outerHTML,
          target: document.querySelector(element.getAttribute('href') ?? element.getAttribute('xlink:href'))?.outerHTML,
        })));
      report.states.push({ scheme, state, scope, ...result });
    }
    async function openStory(scheme, story = 'muxui-react-r1-1-button--default') {
      await page.goto(`${server.url}/?path=/story/${story}&globals=colorScheme:${scheme}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#storybook-sidebar-region').waitFor();
      await page.frameLocator('#storybook-preview-iframe').locator('.muxui-storybook-surface').waitFor();
    }
    async function hoverAndFocus(scheme, label, locator) {
      await locator.hover();
      await snapshot(scheme, `${label}/hover`);
      await page.keyboard.press('Tab');
      await locator.focus();
      assert.equal(await locator.evaluate((element) => document.activeElement === element), true, `${label}: focus target`);
      await snapshot(scheme, `${label}/focus`);
    }
    async function tokenPaint(scheme, locator, property, tokenId) {
      const result = await locator.evaluate(async (element, { property, value }) => {
        const probe = document.createElement('span');
        probe.style.setProperty('color', value, 'important'); document.body.append(probe);
        const expected = getComputedStyle(probe).color; probe.remove();
        const deadline = performance.now() + 2000;
        while (getComputedStyle(element)[property] !== expected && performance.now() < deadline) {
          await new Promise(requestAnimationFrame);
        }
        return { actual: getComputedStyle(element)[property], expected };
      }, { property, value: graphs[scheme][tokenId].value });
      assert.equal(result.actual, result.expected, `${scheme}: ${property} must use ${tokenId}`);
    }
    for (const scheme of ['light', 'dark']) {
      for (const viewMode of ['story', 'docs']) {
        const loading = await browser.newPage();
        let releaseImport;
        const heldImport = new Promise((done) => { releaseImport = done; });
        await loading.route(/r1-1-button\.stories\.mjs/u, async (route) => {
          await heldImport; await route.continue();
        });
        try {
          const id = `muxui-react-r1-1-button--${viewMode === 'story' ? 'default' : 'docs'}`;
          await loading.goto(`${server.url}/iframe.html?id=${id}&viewMode=${viewMode}&globals=colorScheme:${scheme}`, { waitUntil: 'domcontentloaded' });
          await loading.locator(`.sb-preparing-${viewMode} .sb-loader`).waitFor();
          await snapshot(scheme, `loading/${viewMode}`, loading, 'docs');
        } finally { releaseImport(); await loading.close(); }
      }
      for (const kind of ['no-preview', 'render-error']) {
        const system = await browser.newPage();
        if (kind === 'render-error') await system.route(/r1-1-button\.stories\.mjs/u, async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, body: `${await response.text()}\nthrow new Error('Colour audit fixture');\n` });
        });
        try {
          const id = kind === 'render-error' ? '&id=muxui-react-r1-1-button--default' : '';
          await system.goto(`${server.url}/iframe.html?viewMode=story&globals=colorScheme:${scheme}${id}`, { waitUntil: 'domcontentloaded' });
          await system.locator(kind === 'render-error' ? '.sb-errordisplay' : '.sb-nopreview').waitFor();
          await snapshot(scheme, `system/${kind}`, system, 'docs');
          if (kind === 'render-error') {
            await system.locator('.sb-errordisplay a').first().hover();
            await snapshot(scheme, 'system/render-error/link-hover', system, 'docs');
          }
        } finally { await system.close(); }
      }
      await openStory(scheme);
      assert.equal(await page.locator('#muxui-storybook-theme').textContent(), managerThemeCss(), 'Audit server must serve the current manager projection');
      await snapshot(scheme, 'manager/default');
      await page.locator('#storybook-sidebar-region').getByText('Mux UI', { exact: true }).first().evaluate((element) => {
        const range = document.createRange(); range.selectNodeContents(element);
        document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
      });
      await snapshot(scheme, 'manager/text-selection');
      await page.evaluate(() => document.getSelection().removeAllRanges());
      const row = page.locator('.sidebar-item[data-item-id="mux-ui-react-calendar"]');
      const trigger = row.locator('[data-testid="context-menu"]');
      await row.hover();
      await trigger.hover();
      await page.getByRole('tooltip', { name: 'Open context menu' }).waitFor();
      await snapshot(scheme, 'context-trigger/tooltip');
      await hoverAndFocus(scheme, 'context-trigger', trigger);
      await tokenPaint(scheme, trigger, 'backgroundColor', 'semantic.surface.hover');
      await tokenPaint(scheme, trigger, 'outlineColor', 'semantic.focus.ring');
      await trigger.hover();
      await page.mouse.down();
      await snapshot(scheme, 'context-trigger/pressed');
      await page.mouse.up();
      const contextMenu = page.locator('.react-aria-Popover[role="dialog"]').last();
      await contextMenu.waitFor();
      await snapshot(scheme, 'context-menu/open');
      await hoverAndFocus(scheme, 'context-menu/item', contextMenu.locator('.sb-list button').first());
      await page.keyboard.press('Escape');
      const selectedTrigger = page.locator('.sidebar-item[data-selected="true"] [data-testid="context-menu"]').first();
      await selectedTrigger.locator('..').hover();
      await hoverAndFocus(scheme, 'context-trigger/selected', selectedTrigger);
      await tokenPaint(scheme, selectedTrigger, 'backgroundColor', 'semantic.action.background');

      // Counterfactual: removing our projection must expose the real generated cyan.
      await row.hover();
      await trigger.hover();
      const counterfactual = await page.evaluate(({ tokens }) => {
        const style = document.getElementById('muxui-storybook-theme');
        if (!style) throw new Error('Manager token projection is missing');
        const text = style.textContent;
        style.textContent = '';
        const button = document.querySelector('.sidebar-item[data-item-id="mux-ui-react-calendar"] [data-testid="context-menu"]');
        const value = getComputedStyle(button).backgroundColor;
        style.textContent = text;
        const probe = document.createElement('span'); document.body.append(probe);
        const canonical = Object.values(tokens).filter((token) => token.type === 'color').map((token) => {
          probe.style.setProperty('color', token.value, 'important'); return getComputedStyle(probe).color;
        });
        probe.remove();
        return { value, canonical: canonical.includes(value) };
      }, { tokens: graphs[scheme] });
      assert.equal(counterfactual.canonical, false, `${scheme}: the old generated trigger colour must fail`);
      report.states.push({ scheme, state: 'context-trigger/negative-control', rejectedValue: counterfactual.value });

      const search = page.locator('#storybook-explorer-searchfield');
      await hoverAndFocus(scheme, 'search', search);
      await search.fill('Button');
      await page.locator('[role="option"]').first().waitFor();
      await snapshot(scheme, 'search/results');
      await page.locator('[role="option"]').first().hover();
      await snapshot(scheme, 'search/result/hover');
      await search.focus(); await search.press('ArrowDown');
      const activeOption = await search.getAttribute('aria-activedescendant');
      assert.ok(activeOption, 'Search must expose its keyboard-active result');
      assert.equal(await page.locator(`[id="${activeOption}"]`).getAttribute('aria-selected'), 'true');
      await snapshot(scheme, 'search/result/keyboard-active');
      await page.keyboard.press('Escape');
      await openStory(scheme);

      for (const label of ['Reload story', 'Grid visibility', 'Measure tool', 'Outline tool', 'Open in isolation mode', 'Enter full screen', 'Open in editor']) {
        await hoverAndFocus(scheme, `toolbar/${label}`, page.locator(`[aria-label="${label}"]`).first());
      }
      const diagnostics = await exactPreviewFrame(page);
      for (const [label, styleId] of [['Grid visibility', 'addon-backgrounds-grid'], ['Outline tool', 'addon-outline']]) {
        const tool = page.getByRole('switch', { name: label, exact: true });
        await tool.click();
        await diagnostics.locator(`#${styleId}`).waitFor({ state: 'attached' });
        await snapshot(scheme, `preview/${label}/active`, diagnostics);
        await tool.click();
        await diagnostics.locator(`#${styleId}`).waitFor({ state: 'detached' });
      }
      const measured = diagnostics.locator('.muxui-storybook-surface button').first();
      const originalGeometry = await measured.getAttribute('style');
      await measured.evaluate((element) => Object.assign(element.style, { margin: '20px', borderWidth: '4px', padding: '18px', width: '150px', height: '70px' }));
      await page.getByRole('switch', { name: 'Measure tool', exact: true }).click();
      await diagnostics.locator('#storybook-addon-measure').waitFor();
      await measured.hover();
      await diagnostics.waitForFunction(() => new Set(globalThis.__muxuiCanvasPaints.map((paint) => paint.value)).size >= 5);
      await snapshot(scheme, 'preview/Measure tool/active', diagnostics, 'docs');
      const alternate = scheme === 'light' ? 'dark' : 'light';
      for (const nextScheme of [alternate, scheme]) {
        await diagnostics.evaluate(() => { globalThis.__muxuiCanvasPaints = []; });
        await page.locator('[aria-label^="Choose the Mux UI light or dark theme."]').click();
        await page.getByRole('option', { name: nextScheme === 'light' ? 'Light' : 'Dark', exact: true }).click();
        await diagnostics.locator(`html[data-muxui-color-scheme="${nextScheme}"]`).waitFor({ state: 'attached' });
        await diagnostics.waitForFunction((text) => globalThis.__muxuiCanvasPaints.some((paint) => paint.value === text), graphs[nextScheme]['semantic.content.strong'].value);
        await snapshot(nextScheme, 'preview/Measure tool/scheme-change', diagnostics, 'docs');
      }
      assert.equal(await page.getByRole('switch', { name: 'Measure tool', exact: true }).getAttribute('aria-checked'), 'true');
      await page.getByRole('switch', { name: 'Measure tool', exact: true }).click();
      await diagnostics.locator('#storybook-addon-measure').waitFor({ state: 'detached' });
      await measured.evaluate((element, style) => style === null ? element.removeAttribute('style') : element.setAttribute('style', style), originalGeometry);
      for (const selected of ['light', 'dark']) {
        await page.locator('button[aria-label^="Preview background"]').click();
        await page.getByRole('option', { name: selected === 'light' ? 'Light' : 'Dark', exact: true }).click();
        await diagnostics.locator('#addon-backgrounds-color').waitFor({ state: 'attached' });
        await tokenPaint(selected, diagnostics.locator('body'), 'backgroundColor', 'semantic.surface.canvas');
        // The explicit background belongs to its selected scheme, independently
        // of the surrounding UI's scheme. Verify its provenance above.
        await snapshot(scheme, `preview/background-${selected}`, diagnostics, 'docs', { selectedBackground: graphs[selected]['semantic.surface.canvas'] });
      }
      await page.locator('button[aria-label^="Preview background"]').click();
      await page.getByRole('option', { name: 'Reset background', exact: true }).click();
      await diagnostics.locator('#addon-backgrounds-color').waitFor({ state: 'detached' });
      for (const label of ['Preview background', 'Viewport size', 'Vision filter',
        `Choose the Mux UI light or dark theme. ${scheme === 'light' ? 'Light' : 'Dark'}`,
        'Choose the document writing direction. LTR', 'Change zoom level', 'Tag filters', 'Settings']) {
        if (label === 'Tag filters') await search.focus();
        const control = page.locator(`[aria-label="${label}"]`).first();
        await hoverAndFocus(scheme, `menu-trigger/${label}`, control);
        await control.click();
        const popup = page.locator('[role="dialog"]:visible,[role="listbox"]:visible,[role="menu"]:visible').last();
        await popup.waitFor();
        await snapshot(scheme, `menu/${label}`);
        // React Aria's screen-reader-only dismiss sentinels are not pointer targets.
        const items = popup.locator('button:visible:not([aria-label="Dismiss"]),[role="option"]:visible,[role="menuitem"]:visible,a:visible');
        assert.ok(await items.count(), `${label}: popup must contain controls`);
        for (let index = 0; index < await items.count(); index += 1) {
          await items.nth(index).hover();
          await snapshot(scheme, `menu/${label}/item-${index}`);
        }
        await page.keyboard.press('Escape');
        // Some mouse-opened toolbar popovers close on outside pointer dismissal.
        if (await popup.isVisible()) await page.mouse.click(1400, 950);
        await popup.waitFor({ state: 'hidden' });
      }
      await page.locator('[aria-label="Settings"]').click();
      await page.getByText('About your Storybook', { exact: true }).click();
      await page.getByText('You are on Storybook 10.5.10', { exact: true }).waitFor();
      await snapshot(scheme, 'settings/about');
      await page.getByRole('tab', { name: 'Guide', exact: true }).click();
      await page.waitForURL(/settings\/guide/u);
      await snapshot(scheme, 'settings/onboarding');
      await page.getByRole('tab', { name: 'Keyboard shortcuts', exact: true }).click();
      await page.waitForURL(/settings\/shortcuts/u);
      await snapshot(scheme, 'settings/shortcuts');
      await openStory(scheme);
      await page.getByRole('tab', { name: /^Controls/u }).click();

      const controls = page.locator('#storybook-panel-region input,#storybook-panel-region select,#storybook-panel-region textarea');
      assert.ok(await controls.count(), 'Controls panel must expose actual controls');
      for (let index = 0; index < await controls.count(); index += 1) {
        const control = controls.nth(index);
        if (await control.getAttribute('role') === 'switch') {
          await control.locator('..').hover();
          await snapshot(scheme, `controls/${index}/hover`);
          await page.keyboard.press('Tab'); await control.focus();
          await snapshot(scheme, `controls/${index}/focus`);
          for (const checked of [true, false]) {
            if (await control.isChecked() !== checked) await control.press('Space');
            assert.equal(await control.isChecked(), checked);
            await snapshot(scheme, `controls/${index}/${checked ? 'checked' : 'unchecked'}`);
          }
        } else await hoverAndFocus(scheme, `controls/${index}`, control);
      }
      await openStory(scheme, 'muxui-react-r1-2-number-field--default');
      await page.getByRole('tab', { name: /^Controls/u }).click();
      await snapshot(scheme, 'controls/optional/default');
      await hoverAndFocus(scheme, 'controls/number', page.locator('#control-step'));
      const setString = page.getByRole('button', { name: 'Set string', exact: true }).first();
      await hoverAndFocus(scheme, 'controls/set-string', setString);
      await setString.click();
      await page.locator('#control-label').fill('Number');
      await hoverAndFocus(scheme, 'controls/text', page.locator('#control-label'));
      const setObject = page.getByRole('button', { name: 'Set object', exact: true });
      await hoverAndFocus(scheme, 'controls/set-object', setObject);
      await setObject.click();
      const jsonEditor = page.locator('#control-formatOptions');
      await hoverAndFocus(scheme, 'controls/object/editor', jsonEditor);
      await jsonEditor.fill('{');
      await page.keyboard.press('Tab');
      assert.equal(await jsonEditor.getAttribute('aria-invalid'), 'true');
      await tokenPaint(scheme, jsonEditor, 'borderTopColor', 'semantic.action.danger-background');
      await snapshot(scheme, 'controls/object/invalid-json');
      await jsonEditor.fill('{"style":"decimal","minimumFractionDigits":2}');
      await page.keyboard.press('Tab');
      assert.equal(await jsonEditor.getAttribute('aria-invalid'), null);
      await page.getByRole('switch', { name: 'Edit formatOptions as JSON', exact: true }).click();
      await snapshot(scheme, 'controls/object/tree');
      const objectTree = page.getByRole('row').filter({ hasText: 'formatOptions' }).locator('.rejt-tree');
      await objectTree.waitFor();
      await objectTree.hover();
      await snapshot(scheme, 'controls/object/tree-hover');
      await openStory(scheme);
      for (const name of ['Actions', 'Interactions', 'Accessibility']) {
        await page.getByRole('tab', { name, exact: true }).click();
        await snapshot(scheme, `addon/${name}`);
      }
      await page.getByRole('tab', { name: 'Actions', exact: true }).click();
      const frame = await exactPreviewFrame(page);
      // Feed the real Actions renderer through its installed channel protocol.
      await frame.evaluate(() => {
        const channel = globalThis.__STORYBOOK_ADDONS_PREVIEW?.getChannel();
        if (!channel) throw new Error('Storybook preview channel is missing');
        channel.emit('storybook/actions/action-event', { id: 'colour-audit', count: 0,
          data: { name: 'Colour audit event', args: { text: 'example', count: 2, enabled: true, empty: null, nested: { value: 'detail' } } },
          options: { depth: 10, maxDepth: 15, clearOnStoryChange: true, limit: 50 } });
      });
      await page.getByText('Colour audit event', { exact: true }).waitFor();
      await snapshot(scheme, 'addon/Actions/data');

      await page.getByRole('tab', { name: 'Interactions', exact: true }).click();
      for (const status of ['done', 'active', 'waiting', 'error']) {
        await frame.evaluate((status) => {
          const channel = globalThis.__STORYBOOK_ADDONS_PREVIEW.getChannel();
          const call = { id: `colour-audit-${status}`, cursor: 1, storyId: 'muxui-react-r1-1-button--default',
            ancestors: [], path: ['expect'], method: 'toBe', args: [`Colour audit ${status}`], interceptable: true, retain: true, status,
            ...(status === 'error' ? { exception: { name: 'AssertionError', message: 'Colour audit comparison', stack: 'Colour audit comparison',
              callId: `colour-audit-${status}`, showDiff: true, actual: 'before', expected: 'after', diff: '- before\n+ after' } } : {}) };
          channel.emit('storybook/instrumenter/call', call);
          channel.emit('storybook/instrumenter/sync', { controlStates: { detached: false, start: true, back: true, goto: true, next: true, end: true },
            logItems: [{ callId: call.id, status, ancestors: [] }] });
        }, status);
        const interaction = page.getByRole('button', { name: /^Go to interaction row/u }).filter({ hasText: `Colour audit ${status}` });
        await interaction.waitFor();
        await snapshot(scheme, `addon/Interactions/${status}`);
        await hoverAndFocus(scheme, `addon/Interactions/${status}`, interaction);
      }

      // Exercise every core status colour through Storybook's actual store.
      const statusStory = 'muxui-react-r1-1-button--states';
      const statusTrigger = page.locator(`[data-item-id="${statusStory}"] [data-testid="context-menu"]`);
      try {
        for (const value of ['unknown', 'pending', 'success', 'new', 'modified', 'affected', 'reviewing', 'warning', 'error']) {
          await page.evaluate(({ storyId, value }) => {
            const typeId = 'muxui/colour-audit';
            globalThis.__STORYBOOK_API__.experimental_getStatusStore(typeId).set([
              { storyId, typeId, value: `status-value:${value}`, title: 'Colour audit', description: 'Test fixture', sidebarContextMenu: true },
            ]);
          }, { storyId: statusStory, value });
          await statusTrigger.locator('..').hover();
          await statusTrigger.hover();
          await snapshot(scheme, `status/${value}`);
        }
        const filters = page.locator('#sidebar-bottom-wrapper button');
        assert.ok(await filters.count(), 'Status fixtures must render the testing widget');
        for (let index = 0; index < await filters.count(); index += 1) {
          await filters.nth(index).hover(); await snapshot(scheme, `status/widget-${index}/hover`);
        }
      } finally {
        await page.evaluate((ids) => globalThis.__STORYBOOK_API__.experimental_getStatusStore('muxui/colour-audit').unset(ids),
          [statusStory, 'muxui-react-r1-1-button--default', 'muxui-react-r1-1-button--controlled']);
      }
      await page.evaluate(() => globalThis.__STORYBOOK_ADDONS_MANAGER.getChannel().emit('channelWSDisconnect', { code: 3008 }));
      await page.getByText('Server timed out', { exact: true }).waitFor();
      await snapshot(scheme, 'notification/open');
      const dismissals = page.getByRole('button', { name: 'Dismiss notification', exact: true });
      for (let index = 0; index < await dismissals.count(); index += 1) await hoverAndFocus(scheme, `notification/dismiss-${index}`, dismissals.nth(index));
      await dismissals.last().click();

      await page.getByRole('tab', { name: /^Accessibility/u }).click();
      await frame.locator('.muxui-storybook-surface button').first().evaluate((element) => { element.id = 'colour-audit-target'; });
      await frame.evaluate(() => {
        const result = { id: 'colour-audit', impact: 'serious', help: 'Colour audit rule', description: 'Palette test fixture',
          helpUrl: 'https://storybook.js.org/docs/writing-tests/accessibility-testing',
          tags: ['wcag2a'], nodes: [{ target: ['#colour-audit-target'], html: '<button id="colour-audit-target">Button</button>',
            failureSummary: 'Colour audit detail', any: [{ id: 'colour-audit', impact: 'serious', message: 'Colour audit detail', relatedNodes: [], data: null }], all: [], none: [] }] };
        globalThis.__STORYBOOK_ADDONS_PREVIEW.getChannel().emit('storybook/a11y/result',
          { violations: [result], passes: [{ ...result, id: 'colour-audit-pass' }], incomplete: [{ ...result, id: 'colour-audit-incomplete' }] },
          'muxui-react-r1-1-button--default');
      });
      for (const [category, id] of [['Violations', 'colour-audit'], ['Passes', 'colour-audit-pass'], ['Inconclusive', 'colour-audit-incomplete']]) {
        await page.getByRole('tab', { name: new RegExp(`^${category}`, 'u') }).click();
        await page.getByRole('button', { name: `Expand details for: ${id}`, exact: true }).waitFor();
        await snapshot(scheme, `addon/Accessibility/${category}`);
        await page.getByRole('button', { name: 'Expand all results', exact: true }).click();
        await snapshot(scheme, `addon/Accessibility/${category}/expanded`);
        await page.getByRole('button', { name: 'Highlight elements with accessibility test results', exact: true }).click();
        await frame.locator('#storybook-highlights-root [data-highlight-dimensions]').first().waitFor();
        await snapshot(scheme, `addon/Accessibility/${category}/highlights`, frame, 'docs');
        if (category === 'Violations') {
          await frame.locator('#storybook-highlights-root [data-highlight-dimensions] > div').first().click();
          await frame.locator('#storybook-highlights-menu').waitFor();
          await snapshot(scheme, 'addon/Accessibility/highlight-menu', frame, 'docs');
        }
        await page.getByRole('button', { name: 'Hide accessibility test result highlights', exact: true }).click();
      }

      await openStory(scheme, 'muxui-react-r1-1-breadcrumbs--default');
      const canvasLink = page.frameLocator('#storybook-preview-iframe').locator('.muxui-breadcrumbs a').first();
      await canvasLink.waitFor();
      const canvasLinkColor = await canvasLink.evaluate((element) => getComputedStyle(element).color);
      await canvasLink.hover();
      const canvasLinkHoverColor = await canvasLink.evaluate((element) => getComputedStyle(element).color);
      await page.goto(`${server.url}/?path=/docs/muxui-react-r1-1-breadcrumbs--docs&globals=colorScheme:${scheme}`, { waitUntil: 'domcontentloaded' });
      const docs = page.frameLocator('#storybook-preview-iframe');
      await docs.locator('.sbdocs-wrapper').waitFor();
      await snapshot(scheme, 'docs/default', await exactPreviewFrame(page), 'docs');
      for (const [label, stylePrefix] of [['Grid visibility', 'addon-backgrounds-grid-docs-'], ['Outline tool', 'addon-outline-docs-']]) {
        const tool = page.getByRole('switch', { name: label, exact: true });
        const preview = page.frameLocator('#storybook-preview-iframe');
        await ensureToolState(page, preview, tool, {
          label, stylePrefix, enabled: true, stage: `docs/${label}/enable`,
        });
        const activeDocsFrame = await exactPreviewFrame(page);
        await snapshot(scheme, `docs/${label}/active`, activeDocsFrame, 'docs');
        if (label === 'Outline tool') await tokenPaint(scheme, preview.locator('.muxui-breadcrumbs a').first(), 'outlineColor', 'semantic.focus.ring');
        await ensureToolState(page, preview, tool, {
          label, stylePrefix, enabled: false, stage: `docs/${label}/disable`,
        });
      }
      for (const selected of ['light', 'dark']) {
        await page.locator('button[aria-label^="Preview background"]').click();
        await page.getByRole('option', { name: selected === 'light' ? 'Light' : 'Dark', exact: true }).click();
        await (await exactPreviewFrame(page)).waitForFunction((value) => [...document.querySelectorAll('style[id^="addon-backgrounds-docs-"]')]
          .some((element) => element.textContent.includes(value)), graphs[selected]['semantic.surface.canvas'].value);
        await tokenPaint(selected, docs.locator('.docs-story').first(), 'backgroundColor', 'semantic.surface.canvas');
        await snapshot(scheme, `docs/background-${selected}`, await exactPreviewFrame(page), 'docs', { selectedBackground: graphs[selected]['semantic.surface.canvas'] });
      }
      await page.locator('button[aria-label^="Preview background"]').click();
      await page.getByRole('option', { name: 'Reset background', exact: true }).click();
      await docs.locator('style[id^="addon-backgrounds-docs-"]').first().waitFor({ state: 'detached' });
      await docs.locator('.sbdocs-wrapper').waitFor();
      await docs.locator('h1').first().evaluate((element) => {
        const range = document.createRange(); range.selectNodeContents(element);
        document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
      });
      await snapshot(scheme, 'docs/text-selection', await exactPreviewFrame(page), 'docs');
      await (await exactPreviewFrame(page)).evaluate(() => document.getSelection().removeAllRanges());
      const sourceToggles = docs.getByRole('switch', { name: 'Show code', exact: true });
      await sourceToggles.first().waitFor();
      assert.ok(await sourceToggles.count(), 'Docs must expose source controls');
      await sourceToggles.first().click();
      await docs.getByRole('switch', { name: 'Hide code', exact: true }).first().waitFor();
      await docs.locator('.prismjs:visible').first().waitFor();
      await snapshot(scheme, 'docs/source', await exactPreviewFrame(page), 'docs');
      const syntaxColors = await docs.locator('.prismjs:visible .token').evaluateAll((elements) =>
        [...new Set(elements.map((element) => getComputedStyle(element).color))]);
      assert.ok(syntaxColors.length > 1, 'Docs must preserve syntax colour distinctions');
      const sourceContrast = await docs.locator('.prismjs:visible').first().evaluate((element) => {
        const style = getComputedStyle(element);
        function luminance(color) {
          return color.match(/[\d.]+/gu).slice(0, 3).map(Number).map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        }
        const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => a - b);
        return (values[1] + 0.05) / (values[0] + 0.05);
      });
      assert.ok(sourceContrast >= 4.5, `${scheme}: source text must remain readable (${sourceContrast.toFixed(2)}:1)`);
      await docs.locator('.prismjs:visible').first().hover();
      await snapshot(scheme, 'docs/source-hover', await exactPreviewFrame(page), 'docs');
      await docs.locator('.muxui-breadcrumbs a').first().waitFor();
      const link = await docs.locator('.muxui-breadcrumbs a').first().evaluate((element) => ({ color: getComputedStyle(element).color,
        token: getComputedStyle(document.documentElement).getPropertyValue('--muxui-semantic-content-link').trim() }));
      assert.ok(link.token, 'Embedded component must retain its own Mux token context');
      assert.equal(link.color, canvasLinkColor, 'Docs chrome must not recolour the embedded component');
      await docs.locator('.muxui-breadcrumbs a').first().hover();
      const docsLinkHoverColor = await docs.locator('.muxui-breadcrumbs a').first().evaluate((element) => getComputedStyle(element).color);
      assert.equal(docsLinkHoverColor, canvasLinkHoverColor, 'Docs chrome must preserve component hover');
      report.states.push({ scheme, state: 'docs/embedded-component', ...link, hoverColor: docsLinkHoverColor });
    }
    const failures = report.states.filter((state) => state.nonToken?.length || state.problems?.length);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    t.diagnostic(`Audited ${report.states.length} light/dark states; report: ${reportPath}`);
    const unique = new Map();
    for (const { scheme, state, nonToken, problems } of failures) {
      for (const paint of [...nonToken, ...problems]) unique.set(`${scheme}/${paint.property}/${paint.rgba ?? paint.value}`,
        { scheme, state, ...paint });
    }
    assert.equal(unique.size, 0, `Storybook painted colours outside canonical Mux tokens: ${JSON.stringify([...unique.values()].slice(0, 12))}; full report: ${reportPath}`);
  } finally {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await browser.close(); server.stop();
  }
});

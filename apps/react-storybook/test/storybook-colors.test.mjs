import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { convert, create as createStorybookTheme } from 'storybook/theming';
import { FILE_COMPONENT_SEARCH_REQUEST, FILE_COMPONENT_SEARCH_RESPONSE } from 'storybook/internal/core-events';
import { compilePureTokenGraph } from '@muxui/tokens/core';
import defaultTheme from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { collectStorybookPaints } from './helpers/color-audit.mjs';
import { colourStateSignatures } from './storybook-colors-report.mjs';
import { backgroundOptions, buildTheme, managerThemeCss, previewThemeCss } from '../.storybook/theme.mjs';
import { projectMeasurePalette } from '../.storybook/measure-palette.mjs';

const appRoot = resolve(import.meta.dirname, '..');
const graphs = Object.fromEntries(['light', 'dark'].map((colorScheme) => [
  colorScheme, compilePureTokenGraph(defaultTheme, { modes: { colorScheme } }).tokens,
]));

function heavyAuditSkip(name) {
  const isPullRequestSelection = process.env.MUXUI_STORYBOOK_AUDIT_EVENT === 'pull_request';
  const forceFull = process.env.MUXUI_STORYBOOK_AUDIT_FORCE === '1';
  return process.env.MUXUI_STORYBOOK_AUDIT_MODE === 'skip-heavy'
    && isPullRequestSelection
    && !forceFull
    ? `CI selection marked ${name} unrelated to the changed inputs`
    : false;
}

function workerCount(variable) {
  const value = process.env[variable] ?? '2';
  assert.ok(value === '1' || value === '2', `${variable} must be 1 or 2, got ${value}`);
  return Number(value);
}

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

function serializeError(error, seen = new Set()) {
  if (!(error instanceof Error)) return { name: 'Error', message: String(error) };
  if (seen.has(error)) return { name: error.name, message: '[circular error]' };
  seen.add(error);
  const serialized = { name: error.name, message: error.message, stack: error.stack };
  if (error.cause !== undefined) serialized.cause = serializeError(error.cause, seen);
  if (error instanceof AggregateError) serialized.errors = error.errors.map((entry) => serializeError(entry, seen));
  if (error.cleanupErrors) serialized.cleanupErrors = error.cleanupErrors;
  return serialized;
}

async function captureToolState(page, previewFrame, { label, stylePrefix, expected, stage, workerId = 'single' }) {
  const directory = colourAuditArtifactDirectory();
  await mkdir(directory, { recursive: true });
  const stem = `storybook-colours-${process.pid}-${workerId}-${Date.now()}`;
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

async function waitForToolStyle(page, previewFrame, tool, { label, stylePrefix, enabled, stage, workerId = 'single' }) {
  const expected = String(enabled);
  try {
    await page.waitForFunction(({ label: expectedLabel, expectedState }) => [...document.querySelectorAll('[role="switch"]')]
      .some((element) => element.getAttribute('aria-label') === expectedLabel
        && element.getAttribute('aria-checked') === expectedState), { label, expectedState: expected });
    await previewFrame.locator(`style[id^="${stylePrefix}"]`).first().waitFor({ state: enabled ? 'attached' : 'detached' });
  } catch (error) {
    const diagnostics = await captureToolState(page, previewFrame, { label, stylePrefix, expected, stage, workerId });
    throw new Error(`${stage}: Storybook did not reach ${label}=${expected}; diagnostics: ${diagnostics.statePath}, ${diagnostics.screenshotPath}`, { cause: error });
  }
  assert.equal(await tool.getAttribute('aria-checked'), expected, `${stage}: ${label} state`);
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

test('Storybook search status icons use canonical action and option-state colours', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage();
    const symbols = `
      <symbol id="icon--new">
        <rect x="6" y="3.5" width="2" height="7" rx="1" fill="currentColor"></rect>
        <rect x="3.5" y="6" width="7" height="2" rx="1" fill="currentColor"></rect>
      </symbol>
      <symbol id="icon--modified"><circle cx="7" cy="7" r="3" fill="currentColor"></circle></symbol>
      <symbol id="icon--affected"><circle cx="7" cy="7" r="3" fill="currentColor"></circle></symbol>
      <symbol id="icon--reviewing"><path d="M7 3a4 4 0 100 8A4 4 0 007 3z" fill="currentColor"></path></symbol>
      <symbol id="icon--success"><path d="M10.854 4.146a.5.5 0 010 .708l-5 5a.5.5 0 01-.708 0l-2-2a.5.5 0 11.708-.708L5.5 8.793l4.646-4.647a.5.5 0 01.708 0z" fill="currentColor"></path></symbol>
      <symbol id="icon--warning"><path d="M7 3l4 7H3l4-7z" fill="currentColor"></path></symbol>
      <symbol id="icon--error"><path d="M7 3a4 4 0 100 8A4 4 0 007 3z" fill="currentColor"></path></symbol>`;
    const fixture = (css, colors) => `<style>
        ${css}
        body { margin: 0; background: var(--muxui-storybook-surface-subtle, white); color: var(--muxui-storybook-content-strong, black); }
        #status-fixture { display: flex; gap: 1rem; }
        [role='option'] { display: flex; align-items: center; width: 10rem; height: 2rem; color: var(--muxui-storybook-content-strong, black); }
        [role='option'] svg { width: 14px; height: 14px; }
        [role='option'] svg + span { margin-inline-start: 0.5rem; }
        ul { margin: 0; padding: 0; list-style: none; }
      </style>
      <svg aria-hidden="true" width="0" height="0" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>${symbols}</defs></svg>
      <ul id="status-fixture" role="listbox">
        <li class="search-result-item" role="option" data-status="pending"><svg style="color: ${colors.pending}"><path d="M7 3a4 4 0 100 8A4 4 0 007 3z" fill="currentColor"></path></svg><span>Pending</span></li>
        <li class="search-result-item" role="option" data-status="success"><svg style="color: ${colors.success}"><use xlink:href="#icon--success"></use></svg><span>Success</span></li>
        <li class="search-result-item" role="option" data-status="warning"><svg style="color: ${colors.warning}"><use xlink:href="#icon--warning"></use></svg><span>Warning</span></li>
        <li class="search-result-item" role="option" data-status="error"><svg style="color: ${colors.error}"><use xlink:href="#icon--error"></use></svg><span>Error</span></li>
        <li class="search-result-item" role="option" data-status="modified"><svg style="color: ${colors.change}"><use xlink:href="#icon--modified"></use></svg><span>Modified</span></li>
        <li class="search-result-item" role="option" data-status="new"><svg style="color: ${colors.change}"><use xlink:href="#icon--new"></use></svg><span>New</span></li>
        <li class="search-result-item" role="option" data-status="affected"><svg style="color: ${colors.change}"><use xlink:href="#icon--affected"></use></svg><span>Affected</span></li>
        <li class="search-result-item" role="option" data-status="hovered" data-hovered="true"><svg style="color: ${colors.change}"><use xlink:href="#icon--modified"></use></svg><span>Hovered</span></li>
        <li class="search-result-item" role="option" data-status="selected" aria-selected="true"><svg style="color: ${colors.change}"><use xlink:href="#icon--modified"></use></svg><span>Selected</span></li>
        <li class="search-result-item" role="option" data-status="reviewing"><svg style="color: ${colors.reviewing}"><use xlink:href="#icon--reviewing"></use></svg><span>Reviewing</span></li>
        <li class="search-result-item" role="option" data-status="unknown"><span>Unknown</span></li>
      </ul>`;
    for (const scheme of ['light', 'dark']) {
      const stockTheme = convert(createStorybookTheme({ base: scheme }));
      const stockColors = {
        change: stockTheme.fgColor.accent,
        pending: `color-mix(in srgb, ${stockTheme.color.defaultText} ${scheme === 'light' ? 70 : 40}%, transparent)`,
        success: stockTheme.color.positive,
        warning: stockTheme.color.warning,
        error: stockTheme.color.negative,
        reviewing: stockTheme.fgColor.agentic,
      };
      await page.setContent(fixture('', stockColors));
      await page.evaluate((colorScheme) => document.documentElement.setAttribute('data-muxui-color-scheme', colorScheme), scheme);
      const computedRgba = (value) => page.evaluate((color) => {
        const probe = document.createElement('span');
        probe.style.color = color;
        document.body.append(probe);
        const channels = getComputedStyle(probe).color.match(/[\d.]+/gu)?.map(Number) ?? [];
        probe.remove();
        return channels.length === 4 ? channels.join(',') : channels.concat(1).join(',');
      }, value);
      const stockResult = await page.evaluate(collectStorybookPaints, { tokens: graphs[scheme], scope: 'manager' });
      for (const status of ['change', 'success', 'warning', 'error', 'reviewing']) {
        const value = stockColors[status];
        const rgba = await computedRgba(value);
        assert.ok(stockResult.nonToken.some((paint) => paint.rgba === rgba), `${scheme}/${status}: upstream status colour is an audit-visible leak without the manager projection`);
      }

      await page.setContent(fixture(managerThemeCss(), stockColors));
      await page.evaluate((colorScheme) => document.documentElement.setAttribute('data-muxui-color-scheme', colorScheme), scheme);
      const expected = await page.evaluate((values) => {
        const probe = document.createElement('span');
        document.body.append(probe);
        const computed = Object.fromEntries(Object.entries(values).map(([name, value]) => {
          probe.style.color = value;
          return [name, getComputedStyle(probe).color];
        }));
        probe.remove();
        return computed;
      }, {
        idle: graphs[scheme]['semantic.action.background'].value,
        hovered: graphs[scheme]['semantic.content.strong'].value,
        selected: graphs[scheme]['semantic.action.foreground'].value,
        reviewing: graphs[scheme]['reference.color.purple-60'].value,
        pending: graphs[scheme]['semantic.content.muted'].value,
        success: graphs[scheme]['semantic.status.success'].value,
        warning: graphs[scheme]['semantic.status.warning'].value,
        error: graphs[scheme]['semantic.action.danger-background'].value,
      });
      const paints = await page.locator('[role="option"]').evaluateAll((elements) => Object.fromEntries(
        elements.map((element) => {
          const paint = element.querySelector('use,path');
          return [element.dataset.status, paint && { color: getComputedStyle(paint).color, fill: getComputedStyle(paint).fill }];
        }),
      ));
      assert.equal(paints.pending.fill, expected.pending, `${scheme}/pending: listbox path fill uses content muted`);
      for (const status of ['success', 'warning', 'error']) {
        assert.equal(paints[status].color, expected[status], `${scheme}/${status}: status colour`);
      }
      for (const status of ['modified', 'new', 'affected']) {
        assert.equal(paints[status].color, expected.idle, `${scheme}/${status}: idle status colour`);
        assert.equal(paints[status].fill, expected.idle, `${scheme}/${status}: idle status fill`);
      }
      assert.equal(paints.hovered.color, expected.hovered, `${scheme}/hovered: row foreground wins`);
      assert.equal(paints.hovered.fill, expected.hovered, `${scheme}/hovered: row fill follows foreground`);
      assert.equal(paints.selected.color, expected.selected, `${scheme}/selected: selected foreground wins`);
      assert.equal(paints.selected.fill, expected.selected, `${scheme}/selected: selected fill follows foreground`);
      assert.equal(paints.reviewing.color, expected.reviewing, `${scheme}/reviewing: distinct status colour uses the vision purple token`);
      assert.equal(paints.unknown, null, `${scheme}/unknown: Storybook renders no icon`);
      const result = await page.evaluate(collectStorybookPaints, { tokens: graphs[scheme], scope: 'manager' });
      assert.deepEqual(result.problems, [], `${scheme}: status fixture has no audit problems`);
      assert.deepEqual(result.nonToken, [], `${scheme}: status fixture uses canonical paints`);
    }
  } finally { await browser.close(); }
});

test('Storybook create-story dialog paints only Mux colours', { timeout: 90000 }, async () => {
  const server = await startStorybook();
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    for (const scheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`${server.url}/?path=/story/muxui-react-r1-1-button--default&globals=colorScheme:${scheme}`, { waitUntil: 'domcontentloaded' });
      await page.frameLocator('#storybook-preview-iframe').locator('.muxui-storybook-surface').waitFor();
      await page.getByRole('button', { name: 'Create a new story' }).click();
      // The role wrapper uses display: contents; wait for its visible input.
      const dialog = page.locator('[role="dialog"][aria-label="Add a new story"]');
      const input = dialog.locator('input');
      await input.waitFor();
      const assertPaints = async (state) => {
        const audit = await page.evaluate(collectStorybookPaints, { tokens: graphs[scheme], scope: 'manager' });
        assert.deepEqual(audit.problems, [], `${scheme}/${state}: modal paints have no audit problems`);
        assert.deepEqual(audit.nonToken, [], `${scheme}/${state}: modal, scrim, and input use Mux paints`);
      };
      for (const state of ['focus', 'hover', 'blur']) {
        if (state === 'hover') await input.hover();
        if (state === 'blur') await dialog.locator('h2').click();
        await assertPaints(state);
      }
      // Hold the real search lifecycle and supply read-only results. No story
      // creation action is invoked or sent to the development server.
      await page.evaluate((request) => {
        const channel = globalThis.__STORYBOOK_ADDONS_MANAGER.getChannel();
        const emit = channel.emit;
        channel.emit = function (type, ...args) {
          if (type === request) { globalThis.__muxuiFileSearchQuery = args[0].id; return; }
          return emit.call(this, type, ...args);
        };
      }, FILE_COMPONENT_SEARCH_REQUEST);
      await input.fill('muxui-colour-audit');
      await dialog.locator('div[style*="width: 90px"]').first().waitFor();
      await assertPaints('loading');
      await page.evaluate((response) => {
        globalThis.__STORYBOOK_ADDONS_MANAGER.getChannel().emit(response, {
          id: globalThis.__muxuiFileSearchQuery, success: true, payload: { files: [] },
        });
      }, FILE_COMPONENT_SEARCH_RESPONSE);
      await dialog.getByText('We could not find any file with that name', { exact: true }).waitFor();
      await assertPaints('empty');
      await input.fill('muxui-colour-audit-results');
      await page.waitForFunction(() => globalThis.__muxuiFileSearchQuery === 'muxui-colour-audit-results');
      await page.evaluate((response) => {
        globalThis.__STORYBOOK_ADDONS_MANAGER.getChannel().emit(response, {
          id: globalThis.__muxuiFileSearchQuery, success: true, payload: { files: [{
            filepath: 'components/MuxAudit.tsx', storyFileExists: false,
            exportedComponents: [{ name: 'First', default: true }, { name: 'Second', default: false }],
          }] },
        });
      }, FILE_COMPONENT_SEARCH_RESPONSE);
      const row = dialog.locator('li[data-index="0"]');
      await row.waitFor();
      await assertPaints('results');
      await row.hover();
      await assertPaints('result-hover');
      await page.mouse.move(1400, 950);
      await page.keyboard.press('Tab');
      await row.focus();
      await assertPaints('result-focus');
      // Two exports expand the row. Selecting an export would create a file.
      await row.locator('.file-list-item').click();
      await row.getByText('Second', { exact: true }).waitFor();
      await assertPaints('result-expanded');
      const exportOption = row.locator('[id^="file-list-export-"] li').last();
      await exportOption.hover();
      await assertPaints('export-hover');
      await page.mouse.move(1400, 950);
      await page.keyboard.press('Tab');
      await exportOption.focus();
      await assertPaints('export-focus');
      await page.keyboard.press('Escape');
      await input.waitFor({ state: 'hidden' });
      await page.close();
    }
  } finally { await browser.close(); server.stop(); }
});

test('Storybook completed and skipped onboarding states paint only Mux colours', { timeout: 120000 }, async () => {
  const server = await startStorybook();
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    for (const { scheme, status } of ['light', 'dark'].flatMap((scheme) => ['accepted', 'skipped'].map((status) => ({ scheme, status })))) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`${server.url}/?path=/story/muxui-react-r1-1-button--default&globals=colorScheme:${scheme}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#storybook-sidebar-region').waitFor();
      await page.evaluate(() => {
        const store = globalThis.__STORYBOOK_API__?.internal_universalChecklistStore;
        const state = store?.getState?.();
        if (!store?.setState || !state?.items || !('whatsNewStorybook10' in state.items)) throw new Error('Storybook onboarding action changed');
        store.setState({ ...state, loaded: true, aiOptIn: false, widget: {},
          items: Object.fromEntries(Object.keys(state.items).map((id) => [id, {
            status: id === 'whatsNewStorybook10' ? 'open' : 'accepted',
          }])),
        });
      });
      const action = page.locator('#storybook-checklist-widget button[data-target-id="whatsNewStorybook10"]');
      await action.waitFor({ state: 'attached' });
      const disclosure = page.locator('#checklist-module-collapse-toggle');
      await disclosure.waitFor();
      if (await disclosure.getAttribute('aria-label') === 'Expand onboarding guide') await disclosure.click();
      await action.locator('..').hover();
      // Storybook initializes for 1s, debounces readiness for 500ms, then enables
      // completion animation after another 1s. Cross those documented timers.
      await page.waitForTimeout(3000);
      const checkSelector = "#storybook-checklist-widget [aria-label^='Open onboarding guide'] div:not([class]) > svg";
      await page.addStyleTag({ content: `#root svg[style*="--fade-duration"], ${checkSelector} { animation: none !important; opacity: 1 !important; }` });
      await page.evaluate((status) => {
        const store = globalThis.__STORYBOOK_API__.internal_universalChecklistStore;
        const state = store.getState();
        store.setState({ ...state, items: { ...state.items, whatsNewStorybook10: { status } } });
      }, status);
      if (status === 'skipped') {
        await page.waitForFunction(() => [...document.querySelectorAll('#storybook-checklist-widget span')]
          .some((span) => getComputedStyle(span, '::after').content === '""'));
      } else {
        await page.locator(checkSelector).waitFor({ state: 'visible' });
      }
      const widgetAudit = await page.evaluate(collectStorybookPaints, { tokens: graphs[scheme], scope: 'manager' });
      assert.deepEqual(widgetAudit.problems, [], `${scheme}/${status}: completion state has no audit problems`);
      assert.deepEqual(widgetAudit.nonToken, [], `${scheme}/${status}: the entire completion state uses Mux paints`);
      if (status === 'skipped') { await page.close(); continue; }
      const particleSelector = '#root svg[style*="--fade-duration"]';
      await page.locator(particleSelector).first().waitFor({ state: 'visible' });
      // Read both projections in one browser task: Storybook removes the
      // completed checklist item after 2s, independently of its CSS animation.
      const result = await page.evaluate(({ selector, checkSelector, expectedValue, expectedSurface, expectedForeground, canonicalValues }) => {
        const particles = [...document.querySelectorAll(selector)];
        const paths = particles.flatMap((particle) => [...particle.querySelectorAll('path')]);
        const probe = document.createElement('span');
        document.body.append(probe);
        const normalize = (color) => {
          probe.style.color = color;
          return getComputedStyle(probe).color;
        };
        const expected = normalize(expectedValue);
        const check = document.querySelector(checkSelector);
        const completed = { background: getComputedStyle(check).backgroundColor, foreground: getComputedStyle(check.querySelector('path')).fill,
          expectedBackground: normalize(expectedSurface), expectedForeground: normalize(expectedForeground) };
        const canonical = new Set(canonicalValues.map(normalize));
        const projected = paths.map((path) => getComputedStyle(path).fill);
        const rules = [...document.querySelector('#muxui-storybook-theme').sheet.cssRules];
        const rule = rules.find((candidate) => candidate.selectorText === selector);
        if (!rule?.style.fill) throw new Error('Storybook completion-particle projection changed');
        const original = rule.style.cssText;
        let stock;
        try {
          rule.style.removeProperty('fill');
          stock = paths.map((path) => getComputedStyle(path).fill);
        } finally {
          rule.style.cssText = original;
          probe.remove();
        }
        return { completed, particles: particles.length, paths: paths.length, expected, projected, stock,
          stockNonToken: stock.filter((color) => !canonical.has(color)) };
      }, { selector: particleSelector, checkSelector, expectedValue: graphs[scheme]['semantic.action.background'].value,
        expectedSurface: graphs[scheme]['semantic.status.success'].value, expectedForeground: graphs[scheme]['reference.color.neutral-100'].value,
        canonicalValues: Object.values(graphs[scheme]).filter((token) => token.type === 'color').map((token) => token.value) });
      assert.equal(result.completed.background, result.completed.expectedBackground, `${scheme}: completion checkmark has the success surface`);
      assert.equal(result.completed.foreground, result.completed.expectedForeground, `${scheme}: completion checkmark has a legible token foreground`);
      assert.equal(result.particles, 7, `${scheme}: all seven upstream particles are present`);
      assert.equal(result.paths, 7, `${scheme}: every particle has a painted path`);
      assert.deepEqual([...new Set(result.projected)], [result.expected], `${scheme}: particle fills use semantic.action.background`);
      assert.equal(new Set(result.stock).size, 7, `${scheme}: removing the override recovers the seven stock fills`);
      assert.equal(result.stockNonToken.length, 7, `${scheme}: every stock fill is outside the canonical graph`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
});

test('Storybook Docs ArgsTable keeps prose readable and type badges distinct in light and dark', { timeout: 120000 }, async (t) => {
  const server = await startStorybook();
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    for (const { scheme, readOnly } of ['light', 'dark'].flatMap((scheme) => [false, true].map((readOnly) => ({ scheme, readOnly })))) {
      await page.goto(`${server.url}/?path=/docs/muxui-react-r1-3-color-slider--docs&globals=colorScheme:${scheme}`, { waitUntil: 'domcontentloaded' });
      const docs = page.frameLocator('#storybook-preview-iframe');
      await docs.locator('.sbdocs-wrapper').waitFor();
      const table = docs.locator('.docblock-argstable').first();
      await table.waitFor();
      if (readOnly) await table.locator('label[aria-label="readOnly"]').click();
      assert.equal(await table.getByRole('switch', { name: 'readOnly', exact: true }).isChecked(), readOnly);
      const result = await table.evaluate((element, tokenValues) => {
        const probe = document.createElement('span');
        document.body.append(probe);
        const computedToken = (value, cssProperty = 'color', styleProperty = cssProperty) => {
          probe.style.setProperty(cssProperty, value);
          return getComputedStyle(probe)[styleProperty];
        };
        const expected = {
          strong: computedToken(tokenValues.strong),
          selectionTrack: computedToken(tokenValues.selectionTrack, 'background-color', 'backgroundColor'),
          selectionForeground: computedToken(tokenValues.selectionForeground),
          hover: computedToken(tokenValues.hover, 'background-color', 'backgroundColor'),
        };
        const parseColor = (value) => {
          if (!/^rgba?\([\d., ]+\)$/u.test(value)) throw new Error(`Unsupported table colour: ${value}`);
          const channels = value.match(/[\d.]+/gu)?.map(Number) ?? [];
          if (channels.length < 3) return null;
          return { red: channels[0], green: channels[1], blue: channels[2], alpha: channels[3] ?? 1 };
        };
        const contrast = (foreground, background) => {
          if (!foreground || !background || foreground.alpha !== 1 || background.alpha !== 1) return null;
          const luminance = ({ red, green, blue }) => [red, green, blue].map((channel) => channel / 255)
            .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
            .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
          const light = luminance(foreground);
          const dark = luminance(background);
          return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
        };
        const backgroundFor = (node) => {
          for (let current = node; current; current = current.parentElement) {
            const background = getComputedStyle(current).backgroundColor;
            const parsed = parseColor(background);
            if (parsed?.alpha > 0) return { value: background, parsed };
          }
          return null;
        };
        const inspect = (nodes) => [...nodes].map((node) => {
          const style = getComputedStyle(node);
          for (let current = node; current; current = current.parentElement) {
            const ancestor = getComputedStyle(current);
            if (ancestor.opacity !== '1' || ancestor.filter !== 'none' || ancestor.backgroundImage !== 'none') {
              throw new Error('Table contrast fixture requires opaque text without filters or background images');
            }
          }
          const background = backgroundFor(node);
          const foreground = parseColor(style.color);
          return {
            text: node.textContent.trim(), color: style.color, background: style.backgroundColor,
            ancestorBackground: background?.value ?? null, opaque: Boolean(foreground?.alpha === 1 && background?.parsed.alpha === 1),
            contrast: contrast(foreground, background?.parsed),
          };
        });
        const headings = inspect(element.querySelectorAll('th > span'));
        const labels = inspect(element.querySelectorAll('tbody td:first-child > span'));
        const descriptions = inspect(element.querySelectorAll('tbody td:nth-child(2) > div:first-child > span'));
        const emptyDefaults = inspect(element.querySelectorAll('tbody td:nth-child(3) > span'));
        const defaultBadges = inspect(element.querySelectorAll('tbody td:nth-child(3) > div > span'));
        const booleanLabels = [...element.querySelectorAll('tbody td:nth-child(4) label')]
          .filter((node) => node.querySelector('input[type="checkbox"]'));
        const booleanControls = inspect(booleanLabels);
        const booleanGroups = booleanLabels.map((label) => {
          const values = inspect(label.querySelectorAll('span[aria-hidden="true"]'))
            .map((entry, index) => ({ ...entry, selected: label.querySelector('input').checked === (index === 1) }));
          const selected = values.find((entry) => entry.selected);
          const unselected = values.find((entry) => !entry.selected);
          return {
            values,
            surfaceContrast: selected && unselected
              ? contrast(parseColor(selected.ancestorBackground), parseColor(unselected.ancestorBackground))
              : null,
          };
        });
        const booleanValues = booleanGroups.flatMap((group) => group.values);
        const typeBadges = inspect(element.querySelectorAll('tbody td:nth-child(2) > div > div > span'));
        probe.remove();
        return { expected, headings, labels, descriptions, emptyDefaults, defaultBadges, booleanControls, booleanGroups, booleanValues, typeBadges };
      }, {
        strong: graphs[scheme]['semantic.content.strong'].value,
        selectionTrack: graphs[scheme]['semantic.selection.track'].value,
        selectionForeground: graphs[scheme]['semantic.action.foreground'].value,
        hover: graphs[scheme]['semantic.surface.hover'].value,
      });
      for (const [name, entries] of Object.entries({
        headings: result.headings,
        labels: result.labels,
        descriptions: result.descriptions,
        emptyDefaults: result.emptyDefaults,
      })) {
        assert.ok(entries.length > 0, `${scheme}: ArgsTable must expose ${name}`);
        for (const entry of entries) {
          assert.equal(entry.color, result.expected.strong, `${scheme}/${name}: readable Mux foreground`);
          assert.equal(entry.background, 'rgba(0, 0, 0, 0)', `${scheme}/${name}: prose span has no inline surface`);
          assert.equal(entry.opaque, true, `${scheme}/${name}: resolved foreground/background must be opaque`);
          assert.ok(entry.contrast >= 4.5, `${scheme}/${name}: contrast ${entry.contrast.toFixed(2)}:1`);
        }
      }
      assert.ok(result.booleanControls.length > 0, `${scheme}: ArgsTable must expose Boolean control labels`);
      assert.ok(result.booleanValues.length >= result.booleanControls.length * 2, `${scheme}: ArgsTable must expose checked and unchecked labels`);
      for (const entry of result.booleanControls) {
        assert.equal(entry.color, result.expected.strong, `${scheme}/boolean control: readable Mux foreground`);
        assert.equal(entry.opaque, true, `${scheme}/boolean control: resolved foreground/background must be opaque`);
        assert.ok(entry.contrast >= 4.5, `${scheme}/boolean control: contrast ${entry.contrast.toFixed(2)}:1`);
      }
      for (const entry of result.booleanValues) {
        const foreground = entry.selected ? result.expected.selectionForeground : result.expected.strong;
        assert.equal(entry.color, foreground, `${scheme}/Boolean value: selected and unselected text use their Mux foreground`);
        assert.equal(entry.background, entry.selected ? result.expected.selectionTrack : 'rgba(0, 0, 0, 0)', `${scheme}/Boolean value: selected option uses the selection track`);
        assert.equal(entry.ancestorBackground, entry.selected ? result.expected.selectionTrack : result.expected.hover, `${scheme}/Boolean value: selected and unselected options paint different surfaces`);
        assert.equal(entry.opaque, true, `${scheme}/Boolean value: resolved foreground/background must be opaque`);
        assert.ok(entry.contrast >= 4.5, `${scheme}/Boolean value: contrast ${entry.contrast.toFixed(2)}:1`);
      }
      for (const group of result.booleanGroups) {
        assert.ok(group.surfaceContrast >= 3, `${scheme}/Boolean value: selected surface contrast ${group.surfaceContrast?.toFixed(2)}:1`);
      }
      assert.ok(result.typeBadges.length > 0, `${scheme}: ArgsTable must retain type badges`);
      assert.ok(result.defaultBadges.length > 0, `${scheme}: ArgsTable must retain default-value badges`);
      for (const entry of [...result.typeBadges, ...result.defaultBadges]) {
        assert.equal(entry.color, result.expected.strong, `${scheme}/badge: readable Mux foreground`);
        assert.equal(entry.background, result.expected.hover, `${scheme}/badge: Mux hover surface`);
        assert.equal(entry.opaque, true, `${scheme}/badge: resolved foreground/background must be opaque`);
        assert.ok(entry.contrast >= 4.5, `${scheme}/badge: contrast ${entry.contrast.toFixed(2)}:1`);
      }
      const screenshotDirectory = process.env.MUXUI_STORYBOOK_ARGS_TABLE_ARTIFACT_DIR;
      if (screenshotDirectory) {
        await mkdir(screenshotDirectory, { recursive: true });
        await table.screenshot({ path: resolve(screenshotDirectory, `argstable-${scheme}-${readOnly}.png`) });
      }
      t.diagnostic(`${scheme}: ${result.labels.length} labels, ${result.descriptions.length} descriptions, ${result.emptyDefaults.length} empty defaults, ${result.booleanValues.length} Boolean values, ${result.typeBadges.length} type badges, ${result.defaultBadges.length} default badges`);
    }
  } finally {
    await browser.close();
    server.stop();
  }
});

async function runColourWorker({ browser, schemes, workerId }) {
  const report = { storybookVersion: '10.5.10', tokenSource: 'catalog/tokens/default-theme.json', states: [] };
  let server;
  let context;
  let page;
  let failure;
  const cleanupErrors = [];
  try {
    server = await startStorybook();
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
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
    async function openStory(scheme, story = 'muxui-react-r1-1-button--default', globals = '') {
      await page.goto(`${server.url}/?path=/story/${story}&globals=colorScheme:${scheme}${globals}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#storybook-sidebar-region').waitFor();
      await page.frameLocator('#storybook-preview-iframe').locator('.muxui-storybook-surface').waitFor();
    }
    async function resetOnboardingChecklist(page) {
      await page.evaluate(() => {
        const store = globalThis.__STORYBOOK_API__?.internal_universalChecklistStore;
        const state = store?.getState?.();
        if (!store?.setState || !state?.items) throw new Error('Storybook checklist store is unavailable');
        if (!('whatsNewStorybook10' in state.items)) throw new Error('Storybook onboarding action changed');
        store.setState({
          ...state,
          aiOptIn: false,
          items: Object.fromEntries(Object.keys(state.items).map((id) => [id, { status: 'open' }])),
          widget: {},
          loaded: true,
        });
      });
      const widget = page.locator('#storybook-checklist-widget');
      await widget.waitFor();
      await widget.locator('[aria-label^="Open onboarding guide"]').first().waitFor();
      return widget;
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
    for (const scheme of schemes) {
      // Keep the manager's real loading overlay mounted by holding its index
      // request. This exercises the generated #preview-loader before the
      // manager can remove it after the preview is ready.
      const managerLoading = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      let releaseIndex;
      const heldIndex = new Promise((done) => { releaseIndex = done; });
      await managerLoading.route(/\/index\.json(?:\?|$)/u, async (route) => {
        await heldIndex;
        await route.continue();
      });
      try {
        await managerLoading.goto(`${server.url}/?path=/story/muxui-react-r1-1-button--default&globals=colorScheme:${scheme}`, { waitUntil: 'commit' });
        const loader = managerLoading.locator('#preview-loader[aria-label="Content is loading..."]');
        await loader.waitFor({ state: 'visible' });
        await snapshot(scheme, 'loading/manager', managerLoading);
        const loaderState = await loader.evaluate((element) => {
          const style = getComputedStyle(element);
          return { mixBlendMode: style.mixBlendMode, transitionProperty: style.transitionProperty };
        });
        assert.equal(loaderState.mixBlendMode, 'normal', `${scheme}: manager loading overlay must not blend paints`);
        assert.equal(loaderState.transitionProperty, 'transform, opacity', `${scheme}: manager loading overlay transition must not animate paints`);
        for (const property of ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor']) {
          await tokenPaint(scheme, loader, property, property === 'borderTopColor'
            ? 'semantic.action.background' : 'semantic.border.subtle');
        }

        const projection = await managerLoading.evaluate(() => {
          const style = document.querySelector('#muxui-storybook-theme');
          const rule = [...style.sheet.cssRules].find((candidate) =>
            candidate.selectorText === '#preview-loader[aria-label="Content is loading..."]');
          if (!rule) throw new Error('Storybook manager loading projection changed');
          const declarations = [...rule.style].map((property) => [
            property, rule.style.getPropertyValue(property), rule.style.getPropertyPriority(property),
          ]);
          for (const [property] of declarations) rule.style.removeProperty(property);
          return declarations;
        });
        try {
          const negative = await managerLoading.evaluate(collectStorybookPaints, { tokens: graphs[scheme], scope: 'manager' });
          assert.ok(negative.problems.some(({ element, property }) =>
            element.includes('#preview-loader') && property === 'mix-blend-mode'),
          `${scheme}: audit must catch the stock manager loader blend when its projection is removed`);
          assert.ok(negative.nonToken.some(({ examples, property }) =>
            examples.some((example) => example.includes('#preview-loader')) && property === 'border-top-color'),
          `${scheme}: audit must catch the stock manager loader paint when its projection is removed`);
        } finally {
          await managerLoading.evaluate((declarations) => {
            const style = document.querySelector('#muxui-storybook-theme');
            const rule = [...style.sheet.cssRules].find((candidate) =>
              candidate.selectorText === '#preview-loader[aria-label="Content is loading..."]');
            for (const [property, value, priority] of declarations) rule.style.setProperty(property, value, priority);
          }, projection);
        }
      } finally {
        releaseIndex();
        await managerLoading.close();
      }
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
      const onboarding = await resetOnboardingChecklist(page);
      await snapshot(scheme, 'manager/default');
      await snapshot(scheme, 'onboarding/default');
      await onboarding.hover();
      await snapshot(scheme, 'onboarding/hover');
      // Make the real checklist action available regardless of previous
      // Storybook usage, including its generated hover and pressed colours.
      await page.evaluate(() => {
        const store = globalThis.__STORYBOOK_API__.internal_universalChecklistStore;
        const state = store.getState();
        store.setState({ ...state, items: Object.fromEntries(Object.keys(state.items).map((id) =>
          [id, { status: id === 'whatsNewStorybook10' ? 'open' : 'accepted' }])) });
      });
      // Completed rows remain mounted during Storybook's exit animation.
      // Wait for the single open row before hovering its moving action.
      await page.waitForFunction(() => document.querySelectorAll(
        '#storybook-checklist-widget [aria-label^="Open onboarding guide for "]',
      ).length === 1);
      const onboardingAction = onboarding.locator('button[data-target-id="whatsNewStorybook10"]');
      await onboardingAction.waitFor({ state: 'attached' });
      const disclosure = onboarding.locator('#checklist-module-collapse-toggle');
      await disclosure.waitFor();
      if (await disclosure.getAttribute('aria-label') === 'Expand onboarding guide') await disclosure.click();
      await onboardingAction.locator('..').hover();
      await hoverAndFocus(scheme, 'onboarding/action', onboardingAction);
      await onboardingAction.hover();
      await page.mouse.down();
      await snapshot(scheme, 'onboarding/action/pressed');
      await page.mouse.move(1400, 950);
      await page.mouse.up();
      await openStory(scheme);
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
      const guide = page.locator('#main-content-wrapper [aria-labelledby$="-tab-guide"]');
      const guideAction = guide.getByRole('button', { name: 'Go', exact: true });
      await hoverAndFocus(scheme, 'settings/onboarding/action', guideAction);
      await guideAction.hover();
      await page.mouse.down();
      await snapshot(scheme, 'settings/onboarding/action/pressed');
      await page.mouse.move(1400, 950);
      await page.mouse.up();
      await page.evaluate(() => {
        const store = globalThis.__STORYBOOK_API__.internal_universalChecklistStore;
        const state = store.getState();
        store.setState({ ...state, aiOptIn: true, items: { ...state.items, aiSetup: { status: 'open' } } });
      });
      const copyPrompt = guide.getByRole('button', { name: 'Copy prompt', exact: true });
      await copyPrompt.waitFor();
      await tokenPaint(scheme, copyPrompt, 'backgroundColor', 'semantic.action.background');
      await snapshot(scheme, 'settings/onboarding/ai/default');
      for (const name of ['Copy prompt', 'Skip']) {
        const action = copyPrompt.locator('..').getByRole('button', { name, exact: true });
        await hoverAndFocus(scheme, `settings/onboarding/ai/${name}`, action);
        await action.hover();
        await page.mouse.down();
        await snapshot(scheme, `settings/onboarding/ai/${name}/pressed`);
        await page.mouse.move(1400, 950);
        await page.mouse.up();
      }
      await page.evaluate(() => {
        const store = globalThis.__STORYBOOK_API__.internal_universalChecklistStore;
        store.setState({ ...store.getState(), aiOptIn: false });
      });
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
      // Automatic scans must not replace the colour fixtures while their
      // actual result renderer and highlights are being inspected.
      await openStory(scheme, 'muxui-react-r1-1-button--default', ';a11y.manual:!true');
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
      const docs = page.frameLocator('#storybook-preview-iframe');
      // Storybook 10.5 remounts Docs examples on globals updates. A pending
      // example teardown can reload the iframe and discard the next click.
      // Load each paint state independently; Canvas above covers tool clicks.
      async function openDocs(globals = '') {
        await page.goto(`${server.url}/?path=/docs/muxui-react-r1-1-breadcrumbs--docs&globals=colorScheme:${scheme}${globals}`, { waitUntil: 'domcontentloaded' });
        await docs.locator('.sbdocs-wrapper').waitFor();
        await docs.locator('.muxui-breadcrumbs a').first().waitFor();
      }
      await openDocs();
      await snapshot(scheme, 'docs/default', await exactPreviewFrame(page), 'docs');
      for (const [label, stylePrefix, global] of [
        ['Grid visibility', 'addon-backgrounds-grid-docs-', 'backgrounds.grid'],
        ['Outline tool', 'addon-outline-docs-', 'outline'],
      ]) {
        const tool = page.getByRole('switch', { name: label, exact: true });
        await openDocs(`;${global}:!true`);
        await waitForToolStyle(page, docs, tool, {
          label, stylePrefix, enabled: true, stage: `docs/${label}/enabled`, workerId,
        });
        await snapshot(scheme, `docs/${label}/active`, await exactPreviewFrame(page), 'docs');
        if (label === 'Outline tool') await tokenPaint(scheme, docs.locator('.muxui-breadcrumbs a').first(), 'outlineColor', 'semantic.focus.ring');
        await openDocs();
        await waitForToolStyle(page, docs, tool, {
          label, stylePrefix, enabled: false, stage: `docs/${label}/disabled`, workerId,
        });
      }
      for (const selected of ['light', 'dark']) {
        await openDocs(`;backgrounds.value:${selected}`);
        await (await exactPreviewFrame(page)).waitForFunction((value) => [...document.querySelectorAll('style[id^="addon-backgrounds-docs-"]')]
          .some((element) => element.textContent.includes(value)), graphs[selected]['semantic.surface.canvas'].value);
        await tokenPaint(selected, docs.locator('.docs-story').first(), 'backgroundColor', 'semantic.surface.canvas');
        await snapshot(scheme, `docs/background-${selected}`, await exactPreviewFrame(page), 'docs', { selectedBackground: graphs[selected]['semantic.surface.canvas'] });
      }
      await openDocs();
      await docs.locator('style[id^="addon-backgrounds-docs-"]').first().waitFor({ state: 'detached' });
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
    const unique = new Map();
    for (const { scheme, state, nonToken, problems } of failures) {
      for (const paint of [...nonToken, ...problems]) unique.set(`${scheme}/${paint.property}/${paint.rgba ?? paint.value}`,
        { scheme, state, ...paint });
    }
    assert.equal(unique.size, 0, `Storybook painted colours outside canonical Mux tokens: ${JSON.stringify([...unique.values()].slice(0, 12))}`);
  } catch (error) {
    failure = error;
  } finally {
    try {
      await context?.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await server?.stop();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (failure) {
    const diagnosticError = failure instanceof Error ? failure : new Error(String(failure));
    diagnosticError.report = report;
    if (cleanupErrors.length > 0) diagnosticError.cleanupErrors = cleanupErrors.map(serializeError);
    throw diagnosticError;
  }
  if (cleanupErrors.length > 0) {
    const diagnosticError = new Error('Storybook colour worker cleanup failed', { cause: cleanupErrors[0] });
    diagnosticError.report = report;
    throw diagnosticError;
  }
  return report;
}

test('Storybook manager and docs paint only canonical Mux colours in light and dark', {
  timeout: 420000,
  skip: heavyAuditSkip('manager-colours'),
}, async (t) => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  const report = { storybookVersion: '10.5.10', tokenSource: 'catalog/tokens/default-theme.json', states: [] };
  const reportPath = process.env.MUXUI_STORYBOOK_COLORS_REPORT
    ?? resolve(colourAuditArtifactDirectory(), `muxui-storybook-colors-${process.pid}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  try {
    const workerTotal = workerCount('MUXUI_STORYBOOK_COLORS_WORKERS');
    const workerSchemes = workerTotal === 1 ? [['light', 'dark']] : [['light'], ['dark']];
    const workerResults = await Promise.allSettled(workerSchemes.map((schemes, workerId) => runColourWorker({
      browser,
      schemes,
      workerId,
    })));
    report.states = workerResults.flatMap((result) => result.status === 'fulfilled'
      ? result.value.states
      : result.reason?.report?.states ?? [])
      .sort((left, right) => `${left.scheme}/${left.state}/${left.scope}`.localeCompare(`${right.scheme}/${right.state}/${right.scope}`));
    const workerErrors = workerResults
      .map((result, workerId) => result.status === 'rejected'
        ? { workerId, ...serializeError(result.reason) }
        : null)
      .filter(Boolean);
    if (workerErrors.length > 0) {
      report.workerErrors = workerErrors;
      throw new AggregateError(
        workerResults.filter(({ status }) => status === 'rejected').map(({ reason }) => reason),
        `${workerErrors.length} Storybook colour worker(s) failed`,
      );
    }
    const expectedSchemes = [...new Set(workerSchemes.flat())].sort();
    assert.deepEqual(
      [...new Set(report.states.map(({ scheme }) => scheme))].sort(),
      expectedSchemes,
      'colour worker coverage must include every expected canonical scheme',
    );
    assert.deepEqual(
      colourStateSignatures(report.states, 'light'),
      colourStateSignatures(report.states, 'dark'),
      'colour worker coverage must preserve the same state and scope signatures in light and dark',
    );
    const failures = report.states.filter((state) => state.nonToken?.length || state.problems?.length);
    const unique = new Map();
    for (const { scheme, state, nonToken, problems } of failures) {
      for (const paint of [...nonToken, ...problems]) unique.set(`${scheme}/${paint.property}/${paint.rgba ?? paint.value}`,
        { scheme, state, ...paint });
    }
    assert.equal(unique.size, 0, `Storybook painted colours outside canonical Mux tokens: ${JSON.stringify([...unique.values()].slice(0, 12))}; full report: ${reportPath}`);
    t.diagnostic(`Audited ${report.states.length} deterministic light/dark states across ${workerTotal} worker(s); report: ${reportPath}`);
  } finally {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
});

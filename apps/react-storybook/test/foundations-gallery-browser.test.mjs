import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { chromium } from 'playwright-core';
import test from 'node:test';

const appRoot = resolve(import.meta.dirname, '..');
const host = '127.0.0.1';
const serverTimeoutMs = 90_000;
const storyTimeoutMs = 15_000;

function browserCandidates() {
  return [
    process.env.MUXUI_CHROME_EXECUTABLE,
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/google-chrome',
  ].filter(Boolean);
}

async function findBrowser() {
  for (const candidate of browserCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser location.
    }
  }
  return undefined;
}

async function reservePort() {
  const server = createServer();
  try {
    await new Promise((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen({ host, port: 0 }, resolvePromise);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object', 'could not determine the Storybook port');
    return address.port;
  } finally {
    if (server.listening) {
      await new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      });
    }
  }
}

function outputBuffer() {
  const chunks = [];
  return {
    append(chunk) {
      chunks.push(String(chunk));
      if (chunks.length > 60) chunks.shift();
    },
    read() {
      return chunks.join('').trim();
    },
  };
}

function terminateProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolvePromise();
    };
    child.once('exit', settle);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!settled) {
        child.kill('SIGKILL');
        child.once('exit', settle);
        setTimeout(settle, 1_000).unref();
      }
    }, 5_000).unref();
  });
}

async function startStorybook(port) {
  const stdout = outputBuffer();
  const stderr = outputBuffer();
  const child = spawn(resolve(appRoot, 'node_modules/.bin/storybook'), [
    'dev',
    '--ci',
    '--host',
    host,
    '--port',
    String(port),
  ], {
    cwd: appRoot,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let spawnError;
  let exit;
  child.once('error', (error) => {
    spawnError = error;
  });
  child.stdout.on('data', (chunk) => stdout.append(chunk));
  child.stderr.on('data', (chunk) => stderr.append(chunk));
  const exited = new Promise((resolvePromise) => {
    child.once('exit', (code, signal) => {
      exit = { code, signal };
      resolvePromise();
    });
  });
  const baseUrl = `http://${host}:${port}`;
  const deadline = Date.now() + serverTimeoutMs;
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`Could not start Storybook: ${spawnError.message}\n${stderr.read()}\n${stdout.read()}`);
      if (exit) throw new Error(`Storybook exited before readiness (${exit.code ?? 'null'}/${exit.signal ?? 'null'})\n${stderr.read()}\n${stdout.read()}`);
      try {
        const response = await fetch(`${baseUrl}/index.json`, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) {
          const index = await response.json();
          if (index?.entries && typeof index.entries === 'object') return { child, baseUrl, index };
        }
      } catch {
        // Storybook may still be compiling or restarting its Vite server.
      }
      await Promise.race([
        new Promise((resolvePromise) => setTimeout(resolvePromise, 100)),
        exited,
      ]);
    }
    throw new Error(`Storybook did not become ready within ${serverTimeoutMs}ms\n${stderr.read()}\n${stdout.read()}`);
  } catch (error) {
    await terminateProcess(child);
    throw error;
  }
}

test('Foundations Gallery supports navigation, modes, copy feedback, keyboard focus, and axe', { timeout: 150_000 }, async () => {
  const executablePath = await findBrowser();
  assert.ok(executablePath, 'Chrome or Chromium is required (set MUXUI_CHROME_EXECUTABLE to override)');

  let storybook;
  let browser;
  try {
    const started = await startStorybook(await reservePort());
    storybook = started.child;
    const gallery = Object.values(started.index.entries).find((entry) => entry.title === 'Foundations' && entry.name === 'Gallery');
    assert.ok(gallery, 'generated Foundations Gallery story must be discoverable');

    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(storyTimeoutMs);
    page.setDefaultNavigationTimeout(storyTimeoutMs);
    await page.goto(`${started.baseUrl}/iframe.html?id=${encodeURIComponent(gallery.id)}&viewMode=story`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-muxui-foundations-gallery="true"]');
    assert.equal(await page.locator('[data-muxui-foundations-category]').count(), 6);
    await page.addScriptTag({ content: axe.source });
    const initialAxe = await runAxe(page);
    assert.equal(initialAxe.violations.length, 0, initialAxe.violations.map(({ id, help, nodes }) => `${id}: ${help}\n${nodes.map(({ target }) => target.join(' ')).join('\n')}`).join('\n'));

    const heading = page.locator('.muxui-foundations-content h2');
    const search = page.locator('[data-muxui-foundations-search]');
    const status = page.locator('[data-muxui-foundations-copy-status]');
    assert.ok(await contrastRatio(status) >= 4.5, 'copy status must remain readable in light mode');
    const lightAlphaFill = page.locator('[data-muxui-foundations-color-fill="reference.color.scrim-default"]');
    assert.equal(await lightAlphaFill.textContent(), '', 'exact color fills must not contain overlaid labels');
    assert.ok((await lightAlphaFill.getAttribute('style'))?.includes('background-color'), 'alpha color must use an exact inline fill');
    assert.equal(await page.locator('[data-muxui-foundations-color-swatch="reference.color.scrim-default"]').textContent(), '', 'swatches must keep value text outside the fill');
    await page.locator('[data-muxui-foundations-category="radii-shadows"]').click();
    await waitForHeading(page, 'Radii and shadows');
    await search.fill('radius');
    assert.ok(await page.locator('[data-muxui-foundations-token]').count() > 0, 'search should retain matching radius rows');
    await search.fill('query-with-no-results');
    await page.waitForSelector('.muxui-foundations-empty');
    assert.equal(await page.locator('.muxui-foundations-empty').textContent(), 'No tokens match this search.');
    await search.fill('');

    for (const [axis, value] of [
      ['colorScheme', 'dark'],
      ['contrast', 'more'],
      ['density', 'compact'],
      ['motion', 'reduced'],
    ]) {
      const select = page.locator(`#muxui-foundations-${axis}`);
      await select.selectOption(value);
      assert.equal(await select.inputValue(), value, `${axis} control should update`);
    }
    assert.equal(await page.locator('[data-muxui-foundations-gallery="true"]').getAttribute('data-muxui-foundations-scheme'), 'dark');
    assert.equal(await page.locator('[data-muxui-foundations-gallery="true"]').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(0, 0, 0)');
    assert.ok(await contrastRatio(status) >= 4.5, 'copy status must remain readable in dark mode');

    await page.locator('[data-muxui-foundations-category="colors"]').click();
    await waitForHeading(page, 'Colors and semantic roles');
    const darkActionFill = page.locator('[data-muxui-foundations-color-fill="semantic.action.background"]');
    assert.ok(await darkActionFill.count() === 1, 'dark mode must retain the representative action color fill');
    assert.equal(await darkActionFill.textContent(), '', 'dark color fills must not contain overlaid labels');

    await page.locator('[data-muxui-foundations-category="component"]').click();
    await waitForHeading(page, 'Component tokens');
    await search.fill('component.button.background');
    assert.equal(await page.locator('[data-muxui-foundations-token]').count(), 1, 'component search should filter to background');
    await search.fill('component.button.radius');
    assert.equal(await page.locator('[data-muxui-foundations-token]').count(), 1, 'component search should filter to radius');
    await search.fill('');

    await page.locator('[data-muxui-foundations-category="typography"]').click();
    await waitForHeading(page, 'Typography');
    const lineHeightSample = page.locator('[data-muxui-foundations-typography-sample="semantic.typography.body-line-height"]');
    assert.equal(await lineHeightSample.locator('br').count(), 1, 'line-height specimens must show multiple lines');

    const spacingCategory = page.locator('[data-muxui-foundations-category="spacing"]');
    await spacingCategory.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-muxui-foundations-category')), 'spacing');
    await page.keyboard.press('Enter');
    await waitForHeading(page, 'Spacing and dimensions');
    assert.equal(
      await page.locator('[data-muxui-foundations-selected-value="semantic.control.padding-inline"]').textContent(),
      '7px',
      'compact density should render the canonical selected padding value',
    );

    await page.locator('[data-muxui-foundations-category="motion"]').click();
    await page.waitForSelector('[data-muxui-foundations-token="reference.duration.fast"]');
    assert.equal(
      await page.locator('[data-muxui-foundations-selected-value="reference.duration.fast"]').textContent(),
      '0ms',
      'reduced motion should render the canonical selected duration value',
    );
    const fullComparisonMark = page.locator('[data-muxui-foundations-comparison-motion-mark="motion-full"]');
    const reducedComparisonMark = page.locator('[data-muxui-foundations-comparison-motion-mark="motion-reduced"]');
    assert.equal(await fullComparisonMark.textContent(), '', 'full comparison mark must be aria-hidden visual-only');
    assert.equal(await reducedComparisonMark.textContent(), '', 'reduced comparison mark must be aria-hidden visual-only');
    assert.notEqual(
      await fullComparisonMark.evaluate((element) => getComputedStyle(element).inlineSize),
      await reducedComparisonMark.evaluate((element) => getComputedStyle(element).inlineSize),
      'full and reduced static trajectories must have different geometry',
    );
    assert.equal(await page.locator('[data-muxui-foundations-motion-comparison-fill="full"]').evaluate((element) => getComputedStyle(element).transitionDuration), '0.12s');
    assert.equal(await page.locator('[data-muxui-foundations-motion-comparison-fill="reduced"]').evaluate((element) => getComputedStyle(element).transitionDuration), '0s');
    const comparisonTrigger = page.locator('[data-muxui-foundations-motion-comparison-trigger]');
    const fullFill = page.locator('[data-muxui-foundations-motion-comparison-fill="full"]');
    const reducedFill = page.locator('[data-muxui-foundations-motion-comparison-fill="reduced"]');
    const initialFullTransform = await fullFill.evaluate((element) => getComputedStyle(element).transform);
    await comparisonTrigger.click();
    await page.waitForSelector('[data-muxui-foundations-motion-comparison-fill].is-running');
    await page.waitForTimeout(80);
    assert.notEqual(await fullFill.evaluate((element) => getComputedStyle(element).transform), initialFullTransform, 'full paired motion must travel after activation');
    assert.notEqual(await reducedFill.evaluate((element) => getComputedStyle(element).transform), initialFullTransform, 'reduced paired motion must jump immediately');
    await comparisonTrigger.click();
    await page.waitForSelector('[data-muxui-foundations-motion-comparison-fill].is-running');
    const motionTrigger = page.locator('[data-muxui-foundations-motion-trigger]').first();
    await motionTrigger.click();
    await page.waitForFunction(() => document.querySelector('[data-muxui-foundations-motion-fill].is-running'));
    assert.equal(await page.locator('[data-muxui-foundations-motion-timeline]').first().getAttribute('data-muxui-foundations-motion-duration'), '0ms');
    assert.equal(await page.locator('[data-muxui-foundations-motion-fill]').first().evaluate((element) => getComputedStyle(element).transitionDuration), '0s');

    await page.evaluate(() => {
      window.__muxuiFoundationsCopy = { clipboard: [], fallback: [] };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => { window.__muxuiFoundationsCopy.clipboard.push(value); throw new Error('deterministic clipboard rejection'); } },
      });
      document.execCommand = (command) => {
        window.__muxuiFoundationsCopy.fallback.push(command);
        return command === 'copy';
      };
    });
    const copyButton = page.locator('[data-muxui-foundations-copy]').first();
    const cssVariable = await copyButton.getAttribute('data-muxui-foundations-copy');
    await copyButton.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-muxui-foundations-copy')), cssVariable);
    await page.keyboard.press('Enter');
    await page.waitForFunction((value) => document.querySelector('[data-muxui-foundations-copy-status]')?.textContent === `Copied ${value}`, cssVariable);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-muxui-foundations-copy')), cssVariable, 'fallback copy must restore focus to its invoking button');
    assert.deepEqual(await page.evaluate(() => window.__muxuiFoundationsCopy.fallback), ['copy']);

    const axeResult = await runAxe(page);
    assert.equal(axeResult.violations.length, 0, axeResult.violations.map(({ id, help }) => `${id}: ${help}`).join('\n'));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Gallery must not overflow the mobile viewport');
    assert.ok(await page.locator('.muxui-foundations-categories').evaluate((element) => element.scrollWidth <= element.clientWidth), 'mobile category navigation must be fully visible');
    const mobileAxeResult = await runAxe(page);
    assert.equal(mobileAxeResult.violations.length, 0, mobileAxeResult.violations.map(({ id, help }) => `${id}: ${help}`).join('\n'));
    await context.close();
  } finally {
    await browser?.close();
    await terminateProcess(storybook);
  }
});

async function waitForHeading(page, expected) {
  await page.waitForFunction((value) => document.querySelector('.muxui-foundations-content h2')?.textContent === value, expected);
}

async function runAxe(page) {
  return page.evaluate(async () => {
    const deadline = performance.now() + 5_000;
    while (window.axe._running) {
      if (performance.now() >= deadline) throw new Error('Axe did not become idle before evaluation');
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
    }
    return window.axe.run(document.querySelector('[data-muxui-foundations-gallery="true"]'));
  });
}

async function contrastRatio(locator) {
  return locator.evaluate((element) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color) => {
      const channels = color.match(/[\d.]+/gu)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) throw new Error(`Could not parse computed color ${color}`);
      return 0.2126 * channel(channels[0]) + 0.7152 * channel(channels[1]) + 0.0722 * channel(channels[2]);
    };
    const background = element.closest('[data-muxui-foundations-gallery]');
    if (!background) throw new Error('Foundations gallery background is missing');
    const foregroundLuminance = luminance(getComputedStyle(element).color);
    const backgroundLuminance = luminance(getComputedStyle(background).backgroundColor);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  });
}

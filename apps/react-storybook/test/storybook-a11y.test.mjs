import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { chromium } from 'playwright-core';
import test from 'node:test';
import manifest from '../.storybook/generated/manifest.mjs';

const appRoot = resolve(import.meta.dirname, '..');
const host = '127.0.0.1';
const serverTimeoutMs = 90_000;
const storyTimeoutMs = 15_000;
// The gate intentionally executes 53 family proofs in both color schemes in
// addition to the full axe sweep and targeted interaction coverage. Keep a
// bounded budget for the repeated Storybook navigations on slower CI hosts.
const testTimeoutMs = 420_000;

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

function configuredPort() {
  const value = process.env.MUXUI_STORYBOOK_A11Y_PORT;
  if (value === undefined || value === '') return undefined;
  const port = Number(value);
  assert.ok(Number.isInteger(port) && port >= 0 && port <= 65_535, `MUXUI_STORYBOOK_A11Y_PORT must be a valid TCP port (or 0 for an ephemeral port), got ${value}`);
  return port;
}

async function reservePort(preferredPort) {
  const server = createServer();
  try {
    await new Promise((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen({ host, port: preferredPort ?? 0 }, resolvePromise);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object', 'Storybook test could not determine its reserved port');
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
      if (chunks.length > 80) chunks.shift();
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
  child.once('error', (error) => {
    spawnError = error;
  });
  child.stdout.on('data', (chunk) => stdout.append(chunk));
  child.stderr.on('data', (chunk) => stderr.append(chunk));

  const baseUrl = `http://${host}:${port}`;
  const deadline = Date.now() + serverTimeoutMs;
  let exit;
  const exited = new Promise((resolvePromise) => {
    child.once('exit', (code, signal) => {
      exit = { code, signal };
      resolvePromise();
    });
  });

  try {
    while (Date.now() < deadline) {
      if (spawnError) {
        throw new Error(`Could not start Storybook: ${spawnError.message}\n${stderr.read()}\n${stdout.read()}`);
      }
      if (exit) {
        throw new Error(`Storybook exited before readiness (code ${exit.code ?? 'null'}, signal ${exit.signal ?? 'null'})\n${stderr.read()}\n${stdout.read()}`);
      }
      try {
        const response = await fetch(`${baseUrl}/index.json`, {
          signal: AbortSignal.timeout(1_000),
        });
        if (response.ok) {
          const index = await response.json();
          if (index?.entries && typeof index.entries === 'object') return { child, baseUrl, stdout, stderr };
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

function storyFamily(entry) {
  return entry.title?.split('/').at(-1) ?? entry.id;
}

const INTERACTION_OPEN_LOCATORS = Object.freeze({
  DatePicker: { trigger: '.muxui-date-trigger', overlay: '.muxui-date-popover' },
  DateRangePicker: { trigger: '.muxui-date-trigger', overlay: '.muxui-date-popover' },
  ComboBox: { trigger: '.muxui-combo-box-trigger', overlay: '.muxui-combo-box-popover' },
  Select: { trigger: '.muxui-select-trigger', overlay: '.muxui-select-popover' },
});

function formatViolations(violations) {
  return violations.map((violation) => [
    `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}`,
    `  ${violation.helpUrl}`,
    ...violation.nodes.map((node) => `  target=${JSON.stringify(node.target)} html=${node.html}\n  ${node.failureSummary ?? ''}`),
  ].join('\n')).join('\n');
}

async function waitForStory(page, scheme) {
  await page.waitForFunction((expectedScheme) => {
    const isVisible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && bounds.width > 0
        && bounds.height > 0;
    };
    const surface = document.querySelector('.muxui-storybook-surface');
    const root = document.querySelector('#storybook-root');
    return Boolean(surface)
      && Boolean(root?.firstElementChild)
      && document.documentElement.getAttribute('data-muxui-color-scheme') === expectedScheme
      && !isVisible(document.querySelector('.sb-errordisplay'))
      && !isVisible(document.querySelector('.sb-preparing-story'));
  }, scheme, { timeout: storyTimeoutMs });
}

async function waitForDocumentAnimations(page) {
  await page.evaluate(async () => {
    document.documentElement.setAttribute('data-reduced-motion', 'true');
    await document.fonts.ready;
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    // Indeterminate components intentionally animate forever. Axe needs the
    // settled DOM and computed styles, not an unbounded wait for decorative
    // motion, so cancel the current visual animations before evaluation.
    document.getAnimations().forEach((animation) => animation.cancel());
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
  });
  // Overlay and lifecycle stories settle their open/close attributes on a
  // 300ms timer. Let that deterministic transition finish before axe samples
  // opacity-blended text colors.
  await page.waitForTimeout(350);
}

async function runAxe(page, contextSelector) {
  return page.evaluate(async (contextSelector) => {
    const deadline = performance.now() + 5_000;
    while (window.axe._running) {
      if (performance.now() >= deadline) throw new Error('Axe did not become idle before evaluation');
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
    }
    const context = contextSelector ? document.querySelector(contextSelector) : document.body;
    if (!context) throw new Error(`Axe context did not resolve: ${contextSelector}`);
    return window.axe.run(context);
  }, contextSelector);
}

async function waitForInteractionOpen(page, family) {
  const locators = INTERACTION_OPEN_LOCATORS[family];
  assert.ok(locators, `missing interaction-open locators for ${family}`);
  await page.waitForFunction(({ triggerSelector, overlaySelector }) => {
    const section = [...document.querySelectorAll('.muxui-storybook-state')]
      .find((candidate) => candidate.querySelector('h3')?.textContent === 'open');
    const trigger = section?.querySelector(triggerSelector);
    const overlay = document.querySelector(`${overlaySelector}:not([hidden])`);
    if (!trigger || trigger.getAttribute('aria-expanded') !== 'true' || !overlay) return false;
    const style = getComputedStyle(overlay);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }, { triggerSelector: locators.trigger, overlaySelector: locators.overlay }, { timeout: storyTimeoutMs });
}

async function waitForInteractionClosed(page, family) {
  const locators = INTERACTION_OPEN_LOCATORS[family];
  await page.waitForFunction(({ triggerSelector, overlaySelector }) => {
    const section = [...document.querySelectorAll('.muxui-storybook-state')]
      .find((candidate) => candidate.querySelector('h3')?.textContent === 'open');
    const trigger = section?.querySelector(triggerSelector);
    const overlay = document.querySelector(`${overlaySelector}:not([hidden])`);
    const root = document.querySelector('#storybook-root');
    const overlayHidden = !overlay || ['none', 'hidden'].includes(getComputedStyle(overlay).display)
      || getComputedStyle(overlay).visibility === 'hidden' || overlay.getAttribute('aria-hidden') === 'true';
    return trigger?.getAttribute('aria-expanded') !== 'true' && overlayHidden && root && !root.hasAttribute('inert');
  }, { triggerSelector: locators.trigger, overlaySelector: locators.overlay }, { timeout: storyTimeoutMs });
}

async function waitForBrowserProof(page, story, baseUrl, scheme) {
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
  await waitForStory(page, scheme);
  try {
    await page.waitForFunction(() => document.querySelector('[data-muxui-browser-proof-status="passed"], [data-muxui-browser-proof-status="failed"]'), { timeout: storyTimeoutMs });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      body: document.body?.innerText?.slice(0, 800),
      proofError: document.querySelector('[data-muxui-browser-proof-error]')?.getAttribute('data-muxui-browser-proof-error'),
      storybookError: document.querySelector('.sb-errordisplay')?.textContent?.slice(0, 800),
    })).catch(() => ({ url: '', body: '', storybookError: '' }));
    throw new Error(`${scheme} ${story.id} Browser proof did not complete: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  const proofErrorLocator = page.locator('[data-muxui-browser-proof-error]');
  const proofError = await proofErrorLocator.count() > 0
    ? await proofErrorLocator.first().getAttribute('data-muxui-browser-proof-error')
    : null;
  assert.equal(proofError, null, `${scheme} ${story.id} Browser proof failed: ${proofError ?? ''}`);
  const failure = await page.evaluate(() => {
    const element = document.querySelector('.sb-errordisplay');
    if (!element) return null;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
      ? element.textContent?.slice(0, 200) ?? 'Storybook error'
      : null;
  });
  assert.equal(failure, null, `${scheme} ${story.id} Browser proof reported a Storybook error: ${failure ?? ''}`);
}

/** Select can open while focus remains on Storybook's body; move focus into its dialog before Escape. */
async function focusInteractionOverlayForDismissal(page, family) {
  if (family !== 'Select') return;
  const locators = INTERACTION_OPEN_LOCATORS[family];
  await page.waitForFunction(({ overlaySelector }) => {
    const overlay = document.querySelector(`${overlaySelector}:not([hidden])`);
    return overlay instanceof HTMLElement && overlay.isConnected && overlay.getAttribute('tabindex') !== null;
  }, { overlaySelector: locators.overlay }, { timeout: storyTimeoutMs });
  await page.evaluate((overlaySelector) => {
    const overlay = document.querySelector(`${overlaySelector}:not([hidden])`);
    if (!(overlay instanceof HTMLElement)) throw new Error('Select interaction overlay disappeared before dismissal');
    overlay.focus({ preventScroll: true });
  }, locators.overlay);
  await page.waitForFunction((overlaySelector) => {
    const overlay = document.querySelector(`${overlaySelector}:not([hidden])`);
    return overlay instanceof HTMLElement && (overlay === document.activeElement || overlay.contains(document.activeElement));
  }, locators.overlay, { timeout: storyTimeoutMs });
}

async function assertDisabledAutocompleteKeyboard(page, baseUrl, story, scheme) {
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
  await waitForStory(page, scheme);
  const input = page.locator('.muxui-autocomplete input');
  await input.focus();
  await page.waitForFunction(() => {
    const list = document.querySelector('.muxui-autocomplete-list');
    return Boolean(list && !list.hasAttribute('hidden') && document.querySelectorAll('.muxui-autocomplete-option').length === 3);
  });
  const disabled = page.locator('.muxui-autocomplete-option[data-disabled="true"]').first();
  assert.equal(await disabled.getAttribute('aria-disabled'), 'true');
  await disabled.evaluate((node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  assert.equal(await input.inputValue(), '', 'disabled options do not select on pointer activation');

  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => {
      const inputElement = document.querySelector('.muxui-autocomplete input');
      const activeId = inputElement?.getAttribute('aria-activedescendant');
      const active = activeId ? document.getElementById(activeId) : null;
      return Boolean(active) && active.getAttribute('aria-disabled') !== 'true';
    });
    const activeId = await input.getAttribute('aria-activedescendant');
    const active = activeId ? page.locator(`#${activeId}`) : undefined;
    assert.ok(active, 'ArrowDown must expose an active option');
    assert.equal(await active.getAttribute('aria-disabled'), null, 'ArrowDown skips disabled options');
    assert.equal((await active.textContent())?.trim(), 'Enabled', 'the enabled option is the only keyboard target');
  }
}

async function assertPlatformModeCoverage(page, baseUrl, story, contrastStory) {
  await page.emulateMedia({
    colorScheme: 'light',
    contrast: 'more',
    forcedColors: 'active',
    reducedMotion: 'reduce',
  });
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent('colorScheme:light;direction:rtl')}`;
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
  await waitForStory(page, 'light');
  await waitForDocumentAnimations(page);
  const modes = await page.evaluate(() => ({
    direction: document.documentElement.getAttribute('data-muxui-direction'),
    dir: document.documentElement.dir,
    forcedColors: window.matchMedia('(forced-colors: active)').matches,
    highContrast: window.matchMedia('(prefers-contrast: more)').matches,
  }));
  assert.deepEqual(modes, {
    direction: 'rtl',
    dir: 'rtl',
    forcedColors: true,
    highContrast: true,
  }, 'Storybook must expose RTL, high-contrast, and forced-colors modes to the rendered story');
  await page.addScriptTag({ content: axe.source });
  const result = await runAxe(page);
  assert.equal(
    result.violations.length,
    0,
    `forced-colors/high-contrast/rtl ${story.id} has axe violations:\n${formatViolations(result.violations)}`,
  );
  const highContrastStoryUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(contrastStory.id)}&viewMode=story&globals=${encodeURIComponent('colorScheme:light;direction:rtl')}`;
  await page.goto(highContrastStoryUrl, { waitUntil: 'domcontentloaded' });
  await waitForStory(page, 'light');
  await waitForDocumentAnimations(page);
  const forcedContrastStyle = await page.evaluate(() => {
    const selected = [...document.querySelectorAll('.muxui-storybook-state')]
      .find((section) => section.querySelector('h3')?.textContent === 'selected');
    const indicator = selected?.querySelector('.muxui-checkbox-indicator');
    if (!indicator) throw new Error('Checkbox selected indicator missing from high-contrast proof');
    const style = getComputedStyle(indicator);
    return { borderWidth: style.borderTopWidth, borderColor: style.borderTopColor, backgroundColor: style.backgroundColor };
  });
  await page.emulateMedia({ contrast: 'no-preference', forcedColors: 'none' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForStory(page, 'light');
  await waitForDocumentAnimations(page);
  const standardContrastStyle = await page.evaluate(() => {
    const selected = [...document.querySelectorAll('.muxui-storybook-state')]
      .find((section) => section.querySelector('h3')?.textContent === 'selected');
    const indicator = selected?.querySelector('.muxui-checkbox-indicator');
    if (!indicator) throw new Error('Checkbox selected indicator missing from standard-contrast proof');
    const style = getComputedStyle(indicator);
    return { borderWidth: style.borderTopWidth, borderColor: style.borderTopColor, backgroundColor: style.backgroundColor };
  });
  assert.notDeepEqual(forcedContrastStyle, standardContrastStyle, 'prefers-contrast/forced-colors must change a real component style');
  await page.emulateMedia({
    colorScheme: 'light',
    contrast: 'no-preference',
    forcedColors: 'none',
    reducedMotion: 'no-preference',
  });
}

test('NumberField sizing story computes fit-content, 12rem, and full container widths', { timeout: testTimeoutMs }, async () => {
  const executablePath = await findBrowser();
  assert.ok(executablePath, 'Chrome or Chromium is required for the NumberField sizing browser proof (set MUXUI_CHROME_EXECUTABLE to override)');

  const preferredPort = configuredPort();
  let port;
  try {
    port = await reservePort(preferredPort);
  } catch (error) {
    if (preferredPort === undefined) throw error;
    port = await reservePort(undefined);
  }

  let storybook;
  let browser;
  try {
    const started = await startStorybook(port);
    storybook = started.child;
    const baseUrl = started.baseUrl;
    const index = await fetch(`${baseUrl}/index.json`).then(async (response) => {
      assert.ok(response.ok, `Storybook index request failed with HTTP ${response.status}`);
      return response.json();
    });
    const story = Object.values(index.entries).find((entry) => (
      entry.type === 'story' && entry.name === 'Sizing' && storyFamily(entry) === 'NumberField'
    ));
    assert.ok(story, 'Storybook must expose the NumberField Sizing story');

    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1_000, height: 800 } });
    page.setDefaultNavigationTimeout(storyTimeoutMs);
    page.setDefaultTimeout(storyTimeoutMs);
    const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent('colorScheme:light')}`;
    await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
    await waitForStory(page, 'light');
    await waitForDocumentAnimations(page);

    const measurements = await page.evaluate(() => {
      const expectedFixedWidth = 12 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const fields = [...document.querySelectorAll('.muxui-number-field-sizing-example .muxui-number-field')].map((field) => {
        const style = getComputedStyle(field);
        return {
          customProperty: style.getPropertyValue('--muxui-component-number-field-width').trim(),
          width: field.getBoundingClientRect().width,
          parentWidth: field.parentElement?.getBoundingClientRect().width ?? 0,
        };
      });
      return { expectedFixedWidth, fields };
    });
    assert.equal(measurements.fields.length, 3);
    assert.equal(measurements.fields[0].customProperty, '');
    assert.ok(measurements.fields[0].width > 0);
    assert.ok(measurements.fields[0].width < measurements.fields[2].width, 'default fit-content should not fill the container');
    assert.equal(measurements.fields[1].customProperty, '12rem');
    assert.ok(
      Math.abs(measurements.fields[1].width - measurements.expectedFixedWidth) < 0.5,
      `fixed width should be 12rem (${measurements.expectedFixedWidth}px), got ${measurements.fields[1].width}px`,
    );
    assert.equal(measurements.fields[2].customProperty, '100%');
    assert.ok(Math.abs(measurements.fields[2].width - measurements.fields[2].parentWidth) < 0.5, 'full width should match its container');
    await page.close();
  } finally {
    await browser?.close();
    await terminateProcess(storybook);
  }
});

test('all Mux UI React Storybook families are axe-clean in light and dark', { timeout: testTimeoutMs }, async () => {
  const executablePath = await findBrowser();
  assert.ok(executablePath, 'Chrome or Chromium is required for the Storybook a11y gate (set MUXUI_CHROME_EXECUTABLE to override)');

  const preferredPort = configuredPort();
  let port;
  try {
    port = await reservePort(preferredPort);
  } catch (error) {
    if (preferredPort === undefined) throw error;
    port = await reservePort(undefined);
  }

  let storybook;
  let browser;
  try {
    const started = await startStorybook(port);
    storybook = started.child;
    const baseUrl = started.baseUrl;
    const index = await fetch(`${baseUrl}/index.json`).then(async (response) => {
      assert.ok(response.ok, `Storybook index request failed with HTTP ${response.status}`);
      return response.json();
    });
    const stories = Object.values(index.entries).filter(({ type }) => type === 'story');
    const defaults = stories.filter(({ name }) => name === 'Default');
    const states = stories.filter(({ name }) => name === 'States');
    const browserProofs = stories.filter(({ name }) => name?.toLowerCase() === 'browser proof');
    const linkIconComposition = stories.find((story) => story.name === 'Icon composition' && storyFamily(story) === 'Link');
    const buttonStates = states.find((story) => storyFamily(story) === 'Button');
    const checkboxStates = states.find((story) => storyFamily(story) === 'Checkbox');
    const autocompleteInteraction = stories.find(({ name }) => name === 'Disabled items keyboard navigation');
    const expectedFamilies = new Set(manifest.families.map(({ family }) => family));
    assert.equal(expectedFamilies.size, 53, 'the generated Storybook manifest must contain 53 families');
    assert.equal(defaults.length, expectedFamilies.size, 'Storybook must expose one Default story for every family');
    assert.equal(states.length, expectedFamilies.size, 'Storybook must expose one States story for every family');
    assert.equal(browserProofs.length, expectedFamilies.size, 'Storybook must expose one Browser proof story for every family');
    assert.deepEqual(new Set(defaults.map(storyFamily)), expectedFamilies, 'Default stories must cover every manifest family');
    assert.deepEqual(new Set(states.map(storyFamily)), expectedFamilies, 'States stories must cover every manifest family');
    assert.deepEqual(new Set(browserProofs.map(storyFamily)), expectedFamilies, 'Browser proof stories must cover every manifest family');
    assert.deepEqual(
      new Set(defaults.map(storyFamily)),
      new Set(states.map(storyFamily)),
      'Default and States stories must cover the same families',
    );
    assert.ok(autocompleteInteraction, 'Storybook must expose the disabled-item Autocomplete interaction story');
    assert.ok(linkIconComposition, 'Storybook must expose the Link icon composition story');
    assert.ok(buttonStates, 'Storybook must expose the Button States story for focused platform-mode proof');
    assert.ok(checkboxStates, 'Storybook must expose the Checkbox States story for focused contrast proof');

    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(storyTimeoutMs);
    page.setDefaultTimeout(storyTimeoutMs);

    for (const scheme of ['light', 'dark']) {
      await assertDisabledAutocompleteKeyboard(page, baseUrl, autocompleteInteraction, scheme);
      for (const story of [...defaults, ...states, linkIconComposition]) {
        try {
          const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
          await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
          await waitForStory(page, scheme);
          await waitForDocumentAnimations(page);
          await page.addScriptTag({ content: axe.source });
          const family = storyFamily(story);
          const interactionOpen = story.name === 'States' && INTERACTION_OPEN_LOCATORS[family];
          if (interactionOpen) {
            await waitForInteractionOpen(page, family);
            const portalResult = await runAxe(page, `${interactionOpen.overlay}:not([hidden])`);
            assert.equal(
              portalResult.violations.length,
              0,
              `${scheme} ${story.id} (${family}) open portal has axe violations:\n${formatViolations(portalResult.violations)}`,
            );
            const controlledOpen = manifest.families.find(({ family: name }) => name === family)?.props.includes('open');
            if (!controlledOpen) {
              await focusInteractionOverlayForDismissal(page, family);
              await page.keyboard.press('Escape');
              await waitForInteractionClosed(page, family);
            }
          }
          const result = await runAxe(page);
          assert.equal(
            result.violations.length,
            0,
            `${scheme} ${story.id} (${storyFamily(story)}) has axe violations:\n${formatViolations(result.violations)}`,
          );
        } catch (error) {
          if (error?.name === 'AssertionError') throw error;
          const diagnostics = await page.evaluate(() => ({
            body: document.body?.innerText?.slice(0, 1_000),
            html: document.documentElement?.outerHTML?.slice(0, 2_000),
            root: document.querySelector('#storybook-root')?.outerHTML?.slice(0, 2_000),
            surfaceCount: document.querySelectorAll('.muxui-storybook-surface').length,
            rootChildCount: document.querySelector('#storybook-root')?.childElementCount,
          })).catch(() => ({ body: '', html: '' }));
          throw new Error(
            `${scheme} ${story.id} (${storyFamily(story)}) failed to render before axe evaluation: ${error.message}\n`
              + `body=${diagnostics.body}\nroot=${diagnostics.root}\n`
              + `surfaceCount=${diagnostics.surfaceCount} rootChildCount=${diagnostics.rootChildCount}\n`
              + `html=${diagnostics.html}`,
            { cause: error },
          );
        }
      }
    }
    for (const story of browserProofs) {
      for (const scheme of ['light', 'dark']) {
        await waitForBrowserProof(page, story, baseUrl, scheme);
      }
    }
    await assertPlatformModeCoverage(page, baseUrl, buttonStates, checkboxStates);
    await page.close();
  } finally {
    await browser?.close();
    await terminateProcess(storybook);
  }
});

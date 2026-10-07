import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import axe from 'axe-core';
import { chromium } from 'playwright-core';
import test from 'node:test';
import manifest from '../.storybook/generated/manifest.mjs';
import { assertNoPageFailures, recordPageFailure } from './storybook-audit-failures.mjs';
import { selectedStorybookFamilies, storybookSelectionLabel } from './storybook-family-selection.mjs';
import { resolveStorybookPageSelection, validateRuntimeStoryPages } from './storybook-page-selection.mjs';

const appRoot = resolve(import.meta.dirname, '..');
const host = '127.0.0.1';
const serverTimeoutMs = 90_000;
const storyTimeoutMs = 15_000;
const testTimeoutMs = 420_000;
// The full gate covers every family in both schemes plus interaction, lifecycle,
// platform-mode, and Button-matrix proofs on a single CI worker.
const fullAuditTimeoutMs = 600_000;

// CI shards large page selections by family (ci-impact storyShardPageBudget),
// so a scoped run stays well inside the full-audit cap.
function pageScopedAuditTimeout() {
  const { proof, pages } = resolveStorybookPageSelection();
  if (!['story', 'component', 'theme'].includes(proof)) return fullAuditTimeoutMs;
  return Math.min(fullAuditTimeoutMs, 120_000 + pages.length * 6_000);
}

function workerCount(variable) {
  const value = process.env[variable] ?? '1';
  assert.ok(value === '1' || value === '2', `${variable} must be 1 or 2, got ${value}`);
  return Number(value);
}

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
    child.once('close', settle);
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

function throwIfAborted(signal) {
  if (signal.aborted) throw signal.reason ?? new Error('Storybook audit was aborted');
}

function createAuditResources(signal) {
  let storybook;
  let browser;
  let closed = false;
  let closePromise;

  const closeResources = () => {
    if (closePromise) return closePromise;
    closed = true;
    closePromise = (async () => {
      try {
        await browser?.close();
      } finally {
        await terminateProcess(storybook);
      }
    })();
    return closePromise;
  };
  const closeOnAbort = () => {
    void closeResources().catch(() => {});
  };
  signal.addEventListener('abort', closeOnAbort, { once: true });

  return {
    async trackStorybook(child) {
      storybook = child;
      if (closed) await terminateProcess(child);
    },
    async trackBrowser(instance) {
      browser = instance;
      if (closed) await instance.close();
    },
    close() {
      signal.removeEventListener('abort', closeOnAbort);
      return closeResources();
    },
  };
}

async function startStorybook(port, signal, { spawnProcess = spawn, fetchIndex = fetch } = {}) {
  throwIfAborted(signal);
  const stdout = outputBuffer();
  const stderr = outputBuffer();
  const child = spawnProcess(resolve(appRoot, 'node_modules/.bin/storybook'), [
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
      throwIfAborted(signal);
      if (spawnError) {
        throw new Error(`Could not start Storybook: ${spawnError.message}\n${stderr.read()}\n${stdout.read()}`);
      }
      if (exit) {
        throw new Error(`Storybook exited before readiness (code ${exit.code ?? 'null'}, signal ${exit.signal ?? 'null'})\n${stderr.read()}\n${stdout.read()}`);
      }
      try {
        const response = await fetchIndex(`${baseUrl}/index.json`, {
          signal: AbortSignal.any([AbortSignal.timeout(1_000), signal]),
        });
        if (response.ok) {
          const index = await response.json();
          if (index?.entries && typeof index.entries === 'object') {
            throwIfAborted(signal);
            return { child, baseUrl, stdout, stderr };
          }
        }
      } catch (error) {
        if (signal.aborted) throw error;
        // Storybook may still be compiling or restarting its Vite server.
      }
      await Promise.race([
        delay(100, undefined, { signal }),
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
    // Finish finite transitions so motion reaches its settled styles. Cancel
    // only indeterminate animations, which otherwise never become idle.
    document.getAnimations().forEach((animation) => {
      try {
        if (animation.effect?.getTiming?.().iterations === Infinity) animation.cancel();
        else animation.finish();
      } catch {
        animation.cancel();
      }
    });
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
  });
}

async function waitForLifecycleReadiness(page) {
  await page.waitForFunction(() => {
    const showcase = document.querySelector('.muxui-storybook-lifecycle-showcase');
    const activeTransition = showcase?.querySelector(
      '[data-muxui-storybook-lifecycle] .muxui-storybook-transition-status',
    );
    return !activeTransition || activeTransition.getAttribute('data-muxui-storybook-transition') === 'open';
  }, undefined, { timeout: storyTimeoutMs });
}

async function runAxe(page, contextSelector, options) {
  return page.evaluate(async ({ contextSelector, options }) => {
    const deadline = performance.now() + 5_000;
    while (window.axe._running) {
      if (performance.now() >= deadline) throw new Error('Axe did not become idle before evaluation');
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
    }
    const context = contextSelector ? document.querySelector(contextSelector) : document.body;
    if (!context) throw new Error(`Axe context did not resolve: ${contextSelector}`);
    return window.axe.run(context, options);
  }, { contextSelector, options });
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

async function assertButtonMatrix(page, baseUrl, story, scheme) {
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
  await waitForStory(page, scheme);
  await waitForDocumentAnimations(page);
  await page.addScriptTag({ content: axe.source });
  const buttonCount = await page.locator('.muxui-button-matrix .muxui-button').count();
  assert.equal(buttonCount, 21, `${scheme} Button Matrix must render 21 supported tuples`);
  const result = await runAxe(page, '.muxui-button-matrix');
  assert.equal(result.violations.length, 0, `${scheme} Button Matrix has axe violations:\n${formatViolations(result.violations)}`);

  const geometry = await page.evaluate(() => Object.fromEntries(['sm', 'md', 'lg'].map((size) => {
    const button = document.querySelector(`.muxui-button[data-variant="primary"][data-size="${size}"]`);
    if (!button) throw new Error(`missing primary ${size} button`);
    const rect = button.getBoundingClientRect();
    return [size, { width: rect.width, height: rect.height }];
  })));
  assert.ok(geometry.sm.height < geometry.md.height && geometry.md.height < geometry.lg.height, `${scheme} Button Matrix heights must increase sm < md < lg: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.sm.width < geometry.md.width && geometry.md.width < geometry.lg.width, `${scheme} Button Matrix widths must increase sm < md < lg: ${JSON.stringify(geometry)}`);

  const destructive = await page.locator('.muxui-button[data-variant="danger"][data-size="md"]').evaluate((button) => {
    const style = getComputedStyle(button);
    return { color: style.color, backgroundColor: style.backgroundColor };
  });
  const ratio = contrastRatio(destructive.color, destructive.backgroundColor);
  assert.ok(ratio >= 4.5, `${scheme} danger Button contrast must meet 4.5:1, got ${ratio.toFixed(2)}:1 (${JSON.stringify(destructive)})`);

  if (scheme === 'dark') {
    const pressedBackgrounds = [];
    for (const variant of ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse']) {
      const selector = `.muxui-button[data-variant="${variant}"][data-size="md"]`;
      const button = page.locator(selector);
      const box = await button.boundingBox();
      assert.ok(box, `missing ${variant} button bounds`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForFunction((buttonSelector) => document.querySelector(buttonSelector)?.hasAttribute('data-pressed') === true, selector);
      pressedBackgrounds.push(await button.evaluate((element) => getComputedStyle(element).backgroundColor));
      await page.mouse.up();
    }
    assert.ok(new Set(pressedBackgrounds).size >= 4, `dark Button Matrix pressed recipes must stay distinct: ${JSON.stringify(pressedBackgrounds)}`);
  }
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
  if (!contrastStory) return;
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

async function assertDialogLifecycleDismissal(page, baseUrl, story, scheme) {
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
  await waitForStory(page, scheme);
  await waitForDocumentAnimations(page);
  await waitForLifecycleReadiness(page);

  const enteringSection = '[data-muxui-storybook-lifecycle="entering"]';
  const enteringDialog = '.muxui-dialog.muxui-storybook-lifecycle-dialog-entering';
  const trigger = page.locator(`${enteringSection} .muxui-dialog-trigger`);
  const close = page.locator(`${enteringDialog} .muxui-dialog-close`);
  const waitForOpen = (selector) => page.waitForFunction((dialogSelector) => {
    const dialog = document.querySelector(dialogSelector);
    const backdrop = dialog?.closest('.muxui-dialog-backdrop');
    if (!backdrop || backdrop.hasAttribute('data-exiting')) return false;
    const style = getComputedStyle(backdrop);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }, selector, { timeout: storyTimeoutMs });
  const waitForClosed = () => page.waitForFunction(
    () => document.querySelector('.muxui-dialog-backdrop') === null,
    undefined,
    { timeout: storyTimeoutMs },
  );

  await waitForOpen(enteringDialog);
  await close.click();
  await waitForClosed();

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await trigger.click();
    await waitForOpen(enteringDialog);
    await close.click();
    await waitForClosed();
  }

  await trigger.click();
  await waitForOpen(enteringDialog);
  await page.keyboard.press('Escape');
  await waitForClosed();

  const lifecycleSelect = page.locator('[data-muxui-storybook-lifecycle-select="Dialog"]');
  await lifecycleSelect.selectOption('exiting');
  await page.waitForFunction(() => document.querySelector(
    '[data-muxui-storybook-lifecycle="exiting"] .muxui-storybook-transition-status',
  )?.getAttribute('data-muxui-storybook-transition') === 'open', undefined, { timeout: storyTimeoutMs });
  const exitingTrigger = page.locator('[data-muxui-storybook-lifecycle="exiting"] .muxui-dialog-trigger');
  const exitingDialog = '.muxui-dialog.muxui-storybook-lifecycle-dialog-exiting';
  await waitForOpen(exitingDialog);
  await page.locator(`${exitingDialog} .muxui-dialog-close`).click();
  await waitForClosed();
  await exitingTrigger.click();
  await waitForOpen(exitingDialog);
  await page.keyboard.press('Escape');
  await waitForClosed();
}

test('Storybook startup cancellation terminates its child process', { timeout: 5_000 }, async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = (signal) => {
    child.signalCode = signal;
    queueMicrotask(() => child.emit('exit', null, signal));
    return true;
  };
  const controller = new AbortController();
  let markRequestStarted;
  const requestStarted = new Promise((resolvePromise) => {
    markRequestStarted = resolvePromise;
  });
  const startup = startStorybook(1, controller.signal, {
    spawnProcess: () => child,
    fetchIndex: (_url, { signal }) => {
      markRequestStarted();
      return new Promise((_resolvePromise, reject) => {
        const rejectOnAbort = () => reject(signal.reason ?? new Error('Storybook request was aborted'));
        if (signal.aborted) rejectOnAbort();
        else signal.addEventListener('abort', rejectOnAbort, { once: true });
      });
    },
  });

  await requestStarted;
  controller.abort(new Error('test cancellation'));
  await assert.rejects(startup, /test cancellation/u);
  assert.equal(child.signalCode, 'SIGTERM');
});

test('audit cleanup closes a browser acquired after timeout exactly once', async () => {
  const controller = new AbortController();
  const resources = createAuditResources(controller.signal);
  let closeCount = 0;
  controller.abort(new Error('test timeout'));

  await resources.trackBrowser({ close: async () => { closeCount += 1; } });
  await resources.close();
  await resources.close();
  assert.equal(closeCount, 1);
});

test('NumberField sizing story computes fit-content, 12rem, and full container widths', {
  timeout: testTimeoutMs,
  skip: (() => {
    const selection = resolveStorybookPageSelection();
    if (selection.proof === 'full') return false;
    if (!['story', 'component'].includes(selection.proof)) return `not part of ${selection.proof} proof`;
    return selection.pages.some(({ family, name }) => family === 'NumberField' && name === 'Sizing')
      ? false
      : 'NumberField sizing page is outside the selected Storybook pages';
  })(),
}, async (t) => {
  const resources = createAuditResources(t.signal);
  try {
    throwIfAborted(t.signal);
    const executablePath = await findBrowser();
    throwIfAborted(t.signal);
    assert.ok(executablePath, 'Chrome or Chromium is required for the NumberField sizing browser proof (set MUXUI_CHROME_EXECUTABLE to override)');

    const preferredPort = configuredPort();
    let port;
    try {
      port = await reservePort(preferredPort);
    } catch (error) {
      if (preferredPort === undefined) throw error;
      port = await reservePort(undefined);
    }
    throwIfAborted(t.signal);

    const started = await startStorybook(port, t.signal);
    await resources.trackStorybook(started.child);
    throwIfAborted(t.signal);
    const baseUrl = started.baseUrl;
    const index = await fetch(`${baseUrl}/index.json`, {
      signal: AbortSignal.any([AbortSignal.timeout(10_000), t.signal]),
    }).then(async (response) => {
      assert.ok(response.ok, `Storybook index request failed with HTTP ${response.status}`);
      return response.json();
    });
    throwIfAborted(t.signal);
    const story = Object.values(index.entries).find((entry) => (
      entry.type === 'story' && entry.name === 'Sizing' && storyFamily(entry) === 'NumberField'
    ));
    assert.ok(story, 'Storybook must expose the NumberField Sizing story');

    const browser = await chromium.launch({ executablePath, headless: true });
    await resources.trackBrowser(browser);
    throwIfAborted(t.signal);
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
    await resources.close();
  }
});

async function runA11yWorker({
  browser,
  baseUrl,
  defaults,
  states,
  browserProofs,
  linkIconComposition,
  buttonMatrix,
  autocompleteInteraction,
  schemes,
  signal,
  onProgress,
  failures,
}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(storyTimeoutMs);
  page.setDefaultTimeout(storyTimeoutMs);
  const coverage = [];
  try {
    for (const scheme of schemes) {
      throwIfAborted(signal);
      onProgress?.(`${scheme} interaction and matrix proof`);
      if (autocompleteInteraction) {
        try {
          await assertDisabledAutocompleteKeyboard(page, baseUrl, autocompleteInteraction, scheme);
          coverage.push(`${scheme}:autocomplete-keyboard`);
        } catch (error) {
          recordPageFailure(failures, { scheme, id: autocompleteInteraction.id, family: 'Autocomplete', check: 'keyboard' }, error, { signal });
        }
      }
      if (buttonMatrix) {
        try {
          await assertButtonMatrix(page, baseUrl, buttonMatrix, scheme);
          coverage.push(`${scheme}:button-matrix`);
        } catch (error) {
          recordPageFailure(failures, { scheme, id: buttonMatrix.id, family: 'Button', check: 'matrix' }, error, { signal });
        }
      }
      for (const story of [...defaults, ...states, ...(linkIconComposition ? [linkIconComposition] : [])]) {
        try {
          throwIfAborted(signal);
          onProgress?.(`${scheme} ${storyFamily(story)} ${story.name}`);
          const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
          await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
          await waitForStory(page, scheme);
          await waitForDocumentAnimations(page);
          const family = storyFamily(story);
          if (story.name === 'States') await waitForLifecycleReadiness(page);
          await page.addScriptTag({ content: axe.source });
          const interactionOpen = story.name === 'States' && INTERACTION_OPEN_LOCATORS[family];
          if (interactionOpen) {
            await waitForInteractionOpen(page, family);
            await waitForDocumentAnimations(page);
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
          coverage.push(`${scheme}:axe:${story.id}`);
          if (story.name === 'States' && family === 'Dialog') {
            await assertDialogLifecycleDismissal(page, baseUrl, story, scheme);
            coverage.push(`${scheme}:dialog-state-dismissal`);
          }
        } catch (error) {
          const failure = { scheme, id: story.id, family: storyFamily(story) };
          if (signal.aborted || error?.name === 'AssertionError') {
            recordPageFailure(failures, failure, error, { signal });
            continue;
          }
          const diagnostics = await page.evaluate(() => ({
            body: document.body?.innerText?.slice(0, 1_000),
            html: document.documentElement?.outerHTML?.slice(0, 2_000),
            root: document.querySelector('#storybook-root')?.outerHTML?.slice(0, 2_000),
            surfaceCount: document.querySelectorAll('.muxui-storybook-surface').length,
            rootChildCount: document.querySelector('#storybook-root')?.childElementCount,
          })).catch(() => ({ body: '', html: '' }));
          recordPageFailure(failures, failure, new Error(
            `${scheme} ${story.id} (${storyFamily(story)}) failed to render before axe evaluation: ${error.message}\n`
              + `body=${diagnostics.body}\nroot=${diagnostics.root}\n`
              + `surfaceCount=${diagnostics.surfaceCount} rootChildCount=${diagnostics.rootChildCount}\n`
              + `html=${diagnostics.html}`,
            { cause: error },
          ), { signal });
        }
      }
      for (const story of browserProofs) {
        throwIfAborted(signal);
        onProgress?.(`${scheme} ${storyFamily(story)} Browser proof`);
        try {
          await waitForBrowserProof(page, story, baseUrl, scheme);
          coverage.push(`${scheme}:browser-proof:${story.id}`);
        } catch (error) {
          recordPageFailure(failures, { scheme, id: story.id, family: storyFamily(story), check: 'browser proof' }, error, { signal });
        }
      }
    }
    return coverage;
  } finally {
    try {
      await context.close();
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}

async function runSelectedPageA11yWorker({ browser, baseUrl, stories, schemes, signal, onProgress, failures }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(storyTimeoutMs);
  page.setDefaultTimeout(storyTimeoutMs);
  const coverage = [];
  try {
    for (const scheme of schemes) {
      for (const story of stories) {
        throwIfAborted(signal);
        const family = storyFamily(story);
        onProgress?.(`${scheme} ${family}/${story.name}`);
        try {
          if (story.exportName === 'BrowserProof') {
            await waitForBrowserProof(page, story, baseUrl, scheme);
            coverage.push(`${scheme}:browser-proof:${story.id}`);
          } else if (story.name === 'Disabled items keyboard navigation') {
            await assertDisabledAutocompleteKeyboard(page, baseUrl, story, scheme);
            coverage.push(`${scheme}:autocomplete-keyboard:${story.id}`);
          } else if (story.name === 'Variant × size') {
            await assertButtonMatrix(page, baseUrl, story, scheme);
            coverage.push(`${scheme}:button-matrix:${story.id}`);
          }

          const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
          await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
          await waitForStory(page, scheme);
          await waitForDocumentAnimations(page);
          if (story.name === 'States') await waitForLifecycleReadiness(page);
          await page.addScriptTag({ content: axe.source });

          const interactionOpen = story.name === 'States' && INTERACTION_OPEN_LOCATORS[family];
          if (interactionOpen) {
            await waitForInteractionOpen(page, family);
            await waitForDocumentAnimations(page);
            const portalResult = await runAxe(page, `${interactionOpen.overlay}:not([hidden])`);
            assert.equal(
              portalResult.violations.length,
              0,
              `${scheme} ${story.id} open portal has axe violations:\n${formatViolations(portalResult.violations)}`,
            );
            coverage.push(`${scheme}:open-portal:${story.id}`);
            const controlledOpen = manifest.families.find(({ family: name }) => name === family)?.props.includes('open');
            if (!controlledOpen) {
              // The full-page axe run below happens after dismissal; check open-state
              // page contrast first so component proof covers everything theme proof does.
              const openContrast = await runAxe(page, undefined, { runOnly: { type: 'rule', values: ['color-contrast'] } });
              assert.equal(
                openContrast.violations.length,
                0,
                `${scheme} ${story.id} (${family}) open state has colour contrast violations:\n${formatViolations(openContrast.violations)}`,
              );
              await focusInteractionOverlayForDismissal(page, family);
              await page.keyboard.press('Escape');
              await waitForInteractionClosed(page, family);
            }
          }

          const result = await runAxe(page);
          assert.equal(
            result.violations.length,
            0,
            `${scheme} ${story.id} (${family}) has axe violations:\n${formatViolations(result.violations)}`,
          );
          coverage.push(`${scheme}:axe:${story.id}`);
          if (story.name === 'States' && family === 'Dialog') {
            await assertDialogLifecycleDismissal(page, baseUrl, story, scheme);
            coverage.push(`${scheme}:dialog-state-dismissal:${story.id}`);
          }
        } catch (error) {
          recordPageFailure(failures, { scheme, id: story.id, family }, error, { signal });
        }
      }
    }
    return coverage;
  } finally {
    try {
      await context.close();
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}

function expectedSelectedPageCoverage(stories, schemes) {
  return schemes.flatMap((scheme) => stories.flatMap((story) => [
    `${scheme}:axe:${story.id}`,
    ...(story.exportName === 'BrowserProof' ? [`${scheme}:browser-proof:${story.id}`] : []),
    ...(story.name === 'Disabled items keyboard navigation' ? [`${scheme}:autocomplete-keyboard:${story.id}`] : []),
    ...(story.name === 'Variant × size' ? [`${scheme}:button-matrix:${story.id}`] : []),
    ...(story.name === 'States' && INTERACTION_OPEN_LOCATORS[storyFamily(story)] ? [`${scheme}:open-portal:${story.id}`] : []),
    ...(story.name === 'States' && storyFamily(story) === 'Dialog' ? [`${scheme}:dialog-state-dismissal:${story.id}`] : []),
  ])).sort();
}

test('selected Mux UI React Storybook pages are axe-clean in light and dark', {
  timeout: pageScopedAuditTimeout(),
  skip: (() => {
    const { proof, pages } = resolveStorybookPageSelection();
    // The full audit lists only the Block pages here; its family test covers the rest.
    if (proof === 'full') return pages.length > 0 ? false : 'the catalog has no Block pages';
    return ['story', 'component'].includes(proof) ? false : `not part of ${proof} proof`;
  })(),
}, async (t) => {
  const selection = resolveStorybookPageSelection();
  const resources = createAuditResources(t.signal);
  const startedAt = performance.now();
  let activeProof = 'browser discovery';
  const reportAbort = () => {
    t.diagnostic(`[storybook-a11y] aborted after ${Math.round(performance.now() - startedAt)}ms during ${activeProof}`);
  };
  t.signal.addEventListener('abort', reportAbort, { once: true });
  let successMessage;

  try {
    throwIfAborted(t.signal);
    assert.ok(selection.pages.length > 0, 'selected Storybook a11y proof must include at least one page');
    const executablePath = await findBrowser();
    throwIfAborted(t.signal);
    assert.ok(executablePath, 'Chrome or Chromium is required for the Storybook a11y gate (set MUXUI_CHROME_EXECUTABLE to override)');

    const preferredPort = configuredPort();
    let port;
    try {
      port = await reservePort(preferredPort);
    } catch (error) {
      if (preferredPort === undefined) throw error;
      port = await reservePort(undefined);
    }
    throwIfAborted(t.signal);

    activeProof = 'Storybook startup';
    const started = await startStorybook(port, t.signal);
    await resources.trackStorybook(started.child);
    throwIfAborted(t.signal);
    const baseUrl = started.baseUrl;
    activeProof = 'reading Storybook index';
    const index = await fetch(`${baseUrl}/index.json`, {
      signal: AbortSignal.any([AbortSignal.timeout(10_000), t.signal]),
    }).then(async (response) => {
      assert.ok(response.ok, `Storybook index request failed with HTTP ${response.status}`);
      return response.json();
    });
    throwIfAborted(t.signal);
    const stories = validateRuntimeStoryPages(selection, index);
    assert.equal(stories.length, selection.pages.length, 'runtime Storybook pages must exactly match the selected page IDs');

    activeProof = 'launching Chrome';
    const browser = await chromium.launch({ executablePath, headless: true });
    await resources.trackBrowser(browser);
    throwIfAborted(t.signal);
    const workerTotal = workerCount('MUXUI_STORYBOOK_A11Y_WORKERS');
    const workerSchemes = workerTotal === 1 ? [['light', 'dark']] : [['light'], ['dark']];
    activeProof = 'selected page a11y workers';
    const failures = [];
    const workerResults = await Promise.allSettled(workerSchemes.map((schemes) => runSelectedPageA11yWorker({
      browser,
      baseUrl,
      stories,
      schemes,
      signal: t.signal,
      onProgress: (message) => { activeProof = message; },
      failures,
    })));
    throwIfAborted(t.signal);
    const workerErrors = workerResults.filter(({ status }) => status === 'rejected');
    if (workerErrors.length > 0) {
      throw new AggregateError(
        workerErrors.map(({ reason }) => reason),
        `${workerErrors.length} selected Storybook page a11y worker(s) failed`,
      );
    }
    assertNoPageFailures('selected Storybook page a11y audit', failures);
    const actualCoverage = workerResults.flatMap(({ value }) => value).sort();
    const expectedCoverage = expectedSelectedPageCoverage(stories, workerSchemes.flat());
    assert.deepEqual(actualCoverage, expectedCoverage, 'selected Storybook page coverage must account for every page, scheme, and applicable proof');

    const buttonStates = stories.find((story) => story.name === 'States' && storyFamily(story) === 'Button');
    const checkboxStates = stories.find((story) => story.name === 'States' && storyFamily(story) === 'Checkbox');
    if (buttonStates || checkboxStates) {
      activeProof = 'selected platform-mode coverage';
      const platformContext = await browser.newContext();
      const platformPage = await platformContext.newPage();
      platformPage.setDefaultNavigationTimeout(storyTimeoutMs);
      platformPage.setDefaultTimeout(storyTimeoutMs);
      try {
        await assertPlatformModeCoverage(platformPage, baseUrl, buttonStates ?? checkboxStates, checkboxStates);
      } finally {
        try {
          await platformContext.close();
        } catch (error) {
          if (!t.signal.aborted) throw error;
        }
      }
    }
    throwIfAborted(t.signal);
    successMessage = `partial ${selection.proof} proof: ${selection.label} (${stories.length} pages, light+dark, ${workerTotal} worker${workerTotal === 1 ? '' : 's'}`;
  } finally {
    activeProof = 'cleanup';
    try {
      await resources.close();
    } finally {
      t.signal.removeEventListener('abort', reportAbort);
    }
  }
  throwIfAborted(t.signal);
  console.log(`[storybook-a11y] ${successMessage}, ${Math.round(performance.now() - startedAt)}ms)`);
});

async function runThemeContrastWorker({ browser, baseUrl, stories, schemes, signal, onProgress, failures }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(storyTimeoutMs);
  page.setDefaultTimeout(storyTimeoutMs);
  const coverage = [];
  try {
    for (const scheme of schemes) {
      for (const story of stories) {
        throwIfAborted(signal);
        const family = storyFamily(story);
        onProgress?.(`${scheme} ${family}/${story.name} contrast`);
        try {
          const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
          await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
          await waitForStory(page, scheme);
          await waitForDocumentAnimations(page);
          if (story.name === 'States') {
            await waitForLifecycleReadiness(page);
            if (INTERACTION_OPEN_LOCATORS[family]) {
              await waitForInteractionOpen(page, family);
              await waitForDocumentAnimations(page);
            }
          }
          await page.addScriptTag({ content: axe.source });
          const result = await runAxe(page, undefined, {
            runOnly: { type: 'rule', values: ['color-contrast'] },
          });
          assert.equal(
            result.violations.length,
            0,
            `${scheme} ${story.id} (${family}) has colour contrast violations:\n${formatViolations(result.violations)}`,
          );
          coverage.push(`${scheme}:${story.id}:color-contrast`);
        } catch (error) {
          recordPageFailure(failures, { scheme, id: story.id, family }, error, { signal });
        }
      }
    }
    return coverage;
  } finally {
    try {
      await context.close();
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}

test('all selected Storybook pages meet theme contrast in light and dark', {
  timeout: pageScopedAuditTimeout(),
  skip: (() => {
    const { proof } = resolveStorybookPageSelection();
    return proof === 'theme' ? false : `not part of ${proof} proof`;
  })(),
}, async (t) => {
  const selection = resolveStorybookPageSelection();
  const resources = createAuditResources(t.signal);
  const startedAt = performance.now();
  let activeProof = 'browser discovery';
  const reportAbort = () => {
    t.diagnostic(`[storybook-theme-contrast] aborted after ${Math.round(performance.now() - startedAt)}ms during ${activeProof}`);
  };
  t.signal.addEventListener('abort', reportAbort, { once: true });
  let successMessage;

  try {
    throwIfAborted(t.signal);
    assert.ok(selection.pages.length > 0, 'theme contrast proof must include at least one consumer page');
    assert.ok(selection.pages.every(({ exportName }) => exportName !== 'BrowserProof'), 'theme contrast proof excludes behavior-only BrowserProof stories');
    const executablePath = await findBrowser();
    throwIfAborted(t.signal);
    assert.ok(executablePath, 'Chrome or Chromium is required for the Storybook theme contrast gate (set MUXUI_CHROME_EXECUTABLE to override)');

    const preferredPort = configuredPort();
    let port;
    try {
      port = await reservePort(preferredPort);
    } catch (error) {
      if (preferredPort === undefined) throw error;
      port = await reservePort(undefined);
    }
    throwIfAborted(t.signal);

    activeProof = 'Storybook startup';
    const started = await startStorybook(port, t.signal);
    await resources.trackStorybook(started.child);
    throwIfAborted(t.signal);
    const baseUrl = started.baseUrl;
    activeProof = 'reading Storybook index';
    const index = await fetch(`${baseUrl}/index.json`, {
      signal: AbortSignal.any([AbortSignal.timeout(10_000), t.signal]),
    }).then(async (response) => {
      assert.ok(response.ok, `Storybook index request failed with HTTP ${response.status}`);
      return response.json();
    });
    throwIfAborted(t.signal);
    const stories = validateRuntimeStoryPages(selection, index);
    assert.equal(stories.length, selection.pages.length, 'runtime Storybook pages must exactly match the selected theme IDs');

    activeProof = 'launching Chrome';
    const browser = await chromium.launch({ executablePath, headless: true });
    await resources.trackBrowser(browser);
    throwIfAborted(t.signal);
    const workerTotal = workerCount('MUXUI_STORYBOOK_A11Y_WORKERS');
    const workerSchemes = workerTotal === 1 ? [['light', 'dark']] : [['light'], ['dark']];
    activeProof = 'theme contrast workers';
    const failures = [];
    const workerResults = await Promise.allSettled(workerSchemes.map((schemes) => runThemeContrastWorker({
      browser,
      baseUrl,
      stories,
      schemes,
      signal: t.signal,
      onProgress: (message) => { activeProof = message; },
      failures,
    })));
    throwIfAborted(t.signal);
    const workerErrors = workerResults.filter(({ status }) => status === 'rejected');
    if (workerErrors.length > 0) {
      throw new AggregateError(
        workerErrors.map(({ reason }) => reason),
        `${workerErrors.length} Storybook theme contrast worker(s) failed`,
      );
    }
    assertNoPageFailures('Storybook theme contrast audit', failures);
    const actualCoverage = workerResults.flatMap(({ value }) => value).sort();
    const expectedCoverage = ['light', 'dark'].flatMap((scheme) => stories.map(({ id }) => `${scheme}:${id}:color-contrast`)).sort();
    assert.deepEqual(actualCoverage, expectedCoverage, 'theme contrast coverage must include every selected consumer page and scheme');
    throwIfAborted(t.signal);
    successMessage = `partial theme proof: ${selection.label} (${stories.length} pages, both schemes, ${workerTotal} worker${workerTotal === 1 ? '' : 's'}`;
  } finally {
    activeProof = 'cleanup';
    try {
      await resources.close();
    } finally {
      t.signal.removeEventListener('abort', reportAbort);
    }
  }
  throwIfAborted(t.signal);
  console.log(`[storybook-theme-contrast] ${successMessage}, ${Math.round(performance.now() - startedAt)}ms)`);
});

test('all Mux UI React Storybook families are axe-clean in light and dark', {
  timeout: fullAuditTimeoutMs,
}, async (t) => {
  const resources = createAuditResources(t.signal);
  const startedAt = performance.now();
  let activeProof = 'browser discovery';
  const reportAbort = () => {
    t.diagnostic(`[storybook-a11y] aborted after ${Math.round(performance.now() - startedAt)}ms during ${activeProof}`);
  };
  t.signal.addEventListener('abort', reportAbort, { once: true });
  let successMessage;

  try {
    throwIfAborted(t.signal);
    // Block (pattern) pages have no Default, States, or BrowserProof stories; the page-level audit covers them.
    const blockFamilies = new Set((manifest.patterns ?? []).map(({ family }) => family));
    const selectedFamilies = selectedStorybookFamilies()?.filter((family) => !blockFamilies.has(family)) ?? null;
    if (selectedFamilies?.length === 0) return t.skip('every selected family is a Block, covered by the selected-page audit');
    const focused = selectedFamilies !== null;
    const executablePath = await findBrowser();
    throwIfAborted(t.signal);
    assert.ok(executablePath, 'Chrome or Chromium is required for the Storybook a11y gate (set MUXUI_CHROME_EXECUTABLE to override)');

    const preferredPort = configuredPort();
    let port;
    try {
      port = await reservePort(preferredPort);
    } catch (error) {
      if (preferredPort === undefined) throw error;
      port = await reservePort(undefined);
    }
    throwIfAborted(t.signal);

    activeProof = 'Storybook startup';
    const started = await startStorybook(port, t.signal);
    await resources.trackStorybook(started.child);
    throwIfAborted(t.signal);
    const baseUrl = started.baseUrl;
    activeProof = 'reading Storybook index';
    const index = await fetch(`${baseUrl}/index.json`, {
      signal: AbortSignal.any([AbortSignal.timeout(10_000), t.signal]),
    }).then(async (response) => {
      assert.ok(response.ok, `Storybook index request failed with HTTP ${response.status}`);
      return response.json();
    });
    throwIfAborted(t.signal);
    const stories = Object.values(index.entries).filter(({ type, title }) => type === 'story' && !blockFamilies.has(storyFamily({ title })));
    const familyFilter = focused ? new Set(selectedFamilies) : null;
    const isSelected = (story) => !familyFilter || familyFilter.has(storyFamily(story));
    const defaults = stories.filter((story) => story.name === 'Default' && isSelected(story));
    const states = stories.filter((story) => story.name === 'States' && isSelected(story));
    const browserProofs = stories.filter((story) => story.name?.toLowerCase() === 'browser proof' && isSelected(story));
    const linkIconComposition = stories.find((story) => story.name === 'Icon composition'
      && storyFamily(story) === 'Link' && isSelected(story));
    const buttonMatrix = stories.find((story) => story.exportName === 'Matrix'
      && storyFamily(story) === 'Button' && isSelected(story));
    const buttonStates = states.find((story) => storyFamily(story) === 'Button');
    const checkboxStates = states.find((story) => storyFamily(story) === 'Checkbox');
    const autocompleteInteraction = stories.find(({ name }) => name === 'Disabled items keyboard navigation'
      && isSelected({ title: 'Mux UI React/Autocomplete' }));
    const expectedFamilies = new Set(selectedFamilies ?? manifest.families.map(({ family }) => family));
    assert.ok(expectedFamilies.size > 0, 'the generated Storybook manifest must contain the current union');
    assert.equal(defaults.length, expectedFamilies.size, 'Storybook must expose one selected Default story for every family');
    assert.equal(states.length, expectedFamilies.size, 'Storybook must expose one selected States story for every family');
    assert.equal(browserProofs.length, expectedFamilies.size, 'Storybook must expose one selected Browser proof story for every family');
    assert.deepEqual(new Set(defaults.map(storyFamily)), expectedFamilies, 'Default stories must cover every selected family');
    assert.deepEqual(new Set(states.map(storyFamily)), expectedFamilies, 'States stories must cover every selected family');
    assert.deepEqual(new Set(browserProofs.map(storyFamily)), expectedFamilies, 'Browser proof stories must cover every selected family');
    assert.deepEqual(
      new Set(defaults.map(storyFamily)),
      new Set(states.map(storyFamily)),
      'Default and States stories must cover the same families',
    );
    if (!focused || expectedFamilies.has('Autocomplete')) assert.ok(autocompleteInteraction, 'Storybook must expose the disabled-item Autocomplete interaction story');
    if (!focused || expectedFamilies.has('Link')) assert.ok(linkIconComposition, 'Storybook must expose the Link icon composition story');
    if (!focused || expectedFamilies.has('Button')) assert.ok(buttonStates, 'Storybook must expose the Button States story for focused platform-mode proof');
    if (!focused || expectedFamilies.has('Checkbox')) assert.ok(checkboxStates, 'Storybook must expose the Checkbox States story for focused contrast proof');
    if (!focused || expectedFamilies.has('Button')) assert.ok(buttonMatrix, 'Storybook must expose the Button Variant × size Matrix story');

    activeProof = 'launching Chrome';
    const browser = await chromium.launch({ executablePath, headless: true });
    await resources.trackBrowser(browser);
    throwIfAborted(t.signal);
    const workerTotal = workerCount('MUXUI_STORYBOOK_A11Y_WORKERS');
    const workerSchemes = workerTotal === 1 ? [['light', 'dark']] : [['light'], ['dark']];
    activeProof = 'a11y workers';
    const failures = [];
    const workerResults = await Promise.allSettled(workerSchemes.map((schemes) => runA11yWorker({
      browser,
      baseUrl,
      defaults,
      states,
      browserProofs,
      linkIconComposition,
      buttonMatrix,
      autocompleteInteraction,
      schemes,
      signal: t.signal,
      onProgress: (message) => { activeProof = message; },
      failures,
    })));
    throwIfAborted(t.signal);
    const workerErrors = workerResults.filter(({ status }) => status === 'rejected');
    if (workerErrors.length > 0) {
      throw new AggregateError(
        workerErrors.map(({ reason }) => reason),
        `${workerErrors.length} Storybook a11y worker(s) failed`,
      );
    }
    assertNoPageFailures('Storybook family a11y audit', failures);
    const workerCoverage = workerResults.map(({ value }) => value);

    const expectedCoverage = workerSchemes.flatMap((schemes) => schemes.flatMap((scheme) => [
      ...(autocompleteInteraction ? [`${scheme}:autocomplete-keyboard`] : []),
      ...(buttonMatrix ? [`${scheme}:button-matrix`] : []),
      ...(expectedFamilies.has('Dialog') ? [`${scheme}:dialog-state-dismissal`] : []),
      ...[...defaults, ...states, ...(linkIconComposition ? [linkIconComposition] : [])].map((story) => `${scheme}:axe:${story.id}`),
      ...browserProofs.map((story) => `${scheme}:browser-proof:${story.id}`),
    ])).sort();
    const actualCoverage = workerCoverage.flat().sort();
    assert.deepEqual(actualCoverage, expectedCoverage, 'a11y worker coverage must account for every family, scheme, and proof');

    if (buttonStates || checkboxStates) {
      activeProof = 'platform-mode coverage';
      const platformContext = await browser.newContext();
      const platformPage = await platformContext.newPage();
      platformPage.setDefaultNavigationTimeout(storyTimeoutMs);
      platformPage.setDefaultTimeout(storyTimeoutMs);
      try {
        await assertPlatformModeCoverage(platformPage, baseUrl, buttonStates ?? checkboxStates, checkboxStates);
      } finally {
        try {
          await platformContext.close();
        } catch (error) {
          if (!t.signal.aborted) throw error;
        }
      }
    }
    throwIfAborted(t.signal);
    successMessage = `${focused ? 'partial' : 'full'} proof: ${storybookSelectionLabel(selectedFamilies)} (${expectedFamilies.size} families, ${workerTotal} worker${workerTotal === 1 ? '' : 's'}`;
  } finally {
    activeProof = 'cleanup';
    try {
      await resources.close();
    } finally {
      t.signal.removeEventListener('abort', reportAbort);
    }
  }
  throwIfAborted(t.signal);
  console.log(`[storybook-a11y] ${successMessage}, ${Math.round(performance.now() - startedAt)}ms)`);
});

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
// platform-mode, and Button-matrix proofs, with one browser context per scheme.
const fullAuditTimeoutMs = 600_000;

// CI shards large page selections by family (ci-impact storyShardPageBudget),
// so a scoped run stays well inside the full-audit cap.
function pageScopedAuditTimeout() {
  const { proof, pages } = resolveStorybookPageSelection();
  if (!['story', 'component', 'theme'].includes(proof)) return fullAuditTimeoutMs;
  return Math.min(fullAuditTimeoutMs, 120_000 + pages.length * 6_000);
}

// Two workers run the light and dark schemes in parallel browser contexts; 1 runs both serially.
function workerCount(variable) {
  const value = process.env[variable] ?? '2';
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
  // Its trigger does not announce expansion, so the open state waits for the popup alone.
  CommandPalette: { trigger: '.muxui-command-palette__trigger', overlay: '.muxui-command-palette__popup', announcesExpanded: false },
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
    document.documentElement.setAttribute('data-muxui-motion', 'reduced');
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
  await page.waitForFunction(({ triggerSelector, overlaySelector, announcesExpanded }) => {
    const section = [...document.querySelectorAll('.muxui-storybook-state')]
      .find((candidate) => candidate.querySelector('h3')?.textContent === 'open');
    const trigger = section?.querySelector(triggerSelector);
    const overlay = document.querySelector(`${overlaySelector}:not([hidden])`);
    if (!trigger || (announcesExpanded && trigger.getAttribute('aria-expanded') !== 'true') || !overlay) return false;
    const style = getComputedStyle(overlay);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }, { triggerSelector: locators.trigger, overlaySelector: locators.overlay, announcesExpanded: locators.announcesExpanded !== false }, { timeout: storyTimeoutMs });
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

// The nested submenu lives on a page of its own, because the state matrix opens its popups together and React Aria hides the
// rest while one is open, which leaves a submenu there unreachable to axe and to a person. Real key presses open the menu, move
// into the submenu and back, close each level, and move on, and each step checks the names and where focus is.
async function assertNestedMenuKeyboard(page, baseUrl, story, scheme) {
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
  await waitForStory(page, scheme);
  await waitForDocumentAnimations(page);
  await page.addScriptTag({ content: axe.source });
  const trigger = page.locator('#menu-nested-trigger');
  const actions = page.getByRole('menu', { name: 'Actions' });
  const share = page.getByRole('menu', { name: 'Share' });
  const focused = (expected, message) => page.waitForFunction(
    (text) => (document.activeElement?.id === text || document.activeElement?.textContent?.trim() === text),
    expected,
    { timeout: storyTimeoutMs },
  ).catch(async (error) => {
    const active = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160));
    throw new Error(`${scheme}: ${message}: focus is on ${active}`, { cause: error });
  });
  const expanded = (name) => page.getByRole('menuitem', { name }).getAttribute('aria-expanded');
  const openToSubmenu = async () => {
    await page.keyboard.press('ArrowDown');
    await actions.waitFor();
    await focused('Rename', 'the keyboard opens the menu on its first item');
    await page.keyboard.press('ArrowDown');
    await focused('Share', 'ArrowDown moves to the submenu item');
    await page.keyboard.press('ArrowRight');
    await share.waitFor();
    await focused('Copy link', 'the forward arrow moves into the submenu');
  };

  await trigger.focus();
  assert.equal(await page.getByRole('menu').count(), 0, `${scheme}: the menu is closed before it is opened`);
  await openToSubmenu();
  // Naming: the top menu and the submenu each have their own name, and the submenu's item says it opens one.
  assert.equal(await page.getByRole('menu').count(), 2, `${scheme}: two menus are open, named Actions and Share`);
  assert.equal(await page.getByRole('menuitem', { name: 'Share' }).getAttribute('aria-haspopup'), 'menu', `${scheme}: the submenu item announces a menu`);
  assert.equal(await expanded('Share'), 'true', `${scheme}: the submenu item is expanded while its menu is open`);
  await waitForDocumentAnimations(page);
  for (const name of ['Actions', 'Share']) {
    const result = await runAxe(page, `[role="menu"][aria-label="${name}"]`);
    assert.equal(result.violations.length, 0, `${scheme}: the open ${name} menu has axe violations:\n${formatViolations(result.violations)}`);
  }
  // The backward arrow closes the submenu and returns to its item, with the menu above it still open.
  await page.keyboard.press('ArrowLeft');
  await share.waitFor({ state: 'detached' });
  await focused('Share', 'the backward arrow returns to the submenu item');
  assert.equal(await expanded('Share'), 'false', `${scheme}: the submenu item is collapsed once its menu closes`);
  assert.equal(await actions.count(), 1, `${scheme}: the menu above stays open`);
  // Escape closes one level at a time: the submenu first, then the menu, which hands focus back to its trigger.
  await page.keyboard.press('ArrowRight');
  await share.waitFor();
  await page.keyboard.press('Escape');
  await share.waitFor({ state: 'detached' });
  await focused('Share', 'Escape from the submenu returns to its item');
  assert.equal(await actions.count(), 1, `${scheme}: Escape from the submenu leaves the menu above open`);
  await page.keyboard.press('Escape');
  await actions.waitFor({ state: 'detached' });
  await focused('menu-nested-trigger', 'Escape from the menu restores focus to its trigger');
  // Tab from inside the submenu closes the whole tree and moves on from the trigger by the page's own order.
  await openToSubmenu();
  await page.keyboard.press('Tab');
  await actions.waitFor({ state: 'detached' });
  await share.waitFor({ state: 'detached' });
  await focused('menu-nested-after', 'Tab from the submenu moves on from the trigger');
  // And back: Shift+Tab reaches the trigger, which opens the menu again from the keyboard.
  await page.keyboard.press('Shift+Tab');
  await focused('menu-nested-trigger', 'Shift+Tab returns to the trigger');
  await page.keyboard.press('Enter');
  await actions.waitFor();
  await page.keyboard.press('Escape');
  await actions.waitFor({ state: 'detached' });
  await focused('menu-nested-trigger', 'focus is restored after a second opening');
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

// Their States rows can each open a modal, so only one may ever be open there.
const MODAL_STATE_FAMILIES = Object.freeze(['Dialog', 'AlertDialog', 'CommandPalette', 'Lightbox']);

/**
 * Controls set `open` to false and then true on the mounted States story. Exactly one modal mounts, it holds keyboard
 * focus, and Tab and Shift+Tab stay inside it. Several open modals would each make the others inert and leave focus
 * on the body, which aria-expanded alone would not show.
 */
async function assertModalControlsOpen(page, baseUrl, story, scheme) {
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
  await waitForStory(page, scheme);
  await waitForDocumentAnimations(page);
  await waitForLifecycleReadiness(page);

  const openModals = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    .filter((modal) => !modal.closest('[data-exiting]')).length);
  const focusInsideTheModal = () => page.evaluate(() => {
    const modals = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((modal) => !modal.closest('[data-exiting]'));
    return modals.length === 1 && modals[0].contains(document.activeElement);
  });
  const setOpen = (open) => page.evaluate(([storyId, updatedArgs]) => {
    window.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId, updatedArgs });
  }, [story.id, { open }]);
  const assertOneFocusedModal = async (label) => {
    await page.waitForFunction(() => {
      const modals = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((modal) => !modal.closest('[data-exiting]'));
      return modals.length === 1 && modals[0].contains(document.activeElement);
    }, undefined, { timeout: storyTimeoutMs }).catch(async () => {
      assert.fail(`${scheme} ${story.id} ${label}: expected one open modal holding focus, found ${await openModals()} (focus inside: ${await focusInsideTheModal()})`);
    });
    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      assert.equal(await focusInsideTheModal(), true, `${scheme} ${story.id} ${label}: ${key} left the modal`);
    }
  };

  await assertOneFocusedModal('on load');
  await setOpen(false);
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    .some((modal) => !modal.closest('[data-exiting]')), undefined, { timeout: storyTimeoutMs });
  await setOpen(true);
  await assertOneFocusedModal('after open false then true');
}

async function assertDialogLifecycleDismissal(page, baseUrl, story, scheme) {
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story&globals=${encodeURIComponent(`colorScheme:${scheme}`)}`;
  await page.goto(storyUrl, { waitUntil: 'domcontentloaded' });
  await waitForStory(page, scheme);
  await waitForDocumentAnimations(page);
  await waitForLifecycleReadiness(page);

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
  // A lifecycle row's Dialog opens on its own, closes from its button, reopens from its trigger, and closes on Escape.
  const dismissAndReopen = async (state, cycles) => {
    const dialog = `.muxui-dialog.muxui-storybook-lifecycle-dialog-${state}`;
    const trigger = page.locator(`[data-muxui-storybook-lifecycle="${state}"] .muxui-dialog-trigger`);
    const close = page.locator(`${dialog} .muxui-dialog-close`);
    await waitForOpen(dialog);
    await close.click();
    await waitForClosed();
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      await trigger.click();
      await waitForOpen(dialog);
      await close.click();
      await waitForClosed();
    }
    await trigger.click();
    await waitForOpen(dialog);
    await page.keyboard.press('Escape');
    await waitForClosed();
  };
  const selectRow = async (state) => {
    await page.locator('[data-muxui-storybook-lifecycle-select="Dialog"]').selectOption(state);
    await page.waitForFunction((row) => document.querySelector(
      `[data-muxui-storybook-lifecycle="${row}"] .muxui-storybook-transition-status`,
    )?.getAttribute('data-muxui-storybook-transition') === 'open', state, { timeout: storyTimeoutMs });
  };

  // The open row is the selected one on load, then the selector hands the page to each transition row in turn.
  await dismissAndReopen('open', 1);
  await selectRow('entering');
  await dismissAndReopen('entering', 2);
  await selectRow('exiting');
  await dismissAndReopen('exiting', 0);
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

// Every Docs page carries the typed API reference as Storybook's own interface. These are the pages where it is largest or hardest.
const typedReferenceFamilies = ['IconButton', 'Dialog', 'Resizable', 'Text', 'Virtualizer', 'SwitchField', 'TextArea', 'CommandPalette', 'Select'];

/** The typed-reference families this run proves: all of them for a full or chrome run, else the selected ones that are among them. */
function typedReferenceSelection() {
  if (process.env.MUXUI_STORYBOOK_UI_PROOF === 'skip') return { skip: 'Storybook own-interface proof is skipped by MUXUI_STORYBOOK_UI_PROOF=skip' };
  const { proof } = resolveStorybookPageSelection();
  if (proof === 'full' || proof === 'chrome') return { families: typedReferenceFamilies };
  if (proof !== 'component') return { skip: `not part of ${proof} proof` };
  const families = typedReferenceFamilies.filter((family) => (selectedStorybookFamilies() ?? []).includes(family));
  return families.length > 0 ? { families } : { skip: 'no selected family is among the typed reference pages' };
}

/** A Storybook, a browser and a way to find a family's Docs page, for the typed reference proofs. The resources close with the test. */
async function typedReferenceSession(signal, resources) {
  throwIfAborted(signal);
  const executablePath = await findBrowser();
  throwIfAborted(signal);
  assert.ok(executablePath, 'Chrome or Chromium is required for the typed reference proof (set MUXUI_CHROME_EXECUTABLE to override)');
  let port;
  try {
    port = await reservePort(configuredPort());
  } catch {
    port = await reservePort(undefined);
  }
  const started = await startStorybook(port, signal);
  await resources.trackStorybook(started.child);
  const index = await fetch(`${started.baseUrl}/index.json`, {
    signal: AbortSignal.any([AbortSignal.timeout(10_000), signal]),
  }).then((response) => response.json());
  const browser = await chromium.launch({ executablePath, headless: true });
  await resources.trackBrowser(browser);
  return {
    baseUrl: started.baseUrl,
    browser,
    docsUrl(family, scheme = 'light', hash = '') {
      const entry = Object.values(index.entries).find((candidate) => candidate.type === 'docs' && storyFamily(candidate) === family);
      assert.ok(entry, `${family}: Storybook must expose its Docs page`);
      return `${started.baseUrl}/iframe.html?viewMode=docs&id=${encodeURIComponent(entry.id)}&globals=${encodeURIComponent(`colorScheme:${scheme}`)}${hash}`;
    },
    async newPage(viewport = { width: 1_190, height: 900 }) {
      const page = await browser.newPage({ viewport });
      page.setDefaultNavigationTimeout(storyTimeoutMs * 4);
      page.setDefaultTimeout(storyTimeoutMs * 4);
      return page;
    },
  };
}

/**
 * Embedded stories and code blocks settle after the reference appears and move what is below them, so a proof that follows a
 * link to a target near the end of the page waits for the page to stop growing first.
 */
const waitForStableHeight = (page) => page.waitForFunction(() => new Promise((resolveStable) => {
  let height = document.documentElement.scrollHeight;
  let stableFrames = 0;
  const frame = () => {
    const next = document.documentElement.scrollHeight;
    stableFrames = next === height ? stableFrames + 1 : 0;
    height = next;
    if (stableFrames >= 30) resolveStable(true);
    else requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}));

test('Storybook typed API reference is axe-clean, keyboard-operable and reflows in light and dark', {
  timeout: testTimeoutMs,
  skip: typedReferenceSelection().skip ?? false,
}, async (t) => {
  const { families } = typedReferenceSelection();
  const resources = createAuditResources(t.signal);
  try {
    const session = await typedReferenceSession(t.signal, resources);
    const page = await session.newPage();
    for (const family of families) {
      for (const scheme of ['light', 'dark']) {
        throwIfAborted(t.signal);
        const label = `${family}/${scheme}`;
        await page.setViewportSize({ width: 1_190, height: 900 });
        await page.goto(session.docsUrl(family, scheme), { waitUntil: 'domcontentloaded' });
        await page.locator('[data-typed-reference]').waitFor();
        await page.addScriptTag({ content: axe.source });
        await waitForDocumentAnimations(page);
        await waitForStableHeight(page);

        // Keyboard: from the reference's first heading, Tab reaches a link of the exports index, then a collapsed summary,
        // and Enter on each does what it names.
        await page.evaluate(() => {
          const start = document.querySelector('#api-exports');
          start.tabIndex = -1;
          start.focus();
        });
        const reached = [];
        for (let presses = 0; presses < 600 && !reached.includes('summary'); presses += 1) {
          await page.keyboard.press('Tab');
          const where = await page.evaluate(() => {
            const active = document.activeElement;
            if (!active?.closest('[data-typed-reference]')) return 'outside';
            if (active.matches('summary')) return 'summary';
            if (active.matches('a[href]')) return 'link';
            return active.localName;
          });
          assert.notEqual(where, 'outside', `${label}: Tab must reach a summary before leaving the reference`);
          assert.ok(['link', 'summary'].includes(where), `${label}: only links and summaries take focus in the reference, got ${where}`);
          if (!reached.includes(where)) reached.push(where);
          if (where === 'summary' || presses === 0) {
            const focus = await page.evaluate(() => {
              const style = getComputedStyle(document.activeElement);
              return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow };
            });
            assert.ok(focus.outline !== 'none' || focus.shadow !== 'none', `${label}: the focused ${where} must show a focus indicator`);
          }
        }
        assert.deepEqual(reached, ['link', 'summary'], `${label}: Tab reaches the index links, then a summary`);
        const toggled = await page.evaluate(() => document.activeElement.parentElement.open);
        assert.equal(toggled, false, `${label}: the first summary starts collapsed`);
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.parentElement.open), true, `${label}: Enter opens the summary`);
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.parentElement.open), false, `${label}: Enter closes it again`);

        // Following a type link lands on its declaration, opened.
        const target = await page.evaluate(() => {
          const link = document.querySelector('[data-typed-reference] a[href^="#type-"]');
          link.focus();
          return link.getAttribute('href');
        });
        await page.keyboard.press('Enter');
        const landed = await page.evaluate((href) => ({ hash: window.location.hash, open: document.getElementById(href.slice(1))?.open }), target);
        assert.equal(landed.hash, target, `${label}: Enter follows the type link`);
        assert.equal(landed.open, true, `${label}: the linked declaration opens`);
        // The browser scrolls to the target, so its top lands at the viewport top (give or take a subpixel).
        await page.waitForFunction((href) => {
          const top = document.getElementById(href.slice(1)).getBoundingClientRect().top;
          return top > -1 && top < innerHeight;
        }, target, { timeout: 15_000 }).catch(async (error) => {
          const where = await page.evaluate((href) => ({
            top: document.getElementById(href.slice(1)).getBoundingClientRect().top, scrollY, height: document.documentElement.scrollHeight, hash: location.hash,
          }), target);
          throw new Error(`${label}: following ${target} did not scroll to it (${JSON.stringify(where)})`, { cause: error });
        });

        // Every part and type open, at the page width and at a phone width.
        await page.evaluate(() => document.querySelectorAll('[data-typed-reference] details').forEach((details) => { details.open = true; }));
        for (const width of [1_190, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await waitForDocumentAnimations(page);
          const overflow = await page.evaluate(() => {
            const reference = document.querySelector('[data-typed-reference]');
            const wide = [...reference.querySelectorAll('*')].filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && box.right > document.documentElement.clientWidth + 1
                && !element.closest('pre');
            }).slice(0, 5).map((element) => `${element.localName}.${element.className} ${element.textContent.slice(0, 40)}`);
            // A cell squeezed into a sliver breaks its words letter by letter without overflowing, so measure it too.
            const slivers = [...reference.querySelectorAll('tbody td, tbody th')].filter((cell) => {
              const box = cell.getBoundingClientRect();
              return cell.textContent.trim() !== '' && box.width > 0 && box.height > box.width * 2;
            }).slice(0, 5).map((cell) => `${cell.localName}[${cell.dataset.cell ?? ''}] ${cell.getBoundingClientRect().width}x${cell.getBoundingClientRect().height} ${cell.textContent.slice(0, 30)}`);
            return { reference: reference.scrollWidth - reference.clientWidth, wide, slivers };
          });
          // The page's own code blocks scroll sideways on a narrow viewport; only the reference has to fit.
          assert.ok(overflow.reference <= 0, `${label}@${width}: the reference clips ${overflow.reference}px`);
          assert.deepEqual(overflow.wide, [], `${label}@${width}: nothing in the reference runs past the viewport`);
          assert.deepEqual(overflow.slivers, [], `${label}@${width}: no table cell is squeezed into a sliver`);
          const result = await runAxe(page, '[data-typed-reference]');
          assert.equal(result.violations.length, 0, `${label}@${width} has axe violations:\n${formatViolations(result.violations)}`);
        }
        t.diagnostic(`${label}: keyboard, overflow and axe pass`);
      }
    }
  } finally {
    await resources.close();
  }
});

/** Waits until the fragment of the address names a disclosure that is open and on screen, or says where it is instead. */
async function waitForFragmentShown(page, label, timeout = 20_000) {
  const place = () => page.evaluate(() => {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    return { hash: location.hash, found: target !== null, open: target?.open, top: target?.getBoundingClientRect().top, scrollY, height: document.documentElement.scrollHeight, viewport: innerHeight };
  });
  await page.waitForFunction(() => {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target === null) return false;
    const { top } = target.getBoundingClientRect();
    return target.open === true && top > -1 && top < innerHeight;
  }, undefined, { timeout }).catch(async (error) => {
    throw new Error(`${label}: the fragment's target is not open and in view (${JSON.stringify(await place())})`, { cause: error });
  });
}

/** CommandPalette's Docs address, and the ids of a closed part and a closed type to link to. It has 29 parts, so all but the first are closed, and its page is long. */
async function commandPaletteFragments(session) {
  const url = session.docsUrl('CommandPalette');
  const probe = await session.newPage();
  await probe.goto(url, { waitUntil: 'domcontentloaded' });
  await probe.locator('[data-typed-reference]').waitFor();
  const ids = await probe.evaluate(() => {
    const closed = [...document.querySelectorAll('[data-typed-reference] details:not([open])')];
    return {
      part: closed.filter((details) => details.hasAttribute('data-part')).at(2)?.id,
      type: closed.filter((details) => details.hasAttribute('data-type')).at(-2)?.id,
    };
  });
  await probe.close();
  assert.ok(ids.part && ids.type, `CommandPalette has closed parts and types to link to (${JSON.stringify(ids)})`);
  return { url, ids };
}

test('Storybook typed API reference opens and scrolls to the part or type a fragment names, on load, on a hash change, and on Back and Forward', {
  timeout: testTimeoutMs,
  skip: (() => {
    const selection = typedReferenceSelection();
    if (selection.skip) return selection.skip;
    return selection.families.includes('CommandPalette') ? false : 'CommandPalette is outside the selected families';
  })(),
}, async (t) => {
  const resources = createAuditResources(t.signal);
  try {
    const session = await typedReferenceSession(t.signal, resources);
    const { url, ids } = await commandPaletteFragments(session);

    // A cold load at a fragment, with nothing yet settled: the part and the type each open and end in view.
    for (const [kind, id] of Object.entries(ids)) {
      const page = await session.newPage();
      await page.goto(`${url}#${id}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-typed-reference]').waitFor();
      await waitForStableHeight(page);
      await waitForFragmentShown(page, `cold load at a ${kind} fragment`);
      await page.close();
    }

    const page = await session.newPage();
    const closeTarget = () => page.evaluate(() => { document.getElementById(decodeURIComponent(location.hash.slice(1))).open = false; });
    await page.goto(`${url}#${ids.part}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-typed-reference]').waitFor();
    await waitForStableHeight(page);
    await waitForFragmentShown(page, 'cold load before the hash changes');
    // The reader closes the part, then follows a link to a type: the type opens and is in view.
    await closeTarget();
    await page.evaluate((id) => { location.hash = id; }, ids.type);
    await waitForFragmentShown(page, 'a hash change to a type');
    // Back returns to the part they had closed, which opens again and is in view; Forward returns to the type, closed meanwhile.
    await closeTarget();
    await page.goBack();
    assert.equal(new URL(page.url()).hash, `#${ids.part}`, 'Back returns to the part fragment');
    await waitForFragmentShown(page, 'Back to a part that was closed');
    await closeTarget();
    await page.goForward();
    assert.equal(new URL(page.url()).hash, `#${ids.type}`, 'Forward returns to the type fragment');
    await waitForFragmentShown(page, 'Forward to a type that was closed');
    // Leaving the page and coming Back returns to the fragment with its target open and in view, whether the page reloads or comes from the cache.
    await closeTarget();
    await page.goto('about:blank');
    await page.goBack();
    await page.locator('[data-typed-reference]').waitFor();
    await waitForStableHeight(page);
    await waitForFragmentShown(page, 'Back from another document');
  } finally {
    await resources.close();
  }
});

// Storybook loads its syntax highlighter and formatter on demand, and each code block of the page grows when they arrive: that is the
// late content that moves a fragment's target after the page first shows it. These requests are the ones the proof delays.
const lateContent = /\/sb-vite\/deps\/(?:formatter|syntaxhighlighter)-[^/?]*\.js/u;

test('Storybook typed API reference keeps the part or type a fragment names in view while the page loads late, until the reader scrolls', {
  timeout: testTimeoutMs,
  skip: (() => {
    const selection = typedReferenceSelection();
    if (selection.skip) return selection.skip;
    return selection.families.includes('CommandPalette') ? false : 'CommandPalette is outside the selected families';
  })(),
}, async (t) => {
  const resources = createAuditResources(t.signal);
  try {
    const session = await typedReferenceSession(t.signal, resources);
    const { url, ids } = await commandPaletteFragments(session);
    /** A cold load at `id` in which the highlighter and formatter arrive `lateMs` after they are asked for. Resolves once both have and the page has settled. */
    const loadLate = async (id, lateMs) => {
      const page = await session.newPage();
      let arrived = 0;
      await page.route(lateContent, async (route) => {
        await delay(lateMs);
        await route.continue();
      });
      page.on('requestfinished', (request) => { if (lateContent.test(request.url())) arrived += 1; });
      await page.goto(`${url}#${id}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-typed-reference]').waitFor();
      const arrival = async () => {
        const deadline = Date.now() + lateMs + 20_000;
        while (arrived < 2) {
          if (Date.now() > deadline) throw new Error(`the delayed highlighter and formatter did not arrive (${arrived} of 2)`);
          await delay(50);
        }
        await waitForStableHeight(page);
      };
      return { page, arrival };
    };
    const topOf = (page) => page.evaluate(() => document.getElementById(decodeURIComponent(location.hash.slice(1))).getBoundingClientRect().top);

    // The late content arrives after the page first shows, and the target is still in view once it has.
    for (const lateMs of [1_800, 4_000]) {
      for (const [kind, id] of Object.entries(ids)) {
        const { page, arrival } = await loadLate(id, lateMs);
        await arrival();
        await waitForFragmentShown(page, `a cold load at a ${kind} fragment with the highlighter ${lateMs} ms late`, 3_000);
        t.diagnostic(`${kind} fragment, content ${lateMs} ms late: the target ends ${Math.round(await topOf(page))} px from the top of the viewport`);
        await page.close();
      }
    }

    // A reader who scrolls, presses a key or touches the page is not pulled back to the target by content that arrives after.
    const interruptions = {
      'scrolls the wheel': (page) => page.mouse.wheel(0, -4_000),
      'presses a key': (page) => page.keyboard.press('Shift'),
      'presses the pointer': async (page) => { await page.mouse.move(600, 12); await page.mouse.down(); await page.mouse.up(); },
    };
    for (const [what, interrupt] of Object.entries(interruptions)) {
      const { page, arrival } = await loadLate(ids.part, 4_000);
      // The first scroll happens when the page loads, long before the highlighter arrives.
      await page.waitForFunction(() => document.getElementById(decodeURIComponent(location.hash.slice(1))).getBoundingClientRect().top < 400);
      await page.mouse.move(600, 400);
      await interrupt(page);
      await arrival();
      const top = await topOf(page);
      const height = await page.evaluate(() => innerHeight);
      assert.ok(top < -1 || top >= height, `after the reader ${what}, late content does not scroll the page back to the target (it is ${Math.round(top)} px from the top of a ${height} px viewport)`);
      await page.close();
    }
  } finally {
    await resources.close();
  }
});

/** How many pages a PDF has, counted from its page objects. */
const pdfPages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/gu) ?? []).length;

test('Storybook typed API reference prints every part and type, and puts back what printing opened', {
  timeout: testTimeoutMs,
  skip: (() => {
    const selection = typedReferenceSelection();
    if (selection.skip) return selection.skip;
    return selection.families.includes('CommandPalette') ? false : 'CommandPalette is outside the selected families';
  })(),
}, async (t) => {
  const resources = createAuditResources(t.signal);
  try {
    const session = await typedReferenceSession(t.signal, resources);
    const page = await session.newPage();
    await page.goto(session.docsUrl('CommandPalette'), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-typed-reference]').waitFor();
    await waitForStableHeight(page);
    const states = () => page.evaluate(() => [...document.querySelectorAll('[data-typed-reference] details')].map((details) => details.open));
    const rows = '[data-typed-reference] tr[data-prop]';
    // The reader has opened one declaration of their own, which must stay as they left it.
    await page.locator('[data-typed-reference] details[data-type] > summary').last().click();
    const before = await states();
    assert.ok(before.includes(false) && before.includes(true), 'the page starts with some disclosures closed and one open');
    const onScreen = await page.evaluate((selector) => [...document.querySelectorAll(selector)].filter((row) => row.checkVisibility()).length, rows);
    // The recorder listens after the page's own handlers, so it sees what printing leaves open.
    await page.evaluate((selector) => {
      const measure = () => ({
        closed: document.querySelectorAll('[data-typed-reference] details:not([open])').length,
        rows: [...document.querySelectorAll(selector)].filter((row) => row.checkVisibility()).length,
        declarations: [...document.querySelectorAll('[data-typed-reference] [data-type] pre')].filter((pre) => pre.checkVisibility()).length,
      });
      window.printLog = [];
      window.addEventListener('beforeprint', () => window.printLog.push(measure()));
      window.addEventListener('afterprint', () => window.printLog.push(measure()));
    }, rows);
    // The browser's own print path (a PDF of the page) dispatches beforeprint and afterprint.
    const printed = await page.pdf({ format: 'A4' });
    const [during, after] = await page.evaluate(() => window.printLog);
    const totals = await page.evaluate((selector) => ({ rows: document.querySelectorAll(selector).length, declarations: document.querySelectorAll('[data-typed-reference] [data-type] pre').length }), rows);
    assert.ok(onScreen < totals.rows, `the page hides most of its ${totals.rows} rows until they are opened (it shows ${onScreen})`);
    assert.equal(during.closed, 0, 'printing opens every part and type');
    assert.equal(during.rows, totals.rows, `printing shows all ${totals.rows} rows`);
    assert.equal(during.declarations, totals.declarations, `printing shows all ${totals.declarations} type declarations`);
    assert.deepEqual(await states(), before, 'what printing opened is put back and what the reader opened stays open');
    assert.equal(after.closed, before.filter((open) => !open).length, 'the page is closed again after printing');
    // The PDF is as long as the page printed with everything open by hand.
    await page.evaluate(() => document.querySelectorAll('[data-typed-reference] details').forEach((details) => { details.open = true; }));
    const expanded = await page.pdf({ format: 'A4' });
    assert.equal(pdfPages(printed), pdfPages(expanded), 'the printed page is the page with every part and type open');
    assert.ok(pdfPages(printed) > 1, 'the printed page has pages');
    // Where the browser can show the content of a closed details element, printing needs no script to show every row.
    const fallback = await session.newPage();
    await fallback.goto(session.docsUrl('CommandPalette'), { waitUntil: 'domcontentloaded' });
    await fallback.locator('[data-typed-reference]').waitFor();
    if (await fallback.evaluate(() => CSS.supports('selector(::details-content)'))) {
      const visible = () => fallback.evaluate((selector) => ({ shown: [...document.querySelectorAll(selector)].filter((row) => row.checkVisibility()).length, total: document.querySelectorAll(selector).length, open: document.querySelectorAll('[data-typed-reference] details[open]').length }), rows);
      const screen = await visible();
      assert.ok(screen.shown < screen.total, 'on screen most rows are hidden');
      await fallback.emulateMedia({ media: 'print' });
      const print = await visible();
      assert.equal(print.shown, print.total, 'in print every row is shown');
      assert.equal(print.open, screen.open, 'without opening anything: no script ran');
    }
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
  nestedMenu,
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
      if (nestedMenu) {
        try {
          await assertNestedMenuKeyboard(page, baseUrl, nestedMenu, scheme);
          coverage.push(`${scheme}:menu-nested-keyboard`);
        } catch (error) {
          recordPageFailure(failures, { scheme, id: nestedMenu.id, family: 'Menu', check: 'nested keyboard' }, error, { signal });
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
          if (story.name === 'States' && MODAL_STATE_FAMILIES.includes(family)) {
            await assertModalControlsOpen(page, baseUrl, story, scheme);
            coverage.push(`${scheme}:modal-controls-open:${family}`);
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
          } else if (story.name === 'Nested submenu keyboard navigation') {
            await assertNestedMenuKeyboard(page, baseUrl, story, scheme);
            coverage.push(`${scheme}:menu-nested-keyboard:${story.id}`);
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
          if (story.exportName === 'Controlled' && ['PromptComposer', 'Message'].includes(family)) {
            const output = page.locator(`[data-muxui-controlled-values="${family}"]`);
            if (family === 'PromptComposer') {
              await page.locator('.muxui-prompt-composer-input').fill('Edited controlled draft');
              await page.waitForFunction(() => JSON.parse(document.querySelector('[data-muxui-controlled-values="PromptComposer"]').textContent).value === 'Edited controlled draft');
              await page.getByRole('button', { name: /Model/u }).click();
              await page.getByRole('option', { name: 'Detailed', exact: true }).click();
              assert.deepEqual(JSON.parse(await output.textContent()), { value: 'Edited controlled draft', selectedModel: 'detailed' });
            } else {
              await page.locator('.muxui-message-sources-trigger').click();
              await page.waitForFunction(() => JSON.parse(document.querySelector('[data-muxui-controlled-values="Message"]').textContent).sourcesExpanded === true);
              assert.equal(await page.locator('.muxui-message-sources a').first().isVisible(), true);
            }
            coverage.push(`${scheme}:controlled-callbacks:${story.id}`);
          }
          if (story.name === 'States' && family === 'Dialog') {
            await assertDialogLifecycleDismissal(page, baseUrl, story, scheme);
            coverage.push(`${scheme}:dialog-state-dismissal:${story.id}`);
          }
          if (story.name === 'States' && MODAL_STATE_FAMILIES.includes(family)) {
            await assertModalControlsOpen(page, baseUrl, story, scheme);
            coverage.push(`${scheme}:modal-controls-open:${story.id}`);
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
    ...(story.exportName === 'Controlled' && ['PromptComposer', 'Message'].includes(storyFamily(story)) ? [`${scheme}:controlled-callbacks:${story.id}`] : []),
    ...(story.name === 'Disabled items keyboard navigation' ? [`${scheme}:autocomplete-keyboard:${story.id}`] : []),
    ...(story.name === 'Nested submenu keyboard navigation' ? [`${scheme}:menu-nested-keyboard:${story.id}`] : []),
    ...(story.name === 'Variant × size' ? [`${scheme}:button-matrix:${story.id}`] : []),
    ...(story.name === 'States' && INTERACTION_OPEN_LOCATORS[storyFamily(story)] ? [`${scheme}:open-portal:${story.id}`] : []),
    ...(story.name === 'States' && storyFamily(story) === 'Dialog' ? [`${scheme}:dialog-state-dismissal:${story.id}`] : []),
    ...(story.name === 'States' && MODAL_STATE_FAMILIES.includes(storyFamily(story)) ? [`${scheme}:modal-controls-open:${story.id}`] : []),
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
    const nestedMenu = stories.find((story) => story.name === 'Nested submenu keyboard navigation'
      && storyFamily(story) === 'Menu' && isSelected(story));
    const expectedFamilies = new Set(selectedFamilies ?? manifest.families.map(({ family }) => family));
    assert.ok(expectedFamilies.size > 0, 'the generated Storybook manifest must contain the current union');
    // A family shows a States story only when it has named states to show, so the generated manifest lists which do.
    // Default and Browser proof (hidden from the sidebar, still indexed) are proof for every family.
    const statesFamilies = new Set(manifest.pageIndex
      .filter(({ family, stories }) => expectedFamilies.has(family) && stories.some(({ exportName }) => exportName === 'States'))
      .map(({ family }) => family));
    assert.equal(defaults.length, expectedFamilies.size, 'Storybook must expose one selected Default story for every family');
    assert.equal(states.length, statesFamilies.size, 'Storybook must expose one selected States story for every family that shows one');
    assert.equal(browserProofs.length, expectedFamilies.size, 'Storybook must expose one selected Browser proof story for every family');
    assert.deepEqual(new Set(defaults.map(storyFamily)), expectedFamilies, 'Default stories must cover every selected family');
    assert.deepEqual(new Set(states.map(storyFamily)), statesFamilies, 'States stories must cover every family that shows one');
    assert.deepEqual(new Set(browserProofs.map(storyFamily)), expectedFamilies, 'Browser proof stories must cover every selected family');
    assert.ok(
      [...statesFamilies].every((family) => expectedFamilies.has(family)),
      'every States story belongs to a family with a Default story',
    );
    if (!focused || expectedFamilies.has('Autocomplete')) assert.ok(autocompleteInteraction, 'Storybook must expose the disabled-item Autocomplete interaction story');
    if (!focused || expectedFamilies.has('Menu')) assert.ok(nestedMenu, 'Storybook must expose the nested submenu keyboard story');
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
      nestedMenu,
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
      ...(nestedMenu ? [`${scheme}:menu-nested-keyboard`] : []),
      ...(buttonMatrix ? [`${scheme}:button-matrix`] : []),
      ...(expectedFamilies.has('Dialog') ? [`${scheme}:dialog-state-dismissal`] : []),
      ...MODAL_STATE_FAMILIES.filter((family) => statesFamilies.has(family)).map((family) => `${scheme}:modal-controls-open:${family}`),
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

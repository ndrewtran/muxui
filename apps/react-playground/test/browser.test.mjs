import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const expectedComponents = ['breadcrumbs', 'checkbox', 'autocomplete', 'checkbox-group', 'date-field', 'date-picker', 'date-range-picker', 'form', 'number-field', 'search-field', 'switch', 'text-field', 'time-field', 'disclosure', 'disclosure-group', 'group', 'link', 'meter', 'progress-bar', 'separator', 'toggle-button', 'calendar', 'color-area', 'color-field', 'color-picker', 'color-slider', 'color-swatch', 'color-swatch-picker', 'color-wheel', 'combo-box', 'grid-list', 'list-box', 'menu', 'radio-group', 'range-calendar', 'select', 'slider', 'table', 'tabs', 'tag-group', 'toggle-button-group', 'token-field', 'toolbar', 'tree', 'virtualizer', 'drop-zone', 'file-trigger', 'dialog', 'popover', 'preview-trigger', 'toast', 'tooltip'];
const documentAnimationSettleTimeoutMs = 2000;
const port = Number(process.env.MUXUI_PLAYGROUND_PORT ?? 4174);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('playground preview did not become ready');
}

async function waitForDocumentAnimations(page) {
  await page.evaluate(async (timeoutMs) => {
    const startedAt = performance.now();
    let timeoutId;
    const describeAnimations = () => document.getAnimations().map((animation) => ({
      playState: animation.playState,
      currentTime: animation.currentTime,
      target: animation.effect?.target?.outerHTML?.slice(0, 240),
    }));
    const deadline = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Document animations did not settle within ${timeoutMs}ms (elapsed ${Math.round(performance.now() - startedAt)}ms): ${JSON.stringify(describeAnimations())}`));
      }, timeoutMs);
    });
    const waitForFrame = () => Promise.race([
      new Promise((resolveFrame) => requestAnimationFrame(resolveFrame)),
      deadline,
    ]);
    try {
      // Flush the media-query style change before collecting its transitions.
      void document.documentElement.offsetWidth;
      await waitForFrame();
      let animations = document.getAnimations();
      while (animations.length > 0) {
        await Promise.race([
          Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))),
          deadline,
        ]);
        await waitForFrame();
        animations = document.getAnimations();
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, documentAnimationSettleTimeoutMs);
}

async function assertNoAxeViolations(scope, label) {
  const result = await scope.evaluate(async (node) => window.axe.run(node));
  if (result.violations.length) throw new Error(`${label} axe violations: ${JSON.stringify(result.violations.map(({ id, help }) => ({ id, help })))}`);
}

async function readChoiceFocusStyles(root) {
  return root.evaluate((node) => {
    const input = node.querySelector('input');
    const indicator = node.querySelector('.muxui-checkbox-indicator, .muxui-radio-indicator');
    const rootStyle = getComputedStyle(node);
    const inputStyle = input ? getComputedStyle(input) : null;
    const indicatorStyle = indicator ? getComputedStyle(indicator) : null;
    return {
      active: document.activeElement === input,
      focusVisible: node.hasAttribute('data-focus-visible'),
      rootOutlineStyle: rootStyle.outlineStyle,
      inputOutlineStyle: inputStyle?.outlineStyle,
      indicatorBoxShadow: indicatorStyle?.boxShadow,
      indicatorOutlineColor: indicatorStyle?.outlineColor,
      indicatorOutlineOffset: indicatorStyle?.outlineOffset,
      indicatorOutlineStyle: indicatorStyle?.outlineStyle,
      indicatorOutlineWidth: indicatorStyle?.outlineWidth,
    };
  });
}

test('R1.4 React component browser and axe matrix', async () => {
  if (!executablePath) throw new Error('R1_BROWSER_REQUIRED: Chrome or Chromium was not found');
  const appRoot = resolve(import.meta.dirname, '..');
  const server = await createServer({ root: appRoot, server: { host: '127.0.0.1', port, strictPort: true } });
  const url = `http://127.0.0.1:${port}`;
  let browser;
  try {
    await server.listen();
    await waitForServer(url);
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    await page.goto(url);
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const fieldMediaProof = await page.evaluate(() => [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some((rule) => rule.conditionText === '(forced-colors: active)')
          && [...sheet.cssRules].some((rule) => rule.conditionText === '(prefers-contrast: more)');
      } catch { return false; }
    }));
    if (!fieldMediaProof) throw new Error('R1.2 field CSS must load forced-colors and high-contrast adaptations');
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'no-preference' });
    if (!await page.locator('[data-profile]').first().isVisible()) throw new Error('R1.2 forced-colors profile did not render');
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
    await waitForDocumentAnimations(page);
    const profiles = await page.locator('[data-profile]').evaluateAll((nodes) => nodes.map((node) => node.dataset.profile));
    const expectedProfiles = ['light/standard/full/comfortable/ltr', 'dark/standard/full/comfortable/ltr', 'light/more/full/comfortable/ltr', 'light/standard/reduced/comfortable/ltr', 'light/standard/full/compact/ltr', 'light/standard/full/comfortable/rtl'];
    for (const expected of expectedProfiles) {
      if (!profiles.includes(expected)) throw new Error(`missing browser profile: ${expected}`);
      const profile = page.locator(`[data-profile="${expected}"]`);
      const result = await profile.evaluate(async (node) => window.axe.run(node));
      if (result.violations.length) {
        const diagnostics = await profile.evaluate((profileNode, violations) => violations.map(({ id, help, nodes }) => ({
          id,
          help,
          nodes: nodes.map(({ target, failureSummary, any }) => {
            let element;
            for (const selector of target) {
              try {
                element = profileNode.querySelector(selector);
                if (element) break;
              } catch {}
            }
            const style = element ? getComputedStyle(element) : null;
            return {
              target,
              html: element?.outerHTML.slice(0, 300),
              color: style?.color,
              backgroundColor: style?.backgroundColor,
              any: any?.map(({ data, message }) => ({ data, message })),
              failureSummary,
            };
          }),
        })), result.violations);
        throw new Error(`${expected} axe violations: ${JSON.stringify(diagnostics)}`);
      }
      if (await profile.locator('[data-component]').count() !== expectedComponents.length) {
        throw new Error(`${expected} must expose all ${expectedComponents.length} R1.4 component articles`);
      }
      for (const component of expectedComponents) {
        if (await profile.locator(`[data-component="${component}"]`).count() !== 1) {
          throw new Error(`${expected} must expose exactly one ${component} article`);
        }
      }
      const overlaySection = profile.locator('[data-r1-4-section]');
      if (await overlaySection.count() !== 1) throw new Error(`${expected} must expose exactly one R1.4 section`);
      await assertNoAxeViolations(overlaySection, `${expected} R1.4`);
      const idleFixture = profile.locator('[data-muxui-fixture-state="idle"]');
      await idleFixture.locator('button').click();
      if (await idleFixture.getAttribute('data-muxui-press-count') !== '1') throw new Error(`${expected} idle Button must activate exactly once`);
      const pendingFixture = profile.locator('[data-muxui-fixture-state="pending"]');
      const pending = pendingFixture.locator('button');
      await pending.focus();
      if (!await pending.evaluate((node) => document.activeElement === node)) throw new Error(`${expected} pending Button must remain focusable`);
      if (await pending.evaluate((node) => node.disabled)) throw new Error(`${expected} pending Button must not become HTML-disabled`);
      await pending.evaluate((node) => node.click());
      if (await pendingFixture.getAttribute('data-muxui-press-count') !== '0') throw new Error(`${expected} pending Button must suppress activation`);
      const disabledFixture = profile.locator('[data-muxui-fixture-state="disabled"]');
      const disabled = disabledFixture.locator('button');
      await disabled.evaluate((node) => node.click());
      if (await disabledFixture.getAttribute('data-muxui-press-count') !== '0') throw new Error(`${expected} disabled Button must suppress activation`);
      await disabled.focus();
      if (await disabled.evaluate((node) => document.activeElement === node)) throw new Error(`${expected} disabled Button must not be focusable`);
      if (expected === expectedProfiles[0]) {
        for (const [label, rootSelector, keyboardAction] of [
          ['Checkbox', '[data-component="checkbox"] .muxui-checkbox', 'Tab'],
          ['Radio', '[data-component="radio-group"] .muxui-radio', 'ArrowDown'],
        ]) {
          const choices = profile.locator(rootSelector);
          if (await choices.count() < 2) throw new Error(`${label} focus fixture must expose at least two choices`);
          const first = choices.nth(0);
          const second = choices.nth(1);
          await first.click();
          const pointerState = await readChoiceFocusStyles(first);
          if (!pointerState.active) throw new Error(`${label} pointer click must focus its native input`);
          if (pointerState.rootOutlineStyle !== 'none') throw new Error(`${label} pointer click must not paint a root outline`);
          if (pointerState.inputOutlineStyle !== 'none') throw new Error(`${label} pointer click must not paint a native input outline`);

          await page.keyboard.press(keyboardAction);
          await waitForDocumentAnimations(page);
          const keyboardState = await readChoiceFocusStyles(second);
          if (!keyboardState.active || !keyboardState.focusVisible) throw new Error(`${label} ${keyboardAction} must expose keyboard focus on the next choice`);
          if (!/0(?:px)? 0(?:px)? 0(?:px)? 1px[\s\S]*0(?:px)? 0(?:px)? 0(?:px)? 3px/u.test(keyboardState.indicatorBoxShadow ?? '')) {
            throw new Error(`${label} ${keyboardAction} focus must retain its indicator ring: ${JSON.stringify(keyboardState)}`);
          }

          await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'no-preference' });
          await waitForDocumentAnimations(page);
          const forcedState = await readChoiceFocusStyles(second);
          if (forcedState.indicatorOutlineStyle !== 'solid'
            || forcedState.indicatorOutlineWidth !== '2px'
            || forcedState.indicatorOutlineOffset !== '1px'
            || forcedState.indicatorOutlineColor === 'transparent') {
            throw new Error(`${label} forced-colors focus must use a visible 2px system-color outline with a 1px gap: ${JSON.stringify(forcedState)}`);
          }
          if (forcedState.rootOutlineStyle !== 'none' || forcedState.inputOutlineStyle !== 'none') {
            throw new Error(`${label} forced-colors focus must keep root and native input outlines suppressed`);
          }
          await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
        }

        const autocompleteInput = profile.locator('[data-component="autocomplete"] .muxui-autocomplete input');
        const autocompleteArticle = profile.locator('[data-component="autocomplete"]');
        const contentBelowAutocomplete = autocompleteArticle.locator('xpath=following-sibling::*[1]');
        const autocompletePopover = page.locator('.muxui-autocomplete-popover');
        const contentBefore = await contentBelowAutocomplete.boundingBox();
        if (!contentBefore) throw new Error('Autocomplete geometry proof requires following content before opening');
        await autocompleteInput.fill('');
        await autocompleteInput.focus();
        await autocompletePopover.waitFor({ state: 'visible' });
        await waitForDocumentAnimations(page);
        const inputBox = await autocompleteInput.boundingBox();
        const popoverBox = await autocompletePopover.boundingBox();
        if (!inputBox || !popoverBox) throw new Error('Autocomplete geometry proof requires input and overlay boxes');
        if (Math.abs(popoverBox.x - inputBox.x) > 1 || Math.abs(popoverBox.width - inputBox.width) > 1) throw new Error('Autocomplete overlay must align to the input width and center');
        if (popoverBox.y < inputBox.y + inputBox.height - 1) throw new Error('Autocomplete overlay must be anchored below the input');
        const [popoverZIndex, contentZIndex] = await Promise.all([
          autocompletePopover.evaluate((node) => Number.parseInt(getComputedStyle(node).zIndex, 10)),
          contentBelowAutocomplete.evaluate((node) => Number.parseInt(getComputedStyle(node).zIndex, 10) || 0),
        ]);
        if (!(popoverZIndex > contentZIndex)) throw new Error('Autocomplete overlay must stack above following content');
        const contentAfterOpen = await contentBelowAutocomplete.boundingBox();
        if (!contentAfterOpen || Math.abs(contentAfterOpen.y - contentBefore.y) > 1) throw new Error('Autocomplete overlay must not move following content');
        const localPortalDetails = await profile.evaluate((profileNode) => {
          const popover = document.querySelector('.muxui-autocomplete-popover');
          return {
            containsPopover: Boolean(popover && profileNode.contains(popover)),
            position: popover ? getComputedStyle(popover).position : '',
          };
        });
        if (!localPortalDetails.containsPopover || !['absolute', 'fixed'].includes(localPortalDetails.position)) {
          throw new Error('Autocomplete suggestions must use a scoped floating portal without participating in layout');
        }
        await autocompleteInput.press('ArrowDown');
        const activeDescendant = await autocompleteInput.getAttribute('aria-activedescendant');
        if (!activeDescendant) throw new Error('Autocomplete ArrowDown must expose an active descendant');
        if (await page.locator(`#${activeDescendant}`).count() !== 1) throw new Error('Autocomplete active descendant must identify an option');
        await autocompleteInput.press('Enter');
        if (await autocompleteInput.inputValue() !== 'Melbourne') throw new Error('Autocomplete Enter must select the active option');
        await autocompletePopover.waitFor({ state: 'detached' });
        await autocompleteInput.fill('');
        await autocompleteInput.press('Escape');
        if (await autocompleteInput.getAttribute('aria-activedescendant') !== null) throw new Error('Autocomplete Escape must clear the active descendant');
        await autocompletePopover.waitFor({ state: 'detached' });
        await autocompleteInput.fill('Syd');
        await autocompleteInput.press('ArrowDown');
        await autocompletePopover.waitFor({ state: 'visible' });
        if (await page.locator('.muxui-autocomplete-option').count() !== 1) throw new Error('Autocomplete input must filter options');
        await page.locator('.muxui-autocomplete-option').click();
        if (await autocompleteInput.inputValue() !== 'Sydney') throw new Error('Autocomplete click selection must update the Mux UI input value');
        await autocompletePopover.waitFor({ state: 'detached' });
        await autocompleteInput.fill('');
        await autocompleteInput.press('ArrowDown');
        await autocompletePopover.waitFor({ state: 'visible' });
        await profile.locator(':scope > h2').click();
        await autocompletePopover.waitFor({ state: 'detached' });

        for (const scopedProfileName of expectedProfiles.slice(1, 2).concat(expectedProfiles.slice(-1))) {
          const scopedProfile = page.locator(`[data-profile="${scopedProfileName}"]`);
          const scopedInput = scopedProfile.locator('[data-component="autocomplete"] .muxui-autocomplete input');
          await scopedInput.click();
          await scopedInput.press('ArrowDown');
          await autocompletePopover.waitFor({ state: 'visible' });
          await waitForDocumentAnimations(page);
          const [scopedInputBox, scopedPopoverBox] = await Promise.all([
            scopedInput.boundingBox(),
            autocompletePopover.boundingBox(),
          ]);
          if (!scopedInputBox || !scopedPopoverBox) throw new Error(`${scopedProfileName} Autocomplete geometry proof requires input and overlay boxes`);
          if (scopedProfileName.endsWith('/rtl')
            && (Math.abs(scopedPopoverBox.x - scopedInputBox.x) > 1 || Math.abs(scopedPopoverBox.width - scopedInputBox.width) > 1)) {
            throw new Error('RTL Autocomplete overlay must align to the input width and physical position');
          }
          const scopedPortalDetails = await scopedProfile.evaluate((profileNode) => {
            const popover = document.querySelector('.muxui-autocomplete-popover');
            const style = popover ? getComputedStyle(popover) : null;
            return {
              containsPopover: Boolean(popover && profileNode.contains(popover)),
              profile: popover?.closest('[data-profile]')?.getAttribute('data-profile'),
              direction: style?.direction,
              background: style?.backgroundColor,
              overlayToken: style?.getPropertyValue('--muxui-semantic-overlay-background').trim(),
            };
          });
          if (!scopedPortalDetails.containsPopover || scopedPortalDetails.profile !== scopedProfileName) {
            throw new Error(`${scopedProfileName} Autocomplete must keep its scoped runtime portal`);
          }
          if (scopedProfileName.endsWith('/rtl') && scopedPortalDetails.direction !== 'rtl') {
            throw new Error('RTL Autocomplete portal must inherit scoped direction');
          }
          if (scopedProfileName.startsWith('dark/')
            && (scopedPortalDetails.background !== 'rgb(17, 16, 15)' || scopedPortalDetails.overlayToken !== '#11100f')) {
            throw new Error('Dark Autocomplete portal must inherit the semantic overlay background');
          }
          await scopedInput.press('Escape');
          await autocompletePopover.waitFor({ state: 'detached' });
        }

        const dropZone = profile.locator('[data-r1-4-control="drop-zone"]');
        await dropZone.hover();
        if (await dropZone.getAttribute('data-hovered') !== 'true') throw new Error('DropZone hover must expose its active state');

        const fileTrigger = profile.locator('[data-component="file-trigger"]');
        const fileInput = fileTrigger.locator('input[type="file"]');
        if (await fileInput.getAttribute('accept') !== 'image/*') throw new Error('FileTrigger must expose its accepted image type');
        if (await fileInput.getAttribute('multiple') === null) throw new Error('FileTrigger must allow multiple files');
        await fileInput.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from('fixture') });
        if (await fileTrigger.locator('[data-r1-4-status="file-trigger"]').textContent() !== 'avatar.png') throw new Error('FileTrigger selection must update its status');

        const dialogTrigger = profile.locator('[data-r1-4-control="dialog-open"]');
        await dialogTrigger.focus();
        await dialogTrigger.press('Enter');
        const dialog = page.locator('[data-r1-4-overlay="dialog"]');
        if (await dialog.count() !== 1 || !await dialog.isVisible()) throw new Error('Dialog must open from its keyboard trigger');
        await page.keyboard.press('Escape');
        await waitForDocumentAnimations(page);
        if (await dialog.count() !== 0) throw new Error('Dialog Escape must dismiss the dialog');

        const popoverTrigger = profile.locator('[data-r1-4-control="popover-open"]');
        await popoverTrigger.focus();
        await popoverTrigger.press('Enter');
        const popover = page.locator('[data-r1-4-overlay="popover"]');
        if (await popover.count() !== 1 || !await popover.isVisible()) throw new Error('Popover must open from its keyboard trigger');
        await page.keyboard.press('Escape');
        await waitForDocumentAnimations(page);
        if (await popover.count() !== 0) throw new Error('Popover Escape must dismiss the popover');

        const previewTrigger = profile.locator('[data-r1-4-control="preview-trigger"]');
        // PreviewTrigger opens its non-modal inner dialog on focus, so observe
        // the successful keyboard Tab through the resulting preview instead of
        // expecting focus to remain on the trigger.
        await popoverTrigger.focus();
        await page.keyboard.press('Tab');
        const preview = page.locator('[data-r1-4-overlay="preview"]');
        await preview.waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await preview.waitFor({ state: 'detached' });

        const tooltipTrigger = profile.locator('[data-r1-4-control="tooltip-trigger"]');
        await tooltipTrigger.focus();
        const tooltip = page.locator('[data-r1-4-overlay="tooltip"]');
        if (await tooltip.count() !== 1 || !await tooltip.isVisible()) throw new Error('Tooltip must show on focus');
        await tooltipTrigger.evaluate((node) => node.blur());
        await tooltip.waitFor({ state: 'detached' });

        const toastTrigger = profile.locator('[data-r1-4-control="toast-add"]');
        await toastTrigger.click();
        const toast = page.locator('.muxui-toast').filter({ hasText: 'Your changes are saved.' });
        if (await toast.count() !== 1 || !await toast.isVisible()) throw new Error('useToast must announce a visible toast');
        if (await toast.locator('[role="alert"]').count() !== 1) throw new Error('Toast must expose an announcement region');
        await toast.locator('.muxui-toast-dismiss').click();
        if (await toast.count() !== 0) throw new Error('Toast dismiss must remove the notification');

        const declarativeToastTrigger = profile.locator('[data-r1-4-control="toast-declarative"]');
        await declarativeToastTrigger.click();
        const declarativeToast = page.locator('.muxui-toast').filter({ hasText: 'A declarative notification is visible.' });
        if (await declarativeToast.count() !== 1 || !await declarativeToast.isVisible()) throw new Error('Toast component must render through ToastProvider');
        await declarativeToast.locator('.muxui-toast-dismiss').click();
        if (await declarativeToast.count() !== 0) throw new Error('Declarative Toast dismiss must remove the notification');
      }
    }
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'no-preference' });
    await waitForDocumentAnimations(page);
    await assertNoAxeViolations(page.locator('[data-profile]').first().locator('[data-r1-4-section]'), 'R1.4 forced-colors');
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
    await assertNoAxeViolations(page.locator('[data-profile="light/standard/reduced/comfortable/ltr"] [data-r1-4-section]'), 'R1.4 reduced-motion');
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
    await assertNoAxeViolations(page.locator('[data-profile="light/more/full/comfortable/ltr"] [data-r1-4-section]'), 'R1.4 high-contrast');
    await assertNoAxeViolations(page.locator('[data-profile="light/standard/full/comfortable/rtl"] [data-r1-4-section]'), 'R1.4 RTL');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    console.log(JSON.stringify({ browser: await browser.version(), profiles: expectedProfiles }));
  } finally {
    await browser?.close();
    await server.close();
  }
});

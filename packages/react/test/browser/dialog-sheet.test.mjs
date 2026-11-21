import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { DialogSheetFixture } from '../fixtures/dialog-sheet-fixture.mjs';
import { recordFrames } from '../fixtures/frame-recorder.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof of Dialog's sheet presentation: it rests on the bottom edge and slides in and out without fading,
// it has a visible named close button, Escape and an outside press close it and focus returns to the trigger, focus
// stays inside it, its content scrolls without moving it, drags from the grip and the title follow the distance and
// speed thresholds, a press on the grip keeps a field's focus and selection, an owner that rejects the close keeps it
// open at rest, a sheet that cannot be dismissed has no grip and no drag, a nested Popover closes first, a smaller
// visual viewport (an on-screen keyboard) lifts it, the grip and close button read in light and dark at rest, on hover
// and while pressed, forced colours keep it opaque in system colours, and reduced motion places it at once with no grip
// and no drag. Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs). Forced colours can be emulated in
// Chromium only, so that case says so in the others, and no engine here can set the safe-area insets, so their case
// proves only that the stylesheet declares them.

const VIEWPORT = { width: 390, height: 700 };

function documentHtml(url) {
  const mode = url.searchParams.get('mode') ?? 'long';
  const scheme = url.searchParams.get('scheme') ?? 'light';
  const dir = url.searchParams.get('dir') === 'rtl' ? ' dir="rtl"' : '';
  const body = renderToString(React.createElement(DialogSheetFixture, { mode, open: url.searchParams.get('open') === '1', wordy: url.searchParams.get('wordy') === '1', onOpenChange: () => {} }));
  return pageShell({
    attributes: `data-muxui-color-scheme="${scheme}"${dir}`,
    head: '<link rel="stylesheet" href="/packages/react/generated/styles.css">',
    bodyAttributes: 'style="margin:0;background:var(--muxui-semantic-surface-canvas);color:var(--muxui-semantic-content-strong)"',
    body: `<div id="root">${body}</div>`,
    entry: '/packages/react/test/fixtures/dialog-sheet-browser-entry.mjs',
  });
}

// What the page shows of the sheet: the panel's box, its travel below rest, and its state.
const readSheet = (page) => page.evaluate(() => {
  const panel = document.querySelector('.muxui-dialog');
  if (!panel) return null;
  const rect = panel.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    height: rect.height,
    y: Number.parseFloat(panel.style.getPropertyValue('--muxui-modal-y')) || 0,
    dragging: panel.hasAttribute('data-muxui-state-dragging'),
    reduced: panel.hasAttribute('data-muxui-dialog-reduced'),
    focusInside: panel.contains(document.activeElement),
  };
});
const changes = (page) => page.evaluate(() => window.__muxuiSheetChanges ?? []);
// React Aria returns focus to the trigger a frame after the sheet unmounts.
const waitForFocus = (page, id) => page.waitForFunction((target) => document.activeElement?.id === target, id);

// At rest: the panel carries no travel and no drag.
async function waitForRest(page, timeout) {
  await page.waitForFunction(() => {
    const panel = document.querySelector('.muxui-dialog');
    return Boolean(panel) && panel.style.getPropertyValue('--muxui-modal-y') === '' && !panel.hasAttribute('data-muxui-state-dragging');
  }, undefined, timeout ? { timeout } : undefined);
}

async function openSheet(page) {
  await page.locator('#trigger').click();
  await page.locator('.muxui-dialog').waitFor();
  await waitForRest(page);
}

const waitForClosed = (page) => page.locator('.muxui-dialog__backdrop').waitFor({ state: 'detached' });

// Where a part of the sheet is, whether it lies inside the panel's box, and whether a press at its middle reaches it.
const reach = (page, selector) => page.locator(selector).evaluate((node) => {
  const rect = node.getBoundingClientRect();
  const panel = node.closest('.muxui-dialog').getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, inPanel: rect.top >= panel.top - 0.5 && rect.bottom <= panel.bottom + 0.5, hit: node.contains(hit) };
});

// Opens the sheet from its trigger and, two frames into its slide, runs the named step on the page; returns how far
// below rest the sheet was when the step ran. `press` presses the grip and lets go without moving; `nested` opens the
// nested Popover.
const duringEntry = (page, step) => page.evaluate(async (name) => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  document.querySelector('#trigger').click();
  let panel = null;
  while (!(panel = document.querySelector('.muxui-dialog'))) await frame();
  await frame();
  await frame();
  const y = Number.parseFloat(panel.style.getPropertyValue('--muxui-modal-y')) || 0;
  if (name === 'press') {
    const grip = panel.querySelector('.muxui-dialog__grip');
    const rect = grip.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, pointerId: 11, pointerType: 'mouse', isPrimary: true, button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    grip.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
    grip.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  }
  if (name === 'nested') document.querySelector('#nested-trigger').click();
  return y;
}, step);

// A mouse drag from the middle of `selector` down by `dy`, in steps 25 ms apart and held still before the release, so
// it reads as slow however busy the runner is.
async function slowDrag(page, selector, dy, { release = true } = {}) {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(x, y + (dy * step) / 6);
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(150);
  if (release) await page.mouse.up();
}

// A flick of a touch pointer, dispatched within one task a few milliseconds apart by the page's own clock, so its
// speed does not depend on round trips to the browser. The pointer is synthetic, so the sheet cannot capture it.
const flick = (page, selector, dy) => page.evaluate(({ selector: target, distance }) => {
  const node = document.querySelector(target);
  const rect = node.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const pause = (ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      // Wait without yielding, so no other task runs between the events.
    }
  };
  const fire = (type, clientY) => node.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
    button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY,
  }));
  fire('pointerdown', y);
  for (let step = 1; step <= 4; step += 1) {
    pause(3);
    fire('pointermove', y + (distance * step) / 4);
  }
  pause(3);
  fire('pointerup', y + distance);
}, { selector, distance: dy });

// The contrast of the sheet's grip, title and close button with its surface, after the grip's colour settles.
const paintsOf = (page) => page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const rgb = (colour) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000';
    context.fillStyle = colour;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  };
  const luminance = ([r, g, b]) => {
    const [red, green, blue] = [r, g, b].map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const ratio = (first, second) => {
    const [high, low] = [luminance(rgb(first)), luminance(rgb(second))].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  };
  const panel = document.querySelector('.muxui-dialog');
  const surface = getComputedStyle(panel).backgroundColor;
  const grip = document.querySelector('.muxui-dialog__grip');
  return {
    grip: ratio(getComputedStyle(grip, '::before').backgroundColor, surface),
    title: ratio(getComputedStyle(document.querySelector('.muxui-dialog__title')).color, surface),
    close: ratio(getComputedStyle(document.querySelector('.muxui-dialog__close')).color, surface),
  };
});

// The colour a token resolves to inside the sheet, as the grip's bar would paint it.
const tokenColour = (page, name) => page.evaluate((token) => {
  const probe = document.createElement('div');
  probe.style.backgroundColor = `var(${token})`;
  document.querySelector('.muxui-dialog').append(probe);
  const colour = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return colour;
}, name);

for (const engine of browserEngines()) {
  test(`a Dialog presented as a sheet rests on the bottom edge, drags to dismiss, and keeps the Dialog contract in ${engine}`, { timeout: 300_000 }, async (t) => {
    const server = await startServer({ root: 'repository', entries: ['packages/react/test/fixtures/dialog-sheet-browser-entry.mjs'], pages: { '/dialog-sheet.html': documentHtml } });
    let browser;
    try {
      browser = await launchBrowser(engine);

      // Opens the fixture page in a context of its own and returns it with the errors it logged.
      const openPage = async ({ mode = 'long', scheme = 'light', dir = 'ltr', wordy = false, viewport = VIEWPORT, reducedMotion = 'no-preference', forcedColors, hasTouch = false, initScript } = {}) => {
        const context = await browser.newContext({ viewport, reducedMotion, hasTouch, ...(forcedColors && { forcedColors }) });
        if (initScript) await context.addInitScript(initScript);
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await page.goto(`${server.url}/dialog-sheet.html?${new URLSearchParams({ mode, scheme, dir, ...(wordy && { wordy: '1' }) })}`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.documentElement.dataset.muxuiSheetHydrated === 'true');
        await awaitFontsAndFrames(page);
        return { context, page, errors };
      };
      const withPage = async (options, run) => {
        const { context, page, errors } = await openPage(options);
        try {
          await run(page);
          assert.deepEqual(errors, [], errors.join(' | '));
        } finally {
          await context.close();
        }
      };

      await t.test('server markup holds only the trigger, and the sheet opens after hydration on the bottom edge, sliding up without fading', () => withPage({}, async (page) => {
        assert.equal(await page.locator('.muxui-dialog').count(), 0, 'no sheet in the server markup or before opening');
        const entry = await recordFrames(page, () => {
          const panel = document.querySelector('.muxui-dialog');
          const backdrop = document.querySelector('.muxui-dialog__backdrop');
          if (!panel || !backdrop) return null;
          let opacity = 1;
          for (let node = panel; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
          return { y: Number.parseFloat(panel.style.getPropertyValue('--muxui-modal-y')) || 0, opacity };
        });
        await openSheet(page);
        const frames = await entry.stop();
        assert.ok(frames.some(({ y }) => y > 40), `the sheet starts below rest: ${JSON.stringify(frames.slice(0, 4))}`);
        assert.ok(frames.every(({ opacity }) => opacity === 1), 'the sheet and its backdrop never fade while it slides');
        const sheet = await readSheet(page);
        assert.ok(Math.abs(sheet.bottom - VIEWPORT.height) < 1, `the sheet rests on the bottom edge: ${JSON.stringify(sheet)}`);
        assert.ok(sheet.left <= 0.5 && sheet.right >= VIEWPORT.width - 0.5, 'a phone-width sheet spans the viewport');
        assert.ok(sheet.top >= 20, 'the tallest sheet leaves a strip of backdrop above it');
        const shape = await page.locator('.muxui-dialog').evaluate((node) => {
          const style = getComputedStyle(node);
          return { start: Number.parseFloat(style.borderTopLeftRadius), end: Number.parseFloat(style.borderBottomLeftRadius), presentation: node.dataset.muxuiPresentation, backdrop: node.closest('.muxui-dialog__backdrop').dataset.muxuiPresentation };
        });
        assert.ok(shape.start > 0 && shape.end === 0, 'only the top corners are rounded');
        assert.deepEqual([shape.presentation, shape.backdrop], ['sheet', 'sheet'], 'the panel and the backdrop reflect the presentation');
        assert.equal(sheet.focusInside, true, 'opening moves focus into the sheet');
        const grip = await page.locator('.muxui-dialog__grip').evaluate((node) => ({ hidden: node.getAttribute('aria-hidden'), tabIndex: node.tabIndex, height: node.getBoundingClientRect().height }));
        assert.deepEqual([grip.hidden, grip.tabIndex], ['true', -1], 'the grip is hidden from assistive technology and takes no focus');
        assert.ok(grip.height >= 24, 'the grip is a row of its own');
        assert.equal(await page.getByRole('dialog', { name: 'Filters' }).count(), 1, 'the sheet is a dialog named by its title');
      }));

      await t.test('a visible, named close button closes the sheet and returns focus to the trigger', () => withPage({}, async (page) => {
        await openSheet(page);
        const close = page.getByRole('button', { name: 'Close dialog' });
        const shown = await close.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return { width: rect.width, height: rect.height, inside: rect.top >= 0 && rect.bottom <= innerHeight, onTop: node.contains(hit), inPanel: node.closest('.muxui-dialog') !== null };
        });
        assert.ok(shown.width >= 24 && shown.height >= 24 && shown.inside && shown.onTop && shown.inPanel, `the close button is visible and reachable: ${JSON.stringify(shown)}`);
        await close.hover();
        assert.equal(await close.getAttribute('data-muxui-state-hovered'), 'true', 'the close button shows hover');
        await page.mouse.down();
        assert.equal(await close.getAttribute('data-muxui-state-pressed'), 'true', 'the close button shows its press');
        await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 4);
        await page.mouse.up();
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'a press released off the close button keeps the sheet open');
        await close.click();
        await waitForClosed(page);
        await waitForFocus(page, 'trigger');
        assert.equal((await changes(page)).at(-1), false);
      }));

      await t.test('Escape and an outside press close the sheet as they close a Dialog, and the sheet slides out without fading', () => withPage({}, async (page) => {
        await openSheet(page);
        const exit = await recordFrames(page, () => {
          const panel = document.querySelector('.muxui-dialog');
          if (!panel) return null;
          return { y: Number.parseFloat(panel.style.getPropertyValue('--muxui-modal-y')) || 0, opacity: Number(getComputedStyle(panel).opacity), backdrop: Number(getComputedStyle(panel.closest('.muxui-dialog__backdrop')).opacity) };
        });
        await page.keyboard.press('Escape');
        await waitForClosed(page);
        const frames = await exit.stop();
        assert.ok(frames.some(({ y }) => y > 40), `the sheet slides down to leave: ${JSON.stringify(frames.slice(-4))}`);
        assert.ok(frames.every(({ opacity, backdrop }) => opacity === 1 && backdrop === 1), 'neither the sheet nor its backdrop fades');
        await waitForFocus(page, 'trigger');

        await openSheet(page);
        const { top } = await readSheet(page);
        await page.mouse.click(VIEWPORT.width / 2, top / 2);
        await waitForClosed(page);
        await waitForFocus(page, 'trigger');
        assert.deepEqual(await changes(page), [true, false, true, false]);
      }));

      await t.test('Tab and Shift+Tab keep focus inside the sheet', () => withPage({}, async (page) => {
        await openSheet(page);
        for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
          await page.keyboard.press(key);
          assert.equal((await readSheet(page)).focusInside, true, `${key} keeps focus inside the sheet`);
        }
        // The close button takes a keyboard focus ring.
        await page.getByRole('button', { name: 'Close dialog' }).focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const ring = await page.locator('.muxui-dialog__close').evaluate((node) => ({ focused: node === document.activeElement, shadow: getComputedStyle(node).boxShadow, outline: getComputedStyle(node).outlineStyle }));
        assert.equal(ring.focused, true);
        assert.ok(ring.shadow !== 'none' || ring.outline !== 'none', `the focused close button shows a ring: ${JSON.stringify(ring)}`);
      }));

      await t.test('the sheet scrolls as one under its grip and close button, and a drag across the content moves neither the sheet nor its state', () => withPage({}, async (page) => {
        await openSheet(page);
        const touchAction = await page.evaluate(() => Object.fromEntries(['grip', 'title', 'description', 'content']
          .map((part) => [part, getComputedStyle(document.querySelector(`.muxui-dialog__${part}`)).touchAction])));
        assert.deepEqual(touchAction, { grip: 'pinch-zoom', title: 'pinch-zoom', description: 'auto', content: 'auto' }, 'a touch on the grip or title drags the sheet, while the description and content keep their touch scrolling');
        const before = await readSheet(page);
        const close = await reach(page, '.muxui-dialog__close');
        const titleTop = await page.locator('.muxui-dialog__title').evaluate((node) => node.getBoundingClientRect().top);
        await page.locator('.muxui-dialog__content').hover();
        await page.mouse.wheel(0, 400);
        await page.waitForFunction(() => document.querySelector('.muxui-dialog').scrollTop > 0);
        const after = await readSheet(page);
        assert.deepEqual([after.top, after.y], [before.top, 0], 'scrolling leaves the sheet where it is');
        assert.ok(await page.locator('.muxui-dialog__title').evaluate((node, top) => node.getBoundingClientRect().top < top, titleTop), 'the title scrolls with the content');
        assert.deepEqual(await reach(page, '.muxui-dialog__close'), close, 'the close button stays at the top, over the grip');
        assert.equal((await reach(page, '.muxui-dialog__grip')).top, close.top, 'the grip stays at the top too');
        // A row in the middle of the scrolled sheet.
        const row = await page.evaluate(() => {
          const rect = document.querySelector('.muxui-dialog').getBoundingClientRect();
          const item = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2).closest('li');
          return [...item.parentElement.children].indexOf(item) + 1;
        });
        await slowDrag(page, `#rows li:nth-child(${row})`, 160);
        const dragged = await readSheet(page);
        assert.deepEqual([dragged.top, dragged.y, dragged.dragging], [before.top, 0, false], 'a drag on the content is not a drag of the sheet');
        assert.equal(await page.locator('.muxui-dialog').count(), 1);
      }));

      await t.test('a slow drag from the grip follows the pointer and dismisses past the distance; a short one returns to rest', () => withPage({}, async (page) => {
        await openSheet(page);
        await slowDrag(page, '.muxui-dialog__grip', 40);
        await waitForRest(page);
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'a drag short of the distance keeps the sheet open');
        assert.deepEqual(await changes(page), [true]);

        await slowDrag(page, '.muxui-dialog__grip', 150, { release: false });
        const held = await readSheet(page);
        assert.ok(held.dragging, 'the sheet is marked while the drag holds it');
        assert.ok(Math.abs(held.y - 150) < 2, `the sheet follows the pointer one for one: ${held.y}`);
        await page.mouse.up();
        await waitForClosed(page);
        assert.deepEqual(await changes(page), [true, false], 'the drag dismissal reports the close once');
        await waitForFocus(page, 'trigger');

        // A drag up holds the sheet at rest.
        await openSheet(page);
        await slowDrag(page, '.muxui-dialog__grip', -24, { release: false });
        assert.equal((await readSheet(page)).y, 0, 'the sheet never rises above rest');
        await page.mouse.up();
        await waitForRest(page);

        // A release above the window, which some engines never report to the page, leaves the sheet at rest by the next move.
        await slowDrag(page, '.muxui-dialog__grip', 60, { release: false });
        await page.mouse.move(VIEWPORT.width / 2, -40);
        await page.mouse.up();
        await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
        await waitForRest(page);
        assert.equal(await page.locator('.muxui-dialog').count(), 1);
        assert.deepEqual(await changes(page), [true, false, true]);
      }));

      await t.test('a drag from the title dismisses too, and a press on the grip keeps the focused field and its selection', () => withPage({}, async (page) => {
        await openSheet(page);
        await page.locator('#sheet-field').focus();
        await page.locator('#sheet-field').evaluate((node) => node.setSelectionRange(2, 9));
        await slowDrag(page, '.muxui-dialog__grip', 30);
        await waitForRest(page);
        const field = await page.locator('#sheet-field').evaluate((node) => ({ focused: node === document.activeElement, start: node.selectionStart, end: node.selectionEnd }));
        assert.deepEqual(field, { focused: true, start: 2, end: 9 }, 'the field keeps focus and selection through a drag of the grip');

        // Selecting text in the field with the pointer is not a drag of the sheet.
        await slowDrag(page, '#sheet-field', 60);
        const selecting = await readSheet(page);
        assert.deepEqual([selecting.y, selecting.dragging], [0, false]);

        await slowDrag(page, '.muxui-dialog__title', 150);
        await waitForClosed(page);
        assert.deepEqual(await changes(page), [true, false]);
      }));

      await t.test('a flick dismisses after the flick distance, and a flick shorter than that does not', () => withPage({}, async (page) => {
        await openSheet(page);
        await flick(page, '.muxui-dialog__grip', 10);
        await waitForRest(page);
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'a 10 pixel flick keeps the sheet open');
        await flick(page, '.muxui-dialog__grip', 60);
        await waitForClosed(page);
        assert.deepEqual(await changes(page), [true, false], 'a fast 60 pixel flick dismisses the sheet');
      }));

      await t.test('a press on the grip that does not move while the sheet slides in leaves it open', () => withPage({}, async (page) => {
        const below = await duringEntry(page, 'press');
        assert.ok(below > 96, `the press came while the sheet was still more than the dismiss distance below rest: ${below}`);
        await page.waitForFunction(() => {
          const panel = document.querySelector('.muxui-dialog');
          return !panel || (panel.style.getPropertyValue('--muxui-modal-y') === '' && !panel.hasAttribute('data-muxui-state-dragging'));
        });
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'the sheet finished its slide and stayed open');
        assert.deepEqual(await changes(page), [true]);
      }));

      // A real touch, which no page script can fake: the engine pans from any part whose touch-action lets it and then
      // cancels the pointer, so a drag that lasts proves the drag zones keep the gesture.
      await t.test('a touch drag from the grip follows the finger and dismisses, and a touch drag on the content scrolls it', { skip: engine === 'chromium' ? false : 'touch input is sent through the Chrome DevTools Protocol' }, () => withPage({ hasTouch: true }, async (page) => {
        const cdp = await page.context().newCDPSession(page);
        // A finger from the middle of `selector` moved by `dy` in steps 25 ms apart, held still, then lifted; returns the sheet as held.
        const touchDrag = async (selector, dy) => {
          const box = await page.locator(selector).boundingBox();
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          const touch = (type, offset) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: y + offset, id: 1 }] });
          await touch('touchStart', 0);
          for (let step = 1; step <= 6; step += 1) {
            await touch('touchMove', (dy * step) / 6);
            await page.waitForTimeout(25);
          }
          await page.waitForTimeout(150);
          const held = await readSheet(page);
          await touch('touchEnd');
          return held;
        };
        await openSheet(page);
        const scrolled = await touchDrag('#rows li:nth-child(12)', -160);
        assert.deepEqual([scrolled.y, scrolled.dragging], [0, false], 'a touch drag on the content does not move the sheet');
        assert.ok(await page.locator('.muxui-dialog').evaluate((node) => node.scrollTop > 0), 'the sheet scrolls under the finger');

        const held = await touchDrag('.muxui-dialog__grip', 150);
        assert.ok(held.dragging && Math.abs(held.y - 150) < 2, `the sheet follows the finger one for one: ${JSON.stringify(held)}`);
        await waitForClosed(page);
        assert.deepEqual(await changes(page), [true, false]);
      }));

      await t.test('a short sheet dismisses past half its height', () => withPage({ mode: 'short' }, async (page) => {
        await openSheet(page);
        const { height } = await readSheet(page);
        assert.ok(height < 192, `the short sheet is under 192 pixels tall: ${height}`);
        await slowDrag(page, '.muxui-dialog__grip', Math.round(height / 2) - 12);
        await waitForRest(page);
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'short of half its height, it returns to rest');
        await slowDrag(page, '.muxui-dialog__grip', Math.round(height / 2) + 12);
        await waitForClosed(page);
      }));

      await t.test('an owner that keeps the Dialog open receives the close and the sheet returns to rest', () => withPage({ mode: 'rejected' }, async (page) => {
        await openSheet(page);
        await slowDrag(page, '.muxui-dialog__grip', 180);
        await waitForRest(page);
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'the sheet stays open');
        assert.deepEqual(await changes(page), [true, false], 'the drag reported the close request');
        assert.equal((await readSheet(page)).focusInside, true);
      }));

      await t.test('a sheet that is not dismissable has no grip, no close button and no drag, and its close-slot button still closes it', () => withPage({ mode: 'locked' }, async (page) => {
        await openSheet(page);
        assert.deepEqual([await page.locator('.muxui-dialog__grip').count(), await page.locator('.muxui-dialog__close').count()], [0, 0]);
        await page.keyboard.press('Escape');
        const { top } = await readSheet(page);
        await page.mouse.click(VIEWPORT.width / 2, top / 2);
        await slowDrag(page, '.muxui-dialog__title', 200);
        const locked = await readSheet(page);
        assert.deepEqual([locked.y, locked.dragging], [0, false], 'the title does not drag the sheet');
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'Escape, an outside press and a drag leave it open');
        await page.locator('#done').click();
        await waitForClosed(page);
        await waitForFocus(page, 'trigger');
      }));

      await t.test('a Popover opened inside the sheet sits above it and closes first', () => withPage({}, async (page) => {
        await openSheet(page);
        await page.locator('#nested-trigger').click();
        const popover = page.locator('.muxui-popover');
        await popover.waitFor();
        assert.equal(await popover.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
        }), true, 'the Popover paints above the sheet');
        await page.keyboard.press('Escape');
        await popover.waitFor({ state: 'detached' });
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'the first Escape closes only the Popover');
        await waitForFocus(page, 'nested-trigger');
        await page.keyboard.press('Escape');
        await waitForClosed(page);
        await waitForFocus(page, 'trigger');
      }));

      await t.test('a Popover opened while the sheet slides in follows its trigger to rest', () => withPage({}, async (page) => {
        const below = await duringEntry(page, 'nested');
        assert.ok(below > 40, `the Popover opened while the sheet was still sliding: ${below}`);
        await page.locator('.muxui-popover').waitFor();
        await waitForRest(page);
        await awaitFontsAndFrames(page);
        const gap = await page.evaluate(() => {
          const trigger = document.querySelector('#nested-trigger').getBoundingClientRect();
          const popover = document.querySelector('.muxui-popover').getBoundingClientRect();
          return Math.min(Math.abs(popover.top - trigger.bottom), Math.abs(trigger.top - popover.bottom));
        });
        assert.ok(gap < 24, `the Popover sits against its trigger once the sheet rests: ${gap} pixels apart`);
        // React Aria keeps the press away from the sheet while the Popover is open and closes the Popover on it, so no
        // drag can move the sheet under an open Popover.
        const grip = await page.locator('.muxui-dialog__grip').boundingBox();
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await page.mouse.down();
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 60, { steps: 3 });
        assert.equal((await readSheet(page)).dragging, false, 'the press on the grip starts no drag while the Popover is open');
        await page.mouse.up();
        await page.locator('.muxui-popover').waitFor({ state: 'detached' });
        await waitForRest(page);
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'the press closed only the Popover');
      }));

      await t.test('in a 320 by 230 viewport a wrapped description scrolls with the content, and the actions and the close button stay in reach', async () => {
        const small = { width: 320, height: 230 };
        // The action is the only way out of a sheet that is not dismissable.
        await withPage({ mode: 'locked', wordy: true, viewport: small }, async (page) => {
          await openSheet(page);
          const done = await reach(page, '#done');
          assert.ok(done.bottom <= small.height + 0.5 && done.inPanel && done.hit, `the action is in view and takes a press: ${JSON.stringify(done)}`);
          const titleTop = () => page.locator('.muxui-dialog__title').evaluate((node) => node.getBoundingClientRect().top);
          const before = await titleTop();
          await page.locator('.muxui-dialog__description').hover();
          await page.mouse.wheel(0, 120);
          await page.waitForFunction((top) => document.querySelector('.muxui-dialog__title').getBoundingClientRect().top < top - 20, before, { timeout: 3_000 });
          assert.deepEqual(await reach(page, '#done'), done, 'the action stays put while the title and description scroll');
          await page.locator('#done').click();
          await waitForClosed(page);
        });
        await withPage({ wordy: true, viewport: small }, async (page) => {
          await openSheet(page);
          const close = await reach(page, '.muxui-dialog__close');
          assert.ok(close.top >= 0 && close.bottom <= small.height && close.inPanel && close.hit, `the close button is in view and takes a press: ${JSON.stringify(close)}`);
          await page.locator('.muxui-dialog__description').hover();
          await page.mouse.wheel(0, 120);
          await page.waitForFunction(() => document.querySelector('.muxui-dialog').scrollTop > 0, undefined, { timeout: 3_000 });
          assert.deepEqual(await reach(page, '.muxui-dialog__close'), close, 'the close button stays put while the header scrolls');
        });
      });

      await t.test('a held drag ends at rest when the Dialog stops being dismissable, and a change of presentation leaves no motion behind', () => withPage({}, async (page) => {
        await openSheet(page);
        const grip = await page.locator('.muxui-dialog__grip').boundingBox();
        const x = grip.x + grip.width / 2;
        const y = grip.y + grip.height / 2;
        await slowDrag(page, '.muxui-dialog__grip', 120, { release: false });
        await page.evaluate(() => window.__muxuiSheet.setProps({ dismissable: false }));
        await page.mouse.move(x, y + 190, { steps: 3 });
        await waitForRest(page, 3_000).catch(() => {});
        const held = await readSheet(page);
        assert.deepEqual([held.y, held.dragging], [0, false], 'the drag ended and the sheet returned to rest');
        await page.mouse.up();
        assert.equal(await page.locator('.muxui-dialog').count(), 1);
        assert.deepEqual(await changes(page), [true]);

        await page.evaluate(() => window.__muxuiSheet.setProps({ dismissable: true }));
        await page.locator('.muxui-dialog__grip').waitFor();
        await slowDrag(page, '.muxui-dialog__grip', 130, { release: false });
        await page.evaluate(() => window.__muxuiSheet.setProps({ presentation: 'center' }));
        await page.mouse.up();
        // The centred Dialog's own motion hands the panel back to its stylesheet when it settles.
        await page.waitForFunction(() => {
          const panel = document.querySelector('.muxui-dialog');
          return panel.dataset.muxuiPresentation === 'center' && panel.style.opacity === '';
        });
        const centred = await page.evaluate(() => {
          const panel = document.querySelector('.muxui-dialog');
          const rect = panel.getBoundingClientRect();
          return { y: panel.style.getPropertyValue('--muxui-modal-y'), middle: rect.top + rect.height / 2 };
        });
        assert.ok(centred.y === '' && Math.abs(centred.middle - VIEWPORT.height / 2) < 1, `the Dialog settles in the middle: ${JSON.stringify(centred)}`);

        // Back to a sheet while the centred Dialog is still fading in, the sheet keeps none of that fade.
        await page.keyboard.press('Escape');
        await waitForClosed(page);
        await page.evaluate(async () => {
          const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
          document.querySelector('#trigger').click();
          while (!document.querySelector('.muxui-dialog')) await frame();
          await frame();
          window.__muxuiSheet.setProps({ presentation: 'sheet' });
        });
        await waitForRest(page);
        const sheet = await page.evaluate(() => {
          const panel = document.querySelector('.muxui-dialog');
          return { opacity: getComputedStyle(panel).opacity, scale: panel.style.getPropertyValue('--muxui-modal-scale'), bottom: Math.round(panel.getBoundingClientRect().bottom) };
        });
        assert.deepEqual(sheet, { opacity: '1', scale: '', bottom: VIEWPORT.height }, 'the sheet rests opaque on the bottom edge');
      }));

      await t.test('a smaller or scrolled visual viewport, as an on-screen keyboard leaves, lifts the sheet onto its bottom edge, and a change during a drag ends the drag', async () => {
        // A stand-in for window.visualViewport whose height and scroll the test sets, installed before any page script reads it.
        const initScript = () => {
          const viewport = new EventTarget();
          let height = null;
          let offsetTop = 0;
          let scale = 1;
          Object.defineProperties(viewport, {
            width: { get: () => document.documentElement.clientWidth },
            height: { get: () => height ?? document.documentElement.clientHeight },
            offsetTop: { get: () => offsetTop },
            offsetLeft: { get: () => 0 },
            pageTop: { get: () => offsetTop },
            pageLeft: { get: () => 0 },
            scale: { get: () => scale },
          });
          Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => viewport });
          window.__muxuiSetViewport = (next) => {
            height = next.height ?? null;
            offsetTop = next.offsetTop ?? 0;
            scale = next.scale ?? 1;
            viewport.dispatchEvent(new Event('resize'));
            viewport.dispatchEvent(new Event('scroll'));
          };
        };
        await withPage({ initScript }, async (page) => {
          const bottomAt = async (value) => {
            await page.waitForFunction((target) => Math.abs(document.querySelector('.muxui-dialog').getBoundingClientRect().bottom - target) < 1, value, { timeout: 3_000 }).catch(() => {});
            const { bottom } = await readSheet(page);
            assert.ok(Math.abs(bottom - value) < 1, `the sheet rests on the visible viewport's bottom edge at ${value}: ${bottom}`);
          };
          await openSheet(page);
          await page.evaluate(() => window.__muxuiSetViewport({ height: 400 }));
          await bottomAt(400);
          const lifted = await readSheet(page);
          assert.ok(lifted.top >= 0 && lifted.height <= 400 - 20, `the sheet fits above the keyboard: ${JSON.stringify(lifted)}`);
          assert.equal(await page.locator('.muxui-dialog__title').isVisible(), true);
          // The visible viewport scrolled 90 pixels down the page, as a keyboard can leave it: the sheet rests on its bottom edge.
          await page.evaluate(() => window.__muxuiSetViewport({ height: 400, offsetTop: 90 }));
          await bottomAt(490);
          assert.ok((await readSheet(page)).top >= 90, 'the sheet stays inside the visible viewport');
          await page.evaluate(() => window.__muxuiSetViewport({}));
          await bottomAt(VIEWPORT.height);
          // Pinch-zoomed and panned down the page: React Aria holds the viewport height while zoomed, so the sheet holds its place.
          await page.evaluate(() => window.__muxuiSetViewport({ height: 350, offsetTop: 300, scale: 2 }));
          await awaitFontsAndFrames(page);
          await bottomAt(VIEWPORT.height);
          await page.evaluate(() => window.__muxuiSetViewport({}));

          // The keyboard comes up during a drag: the drag ends and the sheet settles above the keyboard, so it never trails the pointer.
          await slowDrag(page, '.muxui-dialog__grip', 80, { release: false });
          await page.evaluate(() => window.__muxuiSetViewport({ height: 400 }));
          await waitForRest(page, 3_000).catch(() => {});
          const ended = await readSheet(page);
          assert.deepEqual([ended.y, ended.dragging], [0, false], 'the change ended the drag and the sheet settled');
          await bottomAt(400);
          await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 10, { steps: 3 });
          const after = await readSheet(page);
          assert.deepEqual([after.y, after.dragging], [0, false], 'the pointer no longer moves the sheet');
          await page.mouse.up();
          assert.equal(await page.locator('.muxui-dialog').count(), 1);
          assert.deepEqual(await changes(page), [true]);
        });
      });

      await t.test('a resize of the window during a drag ends the drag, and the sheet settles on the new bottom edge', () => withPage({}, async (page) => {
        await openSheet(page);
        await slowDrag(page, '.muxui-dialog__grip', 80, { release: false });
        await page.setViewportSize({ width: VIEWPORT.width, height: 400 });
        await waitForRest(page, 3_000).catch(() => {});
        const ended = await readSheet(page);
        assert.deepEqual([ended.y, ended.dragging], [0, false], 'the resize ended the drag and the sheet settled');
        await page.waitForFunction(() => Math.abs(document.querySelector('.muxui-dialog').getBoundingClientRect().bottom - 400) < 1, undefined, { timeout: 3_000 });
        await page.mouse.move(VIEWPORT.width / 2, 390, { steps: 3 });
        assert.equal((await readSheet(page)).dragging, false, 'the pointer no longer moves the sheet');
        await page.mouse.up();
        assert.equal(await page.locator('.muxui-dialog').count(), 1);
        assert.deepEqual(await changes(page), [true]);
      }));

      for (const dir of ['ltr', 'rtl']) {
        await t.test(`in ${dir}, the close button is a 44 pixel target at the logical end, clear of the title, and each safe-area inset pads its own side`, () => withPage({ dir }, async (page) => {
          await openSheet(page);
          const geometry = () => page.evaluate(() => {
            const panel = document.querySelector('.muxui-dialog');
            const close = panel.querySelector('.muxui-dialog__close').getBoundingClientRect();
            const title = panel.querySelector('.muxui-dialog__title');
            const range = document.createRange();
            range.selectNodeContents(title);
            const text = range.getBoundingClientRect();
            const box = panel.getBoundingClientRect();
            const side = (node, name) => Number.parseFloat(getComputedStyle(node).getPropertyValue(`padding-${name}`));
            return {
              close: { width: close.width, height: close.height, left: close.left - box.left, right: box.right - close.right },
              overlaps: close.left < text.right && close.right > text.left && close.top < text.bottom && close.bottom > text.top,
              middle: box.width / 2,
              // How far the title's text box sits from each side of the panel.
              titleLeft: side(panel, 'left') + side(title, 'left'),
              titleRight: side(panel, 'right') + side(title, 'right'),
            };
          });
          const plain = await geometry();
          assert.deepEqual([Math.round(plain.close.width), Math.round(plain.close.height)], [44, 44], 'the close button is a 44 by 44 target');
          const end = dir === 'rtl' ? plain.close.left : plain.close.right;
          assert.ok(end < plain.middle - 22, `the close button sits at the logical end: ${JSON.stringify(plain.close)}`);
          assert.equal(plain.overlaps, false, 'the close button leaves the title clear');
          // Chromium alone can stand in safe-area insets: a 60 pixel inset on the left, as on a phone held sideways, and a home indicator.
          if (engine !== 'chromium') return;
          await (await page.context().newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 34, left: 60 } });
          const inset = await geometry();
          assert.ok(inset.titleLeft >= 60 && inset.titleRight < 60, `the left inset pads the left and only the left: ${inset.titleLeft} left, ${inset.titleRight} right`);
          assert.equal(inset.overlaps, false, 'the close button still leaves the title clear');
          if (dir === 'rtl') assert.ok(inset.close.left >= 60, `the close button clears the left inset: ${inset.close.left}`);
          const bottom = await page.evaluate(() => {
            const panel = document.querySelector('.muxui-dialog');
            panel.scrollTop = panel.scrollHeight;
            for (const node of panel.querySelectorAll('.muxui-dialog__content')) node.scrollTop = node.scrollHeight;
            const last = document.querySelector('#rows li:last-child').getBoundingClientRect();
            return panel.getBoundingClientRect().bottom - last.bottom;
          });
          assert.ok(bottom >= 34, `the bottom inset pads the end of the sheet: ${bottom}`);
        }));
      }

      // No engine here can set env(safe-area-inset-*), so this proves only that the shipped stylesheet declares them.
      await t.test('the shipped stylesheet bounds the sheet by the visual viewport and pads it by every safe-area inset', () => withPage({}, async (page) => {
        const declarations = await page.evaluate(() => {
          const texts = [];
          const walk = (rules) => {
            for (const rule of rules) {
              if (rule.cssRules) walk(rule.cssRules);
              if (rule.selectorText?.includes('data-muxui-presentation="sheet"')) texts.push(rule.style.cssText);
            }
          };
          for (const sheet of document.styleSheets) walk(sheet.cssRules);
          return texts.join(' ');
        });
        for (const side of ['top', 'right', 'bottom', 'left']) assert.match(declarations, new RegExp(`env\\(safe-area-inset-${side}`, 'u'), `the sheet reads safe-area-inset-${side}`);
        assert.match(declarations, /var\(--visual-viewport-height/u, 'the sheet reads the visual viewport height');
      }));

      for (const scheme of ['light', 'dark']) {
        await t.test(`in ${scheme}, the grip reads at rest, on hover and while dragging, and the title and close button read`, () => withPage({ scheme }, async (page) => {
          await openSheet(page);
          // The press on the trigger leaves the pointer where the grip now is, and some engines hover it without a move.
          await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 4);
          const faint = await tokenColour(page, '--muxui-semantic-content-faint');
          await page.waitForFunction((colour) => getComputedStyle(document.querySelector('.muxui-dialog__grip'), '::before').backgroundColor === colour, faint);
          const rest = await paintsOf(page);
          // The backdrop's scrim fade can end a frame after the sheet settles, so the scrim is awaited.
          const scrim = await tokenColour(page, '--muxui-semantic-overlay-scrim');
          await page.waitForFunction((colour) => {
            const backdrop = getComputedStyle(document.querySelector('.muxui-dialog__backdrop'));
            return backdrop.backgroundColor === colour && backdrop.opacity === '1';
          }, scrim);
          assert.ok(rest.grip >= 3, `the resting grip has 3:1 with the sheet: ${rest.grip}`);
          assert.ok(rest.close >= 3, `the close icon has 3:1 with the sheet: ${rest.close}`);
          assert.ok(rest.title >= 4.5, `the title has 4.5:1 with the sheet: ${rest.title}`);
          await page.locator('.muxui-dialog__grip').hover();
          const hover = await tokenColour(page, '--muxui-semantic-content-muted');
          await page.waitForFunction((colour) => getComputedStyle(document.querySelector('.muxui-dialog__grip'), '::before').backgroundColor === colour, hover);
          assert.ok((await paintsOf(page)).grip >= 3, 'the hovered grip has 3:1 with the sheet');
          await page.mouse.down();
          await page.mouse.move(VIEWPORT.width / 2, (await page.locator('.muxui-dialog__grip').boundingBox()).y + 40, { steps: 2 });
          const pressed = await tokenColour(page, '--muxui-semantic-content-default');
          await page.waitForFunction((colour) => getComputedStyle(document.querySelector('.muxui-dialog__grip'), '::before').backgroundColor === colour, pressed);
          assert.notEqual(pressed, hover, 'dragging reads apart from hover');
          assert.ok((await paintsOf(page)).grip >= 3, 'the dragged grip has 3:1 with the sheet');
          // Held still past the speed window, the release is slow and short of the distance, so the sheet stays.
          await page.waitForTimeout(150);
          await page.mouse.up();
          await waitForRest(page);
        }));
      }

      await t.test('under forced colours the sheet stays opaque in system colours, and its grip and close button follow them', { skip: engine === 'chromium' ? false : 'forced colours are emulated in Chromium only' }, () => withPage({ forcedColors: 'active' }, async (page) => {
        await openSheet(page);
        const forced = await page.evaluate(() => {
          const panel = document.querySelector('.muxui-dialog');
          let opacity = 1;
          for (let node = panel; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
          const system = (name, property = 'color') => {
            const probe = document.createElement('div');
            probe.style.setProperty(property, name);
            probe.style.forcedColorAdjust = 'none';
            document.body.append(probe);
            const value = getComputedStyle(probe).getPropertyValue(property);
            probe.remove();
            return value;
          };
          return {
            opacity,
            scrim: getComputedStyle(panel.closest('.muxui-dialog__backdrop')).backgroundColor,
            surface: getComputedStyle(panel).backgroundColor,
            canvas: system('Canvas', 'background-color'),
            grip: getComputedStyle(document.querySelector('.muxui-dialog__grip'), '::before').backgroundColor,
            canvasText: system('CanvasText'),
            close: getComputedStyle(document.querySelector('.muxui-dialog__close')).color,
            buttonText: system('ButtonText'),
            highlight: system('Highlight'),
          };
        });
        assert.equal(forced.opacity, 1, 'the sheet and its backdrop keep full opacity');
        assert.notEqual(forced.scrim, 'rgba(0, 0, 0, 0)', `the backdrop still dims the page: ${forced.scrim}`);
        assert.equal(forced.surface, forced.canvas, 'the sheet is Canvas');
        assert.equal(forced.grip, forced.canvasText, 'the grip is CanvasText');
        assert.equal(forced.close, forced.buttonText, 'the close icon is ButtonText');
        await page.locator('.muxui-dialog__grip').hover();
        await page.waitForFunction((colour) => getComputedStyle(document.querySelector('.muxui-dialog__grip'), '::before').backgroundColor === colour, forced.highlight);
        await page.getByRole('button', { name: 'Close dialog' }).focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const ring = await page.locator('.muxui-dialog__close').evaluate((node) => ({ style: getComputedStyle(node).outlineStyle, width: Number.parseFloat(getComputedStyle(node).outlineWidth) }));
        assert.ok(ring.style !== 'none' && ring.width >= 2, `the focused close button shows a system outline: ${JSON.stringify(ring)}`);
      }));

      await t.test('reduced motion places the sheet at once with no grip bar and no fade, and turns the drag off', () => withPage({ reducedMotion: 'reduce' }, async (page) => {
        await page.locator('#trigger').click();
        await page.locator('.muxui-dialog').waitFor();
        const placed = await page.evaluate(() => {
          const panel = document.querySelector('.muxui-dialog');
          const backdrop = panel.closest('.muxui-dialog__backdrop');
          return {
            y: panel.style.getPropertyValue('--muxui-modal-y'),
            reduced: panel.hasAttribute('data-muxui-dialog-reduced'),
            grip: getComputedStyle(panel.querySelector('.muxui-dialog__grip'), '::before').display,
            transition: getComputedStyle(backdrop).transitionDuration,
          };
        });
        assert.deepEqual(placed, { y: '', reduced: true, grip: 'none', transition: '0s' }, 'the sheet is at rest at once, with no grip bar and no backdrop fade');
        await slowDrag(page, '.muxui-dialog__title', 200);
        const sheet = await readSheet(page);
        assert.deepEqual([sheet.y, sheet.dragging], [0, false], 'the title does not drag the sheet');
        assert.equal(await page.locator('.muxui-dialog').count(), 1);
        await page.keyboard.press('Escape');
        await page.locator('.muxui-dialog__backdrop').waitFor({ state: 'detached', timeout: 2_000 });
      }));

      await t.test('a reduction that arrives during a drag ends it and puts the sheet at rest', () => withPage({}, async (page) => {
        await openSheet(page);
        await slowDrag(page, '.muxui-dialog__grip', 120, { release: false });
        assert.equal((await readSheet(page)).dragging, true);
        await page.locator('#sheet-scope').evaluate((node) => node.setAttribute('data-muxui-motion', 'reduced'));
        await waitForRest(page);
        await page.mouse.up();
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'the release after the reduction does not dismiss');
        assert.equal(await page.locator('.muxui-dialog__grip').evaluate((node) => getComputedStyle(node, '::before').display), 'none', 'the grip bar goes with the drag');
        assert.deepEqual(await changes(page), [true]);
      }));
    } finally {
      await browser?.close();
      await server.close();
    }
  });
}

import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { PopoverAnchorFixture } from '../fixtures/popover-anchor-fixture.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof of a Popover opened from code, without a trigger. Server markup holds none of it, and one open from
// the start opens after hydration, named and placed against its anchor. Its owner hears Escape, an outside press and
// the close slot; a press on its anchor is not an outside press. A collision boundary keeps it inside an element where
// the viewport alone would let it overflow, in either direction, and a replaced or removed boundary or anchor is picked
// up while it is open. An initial focus target takes focus in one move, and a return target takes focus when the opener
// is gone. Reduced motion and the colour scheme scope are read from its anchor; forced colours paint it in system
// colours (emulated in Chromium only). Inside a sheet on a phone-sized viewport, it opens from its tool after the sheet
// rests and while the sheet slides in, stays inside the sheet's panel, keeps its field focused, and closes first.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const WIDE = { width: 900, height: 700 };
const PHONE = { width: 390, height: 700 };

function documentHtml(url) {
  const props = JSON.parse(url.searchParams.get('props') ?? '{}');
  const dir = url.searchParams.get('dir') === 'rtl' ? ' dir="rtl" lang="ar"' : '';
  const body = renderToString(React.createElement(PopoverAnchorFixture, {
    ...props, open: props.open === true, sheetOpen: props.sheetOpen === true, onOpenChange: () => {}, onSheetOpenChange: () => {},
  }));
  return pageShell({
    attributes: `data-muxui-color-scheme="light" data-muxui-motion="full"${dir}`,
    head: '<link rel="stylesheet" href="/generated/styles.css">',
    bodyAttributes: 'style="margin:0;background:var(--muxui-semantic-surface-canvas);color:var(--muxui-semantic-content-strong)"',
    body: `<div id="root">${body}</div>`,
    entry: '/test/fixtures/popover-anchor-browser-entry.mjs',
  });
}

const rectOf = (page, selector) => page.locator(selector).evaluate((node) => {
  const { top, bottom, left, right } = node.getBoundingClientRect();
  return { top, bottom, left, right };
});
// Where React Aria placed the Popover, which its entry and exit motion leave alone.
const placedAt = (page) => page.locator('.muxui-popover__positioner').evaluate((node) => ({ top: node.style.top, left: node.style.left, bottom: node.style.bottom, right: node.style.right }));
const activeId = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
const changes = (page) => page.evaluate(() => window.__popoverAnchor.changes);
const setProps = (page, props) => page.evaluate((next) => window.__popoverAnchor.setProps(next), props);
const setOpen = (page, open) => page.evaluate((next) => window.__popoverAnchor.setOpen(next), open);
const frames = (page, count = 2) => page.evaluate((total) => new Promise((resolve) => {
  let left = total;
  const step = () => (left-- > 0 ? requestAnimationFrame(step) : resolve());
  step();
}), count);
const popover = (page) => page.locator('.muxui-popover');

// Waits until the Popover has finished its entry motion, so its box is where React Aria placed it.
const settled = (page) => page.waitForFunction(() => {
  const positioner = document.querySelector('.muxui-popover__positioner');
  if (!positioner) return false;
  const style = getComputedStyle(positioner);
  return Number(style.opacity) >= 0.999 && /^(?:none|0px(?: 0px)?)$/u.test(style.translate);
});

// Opens the Popover from its Link tool with the keyboard, so the tool is the opener in every engine.
async function openFromTool(page, tool = '#link') {
  await page.locator(tool).focus();
  await page.keyboard.press('Enter');
  await popover(page).waitFor();
}

// React Aria returns focus a frame after the Popover unmounts and the fallback runs a frame later; waits for `id`, then
// two more frames, and returns where focus is.
async function focusAfterClose(page, id) {
  await popover(page).waitFor({ state: 'detached' });
  if (id === 'BODY') {
    await frames(page, 4);
    await page.waitForTimeout(150);
  } else {
    await page.waitForFunction((target) => document.activeElement?.id === target, id);
  }
  await frames(page, 2);
  return activeId(page);
}

// Records every element focus moves to, by id or tag, from now on.
const recordFocus = (page) => page.evaluate(() => {
  window.__focusLog = [];
  document.addEventListener('focusin', (event) => window.__focusLog.push(event.target.id || event.target.className || event.target.tagName), true);
});
const focusLog = (page) => page.evaluate(() => window.__focusLog);

// Whether the Popover's box lies inside `selector`'s box, `inset` pixels from each edge.
const insideOf = (page, selector, inset) => page.evaluate(({ target, padding }) => {
  const box = document.querySelector(target).getBoundingClientRect();
  const rect = document.querySelector('.muxui-popover').getBoundingClientRect();
  return rect.left >= box.left + padding - 1 && rect.right <= box.right - padding + 1 && rect.top >= box.top + padding - 1 && rect.bottom <= box.bottom - padding + 1;
}, { target: selector, padding: inset });

// The panel of the sheet at rest: no travel and no drag.
const waitForSheetRest = (page) => page.waitForFunction(() => {
  const panel = document.querySelector('.muxui-dialog');
  return Boolean(panel) && panel.style.getPropertyValue('--muxui-modal-y') === '' && !panel.hasAttribute('data-muxui-state-dragging');
});

for (const engine of browserEngines()) {
  test(`a Popover opened from code is placed against its anchor, stays inside its boundary, and moves focus as told in ${engine}`, { timeout: 300_000 }, async (t) => {
    const server = await startServer({ entries: ['test/fixtures/popover-anchor-browser-entry.mjs'], pages: { '/popover-anchor.html': documentHtml } });
    let browser;
    try {
      browser = await launchBrowser(engine);

      // Opens the fixture with `props` in a context of its own and runs `run` with the page and its server markup; any
      // error the page logged fails the case.
      const withPage = async ({ props = {}, dir = 'ltr', strict = false, viewport = WIDE, forcedColors } = {}, run) => {
        const context = await browser.newContext({ viewport, locale: dir === 'rtl' ? 'ar-EG' : 'en-US', ...(forcedColors && { forcedColors }) });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        try {
          const url = `${server.url}/popover-anchor.html?${new URLSearchParams({ props: JSON.stringify(props), dir, ...(strict && { strict: '1' }) })}`;
          const html = await (await page.request.get(url)).text();
          await page.goto(url, { waitUntil: 'load' });
          await page.waitForFunction(() => document.documentElement.dataset.popoverAnchorHydrated === 'true');
          await awaitFontsAndFrames(page);
          await run(page, html);
          assert.deepEqual(errors, [], errors.join(' | '));
        } finally {
          await context.close();
        }
      };

      await t.test('server markup holds no Popover, and one open from the start opens after hydration, named and placed against its anchor', () => withPage({ props: { uncontrolled: true, defaultOpen: true } }, async (page, html) => {
        assert.doesNotMatch(html, /muxui-popover|Add link/u, 'the server renders nothing of the Popover');
        await page.getByRole('dialog', { name: 'Add link' }).waitFor();
        await settled(page);
        const anchor = await rectOf(page, '#link');
        const surface = await rectOf(page, '.muxui-popover');
        assert.ok(surface.top - anchor.bottom > 4 && surface.top - anchor.bottom < 12, `the Popover opens below its anchor: ${surface.top - anchor.bottom}`);
        assert.ok(Math.abs(surface.left - anchor.left) < 2, 'bottom-start lines up the start edges');
        assert.equal(await page.locator('[aria-expanded], [aria-controls], [aria-haspopup]').count(), 0, 'nothing claims to be its trigger');
      }));

      await t.test('opened from code it takes focus from its opener, Escape asks its owner to close it, and focus returns to the opener', () => withPage({}, async (page) => {
        await openFromTool(page);
        await page.waitForFunction(() => document.activeElement?.classList.contains('muxui-popover'));
        await page.keyboard.press('Escape');
        assert.equal(await focusAfterClose(page, 'link'), 'link');
        assert.deepEqual(await changes(page), [true, false]);
      }));

      await t.test('an owner that keeps it open receives the close request, and the close slot closes an uncontrolled one', async () => {
        await withPage({}, async (page) => {
          await page.evaluate(() => {
            const { setProps: set } = window.__popoverAnchor;
            set({ onOpenChange: (next) => window.__popoverAnchor.changes.push(next) });
          });
          await setOpen(page, true);
          await popover(page).waitFor();
          await page.keyboard.press('Escape');
          await frames(page);
          assert.equal(await popover(page).count(), 1, 'the owner kept it open');
          assert.deepEqual(await changes(page), [false]);
        });
        await withPage({ props: { uncontrolled: true, defaultOpen: true } }, async (page) => {
          await popover(page).waitFor();
          await page.locator('#done').click();
          await popover(page).waitFor({ state: 'detached' });
          assert.deepEqual(await changes(page), [false]);
        });
      });

      await t.test('non-modal, it keeps focus on its opener, a press on its anchor leaves it open, an outside press closes it, and so does Escape inside it', () => withPage({ props: { modal: false } }, async (page) => {
        await openFromTool(page);
        await frames(page);
        assert.equal(await activeId(page), 'link', 'focus stays on the opener');
        await page.locator('#link').click();
        await frames(page);
        assert.equal(await popover(page).count(), 1, 'a press on the anchor is not an outside press');
        await page.locator('#outside').click();
        await popover(page).waitFor({ state: 'detached' });
        await setOpen(page, true);
        await popover(page).waitFor();
        await page.locator('#address').focus();
        await page.keyboard.press('Escape');
        await popover(page).waitFor({ state: 'detached' });
        assert.deepEqual((await changes(page)).filter((change) => change === false).length, 2, 'the outside press and Escape each asked to close it');
      }));

      for (const dir of ['ltr', 'rtl']) {
        await t.test(`in ${dir}, a boundary keeps it inside the frame, where the viewport alone lets it overflow the frame's edge`, async () => {
          const overflowEdge = (surface, frame) => (dir === 'rtl' ? frame.left - surface.left : surface.right - frame.right);
          await withPage({ dir, props: {} }, async (page) => {
            await setOpen(page, true);
            await popover(page).waitFor();
            await settled(page);
            const overflow = overflowEdge(await rectOf(page, '.muxui-popover'), await rectOf(page, '#frame'));
            assert.ok(overflow > 20, `without a boundary the Popover passes the frame's edge: ${overflow}`);
          });
          await withPage({ dir, props: { boundary: 'frame', uncontrolled: true, defaultOpen: true } }, async (page) => {
            await popover(page).waitFor();
            await settled(page);
            assert.equal(await insideOf(page, '#frame', 12), true, 'with the frame as boundary it stays inside, containerPadding from its edges');
          });
        });
      }

      await t.test('a boundary flips it to the side with room, where the viewport alone keeps it on the placed side', async () => {
        await withPage({ props: { toolbarAt: 'bottom' } }, async (page) => {
          await setOpen(page, true);
          await popover(page).waitFor();
          await settled(page);
          const [anchor, surface] = [await rectOf(page, '#link'), await rectOf(page, '.muxui-popover')];
          assert.ok(surface.top > anchor.bottom, 'without a boundary it opens below the anchor, past the frame');
        });
        await withPage({ props: { toolbarAt: 'bottom', boundary: 'frame' } }, async (page) => {
          await setOpen(page, true);
          await popover(page).waitFor();
          await settled(page);
          const [anchor, surface] = [await rectOf(page, '#link'), await rectOf(page, '.muxui-popover')];
          assert.ok(surface.bottom < anchor.top, 'with the frame as boundary it flips above the anchor');
          assert.equal(await insideOf(page, '#frame', 12), true);
        });
      });

      await t.test('a boundary replaced or removed while it is open places it again without reopening', () => withPage({ props: { boundary: 'frame' } }, async (page) => {
        await setOpen(page, true);
        await popover(page).waitFor();
        await settled(page);
        assert.equal(await insideOf(page, '#frame', 12), true);
        const frame = await rectOf(page, '#frame');
        await setProps(page, { boundary: 'page' });
        await page.waitForFunction((edge) => document.querySelector('.muxui-popover').getBoundingClientRect().right > edge + 20, frame.right);
        await setProps(page, { boundary: 'frame' });
        await page.waitForFunction(() => {
          const box = document.querySelector('#frame').getBoundingClientRect();
          return document.querySelector('.muxui-popover').getBoundingClientRect().right <= box.right - 11;
        });
        await setProps(page, { boundary: 'none' });
        await page.waitForFunction((edge) => document.querySelector('.muxui-popover').getBoundingClientRect().right > edge + 20, frame.right);
        assert.deepEqual(await changes(page), [], 'it stayed open throughout');
      }));

      await t.test('a replaced anchor places it again; while its anchor is gone it stays where it was, named, and still closes', () => withPage({}, async (page) => {
        await openFromTool(page);
        await setProps(page, { anchor: 'second' });
        await page.waitForFunction(() => {
          const second = document.querySelector('#second').getBoundingClientRect();
          const gap = document.querySelector('.muxui-popover').getBoundingClientRect().top - second.bottom;
          return gap > 4 && gap < 12;
        });
        const placed = await placedAt(page);
        await setProps(page, { anchor: 'none' });
        await frames(page, 3);
        assert.deepEqual(await placedAt(page), placed, 'it stays where it was last placed');
        assert.equal(await page.getByRole('dialog', { name: 'Add link' }).count(), 1);
        await page.keyboard.press('Escape');
        assert.equal(await focusAfterClose(page, 'link'), 'link');
      }));

      await t.test('an anchor scrolled out of view leaves a modal Popover open where it was, and closes a non-modal one', async () => {
        await withPage({ props: { boundary: 'frame' } }, async (page) => {
          await openFromTool(page);
          const before = await placedAt(page);
          await page.locator('#frame').evaluate((node) => { node.scrollTop = 300; });
          await frames(page, 3);
          assert.deepEqual(await placedAt(page), before, 'a modal Popover is not placed again while its anchor scrolls');
          assert.equal(await page.evaluate(() => document.querySelector('.muxui-popover').contains(document.activeElement)), true, 'focus stays inside');
          await page.keyboard.press('Escape');
          assert.equal(await focusAfterClose(page, 'link'), 'link');
        });
        await withPage({ props: { modal: false } }, async (page) => {
          await openFromTool(page);
          await page.locator('#frame').evaluate((node) => { node.scrollTop = 300; });
          await popover(page).waitFor({ state: 'detached' });
          assert.deepEqual(await changes(page), [true, false]);
        });
      });

      for (const modal of [true, false]) {
        await t.test(`${modal ? 'modal' : 'non-modal'}, an initial focus target takes focus as it opens, in one move`, () => withPage({ props: { modal, initialFocus: true } }, async (page) => {
          await page.locator('#link').focus();
          await recordFocus(page);
          await page.keyboard.press('Enter');
          await popover(page).waitFor();
          await page.waitForFunction(() => document.activeElement?.id === 'address');
          await frames(page, 3);
          assert.deepEqual(await focusLog(page), ['address'], 'focus moves to the field once, and the surface never takes it');
        }));
      }

      await t.test('an initial focus target that cannot take focus is skipped, and an uncontrolled Popover open on load focuses its target', async () => {
        await withPage({ props: { initialFocus: true, fieldDisabled: true } }, async (page) => {
          await openFromTool(page);
          await page.waitForFunction(() => document.activeElement?.classList.contains('muxui-popover'));
        });
        await withPage({ props: { initialFocus: true, uncontrolled: true, defaultOpen: true } }, async (page) => {
          await popover(page).waitFor();
          await page.waitForFunction(() => document.activeElement?.id === 'address');
        });
      });

      // Each case opens the Popover from its Link tool (or, with `body`, from code with focus on the page), makes the tool
      // `opener`, closes it, and expects focus on `expected`.
      const returnCases = [
        ['removed', true, 'editor'],
        ['removed', false, 'frame'],
        ['hidden', true, 'editor'],
        ['hidden', false, 'BODY'],
        ['disabled', true, 'editor'],
        ['disabled', false, 'BODY'],
        ['shown', true, 'link'],
        ['body', true, 'editor'],
        ['body', false, 'BODY'],
      ];
      for (const [opener, returnFocus, expected] of returnCases) {
        const name = opener === 'body' ? 'with no element focused when it opened' : `with its opener ${opener === 'shown' ? 'still shown' : opener}`;
        await t.test(`${name} and ${returnFocus ? 'a' : 'no'} return target, focus goes to ${expected} as it closes`, () => withPage({ props: { returnFocus } }, async (page) => {
          if (opener === 'body') {
            await setOpen(page, true);
            await popover(page).waitFor();
          } else {
            await openFromTool(page);
            if (opener !== 'shown') await setProps(page, { opener });
          }
          await page.waitForFunction(() => document.querySelector('.muxui-popover').contains(document.activeElement));
          await page.keyboard.press('Escape');
          assert.equal(await focusAfterClose(page, expected), expected);
        }));
      }

      await t.test('a Popover unmounted while open hands focus to its return target when its opener is gone too', () => withPage({ props: { returnFocus: true } }, async (page) => {
        await openFromTool(page);
        await setProps(page, { mounted: false, opener: 'disabled' });
        assert.equal(await focusAfterClose(page, 'editor'), 'editor');
      }));

      await t.test('a non-modal Popover that focus never entered leaves focus where it is as it closes', () => withPage({ props: { modal: false, returnFocus: true } }, async (page) => {
        await setOpen(page, true);
        await popover(page).waitFor();
        await setOpen(page, false);
        assert.equal(await focusAfterClose(page, 'BODY'), 'BODY');
      }));

      await t.test('in StrictMode, a non-modal Popover opened with no element focused moves focus only once it has gone', () => withPage({ strict: true, props: { modal: false, returnFocus: true } }, async (page) => {
        await setOpen(page, true);
        await popover(page).waitFor();
        await frames(page, 4);
        assert.equal(await activeId(page), 'BODY', 'nothing moves focus while it is open');
        await page.locator('#address').focus();
        await frames(page, 4);
        assert.equal(await activeId(page), 'address');
        await setOpen(page, false);
        assert.equal(await focusAfterClose(page, 'editor'), 'editor');
      }));

      await t.test('reduced motion read from its anchor\'s scope opens and closes it at once', () => withPage({ props: { frameScope: { 'data-muxui-motion': 'reduced' } } }, async (page) => {
        await page.evaluate(() => {
          for (const role of ['reveal', 'dismiss']) {
            document.documentElement.style.setProperty(`--muxui-semantic-motion-${role}-duration`, '4000ms');
            document.documentElement.style.setProperty(`--muxui-semantic-motion-${role}-transition-duration`, '4000ms');
          }
        });
        await openFromTool(page);
        await page.waitForFunction(() => {
          const positioner = document.querySelector('.muxui-popover__positioner');
          const style = getComputedStyle(positioner);
          return positioner.hasAttribute('data-muxui-motion-reduced') && Number(style.opacity) >= 0.999 && /^(?:none|0px(?: 0px)?)$/u.test(style.translate);
        }, undefined, { timeout: 1500 });
        await page.keyboard.press('Escape');
        await popover(page).waitFor({ state: 'detached', timeout: 1500 });
      }));

      await t.test('a colour scheme Popover carries the preset theme of its anchor\'s scope', () => withPage({ props: { colorScheme: 'dark', frameScope: { 'data-muxui-theme': 'standard-harbour' } } }, async (page) => {
        await setOpen(page, true);
        await popover(page).waitFor();
        const positioner = page.locator('.muxui-popover__positioner');
        assert.equal(await positioner.getAttribute('data-muxui-color-scheme'), 'dark');
        assert.equal(await positioner.getAttribute('data-muxui-theme'), 'standard-harbour', 'the theme comes from the anchor\'s scope, not the document root');
      }));

      await t.test('under forced colours it paints in system colours', { skip: engine === 'chromium' ? false : 'forced colours are emulated in Chromium only' }, () => withPage({ forcedColors: 'active', props: { boundary: 'frame' } }, async (page) => {
        await setOpen(page, true);
        await popover(page).waitFor();
        const paint = await page.evaluate(() => {
          const probe = document.createElement('div');
          document.body.append(probe);
          const system = (colour) => {
            probe.style.color = colour;
            return getComputedStyle(probe).color;
          };
          const canvas = system('Canvas');
          const text = system('CanvasText');
          probe.remove();
          const style = getComputedStyle(document.querySelector('.muxui-popover'));
          return { canvas, text, background: style.backgroundColor, color: style.color, border: style.borderTopColor };
        });
        assert.equal(paint.background, paint.canvas);
        assert.equal(paint.color, paint.text);
        assert.equal(paint.border, paint.text);
      }));

      // The sheet: a phone-sized viewport, the toolbar row as anchor, the sheet's panel as boundary, the address field as
      // initial focus target and the editor as return target.
      const sheetProps = { layout: 'sheet', anchor: 'row', boundary: 'sheet', initialFocus: true, returnFocus: true };
      // The sheet's dialog focuses itself on mount and again after 500 ms if focus is on it or on the body.
      const keepsFieldFocus = async (page) => {
        await page.waitForFunction(() => document.activeElement?.id === 'address');
        await page.waitForTimeout(650);
        assert.equal(await activeId(page), 'address', 'the field keeps focus past the sheet\'s own refocus');
      };
      const sitsAgainstToolbar = (page) => page.evaluate(() => {
        const toolbar = document.querySelector('#sheet-toolbar').getBoundingClientRect();
        const surface = document.querySelector('.muxui-popover').getBoundingClientRect();
        return Math.min(Math.abs(surface.top - toolbar.bottom), Math.abs(toolbar.top - surface.bottom));
      });

      await t.test('in a sheet at rest, it opens from its tool against the toolbar inside the sheet, its field takes focus once and keeps it, and Escape closes it first', () => withPage({ viewport: PHONE, props: sheetProps }, async (page) => {
        await page.locator('#sheet-trigger').click();
        await waitForSheetRest(page);
        await page.locator('#sheet-link').focus();
        await recordFocus(page);
        await page.keyboard.press('Enter');
        await popover(page).waitFor();
        await keepsFieldFocus(page);
        assert.deepEqual(await focusLog(page), ['address']);
        await settled(page);
        assert.ok(await sitsAgainstToolbar(page) < 24, 'it sits against the toolbar');
        assert.equal(await insideOf(page, '.muxui-dialog', 12), true, 'it stays inside the sheet\'s panel');
        await page.keyboard.press('Escape');
        assert.equal(await focusAfterClose(page, 'sheet-link'), 'sheet-link');
        assert.equal(await page.locator('.muxui-dialog').count(), 1, 'the first Escape closes only the Popover');
        await page.keyboard.press('Escape');
        await page.locator('.muxui-dialog__backdrop').waitFor({ state: 'detached' });
        await page.waitForFunction(() => document.activeElement?.id === 'sheet-trigger');
      }));

      // This case needs the sheet to place the overlays opened inside it again while it moves.
      await t.test('opened from code while the sheet slides in, it follows its anchor to rest inside the sheet and keeps its field focused', () => withPage({ viewport: PHONE, props: sheetProps }, async (page) => {
        const below = await page.evaluate(async () => {
          const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
          document.querySelector('#sheet-trigger').click();
          let panel = null;
          while (!(panel = document.querySelector('.muxui-dialog'))) await frame();
          await frame();
          await frame();
          const y = Number.parseFloat(panel.style.getPropertyValue('--muxui-modal-y')) || 0;
          window.__popoverAnchor.setOpen(true);
          return y;
        });
        assert.ok(below > 40, `the Popover opened while the sheet was still sliding: ${below}`);
        await popover(page).waitFor();
        await waitForSheetRest(page);
        await settled(page);
        await awaitFontsAndFrames(page);
        assert.ok(await sitsAgainstToolbar(page) < 24, `it sits against the toolbar once the sheet rests: ${await sitsAgainstToolbar(page)} pixels apart`);
        assert.equal(await insideOf(page, '.muxui-dialog', 12), true, 'it stays inside the sheet\'s panel');
        await keepsFieldFocus(page);
      }));

      await t.test('in a sheet, a tool disabled while its Popover is open hands focus to the return target inside the sheet', () => withPage({ viewport: PHONE, props: sheetProps }, async (page) => {
        await page.locator('#sheet-trigger').click();
        await waitForSheetRest(page);
        await openFromTool(page, '#sheet-link');
        await setProps(page, { opener: 'disabled' });
        await page.waitForFunction(() => document.activeElement?.id === 'address');
        await page.keyboard.press('Escape');
        assert.equal(await focusAfterClose(page, 'sheet-editor'), 'sheet-editor');
        assert.equal(await page.locator('.muxui-dialog').count(), 1);
      }));
    } finally {
      await browser?.close();
      await server.close();
    }
  });
}

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { PopoverAnchorFixture } from '../fixtures/popover-anchor-fixture.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, repositoryRoot, startServer } from './harness.mjs';

// Cross-engine proof of a Popover opened from code, without a trigger. Server markup holds none of it, and one open from
// the start opens after hydration, named and placed against its anchor. Its owner hears Escape, an outside press and
// the close slot; a press on its anchor is not an outside press, nor, non-modal, is the focus that press moves, while a
// modal one closes on a press where its anchor is. A collision boundary keeps it inside an element where the viewport
// alone would let it overflow, in either direction, and scrolls what does not fit; one narrower than its content keeps
// it inside too, the catalog's boundary example among them, and wraps the text; a replaced or removed boundary or
// anchor is picked up while it is open. It follows an anchor that layout moves or that mounts after it, and stays put
// when an anchor of its own unmounts and the window resizes. An initial focus target takes focus in one move, and a
// return target takes focus when the opener is gone. Reduced motion and the colour scheme scope are read from its
// anchor; forced colours paint it in system colours (emulated in Chromium only). Inside a sheet on a phone-sized
// viewport, it opens from its tool after the sheet rests, keeps its distance from its anchor on every frame while the
// sheet slides in, and opened in the same update as the sheet it is on top of it; it stays inside the sheet's panel,
// keeps its field focused, hides the sheet from the accessibility tree, and closes first. Opened in the same update as a
// centred Dialog or another Popover around it, or mounting open with a menu that the same press opens, it is on top of
// that too, and focus comes to rest on the body at no step; opened from a menu's item, it is on top as the menu closes.
// A Popover open as it mounts on its own, with a trigger, is in the page when its owner's effects run.
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

// A page rendered in the browser alone: the catalog's boundary example from its own source (`case=example`), or a
// paragraph of ordinary text in a region 232 pixels wide (`case=paragraph`). Each has a Share trigger, and the region
// that bounds the Popover is the first element in #root.
const BOUNDARY_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Popover } from '@muxui/react';
import { PopoverBoundaryExample } from '/@fs${resolve(repositoryRoot, 'catalog/components/popover/examples/react/boundary.tsx')}';

const h = React.createElement;
function Paragraph() {
  const regionRef = React.useRef(null);
  return h('div', { ref: regionRef, style: { inlineSize: 232, blockSize: 360, border: '1px solid' } },
    h(Popover, { 'aria-label': 'About sharing', boundaryRef: regionRef, placement: 'bottom-start', trigger: h(Button, { variant: 'neutral' }, 'Share') },
      h('p', { style: { margin: 0 } }, 'Anyone with the link can open the page, and the people you invite by name can comment on it and edit it too.')));
}
const example = new URLSearchParams(window.location.search).get('case') === 'example';
createRoot(document.getElementById('root')).render(h(example ? PopoverBoundaryExample : Paragraph));
`;

function boundaryHtml(url) {
  const dir = url.searchParams.get('dir') === 'rtl' ? ' dir="rtl" lang="ar"' : '';
  return pageShell({
    attributes: `data-muxui-color-scheme="light" data-muxui-motion="full"${dir}`,
    head: '<link rel="stylesheet" href="/generated/styles.css">',
    bodyAttributes: 'style="margin:16px;background:var(--muxui-semantic-surface-canvas);color:var(--muxui-semantic-content-strong)"',
    body: '<div id="root"></div>',
    entry: '/popover-boundary-entry.mjs',
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
// The names of the dialogs the accessibility tree holds: those outside every inert or aria-hidden subtree.
const exposedDialogs = (page) => page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')]
  .filter((node) => !node.closest('[inert], [aria-hidden="true"]'))
  .map((node) => node.getAttribute('aria-label') ?? document.getElementById(node.getAttribute('aria-labelledby') ?? '')?.textContent ?? ''));

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

// Where focus rests after four frames and a pause: React Aria restores focus a frame after an overlay unmounts, and the
// fallback runs a frame after that.
async function restingFocus(page) {
  await frames(page, 4);
  await page.waitForTimeout(150);
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

// The panel of the sheet at rest: it has not moved for five frames.
const waitForSheetRest = (page) => page.evaluate(() => new Promise((resolve) => {
  let still = 0;
  let last = null;
  const step = () => {
    const top = document.querySelector('.muxui-dialog')?.getBoundingClientRect().top ?? null;
    still = top !== null && top === last ? still + 1 : 0;
    last = top;
    if (still >= 5) resolve();
    else requestAnimationFrame(step);
  };
  step();
}));

for (const engine of browserEngines()) {
  test(`a Popover opened from code is placed against its anchor, stays inside its boundary, and moves focus as told in ${engine}`, { timeout: 300_000 }, async (t) => {
    const server = await startServer({
      entries: ['test/fixtures/popover-anchor-browser-entry.mjs'],
      pages: { '/popover-anchor.html': documentHtml, '/popover-boundary.html': boundaryHtml },
      // The catalog source imports the package by its public name.
      alias: { '@muxui/react': '/muxui-react.mjs' },
      modules: {
        '/popover-boundary-entry.mjs': BOUNDARY_ENTRY,
        '/muxui-react.mjs': "export { Button } from '/src/button.ts';\nexport { Popover } from '/src/overlays.ts';\n",
      },
    });
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

      await t.test('open as it mounts on its own, with defaultOpen or a controlled open, its content is in the page when its owner\'s effect runs', async () => {
        for (const how of ['default', 'controlled']) {
          await withPage({}, async (page) => {
            await setProps(page, { rename: how });
            await page.locator('#name').waitFor();
            await frames(page, 2);
            assert.equal(await page.evaluate(() => window.__popoverAnchor.renameFound), true, `${how}: the owner's effect finds the name field in the page`);
            assert.equal(await activeId(page), 'name', `${how}: the field the owner focused keeps focus`);
            await page.keyboard.type('X');
            assert.equal(await page.locator('#name').inputValue(), 'X', `${how}: typing replaces the name the owner selected`);
          });
        }
      });

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

      await t.test('non-modal, a press on its anchor with focus in its field leaves it open; modal, a press where its anchor is lands on the inert page and closes it', async () => {
        await withPage({ props: { modal: false } }, async (page) => {
          await openFromTool(page);
          await page.locator('#address').focus();
          await popover(page).evaluate((node) => { node.dataset.probe = 'first'; });
          await page.locator('#link').click();
          await frames(page, 3);
          assert.equal(await page.locator('.muxui-popover[data-probe="first"]').count(), 1, 'the same Popover stays open');
          assert.equal((await changes(page)).includes(false), false, 'nothing asked to close it');
        });
        await withPage({}, async (page) => {
          await openFromTool(page);
          const link = await rectOf(page, '#link');
          await page.mouse.click((link.left + link.right) / 2, (link.top + link.bottom) / 2);
          await popover(page).waitFor({ state: 'detached' });
          assert.deepEqual(await changes(page), [true, false]);
        });
      });

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

      for (const dir of ['ltr', 'rtl']) {
        await t.test(`in ${dir}, a boundary narrower than its content keeps it inside: the catalog's boundary example, and a paragraph in a region 232 pixels wide`, async () => {
          for (const which of ['example', 'paragraph']) {
            const context = await browser.newContext({ viewport: WIDE, locale: dir === 'rtl' ? 'ar-EG' : 'en-US' });
            const page = await context.newPage();
            page.setDefaultTimeout(10_000);
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            try {
              await page.goto(`${server.url}/popover-boundary.html?${new URLSearchParams({ case: which, dir })}`, { waitUntil: 'load' });
              await page.getByRole('button', { name: 'Share' }).click();
              await popover(page).waitFor();
              await settled(page);
              const [region, surface] = [await rectOf(page, '#root > div'), await rectOf(page, '.muxui-popover')];
              assert.equal(await insideOf(page, '#root > div', 12), true, `${which}: it stays containerPadding inside the region: ${JSON.stringify({ region, surface })}`);
              assert.deepEqual(errors, [], errors.join(' | '));
            } finally {
              await context.close();
            }
          }
        });
      }

      await t.test('in a boundary too short for its content, the surface stays inside the boundary and scrolls the rest', () => withPage({ props: { boundary: 'frame', frameHeight: 150, tall: true } }, async (page) => {
        await openFromTool(page);
        await settled(page);
        assert.equal(await insideOf(page, '#frame', 12), true, 'the surface stays containerPadding inside the boundary');
        const { scrollHeight, clientHeight } = await popover(page).evaluate((node) => ({ scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }));
        assert.ok(scrollHeight > clientHeight + 20, `what does not fit scrolls inside the surface: ${scrollHeight} in ${clientHeight}`);
        await page.locator('#done').focus();
        await frames(page, 2);
        const [done, surface] = [await rectOf(page, '#done'), await rectOf(page, '.muxui-popover')];
        assert.ok(done.top >= surface.top - 1 && done.bottom <= surface.bottom + 1, 'its last control scrolls into view inside it');
      }));

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

      await t.test('with a trigger and an anchor of its own, it stays where it was when that anchor unmounts and the window then resizes', () => withPage({ props: { withTrigger: true, anchor: 'island' } }, async (page) => {
        await page.locator('#trigger').click();
        await popover(page).waitFor();
        await settled(page);
        const [anchor, surface] = [await rectOf(page, '#island'), await rectOf(page, '.muxui-popover')];
        assert.ok(surface.top - anchor.bottom > 4 && surface.top - anchor.bottom < 12, 'it opens against its anchor, not its trigger');
        const placed = await placedAt(page);
        await page.evaluate(() => window.__popoverAnchor.removeIsland());
        await page.waitForFunction(() => !document.querySelector('#island'));
        await page.setViewportSize({ width: 860, height: 660 });
        await frames(page, 4);
        assert.deepEqual(await placedAt(page), placed, 'it stays where it was last placed');
      }));

      await t.test('rendered before its anchor, it opens against that anchor when both mount together, and against one that mounts after it while it is open', async () => {
        const placedBelowLate = async (page) => {
          await settled(page);
          const [anchor, surface] = [await rectOf(page, '#late'), await rectOf(page, '.muxui-popover')];
          assert.ok(surface.top - anchor.bottom > 4 && surface.top - anchor.bottom < 12, `it opens below its anchor: ${surface.top - anchor.bottom}`);
          assert.ok(Math.abs(surface.left - anchor.left) < 2, 'bottom-start lines up the start edges');
        };
        await withPage({ props: { mounted: false, uncontrolled: true, defaultOpen: true } }, async (page) => {
          await setProps(page, { late: true });
          await popover(page).waitFor();
          await placedBelowLate(page);
        });
        await withPage({ props: { mounted: false, uncontrolled: true, defaultOpen: true } }, async (page) => {
          await setProps(page, { late: true, lateAnchor: false });
          await popover(page).waitFor();
          await setProps(page, { lateAnchor: true });
          await page.locator('#late').waitFor();
          await placedBelowLate(page);
        });
      });

      await t.test('an anchor that layout moves while it is open takes the Popover along', () => withPage({}, async (page) => {
        await openFromTool(page);
        await settled(page);
        await setProps(page, { toolbarAt: 'bottom' });
        await page.waitForFunction(() => {
          const link = document.querySelector('#link').getBoundingClientRect();
          const gap = document.querySelector('.muxui-popover').getBoundingClientRect().top - link.bottom;
          return link.top > 400 && gap > 4 && gap < 12;
        }, undefined, { timeout: 2000 });
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
          await setProps(page, {});
          await frames(page, 3);
          assert.deepEqual(await placedAt(page), before, 'nor when it renders after the scroll');
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

      await t.test('mounting open with a menu that one press of its trigger opens, it is on top: Escape closes it and then the menu, and focus never rests on the body', () => withPage({ props: { menu: true, mountWhenOpen: true } }, async (page) => {
        const menu = page.getByRole('menu', { name: 'Insert' });
        await page.locator('#insert').click();
        await popover(page).waitFor();
        await menu.waitFor();
        await page.waitForFunction(() => document.querySelector('.muxui-popover').contains(document.activeElement));
        await page.keyboard.press('Escape');
        await popover(page).waitFor({ state: 'detached' });
        const resting = await restingFocus(page);
        assert.equal(await menu.count(), 1, 'the first Escape closes only the Popover');
        assert.equal(await menu.evaluate((node) => node.contains(document.activeElement)), true, `focus rests in the menu, not on ${resting}`);
        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'detached' });
        assert.equal(await restingFocus(page), 'insert', 'the second Escape closes the menu and focus returns to its trigger');
      }));

      await t.test('opened from an item of a menu, mounting open or not, it is on top as the menu closes, and Escape returns focus to the menu\'s trigger', async () => {
        for (const mountWhenOpen of [true, false]) {
          await withPage({ props: { menu: 'item', mountWhenOpen } }, async (page) => {
            await page.locator('#insert').click();
            await page.getByRole('menuitem', { name: 'Image' }).click();
            await popover(page).waitFor();
            await page.waitForFunction(() => document.querySelector('.muxui-popover').contains(document.activeElement));
            assert.equal(await popover(page).evaluate((node) => Boolean(node.closest('[inert]'))), false, `mountWhenOpen ${mountWhenOpen}: the Popover is not inert`);
            await page.keyboard.press('Escape');
            await popover(page).waitFor({ state: 'detached' });
            // The menu may still be leaving, and focus is its own until it has gone.
            await page.getByRole('menu').waitFor({ state: 'detached' });
            assert.equal(await restingFocus(page), 'insert', `mountWhenOpen ${mountWhenOpen}: focus returns to the menu's trigger`);
          });
        }
      });

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
        assert.deepEqual(await exposedDialogs(page), ['Add link'], 'the sheet under it is out of the accessibility tree');
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

      await t.test('opened from code while the sheet slides in, it keeps its distance from its anchor on every frame to rest inside the sheet, and keeps its field focused', () => withPage({ viewport: PHONE, props: sheetProps }, async (page) => {
        const { travel, gaps } = await page.evaluate(async () => {
          const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
          document.querySelector('#sheet-trigger').click();
          let panel = null;
          while (!(panel = document.querySelector('.muxui-dialog'))) await frame();
          await frame();
          const openedAt = panel.getBoundingClientRect().top;
          window.__popoverAnchor.setOpen(true);
          // On each frame until the panel stops: how far below the toolbar React Aria's placement puts the Popover, its
          // own entry motion aside.
          const found = [];
          let last = null;
          let still = 0;
          while (still < 5) {
            await frame();
            const top = panel.getBoundingClientRect().top;
            still = top === last ? still + 1 : 0;
            last = top;
            const positioner = document.querySelector('.muxui-popover__positioner');
            if (!positioner) continue;
            const translate = getComputedStyle(positioner).translate;
            const motion = translate === 'none' ? 0 : Number.parseFloat(translate.split(' ')[1] ?? '0') || 0;
            found.push(positioner.getBoundingClientRect().top - motion - document.querySelector('#sheet-toolbar').getBoundingClientRect().bottom);
          }
          return { travel: openedAt - last, gaps: found };
        });
        assert.ok(travel > 40, `the Popover opened while the sheet was still ${travel} pixels from rest`);
        const rest = gaps.at(-1);
        assert.ok(gaps.length > 5 && gaps.every((gap) => Math.abs(gap - rest) < 2), `it kept its distance from the toolbar on every frame: ${gaps.map(Math.round).join(', ')}`);
        await settled(page);
        assert.ok(await sitsAgainstToolbar(page) < 24, `it sits against the toolbar once the sheet rests: ${await sitsAgainstToolbar(page)} pixels apart`);
        assert.equal(await insideOf(page, '.muxui-dialog', 12), true, 'it stays inside the sheet\'s panel');
        await keepsFieldFocus(page);
      }));

      await t.test('opened in the same update as its sheet, by one press or from code, it takes focus, it alone is in the accessibility tree, and Escape closes it before the sheet', async () => {
        for (const how of ['press', 'code']) {
          await withPage({ viewport: PHONE, props: sheetProps }, async (page) => {
            if (how === 'press') await page.locator('#reply-with-link').click();
            else await page.evaluate(() => { window.__popoverAnchor.setSheetOpen(true); window.__popoverAnchor.setOpen(true); });
            await popover(page).waitFor();
            await keepsFieldFocus(page);
            assert.deepEqual(await exposedDialogs(page), ['Add link'], `${how}: the Popover is in the accessibility tree and the sheet under it is not`);
            await page.keyboard.press('Escape');
            await popover(page).waitFor({ state: 'detached' });
            assert.equal(await page.locator('.muxui-dialog').count(), 1, `${how}: the first Escape closes only the Popover`);
            await page.waitForFunction(() => document.querySelector('.muxui-dialog')?.contains(document.activeElement));
            await page.keyboard.press('Escape');
            await page.locator('.muxui-dialog__backdrop').waitFor({ state: 'detached' });
          });
        }
      });

      await t.test('opened in the same update as a sheet, a centred Dialog or a Popover around it, it is on top: Escape closes it and then its container, and focus never rests on the body', async () => {
        for (const layout of ['sheet', 'dialog', 'popover']) {
          await withPage({ viewport: layout === 'sheet' ? PHONE : WIDE, props: { layout, anchor: 'row', initialFocus: true } }, async (page) => {
            const inner = page.getByRole('dialog', { name: 'Add link' });
            const container = layout === 'popover' ? '[role="dialog"][aria-label="Reply"]' : '.muxui-dialog';
            await page.locator('#reply-with-link').focus();
            await page.keyboard.press('Enter');
            await inner.waitFor();
            await page.waitForFunction(() => document.activeElement?.id === 'address');
            assert.deepEqual(await exposedDialogs(page), ['Add link'], `${layout}: the Popover alone is in the accessibility tree`);
            await page.keyboard.press('Escape');
            await inner.waitFor({ state: 'detached' });
            assert.equal(await page.locator(container).count(), 1, `${layout}: the first Escape closes only the Popover`);
            await restingFocus(page);
            assert.equal(await page.evaluate((selector) => document.querySelector(selector).contains(document.activeElement), container), true, `${layout}: focus rests inside the container, not on ${await activeId(page)}`);
            await page.keyboard.press('Escape');
            await page.locator(container).waitFor({ state: 'detached' });
            assert.equal(await restingFocus(page), 'reply-with-link', `${layout}: the second Escape closes the container and focus returns to its opener`);
          });
        }
      });

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

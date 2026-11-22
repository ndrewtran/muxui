import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// A toast's action in a real page: the timers pause while the pointer is over the action or it has focus and resume
// after; the toast takes no focus when it appears, Tab from the page's last control reaches it and then its action, and activating it by
// keyboard or pointer runs its handler once and closes the toast, after which a later toast still expires; unmounting
// the toast while its action holds the timers paused settles nothing; the dismiss control still closes it without the
// action; under reduced motion the toast does not travel; under forced colours the action is a system button. Inside a
// Dialog sheet, a Tooltip portals into the sheet's layer while the notifications stay on the page body, above the sheet
// and operable, whether the provider sits outside the sheet or inside it. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs); WebKit has no forced-colors mode, so that case says so there.

const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { Dialog, Toast, ToastProvider, Tooltip, useToast } from '/src/overlays.ts';
  import { Button } from '/src/button.ts';
  import '/generated/styles.css';
  const h = React.createElement;
  const params = new URLSearchParams(location.search);
  document.documentElement.dataset.muxuiMotion = params.get('motion') ?? 'full';
  document.documentElement.dataset.muxuiColorScheme = params.get('scheme') ?? 'light';
  window.calls = [];
  const undo = { label: 'Undo', onAction: () => window.calls.push('action') };
  const onDismiss = () => window.calls.push('dismiss');

  function Controls() {
    const manager = useToast();
    React.useEffect(() => {
      window.addUndo = (duration) => manager.add('The draft is archived.', { title: 'Archived', duration, onDismiss, action: undo });
      window.addPlain = (duration) => manager.add('Saved', { duration });
    }, [manager]);
    return h('button', { id: 'before' }, 'Before');
  }

  function DeclarativeOwner() {
    const [shown, setShown] = React.useState(true);
    window.unmountToast = () => setShown(false);
    return shown ? h(Toast, { message: 'The draft is archived.', onDismiss, action: undo }) : h('p', { id: 'unmounted' }, 'Unmounted');
  }

  function SheetContent() {
    const manager = useToast();
    return h('div', { style: { display: 'flex', gap: 8 } },
      h(Tooltip, { delay: 0, trigger: h(Button, { id: 'bold', 'aria-keyshortcuts': 'Control+B' }, 'Bold'), content: ['Bold', h(Tooltip.Shortcut, { key: 'shortcut', keys: ['Ctrl', 'B'] })] }),
      h(Button, { id: 'archive', onActivate: () => manager.add('The draft is archived.', { duration: 60000, onDismiss, action: undo }) }, 'Archive'));
  }
  const sheet = (children) => h(Dialog, { title: 'Draft', presentation: 'sheet', defaultOpen: true }, children);

  const scenarios = {
    page: () => h(ToastProvider, null, h(Controls)),
    declarative: () => h(ToastProvider, null, h(Controls), h(DeclarativeOwner)),
    sheet: () => h(ToastProvider, null, sheet(h(SheetContent))),
    'sheet-provider': () => sheet(h(ToastProvider, null, h(SheetContent))),
  };
  createRoot(document.getElementById('root')).render(h(scenarios[params.get('scenario')]));
  document.documentElement.dataset.ready = 'true';`;

let server;

before(async () => {
  server = await startServer({
    entries: ['src/overlays.ts'],
    pages: { '/toast-action.html': pageShell({ attributes: 'data-muxui-color-scheme="light"', body: '<div id="root"></div>', entry: '/toast-action-entry.mjs' }) },
    modules: { '/toast-action-entry.mjs': entry },
  });
});

after(async () => {
  await server?.close();
});

const AWAY = { x: 10, y: 690 };

async function open(browser, scenario, { motion = 'full', scheme = 'light', forcedColors } = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.setDefaultTimeout(5_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  if (forcedColors) await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(`${server.url}/toast-action.html?scenario=${scenario}&motion=${motion}&scheme=${scheme}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await awaitFontsAndFrames(page);
  await page.mouse.move(AWAY.x, AWAY.y);
  return { page, errors };
}

const calls = (page) => page.evaluate(() => window.calls);
const live = '.muxui-toast:not([data-muxui-toast-exiting])';
const activeLabel = (page) => page.evaluate(() => {
  const active = document.activeElement;
  return active?.className?.split?.(' ').find((name) => name.startsWith('muxui-toast')) || active?.id || active?.tagName;
});

// A later toast with a short duration leaves on its own: nothing has left the region's timers paused.
async function laterToastExpires(page, label) {
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.evaluate(() => window.addPlain(1500));
  const toast = page.locator('.muxui-toast', { hasText: 'Saved' });
  await toast.waitFor();
  await toast.waitFor({ state: 'detached', timeout: 6000 }).catch(() => assert.fail(`${label}: a later toast stays past its duration`));
}

for (const engine of browserEngines()) {
  test(`a toast action pauses, runs once and leaves the region usable in ${engine}`, { timeout: 180_000 }, async (t) => {
    const browser = await launchBrowser(engine);
    try {
      await t.test('hovering the action and then focusing it each hold the timer, which resumes once neither applies', async () => {
        const { page, errors } = await open(browser, 'page');
        try {
          await page.waitForFunction(() => typeof window.addUndo === 'function');
          // Asked for 1000 ms; with an action the toast stays 10000 ms.
          const start = Date.now();
          await page.evaluate(() => window.addUndo(1000));
          const action = page.locator('.muxui-toast__action');
          await action.waitFor();
          await action.hover();
          await page.waitForTimeout(10_800 - (Date.now() - start));
          assert.equal(await page.locator(live).count(), 1, 'a hovered action keeps the toast past its 10000 ms');

          // Focus takes over from the pointer, and holds past the time that was left.
          await action.focus();
          await page.mouse.move(AWAY.x, AWAY.y);
          await page.waitForTimeout(10_500);
          assert.equal(await page.locator(live).count(), 1, 'a focused action keeps the toast past the time left');
          assert.deepEqual(await calls(page), []);

          // Neither applies: the time left runs out, rather than starting again or ending at once.
          await page.locator('#before').focus();
          const resumed = Date.now();
          await page.locator(live).waitFor({ state: 'detached', timeout: 12_000 });
          const elapsed = Date.now() - resumed;
          assert.ok(elapsed > 3000, `the toast resumes the time it had left, and left after ${elapsed} ms`);
          assert.deepEqual(await calls(page), ['dismiss'], 'the timeout reports one dismissal and runs no action');
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      });

      await t.test('Tab from the page reaches the toast and then its action, and Enter runs it once and returns focus to the page', async () => {
        const { page, errors } = await open(browser, 'page');
        try {
          await page.waitForFunction(() => typeof window.addUndo === 'function');
          await page.locator('#before').focus();
          await page.evaluate(() => window.addUndo(60000));
          await page.locator('.muxui-toast__action').waitFor();
          await page.waitForFunction(() => document.querySelector('.muxui-toast__announcer')?.textContent === 'Undo');
          assert.equal(await activeLabel(page), 'before', 'the toast takes no focus when it appears');
          assert.equal(await page.locator('.muxui-toast [role="status"]').textContent(), 'Undo', 'a polite status names the action');

          // The notifications render last in the page, so they follow its content in the Tab order.
          await page.keyboard.press('Tab');
          assert.equal(await activeLabel(page), 'muxui-toast', 'Tab from the page\'s last control reaches the toast');
          await page.keyboard.press('Tab');
          assert.equal(await activeLabel(page), 'muxui-toast__action', 'and then its action');
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => document.activeElement?.id === 'before');
          await page.keyboard.press('Enter');
          await page.locator('.muxui-toast').waitFor({ state: 'detached' });
          assert.deepEqual(await calls(page), ['action', 'dismiss'], 'the action runs once, then onDismiss reports the close once');
          await laterToastExpires(page, 'after a keyboard activation');
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      });

      await t.test('a double press on the action runs it once, and a later toast still expires', async () => {
        const { page, errors } = await open(browser, 'page');
        try {
          await page.waitForFunction(() => typeof window.addUndo === 'function');
          await page.evaluate(() => window.addUndo(60000));
          const action = page.locator('.muxui-toast__action');
          await action.waitFor();
          await page.waitForTimeout(400);
          await action.dblclick();
          await page.locator('.muxui-toast').waitFor({ state: 'detached' });
          assert.deepEqual(await calls(page), ['action', 'dismiss']);
          // The toast left from under the pointer, so no pointer ever left the region.
          await laterToastExpires(page, 'after a pointer activation');
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      });

      await t.test('the dismiss control closes a toast with an action without running it', async () => {
        const { page, errors } = await open(browser, 'page');
        try {
          await page.waitForFunction(() => typeof window.addUndo === 'function');
          await page.evaluate(() => window.addUndo(60000));
          await page.locator('.muxui-toast__dismiss').click();
          await page.locator('.muxui-toast').waitFor({ state: 'detached' });
          assert.deepEqual(await calls(page), ['dismiss']);
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      });

      await t.test('unmounting a declarative Toast while its action is hovered settles nothing and leaves later toasts timed', async (st) => {
        const { page, errors } = await open(browser, 'declarative');
        try {
          const action = page.locator('.muxui-toast__action');
          await action.waitFor();
          await action.hover();
          await page.evaluate(() => window.unmountToast());
          await page.locator('#unmounted').waitFor();
          await page.locator('.muxui-toast').waitFor({ state: 'detached' });
          assert.deepEqual(await calls(page), [], 'an unmount runs no action and reports no dismissal');
          // Playwright's WebKit sends no pointerover once the hovered toast is gone, however the pointer then moves, so
          // React Aria's hover never ends there and the region stays paused. A toast without an action does the same.
          if (engine === 'webkit') st.diagnostic('skipped in WebKit: the later toast stays paused because no pointerover follows the removal');
          else await laterToastExpires(page, 'after an unmount during a hover');
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      });

      for (const scheme of ['light', 'dark']) {
        await t.test(`in the ${scheme} scheme the action sits between the content and the dismiss control and its label reads`, async () => {
          const { page, errors } = await open(browser, 'page', { scheme });
          try {
            await page.waitForFunction(() => typeof window.addUndo === 'function');
            await page.evaluate(() => window.addUndo(60000));
            await page.locator('.muxui-toast__action').waitFor();
            await page.waitForTimeout(500);
            const layout = await page.locator('.muxui-toast').evaluate((toast) => {
              const box = (selector) => toast.querySelector(selector).getBoundingClientRect();
              const [content, action, dismiss] = ['.muxui-toast__content', '.muxui-toast__action', '.muxui-toast__dismiss'].map(box);
              const style = getComputedStyle(toast.querySelector('.muxui-toast__action'));
              const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
              // Paints the colours over one another, as the page does, so a translucent fill reads over the toast.
              const luminance = (...layers) => {
                context.clearRect(0, 0, 1, 1);
                for (const color of layers) {
                  context.fillStyle = color;
                  context.fillRect(0, 0, 1, 1);
                }
                const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
                  const channel = value / 255;
                  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
                });
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
              };
              const surface = getComputedStyle(toast).backgroundColor;
              const [light, dark] = [luminance(surface, style.color), luminance(surface, style.backgroundColor)].sort((x, y) => y - x);
              return {
                order: content.right <= action.left && action.right <= dismiss.left,
                centred: Math.abs((action.top + action.bottom) / 2 - (content.top + content.bottom) / 2) <= 1,
                inside: action.top >= toast.getBoundingClientRect().top && action.bottom <= toast.getBoundingClientRect().bottom,
                ratio: (light + 0.05) / (dark + 0.05),
                colors: `${style.color} on ${style.backgroundColor} over ${surface}`,
              };
            });
            assert.equal(layout.order, true, 'content, action and dismiss control sit in that order without overlap');
            assert.equal(layout.centred, true, 'the action is centred on the content');
            assert.equal(layout.inside, true, 'the action sits inside the toast');
            assert.ok(layout.ratio >= 4.5, `the action's label reads on its fill at ${layout.ratio.toFixed(2)}:1 ${layout.colors}`);

            // Keyboard focus draws a ring, and a press darkens the fill. The press is released off the action, so it runs nothing.
            const action = page.locator('.muxui-toast__action');
            const paint = () => action.evaluate((node) => {
              const style = getComputedStyle(node);
              return { fill: style.backgroundColor, ring: style.boxShadow, outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 };
            });
            const rest = await paint();
            await page.locator('#before').focus();
            await page.keyboard.press('Tab');
            await page.keyboard.press('Tab');
            assert.equal(await action.evaluate((node) => node === document.activeElement && node.hasAttribute('data-muxui-state-focus-visible')), true, 'Tab focuses the action visibly');
            const focused = await paint();
            assert.ok(focused.outline || (focused.ring !== 'none' && focused.ring !== rest.ring), `the focused action draws a ring (${focused.ring})`);
            await page.locator('#before').focus();
            const box = await action.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForFunction(() => document.querySelector('.muxui-toast__action')?.hasAttribute('data-muxui-state-pressed'));
            const pressed = await paint();
            await page.mouse.move(AWAY.x, AWAY.y);
            await page.mouse.up();
            assert.notEqual(pressed.fill, rest.fill, `a press changes the fill from ${rest.fill}`);
            assert.deepEqual(await calls(page), [], 'a press released off the action runs nothing');
            assert.deepEqual(errors, [], errors.join('\n'));
          } finally {
            await page.close();
          }
        });
      }

      await t.test('under reduced motion a toast with an action appears in place', async () => {
        const { page, errors } = await open(browser, 'page', { motion: 'reduced' });
        try {
          await page.waitForFunction(() => typeof window.addUndo === 'function');
          const tops = await page.evaluate(async () => {
            window.addUndo(60000);
            const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
            const seen = [];
            for (let index = 0; index < 12; index += 1) {
              await frame();
              const toast = document.querySelector('.muxui-toast');
              if (toast) seen.push(Math.round(toast.getBoundingClientRect().top * 10) / 10);
            }
            return seen;
          });
          assert.ok(tops.length > 0, 'the toast appears');
          assert.equal(new Set(tops).size, 1, `the toast does not travel: ${tops.join(', ')}`);
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      });

      await t.test('under forced colours the action is a button in system colours', { skip: engine === 'webkit' && 'WebKit has no forced-colors mode' }, async () => {
        const { page, errors } = await open(browser, 'page', { forcedColors: true });
        try {
          await page.waitForFunction(() => typeof window.addUndo === 'function');
          await page.evaluate(() => window.addUndo(60000));
          await page.locator('.muxui-toast__action').waitFor();
          const paint = await page.locator('.muxui-toast__action').evaluate((node) => {
            const system = (property, value) => {
              const probe = document.body.appendChild(document.createElement('span'));
              probe.style.setProperty(property, value);
              const resolved = getComputedStyle(probe).getPropertyValue(property);
              probe.remove();
              return resolved;
            };
            const style = getComputedStyle(node);
            const edge = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 ? style.outlineColor : style.borderTopColor;
            return {
              text: style.color, fill: style.backgroundColor, edge, opacity: style.opacity,
              buttonText: system('color', 'ButtonText'), buttonFace: system('background-color', 'ButtonFace'),
            };
          });
          assert.equal(paint.text, paint.buttonText, 'the label is ButtonText');
          assert.equal(paint.fill, paint.buttonFace, 'the fill is ButtonFace');
          assert.equal(paint.edge, paint.buttonText, 'the edge is ButtonText');
          assert.equal(paint.opacity, '1');
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      });

      for (const scenario of ['sheet', 'sheet-provider']) {
        await t.test(`with the provider ${scenario === 'sheet' ? 'outside' : 'inside'} a sheet, the tooltip opens in the sheet's layer and the toast on the page, above the sheet and operable`, async () => {
          const { page, errors } = await open(browser, scenario);
          try {
            await page.locator('.muxui-dialog').waitFor();
            await page.locator('#bold').focus();
            const tooltip = page.locator('.muxui-tooltip');
            await tooltip.waitFor();
            assert.equal(await tooltip.evaluate((node) => Boolean(node.closest('.muxui-dialog__layer'))), true, 'the tooltip portals into the sheet layer');
            assert.equal(await tooltip.locator('.muxui-tooltip__shortcut').getAttribute('aria-hidden'), 'true');
            assert.equal(await page.locator('#bold').getAttribute('aria-keyshortcuts'), 'Control+B');

            await page.locator('#archive').click();
            const action = page.locator('.muxui-toast__action');
            await action.waitFor();
            await page.waitForTimeout(400);
            const region = await page.evaluate(() => {
              const node = document.querySelector('.muxui-toast__region');
              const box = document.querySelector('.muxui-toast__action').getBoundingClientRect();
              const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
              return {
                onBody: node.parentElement === document.body,
                inLayer: Boolean(node.closest('.muxui-dialog__layer, .muxui-dialog')),
                hidden: Boolean(node.closest('[inert], [aria-hidden="true"]')),
                hit: Boolean(hit?.closest('.muxui-toast__action')),
              };
            });
            assert.deepEqual(region, { onBody: true, inLayer: false, hidden: false, hit: true }, 'the region is a page-level child of the body, not hidden, and on top at the action');

            await action.click();
            await page.locator('.muxui-toast').waitFor({ state: 'detached' });
            assert.deepEqual(await calls(page), ['action', 'dismiss']);
            assert.equal(await page.locator('.muxui-dialog').count(), 1, 'the sheet stays open');
            await page.waitForFunction(() => Boolean(document.activeElement?.closest('.muxui-dialog')));
            assert.deepEqual(errors, [], errors.join('\n'));
          } finally {
            await page.close();
          }
        });
      }
    } finally {
      await browser.close();
    }
  });
}

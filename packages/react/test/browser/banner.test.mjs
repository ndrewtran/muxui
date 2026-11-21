import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Banner } from '../../src/supplemental/banner.ts';
import { contrastRatio, over } from '../support/contrast.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Custom colours across the range: violet and sky blue, a light yellow, the grey where white and black text meet, and the extremes.
const customColors = ['#6d28d9', '#0ea5e9', '#fde047', '#767676', '#000000', '#ffffff'];

// The page's tree, rendered on the server here and hydrated in the page from the same function's source. Every Banner carries every
// control, and its dismissal is controlled and never taken, so pressing does not remove it.
function tree(h, Banner, customColors) {
  const icon = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, h('circle', { cx: 12, cy: 12, r: 10 }));
  const banner = (id, props) => h(Banner, {
    id, title: 'Maintenance', icon, dismissible: true, dismissed: false, onDismiss: () => {},
    actions: [{ id: 'first', label: 'Schedule', onAction: () => {} }, { id: 'second', label: 'Later', onAction: () => {} }],
    link: { label: 'Status', href: '#status' },
    ...props,
  }, 'The site is read-only on Saturday.');
  const cases = [];
  for (const emphasis of ['subtle', 'solid']) {
    for (const tone of ['neutral', 'brand', 'success', 'warning', 'danger']) cases.push(banner(`${emphasis}-${tone}`, { tone, emphasis }));
    customColors.forEach((customColor, index) => cases.push(banner(`${emphasis}-custom-${index}`, { customColor, emphasis })));
  }
  // A stop before the first Banner, so Shift+Tab from its first control stays in the page.
  return h('main', null, h('button', { id: 'start', type: 'button' }, 'Start'), ...cases, h(Banner, { id: 'alert', alert: true }, 'Now'), h('span', { id: 'system', style: { color: 'CanvasText', borderColor: 'ButtonText' } }));
}

const entry = `
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Banner } from '/src/supplemental/banner.ts';
const tree = ${tree.toString()};
flushSync(() => { hydrateRoot(document.querySelector('#root'), tree(React.createElement, Banner, ${JSON.stringify(customColors)}), { onRecoverableError: (error) => console.error(String(error)) }); });
document.documentElement.dataset.ready = 'true';
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"',
  body: `<div id="root">${renderToString(tree(React.createElement, Banner, customColors))}</div>`,
  entry: '/banner-entry.mjs',
});

/** Runs in the page: the colours a Banner and one of its controls show, as computed strings. */
function readColors({ id, control }) {
  const root = document.getElementById(id);
  const style = getComputedStyle(root);
  const out = { background: style.backgroundColor, tint: style.backgroundImage, text: style.color, icon: getComputedStyle(root.querySelector('.muxui-banner__icon')).color };
  if (control) {
    const node = root.querySelector(control);
    const own = getComputedStyle(node);
    Object.assign(out, { fill: own.backgroundColor, label: own.color, shadow: own.boxShadow, line: `${own.textDecorationLine} ${own.textDecorationThickness}`, outline: `${own.outlineWidth} ${own.outlineColor}` });
  }
  return out;
}

/** A computed colour as channels: rgb(), rgba(), or color(srgb ...). */
function parseColor(value) {
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/u.exec(value);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  const srgb = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+))?\s*\)/u.exec(value);
  if (srgb) return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255, a: srgb[4] === undefined ? 1 : Number(srgb[4]) };
  throw new Error(`unread colour: ${value}`);
}

/** Every colour in a computed value, in order: the colour stops of a gradient, the layers of a box shadow. */
const colorsIn = (value) => (value.match(/rgba?\([^)]*\)|color\([^)]*\)/gu) ?? []).map(parseColor);

/** What the Banner shows: its tint laid over its opaque ground. */
const groundOf = ({ background, tint }) => {
  const [layer] = colorsIn(tint);
  const base = parseColor(background);
  assert.equal(base.a, 1, 'the ground is opaque');
  return layer ? over(layer, base) : base;
};

const round = (value) => Math.round(value * 100) / 100;

// Each control, what it draws on, and the contrast it needs: the label of a Button or a Link 4.5:1, the dismiss icon 3:1.
const controls = [
  { name: 'first action', selector: '.muxui-banner__action:nth-child(1)', need: 4.5 },
  { name: 'second action', selector: '.muxui-banner__action:nth-child(2)', need: 4.5 },
  { name: 'link', selector: '.muxui-banner__link', need: 4.5 },
  { name: 'dismiss icon', selector: '.muxui-banner__dismiss', need: 3 },
];

for (const engine of browserEngines()) {
  test(`Banner text, controls and focus rings keep their contrast in every tone, emphasis, state and scheme in ${engine}`, { timeout: 300_000 }, async (t) => {
    const server = await startServer({ entries: ['src/supplemental/banner.ts'], pages: { '/banner.html': page }, modules: { '/banner-entry.mjs': entry } });
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 900, height: 900 } });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      // Button and Link transition their colours; reduced motion makes each state's colours final at once.
      await tab.emulateMedia({ reducedMotion: 'reduce' });
      await tab.goto(`${server.url}/banner.html`, { waitUntil: 'load' });
      await tab.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await awaitFontsAndFrames(tab);

      // A named region, its name the title; an alert when asked.
      assert.match(await tab.locator('#subtle-brand').ariaSnapshot(), /^- region "Maintenance":/u);
      assert.match(await tab.locator('#alert').ariaSnapshot(), /^- alert "Notice": Now/u);

      const ids = await tab.evaluate(() => [...document.querySelectorAll('.muxui-banner:not(#alert)')].map((node) => node.id));
      const failures = [];
      const lowest = { text: Infinity, icon: Infinity, control: {}, ring: Infinity };
      const check = (label, ratio, need) => {
        if (ratio < need) failures.push(`${label}: ${round(ratio)}:1, needs ${need}:1`);
      };
      for (const scheme of ['light', 'dark']) {
        await tab.evaluate((value) => document.documentElement.setAttribute('data-muxui-color-scheme', value), scheme);
        for (const id of ids) {
          const at = `${scheme} ${id}`;
          const base = await tab.evaluate(readColors, { id });
          const ground = groundOf(base);
          const text = contrastRatio(parseColor(base.text), ground);
          const icon = contrastRatio(parseColor(base.icon), ground);
          check(`${at} message`, text, 4.5);
          check(`${at} icon`, icon, 3);
          lowest.text = Math.min(lowest.text, text);
          lowest.icon = Math.min(lowest.icon, icon);
          for (const { name, selector, need } of controls) {
            const locator = tab.locator(`#${id} ${selector}`);
            await locator.scrollIntoViewIfNeeded();
            const box = await locator.boundingBox();
            const states = {};
            await tab.mouse.move(0, 0);
            states.rest = await tab.evaluate(readColors, { id, control: selector });
            await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            states.hover = await tab.evaluate(readColors, { id, control: selector });
            await tab.mouse.down();
            states.pressed = await tab.evaluate(readColors, { id, control: selector });
            // Leaving before the release cancels the press, so nothing follows the link.
            await tab.mouse.move(0, 0);
            await tab.mouse.up();
            assert.notDeepEqual(states.hover, states.rest, `${at} ${name}: hover shows`);
            assert.notDeepEqual(states.pressed, states.hover, `${at} ${name}: press shows`);
            for (const [state, colors] of Object.entries(states)) {
              const ratio = contrastRatio(parseColor(colors.label), over(parseColor(colors.fill), ground));
              check(`${at} ${name} ${state}`, ratio, need);
              lowest.control[name] = Math.min(lowest.control[name] ?? Infinity, ratio);
            }
            // The keyboard ring: a gap of the ground, then the foreground ring, which must stand apart from the Banner.
            // Focus from the keyboard: back one stop and forward again. WebKit's Tab skips buttons and links, and a key press there
            // makes the next focus a keyboard focus, so it focuses the control directly.
            if (engine === 'webkit') {
              await tab.keyboard.press('Escape');
              await locator.focus();
            } else {
              await locator.focus();
              await tab.keyboard.press('Shift+Tab');
              await tab.keyboard.press('Tab');
            }
            assert.ok(await locator.evaluate((node) => node === document.activeElement), `${at} ${name}: it takes focus`);
            const focused = await tab.evaluate(readColors, { id, control: selector });
            const ring = colorsIn(focused.shadow).at(-1);
            assert.ok(ring, `${at} ${name}: a focus ring shows (${focused.shadow})`);
            const ringRatio = contrastRatio(ring, ground);
            check(`${at} ${name} focus ring`, ringRatio, 3);
            lowest.ring = Math.min(lowest.ring, ringRatio);
            await tab.evaluate(() => document.activeElement.blur());
          }
        }
      }
      t.diagnostic(`lowest: message ${round(lowest.text)}, icon ${round(lowest.icon)}, ${Object.entries(lowest.control).map(([name, ratio]) => `${name} ${round(ratio)}`).join(', ')}, ring ${round(lowest.ring)}`);
      assert.deepEqual(failures, [], failures.join('\n'));

      // Forced colours, still under reduced motion so no colour is caught mid-transition: a CanvasText boundary on Canvas, no tint, and
      // system colours on the controls.
      if (engine === 'chromium') {
        await tab.emulateMedia({ forcedColors: 'active' });
        const forced = await tab.evaluate(() => {
          const system = getComputedStyle(document.getElementById('system'));
          const root = getComputedStyle(document.getElementById('solid-danger'));
          const action = getComputedStyle(document.querySelector('#solid-danger .muxui-banner__action'));
          return { canvasText: system.color, buttonText: system.borderTopColor, border: [root.borderTopStyle, root.borderTopWidth, root.borderTopColor], image: root.backgroundImage, text: root.color, action: action.color };
        });
        assert.deepEqual(forced.border, ['solid', '1px', forced.canvasText]);
        assert.equal(forced.image, 'none');
        assert.equal(forced.text, forced.canvasText);
        assert.equal(forced.action, forced.buttonText);
        await tab.emulateMedia({ forcedColors: 'none' });
      } else {
        t.diagnostic(`skipped in ${engine}: forced colours are emulated in Chromium only`);
      }
      // Nothing on a Banner animates continuously, even without reduced motion: its controls only transition between states.
      await tab.emulateMedia({ reducedMotion: 'no-preference' });
      assert.equal(await tab.evaluate(() => document.querySelector('main').getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSTransition)).length), 0);

      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser.close();
      await server.close();
    }
  });
}

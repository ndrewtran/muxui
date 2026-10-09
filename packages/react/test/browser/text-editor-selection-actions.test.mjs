import assert from 'node:assert/strict';
import test from 'node:test';
import { warmUpServer } from './grid-list-probes.mjs';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof for TextEditor selection actions: placement, focus, keyboard,
// pending and review flows, narrow layout, and in light and dark every control's
// accessible name, token colors, contrast, and live region text. Runs in every
// engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).
//
// The fixture is a client-rendered editor with five actions (two are overflow)
// and these query-string options, passed as JSON in `config`:
//   hold:   the request returns a promise that the test settles through window.__settle
//   spacer: pixels above the editor, to push the selection toward the viewport bottom
//   tail:   pixels below the editor, to make the page scroll
//   scope:  wraps the editor in a Mux runtime scope inside the light page: 'dark-rtl' sets a dark mode and
//           direction; 'preset' sets only a theme preset, which applies without a mode attribute
// Tests call window.__tools.replace or insertAfter the way a caller's handler would.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TextEditor } from '/src/text-editor/index.mjs';

const h = React.createElement;
const { hold = false, spacer = 0, tail = 0, scope = '' } = JSON.parse(new URLSearchParams(location.search).get('config') ?? '{}');
const sentence = 'Pistachio holds the top slot all weekend. Churn it first thing Saturday so the batch has time to firm up before the afternoon rush.';
const actions = [
  { id: 'explain', label: 'Explain' },
  { id: 'improve', label: 'Improve', pendingLabel: 'Improving…' },
  { id: 'shorten', label: 'Shorten', overflow: true },
  { id: 'tone', label: 'Change tone', overflow: true },
  { id: 'grammar', label: 'Fix grammar', overflow: true },
];
const scopes = {
  'dark-rtl': { 'data-muxui-color-scheme': 'dark', 'data-muxui-direction': 'rtl', dir: 'rtl' },
  preset: { 'data-muxui-theme': 'standard-harbour' },
};
window.__requests = [];
window.__edits = 0;

function Fixture() {
  const editor = h(TextEditor, {
    label: 'Draft',
    defaultValue: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: sentence }] }] },
    selectionActions: actions,
    onChange: () => { window.__edits += 1; },
    onSelectionRequest: (request, tools) => {
      window.__requests.push(request);
      window.__tools = tools;
      if (hold) return new Promise((resolve, reject) => { window.__settle = { resolve, reject }; });
    },
  });
  return h('main', null,
    h('h1', null, 'TextEditor selection actions'),
    h('button', { id: 'before', type: 'button' }, 'Before'),
    spacer ? h('div', { style: { height: spacer }, 'aria-hidden': 'true' }) : null,
    scope ? h('section', { id: 'scope', ...scopes[scope] }, editor) : editor,
    h('button', { id: 'after', type: 'button' }, 'After'),
    tail ? h('div', { style: { height: tail }, 'aria-hidden': 'true' }) : null);
}
createRoot(document.getElementById('root')).render(h(Fixture));
`;

const page = (url) => pageShell({
  attributes: `lang="en" data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}" data-muxui-motion="full"`,
  head: '<link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/generated/themes.css"><style>body { margin: 24px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-default); }</style>',
  body: '<div id="root"></div>',
  entry: '/selection-actions-entry.mjs',
});

const barSelector = '[role="toolbar"][aria-label="Selection actions"]';
const rectOf = (locator) => locator.evaluate((node) => {
  const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
  return { left, top, right, bottom, width, height };
});

// Controls the bar offers in each state, by role and accessible name, and the live region text it announces.
const stateContracts = {
  rest: { controls: [['textbox', 'Describe edits'], ['button', 'Explain'], ['button', 'Improve'], ['button', 'More actions']], status: '' },
  pending: { controls: [['button', 'Cancel']], status: 'Editing…' },
  review: { controls: [['button', 'Keep'], ['button', 'Discard'], ['button', 'Try again']], status: 'Edit ready to review' },
  error: { controls: [['button', 'Try again'], ['button', 'Dismiss']], status: "Couldn't complete the edit" },
};

// Colors the bar must resolve to, per state. `kind` is the color under test: text and icons take the node's
// color, a fill its background, a border the bar's border. `over` names the fill a text or icon sits on;
// everything else sits on the bar surface. Text needs 4.5:1; icons, fills, and borders need 3:1.
const content = '--muxui-semantic-content-default';
const neutral90 = '--muxui-semantic-color-neutral-90';
const neutral70 = '--muxui-semantic-color-neutral-70';
const onPrimary = { over: '--muxui-semantic-selection-track' };
const surfaceTokens = { light: '--muxui-semantic-color-neutral-10', dark: '--muxui-semantic-color-neutral-18' };
function colorChecks(state, scheme) {
  const surface = { what: 'bar surface', selector: ':scope', kind: 'fill', token: surfaceTokens[scheme], min: 1 };
  const text = (what, selector, token, extra = {}) => ({ what, selector, kind: 'text', token, min: 4.5, ...extra });
  const icon = (what, selector, token, extra = {}) => ({ what, selector, kind: 'icon', token, min: 3, ...extra });
  return {
    rest: [
      surface,
      text('field text', 'input', neutral90),
      text('field placeholder', 'input', '--muxui-semantic-content-muted', { pseudo: '::placeholder' }),
      text('action text', 'button:not([aria-label])', content),
      icon('More actions icon', 'button[aria-label="More actions"] svg', content),
    ],
    pending: [
      surface,
      text('pending text', '.muxui-text-editor__selection-pending', neutral70),
      icon('pending icon', '.muxui-text-editor__selection-pending svg', neutral70),
      text('Cancel text', 'button', content),
    ],
    review: [
      surface,
      text('Keep text', 'button', '--muxui-semantic-action-foreground', { name: 'Keep', ...onPrimary }),
      icon('Keep icon', 'button svg', '--muxui-semantic-action-foreground', { name: 'Keep', ...onPrimary }),
      { what: 'Keep fill', selector: 'button', kind: 'fill', token: '--muxui-semantic-selection-track', min: 3, name: 'Keep' },
      text('Discard text', 'button', content, { name: 'Discard' }),
      icon('Discard icon', 'button svg', content, { name: 'Discard' }),
      icon('Try again icon', 'button svg', content, { name: 'Try again' }),
    ],
    error: [
      surface,
      text('failure text', '.muxui-text-editor__selection-message', neutral90),
      { what: 'failure border', selector: ':scope', kind: 'border', token: '--muxui-semantic-feedback-invalid-border', min: 3 },
      text('failure action text', 'button', content),
    ],
  }[state];
}

// Runs in the page: resolves each token where the bar renders, then reports the computed color, the
// expected color, and the contrast against the surface or the fill the node sits on.
function measureColors({ checks }) {
  const bar = document.querySelector('[role="toolbar"][aria-label="Selection actions"]');
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  // Canvas converts any CSS color, including color-mix results, to sRGB.
  const toRgba = (value) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#ff00ff';
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return [red, green, blue, alpha / 255];
  };
  const probe = document.createElement('span');
  document.body.append(probe);
  const token = (name) => {
    if (getComputedStyle(document.documentElement).getPropertyValue(name).trim() === '') throw new Error(`token ${name} is undefined`);
    probe.style.color = '';
    probe.style.color = `var(${name})`;
    return toRgba(getComputedStyle(probe).color);
  };
  const flatten = (foreground, backdrop) => foreground.slice(0, 3).map((channel, index) => channel * foreground[3] + backdrop[index] * (1 - foreground[3]));
  const luminance = ([red, green, blue]) => [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (first, second) => {
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };
  const surface = toRgba(getComputedStyle(bar).backgroundColor);
  const results = checks.map((check) => {
    const nodes = (check.selector === ':scope' ? [bar] : [...bar.querySelectorAll(check.selector)])
      .filter((node) => !check.name || (node.closest('button')?.getAttribute('aria-label') ?? node.closest('button')?.textContent.trim()) === check.name);
    const expected = token(check.token);
    // Text and icons sit on the surface or the fill named by `over`; fills and borders sit on the surface.
    const backdrop = check.kind === 'text' || check.kind === 'icon' ? (check.over ? token(check.over) : surface) : surface;
    const measured = nodes.map((node) => {
      const style = getComputedStyle(node, check.pseudo ?? null);
      const actual = toRgba(check.kind === 'fill' ? style.backgroundColor : check.kind === 'border' ? style.borderTopColor : style.color);
      // Firefox dims placeholders through opacity, which the color alone does not show.
      if (check.pseudo) actual[3] *= Number(style.opacity);
      return {
        actual: actual.slice(0, 3),
        matches: actual.slice(0, 3).every((channel, index) => Math.abs(channel - expected[index]) <= 1),
        ratio: contrast(flatten(actual, backdrop), backdrop),
      };
    });
    return { what: check.what, min: check.min, count: nodes.length, matches: measured.every(({ matches }) => matches), ratio: Math.min(...measured.map(({ ratio }) => ratio)), expected: expected.slice(0, 3), actual: measured.map(({ actual }) => actual) };
  });
  probe.remove();
  return { surfaceOpaque: surface[3] === 1, results };
}

for (const engine of browserEngines()) {
  test(`TextEditor selection actions in ${engine}`, { timeout: 600_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/text-editor/index.mjs'],
      pages: { '/selection-actions.html': page },
      modules: { '/selection-actions-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/selection-actions.html`, '.ProseMirror');
      const errors = [];
      const open = async ({ scheme = 'light', viewport = { width: 900, height: 700 }, config = {} } = {}) => {
        const context = await browser.newContext({ viewport });
        const tab = await context.newPage();
        tab.on('pageerror', (error) => errors.push(error.message));
        tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await tab.goto(`${url}/selection-actions.html?scheme=${scheme}&config=${encodeURIComponent(JSON.stringify(config))}`, { waitUntil: 'networkidle' });
        await tab.locator('.ProseMirror').waitFor({ timeout: 30_000 });
        const editor = tab.locator('.ProseMirror');
        const bar = tab.locator(barSelector);
        const api = {
          context, tab, editor, bar,
          // Finds a control by its accessible name, so the proof also covers names and roles.
          control: (name) => bar.getByRole('button', { name, exact: true }).or(bar.getByRole('textbox', { name, exact: true })),
          status: () => tab.locator('[role="status"]').textContent(),
          // Where the first line of the paragraph sits, for placing the editor in a known spot.
          async word(text) {
            return tab.evaluate((word) => {
              const walker = document.createTreeWalker(document.querySelector('.ProseMirror'), NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const start = node.data.indexOf(word);
                if (start < 0) continue;
                const range = document.createRange();
                range.setStart(node, start);
                range.setEnd(node, start + word.length);
                const { left, top, width, height } = range.getBoundingClientRect();
                return { x: left + width / 2, y: top + height / 2, top, bottom: top + height, left, right: left + width };
              }
              throw new Error('no text ' + word);
            }, text);
          },
          // Selects a word with a real double click and waits for the bar.
          async selectWord(text) {
            const word = await api.word(text);
            await tab.mouse.dblclick(word.x, word.y);
            await bar.waitFor();
            return word;
          },
          selection: () => tab.evaluate(() => window.getSelection().toString().trim()),
          focused: () => tab.evaluate(() => document.activeElement === document.querySelector('.ProseMirror') ? 'editor' : document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName),
          html: () => editor.evaluate((node) => node.innerHTML),
          // Calls the latest request controller the way a caller's handler would.
          tools: (method, content) => tab.evaluate(({ method, content }) => window.__tools[method](content), { method, content }),
          aborted: () => tab.evaluate(() => window.__tools.signal.aborted),
          phase: (name) => tab.locator(`${barSelector}[data-phase="${name}"]`),
        };
        return api;
      };

      await t.test('the bar sits under a real selection without taking focus', async () => {
        const { tab, bar, selectWord, selection, focused, control, context } = await open();
        const word = await selectWord('weekend');
        assert.equal(await selection(), 'weekend');
        assert.equal(await focused(), 'editor', 'the bar never takes focus');
        const box = await rectOf(bar);
        assert.ok(box.top >= word.bottom - 1, `the bar starts below the selection (${box.top} vs ${word.bottom})`);
        assert.ok(box.top - word.bottom < 40, 'the bar stays close to the selection');
        assert.ok(box.left < word.x && box.right > word.x, 'the bar spans the middle of the selection');
        assert.deepEqual(await bar.evaluate((node) => [...node.querySelectorAll('button, input')].map((control) => control.getAttribute('aria-label') ?? control.textContent.trim())), ['Describe edits', 'Explain', 'Improve', 'More actions']);

        // A pointer press on the bar leaves the editor focused and the selection intact.
        await control('Explain').click();
        assert.equal(await focused(), 'editor');
        assert.equal(await selection(), 'weekend');
        assert.deepEqual(await tab.evaluate(() => window.__requests), [{ type: 'action', id: 'explain' }]);
        await context.close();
      });

      await t.test('clicking away hides the bar without pulling focus back, and scrolling moves the bar with the text', async () => {
        const { tab, bar, selectWord, focused, context } = await open({ viewport: { width: 900, height: 500 }, config: { tail: 1200 } });
        const gap = async () => {
          const word = await tab.evaluate(() => {
            const range = document.createRange();
            const node = document.querySelector('.ProseMirror p').firstChild;
            range.setStart(node, 34);
            range.setEnd(node, 41);
            return range.getBoundingClientRect().bottom;
          });
          return (await rectOf(bar)).top - word;
        };
        await selectWord('weekend');
        const before = await gap();
        assert.ok(before >= -1 && before < 40, `the bar starts under the selection (${before})`);
        await tab.evaluate(() => window.scrollBy(0, 60));
        await tab.waitForFunction(() => window.scrollY === 60);
        await tab.waitForTimeout(100);
        assert.ok(Math.abs((await gap()) - before) < 2, 'the bar follows the text when the page scrolls');

        await tab.locator('#after').click();
        await bar.waitFor({ state: 'detached' });
        // WebKit leaves a clicked button unfocused, so only require that focus is not pulled back to the editor.
        assert.notEqual(await focused(), 'editor', 'focus stays where the user put it');
        await tab.evaluate(() => document.querySelector('.ProseMirror').focus());
        await bar.waitFor();
        await tab.mouse.click(5, 5);
        await bar.waitFor({ state: 'detached' });
        assert.equal(await tab.evaluate(() => document.activeElement === document.body), true, 'a click on the page background does not return focus to the editor');
        await context.close();
      });

      await t.test('a scoped dark right-to-left editor keeps its scope and direction in the bar', async () => {
        const { tab, bar, selectWord, selection, focused, context } = await open({ config: { scope: 'dark-rtl' } });
        await selectWord('weekend');
        assert.equal(await selection(), 'weekend');
        assert.equal(await bar.evaluate((node) => node.closest('#scope') !== null), true, 'the bar renders inside the scoped subtree');
        assert.equal(await bar.getAttribute('dir'), 'rtl');
        assert.equal(await bar.evaluate((node) => getComputedStyle(node).direction), 'rtl', 'the bar lays out right to left');
        // The dark token resolves inside the scope but not on the light page, so the bar surface proves the scope applies.
        const surfaces = await bar.evaluate((node) => {
          const resolve = (parent) => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--muxui-semantic-color-neutral-18)';
            parent.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          };
          return { bar: getComputedStyle(node).backgroundColor, scoped: resolve(document.querySelector('#scope')), page: resolve(document.body) };
        });
        assert.equal(surfaces.bar, surfaces.scoped, 'the bar uses the scoped dark surface');
        assert.notEqual(surfaces.bar, surfaces.page, 'the page itself is light');
        // Right to left: the forward arrow is the left arrow.
        await tab.keyboard.press('Alt+F10');
        assert.equal(await focused(), 'Describe edits');
        await tab.keyboard.press('ArrowLeft');
        assert.equal(await focused(), 'Explain', 'ArrowLeft moves forward');
        await tab.keyboard.press('ArrowRight');
        assert.equal(await focused(), 'Describe edits', 'ArrowRight moves back');
        await context.close();
      });

      await t.test('a theme preset scope without a mode attribute reaches the bar', async () => {
        const { bar, selectWord, context } = await open({ config: { scope: 'preset' } });
        await selectWord('weekend');
        assert.equal(await bar.evaluate((node) => node.closest('#scope') !== null), true, 'the bar renders inside the preset scope');
        // The preset sets its own neutral palette, so the bar surface proves the preset applies.
        const surfaces = await bar.evaluate((node) => {
          const resolve = (parent) => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--muxui-semantic-color-neutral-10)';
            parent.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          };
          return { bar: getComputedStyle(node).backgroundColor, scoped: resolve(document.querySelector('#scope')), page: resolve(document.body) };
        });
        assert.equal(surfaces.bar, surfaces.scoped, 'the bar uses the preset surface');
        assert.notEqual(surfaces.bar, surfaces.page, 'the page uses the default surface');
        await context.close();
      });

      await t.test('the bar flips above the selection near the bottom edge and stays in view', async () => {
        const probe = await open();
        const first = await probe.word('Pistachio');
        await probe.context.close();
        const { tab, bar, selectWord, context } = await open({ config: { spacer: 700 - 70 - Math.round(first.top) } });
        const word = await selectWord('weekend');
        assert.ok(word.bottom > 600, `the selection sits near the bottom edge (${word.bottom})`);
        const box = await rectOf(bar);
        assert.ok(box.bottom <= word.top + 1, `the bar flips above the selection (${box.bottom} vs ${word.top})`);
        assert.ok(box.top >= 0 && box.bottom <= 700, 'the bar stays inside the viewport');
        assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await context.close();
      });

      await t.test('a 360px viewport keeps the bar inside the page in every state', async () => {
        const { tab, bar, selectWord, control, context, phase } = await open({ viewport: { width: 360, height: 640 }, config: { hold: true } });
        const fits = async (where) => {
          const box = await rectOf(bar);
          assert.ok(box.left >= 0 && box.right <= 360, `${where}: the bar spans ${box.left} to ${box.right}`);
          assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${where}: the page does not scroll sideways`);
        };
        await selectWord('weekend');
        await fits('rest');
        await control('More actions').click();
        await fits('expanded');
        await control('Show fewer actions').click();
        await control('Describe edits').fill('make it a little shorter and a lot warmer than before');
        await fits('typed');
        await control('Send').click();
        await phase('pending').waitFor();
        await fits('pending');
        await tab.evaluate(() => window.__settle.reject(new Error('offline')));
        await phase('error').waitFor();
        await fits('error');
        await control('Dismiss').click();
        await phase('idle').waitFor();
        await context.close();
      });

      await t.test('Alt+F10, arrows, Home, End, Tab, and Escape move focus and keep the selection', async () => {
        const { tab, bar, selectWord, selection, focused, context } = await open();
        await selectWord('weekend');
        await tab.keyboard.press('Alt+F10');
        assert.equal(await focused(), 'Describe edits', 'Alt+F10 moves focus into the bar');
        assert.equal(await tab.locator('.muxui-text-editor__selection-range').textContent(), 'weekend', 'the selection stays painted while focus is in the bar');
        const visited = [];
        for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'Home']) {
          await tab.keyboard.press(key);
          visited.push(await focused());
        }
        assert.deepEqual(visited, ['Explain', 'Improve', 'More actions', 'More actions', 'Improve', 'Describe edits']);
        await tab.keyboard.press('ArrowRight');
        await tab.keyboard.press('End');
        assert.equal(await focused(), 'More actions');

        await tab.keyboard.press('Escape');
        assert.equal(await focused(), 'editor', 'Escape returns focus to the editor');
        assert.equal(await selection(), 'weekend', 'the selection stays intact');
        await bar.waitFor();
        await tab.keyboard.press('Alt+F10');
        await tab.keyboard.press('Tab');
        assert.equal(await focused(), 'editor', 'Tab leaves the bar for the editor');
        assert.equal(await selection(), 'weekend');

        await tab.keyboard.press('Escape');
        await bar.waitFor({ state: 'detached' });
        await selectWord('holds');
        await bar.waitFor();
        await context.close();
      });

      await t.test('the instruction field sends on Enter, never while composing, and shows Send', async () => {
        const { tab, bar, selectWord, control, context } = await open();
        await selectWord('weekend');
        const field = control('Describe edits');
        await field.fill('shorter');
        assert.deepEqual(await bar.evaluate((node) => [...node.querySelectorAll('button, input')].map((control) => control.getAttribute('aria-label'))), ['Describe edits', 'Send']);
        await field.evaluate((node) => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
        assert.equal(await tab.evaluate(() => window.__requests.length), 0, 'an IME confirmation does not send');
        await field.press('Enter');
        assert.deepEqual(await tab.evaluate(() => window.__requests), [{ type: 'instruction', text: 'shorter' }]);
        assert.equal(await control('Describe edits').inputValue(), '');
        await context.close();
      });

      await t.test('a pending request announces, marks the bar busy, and cancels through the signal', async () => {
        const { tab, bar, selectWord, control, status, focused, selection, aborted, context, phase } = await open({ config: { hold: true } });
        await selectWord('weekend');
        await control('Improve').click();
        await tab.locator(`${barSelector}[aria-busy="true"]`).waitFor();
        assert.equal(await focused(), 'editor', 'the pending bar does not take focus');
        assert.equal(await selection(), 'weekend');
        assert.equal(await bar.textContent(), 'Improving…Cancel');
        assert.equal(await status(), 'Improving…', 'the live region announces the pending text');

        await control('Cancel').click();
        assert.equal(await aborted(), true, 'Cancel aborts the signal');
        assert.equal(await tab.evaluate(() => window.__tools.replace('late')), false);
        await phase('idle').waitFor();

        await control('Explain').click();
        await tab.keyboard.press('Alt+F10');
        assert.equal(await focused(), 'Cancel');
        await tab.keyboard.press('Escape');
        assert.equal(await aborted(), true, 'Escape aborts the signal');
        assert.equal(await focused(), 'editor');
        await tab.evaluate(() => window.__settle.reject(new Error('late')));
        await phase('idle').waitFor();

        await control('Explain').click();
        await tab.evaluate(() => window.__settle.reject(new Error('offline')));
        await phase('error').waitFor();
        assert.equal(await status(), "Couldn't complete the edit");
        await control('Try again').click();
        assert.equal(await tab.evaluate(() => window.__requests.length), 4, 'Try again sends the request again');
        await tab.evaluate(() => window.__settle.resolve());
        await phase('idle').waitFor();
        await context.close();
      });

      await t.test('review keeps, discards, and retries an edit and restores the original exactly', async () => {
        const { tab, editor, bar, selectWord, control, selection, focused, html, tools, context, phase } = await open();
        const original = await html();
        await selectWord('weekend');
        await control('Improve').click();
        const edits = await tab.evaluate(() => window.__edits);
        assert.equal(await tools('replace', 'weekday'), true);
        await phase('review').waitFor();
        assert.match(await editor.textContent(), /all weekday\./u);
        assert.equal(await tab.locator('.muxui-text-editor__selection-range').textContent(), 'weekday', 'the new content stays highlighted');
        assert.equal(await tab.locator('.muxui-text-editor__selection-range').evaluate((node) => getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)'), true);
        assert.equal(await tab.evaluate(() => window.__edits), edits + 1, 'an applied edit reports one change');

        await control('Discard').click();
        await phase('idle').waitFor();
        assert.equal(await html(), original, 'Discard restores the original content exactly');
        assert.equal(await selection(), 'weekend', 'Discard reselects the original range');
        assert.equal(await focused(), 'editor');

        await control('Improve').click();
        await tools('replace', 'weekday');
        await phase('review').waitFor();
        await control('Try again').click();
        await phase('idle').waitFor();
        assert.equal(await html(), original, 'Try again restores the original first');
        assert.deepEqual(await tab.evaluate(() => window.__requests.slice(-2)), [{ type: 'action', id: 'improve' }, { type: 'action', id: 'improve' }]);

        await tools('replace', 'weekday');
        await phase('review').waitFor();
        await control('Keep').click();
        await bar.waitFor({ state: 'detached' });
        assert.match(await editor.textContent(), /all weekday\./u);
        await tab.keyboard.press('ControlOrMeta+Z');
        assert.equal(await html(), original, 'a kept edit undoes in one step');
        await context.close();
      });

      for (const scheme of ['light', 'dark']) {
        await t.test(`${scheme} mode names every control, resolves token colors, meets contrast, and announces`, async (subtest) => {
          const { tab, bar, selectWord, control, tools, status, context, phase } = await open({ scheme, config: { hold: true } });
          await selectWord('weekend');
          const painted = (locator) => locator.evaluate((node) => getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)');
          assert.equal(await painted(bar), true, 'the bar has a surface');
          await tab.keyboard.press('Alt+F10');
          assert.equal(await painted(tab.locator('.muxui-text-editor__selection-range')), true, 'the painted range has a fill');
          assert.equal(await control('Describe edits').evaluate((node) => { const style = getComputedStyle(node); return style.outlineStyle !== 'none' || style.boxShadow !== 'none'; }), true, 'the focused field shows a focus indicator');

          const region = tab.locator('[role="status"]');
          const audit = async (state) => {
            await tab.mouse.move(0, 0);
            const { controls, status: announced } = stateContracts[state];
            // The toolbar has its role and label, and every control is named, once, with nothing else focusable.
            assert.equal(await tab.getByRole('toolbar', { name: 'Selection actions', exact: true }).count(), 1, `${state}: the toolbar has its role and label`);
            assert.equal(await bar.getAttribute('aria-orientation'), 'horizontal');
            for (const [role, name] of controls) assert.equal(await bar.getByRole(role, { name, exact: true }).count(), 1, `${state}: one ${role} named ${name}`);
            assert.equal(await bar.locator('button, input, select, textarea, a[href], [tabindex]').count(), controls.length, `${state}: every focusable control is named`);
            assert.equal(await bar.locator('svg').evaluateAll((icons) => icons.every((icon) => icon.getAttribute('aria-hidden') === 'true' && icon.getAttribute('focusable') === 'false' && icon.getAttribute('stroke') === 'currentColor')), true, `${state}: icons are decorative and take the control color`);
            // The live region announces the state in a polite status.
            assert.equal(await region.count(), 1);
            assert.equal(await region.getAttribute('aria-live'), 'polite');
            assert.equal(await region.getAttribute('aria-atomic'), 'true');
            assert.equal(await status(), announced, `${state}: the live region text`);
            // Colors resolve to the intended tokens, with the contrast the token pairs promise.
            const measured = await tab.evaluate(measureColors, { checks: colorChecks(state, scheme) });
            assert.equal(measured.surfaceOpaque, true);
            for (const result of measured.results) {
              assert.ok(result.count > 0, `${scheme} ${state}: ${result.what} is rendered`);
              assert.equal(result.matches, true, `${scheme} ${state}: ${result.what} is ${JSON.stringify(result.actual)}, expected token color ${JSON.stringify(result.expected)}`);
              assert.ok(result.ratio >= result.min, `${scheme} ${state}: ${result.what} contrast ${result.ratio.toFixed(2)}:1 is under ${result.min}:1`);
              subtest.diagnostic(`${engine} ${scheme} ${state} ${result.what}: ${result.ratio.toFixed(2)}:1 (min ${result.min}:1)`);
            }
          };

          await audit('rest');
          await tab.keyboard.press('ArrowRight');
          await tab.keyboard.press('Enter');
          await phase('pending').waitFor();
          await audit('pending');

          assert.equal(await tools('replace', 'weekday'), true);
          await phase('review').waitFor();
          await audit('review');

          await control('Try again').click();
          await phase('pending').waitFor();
          await tab.evaluate(() => window.__settle.reject(new Error('offline')));
          await phase('error').waitFor();
          await audit('error');

          await control('Dismiss').click();
          await phase('idle').waitFor();
          assert.equal(await status(), '', 'the live region clears when the request ends');
          await context.close();
        });
      }

      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });
}

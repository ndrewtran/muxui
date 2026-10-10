import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { patternVariantExamples } from '../../../../tooling/audits/repository-policy/src/pattern-variants.mjs';
import { browserEngines, launchBrowser, packageRoot, pageShell, repositoryRoot, startServer } from './harness.mjs';
import { measureFocusRing, measureSelectedPaint, pollUntil, settleMotion, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof (E-BL1-04) that the shipped poster grid variants, loaded
// from their canonical catalog sources through the public `@muxui/react` entry,
// keep the interactive behavior the block promises: arrow keys move between
// cards by position, Tab walks a card's nested Details link and Save button, a
// nested action never selects, focus is visible, and pressing a card selects it.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).
//
// Cards are named by their visible "#N" number. At the fixed 900px container
// every variant shows four columns:
//   1 2 3 4
//   5 6 7 8
// The CSS grid variant disables cards 5 and 10; the virtualized variant disables
// every 11th card (11, 22, ...).

const variants = (await patternVariantExamples(repositoryRoot)).filter(({ patternSlug }) => patternSlug === 'poster-grid');
assert.deepEqual(variants.map(({ variantSlug }) => variantSlug), ['css-grid', 'virtualized'], 'the poster grid ships both variants');

const entry = (variant) => `
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Variant from '/${variant.source}';

const Example = Object.values(Variant).find((value) => typeof value === 'function');
const { width = 900 } = JSON.parse(new URLSearchParams(location.search).get('config') ?? '{}');
window.__events = [];
window.__cardClicks = [];
window.__presses = [];
// Records every click that reaches a nested link or button, before any handler can stop it,
// and apart from those the clicks on a card's own surface.
document.addEventListener('click', (event) => {
  const control = event.target.closest?.('a, button');
  const row = event.target.closest?.('[role="row"]');
  if (control && row) window.__events.push([control.tagName.toLowerCase(), window.__card(row)]);
  else if (row) window.__cardClicks.push(window.__card(row));
}, true);
// Records every React Aria press start, keyboard presses included (data-pressed appears on the pressed element).
// A press can end before the next poll, so the attribute's mutations are the signal, not its presence.
new MutationObserver((records) => {
  for (const { target, oldValue } of records) {
    if (oldValue !== null) continue;
    const row = target.closest('[role="row"]');
    window.__presses.push([target === row ? 'row' : target.tagName.toLowerCase(), row ? window.__card(row) : 0]);
  }
}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-pressed'], attributeOldValue: true });

window.__card = (row) => Number(/#(\\d+) /u.exec(row.textContent)?.[1]);
// Names the focused card, plus the nested control when focus is inside one.
window.__focus = () => {
  const node = document.activeElement;
  const row = node?.closest?.('[role="row"]');
  if (!row) return node?.id || node?.tagName?.toLowerCase() || 'none';
  return node === row ? String(window.__card(row)) : window.__card(row) + ':' + ({ A: 'link', BUTTON: 'button' }[node.tagName] ?? node.tagName.toLowerCase());
};
window.__selected = () => [...document.querySelectorAll('[role="row"][aria-selected="true"]')].map(window.__card);

createRoot(document.getElementById('root')).render(React.createElement('div', { style: { inlineSize: width } }, React.createElement(Example)));
`;

const page = (url) => pageShell({
  attributes: `data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}" data-muxui-motion="full"`,
  head: '<link rel="stylesheet" href="/packages/react/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  // WebKit on macOS skips plain buttons in sequential navigation; RAC controls carry tabindex.
  body: '<button id="before" tabindex="0">Before</button><div id="root"></div><button id="after" tabindex="0">After</button>',
  entry: `/${url.searchParams.get('variant')}-entry.mjs`,
});

for (const engine of browserEngines()) {
  test(`poster grid variants keep their keyboard, focus, and selection behavior in ${engine}`, { timeout: 600_000 }, async (t) => {
    const { url, close } = await startServer({
      root: 'repository',
      aliasReact: true,
      alias: { '@muxui/react': resolve(packageRoot, 'generated/index.mjs') },
      entries: ['packages/react/generated/index.mjs', ...variants.map(({ source }) => source)],
      pages: { '/poster-grid.html': page },
      modules: Object.fromEntries(variants.map((variant) => [`/${variant.variantSlug}-entry.mjs`, entry(variant)])),
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/poster-grid.html?variant=css-grid`, '[role="grid"] [role="row"]');
      const errors = [];

      for (const { variantSlug, variantName } of variants) {
        await t.test(`${variantName}: arrows, nested Tab stops, nested actions, focus, and selection`, async () => {
          const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1000, height: 800 } });
          const tab = await context.newPage();
          tab.on('pageerror', (error) => errors.push(`${variantSlug}: ${error.message}`));
          tab.on('console', (message) => { if (message.type() === 'error') errors.push(`${variantSlug}: ${message.text()}`); });
          try {
            const open = async (scheme = 'light') => {
              await tab.goto(`${url}/poster-grid.html?variant=${variantSlug}&scheme=${scheme}`, { waitUntil: 'networkidle' });
              await tab.locator('[role="grid"] [role="row"]').first().waitFor({ timeout: 15_000 }).catch((error) => assert.fail(`no card rendered: ${error.message.split('\n')[0]}; page errors ${JSON.stringify(errors)}`));
              await tab.locator('[data-muxui-grid-list-motion-ready]').waitFor();
              await tab.mouse.move(0, 0);
              // The virtualized variant starts at two columns and takes its tier from the measured width.
              await pollUntil(tab, () => {
                const rows = [...document.querySelectorAll('[role="row"]')];
                const top = rows[0].getBoundingClientRect().top;
                return rows.filter((row) => Math.abs(row.getBoundingClientRect().top - top) < 2).length === 4;
              }, undefined, { message: 'the grid settles on four columns', report: () => document.querySelectorAll('[role="row"]').length, timeout: 10_000 });
            };
            // `has-text` trims its text, so "#1 " would also match cards 10 to 19; a pattern keeps the space.
            const row = (card) => tab.locator('[role="row"]').filter({ hasText: new RegExp(`#${card} `, 'u') });
            const events = () => tab.evaluate(() => window.__events);
            const selected = () => tab.evaluate(() => window.__selected());
            const expectFocus = (expected, message = 'focus') => pollUntil(tab, (value) => window.__focus() === value, expected, {
              message: `${message}: focus reaches ${expected}`,
              report: () => ({ focus: window.__focus(), active: document.activeElement?.outerHTML.slice(0, 120) }),
            });
            // The focused element, named as the failure message needs it.
            const active = () => tab.evaluate(() => {
              const element = document.activeElement;
              const row = element?.closest('[role="row"]');
              return { tag: element?.tagName.toLowerCase(), text: element?.textContent.trim(), card: row ? window.__card(row) : null };
            });
            // Presses `key` on the focused nested control after proving focus is on it, and returns what
            // the press activated. React Aria runs a keyboard press itself and cancels the native click,
            // except for Enter on macOS, which keeps it. So a control is activated by a press start or a
            // click, whichever the platform produces. Anything that reached another control or a card's own
            // surface is listed too.
            const activate = async (key, expected) => {
              assert.deepEqual(await active(), expected, `${key} needs focus on ${JSON.stringify(expected)}; focus is on ${JSON.stringify(await active())}`);
              const [clicks, presses] = await tab.evaluate(() => [window.__events.length, window.__presses.length]);
              await tab.keyboard.press(key);
              const signals = await tab.evaluate(([from, pressFrom]) => ({
                clicks: window.__events.slice(from),
                presses: window.__presses.slice(pressFrom),
                cardClicks: window.__cardClicks,
              }), [clicks, presses]);
              const activations = [...signals.presses, ...signals.clicks].map((signal) => JSON.stringify(signal));
              assert.ok(activations.length > 0, `${key} on ${expected.text} activated nothing: ${JSON.stringify(signals)}`);
              assert.deepEqual([...new Set(activations)], [JSON.stringify([expected.tag, expected.card])], `${key} on ${expected.text} activated only that control: ${JSON.stringify(signals)}`);
              assert.deepEqual(signals.cardClicks, [], `${key} on ${expected.text} never clicks its card: ${JSON.stringify(signals)}`);
              await pollUntil(tab, () => document.querySelector('[data-pressed]') === null, undefined, { message: `the press from ${key} ends`, report: () => document.querySelector('[data-pressed]')?.outerHTML.slice(0, 120) });
            };
            const press = async (keys) => {
              for (const [key, destination] of keys) {
                await tab.keyboard.press(key);
                await expectFocus(destination, `${key} moves focus to ${destination}`);
              }
            };
            // Tab from the control before the grid lands on the first card.
            const enter = async () => {
              await tab.locator('#before').focus();
              await tab.keyboard.press('Tab');
              await expectFocus('1', 'Tab enters the grid on its first card');
            };
            // The browser scrolls a focused card into view on its own schedule, so the ring is polled.
            const expectRing = async (message) => {
              const expected = { focusVisible: true, painted: true, insideRoot: true, clippedBy: [] };
              let ring;
              for (const deadline = Date.now() + 5000; Date.now() < deadline;) {
                ring = await tab.evaluate(measureFocusRing);
                if (JSON.stringify(ring) === JSON.stringify(expected)) return;
                await tab.waitForTimeout(100);
              }
              assert.deepEqual(ring, expected, message);
            };

            // A nested control's painted ring, as the focus-visible tokens set it, once its transitions have
            // finished: Save fades its ring in and out, so a read in between blends the focused and resting paint.
            const paintOf = async (control) => {
              await settleMotion(control);
              return control.evaluate((node) => {
                const styles = getComputedStyle(node);
                return { outline: styles.outlineStyle === 'none' ? 'none' : `${styles.outlineWidth} ${styles.outlineStyle} ${styles.outlineColor}`, boxShadow: styles.boxShadow };
              });
            };
            // The focused nested control shows a focus-visible ring inside the grid and clear of every clipping ancestor.
            // The paint is read first, so the ring is measured at full size and not partway through its fade-in.
            const expectControlRing = async (control, name) => {
              const paint = await paintOf(control);
              const { painted, ...ring } = await tab.evaluate(measureFocusRing);
              assert.deepEqual(ring, { focusVisible: true, insideRoot: true, clippedBy: [] }, `${name} shows an unclipped focus-visible ring`);
              return paint;
            };

            await open();
            assert.equal(await tab.locator('[role="grid"]').getAttribute('aria-multiselectable'), 'true', 'cards select in multiples');
            assert.equal(await tab.locator('[role="grid"]').getAttribute('aria-label'), 'Posters');

            // Arrow keys move by position and never select.
            await enter();
            await press([['ArrowRight', '2'], ['ArrowRight', '3'], ['ArrowRight', '4'], ['ArrowDown', '8'], ['ArrowLeft', '7'], ['ArrowLeft', '6'], ['ArrowUp', '2'], ['ArrowLeft', '1']]);
            assert.deepEqual(await selected(), [], 'arrow navigation never selects');
            // A disabled card is skipped: card 5 below card 1, or card 11 below card 7.
            if (variantSlug === 'css-grid') await press([['ArrowDown', '9']]);
            else await press([['ArrowRight', '2'], ['ArrowRight', '3'], ['ArrowDown', '7'], ['ArrowDown', '15']]);
            assert.deepEqual(await selected(), []);

            // Every focused card shows an unclipped ring.
            await open();
            await enter();
            for (const [key, card] of [['', '1'], ['ArrowRight', '2'], ['ArrowDown', '6'], ['ArrowRight', '7'], ['ArrowUp', '3']]) {
              if (key) await tab.keyboard.press(key);
              await expectFocus(card);
              await expectRing(`card ${card} ring`);
            }

            // Tab walks a card's nested controls in both directions, and moving focus presses nothing.
            await open();
            await enter();
            const details = row(1).locator('a');
            const save = row(1).locator('button');
            await press([['Tab', '1:link']]);
            const detailsRing = await expectControlRing(details, 'Details');
            await press([['Tab', '1:button']]);
            const saveRing = await expectControlRing(save, 'Save');
            await press([['Tab', 'after']]);
            // A ring that only exists while the control has focus differs from its resting paint.
            assert.notDeepEqual(await paintOf(details), detailsRing, 'Details paints its ring only while focused');
            assert.notDeepEqual(await paintOf(save), saveRing, 'Save paints its ring only while focused');
            await enter();
            await press([['Tab', '1:link'], ['Tab', '1:button'], ['Shift+Tab', '1:link'], ['Shift+Tab', '1'], ['Shift+Tab', 'before']]);
            assert.deepEqual(await events(), [], 'moving focus never presses a control');
            assert.deepEqual(await selected(), []);

            // A nested action runs only its own control, by keyboard or pointer, and never selects.
            // The log holds every click that reached a nested control, newest last.
            await open();
            await enter();
            await press([['Tab', '1:link']]);
            await tab.keyboard.press('Enter');
            // The Details link keeps its placeholder href, so pressing it only moves the fragment.
            await pollUntil(tab, () => /^#(?:poster-)?1$/u.test(location.hash), undefined, { message: 'Enter on Details follows its link', report: () => location.hash });
            assert.deepEqual(await events(), [['a', 1]], 'Enter on Details clicks only that link');
            assert.deepEqual(await selected(), [], 'Enter on a nested link leaves selection unchanged');
            await press([['Tab', '1:button']]);
            // Enter and Space each activate Save (a press or a click, see `activate`), never its card or Details.
            await activate('Enter', { tag: 'button', text: 'Save', card: 1 });
            await activate('Space', { tag: 'button', text: 'Save', card: 1 });
            assert.deepEqual(await selected(), [], 'Enter and Space on a nested button leave selection unchanged');
            // Only the pointer presses are compared: whether a keyboard press leaves a click is the platform's (see `activate`).
            const keyboardClicks = (await events()).length;
            await row(2).locator('button').click();
            await row(2).locator('a').click();
            assert.deepEqual((await events()).slice(keyboardClicks), [['button', 2], ['a', 2]], 'a pointer press runs only the pressed control');
            assert.equal((await events()).every(([, card]) => card === 1 || card === 2), true, 'no other card ran an action');
            assert.deepEqual(await selected(), [], 'nested actions leave selection unchanged');
            await pollUntil(tab, () => /^#(?:poster-)?2$/u.test(location.hash), undefined, { message: 'the pointer press on Details follows its link', report: () => location.hash });

            // A disabled card disables both nested controls and takes no press.
            await open();
            const disabledCard = variantSlug === 'css-grid' ? 5 : 11;
            const disabledRow = row(disabledCard);
            if (variantSlug !== 'css-grid') {
              await enter();
              await press([['ArrowRight', '2'], ['ArrowRight', '3'], ['ArrowDown', '7']]);
            }
            await disabledRow.first().waitFor({ state: 'attached' });
            assert.equal(await disabledRow.getAttribute('aria-disabled'), 'true');
            assert.equal(await disabledRow.locator('button').isDisabled(), true, 'the nested Button follows its card');
            assert.equal(await disabledRow.locator('.muxui-link').getAttribute('aria-disabled'), 'true', 'the nested Link is passed disabled');
            const box = await disabledRow.boundingBox();
            await tab.mouse.click(box.x + 4, box.y + 4);
            assert.deepEqual(await selected(), [], 'a disabled card is not selectable');

            // Pressing a card selects it; selection accumulates and toggles off.
            await open();
            await row(1).locator('.muxui-text').first().click();
            assert.deepEqual(await selected(), [1]);
            await row(2).locator('.muxui-text').first().click();
            assert.deepEqual(await selected(), [1, 2]);
            await row(2).locator('.muxui-text').first().click();
            assert.deepEqual(await selected(), [1]);
            assert.deepEqual(await events(), [], 'pressing a card body runs no nested action');

            // Space on a focused card toggles it by keyboard.
            await open();
            await enter();
            await press([['ArrowRight', '2'], ['ArrowRight', '3']]);
            await tab.keyboard.press('Space');
            await pollUntil(tab, () => window.__selected().join() === '3', undefined, { message: 'Space selects the focused card', report: () => window.__selected() });
            await press([['ArrowRight', '4']]);
            await tab.keyboard.press('Space');
            await pollUntil(tab, () => window.__selected().join() === '3,4', undefined, { message: 'Space adds the next card', report: () => window.__selected() });
            await tab.keyboard.press('Space');
            await pollUntil(tab, () => window.__selected().join() === '3', undefined, { message: 'Space toggles the card off', report: () => window.__selected() });
            assert.equal(await tab.locator('[role="row"][aria-selected="true"]').count(), 1);
            // With focus on card 4, selected card 3 paints the selection tokens; focusing it again keeps a ring.
            const selector = '[role="row"][aria-selected="true"]';
            await tab.mouse.move(0, 0);
            await settleMotion(tab.locator(selector));
            for (const [property, [actual, expected]] of Object.entries(await tab.evaluate(measureSelectedPaint, selector))) {
              assert.equal(actual, expected, `${property} uses the selection tokens`);
            }
            await press([['ArrowLeft', '3']]);
            await expectRing('a focused selected card keeps its ring');
            assert.deepEqual(await events(), []);

            // The selection tokens hold in the dark scheme too.
            await open('dark');
            await row(1).locator('.muxui-text').first().click();
            assert.deepEqual(await selected(), [1]);
            await settleMotion(tab.locator(selector));
            for (const [property, [actual, expected]] of Object.entries(await tab.evaluate(measureSelectedPaint, selector))) {
              assert.equal(actual, expected, `dark ${property} uses the selection tokens`);
            }
          } finally {
            await context.close();
          }
        });
      }

      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });
}

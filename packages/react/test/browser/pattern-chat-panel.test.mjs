import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { assertFits, assertUniqueIds, openBlock, patternVariant, reachableStops, ringWalk, startVariantServer, stopOf, tabWalk } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that the chat panel block, loaded from its canonical catalog
// source through the public `@muxui/react` and `@muxui/react/markdown` entries,
// switches threads by pointer and arrow keys, renders Markdown in assistant replies,
// sends a typed message into the open thread only (Enter sends, Shift+Enter adds a
// line, and the draft clears), opens its actions menu by pointer and keyboard, never
// contacts a service or submits, shows visible focus in light and dark, and never
// overflows the page horizontally down to 360 and 390 (E-BL1-04). Runs in every engine
// named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const variant = await patternVariant('chat-panel', 'tabbed-thread');

const message = (tab) => tab.getByRole('textbox', { name: 'Message' });
const thread = (tab) => tab.getByRole('tabpanel').getByRole('log');

/** Nothing navigated or submitted, and the page never reloaded. */
const assertInert = async (tab, errors) => {
  assert.equal(await tab.evaluate(() => window.__sentinel), 'alive', 'the page never reloaded');
  // The composer is a form, so a submit event fires; the block must have prevented every one.
  assert.equal((await tab.evaluate(() => window.__submits)).includes(false), false, 'no submit was left to the browser');
  assert.deepEqual(errors, []);
};

for (const engine of browserEngines()) {
  test(`chat panel keeps its thread, composer, menu, focus, and layout behavior in ${engine}`, { timeout: 600_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/block.html`, '#root > *');

      await t.test('switches threads by pointer and arrow keys, and renders Markdown in assistant replies', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          const plan = tab.getByRole('tab', { name: 'Plan' });
          const support = tab.getByRole('tab', { name: 'Support' });
          await thread(tab).waitFor();
          assert.equal(await plan.getAttribute('aria-selected'), 'true');
          await tab.getByText('What is still blocking the beta launch?').waitFor();

          // The assistant reply is Markdown: the bold phrase is a strong element, not literal asterisks.
          assert.equal(await thread(tab).locator('strong').first().textContent(), 'billing copy review');
          assert.equal((await thread(tab).textContent()).includes('**'), false, 'no literal Markdown markers show');

          await plan.focus();
          await tab.keyboard.press('ArrowRight');
          assert.equal(await stopOf(tab), 'tab Support');
          assert.equal(await support.getAttribute('aria-selected'), 'true', 'an arrow key selects the next thread');
          await tab.getByText('How many tickets are waiting?').waitFor();
          assert.equal(await tab.getByText('What is still blocking the beta launch?').count(), 0, 'one thread shows at a time');
          assert.equal(await thread(tab).locator('strong').first().textContent(), 'older than two days');

          await plan.click();
          await tab.getByText('What is still blocking the beta launch?').waitFor();
          await assertInert(tab, errors);
        } finally {
          await context.close();
        }
      });

      await t.test('sends into the open thread only, adds a line on Shift+Enter, and keeps each thread its own', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          const send = tab.getByRole('button', { name: 'Send message' });
          await message(tab).waitFor();
          assert.equal(await send.isDisabled(), true, 'Send waits for text');
          const before = await thread(tab).getByRole('article').count();

          // Enter sends: the text joins the open thread, the draft clears, and focus stays in the box.
          await message(tab).fill('Please summarize the open items');
          assert.equal(await send.isDisabled(), false);
          await message(tab).press('Enter');
          await thread(tab).getByText('Please summarize the open items').waitFor();
          assert.equal(await thread(tab).getByRole('article').count(), before + 1);
          assert.equal(await message(tab).inputValue(), '', 'the draft clears');
          assert.equal(await stopOf(tab), 'textbox Message', 'focus stays in the box');

          // Shift+Enter adds a line and sends nothing.
          await message(tab).fill('line one');
          await message(tab).press('Shift+Enter');
          await message(tab).pressSequentially('line two');
          assert.equal(await message(tab).inputValue(), 'line one\nline two');
          assert.equal(await thread(tab).getByRole('article').count(), before + 1, 'Shift+Enter does not send');

          // The Send button sends too, and the other thread is untouched.
          await send.click();
          await thread(tab).getByText('line two').waitFor();
          assert.equal(await message(tab).inputValue(), '');
          await tab.getByRole('tab', { name: 'Support' }).click();
          await tab.getByText('How many tickets are waiting?').waitFor();
          assert.equal(await tab.getByText('Please summarize the open items').count(), 0, 'a message stays in the thread it was sent to');
          await tab.getByRole('tab', { name: 'Plan' }).click();
          await thread(tab).getByText('Please summarize the open items').waitFor();
          assert.equal(await thread(tab).getByRole('article').count(), before + 2, 'the thread keeps what was sent');

          // The icon buttons are presentation only.
          await tab.getByRole('button', { name: 'New chat' }).click();
          await tab.getByRole('button', { name: 'History' }).click();
          await assertInert(tab, errors);
        } finally {
          await context.close();
        }
      });

      await t.test('opens its actions menu by pointer and keyboard, and returns focus on close', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          const trigger = tab.getByRole('button', { name: 'More actions' });
          const menu = tab.getByRole('menu', { name: 'More actions' });
          await trigger.click();
          await menu.waitFor();
          assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['Rename chat', 'Clear thread']);
          await tab.keyboard.press('Escape');
          await menu.waitFor({ state: 'detached' });
          assert.equal(await stopOf(tab), 'button More actions', 'focus returns to the trigger');

          await tab.keyboard.press('Enter');
          await menu.waitFor();
          await pollUntil(tab, () => document.activeElement.getAttribute('role') === 'menuitem', undefined, { message: 'opening by keyboard focuses an item' });
          assert.equal(await stopOf(tab), 'menuitem Rename chat');
          await tab.keyboard.press('ArrowDown');
          assert.equal(await stopOf(tab), 'menuitem Clear thread');
          await tab.keyboard.press('Enter');
          await menu.waitFor({ state: 'detached' });
          assert.equal(await stopOf(tab), 'button More actions');
          await assertInert(tab, errors);
        } finally {
          await context.close();
        }
      });

      await t.test('shows the Mux focus ring on the menu trigger, not the browser outline', async () => {
        const { context, tab } = await openBlock(browser, url);
        try {
          await tab.locator('#before').focus();
          for (let presses = 0; presses < 8 && await stopOf(tab) !== 'button More actions'; presses += 1) await tab.keyboard.press('Tab');
          assert.equal(await stopOf(tab), 'button More actions');
          await pollUntil(tab, () => {
            const { boxShadow, outlineStyle } = getComputedStyle(document.activeElement);
            return boxShadow !== 'none' && outlineStyle !== 'auto';
          }, undefined, { message: 'the focused menu trigger draws the ring and not the default outline', report: () => { const { boxShadow, outlineStyle } = getComputedStyle(document.activeElement); return { boxShadow, outlineStyle }; } });
        } finally {
          await context.close();
        }
      });

      await t.test('walks every control in order in light and dark, each with a focus ring that differs from rest', async () => {
        for (const scheme of ['light', 'dark']) {
          for (const [label, prepare, expected] of [
            ['empty draft', async () => {}, ['tab Plan', 'tabpanel Plan', 'button New chat', 'button History', 'button More actions', 'textbox Message']],
            ['typed draft', (tab) => message(tab).fill('Draft'), ['tab Plan', 'tabpanel Plan', 'button New chat', 'button History', 'button More actions', 'textbox Message', 'button Send message']],
          ]) {
            const { context, tab } = await openBlock(browser, url, { scheme });
            try {
              await prepare(tab);
              // The composer form shows its textarea's focus with its border colour.
              const seen = await tabWalk(tab, ringWalk(tab, '.muxui-prompt-composer'), `${label} ${scheme}`);
              assert.deepEqual(seen, reachableStops(browser, expected, ['button Send message']), `${scheme} ${label}: Tab visits the controls in this order, by accessible name`);
            } finally {
              await context.close();
            }
          }
        }
      });

      await t.test('two instances share no ids', async () => {
        await assertUniqueIds(browser, url, 'chat panel');
      });

      await t.test('never scrolls the page horizontally, even with a long unbroken message', async () => {
        await assertFits(browser, url, '.chat', 'chat panel');
        for (const scheme of ['light', 'dark']) {
          for (const width of [360, 390]) {
            const { context, tab, errors } = await openBlock(browser, url, { width, scheme });
            try {
              await message(tab).fill('Unbroken'.repeat(30));
              await message(tab).press('Enter');
              await pollUntil(tab, () => document.querySelector('[role="log"]').textContent.includes('UnbrokenUnbroken'), undefined, { message: 'the long message is in the thread' });
              assert.ok(await tab.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth), `${scheme} ${width}px: a long unbroken message adds no horizontal scroll`);
              assert.deepEqual(errors, []);
            } finally {
              await context.close();
            }
          }
        }
      });
    } finally {
      await browser?.close();
      await close();
    }
  });
}

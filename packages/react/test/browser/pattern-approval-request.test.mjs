import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { assertFits, assertUniqueIds, measurePageFit, openBlock, patternVariant, ringWalk, startVariantServer, stopOf, tabWalk } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that the approval request block, loaded from its canonical catalog
// source through the public `@muxui/react` entry, steps through its three questions with
// local state: Continue stays disabled until there is a choice or a free answer, Skip and
// the pager move without one, earlier answers stay, closing moves focus to its message,
// and nothing is submitted. It is driven by keyboard and pointer, shows visible focus in
// light and dark, and never overflows the page horizontally down to 360 and 390
// (E-BL1-04). Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const variant = await patternVariant('approval-request', 'question-stepper');

const heading = (tab) => tab.getByRole('heading', { level: 2 });
const status = (tab) => tab.getByRole('status');
const next = (tab) => tab.getByRole('button', { name: 'Continue', exact: true });
const expectQuestion = (tab, text, count) => pollUntil(tab, ([title, position]) => document.querySelector('h2').textContent === title && document.querySelector('[role="status"]').textContent === position, [text, `${count}/3`], {
  message: `the card shows ${text} at ${count}/3`,
  report: () => [document.querySelector('h2')?.textContent, document.querySelector('[role="status"]')?.textContent],
});
const walkFrom = async (browser, url, scheme, prepare) => {
  const { context, tab } = await openBlock(browser, url, { scheme });
  try {
    await prepare(tab);
    return await tabWalk(tab, ringWalk(tab), scheme);
  } finally {
    await context.close();
  }
};

for (const engine of browserEngines()) {
  test(`approval request keeps its question stepping, answers, focus, and layout behavior in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/block.html`, '#root > *');

      await t.test('keeps Continue disabled until there is an answer, steps by Continue, Skip, and the pager, and keeps earlier answers', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await expectQuestion(tab, 'How should the rollout be staged?', 1);
          assert.equal(await next(tab).isDisabled(), true, 'Continue starts disabled');
          assert.equal(await tab.getByRole('button', { name: 'Previous question' }).isDisabled(), true, 'Previous is disabled on the first question');
          const choices = tab.getByRole('radiogroup', { name: 'How should the rollout be staged?' });
          assert.deepEqual(await choices.getByRole('radio').evaluateAll((nodes) => nodes.map((node) => node.value)), ['All at once', 'In two waves', 'Region by region']);

          // A choice by pointer enables Continue, and the arrow keys move the choice.
          await tab.getByText('In two waves', { exact: true }).click();
          assert.equal(await next(tab).isDisabled(), false);
          await choices.getByRole('radio', { name: 'In two waves' }).focus();
          await tab.keyboard.press('ArrowDown');
          assert.equal(await choices.getByRole('radio', { name: 'Region by region' }).isChecked(), true);
          await next(tab).click();

          // Multiple choice: Continue stays off until one box is checked, and unchecking the last turns it off again.
          await expectQuestion(tab, 'Which notices should go out?', 2);
          assert.equal(await next(tab).isDisabled(), true);
          const notices = tab.getByRole('group', { name: 'Which notices should go out?' });
          await notices.getByRole('checkbox', { name: 'In-app banner' }).focus();
          await tab.keyboard.press('Space');
          assert.equal(await notices.getByRole('checkbox', { name: 'In-app banner' }).isChecked(), true, 'Space checks a box');
          await tab.getByText('Release notes', { exact: true }).click();
          assert.equal(await notices.getByRole('checkbox', { name: 'Release notes' }).isChecked(), true, 'a pointer press checks a box');
          assert.equal(await next(tab).isDisabled(), false);
          await tab.getByText('In-app banner', { exact: true }).click();
          await tab.getByText('Release notes', { exact: true }).click();
          assert.equal(await notices.getByRole('checkbox', { checked: true }).count(), 0);
          assert.equal(await next(tab).isDisabled(), true);

          // A free answer alone enables Continue, and the pager moves back with the answers kept.
          await tab.getByRole('textbox', { name: 'Something else' }).fill('Both, in a week');
          assert.equal(await next(tab).isDisabled(), false);
          await tab.getByRole('button', { name: 'Previous question' }).click();
          await expectQuestion(tab, 'How should the rollout be staged?', 1);
          assert.equal(await choices.getByRole('radio', { name: 'Region by region' }).isChecked(), true, 'the earlier choice stays');
          await tab.getByRole('button', { name: 'Next question' }).click();
          await expectQuestion(tab, 'Which notices should go out?', 2);
          assert.equal(await tab.getByRole('textbox', { name: 'Something else' }).inputValue(), 'Both, in a week', 'the free answer stays');

          // Skip moves on without an answer; the last question has no Next.
          await tab.getByRole('button', { name: 'Skip' }).click();
          await expectQuestion(tab, 'When should it start?', 3);
          assert.equal(await tab.getByRole('button', { name: 'Next question' }).isDisabled(), true);
          assert.equal(await next(tab).isDisabled(), true);
          await tab.getByText('Next Monday', { exact: true }).click();
          await next(tab).click();

          // Answering the last question replaces the card with a message that takes focus, and Start over begins again.
          const message = tab.getByText('All 3 questions answered. Nothing was sent.');
          await message.waitFor();
          assert.equal(await tab.evaluate(() => document.activeElement.textContent), 'All 3 questions answered. Nothing was sent.', 'focus moves to the message');
          await tab.getByRole('button', { name: 'Start over' }).click();
          await expectQuestion(tab, 'How should the rollout be staged?', 1);
          assert.equal(await choices.getByRole('radio', { name: 'Region by region' }).isChecked(), false, 'Start over clears the answers');
          assert.equal(await next(tab).isDisabled(), true);

          // Dismiss closes the card the same way, and nothing is ever submitted or navigated.
          await tab.getByRole('button', { name: 'Dismiss' }).click();
          await tab.getByText('Request dismissed. Nothing was sent.').waitFor();
          assert.equal(await tab.evaluate(() => document.activeElement.textContent), 'Request dismissed. Nothing was sent.');
          const { submits, sentinel } = await tab.evaluate(() => ({ submits: window.__submits, sentinel: window.__sentinel }));
          assert.deepEqual(submits, [], 'no submit event fires');
          assert.equal(sentinel, 'alive');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('moves focus to the new question after Continue, Skip, Start over, and a pager button that disables, and reports the true answered count', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        // Presses a button by keyboard, as a keyboard user does.
        const press = async (button) => {
          await button.focus();
          await tab.keyboard.press('Enter');
        };
        const focusedOn = (title) => pollUntil(tab, (expected) => document.activeElement === document.querySelector('h2') && document.activeElement.textContent === expected, title, {
          message: `focus is on the heading ${title}`,
          report: () => `${document.activeElement?.tagName} ${document.activeElement?.textContent}`,
        });
        try {
          await expectQuestion(tab, 'How should the rollout be staged?', 1);
          // Answer by keyboard, then Continue: the focused button disables on the next question, so focus must move.
          await tab.getByRole('radio', { name: 'In two waves' }).focus();
          await tab.keyboard.press('Space');
          await press(next(tab));
          await expectQuestion(tab, 'Which notices should go out?', 2);
          await focusedOn('Which notices should go out?');
          assert.equal(await stopOf(tab), 'heading Which notices should go out?');

          // Skip keeps its own place nowhere: focus moves to the new question here too.
          await press(tab.getByRole('button', { name: 'Skip' }));
          await expectQuestion(tab, 'When should it start?', 3);
          await focusedOn('When should it start?');

          // A pager button keeps focus while it stays enabled, and gives it to the question when it disables.
          await press(tab.getByRole('button', { name: 'Previous question' }));
          await expectQuestion(tab, 'Which notices should go out?', 2);
          assert.equal(await stopOf(tab), 'button Previous question', 'Previous keeps focus while it is enabled');
          await press(tab.getByRole('button', { name: 'Next question' }));
          await expectQuestion(tab, 'When should it start?', 3);
          await focusedOn('When should it start?');

          // Question two was skipped, so finishing reports two of three, not all three.
          await tab.getByRole('radio', { name: 'Today' }).focus();
          await tab.keyboard.press('Space');
          await press(next(tab));
          await tab.getByText('2 of 3 questions answered. Nothing was sent.').waitFor();
          assert.equal(await tab.evaluate(() => document.activeElement.textContent), '2 of 3 questions answered. Nothing was sent.', 'focus moves to the message');

          // Start over by keyboard returns focus to the first question.
          await press(tab.getByRole('button', { name: 'Start over' }));
          await expectQuestion(tab, 'How should the rollout be staged?', 1);
          await focusedOn('How should the rollout be staged?');

          // Skipping every question reports none answered.
          for (const title of ['Which notices should go out?', 'When should it start?']) {
            await press(tab.getByRole('button', { name: 'Skip' }));
            await focusedOn(title);
          }
          await press(tab.getByRole('button', { name: 'Skip' }));
          await tab.getByText('No questions answered. Nothing was sent.').waitFor();
          assert.equal(await tab.evaluate(() => document.activeElement.textContent), 'No questions answered. Nothing was sent.');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('walks every control in order in each question, in light and dark, each with a focus ring that differs from rest', async () => {
        for (const scheme of ['light', 'dark']) {
          assert.deepEqual(await walkFrom(browser, url, scheme, async () => {}), [
            'button Dismiss',
            'radio All at once',
            'textbox Something else',
            'button Next question',
            'button Skip',
          ], `${scheme}: Tab order on the first question`);
          assert.deepEqual(await walkFrom(browser, url, scheme, async (tab) => {
            await tab.getByText('All at once', { exact: true }).click();
            await next(tab).click();
          }), [
            'button Dismiss',
            'checkbox Email announcement',
            'checkbox In-app banner',
            'checkbox Release notes',
            'textbox Something else',
            'button Previous question',
            'button Next question',
            'button Skip',
          ], `${scheme}: Tab order on the second question`);
          assert.deepEqual(await walkFrom(browser, url, scheme, async (tab) => {
            await tab.getByText('All at once', { exact: true }).click();
            await next(tab).click();
            await tab.getByText('Release notes', { exact: true }).click();
            await next(tab).click();
            await tab.getByText('Today', { exact: true }).click();
          }), [
            'button Dismiss',
            'radio Today',
            'textbox Something else',
            'button Previous question',
            'button Skip',
            'button Continue',
          ], `${scheme}: Tab order on the last question with an answer`);
        }
      });

      await t.test('two instances share no ids', async () => {
        await assertUniqueIds(browser, url, 'approval request');
      });

      await t.test('never scrolls the page horizontally at 360, 390, 768, and 1280 in light and dark', async () => {
        await assertFits(browser, url, '.ask', 'approval request');
        for (const scheme of ['light', 'dark']) {
          const { context, tab } = await openBlock(browser, url, { width: 360, scheme });
          try {
            await tab.getByRole('textbox', { name: 'Something else' }).fill('x'.repeat(200));
            await tab.getByText('All at once', { exact: true }).click();
            await next(tab).click();
            await expectQuestion(tab, 'Which notices should go out?', 2);
            const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
            assert.ok(scrollWidth <= innerWidth, `${scheme} 360px: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
          } finally {
            await context.close();
          }
        }
      });
    } finally {
      await browser?.close();
      await close();
    }
  });
}

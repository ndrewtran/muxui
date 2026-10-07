import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { measureBox, measureFocusIndicator, measurePageFit, openBlock, pageWidths, patternVariant, startVariantServer } from './pattern-probes.mjs';
import { pollUntil } from './grid-list-probes.mjs';

// Cross-engine proof that the pricing plans block, loaded from its canonical
// catalog source through the public `@muxui/react` entry, switches every price
// with its billing toggle by keyboard and pointer, keeps one period selected,
// shows visible focus, marks the recommended plan, stacks it first below 44rem,
// and never overflows the page horizontally at the E-BL1-06 page widths
// (E-BL1-04). Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const variant = await patternVariant('pricing-plans', 'columns');

const monthly = { Starter: ['$0', 'No card needed'], Team: ['$20', 'Billed monthly'], Scale: ['$50', 'Billed monthly'] };
const annual = { Starter: ['$0', 'No card needed'], Team: ['$16', 'Billed yearly'], Scale: ['$40', 'Billed yearly'] };

// Each plan's name, price, and billing note as the page shows them.
const readPlans = (tab) => tab.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pricing-plan')].map((card) => [
  card.querySelector('h3').firstChild.textContent,
  [card.querySelector('.muxui-text--display-sm').textContent, card.querySelector('.muxui-card__header > p').textContent],
])));

for (const engine of browserEngines()) {
  test(`pricing plans keep their toggle, focus, layout, and overflow behavior in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);

      await t.test('switches every price with the billing toggle by keyboard and pointer and keeps one period selected', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          const group = tab.getByRole('radiogroup', { name: 'Billing period' });
          const monthlyOption = group.getByRole('radio', { name: 'Monthly' });
          const annualOption = group.getByRole('radio', { name: 'Annual' });
          const checked = () => tab.evaluate(() => [...document.querySelectorAll('.pricing-period [role="radio"][aria-checked="true"]')].map((node) => node.textContent));
          assert.deepEqual(await checked(), ['Monthly']);
          assert.deepEqual(await readPlans(tab), monthly);

          // Keyboard: focus Monthly, move to Annual, press it with Space, then back with Enter.
          await tab.locator('#before').focus();
          await tab.keyboard.press('Tab');
          await pollUntil(tab, () => document.activeElement?.getAttribute('role') === 'radio', undefined, { message: 'Tab reaches the billing toggle', report: () => document.activeElement?.outerHTML.slice(0, 120) });
          assert.equal(await tab.evaluate(measureFocusIndicator), true, 'the toggle paints a focus indicator');
          await tab.keyboard.press('ArrowRight');
          await pollUntil(tab, () => document.activeElement?.textContent === 'Annual', undefined, { message: 'ArrowRight moves focus to Annual', report: () => document.activeElement?.outerHTML.slice(0, 120) });
          await tab.keyboard.press('Space');
          await pollUntil(tab, () => document.querySelector('.pricing-plan--recommended .muxui-text--display-sm').textContent === '$16', undefined, { message: 'Space switches to annual prices', report: () => document.querySelector('.pricing-period').textContent });
          assert.deepEqual(await readPlans(tab), annual);
          assert.deepEqual(await checked(), ['Annual']);
          await tab.keyboard.press('ArrowLeft');
          await pollUntil(tab, () => document.activeElement?.textContent === 'Monthly', undefined, { message: 'ArrowLeft moves focus back to Monthly', report: () => document.activeElement?.outerHTML.slice(0, 120) });
          await tab.keyboard.press('Enter');
          await pollUntil(tab, () => document.querySelector('.pricing-plan--recommended .muxui-text--display-sm').textContent === '$20', undefined, { message: 'Enter switches back to monthly prices', report: () => document.querySelector('.pricing-period').textContent });
          assert.deepEqual(await readPlans(tab), monthly);

          // Pointer: Annual switches; pressing the selected option again leaves it selected.
          await annualOption.click();
          await pollUntil(tab, () => document.querySelector('.pricing-plan--recommended .muxui-text--display-sm').textContent === '$16', undefined, { message: 'a press switches to annual prices' });
          await annualOption.click();
          assert.deepEqual(await checked(), ['Annual'], 'one period always stays selected');
          assert.deepEqual(await readPlans(tab), annual);
          await monthlyOption.click();
          await pollUntil(tab, () => document.querySelector('.pricing-plan--recommended .muxui-text--display-sm').textContent === '$20', undefined, { message: 'a press switches back to monthly prices' });
          assert.deepEqual(await readPlans(tab), monthly);
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('marks the recommended plan with its text, a heavier rule, and the solid button', async () => {
        const { context, tab } = await openBlock(browser, url);
        try {
          const plans = await tab.evaluate(() => [...document.querySelectorAll('.pricing-plan')].map((card) => ({
            name: card.querySelector('h3').firstChild.textContent,
            flagged: card.textContent.includes('Recommended'),
            rule: parseFloat(getComputedStyle(card).borderTopWidth),
            variant: card.querySelector('button').getAttribute('data-variant'),
          })));
          assert.deepEqual(plans, [
            { name: 'Starter', flagged: false, rule: 1, variant: 'neutral' },
            { name: 'Team', flagged: true, rule: 2, variant: 'primary' },
            { name: 'Scale', flagged: false, rule: 1, variant: 'neutral' },
          ]);
          assert.equal(await tab.getByText('Recommended').count(), 1, 'the flag appears once');
        } finally {
          await context.close();
        }
      });

      await t.test('names each plan group by its heading, and the recommended flag is part of that heading', async () => {
        const { context, tab } = await openBlock(browser, url);
        try {
          for (const [name, flagged] of [['Starter', false], ['Team', true], ['Scale', false]]) {
            const heading = flagged ? `${name} Recommended` : name;
            const group = tab.getByRole('group', { name: heading, exact: true });
            assert.equal(await group.count(), 1, `${heading} names one plan group`);
            assert.equal(await group.getByRole('heading', { level: 3, name: heading, exact: true }).count(), 1, `${heading} is the group's h3`);
            assert.equal(await group.getByRole('button').count(), 1, `${name} holds its own action`);
            assert.equal(await group.getByText('Recommended').count(), flagged ? 1 : 0, `${name} flag`);
          }
          // Heading navigation reaches the flag: the only heading that includes it is the Team plan's.
          const headings = await tab.getByRole('heading', { level: 3 }).evaluateAll((nodes) => nodes.map((node) => node.textContent));
          assert.deepEqual(headings, ['Starter', 'Team Recommended', 'Scale']);
        } finally {
          await context.close();
        }
      });

      await t.test('walks the plan actions in source order with visible focus', async () => {
        for (const width of [1280, 360]) {
          const { context, tab } = await openBlock(browser, url, { width });
          try {
            await tab.locator('#before').focus();
            // The toggle is one tab stop: the selected option, with arrow keys inside the group.
            await tab.keyboard.press('Tab');
            await pollUntil(tab, () => document.activeElement?.getAttribute('role') === 'radio', undefined, { message: `${width}px: Tab reaches the toggle`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
            for (const name of ['Start free', 'Choose Team', 'Choose Scale']) {
              await tab.keyboard.press('Tab');
              await pollUntil(tab, (label) => document.activeElement?.textContent === label, name, { message: `${width}px: Tab reaches ${name}`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
              assert.equal(await tab.evaluate(measureFocusIndicator), true, `${width}px: ${name} paints a focus indicator`);
            }
          } finally {
            await context.close();
          }
        }
      });

      await t.test('stacks the recommended plan first below 44rem and shows three columns from 44rem', async () => {
        for (const width of [360, 703, 704, 768, 1280]) {
          const { context, tab } = await openBlock(browser, url, { width });
          try {
            const boxes = await tab.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pricing-plan')].map((card) => {
              const { left, top, right, bottom } = card.getBoundingClientRect();
              return [card.querySelector('h3').firstChild.textContent, { left, top, right, bottom }];
            })));
            if (width < 704) {
              assert.ok(boxes.Team.bottom <= boxes.Starter.top + 1, `${width}px: the recommended plan leads the stack`);
              assert.ok(boxes.Starter.bottom <= boxes.Scale.top + 1, `${width}px: Starter precedes Scale`);
            } else {
              assert.ok(boxes.Starter.right <= boxes.Team.left + 1 && boxes.Team.right <= boxes.Scale.left + 1, `${width}px: the plans sit side by side in source order`);
              assert.ok(Math.abs(boxes.Starter.top - boxes.Scale.top) < 1, `${width}px: the columns share a row`);
            }
          } finally {
            await context.close();
          }
        }
      });

      await t.test('never scrolls the page horizontally at 360, 768, and 1280 in light and dark', async () => {
        for (const scheme of ['light', 'dark']) {
          for (const width of pageWidths) {
            const { context, tab, errors } = await openBlock(browser, url, { width, scheme });
            try {
              const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
              assert.ok(scrollWidth <= innerWidth, `${scheme} ${width}px: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
              const section = await tab.evaluate(measureBox, '.pricing');
              assert.ok(section.left >= 0 && section.right <= innerWidth, `${scheme} ${width}px: the section stays inside the viewport`);
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

import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { assertFits, assertUniqueIds, measurePageFit, openBlock, patternVariant, ringWalk, startVariantServer, stopOf, tabWalk } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that both recommendation variants, loaded from their canonical
// catalog sources through the public `@muxui/react` entry, keep their local behavior:
// Compact reveals its alternatives from a button that reports aria-expanded and ends
// disabled with a check when accepted, and Ranked follows its confidence meter to the
// selected option and locks the choice when accepted. Each is driven by keyboard and
// pointer, announces the accepted state, places nothing, shows visible focus in light
// and dark, and never overflows the page horizontally down to 360 and 390 (E-BL1-04).
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const compact = await patternVariant('recommendation', 'compact');
const ranked = await patternVariant('recommendation', 'ranked');

const meter = (tab) => tab.getByRole('meter', { name: 'Confidence' });
const meterText = (tab) => meter(tab).getAttribute('aria-valuetext');
const accept = (tab) => tab.getByRole('button', { name: /^Accept/u });

async function compactTests(t, browser, url) {
  await t.test('compact: reveals the alternatives, then accepts and ends disabled with a check', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      const toggle = tab.getByRole('button', { name: 'Alternatives' });
      await toggle.waitFor();
      assert.equal(await tab.getByRole('region').getAttribute('aria-labelledby') !== null, true, 'the section is named by its question');
      assert.equal(await tab.getByRole('heading', { level: 2 }).textContent(), 'Want me to book the team offsite?');
      assert.equal(await meterText(tab), '86%');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await tab.getByRole('list', { name: 'Alternatives' }).count(), 0, 'the alternatives start hidden');

      // The button reveals and hides the list it controls, by pointer and by keyboard.
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      const list = tab.getByRole('list', { name: 'Alternatives' });
      assert.equal(await list.getAttribute('id'), await toggle.getAttribute('aria-controls'));
      assert.deepEqual(await list.getByRole('listitem').allTextContents(), ['Switch to the harbor loft54%', 'Wait for more RSVPs21%']);
      await toggle.press('Enter');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      await list.waitFor({ state: 'detached' });

      // Accept ends disabled with a check, announces it, and places nothing.
      await accept(tab).click();
      const done = tab.getByRole('button', { name: 'Accepted' });
      await done.waitFor();
      assert.equal(await done.isDisabled(), true);
      await pollUntil(tab, () => document.querySelector('[role="status"]').textContent === 'Accepted. Nothing was booked.', undefined, { message: 'the status announces the accepted state', report: () => document.querySelector('[role="status"]').textContent });
      assert.equal(await tab.evaluate(() => window.__sentinel), 'alive');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('compact: accepting by keyboard moves focus to the heading, which the status then reports on', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      await accept(tab).focus();
      await tab.keyboard.press('Enter');
      await tab.getByRole('button', { name: 'Accepted' }).waitFor();
      assert.equal(await stopOf(tab), 'heading Want me to book the team offsite?', 'focus is on the heading, not lost to the page');
      await pollUntil(tab, () => document.querySelector('[role="status"]').textContent === 'Accepted. Nothing was booked.', undefined, { message: 'the status announces the accepted state', report: () => document.querySelector('[role="status"]').textContent });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('compact: walks every control in order in light and dark', async () => {
    for (const scheme of ['light', 'dark']) {
      const { context, tab } = await openBlock(browser, url, { scheme });
      try {
        assert.deepEqual(await tabWalk(tab, ringWalk(tab), `compact ${scheme}`), ['button Alternatives', 'button Accept'], `${scheme}: Tab visits the controls in this order`);
      } finally {
        await context.close();
      }
    }
  });

  await t.test('compact: two instances share no ids, with the alternatives open', async () => {
    await assertUniqueIds(browser, url, 'compact', async (tab) => {
      const toggles = tab.getByRole('button', { name: 'Alternatives' });
      for (let index = 0; index < await toggles.count(); index += 1) await toggles.nth(index).click();
    });
  });

  await t.test('compact: never scrolls the page horizontally, with the alternatives open or accepted', async () => {
    await assertFits(browser, url, '.reco', 'compact');
    for (const scheme of ['light', 'dark']) {
      const { context, tab } = await openBlock(browser, url, { width: 360, scheme });
      try {
        await tab.getByRole('button', { name: 'Alternatives' }).click();
        await accept(tab).click();
        await tab.getByRole('button', { name: 'Accepted' }).waitFor();
        const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
        assert.ok(scrollWidth <= innerWidth, `${scheme} 360px accepted: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
      } finally {
        await context.close();
      }
    }
  });
}

async function rankedTests(t, browser, url) {
  await t.test('ranked: follows the meter to the selected option, then accepts and locks the choice', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      const group = tab.getByRole('radiogroup', { name: 'Options, best match first' });
      const option = (name) => group.getByRole('radio', { name: new RegExp(name, 'u') });
      await group.waitFor();
      assert.equal(await group.getByRole('radio').count(), 3);
      assert.equal(await option('Hold the lakeside lodge').isChecked(), true);
      assert.equal(await meterText(tab), '86%');

      // A pointer press and the arrow keys both move the selection, and the meter follows it.
      await tab.getByText('Switch to the harbor loft').click();
      await pollUntil(tab, () => document.querySelector('[role="meter"]').getAttribute('aria-valuetext') === '54%', undefined, { message: 'the meter follows the pointer choice', report: () => document.querySelector('[role="meter"]').getAttribute('aria-valuetext') });
      await option('Switch to the harbor loft').focus();
      await tab.keyboard.press('ArrowDown');
      await pollUntil(tab, () => document.querySelector('[role="meter"]').getAttribute('aria-valuetext') === '21%', undefined, { message: 'the meter follows the arrow key', report: () => document.querySelector('[role="meter"]').getAttribute('aria-valuetext') });
      assert.equal(await option('Wait for more RSVPs').isChecked(), true);
      await tab.keyboard.press('ArrowUp');
      assert.equal(await option('Switch to the harbor loft').isChecked(), true);

      // Accept locks the choice and announces the option it accepted.
      await accept(tab).click();
      await tab.getByRole('button', { name: 'Accepted' }).waitFor();
      assert.equal(await tab.getByRole('button', { name: 'Accepted' }).isDisabled(), true);
      assert.equal(await option('Hold the lakeside lodge').isDisabled(), true);
      assert.equal(await option('Switch to the harbor loft').isChecked(), true);
      await pollUntil(tab, () => document.querySelector('[role="status"]').textContent === 'Accepted Switch to the harbor loft. Nothing was booked.', undefined, { message: 'the status names the accepted option', report: () => document.querySelector('[role="status"]').textContent });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('ranked: accepting by keyboard moves focus to the heading and locks the choice', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      await tab.getByRole('radio', { name: /Hold the lakeside lodge/u }).focus();
      await tab.keyboard.press('ArrowDown');
      await accept(tab).focus();
      await tab.keyboard.press('Enter');
      await tab.getByRole('button', { name: 'Accepted' }).waitFor();
      assert.equal(await stopOf(tab), 'heading Want me to book the team offsite?', 'focus is on the heading, not lost to the page');
      await pollUntil(tab, () => document.querySelector('[role="status"]').textContent === 'Accepted Switch to the harbor loft. Nothing was booked.', undefined, { message: 'the status names the accepted option', report: () => document.querySelector('[role="status"]').textContent });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('ranked: walks every control in order in light and dark', async () => {
    for (const scheme of ['light', 'dark']) {
      const { context, tab } = await openBlock(browser, url, { scheme });
      try {
        assert.deepEqual(await tabWalk(tab, ringWalk(tab), `ranked ${scheme}`), ['radio Hold the lakeside lodge Recommended 86%', 'button Accept'], `${scheme}: Tab visits the controls in this order`);
      } finally {
        await context.close();
      }
    }
  });

  await t.test('ranked: two instances share no ids', async () => {
    await assertUniqueIds(browser, url, 'ranked');
  });

  await t.test('ranked: never scrolls the page horizontally', async () => {
    await assertFits(browser, url, '.ranked', 'ranked');
  });
}

// The capture counts one top-level test per engine for each block, so both variants run as subtests of one.
for (const engine of browserEngines()) {
  test(`recommendation keeps its compact and ranked behavior in ${engine}`, { timeout: 600_000 }, async (t) => {
    const compactServer = await startVariantServer(compact);
    const rankedServer = await startVariantServer(ranked);
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${compactServer.url}/block.html`, '#root > *');
      await warmUpServer(browser, `${rankedServer.url}/block.html`, '#root > *');
      await compactTests(t, browser, compactServer.url);
      await rankedTests(t, browser, rankedServer.url);
    } finally {
      await browser?.close();
      await compactServer.close();
      await rankedServer.close();
    }
  });
}

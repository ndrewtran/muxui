import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { assertFits, measureBox, openBlock, patternVariant, ringWalk, startVariantServer, stopOf, tabWalk } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that the two quick find variants, loaded from their canonical
// catalog sources through the public `@muxui/react` entry, keep their local behavior:
// Overlay opens its palette from a trigger, filters, chooses by keyboard and pointer,
// closes on Escape, and returns focus to the trigger; Inline filters a list in place
// and chooses by keyboard and pointer. Neither navigates or submits. Each shows visible
// focus in light and dark and never overflows the page horizontally down to 360 and
// 390 (E-BL1-04). Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const overlay = await patternVariant('quick-find', 'overlay');
const inline = await patternVariant('quick-find', 'inline');

const expectStatus = (tab, text) => pollUntil(tab, (expected) => document.querySelector('[role="status"]').textContent === expected, text, {
  message: `the status reads ${text}`,
  report: () => document.querySelector('[role="status"]').textContent,
});

/** Nothing navigated or submitted, and the page never reloaded. */
const assertInert = async (tab, errors) => {
  assert.equal(await tab.evaluate(() => window.__sentinel), 'alive', 'the page never reloaded');
  assert.deepEqual(await tab.evaluate(() => window.__submits), [], 'nothing submitted');
  assert.deepEqual(errors, []);
};

async function overlayTests(t, browser, url) {
  const open = async (tab) => {
    await tab.getByRole('button', { name: 'Quick find' }).click();
    await tab.getByRole('dialog', { name: 'Quick find' }).waitFor();
  };

  await t.test('overlay: opens from the trigger, filters, chooses by keyboard and pointer, and returns focus', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      const trigger = tab.getByRole('button', { name: 'Quick find' });
      const dialog = tab.getByRole('dialog', { name: 'Quick find' });
      assert.equal(await dialog.count(), 0, 'the palette starts closed');

      // Opening by keyboard lands in the Find field, with every command listed in its groups.
      await trigger.focus();
      await tab.keyboard.press('Enter');
      await dialog.waitFor();
      assert.equal(await stopOf(tab), 'textbox Find', 'focus lands in the field');
      assert.equal(await dialog.getByRole('option').count(), 5);
      assert.equal(await dialog.getByRole('group').count(), 2);

      // Typing filters, and a keyword matches too.
      await tab.keyboard.type('roadmap');
      await pollUntil(tab, () => document.querySelectorAll('[role="dialog"] [role="option"]').length === 1, undefined, { message: 'a keyword filters to one command' });
      await dialog.getByRole('option', { name: 'Open launch plan Plans' }).waitFor();
      await tab.getByRole('textbox', { name: 'Find' }).fill('zzz');
      await dialog.getByText('No results found').waitFor();
      await dialog.getByText('Adjust your search to try again').waitFor();
      assert.equal(await dialog.getByRole('option').count(), 0);
      await tab.getByRole('textbox', { name: 'Find' }).fill('export');

      // Arrow keys move the active command, Enter chooses it, the palette closes, and focus returns.
      await pollUntil(tab, () => document.querySelectorAll('[role="dialog"] [role="option"]').length === 1, undefined, { message: 'export filters to one command' });
      await tab.keyboard.press('ArrowDown');
      await tab.keyboard.press('Enter');
      await dialog.waitFor({ state: 'detached' });
      await expectStatus(tab, 'Chose Check export status');
      assert.equal(await stopOf(tab), 'button Quick find', 'focus returns to the trigger');

      // A pointer press chooses too, and the query starts empty each time.
      await trigger.click();
      await dialog.waitFor();
      assert.equal(await tab.getByRole('textbox', { name: 'Find' }).inputValue(), '');
      await dialog.getByRole('option', { name: 'Review open issues Support' }).click();
      await dialog.waitFor({ state: 'detached' });
      await expectStatus(tab, 'Chose Review open issues');

      // Escape closes without choosing, and Tab stays inside the palette.
      await open(tab);
      await tab.keyboard.press('Tab');
      assert.equal(await tab.evaluate(() => document.activeElement.closest('[role="dialog"]') !== null), true, 'Tab keeps focus inside the palette');
      await tab.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await expectStatus(tab, 'Chose Review open issues');
      assert.equal(await stopOf(tab), 'button Quick find');
      await assertInert(tab, errors);
    } finally {
      await context.close();
    }
  });

  await t.test('overlay: shows a focus ring on the trigger and the field in light and dark', async () => {
    for (const scheme of ['light', 'dark']) {
      const { context, tab } = await openBlock(browser, url, { scheme });
      try {
        const seen = await tabWalk(tab, ringWalk(tab), `overlay ${scheme}`);
        assert.deepEqual(seen, ['button Quick find'], `${scheme}: Tab reaches the trigger`);
        // Opened by keyboard, the field takes focus. The dialog keeps focus inside, so there is no unfocused read of the field:
        // its focus outline is compared with the resting colour the component draws it in (--muxui-field-border-color).
        await tab.locator('#before').focus();
        await tab.keyboard.press('Tab');
        await tab.keyboard.press('Enter');
        await tab.getByRole('dialog', { name: 'Quick find' }).waitFor();
        assert.equal(await stopOf(tab), 'textbox Find');
        await pollUntil(tab, () => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--muxui-field-border-color)';
          document.activeElement.parentElement.append(probe);
          const rest = getComputedStyle(probe).color;
          probe.remove();
          return getComputedStyle(document.activeElement).outlineColor !== rest;
        }, undefined, { message: `${scheme}: the focused field draws an outline that differs from its resting colour` });
      } finally {
        await context.close();
      }
    }
  });

  await t.test('overlay: never scrolls the page horizontally, and the open palette stays inside the viewport', async () => {
    await assertFits(browser, url, '.find', 'overlay');
    for (const scheme of ['light', 'dark']) {
      for (const width of [360, 390]) {
        const { context, tab, errors } = await openBlock(browser, url, { width, height: 700, scheme });
        try {
          await open(tab);
          await tab.getByRole('listbox').waitFor();
          await pollUntil(tab, () => document.querySelector('[role="dialog"]').getBoundingClientRect().width > 0, undefined, { message: 'the palette has a size' });
          const box = await tab.evaluate(measureBox, '[role="dialog"]');
          assert.ok(box.left >= 0 && box.right <= width, `${scheme} ${width}px: the open palette stays inside the viewport (${box.left}, ${box.right})`);
          assert.ok(await tab.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth), `${scheme} ${width}px: the open palette adds no horizontal scroll`);
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      }
    }
  });
}

async function inlineTests(t, browser, url) {
  await t.test('inline: filters in place, chooses by keyboard and pointer, and never submits', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      const field = tab.getByRole('searchbox', { name: 'Find' });
      const results = tab.getByRole('listbox', { name: 'Results' });
      await expectStatus(tab, '5 results');
      assert.equal(await results.getByRole('option').count(), 5);
      assert.equal(await results.getByRole('group').count(), 2);

      // Typing filters the list and the count follows.
      await field.fill('rel');
      await expectStatus(tab, '1 result');
      assert.equal(await results.getByRole('option').count(), 1);
      assert.equal(await results.getByRole('option').textContent(), 'Draft release notes');
      await field.fill('zzz');
      await expectStatus(tab, '0 results');
      await tab.getByText('No results found').waitFor();
      assert.equal(await results.count(), 0, 'the list gives way to the empty message');

      // Escape clears the field and restores every result.
      await field.press('Escape');
      await expectStatus(tab, '5 results');
      assert.equal(await field.inputValue(), '');

      // Tab moves into the list, arrows move between items, and Enter chooses.
      await field.focus();
      await tab.keyboard.press('Tab');
      assert.equal(await stopOf(tab), 'option Open launch plan');
      await tab.keyboard.press('ArrowDown');
      assert.equal(await stopOf(tab), 'option Review open issues');
      await tab.keyboard.press('Enter');
      await expectStatus(tab, 'Chose Review open issues');

      // A pointer press chooses, and typing again returns the status to a count.
      await results.getByRole('option', { name: 'Compare rollout options' }).click();
      await expectStatus(tab, 'Chose Compare rollout options');
      await field.fill('draft');
      await expectStatus(tab, '1 result');
      await assertInert(tab, errors);
    } finally {
      await context.close();
    }
  });

  await t.test('inline: walks the field and the list in light and dark, each with a focus ring that differs from rest', async () => {
    for (const scheme of ['light', 'dark']) {
      const { context, tab } = await openBlock(browser, url, { scheme });
      try {
        const seen = await tabWalk(tab, ringWalk(tab), `inline ${scheme}`);
        assert.deepEqual(seen, ['searchbox Find', 'option Open launch plan'], `${scheme}: Tab visits the field, then the list`);
      } finally {
        await context.close();
      }
    }
  });

  await t.test('inline: never scrolls the page horizontally, with results or the empty message', async () => {
    await assertFits(browser, url, '.find', 'inline');
    for (const scheme of ['light', 'dark']) {
      const { context, tab } = await openBlock(browser, url, { width: 360, scheme });
      try {
        await tab.getByRole('searchbox', { name: 'Find' }).fill('zzz');
        await tab.getByText('No results found').waitFor();
        assert.ok(await tab.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth), `${scheme}: the empty message adds no horizontal scroll`);
      } finally {
        await context.close();
      }
    }
  });
}

// The capture counts one top-level test per engine for each block, so the two variants run as subtests of one.
for (const engine of browserEngines()) {
  test(`quick find keeps its overlay and inline behavior in ${engine}`, { timeout: 600_000 }, async (t) => {
    const servers = [await startVariantServer(overlay), await startVariantServer(inline)];
    let browser;
    try {
      browser = await launchBrowser(engine);
      for (const { url } of servers) await warmUpServer(browser, `${url}/block.html`, '#root > *');
      await overlayTests(t, browser, servers[0].url);
      await inlineTests(t, browser, servers[1].url);
    } finally {
      await browser?.close();
      for (const server of servers) await server.close();
    }
  });
}

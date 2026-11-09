import assert from 'node:assert/strict';
import test from 'node:test';
import { MUXUI_THEME_PRESETS } from '../../generated/themes.mjs';
import { browserEngines, launchBrowser } from './harness.mjs';
import { assertUniqueIds, blockWidths, measureBox, measurePageFit, openBlock, patternVariant, ringWalk, startVariantServer, stopOf } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that the theme settings block, loaded from its canonical catalog
// source through the public `@muxui/react` and `@muxui/react/themes` entries, opens its
// popover from the Theme button, selects nothing on a page with no preset and the page's
// own preset on one that has it (applying nothing either way), applies a picked preset to the
// document root, rolls a preset each time Random is chosen and names it in the foot, restores
// the root's earlier theme when it unmounts, keeps its keyboard stops, and stays inside the
// viewport down to 360 (E-BL1-04). Runs in every engine named by MUXUI_BROWSER_ENGINES
// (see harness.mjs).

const variant = await patternVariant('theme-settings', 'popover');
// The preset the block picks when Math.random returns `value`.
const rolled = (value) => MUXUI_THEME_PRESETS[Math.floor(value * MUXUI_THEME_PRESETS.length)];

const appliedTheme = (tab) => tab.evaluate(() => document.documentElement.getAttribute('data-muxui-theme'));
const expectTheme = (tab, id) => pollUntil(tab, (expected) => document.documentElement.getAttribute('data-muxui-theme') === expected, id, {
  message: `the document root carries ${id}`,
  report: () => document.documentElement.getAttribute('data-muxui-theme'),
});
const trigger = (tab) => tab.getByRole('button', { name: 'Theme', exact: true });
const open = async (tab) => {
  await trigger(tab).click();
  const dialog = tab.getByRole('dialog', { name: 'Theme settings' });
  await dialog.waitFor();
  return dialog;
};
// A radio's input is visually hidden, so a pointer press lands on its label.
const option = (dialog, value) => dialog.locator(`label:has(input[value="${value}"])`);
const foot = (dialog) => dialog.getByRole('status');
// The theme radio values that are checked, in the popover.
const chosen = (dialog) => dialog.locator('.muxui-theme-picker input:checked').evaluateAll((inputs) => inputs.map((input) => input.value));
// The foot is one row: a label on the left, the theme's name on the right.
const NOTHING = ['Current theme', 'Page default'];
const expectFoot = async (dialog, label, name) => {
  assert.deepEqual(await foot(dialog).locator('span').allTextContents(), [label, name]);
};

for (const engine of browserEngines()) {
  test(`theme settings keep their popover, theme, Random roll, and unmount behavior in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/block.html`, '#root > *');

      await t.test('opens from the Theme button, selects nothing on a page with no preset, and applies a picked preset', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          assert.equal(await tab.getByRole('dialog').count(), 0, 'the popover starts closed');
          assert.equal(await appliedTheme(tab), null, 'the page keeps its own theme');

          const dialog = await open(tab);
          assert.equal(await dialog.getByRole('radiogroup', { name: 'Color mode' }).count(), 1);
          assert.equal(await dialog.getByRole('radiogroup', { name: 'Theme' }).count(), 1);
          assert.equal(await option(dialog, 'random').count(), 1, 'the theme grid offers Random');
          assert.deepEqual(await chosen(dialog), [], 'nothing is selected');
          await expectFoot(dialog, ...NOTHING);
          assert.equal(await appliedTheme(tab), null, 'opening applies nothing');

          // A pointer press on a preset applies it, marks it, and the foot names it.
          await option(dialog, 'monochrome-forest').click();
          await expectTheme(tab, 'monochrome-forest');
          assert.deepEqual(await chosen(dialog), ['monochrome-forest']);
          await expectFoot(dialog, 'Current theme', 'Forest');

          // The color mode picks the scheme on the same root, beside the theme.
          await dialog.getByRole('radio', { name: 'Dark' }).click();
          await pollUntil(tab, () => document.documentElement.getAttribute('data-muxui-color-scheme') === 'dark', undefined, { message: 'Dark sets the color scheme' });
          assert.equal(await appliedTheme(tab), 'monochrome-forest', 'a mode change keeps the theme');

          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('selects the preset the page already shows without applying anything, and ignores an unknown one', async () => {
        for (const [hostTheme, expected] of [['standard-lagoon', ['standard-lagoon']], ['no-such-theme', []]]) {
          const { context, tab, errors } = await openBlock(browser, url, { hostTheme });
          try {
            // From here on, nothing may write the attribute until a preset is picked: opening the popover is not a write.
            await tab.evaluate(() => {
              window.__writes = [];
              new MutationObserver((records) => records.forEach((record) => window.__writes.push(record.attributeName))).observe(document.documentElement, { attributes: true, attributeFilter: ['data-muxui-theme'] });
            });
            const dialog = await open(tab);
            await pollUntil(tab, (count) => document.querySelectorAll('.muxui-theme-picker input:checked').length === count, expected.length, { message: 'the theme grid shows the page theme' });
            assert.deepEqual(await chosen(dialog), expected);
            if (expected.length > 0) await expectFoot(dialog, 'Current theme', 'Lagoon');
            else await expectFoot(dialog, ...NOTHING);
            assert.equal(await appliedTheme(tab), hostTheme, 'the page keeps the theme it had');
            assert.deepEqual(await tab.evaluate(() => window.__writes), [], 'nothing wrote the theme before a pick');

            // Picking another preset applies it; the page's own theme comes back on unmount.
            await option(dialog, 'standard-fern').click();
            await expectTheme(tab, 'standard-fern');
            await tab.evaluate(() => window.__unmount());
            await tab.getByRole('dialog').waitFor({ state: 'detached' });
            assert.equal(await appliedTheme(tab), hostTheme);
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        }
      });

      await t.test('Random rolls a preset each time it is chosen, applies it, and the foot names it', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          const dialog = await open(tab);
          const roll = async (value) => {
            await tab.evaluate((next) => { Math.random = () => next; }, value);
            await option(dialog, 'random').click();
            const expected = rolled(value);
            await expectTheme(tab, expected.id);
            assert.equal(await dialog.locator('input[value="random"]').isChecked(), true, 'Random stays chosen');
            await expectFoot(dialog, 'Random theme', expected.name);
            return expected;
          };
          const first = await roll(0.99);
          assert.equal(first.id, 'monochrome-terracotta');

          // A preset ends the roll, and choosing Random again rolls again.
          await option(dialog, 'standard-lagoon').click();
          await expectTheme(tab, 'standard-lagoon');
          await expectFoot(dialog, 'Current theme', 'Lagoon');
          const second = await roll(0.5);
          assert.notEqual(second.id, first.id, 'the second roll is a different preset');

          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('leaves the host theme as it was after unmount', async () => {
        for (const hostTheme of [undefined, 'monochrome-antique']) {
          const { context, tab, errors } = await openBlock(browser, url, { hostTheme });
          try {
            assert.equal(await appliedTheme(tab), hostTheme ?? null, 'the block leaves the host theme alone until a theme is picked');
            const dialog = await open(tab);
            await option(dialog, 'standard-fern').click();
            await expectTheme(tab, 'standard-fern');
            await option(dialog, 'random').click();
            await pollUntil(tab, () => document.querySelector('.muxui-theme-picker input[value="random"]').checked, undefined, { message: 'Random is chosen' });

            await tab.evaluate(() => window.__unmount());
            await tab.getByRole('dialog').waitFor({ state: 'detached' });
            assert.equal(await appliedTheme(tab), hostTheme ?? null, hostTheme ? `unmount restores ${hostTheme}` : 'unmount removes the attribute the host never had');
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        }
      });

      await t.test('keeps its keyboard order, focus ring, Escape, and focus return', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tab.locator('#before').focus();
          const walk = ringWalk(tab);
          await tab.keyboard.press('Tab');
          assert.equal(await stopOf(tab), 'button Theme');
          await walk.land('button Theme');

          // Enter opens the popover and moves focus into it, so the button has left focus for the ring check.
          await tab.keyboard.press('Enter');
          const dialog = tab.getByRole('dialog', { name: 'Theme settings' });
          await dialog.waitFor();
          await pollUntil(tab, () => document.activeElement?.closest('[role="dialog"]') !== null, undefined, { message: 'focus moves into the popover' });
          await walk.finish();

          // Each picker is one tab stop, and focus stays inside the popover while it is open. Nothing is selected yet.
          const stops = [];
          for (let step = 0; step < 3; step += 1) {
            await tab.keyboard.press('Tab');
            stops.push(await stopOf(tab));
          }
          assert.match(stops[0], /^radio (?:Light|Dark|System)$/u, 'the color mode is the first stop');
          assert.equal(stops[1], 'radio Random', 'with nothing selected the first theme option is the second stop');
          assert.equal(stops[2], stops[0], 'the theme grid is one stop, and focus wraps back instead of leaving the popover');

          await tab.keyboard.press('Escape');
          await dialog.waitFor({ state: 'detached' });
          await pollUntil(tab, () => document.activeElement?.getAttribute('aria-label') === 'Theme', undefined, { message: 'focus returns to the Theme button' });
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('keeps the open popover inside the viewport and the page unscrolled at every block width', async () => {
        for (const width of blockWidths) {
          const { context, tab, errors } = await openBlock(browser, url, { width, height: 700 });
          try {
            await open(tab);
            const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
            assert.ok(scrollWidth <= innerWidth, `${width}px: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
            const popover = await tab.evaluate(measureBox, '.muxui-popover');
            assert.ok(popover.left >= 0 && popover.right <= innerWidth, `${width}px: the popover stays inside the viewport`);
            // The panel is taller than a short viewport, so the popover scrolls instead of running off the page.
            assert.ok(popover.bottom <= 700, `${width}px: the popover stays above the viewport's bottom edge`);
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        }
      });

      await t.test('two instances share no id', async () => {
        await assertUniqueIds(browser, url, 'theme settings', async (tab) => {
          await trigger(tab).first().click();
          await tab.getByRole('dialog', { name: 'Theme settings' }).waitFor();
        });
      });
    } finally {
      await browser?.close();
      await close();
    }
  });
}

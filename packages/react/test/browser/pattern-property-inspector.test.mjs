import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { assertFits, assertUniqueIds, openBlock, patternVariant, ringWalk, startVariantServer, stopOf, tabWalk } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that the property inspector block, loaded from its canonical
// catalog source through the public `@muxui/react` entry, edits placeholder properties
// with local state: any edit, or Adjust, marks the panel Edited and turns Adjust into
// Reset in the same button, Reset restores the first values, and the layout group, the
// number fields, and the type select each work by keyboard and pointer. It shows visible
// focus in light and dark, and never overflows the page horizontally down to 360 and
// 390 (E-BL1-04). Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const variant = await patternVariant('property-inspector', 'adjust-panel');

const edited = (tab) => tab.getByRole('status');
const field = (tab, name) => tab.getByRole('textbox', { name, exact: true });
// The number fields sit in this order, and each input is named through aria-labelledby.
const fieldOrder = ['Width', 'Height', 'Radius', 'Opacity'];
const expectValue = (tab, name, value) => pollUntil(tab, ([index, expected]) => document.querySelectorAll('input')[index]?.value === expected, [fieldOrder.indexOf(name), value], {
  message: `${name} reads ${value}`,
  report: () => [...document.querySelectorAll('input')].map((input) => input.value),
});

for (const engine of browserEngines()) {
  test(`property inspector keeps its editing, reset, focus, and layout behavior in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/block.html`, '#root > *');

      await t.test('marks edits, turns Adjust into Reset in the same button, and restores the first values', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          const region = tab.getByRole('region', { name: 'Promo banner' });
          await region.waitFor();
          assert.equal(await edited(tab).count(), 0, 'the panel starts unedited');

          // Adjust marks the panel edited, and focus stays on the same button, now named Reset.
          const adjust = tab.getByRole('button', { name: 'Adjust' });
          await adjust.focus();
          await tab.keyboard.press('Enter');
          await tab.getByText('Edited', { exact: true }).waitFor();
          assert.equal(await tab.evaluate(() => document.activeElement.textContent), 'Reset', 'focus stays on the button');
          await tab.getByRole('button', { name: 'Reset' }).click();
          assert.equal(await edited(tab).count(), 0, 'Reset clears the status');
          assert.equal(await tab.getByRole('button', { name: 'Adjust' }).count(), 1);

          // The layout group is one radio group: arrow keys move focus, Space chooses, and one option always stays selected.
          const layout = tab.getByRole('radiogroup', { name: 'Layout' });
          await layout.getByRole('radio', { name: 'Row' }).focus();
          await tab.keyboard.press('ArrowRight');
          assert.equal(await stopOf(tab), 'radio Column', 'an arrow key moves focus to the next option');
          assert.equal(await layout.getByRole('radio', { name: 'Row' }).isChecked(), true, 'moving focus does not choose');
          await tab.keyboard.press('Space');
          assert.equal(await layout.getByRole('radio', { name: 'Column' }).isChecked(), true);
          await tab.getByText('Edited', { exact: true }).waitFor();
          await layout.getByRole('radio', { name: 'Grid' }).click();
          assert.equal(await layout.getByRole('radio', { name: 'Grid' }).isChecked(), true);
          assert.equal(await layout.getByRole('radio', { checked: true }).count(), 1);
          await layout.getByRole('radio', { name: 'Grid' }).click();
          assert.equal(await layout.getByRole('radio', { checked: true }).count(), 1, 'pressing the selected option keeps it selected');

          // Number fields: typing, the arrow keys, and the stepper buttons change a value, and the minimum and maximum hold.
          await field(tab, 'Width').fill('500');
          await field(tab, 'Width').press('Enter');
          await expectValue(tab, 'Width', '500');
          await field(tab, 'Width').press('ArrowUp');
          await expectValue(tab, 'Width', '501');
          await tab.getByRole('button', { name: 'Decrease Height' }).click();
          await expectValue(tab, 'Height', '119');
          await field(tab, 'Radius').fill('0');
          await field(tab, 'Radius').press('Enter');
          await expectValue(tab, 'Radius', '0');
          assert.equal(await tab.getByRole('button', { name: 'Decrease Radius' }).isDisabled(), true, 'sizes stop at 0');
          assert.equal(await tab.getByRole('button', { name: 'Increase Opacity' }).isDisabled(), true, 'opacity stops at 100%');
          await tab.getByRole('button', { name: 'Decrease Opacity' }).click();
          await expectValue(tab, 'Opacity', '95%');
          assert.equal(await tab.getByRole('button', { name: 'Increase Opacity' }).isDisabled(), false);

          // The type select starts empty and chooses by keyboard and pointer.
          const type = tab.getByRole('button', { name: /Type$/u });
          assert.match(await type.textContent(), /Select type/u);
          await type.focus();
          await tab.keyboard.press('Enter');
          await tab.getByRole('listbox').waitFor();
          await tab.keyboard.press('ArrowDown');
          await tab.keyboard.press('Enter');
          await tab.getByRole('listbox').waitFor({ state: 'detached' });
          assert.match(await type.textContent(), /Standard|Compact/u, 'the keyboard chooses an option');
          await type.click();
          await tab.getByRole('option', { name: 'Wide' }).click();
          await tab.getByRole('listbox').waitFor({ state: 'detached' });
          assert.match(await type.textContent(), /Wide/u, 'a pointer press chooses an option');

          // Reset restores every first value.
          await tab.getByRole('button', { name: 'Reset' }).click();
          await expectValue(tab, 'Width', '480');
          await expectValue(tab, 'Height', '120');
          await expectValue(tab, 'Radius', '16');
          await expectValue(tab, 'Opacity', '100%');
          assert.equal(await layout.getByRole('radio', { name: 'Row' }).isChecked(), true);
          assert.match(await tab.getByRole('button', { name: /Type$/u }).textContent(), /Select type/u);
          assert.equal(await edited(tab).count(), 0);
          assert.equal(await tab.evaluate(() => window.__sentinel), 'alive');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('walks every control in order, unedited and edited, in light and dark, each with a focus ring that differs from rest', async () => {
        for (const scheme of ['light', 'dark']) {
          for (const [label, prepare, first] of [
            ['unedited', async () => {}, 'button Adjust'],
            ['edited', (tab) => tab.getByRole('button', { name: 'Adjust' }).click(), 'button Reset'],
          ]) {
            const { context, tab } = await openBlock(browser, url, { scheme });
            try {
              await prepare(tab);
              const seen = await tabWalk(tab, ringWalk(tab), `${label} ${scheme}`);
              assert.deepEqual(seen, [
                first,
                'radio Row',
                'textbox Width',
                'textbox Height',
                'textbox Radius',
                'textbox Opacity',
                'button Select type Type',
              ], `${scheme} ${label}: Tab visits the controls in this order, by accessible name`);
            } finally {
              await context.close();
            }
          }
        }
      });

      await t.test('two instances share no ids', async () => {
        await assertUniqueIds(browser, url, 'property inspector');
      });

      await t.test('never scrolls the page horizontally at 360, 390, 768, and 1280 in light and dark', async () => {
        await assertFits(browser, url, '.inspector', 'property inspector');
      });
    } finally {
      await browser?.close();
      await close();
    }
  });
}

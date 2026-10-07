import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { measureBox, measureFocusIndicator, measurePageFit, openBlock, pageWidths, patternVariant, startVariantServer } from './pattern-probes.mjs';
import { pollUntil } from './grid-list-probes.mjs';

// Cross-engine proof that the account settings block, loaded from its canonical
// catalog source through the public `@muxui/react` entry, edits its fields by
// keyboard and pointer, reports Unsaved changes, Saved, and No changes in its
// status region, restores the saved values on Cancel, never lets the browser
// submit, shows visible focus on every control, stacks its label column below
// 40rem, and never overflows the page horizontally (E-BL1-04). Runs in every
// engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const variant = await patternVariant('account-settings', 'sections');

const controls = ['Display name', 'Email', 'Language', 'Time zone', 'Product updates', 'Mentions', 'Weekly summary', 'Email digest', 'Cancel', 'Save'];

for (const engine of browserEngines()) {
  test(`account settings keep their editing, status, focus, and layout behavior in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);

      await t.test('edits fields by keyboard and pointer, reports the status, restores on Cancel, and never submits', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        const navigations = [];
        tab.on('framenavigated', (frame) => navigations.push(frame.url()));
        try {
          const status = tab.getByRole('status');
          const name = tab.getByRole('textbox', { name: 'Display name' });
          const trigger = (label) => tab.locator('.muxui-select', { has: tab.locator('.muxui-select-label', { hasText: label }) }).locator('.muxui-select-trigger');
          const weekly = tab.getByRole('switch', { name: 'Weekly summary' });
          const expectStatus = (text) => pollUntil(tab, (expected) => document.querySelector('[role="status"]').textContent === expected, text, {
            message: `the status reads ${text}`,
            report: () => document.querySelector('[role="status"]').textContent,
          });
          await tab.getByRole('form', { name: 'Settings' }).waitFor();
          await expectStatus('No changes');
          assert.equal(await name.inputValue(), 'Sample user');

          // Typing reports unsaved changes, and Cancel restores the field.
          await name.fill('Sample person');
          await expectStatus('Unsaved changes');
          await tab.getByRole('button', { name: 'Cancel' }).click();
          await expectStatus('No changes');
          assert.equal(await name.inputValue(), 'Sample user', 'Cancel restores the typed field');

          // Space on a focused switch toggles it.
          await weekly.focus();
          assert.equal(await weekly.isChecked(), false);
          await tab.keyboard.press('Space');
          await pollUntil(tab, () => document.querySelector('input[name="weekly"]').checked === true, undefined, { message: 'Space turns the switch on', report: () => document.querySelector('input[name="weekly"]').checked });
          await expectStatus('Unsaved changes');

          // A Select changes by keyboard (Enter opens, arrows move, Enter chooses) and by pointer.
          await trigger('Language').focus();
          await tab.keyboard.press('Enter');
          await tab.getByRole('listbox').waitFor();
          await tab.keyboard.press('ArrowDown');
          await tab.keyboard.press('Enter');
          await tab.getByRole('listbox').waitFor({ state: 'detached' });
          assert.equal(await trigger('Language').textContent(), 'French', 'keyboard chooses the next option');
          await trigger('Email digest').click();
          await tab.getByRole('option', { name: 'Monthly' }).click();
          await tab.getByRole('listbox').waitFor({ state: 'detached' });
          assert.equal(await trigger('Email digest').textContent(), 'Monthly', 'a pointer press chooses the option');

          // Save marks the edits saved, and Cancel then restores the saved values, not the initial ones.
          await tab.getByRole('button', { name: 'Save' }).click();
          await expectStatus('Saved');
          await tab.getByRole('textbox', { name: 'Email' }).fill('sample@example.org');
          await expectStatus('Unsaved changes');
          await tab.getByRole('button', { name: 'Cancel' }).click();
          await expectStatus('No changes');
          assert.equal(await tab.getByRole('textbox', { name: 'Email' }).inputValue(), 'sample@example.com');
          assert.equal(await weekly.isChecked(), true, 'the saved switch state stays');
          assert.equal(await trigger('Language').textContent(), 'French');
          assert.equal(await trigger('Email digest').textContent(), 'Monthly');

          // Enter in a text field runs the Save handler.
          await name.fill('Sample person');
          await expectStatus('Unsaved changes');
          await name.press('Enter');
          await expectStatus('Saved');

          // The browser never submits: every submit event was prevented, the page never navigated, and no request left it.
          const { submits, sentinel } = await tab.evaluate(() => ({ submits: window.__submits, sentinel: window.__sentinel }));
          assert.ok(submits.length >= 2, `the Save button and Enter both fire submit (${submits.length})`);
          assert.ok(submits.every(Boolean), 'every submit event is prevented');
          assert.equal(sentinel, 'alive', 'the document was never replaced');
          assert.equal(tab.url(), `${url}/block.html?scheme=light`, 'the URL never changes');
          assert.deepEqual(navigations, [], 'the page never navigates after load');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('walks every control in order with visible focus', async () => {
        const { context, tab } = await openBlock(browser, url);
        try {
          await tab.locator('#before').focus();
          const seen = [];
          for (const label of controls) {
            await tab.keyboard.press('Tab');
            await pollUntil(tab, (expected) => {
              const node = document.activeElement;
              const named = node?.getAttribute('aria-labelledby')?.split(' ').map((id) => document.getElementById(id)?.textContent).join(' ') ?? '';
              const labelled = node?.closest('label')?.textContent ?? node?.labels?.[0]?.textContent ?? '';
              return [node?.textContent, named, labelled].some((text) => text?.includes(expected));
            }, label, { message: `Tab reaches ${label}`, report: () => document.activeElement?.outerHTML.slice(0, 160) });
            assert.equal(await tab.evaluate(measureFocusIndicator), true, `${label} paints a focus indicator`);
            seen.push(label);
          }
          assert.deepEqual(seen, controls);
          await tab.keyboard.press('Tab');
          await pollUntil(tab, () => document.activeElement?.id === 'after', undefined, { message: 'Tab leaves the form after Save', report: () => document.activeElement?.outerHTML.slice(0, 120) });
        } finally {
          await context.close();
        }
      });

      await t.test('stacks the label column and fields below 40rem and sits them side by side from 40rem', async () => {
        for (const width of [360, 639, 640, 768, 1280]) {
          const { context, tab } = await openBlock(browser, url, { width });
          try {
            const boxes = await tab.evaluate(() => {
              const section = document.querySelector('section');
              const rect = (node) => {
                const { left, top, right, bottom } = node.getBoundingClientRect();
                return { left, top, right, bottom };
              };
              return {
                label: rect(section.firstElementChild),
                fields: rect(section.querySelector('.settings-fields')),
                name: rect(section.querySelector('input[name="name"]')),
                email: rect(section.querySelector('input[name="email"]')),
                status: rect(document.querySelector('.settings-status')),
                cancel: rect([...document.querySelectorAll('.settings-action')][0]),
                save: rect([...document.querySelectorAll('.settings-action')][1]),
              };
            });
            if (width < 640) {
              assert.ok(boxes.fields.top >= boxes.label.bottom - 1, `${width}px: the fields sit below the label column`);
              assert.ok(Math.abs(boxes.fields.left - boxes.label.left) < 2, `${width}px: both share one column`);
              assert.ok(Math.abs(boxes.name.left - boxes.email.left) < 2 && boxes.email.top >= boxes.name.bottom, `${width}px: the fields are one column`);
              assert.ok(boxes.cancel.top >= boxes.status.bottom - 1, `${width}px: the buttons sit below the status`);
              assert.ok(Math.abs(boxes.cancel.top - boxes.save.top) < 1, `${width}px: Cancel and Save share a row`);
              assert.ok(boxes.save.right <= width && Math.abs(boxes.save.right - (width - 16)) < 40, `${width}px: the actions fill the bar width`);
            } else {
              assert.ok(boxes.fields.left >= boxes.label.right - 1, `${width}px: the fields sit beside the label column`);
              assert.ok(boxes.email.left >= boxes.name.right - 1 && Math.abs(boxes.email.top - boxes.name.top) < 1, `${width}px: the fields form two columns`);
              assert.ok(Math.abs(boxes.status.top - boxes.cancel.top) < boxes.cancel.bottom - boxes.cancel.top, `${width}px: the status and actions share a row`);
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
              const form = await tab.evaluate(measureBox, 'form');
              assert.ok(form.left >= 0 && form.right <= innerWidth, `${scheme} ${width}px: the form stays inside the viewport`);
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

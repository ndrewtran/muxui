import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { focusedStop, measureBox, measurePageFit, openBlock, pageWidths, patternVariant, ringWalk, startVariantServer } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that the company records block, loaded from its canonical
// catalog source through the public `@muxui/react` entry, searches, sorts, and
// selects its placeholder rows with local state, reports the visible selected
// count, opens the row menu by keyboard and pointer without selecting the row or
// changing anything else, shows an empty message, keeps a single Tab stop in the
// table with visible focus, and scrolls the table sideways inside its wrapper
// without ever overflowing the page (E-BL1-04). Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs).

const variant = await patternVariant('company-records', 'sortable');

const byName = ['Demo Partners', 'Example Holdings', 'Generic Supply', 'Placeholder Studio', 'Sample Company', 'Sample Logistics'];
const byContact = ['Sample Logistics', 'Example Holdings', 'Placeholder Studio', 'Demo Partners', 'Generic Supply', 'Sample Company'];
// Dormant, New, Developing, then Established; equal levels keep the source order.
const byRelationship = ['Example Holdings', 'Sample Logistics', 'Placeholder Studio', 'Generic Supply', 'Demo Partners', 'Sample Company'];

const rowNames = (tab) => tab.evaluate(() => [...document.querySelectorAll('.muxui-table-body [role="rowheader"]')].map((node) => node.textContent));
const selectedNames = (tab) => tab.evaluate(() => [...document.querySelectorAll('.muxui-table-row[aria-selected="true"] [role="rowheader"]')].map((node) => node.textContent));
const status = (tab) => tab.getByRole('status').textContent();
const header = (tab, name) => tab.getByRole('columnheader', { name });
const row = (tab, name) => tab.locator('.muxui-table-row', { has: tab.getByRole('rowheader', { name, exact: true }) });

const expectRows = (tab, expected, message) => pollUntil(tab, (names) => JSON.stringify([...document.querySelectorAll('.muxui-table-body [role="rowheader"]')].map((node) => node.textContent)) === JSON.stringify(names), expected, {
  message,
  report: () => [...document.querySelectorAll('.muxui-table-body [role="rowheader"]')].map((node) => node.textContent),
});
const expectSelected = (tab, expected, message) => pollUntil(tab, (names) => JSON.stringify([...document.querySelectorAll('.muxui-table-row[aria-selected="true"] [role="rowheader"]')].map((node) => node.textContent)) === JSON.stringify(names), expected, {
  message,
  report: () => [...document.querySelectorAll('.muxui-table-row[aria-selected="true"] [role="rowheader"]')].map((node) => node.textContent),
});
const expectStatus = (tab, text) => pollUntil(tab, (expected) => document.querySelector('[role="status"]').textContent === expected, text, {
  message: `the count reads ${text}`,
  report: () => document.querySelector('[role="status"]').textContent,
});
const expectFocus = (tab, label, message) => pollUntil(tab, (expected) => document.activeElement?.getAttribute('aria-label') === expected, label, {
  message,
  report: () => document.activeElement?.outerHTML.slice(0, 160),
});

// Tab from the first stop to the table. A table remembers the last cell focus reached, so a keyboard walk starts in a fresh page.
async function tabToTable(tab) {
  await tab.getByRole('grid', { name: 'Companies', exact: true }).waitFor();
  await tab.locator('#before').focus();
  for (let step = 0; step < 3; step += 1) await tab.keyboard.press('Tab');
  await pollUntil(tab, () => document.activeElement?.getAttribute('role') === 'row', undefined, { message: 'Tab reaches a table row', report: () => document.activeElement?.outerHTML.slice(0, 120) });
}

for (const engine of browserEngines()) {
  test(`company records keep their search, sort, selection, menu, focus, and overflow behavior in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/block.html`, '#root > *');

      await t.test('starts with two rows selected and highlighted, and a tag group and a menu in every row', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tab.getByRole('grid', { name: 'Companies', exact: true }).waitFor();
          assert.deepEqual(await rowNames(tab), byName);
          assert.deepEqual(await selectedNames(tab), ['Example Holdings', 'Placeholder Studio']);
          assert.equal(await status(tab), '2 selected');
          // Selected rows are highlighted by a background the other rows lack, so colour is not the only cue (aria-selected also marks them).
          const backgrounds = await tab.evaluate(() => Object.fromEntries([...document.querySelectorAll('.muxui-table-row')].map((node) => [node.querySelector('[role="rowheader"]').textContent, getComputedStyle(node).backgroundColor])));
          assert.notEqual(backgrounds['Example Holdings'], backgrounds['Demo Partners'], 'a selected row paints a background');
          assert.equal(backgrounds['Example Holdings'], backgrounds['Placeholder Studio']);
          assert.equal(backgrounds['Demo Partners'], backgrounds['Generic Supply']);
          // Every row holds its own named tag group and menu button; the table has no checkbox column.
          for (const name of byName) {
            assert.ok(await tab.getByRole('grid', { name: `Tags for ${name}`, exact: true }).count() === 1, `${name} has a tag group`);
            assert.ok(await tab.getByRole('button', { name: `Actions for ${name}`, exact: true }).count() === 1, `${name} has a menu button`);
          }
          assert.equal(await tab.locator('.muxui-table input[type="checkbox"], .muxui-table [role="checkbox"]').count(), 0, 'no checkbox column');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('sorts by last contact and relationship with the pointer and reports aria-sort', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tab.getByRole('grid', { name: 'Companies', exact: true }).waitFor();
          assert.equal(await header(tab, 'Name').getAttribute('aria-sort'), 'ascending', 'the table starts sorted by name');
          assert.equal(await header(tab, 'City').getAttribute('aria-sort'), null, 'City is not sortable');

          await header(tab, 'Last contact').click();
          await expectRows(tab, byContact, 'a click sorts by last contact, oldest first');
          assert.equal(await header(tab, 'Last contact').getAttribute('aria-sort'), 'ascending');
          assert.equal(await header(tab, 'Name').getAttribute('aria-sort'), 'none', 'the sorted-away column reports none');
          await header(tab, 'Last contact').click();
          await expectRows(tab, [...byContact].reverse(), 'a second click reverses the order');
          assert.equal(await header(tab, 'Last contact').getAttribute('aria-sort'), 'descending');
          await header(tab, 'Relationship').click();
          await expectRows(tab, byRelationship, 'a click sorts by relationship level, not alphabetically');

          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('sorts from the keyboard: Up reaches the headers, Enter and Space sort, and the selection stays', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tabToTable(tab);
          await tab.keyboard.press('ArrowUp');
          await tab.keyboard.press('ArrowUp');
          await pollUntil(tab, () => document.activeElement?.getAttribute('role') === 'columnheader', undefined, { message: 'ArrowUp reaches the column headers', report: () => document.activeElement?.outerHTML.slice(0, 120) });
          while ((await tab.evaluate(() => document.activeElement.textContent)) !== 'Name') await tab.keyboard.press('ArrowLeft');
          await tab.keyboard.press('Space');
          await expectRows(tab, [...byName].reverse(), 'Space on the Name header reverses the name order');
          assert.equal(await header(tab, 'Name').getAttribute('aria-sort'), 'descending');
          await tab.keyboard.press('Enter');
          await expectRows(tab, byName, 'Enter on the same header restores it');
          // Selection stays on its rows through a sort.
          assert.deepEqual((await selectedNames(tab)).sort(), ['Example Holdings', 'Placeholder Studio']);
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('searches by name, counts only visible selected rows, shows the empty message, and recovers', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          const search = tab.getByRole('searchbox', { name: 'Search companies' });
          const empty = tab.getByText('No companies match this search', { exact: true });
          await tab.getByRole('grid', { name: 'Companies', exact: true }).waitFor();
          assert.equal(await empty.count(), 0, 'no empty message while rows show');

          await search.fill('SAMPLE');
          await expectRows(tab, ['Sample Company', 'Sample Logistics'], 'search ignores case');
          await expectStatus(tab, '0 selected');
          assert.equal(await tab.getByRole('button', { name: 'Add to list' }).isDisabled(), true, 'the bulk action waits for a visible selected row');
          await search.fill('holdings');
          await expectRows(tab, ['Example Holdings'], 'search matches part of a name');
          await expectStatus(tab, '1 selected');
          assert.equal(await tab.getByRole('button', { name: 'Add to list' }).isDisabled(), false);

          await search.fill('no such company');
          await expectRows(tab, [], 'no row matches');
          await empty.waitFor();
          await expectStatus(tab, '0 selected');
          assert.equal(await tab.getByRole('grid', { name: 'Companies', exact: true }).count(), 1, 'the table and its headers stay');

          // Escape clears the field and the rows come back with the earlier selection.
          await search.press('Escape');
          await expectRows(tab, byName, 'clearing the search restores every row');
          await expectStatus(tab, '2 selected');
          assert.equal(await empty.count(), 0, 'the empty message leaves with the search');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('selects rows by pointer, and counts and enables the bulk action from the visible selection', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tab.getByRole('grid', { name: 'Companies', exact: true }).waitFor();
          await row(tab, 'Sample Company').getByRole('rowheader').click();
          await expectSelected(tab, ['Example Holdings', 'Placeholder Studio', 'Sample Company'], 'a click selects another row');
          await expectStatus(tab, '3 selected');
          await row(tab, 'Example Holdings').getByRole('rowheader').click();
          await expectSelected(tab, ['Placeholder Studio', 'Sample Company'], 'a click on a selected row clears it');
          await expectStatus(tab, '2 selected');
          await row(tab, 'Placeholder Studio').getByRole('rowheader').click();
          await row(tab, 'Sample Company').getByRole('rowheader').click();
          await expectStatus(tab, '0 selected');
          assert.equal(await tab.getByRole('button', { name: 'Add to list' }).isDisabled(), true, 'the bulk action waits for a selected row');
          await row(tab, 'Generic Supply').getByRole('rowheader').click();
          assert.equal(await tab.getByRole('button', { name: 'Add to list' }).isDisabled(), false);
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('selects rows from the keyboard, selects all, and clears the selection', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          // Tab lands on the first selected row, Up moves, Space toggles, and select all covers every row.
          await tabToTable(tab);
          await tab.keyboard.press('ArrowUp');
          await tab.keyboard.press('Space');
          await expectSelected(tab, ['Demo Partners', 'Example Holdings', 'Placeholder Studio'], 'Space selects the row focus moved to');
          await expectStatus(tab, '3 selected');
          await tab.keyboard.press('ControlOrMeta+a');
          await expectSelected(tab, byName, 'select all covers every visible row');
          await expectStatus(tab, '6 selected');
          // With every row selected, a search still counts only the rows it shows, and a click deselects one row.
          await tab.getByRole('searchbox', { name: 'Search companies' }).fill('sample');
          await expectStatus(tab, '2 selected');
          await tab.getByRole('searchbox', { name: 'Search companies' }).press('Escape');
          await expectStatus(tab, '6 selected');
          await row(tab, 'Demo Partners').getByRole('rowheader').click();
          await expectStatus(tab, '5 selected');
          // Escape clears the selection and the bulk action waits again.
          await tab.keyboard.press('Escape');
          await expectStatus(tab, '0 selected');
          assert.equal(await tab.getByRole('button', { name: 'Add to list' }).isDisabled(), true);
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('opens a row menu by pointer without selecting the row, and its items change nothing', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tab.getByRole('grid', { name: 'Companies', exact: true }).waitFor();
          const trigger = (name) => tab.getByRole('button', { name: `Actions for ${name}`, exact: true });
          const menu = tab.getByRole('menu', { name: 'Actions for Generic Supply', exact: true });
          await trigger('Generic Supply').click();
          await menu.waitFor();
          assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['Open', 'Add note', 'Archive']);
          assert.deepEqual(await selectedNames(tab), ['Example Holdings', 'Placeholder Studio'], 'opening a menu does not select its row');
          // An item closes the menu and changes neither the rows, the sort, nor the selection.
          await menu.getByRole('menuitem', { name: 'Archive' }).click();
          await menu.waitFor({ state: 'detached' });
          assert.deepEqual(await rowNames(tab), byName);
          assert.deepEqual(await selectedNames(tab), ['Example Holdings', 'Placeholder Studio']);
          assert.equal(await status(tab), '2 selected');
          await expectFocus(tab, 'Actions for Generic Supply', 'focus returns to the menu button');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('reaches a row menu with the arrow keys, opens it with Enter, and closes it with Escape', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tabToTable(tab);
          const visited = [];
          while (await tab.evaluate(() => document.activeElement.tagName !== 'BUTTON')) {
            await tab.keyboard.press('ArrowRight');
            visited.push(await tab.evaluate(() => document.activeElement.textContent.slice(0, 20)));
            assert.ok(visited.length < 12, 'ArrowRight reaches the menu button within the row');
          }
          assert.ok(visited.includes('Vendor'), 'the arrow keys pass through the row tags');
          await expectFocus(tab, 'Actions for Example Holdings', 'ArrowRight ends on the row menu button');
          // The button reached by arrow keys paints a focus ring that differs from its rest state, like a Tab stop does.
          const walk = ringWalk(tab);
          await walk.land('the arrow-reached row menu button');
          await tab.keyboard.press('Enter');
          await tab.getByRole('menu', { name: 'Actions for Example Holdings', exact: true }).waitFor();
          await pollUntil(tab, () => document.activeElement?.getAttribute('role') === 'menuitem', undefined, { message: 'the menu takes focus', report: () => document.activeElement?.outerHTML.slice(0, 120) });
          await tab.keyboard.press('ArrowDown');
          await pollUntil(tab, () => document.activeElement?.textContent === 'Add note', undefined, { message: 'ArrowDown moves to the next item', report: () => document.activeElement?.outerHTML.slice(0, 120) });
          await tab.keyboard.press('Escape');
          await tab.getByRole('menu').waitFor({ state: 'detached' });
          await expectFocus(tab, 'Actions for Example Holdings', 'Escape returns focus to the menu button');
          assert.deepEqual(await selectedNames(tab), ['Example Holdings', 'Placeholder Studio']);
          await tab.locator('#after').focus();
          await walk.finish();
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('keeps a visible outline on the arrow-reached row menu button in forced colors', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tab.emulateMedia({ forcedColors: 'active' });
          assert.equal(await tab.evaluate(() => matchMedia('(forced-colors: active)').matches), true, 'the page is in forced colors');
          await tabToTable(tab);
          for (let step = 0; step < 12 && (await tab.evaluate(() => document.activeElement.tagName)) !== 'BUTTON'; step += 1) await tab.keyboard.press('ArrowRight');
          await expectFocus(tab, 'Actions for Example Holdings', 'ArrowRight ends on the row menu button');
          const read = (selector) => tab.evaluate((css) => {
            const node = css === null ? document.activeElement : document.querySelector(css);
            const style = getComputedStyle(node);
            return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor, shadow: style.boxShadow };
          }, selector);
          const focused = await read(null);
          // The box-shadow ring is the paint forced colors drops, so the focus indicator has to be an outline.
          assert.notEqual(focused.style, 'none', 'the focused button keeps an outline');
          assert.ok(focused.width >= 2, `the outline is at least 2px wide (${focused.width}px)`);
          // Where the engine applies forced colors (it drops the shadow), the outline paints a system colour, not transparency.
          if (focused.shadow === 'none') assert.ok(!/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/u.test(focused.color), `the outline is not transparent (${focused.color})`);
          assert.equal((await read('.records-menu:not(:focus)')).style, 'none', 'a button at rest has no outline');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('keeps one Tab stop in the table, ordered after the toolbar, with a visible focus ring in light and dark', async () => {
        for (const scheme of ['light', 'dark']) {
          const { context, tab } = await openBlock(browser, url, { scheme });
          try {
            await tab.locator('#before').focus();
            const walk = ringWalk(tab);
            const seen = [];
            // The table is one stop (the first selected row); the cells, tags, and menus inside it are reached with arrow keys.
            for (let step = 0; step < 3; step += 1) {
              await tab.evaluate(() => { window.__previousFocus = document.activeElement; });
              await tab.keyboard.press('Tab');
              await pollUntil(tab, () => document.activeElement !== window.__previousFocus, undefined, { message: `${scheme}: Tab moves focus on step ${step + 1}`, report: () => document.activeElement?.outerHTML.slice(0, 160) });
              const stop = await focusedStop(tab);
              seen.push(stop);
              await walk.land(stop);
            }
            assert.deepEqual(seen, ['searchbox Search companies', 'button Add to list', 'row Example Holdings'], `${scheme}: Tab order`);
            await tab.keyboard.press('Tab');
            await pollUntil(tab, () => document.activeElement?.id === 'after', undefined, { message: `${scheme}: Tab leaves the table for the next control`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
            await walk.finish();
          } finally {
            await context.close();
          }
        }
      });

      await t.test('scrolls the table sideways inside its wrapper and never scrolls the page horizontally at 360, 768, and 1280 in light and dark', async () => {
        for (const scheme of ['light', 'dark']) {
          for (const width of pageWidths) {
            const { context, tab, errors } = await openBlock(browser, url, { width, scheme });
            try {
              const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
              assert.ok(scrollWidth <= innerWidth, `${scheme} ${width}px: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
              const section = await tab.evaluate(measureBox, '.records');
              assert.ok(section.left >= 0 && section.right <= innerWidth, `${scheme} ${width}px: the section stays inside the viewport`);
              const scroller = await tab.evaluate(() => {
                const node = document.querySelector('.records-scroll');
                return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
              });
              // The 44rem table needs the wrapper below about 46rem of page width, and fits it from 1280.
              if (width < 768) assert.ok(scroller.scrollWidth > scroller.clientWidth, `${scheme} ${width}px: the wrapper scrolls the table sideways`);
              if (width === 1280) assert.ok(scroller.scrollWidth <= scroller.clientWidth + 1, `${scheme} ${width}px: the table fits without scrolling`);
              // The toolbar stays inside the viewport at every width, with the search field no wider than 22rem.
              for (const selector of ['.records-bar', '.records-search']) {
                const box = await tab.evaluate(measureBox, selector);
                assert.ok(box.left >= 0 && box.right <= innerWidth, `${scheme} ${width}px: ${selector} stays inside the viewport`);
              }
              assert.ok((await tab.locator('.records-search').boundingBox()).width <= 22 * 16 + 1, `${scheme} ${width}px: the search field stops at 22rem`);
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

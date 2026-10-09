import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { measureBox, measurePageFit, openBlock, pageWidths, patternVariant, ringWalk, startVariantServer } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that both task filters variants, loaded from their canonical
// catalog sources through the public `@muxui/react` entry, narrow their placeholder
// rows with local state: the status buttons with their counts, and the filter bar
// with its search field, status select, removable filter tags, Clear filters
// action, result count, and empty message. Each is driven by keyboard and pointer,
// keeps focus on a control when its own control goes away, shows visible focus, and
// scrolls the table sideways inside its wrapper without overflowing the page
// (E-BL1-04). Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const statusButtons = await patternVariant('task-filters', 'status-buttons');
const filterBar = await patternVariant('task-filters', 'filter-bar');

const tasks = [
  ['Update the onboarding checklist', 'To do'],
  ['Review the draft outline', 'In progress'],
  ['Schedule the quarterly check-in', 'To do'],
  ['Archive last year files', 'Done'],
  ['Prepare the release notes', 'In progress'],
  ['Confirm the vendor list', 'Done'],
  ['Draft the planning agenda', 'To do'],
  ['Close the open questions', 'In progress'],
];
const named = (predicate) => tasks.filter(predicate).map(([name]) => name);

const rowNames = (tab) => tab.evaluate(() => [...document.querySelectorAll('.muxui-table-body [role="rowheader"]')].map((node) => node.textContent));
const rowStatuses = (tab) => tab.evaluate(() => [...document.querySelectorAll('.muxui-table-body .muxui-table-row')].map((node) => node.querySelectorAll('[role="gridcell"]')[1].textContent));
const expectRows = (tab, expected, message) => pollUntil(tab, (names) => JSON.stringify([...document.querySelectorAll('.muxui-table-body [role="rowheader"]')].map((node) => node.textContent)) === JSON.stringify(names), expected, {
  message,
  report: () => [...document.querySelectorAll('.muxui-table-body [role="rowheader"]')].map((node) => node.textContent),
});
const expectCount = (tab, text) => pollUntil(tab, (expected) => document.querySelector('[role="status"]').textContent === expected, text, {
  message: `the result count reads ${text}`,
  report: () => document.querySelector('[role="status"]').textContent,
});
// The role and accessible name of the focused element from the accessibility tree. A name with a colon is quoted
// as 'role "name"', which `focusedStop` does not read, so this reads both forms.
async function stopOf(tab) {
  const [first] = (await tab.locator(':focus').ariaSnapshot()).split('\n');
  const plain = /^- (\w+) "((?:[^"\\]|\\.)*)"/u.exec(first);
  const quoted = /^- '(\w+) "((?:[^']|'')*)"'/u.exec(first);
  const [, role, name] = plain ?? quoted ?? [];
  return `${role} ${name?.replaceAll("''", "'")}`;
}

/** Presses Tab from `#before` and records each stop until focus reaches `#after`; every stop lands in `walk`. */
async function tabWalk(tab, walk, label) {
  await tab.locator('#before').focus();
  const seen = [];
  for (let step = 0; step < 12; step += 1) {
    await tab.evaluate(() => { window.__previousFocus = document.activeElement; });
    await tab.keyboard.press('Tab');
    await pollUntil(tab, () => document.activeElement !== window.__previousFocus, undefined, { message: `${label}: Tab moves focus on step ${step + 1}`, report: () => document.activeElement?.outerHTML.slice(0, 160) });
    if (await tab.evaluate(() => document.activeElement.id === 'after')) {
      await walk.finish();
      return seen;
    }
    const stop = await stopOf(tab);
    seen.push(stop);
    await walk.land(stop);
  }
  assert.fail(`${label}: Tab never reached the control after the block`);
}

async function assertPageFit(browser, url, root, label) {
  for (const scheme of ['light', 'dark']) {
    for (const width of pageWidths) {
      const { context, tab, errors } = await openBlock(browser, url, { width, scheme });
      try {
        const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
        assert.ok(scrollWidth <= innerWidth, `${label} ${scheme} ${width}px: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
        const section = await tab.evaluate(measureBox, root);
        assert.ok(section.left >= 0 && section.right <= innerWidth, `${label} ${scheme} ${width}px: the section stays inside the viewport`);
        // Every control in the block stays inside the viewport at every width.
        const outside = await tab.evaluate(() => [...document.querySelectorAll('.tasks > :not(.tasks-scroll) *')].filter((node) => node.getBoundingClientRect().right > innerWidth + 1).map((node) => node.className));
        assert.deepEqual(outside, [], `${label} ${scheme} ${width}px: no control passes the viewport edge`);
        const scroller = await tab.evaluate(() => {
          const node = document.querySelector('.tasks-scroll');
          return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
        });
        // The 32rem table scrolls inside its wrapper below it and fits it from 768.
        if (width === 360) assert.ok(scroller.scrollWidth > scroller.clientWidth, `${label} ${scheme} ${width}px: the wrapper scrolls the table sideways`);
        if (width >= 768) assert.ok(scroller.scrollWidth <= scroller.clientWidth + 1, `${label} ${scheme} ${width}px: the table fits without scrolling`);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
  }
}

/** The status buttons variant's subtests, run against its served page. */
async function statusButtonsTests(t, browser, url) {
  const group = (tab) => tab.getByRole('radiogroup', { name: 'Filter by status', exact: true });

  await t.test('status buttons: filters the rows by status with counts that stay put, and one option always stays selected', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      const checked = () => group(tab).locator('[role="radio"][aria-checked="true"]').allTextContents();
      await group(tab).waitFor();
      assert.deepEqual(await group(tab).getByRole('radio').allTextContents(), ['All 8', 'To do 3', 'In progress 3', 'Done 2']);
      assert.deepEqual(await checked(), ['All 8']);
      assert.deepEqual(await rowNames(tab), tasks.map(([name]) => name));
      await expectCount(tab, '8 of 8 tasks');

      for (const [option, status, count] of [['To do 3', 'To do', 3], ['In progress 3', 'In progress', 3], ['Done 2', 'Done', 2]]) {
        await group(tab).getByRole('radio', { name: option, exact: true }).click();
        await expectRows(tab, named(([, taskStatus]) => taskStatus === status), `${status} shows only its tasks`);
        assert.deepEqual(await rowStatuses(tab), Array(count).fill(status));
        await expectCount(tab, `${count} of 8 tasks`);
        assert.deepEqual(await checked(), [option]);
        // The counts describe the whole list, so they do not move with the filter.
        assert.deepEqual(await group(tab).getByRole('radio').allTextContents(), ['All 8', 'To do 3', 'In progress 3', 'Done 2']);
      }
      // Pressing the selected option again leaves it selected; All restores every row.
      await group(tab).getByRole('radio', { name: 'Done 2', exact: true }).click();
      assert.deepEqual(await checked(), ['Done 2'], 'one option always stays selected');
      await group(tab).getByRole('radio', { name: 'All 8', exact: true }).click();
      await expectRows(tab, tasks.map(([name]) => name), 'All restores every row');
      await expectCount(tab, '8 of 8 tasks');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('status buttons: moves through the options with the arrow keys and selects with Space or Enter', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      await group(tab).waitFor();
      await tab.locator('#before').focus();
      await tab.keyboard.press('Tab');
      await pollUntil(tab, () => document.activeElement?.getAttribute('role') === 'radio', undefined, { message: 'Tab reaches the status buttons', report: () => document.activeElement?.outerHTML.slice(0, 120) });
      assert.equal(await stopOf(tab), 'radio All 8', 'Tab lands on the selected option');
      await tab.keyboard.press('ArrowRight');
      await pollUntil(tab, () => document.activeElement?.textContent === 'To do 3', undefined, { message: 'ArrowRight moves focus to To do', report: () => document.activeElement?.outerHTML.slice(0, 120) });
      await tab.keyboard.press('Space');
      await expectRows(tab, named(([, status]) => status === 'To do'), 'Space selects To do');
      await tab.keyboard.press('ArrowRight');
      await tab.keyboard.press('ArrowRight');
      await pollUntil(tab, () => document.activeElement?.textContent === 'Done 2', undefined, { message: 'two more ArrowRight presses reach Done', report: () => document.activeElement?.outerHTML.slice(0, 120) });
      await tab.keyboard.press('Enter');
      await expectRows(tab, named(([, status]) => status === 'Done'), 'Enter selects Done');
      await expectCount(tab, '2 of 8 tasks');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('status buttons: keeps the buttons one Tab stop ahead of the table, with a visible focus ring in light and dark', async () => {
    for (const scheme of ['light', 'dark']) {
      const { context, tab } = await openBlock(browser, url, { scheme });
      try {
        await group(tab).waitFor();
        const seen = await tabWalk(tab, ringWalk(tab), scheme);
        assert.deepEqual(seen, ['radio All 8', 'row Update the onboarding checklist'], `${scheme}: Tab order`);
      } finally {
        await context.close();
      }
    }
  });

  await t.test('status buttons: never scrolls the page horizontally at 360, 768, and 1280 in light and dark', () => assertPageFit(browser, url, '.tasks', 'status buttons'));
}

/** The filter bar variant's subtests, run against its served page. */
async function filterBarTests(t, browser, url) {
  const search = (tab) => tab.getByRole('searchbox', { name: 'Search tasks', exact: true });
  const trigger = (tab) => tab.locator('.tasks-status .muxui-select-trigger');
  const clearButton = (tab) => tab.getByRole('button', { name: 'Clear filters', exact: true });
  const tags = (tab) => tab.evaluate(() => [...document.querySelectorAll('.muxui-tag')].map((node) => node.textContent));
  const expectTags = (tab, expected, message) => pollUntil(tab, (labels) => JSON.stringify([...document.querySelectorAll('.muxui-tag')].map((node) => node.textContent)) === JSON.stringify(labels), expected, {
    message,
    report: () => [...document.querySelectorAll('.muxui-tag')].map((node) => node.textContent),
  });
  const expectTrigger = (tab, text) => pollUntil(tab, (expected) => document.querySelector('.tasks-status .muxui-select-trigger').textContent === expected, text, {
    message: `the status select reads ${text}`,
    report: () => document.querySelector('.tasks-status .muxui-select-trigger').textContent,
  });
  const expectFocusIn = (tab, selector, message) => pollUntil(tab, (css) => document.activeElement?.matches(css), selector, { message, report: () => document.activeElement?.outerHTML.slice(0, 160) });
  const choose = async (tab, option) => {
    await trigger(tab).click();
    await tab.getByRole('option', { name: option, exact: true }).click();
    await tab.getByRole('listbox').waitFor({ state: 'detached' });
  };

  await t.test('filter bar: starts unfiltered with Clear filters disabled, then narrows by text and by status together', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      await search(tab).waitFor();
      assert.deepEqual(await rowNames(tab), tasks.map(([name]) => name));
      await expectCount(tab, '8 of 8 tasks');
      await expectTrigger(tab, 'Any status');
      assert.equal(await clearButton(tab).isDisabled(), true, 'nothing to clear yet');
      assert.deepEqual(await tags(tab), []);

      await search(tab).fill('DRAFT');
      await expectRows(tab, ['Review the draft outline', 'Draft the planning agenda'], 'search ignores case and matches part of a task name');
      await expectCount(tab, '2 of 8 tasks');
      await expectTags(tab, ['Task: DRAFT'], 'the search becomes a tag');
      assert.equal(await clearButton(tab).isDisabled(), false);

      await choose(tab, 'In progress');
      await expectRows(tab, ['Review the draft outline'], 'the status narrows the text matches');
      await expectCount(tab, '1 of 8 tasks');
      await expectTags(tab, ['Task: DRAFT', 'Status: In progress'], 'both filters show as tags');
      assert.deepEqual(await rowStatuses(tab), ['In progress']);
      await expectTrigger(tab, 'In progress');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('filter bar: chooses a status from the select by keyboard and by pointer', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      await search(tab).waitFor();
      await trigger(tab).focus();
      await tab.keyboard.press('Enter');
      await tab.getByRole('listbox').waitFor();
      assert.deepEqual(await tab.getByRole('option').allTextContents(), ['Any status', 'To do', 'In progress', 'Done']);
      await tab.keyboard.press('ArrowDown');
      await tab.keyboard.press('Enter');
      await tab.getByRole('listbox').waitFor({ state: 'detached' });
      await expectTrigger(tab, 'To do');
      await expectRows(tab, named(([, status]) => status === 'To do'), 'a keyboard choice filters the rows');
      await choose(tab, 'Done');
      await expectRows(tab, named(([, status]) => status === 'Done'), 'a pointer choice filters the rows');
      await expectCount(tab, '2 of 8 tasks');
      await choose(tab, 'Any status');
      await expectRows(tab, tasks.map(([name]) => name), 'Any status shows every row again');
      await expectTags(tab, [], 'Any status leaves no tag');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('filter bar: shows the empty message when nothing matches, and recovers when a tag is removed', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      const empty = tab.getByText('No tasks match these filters', { exact: true });
      await search(tab).waitFor();
      assert.equal(await empty.count(), 0, 'no empty message while rows show');
      await search(tab).fill('quarterly');
      await choose(tab, 'Done');
      await expectRows(tab, [], 'no row is both quarterly and done');
      await empty.waitFor();
      await expectCount(tab, '0 of 8 tasks');
      assert.equal(await tab.getByRole('grid', { name: 'Tasks', exact: true }).count(), 1, 'the table and its headers stay');
      await tab.getByRole('button', { name: 'Remove Status: Done', exact: true }).click();
      await expectRows(tab, ['Schedule the quarterly check-in'], 'removing the status tag keeps the text filter');
      assert.equal(await empty.count(), 0, 'the empty message leaves with the filter');
      await expectTrigger(tab, 'Any status');
      await expectTags(tab, ['Task: quarterly'], 'the text tag stays');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('filter bar: removes each tag by its button and by Backspace, and Clear filters resets the select, text, and tags', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      await search(tab).waitFor();
      await search(tab).fill('the');
      await choose(tab, 'To do');
      await expectTags(tab, ['Task: the', 'Status: To do'], 'two tags');

      // Backspace on a focused tag removes it, and focus moves to the remaining tag.
      await tab.locator('.muxui-tag', { hasText: 'Task: the' }).focus();
      await tab.keyboard.press('Backspace');
      await expectTags(tab, ['Status: To do'], 'Backspace removes the focused tag');
      assert.equal(await search(tab).inputValue(), '', 'its text filter is cleared');
      await expectFocusIn(tab, '.muxui-tag', 'focus moves to the remaining tag');
      // Removing the last tag with its button hands focus to the search field, not to the page.
      await tab.getByRole('button', { name: 'Remove Status: To do', exact: true }).click();
      await expectTags(tab, [], 'the last tag is removed');
      await expectTrigger(tab, 'Any status');
      await expectFocusIn(tab, 'input[type="search"]', 'removing the last tag moves focus to the search field');
      await expectCount(tab, '8 of 8 tasks');

      // Clear filters empties everything at once and also leaves focus on the search field.
      await search(tab).fill('draft');
      await choose(tab, 'In progress');
      await expectTags(tab, ['Task: draft', 'Status: In progress'], 'two tags again');
      await clearButton(tab).click();
      await expectTags(tab, [], 'Clear filters removes every tag');
      assert.equal(await search(tab).inputValue(), '');
      await expectTrigger(tab, 'Any status');
      await expectRows(tab, tasks.map(([name]) => name), 'every row returns');
      assert.equal(await clearButton(tab).isDisabled(), true, 'Clear filters waits for a filter again');
      await expectFocusIn(tab, 'input[type="search"]', 'Clear filters leaves focus on the search field');

      // The search field's own clear button and Escape clear the text filter only.
      await search(tab).fill('open');
      await choose(tab, 'Done');
      await search(tab).press('Escape');
      await expectTags(tab, ['Status: Done'], 'Escape clears only the text');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('filter bar: keeps the controls in reading order, and the tags between Clear filters and the table, with visible focus', async () => {
    for (const scheme of ['light', 'dark']) {
      const unfiltered = await openBlock(browser, url, { scheme });
      try {
        await search(unfiltered.tab).waitFor();
        const seen = await tabWalk(unfiltered.tab, ringWalk(unfiltered.tab), `${scheme} unfiltered`);
        // Clear filters is disabled, so Tab skips it.
        assert.deepEqual(seen, ['searchbox Search tasks', 'button Any status Status', 'row Update the onboarding checklist'], `${scheme}: Tab order without filters`);
      } finally {
        await unfiltered.context.close();
      }
      const filtered = await openBlock(browser, url, { scheme });
      try {
        await search(filtered.tab).fill('the');
        await choose(filtered.tab, 'In progress');
        await expectTags(filtered.tab, ['Task: the', 'Status: In progress'], 'two tags');
        const seen = await tabWalk(filtered.tab, ringWalk(filtered.tab), `${scheme} filtered`);
        // The search field's clear button stays out of the Tab order, and a focused tag is followed by its remove button.
        assert.deepEqual(seen, [
          'searchbox Search tasks',
          'button In progress Status',
          'button Clear filters',
          'row Task: the',
          'button Remove Task: the',
          'row Review the draft outline',
        ], `${scheme}: Tab order with filters`);
      } finally {
        await filtered.context.close();
      }
    }
  });

  await t.test('filter bar: keeps a long unbroken query inside its tag at 360, with the remove button visible, named, and operable', async () => {
    const query = 'x'.repeat(200);
    for (const scheme of ['light', 'dark']) {
      const { context, tab, errors } = await openBlock(browser, url, { width: 360, scheme });
      try {
        await search(tab).fill(query);
        await expectTags(tab, [`Task: ${query}`], `${scheme}: the long query becomes one tag with its whole text`);
        const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
        assert.ok(scrollWidth <= innerWidth, `${scheme}: the page scrolls horizontally with a long tag (${scrollWidth} > ${innerWidth})`);
        const tag = await tab.locator('.muxui-tag').boundingBox();
        assert.ok(tag.x >= 0 && tag.x + tag.width <= innerWidth, `${scheme}: the tag stays inside the viewport (${tag.x} to ${tag.x + tag.width})`);
        // The text is cut with an ellipsis, so it is narrower than its full width, and its title and DOM text keep the whole value.
        const text = await tab.evaluate(() => {
          const node = document.querySelector('.tasks-tag-text');
          return { clipped: node.scrollWidth > node.clientWidth, title: node.title, content: node.textContent };
        });
        assert.equal(text.clipped, true, `${scheme}: the long text is clipped inside the tag`);
        assert.equal(text.title, query);
        assert.equal(text.content, `Task: ${query}`);
        // The remove button keeps its label, stays inside the tag and the viewport, and removes the filter.
        const remove = tab.getByRole('button', { name: `Remove Task: ${query}`, exact: true });
        await remove.waitFor();
        const button = await remove.boundingBox();
        assert.ok(button.x >= 0 && button.x + button.width <= innerWidth, `${scheme}: the remove button stays inside the viewport`);
        assert.ok(button.x + button.width <= tag.x + tag.width + 1, `${scheme}: the remove button stays inside its tag`);
        await remove.click();
        await expectTags(tab, [], `${scheme}: the remove button clears the long query`);
        assert.equal(await search(tab).inputValue(), '');
        await expectFocusIn(tab, 'input[type="search"]', `${scheme}: focus returns to the search field`);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
  });

  await t.test('filter bar: never scrolls the page horizontally at 360, 768, and 1280 in light and dark', async () => {
    await assertPageFit(browser, url, '.tasks', 'filter bar');
    // With both tags showing, the bar and its tags still stay inside the viewport at 360.
    const { context, tab, errors } = await openBlock(browser, url, { width: 360 });
    try {
      await search(tab).fill('the');
      await choose(tab, 'In progress');
      await expectTags(tab, ['Task: the', 'Status: In progress'], 'two tags');
      const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
      assert.ok(scrollWidth <= innerWidth, `360px with tags: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
      const meta = await tab.evaluate(measureBox, '.tasks-meta');
      assert.ok(meta.left >= 0 && meta.right <= innerWidth, '360px with tags: the tag row stays inside the viewport');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}

// The capture counts one top-level test per engine for each block, so both variants run as subtests of one.
for (const engine of browserEngines()) {
  test(`task filters keep their status buttons and filter bar behavior in ${engine}`, { timeout: 600_000 }, async (t) => {
    const buttons = await startVariantServer(statusButtons);
    const bar = await startVariantServer(filterBar);
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${buttons.url}/block.html`, '#root > *');
      await warmUpServer(browser, `${bar.url}/block.html`, '#root > *');
      await statusButtonsTests(t, browser, buttons.url);
      await filterBarTests(t, browser, bar.url);
    } finally {
      await browser?.close();
      await buttons.close();
      await bar.close();
    }
  });
}

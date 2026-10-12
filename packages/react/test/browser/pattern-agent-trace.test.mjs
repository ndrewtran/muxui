import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { assertFits, assertUniqueIds, expectRendered, measurePageFit, openBlock, patternVariant, reachableStops, ringWalk, startVariantServer, tabWalk } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that the three agent trace variants, loaded from their canonical
// catalog sources through the public `@muxui/react` entry, keep their local behavior:
// Thinking switches its trace kind by pointer and arrow keys and folds each step, Tool
// calls folds its list and opens a result preview from each chip on hover and focus,
// and Task rows folds its rows and opens a row's details in place. Each is driven by
// keyboard and pointer, shows visible focus in light and dark, and never overflows the
// page horizontally down to 360 and 390 (E-BL1-04). Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs).

const thinking = await patternVariant('agent-trace', 'thinking');
const toolCalls = await patternVariant('agent-trace', 'tool-calls');
const taskRows = await patternVariant('agent-trace', 'task-rows');

// Activity's trigger is a native button without a tabindex, which WebKit on macOS does not Tab to.
const nativeButtons = ['button Thinking Running 2 items', 'button Release prep Running 3 items'];

const expanded = (locator) => locator.getAttribute('aria-expanded');

/** Walks the tab order in light and dark, each stop with a focus ring that differs from rest. */
async function walkBothSchemes(browser, url, expected, label, prepare = async () => {}) {
  for (const scheme of ['light', 'dark']) {
    const { context, tab } = await openBlock(browser, url, { scheme });
    try {
      await prepare(tab);
      const seen = await tabWalk(tab, ringWalk(tab), `${label} ${scheme}`);
      assert.deepEqual(seen, reachableStops(browser, expected, nativeButtons), `${label} ${scheme}: Tab visits the controls in this order, by accessible name`);
    } finally {
      await context.close();
    }
  }
}

async function thinkingTests(t, browser, url) {
  await t.test('thinking: folds the steps and switches kinds by pointer and arrow keys', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      const kind = (name) => tab.getByRole('tab', { name, exact: true });
      const steps = tab.getByRole('button', { name: 'Thinking Running 2 items' });
      await steps.waitFor();
      assert.equal(await expanded(steps), 'true');
      await expectRendered(tab.getByText('Reading the launch notes'), true);
      await steps.click();
      assert.equal(await expanded(steps), 'false');
      await expectRendered(tab.getByText('Reading the launch notes'), false);
      await steps.click();
      await expectRendered(tab.getByText('Reading the launch notes'), true);

      // Reasoning: a step folds, and its chevron follows the state.
      await kind('Reasoning').click();
      const reasoning = tab.getByRole('button', { name: 'Thinking', exact: true });
      const paragraph = tab.getByText('Two items gate the launch', { exact: false });
      await expectRendered(paragraph, true);
      // Reasoning is rich text: a list of two items with the key phrases in bold.
      const reasoningPanel = tab.getByRole('tabpanel', { name: 'Reasoning' });
      assert.equal(await reasoningPanel.getByRole('listitem').count(), 2);
      assert.deepEqual(await reasoningPanel.locator('strong').allTextContents(), ['billing copy', 'export fix']);
      assert.equal(await expanded(reasoning), 'true');
      assert.equal(await reasoning.locator('.trace-title').getAttribute('data-open'), 'true');
      await reasoning.click();
      await expectRendered(paragraph, false);
      assert.equal(await reasoning.locator('.trace-title').getAttribute('data-open'), 'false');

      // Arrow keys move through the kinds, and the open kind follows the selected tab.
      await kind('Reasoning').focus();
      await tab.keyboard.press('ArrowRight');
      await pollUntil(tab, () => document.querySelector('[role="tab"][aria-selected="true"]').textContent === 'Search', undefined, { message: 'ArrowRight selects Search', report: () => document.querySelector('[role="tab"][aria-selected="true"]').textContent });
      const links = tab.getByRole('link');
      assert.deepEqual(await links.allTextContents(), ['Rollout checklist basics', 'Staged release runbook']);
      assert.equal(await links.first().getAttribute('href'), '#result');
      await tab.keyboard.press('ArrowRight');
      await tab.getByRole('button', { name: 'Running tools' }).waitFor();

      // Coding: the Edit chip shows and hides the diff.
      const chip = tab.getByRole('button', { name: /^checklist\.ts/u });
      // The chip controls the diff by a generated id, not a fixed one.
      const diffId = await chip.getAttribute('aria-controls');
      assert.ok(diffId && diffId !== 'trace-diff', 'the diff id is generated per instance');
      const diff = tab.locator(`[id="${diffId}"]`);
      assert.equal(await expanded(chip), 'true');
      await diff.waitFor({ state: 'visible' });
      assert.match(await diff.textContent(), /"export"/u);
      await chip.click();
      await diff.waitFor({ state: 'hidden' });
      assert.equal(await expanded(chip), 'false');
      await chip.press('Enter');
      await diff.waitFor({ state: 'visible' });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('thinking: walks every control in order in light and dark, in each kind', async () => {
    await walkBothSchemes(browser, url, ['tab Steps', 'button Thinking Running 2 items'], 'steps');
    await walkBothSchemes(browser, url, ['tab Reasoning', 'button Thinking'], 'reasoning', (tab) => tab.getByRole('tab', { name: 'Reasoning' }).click());
    await walkBothSchemes(browser, url, ['tab Search', 'button Searching the web', 'link Rollout checklist basics', 'link Staged release runbook'], 'search', (tab) => tab.getByRole('tab', { name: 'Search' }).click());
    await walkBothSchemes(browser, url, ['tab Coding', 'button Running tools', 'button checklist.ts +2 -1', 'button Copy updated code', 'pre const owners = ['], 'coding', (tab) => tab.getByRole('tab', { name: 'Coding' }).click());
  });

  await t.test('thinking: two instances share no ids, with the coding diff shown', async () => {
    await assertUniqueIds(browser, url, 'thinking', async (tab) => {
      const coding = tab.getByRole('tab', { name: 'Coding' });
      for (let index = 0; index < await coding.count(); index += 1) await coding.nth(index).click();
    });
  });

  await t.test('thinking: never scrolls the page horizontally in any kind', async () => {
    await assertFits(browser, url, '.trace', 'thinking steps');
    for (const scheme of ['light', 'dark']) {
      for (const name of ['Reasoning', 'Search', 'Coding']) {
        const { context, tab } = await openBlock(browser, url, { width: 360, scheme });
        try {
          await tab.getByRole('tab', { name }).click();
          await tab.getByRole('tabpanel').waitFor();
          const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
          assert.ok(scrollWidth <= innerWidth, `${name} ${scheme} 360px: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
        } finally {
          await context.close();
        }
      }
    }
  });
}

async function toolCallsTests(t, browser, url) {
  await t.test('tool calls: folds the list and opens a preview from each chip on focus and hover', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      const header = tab.getByRole('button', { name: '4 steps' });
      const chip = (name) => tab.getByRole('button', { name, exact: true });
      await chip('rollout.tsx').waitFor();
      assert.equal(await expanded(header), 'true');
      // The header rests as plain text, with no fill of its own.
      assert.equal(await header.evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
      assert.equal(await header.locator('.calls-title').getAttribute('data-open'), 'true');
      await header.click();
      await chip('rollout.tsx').waitFor({ state: 'hidden' });
      assert.equal(await header.locator('.calls-title').getAttribute('data-open'), 'false');
      await header.press('Enter');
      await chip('rollout.tsx').waitFor({ state: 'visible' });

      // Hover opens a preview after its delay and leaving closes it. React Aria ignores hover until the page has seen a pointer press.
      await tab.mouse.click(1000, 700);
      await chip('run-checks release').hover();
      const build = tab.getByRole('dialog', { name: 'Check the release preview' });
      await build.waitFor({ state: 'visible', timeout: 4000 });
      assert.match(await build.textContent(), /All checks passed/u);
      await tab.mouse.move(2, 2);
      await build.waitFor({ state: 'hidden', timeout: 4000 });

      // Keyboard focus opens the preview and Escape closes it, leaving focus on the chip.
      await chip('Ordering the rollout steps').focus();
      await tab.keyboard.press('Tab');
      const preview = tab.getByRole('dialog', { name: 'Update the page preview' });
      await preview.waitFor({ state: 'visible' });
      assert.match(await preview.textContent(), /export function Rollout/u);
      await tab.keyboard.press('Escape');
      await preview.waitFor({ state: 'hidden' });
      assert.equal(await tab.evaluate(() => document.activeElement.textContent), 'rollout.tsx');

      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('tool calls: walks every control in order in light and dark', async () => {
    await walkBothSchemes(browser, url, [
      'button 4 steps',
      'button Ordering the rollout steps',
      'button rollout.tsx',
      'button run-checks release',
      'button timeline.png',
    ], 'tool calls');
  });

  await t.test('tool calls: two instances share no ids', async () => {
    await assertUniqueIds(browser, url, 'tool calls');
  });

  await t.test('tool calls: never scrolls the page horizontally, and keeps a long chip inside the row', async () => {
    await assertFits(browser, url, '.calls', 'tool calls');
    const { context, tab } = await openBlock(browser, url, { width: 360 });
    try {
      await tab.getByRole('button', { name: 'Ordering the rollout steps' }).focus();
      await tab.getByRole('dialog', { name: 'Sketch a plan preview' }).waitFor();
      const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
      assert.ok(scrollWidth <= innerWidth, `360px with a preview open: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
    } finally {
      await context.close();
    }
  });
}

async function taskRowsTests(t, browser, url) {
  await t.test('task rows: folds the rows and opens a row in place by pointer and keyboard', async () => {
    const { context, tab, errors } = await openBlock(browser, url);
    try {
      const header = tab.getByRole('button', { name: 'Release prep Running 3 items' });
      const row = (label) => tab.locator('summary', { hasText: label });
      await header.waitFor();
      assert.equal(await expanded(header), 'true');
      assert.equal(await tab.getByRole('status').textContent(), 'Release prep: Running.');

      // The running row starts open, native details and aria-expanded agreeing, and its progress shows; the other rows start closed.
      const progress = tab.getByRole('progressbar', { name: 'Grouping entries' });
      const open = (label) => tab.locator('details', { has: row(label) }).getAttribute('open');
      assert.equal(await expanded(row('Draft the changelog')), 'true');
      assert.equal(await open('Draft the changelog'), '');
      await expectRendered(progress, true);
      assert.equal(await progress.getAttribute('aria-valuenow'), '40');
      await expectRendered(tab.getByText('Areas found'), true);
      assert.equal(await expanded(row('Checked export settings')), 'false');
      assert.equal(await open('Checked export settings'), null);
      await expectRendered(tab.getByText('Settings updated'), false);

      // A row with details opens from its summary by pointer and by keyboard, and its details show in place.
      await row('Checked export settings').click();
      await expectRendered(tab.getByText('Settings updated'), true);
      assert.equal(await expanded(row('Checked export settings')), 'true');
      await row('Draft the changelog').focus();
      await tab.keyboard.press('Enter');
      // A folded row leaves the accessibility tree, so its progress bar is read by its text.
      await expectRendered(tab.getByText('Areas found'), false);
      assert.equal(await expanded(row('Draft the changelog')), 'false');
      await tab.keyboard.press('Space');
      await expectRendered(progress, true);
      assert.equal(await expanded(row('Draft the changelog')), 'true');
      await row('Checked export settings').press('Space');
      await expectRendered(tab.getByText('Settings updated'), false);

      // The queued row has no details, so it is not a control.
      assert.equal(await tab.locator('summary', { hasText: 'Prepare the announcement' }).count(), 0);
      await header.click();
      await expectRendered(tab.getByText('Prepare the announcement'), false);
      assert.equal(await expanded(header), 'false');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  await t.test('task rows: walks every control in order in light and dark', async () => {
    await walkBothSchemes(browser, url, [
      'button Release prep Running 3 items',
      'summary Checked export settings',
      'summary Draft the changelog',
    ], 'task rows');
  });

  await t.test('task rows: two instances share no ids', async () => {
    await assertUniqueIds(browser, url, 'task rows');
  });

  await t.test('task rows: never scrolls the page horizontally with every row open', async () => {
    await assertFits(browser, url, '.rows', 'task rows');
    for (const scheme of ['light', 'dark']) {
      const { context, tab } = await openBlock(browser, url, { width: 360, scheme });
      try {
        // The running row is already open; opening the completed one leaves every row open.
        await tab.locator('summary', { hasText: 'Checked export settings' }).click();
        await tab.getByRole('progressbar', { name: 'Grouping entries' }).waitFor({ state: 'visible' });
        const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
        assert.ok(scrollWidth <= innerWidth, `${scheme} 360px with the rows open: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
      } finally {
        await context.close();
      }
    }
  });
}

// The capture counts one top-level test per engine for each block, so the three variants run as subtests of one.
for (const engine of browserEngines()) {
  test(`agent trace keeps its thinking, tool calls, and task rows behavior in ${engine}`, { timeout: 900_000 }, async (t) => {
    const servers = [await startVariantServer(thinking), await startVariantServer(toolCalls), await startVariantServer(taskRows)];
    let browser;
    try {
      browser = await launchBrowser(engine);
      for (const { url } of servers) await warmUpServer(browser, `${url}/block.html`, '#root > *');
      await thinkingTests(t, browser, servers[0].url);
      await toolCallsTests(t, browser, servers[1].url);
      await taskRowsTests(t, browser, servers[2].url);
    } finally {
      await browser?.close();
      for (const server of servers) await server.close();
    }
  });
}

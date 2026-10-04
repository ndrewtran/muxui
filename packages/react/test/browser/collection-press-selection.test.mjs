import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

// Each case logs its selection and action callbacks into data attributes so the
// browser proof reads real pointer and keyboard outcomes.
function PressSelectionFixture() {
  const h = React.createElement;
  const items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];
  const columns = [{ id: 'name', label: 'Name', isRowHeader: true }];
  const rows = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
  function Case({ id, family, selectionMode, withAction }) {
    const [selection, setSelection] = React.useState([]);
    const [actions, setActions] = React.useState([]);
    const common = { selectionMode, onSelectionChange: setSelection };
    const onAction = withAction ? (item) => setActions((current) => [...current, item.id]) : undefined;
    const collection = family === 'grid'
      ? h(GridList, { ...common, 'aria-label': id, items, onAction })
      : family === 'tree'
        ? h(Tree, { ...common, 'aria-label': id, items, onAction })
        : h(Table, { ...common, 'aria-label': id, columns, rows, onRowAction: onAction });
    return h('section', { id, 'data-selection': selection.join(','), 'data-actions': actions.join(',') }, collection);
  }
  const cases = [];
  for (const family of ['grid', 'tree', 'table']) {
    for (const selectionMode of ['single', 'multiple']) cases.push(h(Case, { key: `${family}-${selectionMode}`, id: `${family}-${selectionMode}`, family, selectionMode }));
    cases.push(h(Case, { key: `${family}-action`, id: `${family}-action`, family, selectionMode: 'single', withAction: true }));
  }
  return h('main', null, cases);
}

test('real browser selects GridList, Tree, and Table rows on click and Enter from an empty selection', { timeout: 90_000 }, async () => {
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { GridList, Table, Tree } from '/src/collections.mjs';
    import '/generated/styles.css';
    ${PressSelectionFixture.toString()}
    createRoot(document.getElementById('root')).render(React.createElement(PressSelectionFixture));`;
  const { url, close } = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/press-selection.html': pageShell({ body: '<div id="root"></div>', entry: '/press-selection-entry.mjs' }) },
    modules: { '/press-selection-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/press-selection.html`, { waitUntil: 'networkidle' });
    await page.locator('#table-action [role="row"]').first().waitFor();
    const row = (id, label) => page.locator(`#${id} [role="row"]`).filter({ hasText: label }).last();
    const attribute = (id, name) => page.locator(`#${id}`).getAttribute(name);

    for (const family of ['grid', 'tree', 'table']) {
      for (const selectionMode of ['single', 'multiple']) {
        const id = `${family}-${selectionMode}`;
        await row(id, 'Alpha').click();
        assert.equal(await attribute(id, 'data-selection'), 'a', `${id} click selects from an empty selection`);
        assert.equal(await row(id, 'Alpha').getAttribute('aria-selected'), 'true');
        await row(id, 'Alpha').click();
        assert.equal(await attribute(id, 'data-selection'), '', `${id} click toggles back to empty`);
        await page.keyboard.press('Enter');
        assert.equal(await attribute(id, 'data-selection'), 'a', `${id} Enter selects from an empty selection`);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        assert.equal(await attribute(id, 'data-selection'), selectionMode === 'single' ? 'b' : 'a,b', `${id} Enter updates the selection`);
      }
      const actionId = `${family}-action`;
      await row(actionId, 'Alpha').click();
      await page.keyboard.press('Enter');
      assert.equal(await attribute(actionId, 'data-actions'), 'a,a', `${family} consumer action runs on click and Enter`);
      assert.equal(await attribute(actionId, 'data-selection'), '');
    }
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});

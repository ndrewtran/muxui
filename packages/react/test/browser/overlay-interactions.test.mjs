import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

// One client-rendered fixture per scenario, selected by `?scenario=`.
const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { Dialog, DropZone, FileTrigger, Popover, PreviewTrigger, Toast, ToastProvider, useToast } from '/src/overlays.mjs';
  import { Button } from '/src/button.mjs';
  import '/generated/styles.css';
  const h = React.createElement;

  function PreviewScenario() {
    return h('div', null,
      h('input', { id: 'typing', 'aria-label': 'Typing' }),
      h('div', { style: { height: 120 } }),
      h(PreviewTrigger, { 'aria-label': 'Preview', delay: 100, closeDelay: 100,
        trigger: h('a', { id: 'preview-link', href: '#preview' }, 'Preview link') },
        h('p', null, 'Preview body ', h('a', { id: 'inner-link', href: '#inner' }, 'Inner link'))),
      h('div', { style: { height: 120 } }),
      h('button', { id: 'after' }, 'After'));
  }

  function ToastControls() {
    const toast = useToast();
    React.useEffect(() => { window.toastManager = toast; }, [toast]);
    return h('button', { id: 'before' }, 'Before');
  }

  function ToastScenario() {
    return h(ToastProvider, null, h(ToastControls));
  }

  function DeclarativeToast() {
    const [shown, setShown] = React.useState(true);
    return shown ? h(Toast, { message: 'Saved', duration: 60_000, onDismiss: () => setShown(false) }) : h('p', { id: 'unmounted' }, 'Unmounted');
  }

  function DialogScenario() {
    const record = (name) => (open) => window.openChanges.push([name, open]);
    return h('div', null,
      h(Dialog, { title: 'Settings', onOpenChange: record('dialog'), trigger: h('button', { id: 'dialog-trigger' }, 'Open dialog') },
        h(Popover, { 'aria-label': 'Modal options', onOpenChange: record('modal-popover'), trigger: h('button', { id: 'modal-popover-trigger' }, 'Modal options') },
          h('button', { id: 'modal-popover-inside' }, 'Inside')),
        h(Popover, { 'aria-label': 'Inline options', modal: false, onOpenChange: record('inline-popover'), trigger: h('button', { id: 'inline-popover-trigger' }, 'Inline options') },
          h('button', { id: 'inline-popover-inside' }, 'Inside'))),
      h('div', { id: 'tall', style: { height: 3000 } }, 'Tall page'));
  }

  function FilesScenario() {
    return h('div', null,
      h(DropZone, { 'aria-label': 'Upload', style: { width: 300, height: 120 }, onDrop: (event) => {
        Promise.all(event.items.map((item) => item.getText('text/plain'))).then((texts) => window.drops.push(texts));
      } }, 'Drop files here'),
      h(FileTrigger, { onSelect: (files) => window.selections.push(files.map((file) => file.name)) }, h('button', { id: 'browse' }, 'Browse')));
  }

  window.openChanges = [];
  window.drops = [];
  window.selections = [];
  function NestedScenario() {
    return h('div', null,
      h(Popover, { 'aria-label': 'Outer', modal: false, onOpenChange: (open) => window.openChanges.push(['outer', open]), trigger: h('button', { id: 'outer-trigger' }, 'Outer') },
        h('p', { id: 'outer-text' }, 'Outer text'),
        h('button', { id: 'outer-native' }, 'Native'),
        h(Dialog, { title: 'Nested dialog', trigger: h('button', { id: 'nested-dialog-trigger' }, 'Nested dialog') },
          h(Button, { id: 'nested-dialog-button' }, 'Dialog action'),
          h('button', { id: 'nested-dialog-native' }, 'Dialog native'),
          h('p', { id: 'nested-dialog-text' }, 'Dialog text')),
        h(Popover, { 'aria-label': 'Nested popover', modal: false, trigger: h('button', { id: 'nested-popover-trigger' }, 'Nested popover') },
          h(Button, { id: 'nested-popover-button' }, 'Popover action'),
          h('p', { id: 'nested-popover-text' }, 'Popover text'))),
      h('button', { id: 'page-button', style: { marginTop: 400 } }, 'Page'));
  }

  const params = new URLSearchParams(location.search);

  // A list whose row buttons open one controlled Dialog. ?focusable=0 drops the
  // list's tabIndex so the opener has no focusable ancestor; ?deleteOnOpen=1
  // removes the opener's row in the same update that opens the Dialog.
  function RowsDialog({ listId = 'rows' }) {
    const [rows, setRows] = React.useState([1, 2, 3]);
    const [openRow, setOpenRow] = React.useState(null);
    const remove = (target) => setRows((current) => current.filter((row) => row !== target));
    return h('div', null,
      h('ul', { id: listId, 'aria-label': 'Rows', tabIndex: params.get('focusable') === '0' ? undefined : -1 },
        rows.map((row) => h('li', { key: row, id: 'row-' + row },
          h('button', { id: 'edit-' + row, onClick: () => {
            setOpenRow(row);
            if (params.get('deleteOnOpen') === '1') remove(row);
          } }, 'Edit row ' + row)))),
      h(Dialog, { title: 'Edit row', className: 'rows-dialog', open: openRow !== null, onOpenChange: (open) => { if (!open) setOpenRow(null); } },
        h('button', { id: 'delete-row', onClick: () => remove(openRow) }, 'Delete row')));
  }

  // A modal Popover inside each row; deleting the row unmounts its Popover too.
  function PopoverRowsScenario() {
    const [rows, setRows] = React.useState([1, 2]);
    return h('ul', { id: 'rows', 'aria-label': 'Rows', tabIndex: -1 },
      rows.map((row) => h('li', { key: row, id: 'row-' + row },
        h(Popover, { 'aria-label': 'Row actions', trigger: h('button', { id: 'actions-' + row }, 'Actions ' + row) },
          h('button', { id: 'delete-row', onClick: () => setRows((current) => current.filter((item) => item !== row)) }, 'Delete row')))));
  }

  // A modal Popover that stays mounted while its trigger is removed, then closes.
  function RemovableTrigger({ removed, ...props }) {
    return removed ? null : h(Button, props, 'Actions');
  }
  function PopoverTriggerRemovedScenario() {
    const [removed, setRemoved] = React.useState(false);
    return h('ul', { id: 'rows', 'aria-label': 'Rows', tabIndex: -1 },
      h('li', { id: 'row-1' },
        h(Popover, { 'aria-label': 'Row actions', trigger: h(RemovableTrigger, { id: 'actions-1', removed }) },
          h('button', { id: 'remove-trigger', onClick: () => setRemoved(true) }, 'Remove trigger'))));
  }

  const scenarios = {
    rows: () => h(RowsDialog),
    'nested-popover-rows': () => h('div', null,
      h(Popover, { 'aria-label': 'Row list', modal: false, trigger: h('button', { id: 'pop-trigger' }, 'Rows') }, h(RowsDialog, { listId: 'pop-rows' }))),
    'nested-dialog-rows': () => h(Dialog, { title: 'Outer', trigger: h('button', { id: 'outer-trigger' }, 'Outer') }, h(RowsDialog, { listId: 'outer-rows' })),
    'popover-rows': PopoverRowsScenario,
    'popover-trigger-removed': PopoverTriggerRemovedScenario,
    nested: NestedScenario,
    dialog: DialogScenario,
    files: FilesScenario,
    preview: PreviewScenario,
    toast: ToastScenario,
    declarative: () => h(ToastProvider, null, h(DeclarativeToast)),
  };
  const Scenario = scenarios[params.get('scenario')];
  createRoot(document.getElementById('root')).render(params.get('strict') === '1' ? h(React.StrictMode, null, h(Scenario)) : h(Scenario));
  document.documentElement.dataset.ready = 'true';`;

let server;
let browser;

before(async () => {
  server = await startServer({
    entries: ['src/overlays.mjs'],
    pages: { '/overlay-interactions.html': pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', body: '<div id="root"></div>', entry: '/overlay-interactions-entry.mjs' }) },
    modules: { '/overlay-interactions-entry.mjs': entry },
  });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function openScenario(scenario) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.setDefaultTimeout(5_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${server.url}/overlay-interactions.html?scenario=${scenario}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  return { page, errors };
}

const activeId = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

test('PreviewTrigger leaves focus in place when its preview opens and lets Tab move in', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('preview');
  try {
    const preview = page.locator('.muxui-preview-trigger');

    // Pointer hover opens the preview without taking focus from a text field.
    await page.locator('#typing').click();
    await page.locator('#preview-link').hover();
    await preview.waitFor({ state: 'visible' });
    await page.waitForTimeout(150);
    assert.equal(await activeId(page), 'typing', 'hover-open keeps focus in the text field');
    await page.keyboard.type('abc');
    assert.equal(await page.locator('#typing').inputValue(), 'abc');
    await page.mouse.move(800, 650);
    await preview.waitFor({ state: 'detached' });

    // Keyboard focus opens the preview after its delay; focus stays on the trigger.
    await page.locator('#typing').focus();
    await page.keyboard.press('Tab');
    assert.equal(await activeId(page), 'preview-link');
    await preview.waitFor({ state: 'visible' });
    await page.waitForTimeout(150);
    assert.equal(await activeId(page), 'preview-link', 'focus-open keeps focus on the trigger');
    assert.equal(await preview.getAttribute('role'), 'dialog');
    assert.equal(await preview.getAttribute('aria-label'), 'Preview');

    // Tab moves into the preview, and Escape restores focus to the trigger.
    await page.keyboard.press('Tab');
    assert.equal(await activeId(page), 'inner-link');
    await page.keyboard.press('Escape');
    await preview.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'preview-link');
    await page.waitForTimeout(250);
    assert.equal(await preview.count(), 0, 'restoring focus does not reopen the preview');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('keyboard Toast dismissal moves focus to the next toast, then back to the page', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('toast');
  try {
    await page.waitForFunction(() => window.toastManager);
    // Newest toasts render first, so the DOM order is Third, Second, First.
    await page.evaluate(() => ['First', 'Second', 'Third'].forEach((message) => window.toastManager.add(message, { duration: 60_000 })));
    const toasts = page.locator('.muxui-toast:not([data-muxui-toast-exiting])');
    await page.waitForFunction(() => document.querySelectorAll('.muxui-toast').length === 3);
    const focusedToast = () => page.evaluate(() => {
      const active = document.activeElement;
      return active?.closest('.muxui-toast')?.querySelector('.muxui-toast-message')?.textContent || active?.id || active?.tagName;
    });

    // Tab from the page through Third (toast, dismiss) to Second's dismiss button.
    await page.locator('#before').focus();
    for (let index = 0; index < 4; index += 1) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Dismiss notification');
    assert.equal(await focusedToast(), 'Second');

    // Dismissing the middle toast focuses the next one.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(20);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'alertdialog');
    assert.equal(await focusedToast(), 'First');
    await page.waitForFunction(() => document.querySelectorAll('.muxui-toast').length === 2);
    assert.equal(await focusedToast(), 'First', 'committing the exit keeps focus in place');

    // Dismissing the last toast in order falls back to the previous one.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(20);
    assert.equal(await focusedToast(), 'Third');
    assert.equal(await toasts.count(), 1);

    // Dismissing the only remaining toast returns focus to where it was before the region.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(20);
    assert.equal(await focusedToast(), 'before');
    await page.waitForFunction(() => document.querySelectorAll('.muxui-toast').length === 0);
    assert.equal(await focusedToast(), 'before');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('a declarative Toast whose onDismiss unmounts it still plays its exit', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('declarative');
  try {
    const toast = page.locator('.muxui-toast');
    await toast.waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
    await page.locator('.muxui-toast-dismiss').click();
    await page.locator('#unmounted').waitFor();
    assert.equal(await page.locator('.muxui-toast[data-muxui-toast-exiting]').count(), 1, 'the exiting toast is retained after its owner unmounts');
    await toast.waitFor({ state: 'detached' });
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('Toast timers respect a hover that starts during entry and hold while hovered', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('toast');
  try {
    await page.waitForFunction(() => window.toastManager);
    const toast = page.locator('.muxui-toast');
    await page.mouse.move(10, 690);

    // Hover in and out while the toast is still entering, then hover and hold.
    await page.evaluate(() => window.toastManager.add('Held', { duration: 1500 }));
    await page.waitForTimeout(20);
    await toast.hover({ force: true });
    await page.waitForTimeout(20);
    await page.mouse.move(10, 690);
    await page.waitForTimeout(600);
    await toast.hover();
    await page.waitForTimeout(2200);
    assert.equal(await toast.count(), 1, 'a hovered toast stays open past its duration');

    // Leaving the region resumes the remaining time once.
    await page.mouse.move(10, 690);
    await toast.waitFor({ state: 'detached', timeout: 3000 });
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('Dialog locks scroll, dismisses on backdrop press, and closes nested overlays first on Escape', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('dialog');
  try {
    const dialog = page.locator('.muxui-dialog');
    const changes = () => page.evaluate(() => window.openChanges.splice(0));
    await page.locator('#dialog-trigger').click();
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden', 'page scroll is locked');
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.scrollY), 0);

    // A modal Popover inside the Dialog closes first, then the Dialog.
    await page.locator('#modal-popover-trigger').click();
    await page.locator('#modal-popover-inside').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#modal-popover-inside').waitFor({ state: 'detached' });
    assert.equal(await dialog.count(), 1);
    await page.waitForFunction(() => document.activeElement?.id === 'modal-popover-trigger');

    // So does a non-modal Popover whose trigger keeps focus.
    await page.locator('#inline-popover-trigger').click();
    await page.locator('#inline-popover-inside').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#inline-popover-inside').waitFor({ state: 'detached' });
    assert.equal(await dialog.count(), 1);
    assert.deepEqual(await changes(), [['dialog', true], ['modal-popover', true], ['modal-popover', false], ['inline-popover', true], ['inline-popover', false]]);

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'dialog-trigger');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden', 'scroll lock is released');

    // Pressing the backdrop dismisses the Dialog.
    await page.locator('#dialog-trigger').click();
    await dialog.waitFor({ state: 'visible' });
    await page.mouse.click(10, 10);
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(await changes(), [['dialog', false], ['dialog', true], ['dialog', false]]);
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

// React Aria restores focus one frame after a closed overlay unmounts, or after
// running transitions under a virtual cursor; let both settle before asserting.
async function settledActiveId(page, overlay) {
  await overlay.waitFor({ state: 'detached' });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  await page.waitForTimeout(250);
  return activeId(page);
}

async function deleteOpenerRow(page, dialog) {
  await page.locator('#edit-2').click();
  await dialog.waitFor({ state: 'visible' });
  await page.locator('#delete-row').click();
  await page.locator('#row-2').waitFor({ state: 'detached' });
  assert.equal(await activeId(page), 'delete-row', 'the Dialog keeps focus while its opener is removed');
}

// Each case removes the opener of a rows Dialog, closes it one way, and expects focus on `expected`.
const removedOpenerCases = [
  ['Escape', 'rows', 'rows', (page) => page.keyboard.press('Escape')],
  ['the close button', 'rows', 'rows', (page) => page.locator('.rows-dialog .muxui-dialog-close').click()],
  ['a backdrop press', 'rows', 'rows', (page) => page.mouse.click(10, 10)],
  ['Escape with no focusable ancestor', 'rows&focusable=0', 'BODY', (page) => page.keyboard.press('Escape')],
  // A nested Dialog's opener sits inside a still-open outer Dialog, whose own
  // opener is inert while it is open, so React Aria cannot restore focus.
  ['Escape inside an outer Dialog', 'nested-dialog-rows', 'outer-rows', (page) => page.keyboard.press('Escape')],
  // React Aria restores to the enclosing non-modal Popover's trigger, so the
  // fallback must not pre-empt it, for virtual or keyboard input alike.
  ['a virtual click inside a non-modal Popover', 'nested-popover-rows', 'pop-trigger', (page) => page.locator('.rows-dialog .muxui-dialog-close').evaluate((node) => node.click())],
  ['a keyboard close inside a non-modal Popover', 'nested-popover-rows', 'pop-trigger', async (page) => {
    await page.locator('.rows-dialog .muxui-dialog-close').focus();
    await page.keyboard.press('Enter');
  }],
];

for (const [close, scenario, expected, closeDialog] of removedOpenerCases) {
  test(`${close} after the opener was removed moves focus to ${expected}`, { timeout: 60_000 }, async () => {
    const { page, errors } = await openScenario(scenario);
    try {
      if (scenario.startsWith('nested-dialog')) await page.locator('#outer-trigger').click();
      if (scenario.startsWith('nested-popover')) await page.locator('#pop-trigger').click();
      const dialog = page.locator('.rows-dialog');
      await deleteOpenerRow(page, dialog);
      await closeDialog(page);
      assert.equal(await settledActiveId(page, dialog), expected);
      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await page.close();
    }
  });
}

test('a Dialog whose opener still exists restores focus to the opener', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('rows');
  try {
    const dialog = page.locator('.rows-dialog');
    await page.locator('#edit-2').click();
    await dialog.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    assert.equal(await settledActiveId(page, dialog), 'edit-2');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('in StrictMode, an opener removed as the Dialog opens keeps focus in the Dialog until it closes', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('rows&strict=1&deleteOnOpen=1');
  try {
    const dialog = page.locator('.rows-dialog');
    await page.locator('#edit-2').click();
    await dialog.waitFor({ state: 'visible' });
    await page.locator('#row-2').waitFor({ state: 'detached' });
    await page.waitForTimeout(250);
    assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true, 'focus stays in the open Dialog');
    await page.keyboard.press('Escape');
    assert.equal(await settledActiveId(page, dialog), 'rows');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('a Popover unmounted with its opener\'s row moves focus to the nearest focusable ancestor', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('popover-rows');
  try {
    const popover = page.locator('.muxui-popover');
    await page.locator('#actions-2').click();
    await page.locator('#delete-row').focus();
    await page.locator('#delete-row').press('Enter');
    assert.equal(await settledActiveId(page, popover), 'rows');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('a Popover that closes after its trigger was removed moves focus to the nearest focusable ancestor', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('popover-trigger-removed');
  try {
    const popover = page.locator('.muxui-popover');
    await page.locator('#actions-1').click();
    await page.locator('#remove-trigger').click();
    await page.locator('#actions-1').waitFor({ state: 'detached' });
    assert.equal(await popover.count(), 1, 'the Popover stays open without its trigger');
    await page.locator('#remove-trigger').focus();
    await page.keyboard.press('Escape');
    assert.equal(await settledActiveId(page, popover), 'rows');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

// Synthetic file drags have no filesystem entry, which React Aria skips, so
// this drives the drag lifecycle with text; native file drags stay manual.
test('DropZone exposes its drop target state during a drag and reports the drop', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('files');
  try {
    const dropZone = page.locator('.muxui-drop-zone');
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'Dragged text');
      return transfer;
    });
    await dropZone.dispatchEvent('dragenter', { dataTransfer });
    await dropZone.dispatchEvent('dragover', { dataTransfer });
    await page.waitForFunction(() => document.querySelector('.muxui-drop-zone')?.hasAttribute('data-drop-target'));
    await dropZone.dispatchEvent('drop', { dataTransfer });
    await page.waitForFunction(() => window.drops.length === 1);
    assert.deepEqual(await page.evaluate(() => window.drops), [['Dragged text']]);
    assert.equal(await dropZone.getAttribute('data-drop-target'), null);
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('FileTrigger opens from the keyboard and accepts the same file twice', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('files');
  try {
    const file = { name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('same') };
    await page.locator('#browse').focus();
    for (const expected of [1, 2]) {
      const chooser = page.waitForEvent('filechooser');
      await page.keyboard.press(expected === 1 ? 'Enter' : 'Space');
      await (await chooser).setFiles(file);
      await page.waitForFunction((count) => window.selections.length === count, expected);
    }
    assert.deepEqual(await page.evaluate(() => window.selections), [['same.txt'], ['same.txt']]);
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('a non-modal Popover stays open for presses inside its nested overlays', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('nested');
  try {
    const outer = page.locator('.muxui-popover[aria-label="Outer"]');
    await page.locator('#outer-trigger').click();
    await outer.waitFor();
    for (const selector of ['#outer-text', '#outer-native']) {
      await page.locator(selector).click();
      assert.equal(await outer.count(), 1, `pressing ${selector} keeps the outer popover open`);
    }

    // React Aria Buttons stop pointerdown propagation inside portaled overlays.
    await page.locator('#nested-dialog-trigger').click();
    await page.locator('#nested-dialog-button').waitFor();
    for (const selector of ['#nested-dialog-button', '#nested-dialog-native', '#nested-dialog-text']) {
      await page.locator(selector).click();
      assert.equal(await page.locator('#nested-dialog-button').count(), 1, `pressing ${selector} keeps the nested dialog open`);
      assert.equal(await outer.count(), 1, `pressing ${selector} keeps the outer popover open`);
    }
    await page.keyboard.press('Escape');
    await page.locator('#nested-dialog-button').waitFor({ state: 'detached' });
    assert.equal(await outer.count(), 1);

    await page.locator('#nested-popover-trigger').click();
    await page.locator('#nested-popover-button').waitFor();
    for (const selector of ['#nested-popover-button', '#nested-popover-text']) {
      await page.locator(selector).click();
      assert.equal(await page.locator('#nested-popover-button').count(), 1, `pressing ${selector} keeps the nested popover open`);
      assert.equal(await outer.count(), 1, `pressing ${selector} keeps the outer popover open`);
    }

    // A genuine outside press still dismisses.
    await page.locator('#page-button').click();
    await outer.waitFor({ state: 'detached' });
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('a pointer Toast dismissal returns focus to the page so timers keep running', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('toast');
  try {
    await page.waitForFunction(() => window.toastManager);
    await page.evaluate(() => {
      window.toastManager.add('Remaining', { duration: 1500 });
      window.toastManager.add('Dismissed', { duration: 60_000 });
    });
    await page.waitForFunction(() => document.querySelectorAll('.muxui-toast').length === 2);
    // Tab onto Dismissed's dismiss button, then press it with the mouse.
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const dismiss = page.locator('.muxui-toast-dismiss').first();
    assert.equal(await dismiss.evaluate((node) => node === document.activeElement), true);
    await dismiss.click();
    await page.waitForFunction(() => document.activeElement?.id === 'before');
    await page.mouse.move(10, 690);
    await page.locator('.muxui-toast').first().waitFor({ state: 'detached', timeout: 4000 });
    await page.waitForFunction(() => document.querySelectorAll('.muxui-toast').length === 0, null, { timeout: 4000 });
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Each case renders one field, the selection cases inside a form. onSelect and submit events are logged to
// window.events so the test can assert what the browser actually reported.
// The page cannot scroll, because a scroll closes the open list and commits the field. The long case opens on a page
// that can scroll, to show the list scrolls in its place.
// The submit button sits above the field so the open list never covers it.
const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { ComboBox } from '/src/collections.mjs';
  import '/generated/styles.css';
  const h = React.createElement;
  window.events = [];
  const log = (...event) => window.events.push(event);
  const cities = [{ id: 'mel', label: 'Melbourne' }, { id: 'syd', label: 'Sydney' }];
  const towns = [{ id: 'mel', label: 'Melbourne' }, { id: 'syd', label: 'Sydney', disabled: true }, { id: 'per', label: 'Perth' }];
  const options = Array.from({ length: 40 }, (_, index) => ({ id: 'option-' + (index + 1), label: 'Option ' + (index + 1) }));
  const submit = (event) => {
    event.preventDefault();
    log('submit', new FormData(event.currentTarget).getAll('city'));
  };
  const cases = {
    uncontrolled: () => h('form', { onSubmit: submit },
      h('button', { type: 'submit' }, 'Submit'),
      h(ComboBox, { label: 'City', name: 'city', items: cities, onSelect: (item) => log('select', item?.id ?? 'none') })),
    controlled: function Controlled() {
      const [text, setText] = React.useState('');
      const [selectedId, setSelectedId] = React.useState(null);
      return h('form', { onSubmit: submit },
        h('button', { type: 'submit' }, 'Submit'),
        h(ComboBox, {
          label: 'City', name: 'city', items: cities, value: text, onChange: setText, selectedId,
          onSelect: (item) => {
            log('select', item?.id ?? 'none');
            setSelectedId(item?.id ?? null);
            setText(item === undefined ? '' : item.label);
          },
        }),
        h('button', { type: 'button', id: 'app-clear', onClick: () => { setText(''); setSelectedId(null); } }, 'Clear'),
        h('output', null, 'selected ' + (selectedId ?? 'none')));
    },
    // A field far wider than its options, so a list sized by its options alone shows as narrower than the field.
    list: () => h('div', { style: { width: '600px', padding: '24px' } }, h(ComboBox, { label: 'Town', items: towns })),
    // Forty options, far more than the list shows, above content that makes the page taller than the viewport.
    long: () => h('div', { style: { width: '320px', padding: '24px', minHeight: '300vh' } }, h(ComboBox, { label: 'Option', items: options })),
  };
  const name = new URLSearchParams(location.search).get('case');
  createRoot(document.getElementById('root')).render(h(cases[name]));
  document.documentElement.dataset.ready = name;`;

let server;
let browser;
before(async () => {
  server = await startServer({
    entries: ['src/collections.mjs'],
    pages: {
      '/combo-box.html': pageShell({ head: '<style>html, body { margin: 0; overflow: hidden; }</style>', body: '<div id="root"></div>', entry: '/combo-box-entry.mjs' }),
      '/combo-box-scroll.html': pageShell({ head: '<style>html, body { margin: 0; }</style>', body: '<div id="root"></div>', entry: '/combo-box-entry.mjs' }),
    },
    modules: { '/combo-box-entry.mjs': entry },
  });
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

test('real browser ComboBox reports a cleared selection and submits an empty value', { timeout: 90_000 }, async () => {
  const { url } = server;
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  try {
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
    const input = page.getByRole('combobox', { name: 'City' });
    const events = () => page.evaluate(() => window.events);
    // React Aria reports a cleared selection from an effect, so wait for the logged events.
    const untilEvents = (count) => page.waitForFunction((expected) => window.events.length >= expected, count);
    const submit = async () => {
      await page.locator('button[type="submit"]').click();
      return (await events()).findLast(([type]) => type === 'submit')[1];
    };
    // Typing the start of a name filters the options; choosing one selects it.
    const choose = async () => {
      await input.pressSequentially('Syd');
      await page.locator('.muxui-combo-box__option', { hasText: 'Sydney' }).click();
      await page.waitForFunction(() => document.querySelector('input[role="combobox"]').value === 'Sydney');
    };

    for (const mode of ['uncontrolled', 'controlled']) {
      await page.goto(`${url}/combo-box.html?case=${mode}`, { waitUntil: 'load' });
      await page.waitForFunction((expected) => document.documentElement.dataset.ready === expected, mode);
      await awaitFontsAndFrames(page);

      await choose();
      await untilEvents(1);
      assert.deepEqual(await submit(), ['syd'], `${mode}: the form submits the selected id`);

      // Clear by typing: delete the text one character at a time.
      await input.focus();
      await input.press('End');
      for (let index = 0; index < 'Sydney'.length; index += 1) await input.press('Backspace');
      assert.equal(await input.inputValue(), '', mode);
      await untilEvents(3);
      assert.deepEqual(await events(), [['select', 'syd'], ['submit', ['syd']], ['select', 'none']], `${mode}: typing the text away reports no item once`);
      assert.deepEqual(await submit(), [''], `${mode}: the form submits an empty value`);

      // Clear by an action: empty the input in one step.
      await choose();
      await input.clear();
      assert.equal(await input.inputValue(), '', mode);
      await untilEvents(6);
      assert.deepEqual((await events()).filter(([type]) => type === 'select'), [['select', 'syd'], ['select', 'none'], ['select', 'syd'], ['select', 'none']], mode);
      assert.deepEqual(await submit(), [''], mode);
      // Open the list: nothing is selected.
      await page.locator('.muxui-combo-box__trigger').click();
      assert.equal(await page.locator('.muxui-combo-box__option[aria-selected="true"]').count(), 0, mode);
      await page.keyboard.press('Escape');
    }

    // A controlled field also follows the application clearing its own state.
    await choose();
    await page.getByText('selected syd').waitFor();
    const eventCount = (await events()).length;
    await page.locator('#app-clear').click();
    await page.getByText('selected none').waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal((await events()).length, eventCount, 'the application clearing its state is not reported back');
    assert.deepEqual(await submit(), ['']);
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('real browser ComboBox opens its list at the field\'s width and draws each option by its real state', { timeout: 90_000 }, async () => {
  const { url } = server;
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  try {
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
    const input = page.getByRole('combobox', { name: 'Town' });
    const popover = page.locator('.muxui-combo-box__popover');
    const unfilled = 'rgba(0, 0, 0, 0)';
    // Each option's fill and opacity, beside whether React Aria has it focused.
    const options = () => page.locator('.muxui-combo-box__option').evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      return { label: node.textContent, focused: node.hasAttribute('data-muxui-state-focused'), fill: style.backgroundColor, opacity: Number(style.opacity) };
    }));
    // Opens the list from its button: it starts at the field's start edge and, its options being short, is as wide as the field.
    const openFlush = async (label) => {
      await page.locator('.muxui-combo-box__trigger').click();
      await popover.waitFor();
      const [field, list] = await Promise.all([page.locator('.muxui-combo-box__control').boundingBox(), popover.boundingBox()]);
      assert.ok(Math.abs(list.x - field.x) < 0.5, `${label}: the list starts ${list.x - field.x}px from the field's start`);
      assert.ok(Math.abs(list.width - field.width) < 0.5, `${label}: a ${list.width}px list under a ${field.width}px field`);
    };
    // Reduced motion settles the popover and the option fills at once, so they are read at rest.
    const open = async (name, scheme) => {
      await page.goto(`${url}/combo-box.html?case=${name}`, { waitUntil: 'load' });
      await page.waitForFunction((expected) => document.documentElement.dataset.ready === expected, name);
      await awaitFontsAndFrames(page);
      await page.evaluate((value) => { Object.assign(document.documentElement.dataset, { muxuiColorScheme: value, muxuiMotion: 'reduced' }); }, scheme);
    };

    for (const scheme of ['light', 'dark']) {
      await open('list', scheme);
      await openFlush(scheme);
      // No option is focused yet, so none is filled, and the disabled option is dimmed rather than filled.
      let drawn = await options();
      assert.deepEqual(drawn.map(({ label, focused, fill }) => [label, focused, fill]), [['Melbourne', false, unfilled], ['Sydney', false, unfilled], ['Perth', false, unfilled]], scheme);
      assert.deepEqual(drawn.map(({ opacity }) => opacity < 1), [false, true, false], `${scheme}: only the disabled option is dimmed`);
      await page.keyboard.press('Escape');
      await popover.waitFor({ state: 'detached' });

      // Typing opens the list with no option focused, so no option is drawn highlighted...
      await input.pressSequentially('e');
      await popover.waitFor();
      assert.equal(await input.getAttribute('aria-activedescendant'), null, `${scheme}: typing focuses no option`);
      assert.deepEqual((await options()).map(({ fill }) => fill), [unfilled, unfilled, unfilled], `${scheme}: typing highlights no option`);
      // ...until ArrowDown focuses the first option, which then carries the highlight alone.
      await input.press('ArrowDown');
      await page.locator('.muxui-combo-box__option[data-muxui-state-focused]').waitFor();
      drawn = await options();
      assert.deepEqual(drawn.map(({ focused }) => focused), [true, false, false], scheme);
      assert.notEqual(drawn[0].fill, unfilled, `${scheme}: the focused option is highlighted`);
      assert.deepEqual(drawn.slice(1).map(({ fill }) => fill), [unfilled, unfilled], scheme);
    }

    // A field that spans the page keeps its list flush with it too, and the list does not widen the page, whose scroll would close it.
    await open('uncontrolled', 'light');
    await openFlush('edge to edge');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the list does not widen the page');

    // Forced colours paint every option in system colours, so the disabled option keeps full opacity there, as before.
    await page.emulateMedia({ forcedColors: 'active' });
    await open('list', 'light');
    await openFlush('forced colours');
    assert.deepEqual((await options()).map(({ opacity }) => opacity), [1, 1, 1], 'forced colours: no option is dimmed');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

// React Aria keeps the focused option in view by scrolling the list, and scrolls the page when the list cannot
// scroll, which closes the list. A tall viewport leaves the list its 17.5rem cap; a short one leaves it only the space
// React Aria reports below the field.
for (const engine of browserEngines()) {
  test(`real browser ComboBox scrolls its list, not the page, to keep the focused option in view in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url } = server;
    // Chromium runs in the file's browser; another engine gets its own.
    const engineBrowser = engine === 'chromium' ? browser : await launchBrowser(engine);
    try {
      for (const [viewport, height] of [['tall', 700], ['short', 300]]) {
        const page = await engineBrowser.newPage({ viewport: { width: 800, height } });
        try {
          page.setDefaultTimeout(10_000);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
          await page.goto(`${url}/combo-box-scroll.html?case=long`, { waitUntil: 'load' });
          await page.waitForFunction(() => document.documentElement.dataset.ready === 'long');
          await awaitFontsAndFrames(page);
          // Reduced motion opens the list in place, so its geometry is read at rest.
          await page.evaluate(() => { document.documentElement.dataset.muxuiMotion = 'reduced'; });
          // The open list and its focused option, once they hold still for three frames: React Aria scrolls the list a
          // frame after the focus moves, and a page scroll closes the list a frame after that. While the list is open it
          // waits for the expected option, when one is given; a closed list returns at once.
          let reads = 0;
          const settle = (expected) => page.waitForFunction(({ expected, call }) => {
            const popover = document.querySelector('.muxui-combo-box__popover');
            const list = document.querySelector('.muxui-combo-box__list');
            const option = list?.querySelector('.muxui-combo-box__option[data-muxui-state-focused]');
            const listBox = list?.getBoundingClientRect();
            const optionBox = option?.getBoundingClientRect();
            const read = {
              open: document.querySelector('input[role="combobox"]').getAttribute('aria-expanded') === 'true' && Boolean(list),
              label: option?.textContent ?? null,
              pageScroll: window.scrollY,
              listScroll: list?.scrollTop ?? null,
              // The focused option's distance from the list's top and bottom edges.
              top: option ? optionBox.top - listBox.top : null,
              bottom: option ? listBox.bottom - optionBox.bottom : null,
            };
            if (read.open && expected !== undefined && read.label !== expected) return null;
            const key = JSON.stringify(read);
            const previous = window.lastComboBoxRead;
            window.lastComboBoxRead = { key, call, count: previous?.key === key && previous.call === call ? previous.count + 1 : 1 };
            if (window.lastComboBoxRead.count < 3) return null;
            if (!popover || !list) return read;
            const listStyle = getComputedStyle(list);
            const popoverBox = popover.getBoundingClientRect();
            return {
              ...read,
              inViewport: Boolean(option) && optionBox.top >= 0 && optionBox.bottom <= innerHeight,
              paddingTop: parseFloat(listStyle.paddingTop),
              paddingBottom: parseFloat(listStyle.paddingBottom),
              height: listBox.height,
              scrolls: list.scrollHeight > list.clientHeight,
              // How far the list's bottom edge lies above the popover's inner bottom edge; below zero, the popover clips it.
              inset: popoverBox.bottom - parseFloat(getComputedStyle(popover).borderBottomWidth) - listBox.bottom,
              cap: 17.5 * parseFloat(getComputedStyle(document.documentElement).fontSize),
              // The maximum height React Aria sets on the popover: the space it found for the list.
              space: parseFloat(popover.style.maxHeight),
            };
          }, { expected, call: (reads += 1) }, { polling: 'raf' }).then((handle) => handle.jsonValue());

          assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), `${viewport}: the page can scroll`);
          await page.getByRole('combobox', { name: 'Option' }).focus();
          const start = await page.evaluate(() => window.scrollY);
          // ArrowDown opens the list on the first option; each one after moves to the next, down to the last.
          let read;
          for (let index = 1; index <= 40; index += 1) {
            await page.keyboard.press('ArrowDown');
            read = await settle(`Option ${index}`);
            const step = `${viewport}: ArrowDown to Option ${index}`;
            assert.equal(read.pageScroll, start, `${step} scrolls the page`);
            assert.ok(read.open, `${step} closes the list`);
            assert.equal(read.label, `Option ${index}`, step);
            // Scroll padding as deep as the list's padding stops the focused option at the padding.
            assert.ok(read.top >= read.paddingTop - 1 && read.bottom >= read.paddingBottom - 1, `${step}: the option sits ${read.top}px from the list's top and ${read.bottom}px from its bottom`);
            assert.ok(read.inViewport, `${step}: the option is off screen`);
          }
          assert.ok(read.scrolls, `${viewport}: the list scrolls`);
          assert.ok(read.height <= read.cap + 0.5, `${viewport}: a ${read.height}px list is taller than the ${read.cap}px cap`);
          assert.ok(read.inset >= -0.5, `${viewport}: the popover clips the list by ${-read.inset}px`);
          if (viewport === 'short') assert.ok(read.space < read.cap, `short: React Aria leaves ${read.space}px, not less than the ${read.cap}px cap`);
          assert.ok(Math.abs(read.bottom - read.paddingBottom) <= 1, `${viewport}: the last option sits ${read.bottom}px above the list's end, not its ${read.paddingBottom}px padding`);

          // Enter chooses the last option. Opening the list again scrolls straight to it, and the page stays put.
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => document.querySelector('input[role="combobox"]').getAttribute('aria-expanded') === 'false');
          await page.locator('.muxui-combo-box__trigger').click();
          read = await settle('Option 40');
          assert.equal(read.pageScroll, start, `${viewport}: opening on the chosen option scrolls the page`);
          assert.ok(read.open, `${viewport}: opening on the chosen option closes the list`);
          // Right after opening, React Aria measures the popover with its max-height lifted to the viewport's height.
          // Where the space is shorter than the cap, the list grows for that measure, and WebKit and Firefox clamp its
          // scroll to the taller list, so the chosen option opens below the fold there.
          const clamped = viewport === 'short' && engine !== 'chromium' && `${engine} clamps the list's scroll while React Aria measures the popover at the viewport's height`;
          await t.test(`${viewport}: opening on the chosen option shows it`, { skip: clamped }, () => {
            assert.ok(read.top >= read.paddingTop - 1 && read.bottom >= read.paddingBottom - 1 && read.inViewport, `the chosen option sits ${read.top}px from the list's top and ${read.bottom}px from its bottom`);
          });

          // The mouse wheel scrolls the list back up, and the page stays put.
          const list = page.locator('.muxui-combo-box__list');
          const box = await list.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, -120);
          await page.waitForFunction((end) => document.querySelector('.muxui-combo-box__list').scrollTop < end, read.listScroll);
          read = await settle();
          assert.equal(read.pageScroll, start, `${viewport}: the wheel scrolls the page`);
          assert.ok(read.open, `${viewport}: the wheel closes the list`);
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      }
    } finally {
      if (engineBrowser !== browser) await engineBrowser.close();
    }
  });
}

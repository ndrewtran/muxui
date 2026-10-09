import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof for the Table sort chevron, in light and dark: the sorted
// column shows its direction and flips on activation, an unsorted sortable
// header hints only on hover and keyboard focus, non-sortable headers show
// nothing, a disabled Table hints nothing, and the label never shifts. Runs in
// every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs). The Storybook
// audit owns axe coverage for Table.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Table } from '/src/collections.mjs';

const h = React.createElement;
const columns = [{ id: 'name', label: 'Name', sortable: true, isRowHeader: true }, { id: 'role', label: 'Role', sortable: true }, { id: 'age', label: 'Age' }];
const people = [{ id: 'ada', name: 'Ada', role: 'Engineer', age: 36 }, { id: 'grace', name: 'Grace', role: 'Admiral', age: 85 }, { id: 'kay', name: 'Kay', role: 'Designer', age: 20 }];

function Fixture() {
  const [sort, setSort] = React.useState({ column: 'name', direction: 'ascending' });
  const rows = [...people].sort((a, b) => String(a[sort.column]).localeCompare(String(b[sort.column])) * (sort.direction === 'ascending' ? 1 : -1));
  return h('div', null,
    h(Table, { 'aria-label': 'People', columns, rows, sortDescriptor: sort, onSortChange: setSort }),
    h(Table, { 'aria-label': 'Disabled people', columns, rows: people, disabled: true }));
}
createRoot(document.getElementById('root')).render(h(Fixture));
`;

const page = (url) => pageShell({
  attributes: `data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}" data-muxui-motion="full"`,
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  // WebKit on macOS skips plain buttons in sequential navigation; an explicit tabindex keeps it focusable.
  body: '<button id="before" tabindex="0">Before</button><div id="root"></div>',
  entry: '/table-sort-indicator-entry.mjs',
});

/** Reads one header's chevron and label geometry; runs in the page. */
function readHeader({ table, name }) {
  const header = [...document.querySelector(`[aria-label="${table}"]`).querySelectorAll('[role="columnheader"]')].find((node) => node.textContent === name);
  const content = header.querySelector('.muxui-table-column-content');
  const icon = header.querySelector('.muxui-table-sort-icon');
  const text = [...(content ?? header).childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  const range = document.createRange();
  range.selectNodeContents(text);
  const label = range.getBoundingClientRect();
  const box = header.getBoundingClientRect();
  const style = icon && getComputedStyle(icon);
  // The base chevron points down, so a 180 degree turn means ascending.
  const turned = style && style.transform !== 'none' && new DOMMatrix(style.transform).a < -0.99;
  const iconBox = icon?.getBoundingClientRect();
  return {
    ariaSort: header.getAttribute('aria-sort'),
    hovered: header.hasAttribute('data-hovered'),
    focusVisible: header.hasAttribute('data-focus-visible'),
    hasIcon: icon !== null,
    visible: style?.visibility === 'visible',
    points: !style ? null : turned ? 'up' : 'down',
    color: style?.color ?? null,
    iconSize: iconBox ? [iconBox.width, iconBox.height] : null,
    iconAfterLabel: iconBox ? iconBox.left >= label.right - 0.5 : null,
    geometry: [label.x, label.width, box.x, box.width, box.height],
  };
}

function tokenColor(token) {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** WCAG contrast of each color against a background; runs in the page, where canvas resolves any CSS color. */
function contrastAgainst({ colors, background }) {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const luminance = (css) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const base = luminance(background);
  return colors.map((color) => {
    const [high, low] = [luminance(color), base].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  });
}

for (const engine of browserEngines()) {
  test(`Table sort indicator in ${engine}`, { timeout: 300_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs'],
      pages: { '/table-sort-indicator.html': page },
      modules: { '/table-sort-indicator-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/table-sort-indicator.html`, '[role="columnheader"]');
      for (const scheme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width: 900, height: 600 }, locale: 'en-US' });
        const tab = await context.newPage();
        const errors = [];
        tab.on('pageerror', (error) => errors.push(error.message));
        tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        try {
          await tab.goto(`${url}/table-sort-indicator.html?scheme=${scheme}`, { waitUntil: 'networkidle' });
          await tab.locator('[role="columnheader"]').first().waitFor({ timeout: 15_000 });
          await tab.mouse.move(0, 0);
          const label = (message) => `${engine} ${scheme}: ${message}`;
          const strong = await tab.evaluate(tokenColor, '--muxui-semantic-content-strong');
          const hint = await tab.evaluate(tokenColor, '--muxui-semantic-content-faint');
          // The hint is a lighter-weight cue than the sorted chevron: still perceptible, at most half its contrast.
          const [hintContrast, strongContrast] = await tab.evaluate(contrastAgainst, { colors: [hint, strong], background: await tab.evaluate(tokenColor, '--muxui-semantic-surface-canvas') });
          assert.ok(hintContrast >= 2.9, label(`the hint stays perceptible (${hintContrast.toFixed(2)}:1)`));
          assert.ok(hintContrast <= strongContrast / 2, label(`the hint is lighter than the sorted chevron (${hintContrast.toFixed(2)}:1 against ${strongContrast.toFixed(2)}:1)`));
          // Collect live-region announcements so a sort change can be checked for the column name.
          await tab.evaluate(() => {
            window.__announced = [];
            new MutationObserver((records) => {
              for (const record of records) for (const node of record.addedNodes) if (node.parentElement?.getAttribute('role') === 'log') window.__announced.push(node.textContent);
            }).observe(document.body, { childList: true, subtree: true });
          });

          const read = (name, table = 'People') => tab.evaluate(readHeader, { table, name });
          const people = tab.getByRole('grid', { name: 'People', exact: true });
          const header = (name) => people.getByRole('columnheader', { name, exact: true });
          // The chevron is decorative, so every header keeps its plain text as its accessible name.
          for (const name of ['Name', 'Role', 'Age']) assert.equal(await header(name).count(), 1, label(`${name} header is named by its text alone`));
          const settle = (name, expected, message, table = 'People') => pollUntil(tab, ({ name, expected, table, source }) => {
            const read = new Function(`return (${source})`)();
            const state = read({ table, name });
            return Object.entries(expected).every(([key, value]) => JSON.stringify(state[key]) === JSON.stringify(value));
          }, { name, expected, table, source: readHeader.toString() }, {
            message: label(message),
            report: ({ name, table, source }) => new Function(`return (${source})`)()({ table, name }),
          });

          const announced = (message) => pollUntil(tab, (expected) => window.__announced.includes(expected), message, {
            message: label(`the sort change announces "${message}"`),
            report: () => window.__announced,
          });

          // Rest: the sorted column shows an ascending chevron; the unsorted sortable and plain headers show none.
          const rest = { name: await read('Name'), role: await read('Role'), age: await read('Age') };
          assert.deepEqual([rest.name.ariaSort, rest.name.visible, rest.name.points, rest.name.color], ['ascending', true, 'up', strong], label('sorted column at rest'));
          assert.deepEqual([rest.role.ariaSort, rest.role.hasIcon, rest.role.visible], ['none', true, false], label('unsorted sortable header at rest'));
          assert.deepEqual([rest.age.ariaSort, rest.age.hasIcon], [null, false], label('non-sortable header has no chevron and no aria-sort'));
          for (const state of [rest.name, rest.role]) {
            assert.deepEqual(state.iconSize.map(Math.round), [16, 16], label('chevron uses the small icon size'));
            assert.equal(state.iconAfterLabel, true, label('chevron sits after the label'));
          }
          const sameGeometry = async (name, message) => {
            const now = (await read(name)).geometry;
            now.forEach((value, index) => assert.ok(Math.abs(value - rest[name.toLowerCase()].geometry[index]) < 0.6, label(`${name} ${message}: label and header geometry hold (${JSON.stringify(rest[name.toLowerCase()].geometry)} vs ${JSON.stringify(now)})`)));
          };

          // Pointer hover hints on an unsorted sortable header only.
          await header('Role').hover();
          await settle('Role', { visible: true, points: 'up', color: hint, ariaSort: 'none' }, 'hovering an unsorted sortable header shows the faint ascending hint');
          await sameGeometry('Role', 'hover');
          await header('Age').hover();
          await settle('Role', { visible: false }, 'leaving the header hides the hint');
          assert.equal((await read('Age')).hasIcon, false, label('hovering a non-sortable header shows nothing'));
          await sameGeometry('Age', 'hover');
          await header('Name').hover();
          assert.deepEqual([(await read('Name')).visible, (await read('Name')).color], [true, strong], label('hovering the sorted header keeps its active chevron'));
          await tab.mouse.move(0, 0);

          // Keyboard focus hints the same way, with the pointer parked away.
          await tab.locator('#before').focus();
          await tab.keyboard.press('Tab');
          // Tab lands on the first row; Arrow Up reaches the column headers.
          await tab.keyboard.press('ArrowUp');
          const focused = () => tab.evaluate(() => document.activeElement?.textContent ?? 'none');
          assert.equal(await focused(), 'Name', label('Arrow Up from the first row reaches the first header'));
          for (let step = 0; step < 4 && await focused() !== 'Role'; step++) await tab.keyboard.press('ArrowRight');
          assert.equal(await focused(), 'Role', label('arrow keys reach the Role header'));
          await settle('Role', { focusVisible: true, visible: true, points: 'up', color: hint }, 'keyboard focus on an unsorted sortable header shows the hint');
          await sameGeometry('Role', 'focus');
          await tab.keyboard.press('ArrowRight');
          assert.equal(await focused(), 'Age');
          assert.deepEqual([(await read('Age')).hasIcon, (await read('Role')).visible], [false, false], label('focus on a non-sortable header shows nothing and the hint leaves Role'));
          await tab.keyboard.press('ArrowLeft');

          // Enter and Space sort ascending, then flip; the active column never returns to unsorted.
          await tab.keyboard.press('Enter');
          await settle('Role', { ariaSort: 'ascending', points: 'up', color: strong, visible: true }, 'Enter sorts an unsorted column ascending');
          await settle('Name', { ariaSort: 'none', visible: false }, 'the previously sorted column drops its chevron');
          await announced('sorted by column Role in ascending order');
          await sameGeometry('Role', 'ascending');
          await tab.keyboard.press('Space');
          await settle('Role', { ariaSort: 'descending', points: 'down', color: strong, visible: true }, 'Space flips to descending');
          await announced('sorted by column Role in descending order');
          await sameGeometry('Role', 'descending');
          await tab.keyboard.press('Enter');
          await settle('Role', { ariaSort: 'ascending', points: 'up' }, 'activating again returns to ascending, never to unsorted');
          await tab.keyboard.press('Tab');
          assert.deepEqual([(await read('Role')).visible, (await read('Name')).visible], [true, false], label('leaving the table keeps the sorted chevron and adds no hint'));

          // Pointer activation flips the same way.
          await header('Name').click();
          await settle('Name', { ariaSort: 'ascending', points: 'up', visible: true }, 'a click sorts an unsorted column ascending');
          await header('Name').click();
          await settle('Name', { ariaSort: 'descending', points: 'down', visible: true }, 'a second click flips to descending');
          await sameGeometry('Name', 'after pointer sorting');
          await tab.mouse.move(0, 0);

          // A disabled Table cannot sort, so neither hover nor keyboard-modality focus on its headers hints anything.
          const disabledGrid = tab.getByRole('grid', { name: 'Disabled people', exact: true });
          assert.deepEqual([await people.getAttribute('data-disabled'), await disabledGrid.getAttribute('data-disabled')], [null, 'true'], label('only the disabled Table carries data-disabled'));
          const disabledHeader = disabledGrid.getByRole('columnheader', { name: 'Role', exact: true });
          await disabledHeader.hover();
          await settle('Role', { hovered: true, visible: false }, 'a hovered disabled Table header shows no hint', 'Disabled people');
          await tab.mouse.move(0, 0);
          // A key press puts focus modality on the keyboard; scripted focus then matches a keyboard user reaching the header.
          await tab.keyboard.press('ArrowDown');
          await disabledHeader.focus();
          await settle('Role', { focusVisible: true, visible: false }, 'a keyboard-focused disabled Table header shows no hint', 'Disabled people');
          assert.equal((await read('Name', 'Disabled people')).visible, false, label('an unsorted disabled Table shows no chevron at rest'));

          assert.deepEqual(errors, [], label(`page errors: ${errors.join('\n')}`));
        } finally {
          await context.close();
        }
      }
      // Forced colors replaces author colors, so the chevron must follow the label's system color. Playwright cannot emulate it in WebKit.
      if (engine !== 'webkit') {
        const context = await browser.newContext({ forcedColors: 'active' });
        try {
          const tab = await context.newPage();
          await tab.goto(`${url}/table-sort-indicator.html?scheme=dark`, { waitUntil: 'networkidle' });
          await tab.locator('[role="columnheader"]').first().waitFor({ timeout: 15_000 });
          const colors = await tab.evaluate(() => {
            const header = document.querySelector('[role="columnheader"][aria-sort="ascending"]');
            return [getComputedStyle(header.querySelector('.muxui-table-sort-icon')).color, getComputedStyle(header).color];
          });
          assert.equal(colors[0], colors[1], `${engine} forced colors: the sorted chevron uses the header's system color`);
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}

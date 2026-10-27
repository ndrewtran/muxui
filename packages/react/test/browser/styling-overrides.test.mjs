import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { readStyleRules, whoWinsRows } from '../support/styling-reference.mjs';
import { launchBrowser } from './harness.mjs';

// The What-wins table of the docs "Styling" section is a claim about the cascade. This runs each row against the shipped stylesheet in
// Chromium: 13 cases, a consumer declaration against a Mux declaration of the same property at the author origin, in the layer order
// the row states. Seven rows, with row 3 also run for CSS that loads after Mux and names no order, row 5 and row 6 and row 7 in the
// variants the table names, and one control for the README's own limit: a direct unlayered `background` is not blocked where forced
// colors work through custom properties.
//
// The Mux declarations are found by reading the stylesheet, so a changed rule fails here and not silently:
//   normal      `.muxui-button { border-radius }` in muxui.components
//   !important  `:where([data-muxui-motion='reduced']) :where(.muxui-button, ...) { transition-duration: 0s !important }`
// Each outcome is the computed value compared with two probes taken in the same page: what Mux alone gives, and what the consumer's
// declaration alone gives. A case whose two probes are equal could not tell the winners apart, and fails.
const packageRoot = resolve(import.meta.dirname, '../..');
const css = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
const { rules } = readStyleRules(css);

const normalRule = rules.find(({ selector, chain, declarations }) => selector === '.muxui-button' && chain.length === 1 && chain[0] === '@layer muxui.components'
  && declarations.some(({ property }) => property === 'border-radius'));
const radius = normalRule?.declarations.find(({ property }) => property === 'border-radius');
const adaptation = rules.find(({ selector }) => selector.startsWith(":where([data-muxui-motion='reduced']) :where(.muxui-button,"));
const duration = adaptation?.declarations.find(({ property }) => property === 'transition-duration');
const forced = rules.find(({ selector, chain }) => selector === ':where(.muxui-button, .muxui-toggle-button)' && chain.some((prelude) => /forced-colors/u.test(prelude)));

const STATEMENT = '@layer reset, muxui.tokens, muxui.components, muxui.utilities, app;';
const mux = `<style>${css}</style>`;
const sheet = (text) => `<style>${text}</style>`;

// property: the computed property read; declaration: the consumer's declaration (CSS text); head: the document head after Mux's CSS
// is placed; inline: a style attribute on the button. `row` is the What-wins row the case pins.
const cases = [
  { label: 'row 1: unlayered, normal, against Mux normal', row: 1, property: 'borderTopLeftRadius', css: 'border-radius', value: '1px', head: `${mux}${sheet('.muxui-button { border-radius: 1px }')}` },
  { label: 'row 2: muxui.utilities, normal, against Mux normal', row: 2, property: 'borderTopLeftRadius', css: 'border-radius', value: '1px', head: `${sheet(STATEMENT)}${mux}${sheet('@layer muxui.utilities { .muxui-button { border-radius: 1px } }')}` },
  { label: 'row 3: your layer listed after Mux in your order statement, normal', row: 3, property: 'borderTopLeftRadius', css: 'border-radius', value: '1px', head: `${sheet(STATEMENT)}${mux}${sheet('@layer app { .muxui-button { border-radius: 1px } }')}` },
  { label: 'row 3, late-named: your layer first named after Mux, no order statement, normal', row: 3, property: 'borderTopLeftRadius', css: 'border-radius', value: '1px', head: `${mux}${sheet('@layer app { .muxui-button { border-radius: 1px } }')}` },
  { label: 'row 4: your layer first named before Mux loads, no order statement, normal', row: 4, property: 'borderTopLeftRadius', css: 'border-radius', value: '1px', head: `${sheet('@layer app { .muxui-button { border-radius: 1px } }')}${mux}` },
  { label: 'row 5: unlayered normal against Mux !important', row: 5, property: 'transitionDuration', css: 'transition-duration', value: '1s', head: `${mux}${sheet('.muxui-button { transition-duration: 1s }')}` },
  { label: 'row 5: muxui.utilities normal against Mux !important', row: 5, property: 'transitionDuration', css: 'transition-duration', value: '1s', head: `${sheet(STATEMENT)}${mux}${sheet('@layer muxui.utilities { .muxui-button { transition-duration: 1s } }')}` },
  { label: 'row 6: unlayered !important against Mux !important', row: 6, property: 'transitionDuration', css: 'transition-duration', value: '1s', head: `${mux}${sheet('.muxui-button { transition-duration: 1s !important }')}` },
  { label: 'row 6: muxui.utilities !important against Mux !important', row: 6, property: 'transitionDuration', css: 'transition-duration', value: '1s', head: `${sheet(STATEMENT)}${mux}${sheet('@layer muxui.utilities { .muxui-button { transition-duration: 1s !important } }')}` },
  { label: 'row 6: a layer ranked after Mux, !important, against Mux !important', row: 6, property: 'transitionDuration', css: 'transition-duration', value: '1s', head: `${sheet(STATEMENT)}${mux}${sheet('@layer app { .muxui-button { transition-duration: 1s !important } }')}` },
  { label: 'row 7: a layer ranked before Mux, !important, against Mux !important', row: 7, property: 'transitionDuration', css: 'transition-duration', value: '1s', head: `${sheet(STATEMENT)}${mux}${sheet('@layer reset { .muxui-button { transition-duration: 1s !important } }')}` },
  { label: 'row 7: an inline style !important against Mux !important', row: 7, property: 'transitionDuration', css: 'transition-duration', value: '1s', head: mux, inline: 'transition-duration: 1s !important' },
  // The README's limit: where forced colors work through custom properties, a direct unlayered background is not blocked.
  { label: 'limit: a direct unlayered background under forced colors is not blocked', row: null, property: 'backgroundColor', css: 'background', value: 'red', head: `${mux}${sheet('.muxui-button { background: red }')}`, forcedColors: true },
];

const outcomeOf = (observed, baseline, declared) => (observed === declared ? 'You' : observed === baseline ? 'Mux' : `neither (${observed})`);

test('the What-wins table\'s premises are the shipped stylesheet\'s own rules', () => {
  assert.ok(radius && !radius.important, 'Button\'s border-radius is a normal declaration in muxui.components');
  assert.match(radius.value, /var\(--muxui-component-button-radius/u);
  assert.ok(adaptation && duration, 'the reduced-motion adaptation rule is in the stylesheet');
  assert.deepEqual([duration.value, duration.important], ['0s', true], 'it is !important');
  assert.deepEqual(adaptation.chain, ['@layer muxui.components'], 'in muxui.components, outside any media query');
  assert.ok(forced, 'the forced-colors rule that paints a Button directly is in the stylesheet');
  assert.ok(forced.declarations.some(({ property, important }) => property === 'background' && !important), 'it is a normal declaration of background');
  const custom = rules.find(({ selector, chain }) => selector === '.muxui-button' && chain.some((prelude) => /forced-colors/u.test(prelude)));
  assert.ok(custom.declarations.every(({ property, important }) => property.startsWith('--') && important), 'the property-specific protection works through custom properties');
  assert.equal(cases.length, 13);
  assert.deepEqual([...new Set(cases.map(({ row }) => row).filter(Boolean))].sort(), [1, 2, 3, 4, 5, 6, 7], 'every row of the table has a case');
  assert.equal(whoWinsRows.length, 7);
});

test('each What-wins row is what Chromium does with the shipped stylesheet', { timeout: 120_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const probe = async ({ head, inline = '', forcedColors = false }, property) => {
      await page.emulateMedia({ forcedColors: forcedColors ? 'active' : 'none' });
      await page.setContent(`<!doctype html><html><head>${head}</head><body><div data-muxui-motion="reduced"><button class="muxui-button"${inline ? ` style="${inline}"` : ''}>x</button></div></body></html>`);
      return page.evaluate((name) => getComputedStyle(document.querySelector('.muxui-button'))[name], property);
    };
    // What a declaration gives when nothing else competes, taken from a bare element in the same page.
    const declared = async (css, value) => {
      await page.emulateMedia({ forcedColors: 'none' });
      await page.setContent('<!doctype html><body><span id="p"></span></body>');
      return page.evaluate(([name, text]) => { const node = document.querySelector('#p'); node.style.setProperty(name, text); return getComputedStyle(node).getPropertyValue(name); }, [css, value]);
    };
    const results = [];
    for (const item of cases) {
      const observed = await probe(item, item.property);
      const baseline = await probe({ head: mux, forcedColors: item.forcedColors }, item.property);
      let consumer = await declared(item.css, item.value);
      // Shorthands read back as their longhand: the longhand probe is the consumer's value.
      if (item.css === 'border-radius') consumer = await declared('border-top-left-radius', item.value);
      if (item.css === 'background') consumer = await declared('background-color', item.value);
      assert.notEqual(baseline, consumer, `${item.label}: Mux alone (${baseline}) and the consumer alone (${consumer}) differ, so the winner is readable`);
      const outcome = outcomeOf(observed, baseline, consumer);
      results.push({ label: item.label, row: item.row, outcome, observed, baseline, consumer });
      const row = item.row === null ? null : whoWinsRows[item.row - 1];
      // The README's limit is not a row: the consumer's direct declaration is not blocked.
      const expected = row === null ? 'You' : row.winner === 'Mux' ? 'Mux' : 'You';
      assert.equal(outcome, expected, `${item.label}: ${JSON.stringify({ observed, baseline, consumer })}`);
    }
    // Every row's winner is what its cases show; "You, but do not" is still You in the browser, which is why the table says not to.
    for (const row of whoWinsRows) {
      const shown = new Set(results.filter(({ row: id }) => id === row.id).map(({ outcome }) => outcome));
      assert.deepEqual([...shown], [row.winner === 'Mux' ? 'Mux' : 'You'], `row ${row.id} (${row.winner}) as the browser shows it`);
    }
    // The late-named case is the one the v1 row 4 got wrong: with no order statement, a layer first named after Mux's CSS wins.
    assert.equal(results.find(({ label }) => label.includes('late-named')).outcome, 'You');
    assert.equal(results.find(({ label }) => label.startsWith('row 4')).outcome, 'Mux');
    assert.equal(results.length, 13);
  } finally {
    await browser.close();
  }
});

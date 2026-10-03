import assert from 'node:assert/strict';
import test from 'node:test';
import { assertModeConsistency, modeInconsistencies } from '../src/audit.mjs';
import { resolveProperty } from '../src/css.mjs';
import { MODES, styleContext } from '../src/measure.mjs';
import { tokens } from './support.mjs';

// A canned `CSS.getMatchedStylesForNode` payload, shaped as Chrome returns it.
const LIBRARY = 'packages/react/generated/styles.css';
const sources = new Map([['library', LIBRARY], ['harness', 'harness.css']]);
let line = 0;
function rule(selector, properties, { sheet = 'library', scopes, media, layers } = {}) {
  line += 1;
  return {
    rule: {
      selectorList: { text: selector },
      origin: 'regular',
      styleSheetId: sheet,
      style: { cssProperties: Object.entries(properties).map(([name, value]) => ({ name, value, range: { startLine: line } })), range: { startLine: line } },
      ...(scopes ? { scopes } : {}),
      ...(media ? { media } : {}),
      ...(layers ? { layers } : {}),
    },
  };
}
const theme = rule(':root', Object.fromEntries([...tokens.keys()].map((name) => [name, '#000'])));

function payload(elementRules) {
  return {
    matchedCSSRules: elementRules,
    pseudoElements: [{ pseudoType: 'before', matches: [rule('.muxui-x::before', { 'border-top-color': 'var(--muxui-semantic-focus-ring)' })] }],
    inherited: [
      { matchedCSSRules: [rule('.muxui-parent', { color: 'var(--muxui-semantic-content-strong)' })] },
      { matchedCSSRules: [rule('[data-fixture]', { color: 'red' }, { sheet: 'harness' })], inlineStyle: { cssProperties: [{ name: 'padding', value: '12px', range: {} }] } },
      { matchedCSSRules: [theme, rule("[data-muxui-color-scheme='dark']", { '--muxui-semantic-surface-raised': '#111' })] },
    ],
  };
}

test('matched-styles payloads map to resolver levels with depth, pseudo-elements, and theme blocks', () => {
  const matched = payload([rule('.muxui-x', { 'background-color': 'var(--muxui-semantic-surface-raised)', border: '1px solid' })]);
  const context = styleContext(matched, { depth: 1, sources });
  assert.deepEqual(context.levels.map(({ inside }) => inside), [true, true, false, false]);
  // Theme blocks are not component rules; everything else, inline styles included, is.
  assert.deepEqual(context.levels.map(({ rules }) => rules.map(({ component }) => component)), [[true], [true], [true, true], [false, false]]);
  assert.match(context.levels[0].rules[0].rule, /^\.muxui-x \(packages\/react\/generated\/styles\.css:\d+\)$/u);
  assert.equal(resolveProperty(context, 'background-color', tokens).token, 'semantic.surface.raised');
  // A border without a colour paints currentcolor, the inherited colour token.
  assert.equal(resolveProperty(context, 'border-top-color', tokens).token, 'semantic.content.strong');
  // The pseudo-element's own rules come first, above its element.
  const before = styleContext(matched, { depth: 1, pseudo: 'before', sources });
  assert.equal(before.levels.length, 5);
  assert.equal(resolveProperty(before, 'border-top-color', tokens).token, 'semantic.focus.ring');
  assert.throws(() => styleContext(matched, { depth: 1, pseudo: 'after', sources }), /MUXUI_FIGMA_COMPONENTS_PART_MISSING: part has no ::after/u);
  // A theme selector inside an at-rule or from another stylesheet is an override.
  const scoped = styleContext(payload([rule("[data-muxui-color-scheme='dark']", {}, { media: [{ text: '(min-width: 1px)' }] }), rule(':root', {}, { sheet: 'harness' })]), { depth: 1, sources });
  assert.deepEqual(scoped.levels[0].rules.map(({ component }) => component), [true, true]);
});

test('a measured rule in a cascade layer fails with an unsupported-layer error', () => {
  const layered = payload([rule('.muxui-x', { color: 'red' }, { layers: [{ text: 'components' }] })]);
  assert.throws(() => styleContext(layered, { depth: 1, sources }), /MUXUI_FIGMA_COMPONENTS_LAYER_UNSUPPORTED: \.muxui-x .* sits in cascade layer components/u);
  // A layered rule that sets nothing measured is left out.
  const unmeasured = payload([rule('[data-react-aria-pressable]', { 'touch-action': 'pan-x pan-y pinch-zoom' }, { sheet: 'harness', layers: [{ text: '' }] })]);
  assert.deepEqual(styleContext(unmeasured, { depth: 1, sources }).levels[0].rules, []);
});

test('a dark @scope override of a token custom property fails the mode audit', () => {
  const override = rule(':scope', { '--muxui-semantic-surface-raised': 'var(--muxui-semantic-surface-strong)' }, { scopes: [{ text: '(.muxui-x)' }] });
  const byMode = Object.fromEntries(MODES.map((mode) => {
    const element = [rule('.muxui-x', { 'background-color': 'var(--muxui-semantic-surface-raised)' }), ...(mode.colorScheme === 'dark' ? [override] : [])];
    return [mode.key, resolveProperty(styleContext(payload(element), { depth: 1, sources }), 'background-color', tokens)];
  }));
  const measurements = [{ family: 'synthetic', modes: MODES.map(({ key }) => key), variants: [{ key: 'state=rest', parts: { root: { properties: { 'background-color': byMode } } } }] }];
  const [finding] = modeInconsistencies(measurements);
  assert.match(finding.modes['dark+comfortable'], /^semantic\.surface\.strong by \.muxui-x .* via --muxui-semantic-surface-raised from @scope \(\.muxui-x\) :scope /u);
  assert.throws(() => assertModeConsistency(measurements), /MUXUI_FIGMA_MODE_INCONSISTENT/u);
});

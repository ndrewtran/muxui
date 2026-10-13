import assert from 'node:assert/strict';
import test from 'node:test';
import { assertModeConsistency, modeInconsistencies } from '../src/audit.mjs';
import { resolveProperty } from '../src/css.mjs';
import { MODES, layerOrders, styleContext } from '../src/measure.mjs';
import { tokens } from './support.mjs';

// A canned `CSS.getMatchedStylesForNode` payload, shaped as Chrome returns it.
const LIBRARY = 'packages/react/generated/styles.css';
const sources = new Map([['library', LIBRARY], ['harness', 'harness.css']]);
let line = 0;
// `important` is true, or the priority annotation as written (Chrome keeps it in the value text).
function rule(selector, properties, { sheet = 'library', origin = 'regular', scopes, media, layers, important = false } = {}) {
  line += 1;
  return {
    rule: {
      selectorList: { text: selector },
      origin,
      styleSheetId: sheet,
      style: { cssProperties: Object.entries(properties).map(([name, value]) => ({ name, value: important ? `${value}${important === true ? ' !important' : important}` : value, ...(important ? { important: true } : {}), range: { startLine: line } })), range: { startLine: line } },
      ...(scopes ? { scopes } : {}),
      ...(media ? { media } : {}),
      // Chrome lists a rule's layers outermost first; `layers` takes their names.
      layers: (layers ?? []).map((text) => ({ text })),
    },
  };
}
const themeProperties = Object.fromEntries([...tokens.keys()].map((name) => [name, '#000']));
const theme = rule(':root', themeProperties);

// The page's `CSS.getLayersForNode` tree for the library's layers plus one anonymous layer.
const layerTree = {
  name: 'implicit outer layer',
  order: 5,
  subLayers: [
    { name: 'muxui', order: 3, subLayers: [{ name: 'tokens', order: 0 }, { name: 'components', order: 1 }, { name: 'utilities', order: 2 }] },
    { name: '', order: 4 },
  ],
};
const layers = layerOrders(layerTree);

function payload(elementRules, themeRule = theme) {
  return {
    matchedCSSRules: elementRules,
    pseudoElements: [{ pseudoType: 'before', matches: [rule('.muxui-x::before', { 'border-top-color': 'var(--muxui-semantic-focus-ring)' })] }],
    inherited: [
      { matchedCSSRules: [rule('.muxui-parent', { color: 'var(--muxui-semantic-content-strong)' })] },
      { matchedCSSRules: [rule('[data-fixture]', { color: 'red' }, { sheet: 'harness' })], inlineStyle: { cssProperties: [{ name: 'padding', value: '12px', range: {} }] } },
      { matchedCSSRules: [themeRule, rule("[data-muxui-color-scheme='dark']", { '--muxui-semantic-surface-raised': '#111' })] },
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

test('layer orders come from the page tree: dotted paths, sublayers first, anonymous layers left out', () => {
  assert.deepEqual(Object.fromEntries(layers), { muxui: 3, 'muxui.tokens': 0, 'muxui.components': 1, 'muxui.utilities': 2 });
});

test('layered rules take their cascade order from the page tree, and the resolver ranks them', () => {
  const matched = payload([
    rule('button', { 'background-color': 'buttonface' }, { origin: 'user-agent' }),
    rule('.muxui-x', { 'background-color': 'var(--muxui-semantic-surface-raised)', color: 'var(--muxui-semantic-content-strong)', width: '10px' }, { layers: ['muxui.components'] }),
    rule('.muxui-x.muxui-x', { color: 'var(--muxui-semantic-focus-ring)' }, { layers: ['muxui', 'components'] }),
    rule('.consumer', { width: '20px' }, { sheet: 'harness' }),
  ]);
  const context = styleContext(matched, { depth: 1, sources, layers });
  // The user-agent origin is marked, and an unlayered rule carries no layer.
  assert.deepEqual(context.levels[0].rules.map((entry) => entry.layer), [undefined, 1, 1, undefined]);
  assert.deepEqual(context.levels[0].rules.map((entry) => entry.userAgent), [true, undefined, undefined, undefined]);
  // An author layer beats the user agent; a later rule in the same layer beats an earlier one, however the layer is spelled.
  assert.equal(resolveProperty(context, 'background-color', tokens).token, 'semantic.surface.raised');
  assert.equal(resolveProperty(context, 'color', tokens).token, 'semantic.focus.ring');
  // An unlayered rule beats a layered one without specificity.
  const width = resolveProperty(context, 'width', tokens);
  assert.deepEqual([width.value, width.rule.split(' (')[0]], ['20px', '.consumer']);

  // For !important the order reverses: the earliest layer wins and unlayered rules lose.
  const important = styleContext(payload([
    rule('.muxui-x', { color: 'var(--muxui-semantic-focus-ring)' }, { layers: ['muxui.tokens'], important: true }),
    rule('.muxui-x', { color: 'var(--muxui-semantic-focus-inner)' }, { layers: ['muxui.components'], important: true }),
    rule('.consumer', { color: 'var(--muxui-semantic-content-strong)' }, { sheet: 'harness', important: true }),
  ]), { depth: 1, sources, layers });
  assert.equal(resolveProperty(important, 'color', tokens).token, 'semantic.focus.ring');
});

test('a generated theme block in the muxui.tokens layer is a theme rule; other layered :root rules are overrides', () => {
  const token = { '--muxui-semantic-surface-raised': '#111' };
  const components = (...entries) => styleContext(payload(entries), { depth: 1, sources, layers }).levels[0].rules.map(({ component }) => component);
  assert.deepEqual(components(
    rule(':root', token, { layers: ['muxui.tokens'] }),
    rule(':root', token, { layers: ['muxui', 'tokens'] }),
    rule("[data-muxui-color-scheme='dark']", token, { layers: ['muxui.tokens'] }),
    rule(':root', token, { layers: ['muxui.components'] }),
    rule(':root', token, { layers: ['muxui.tokens'], sheet: 'harness' }),
    rule(':root', token, { layers: ['muxui.tokens'], media: [{ text: '(min-width: 1px)' }] }),
  ), [false, false, false, true, true, true]);

  // Tokens resolve to the theme when the whole theme sits in muxui.tokens.
  const layeredTheme = rule(':root', themeProperties, { layers: ['muxui.tokens'] });
  const context = styleContext(payload([rule('.muxui-x', { 'background-color': 'var(--muxui-semantic-surface-raised)' }, { layers: ['muxui.components'] })], layeredTheme), { depth: 1, sources, layers });
  assert.equal(resolveProperty(context, 'background-color', tokens).token, 'semantic.surface.raised');
});

test('a layered rule the page cannot order fails loudly unless it sets nothing measured', () => {
  const anonymous = payload([rule('.muxui-x', { color: 'red' }, { layers: [''] })]);
  assert.throws(() => styleContext(anonymous, { depth: 1, sources, layers }), /MUXUI_FIGMA_COMPONENTS_LAYER_UNORDERED: \.muxui-x .* sits in cascade layer \(anonymous\)/u);
  const unlisted = payload([rule('.muxui-x', { color: 'red' }, { layers: ['vendor', 'reset'] })]);
  assert.throws(() => styleContext(unlisted, { depth: 1, sources, layers }), /MUXUI_FIGMA_COMPONENTS_LAYER_UNORDERED: .* sits in cascade layer vendor > reset/u);
  // Without the page's layer tree no layer can be ordered.
  const named = payload([rule('.muxui-x', { color: 'red' }, { layers: ['muxui.components'] })]);
  assert.throws(() => styleContext(named, { depth: 1, sources }), /MUXUI_FIGMA_COMPONENTS_LAYER_UNORDERED/u);
  // React Aria's injected anonymous-layer rule sets nothing measured, so it is left out.
  const unmeasured = payload([rule('[data-react-aria-pressable]', { 'touch-action': 'pan-x pan-y pinch-zoom' }, { sheet: 'harness', layers: [''] })]);
  assert.deepEqual(styleContext(unmeasured, { depth: 1, sources, layers }).levels[0].rules, []);
});

test('a layer path that also names a different layer when read in reverse fails as ambiguous', () => {
  // `@layer a.b, b.a;` leaves the order Chrome lists nested layers in undecidable from names alone.
  const collision = layerOrders({ subLayers: [{ name: 'a', order: 2, subLayers: [{ name: 'b', order: 0 }] }, { name: 'b', order: 3, subLayers: [{ name: 'a', order: 1 }] }] });
  const layer = (...names) => styleContext(payload([rule('.muxui-x', { color: 'red' }, { layers: names })]), { depth: 1, sources, layers: collision }).levels[0].rules[0].layer;
  assert.throws(() => layer('a', 'b'), /MUXUI_FIGMA_COMPONENTS_LAYER_AMBIGUOUS: \.muxui-x .* sits in cascade layer a > b, which names two layers .*a\.b and b\.a/u);
  // One dotted name has no other reading, and a path whose reverse is not a layer is unambiguous.
  assert.equal(layer('a.b'), 0);
  assert.equal(layer('b.a'), 1);
  assert.equal(layer('a'), 2);
  assert.equal(styleContext(payload([rule('.muxui-x', { color: 'red' }, { layers: ['muxui', 'components'] })]), { depth: 1, sources, layers }).levels[0].rules[0].layer, 1);
});

test('the priority annotation is stripped from important declarations only, in any spelling', () => {
  const fontFamily = (value, important) => resolveProperty(styleContext(payload([rule('.muxui-x', { 'font-family': value }, { important })]), { depth: 1, sources }), 'font-family', tokens).value;
  for (const annotation of [true, ' !IMPORTANT', ' ! important', ' !/**/important', ' !/* a */ /* b */important', ' !important /* trail */', '   !important   ']) {
    assert.equal(fontFamily('serif', annotation), 'serif', JSON.stringify(annotation));
  }
  // `\!important` is an escaped identifier: a normal declaration keeps it, and an important one keeps it too.
  assert.equal(fontFamily('\\!important'), '\\!important');
  assert.equal(fontFamily('\\!important', true), '\\!important');
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

import assert from 'node:assert/strict';
import test from 'node:test';
import button from '../src/anatomy/button.mjs';
import { loadAnatomySources, resolveAnatomy } from '../src/anatomy.mjs';
import { modeInconsistencies } from '../src/audit.mjs';
import { planComponentBatches } from '../src/batches.mjs';
import { resolveProperty } from '../src/css.mjs';
import { layerOrders, loadTokenSource, measureFamilies, styleContext } from '../src/measure.mjs';
import { launchBrowser } from '../src/render.mjs';
import { bindingCoverageErrors, compileComponentSpec } from '../src/spec.mjs';
import { applyAll, createFakeFigma } from './fake-figma.mjs';

// Opt-in, unlike the repository's other browser checks, which find an installed
// Chrome and fail without one: this runs only when MUXUI_CHROME_EXECUTABLE is set.
test('Button measures mode-consistently in Chrome and applies idempotently', { skip: !process.env.MUXUI_CHROME_EXECUTABLE, timeout: 180_000 }, async () => {
  const resolved = resolveAnatomy(button, await loadAnatomySources(button));
  const measurements = await measureFamilies([resolved]);
  assert.deepEqual(modeInconsistencies(measurements), []);
  const rest = measurements[0].variants.find(({ key }) => key === 'variant=primary,size=md,state=rest');
  const fill = rest.parts.root.properties['background-color'];
  assert.deepEqual(Object.values(fill).map(({ kind, token }) => `${kind}:${token}`), Array(4).fill('token:semantic.selection.track'));
  assert.match(fill['dark+compact'].rule, /\.muxui-button.*\(packages\/react\/generated\/styles\.css:\d+\)$/u);

  const { source } = await loadTokenSource();
  const spec = compileComponentSpec({ resolvedFamilies: [resolved], measurements, source });
  assert.deepEqual(bindingCoverageErrors(spec), []);
  const { figma, state } = createFakeFigma(source);
  const plan = planComponentBatches(spec);
  const first = await applyAll(figma, plan);
  assert.deepEqual([first.errors, first.orphans], [[], []]);
  const writes = state.writes;
  const second = await applyAll(figma, plan);
  assert.deepEqual([second.created, second.updated, state.writes], [0, 0, writes]);
});

// Chrome's own cascade is the reference for the layer and origin model. The
// layer order is declared before the blocks and one layer is nested. Each
// winner differs by rule: normal color from the later layer, important width
// from the earlier, height from the unlayered rule over both, min-width from
// the style attribute over layered and unlayered important rules, and an
// autofilled input's background from the important user-agent rule over its
// important style attribute. An important font-family keeps its escaped and
// commented value text.
test('layered rules resolve as Chrome cascades them', { skip: !process.env.MUXUI_CHROME_EXECUTABLE, timeout: 60_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    const sources = new Map();
    cdp.on('CSS.styleSheetAdded', ({ header }) => sources.set(header.styleSheetId, 'page.css'));
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await page.setContent(`<style>
@layer lib.tokens, lib.components;
@layer lib.components { #t { color: rgb(0, 0, 2); width: 20px !important; height: 2px; min-width: 8px !important; } }
@layer lib { @layer tokens { #t { color: rgb(0, 0, 1); width: 10px !important; height: 1px; min-width: 7px !important; } } }
#t { height: 3px; min-width: 9px !important; font-family: \\!important /* keep */ serif !important /* tail */; }
</style><div id="t" style="min-width: 6px !important"></div><input id="i" style="background-color: rgb(1, 2, 3) !important">`);
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const query = async (selector) => (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })).nodeId;
    const layers = layerOrders((await cdp.send('CSS.getLayersForNode', { nodeId: await query('html') })).rootLayer);
    const measure = async (selector, longhands) => {
      const nodeId = await query(selector);
      const context = styleContext(await cdp.send('CSS.getMatchedStylesForNode', { nodeId }), { depth: 0, sources, layers });
      const computed = await page.evaluate(({ selector, names }) => Object.fromEntries(names.map((name) => [name, getComputedStyle(document.querySelector(selector)).getPropertyValue(name)])), { selector, names: longhands });
      return { context, computed, resolved: Object.fromEntries(longhands.map((name) => [name, resolveProperty(context, name, new Map())])) };
    };

    const element = await measure('#t', ['color', 'width', 'height', 'min-width']);
    assert.deepEqual(element.computed, { color: 'rgb(0, 0, 2)', width: '10px', height: '3px', 'min-width': '6px' });
    assert.deepEqual(Object.fromEntries(Object.entries(element.resolved).map(([name, { value }]) => [name, value])), element.computed);

    // Only the trailing annotation leaves the value; the escaped `\!important` before it is part of the family name.
    const family = await measure('#t', ['font-family']);
    assert.equal(family.computed['font-family'], '"!important serif"');
    assert.equal(family.resolved['font-family'].value, '\\!important /* keep */ serif');

    await cdp.send('CSS.forcePseudoState', { nodeId: await query('#i'), forcedPseudoClasses: ['autofill'] });
    const input = await measure('#i', ['background-color']);
    assert.equal(input.computed['background-color'], 'rgb(232, 240, 254)');
    assert.match(input.resolved['background-color'].rule, /\(user-agent\)$/u);
  } finally {
    await browser.close();
  }
});

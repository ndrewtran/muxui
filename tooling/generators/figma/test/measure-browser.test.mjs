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

// Chrome's own cascade is the reference for the layer model: the layer order is
// declared before the blocks, one layer is nested, and each winner differs by
// rule: normal color from the later layer, important width from the earlier,
// and height from the unlayered rule over both.
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
@layer lib.components { #t { color: rgb(0, 0, 2); width: 20px !important; height: 2px; } }
@layer lib { @layer tokens { #t { color: rgb(0, 0, 1); width: 10px !important; height: 1px; } } }
#t { height: 3px; }
</style><div id="t"></div>`);
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const query = async (selector) => (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })).nodeId;
    const layers = layerOrders((await cdp.send('CSS.getLayersForNode', { nodeId: await query('html') })).rootLayer);
    const context = styleContext(await cdp.send('CSS.getMatchedStylesForNode', { nodeId: await query('#t') }), { depth: 0, sources, layers });
    const longhands = ['color', 'width', 'height'];
    const computed = await page.evaluate((names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(document.getElementById('t')).getPropertyValue(name)])), longhands);
    assert.deepEqual(computed, { color: 'rgb(0, 0, 2)', width: '10px', height: '3px' });
    assert.deepEqual(Object.fromEntries(longhands.map((name) => [name, resolveProperty(context, name, new Map()).value])), computed);
  } finally {
    await browser.close();
  }
});

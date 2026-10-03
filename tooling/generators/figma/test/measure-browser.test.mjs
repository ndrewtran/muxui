import assert from 'node:assert/strict';
import test from 'node:test';
import button from '../src/anatomy/button.mjs';
import { loadAnatomySources, resolveAnatomy } from '../src/anatomy.mjs';
import { modeInconsistencies } from '../src/audit.mjs';
import { planComponentBatches } from '../src/batches.mjs';
import { loadTokenSource, measureFamilies } from '../src/measure.mjs';
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

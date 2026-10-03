import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from '@muxui/schema';
import { resolveAnatomy } from '../src/anatomy.mjs';
import { applyComponentBatch } from '../src/applier.mjs';
import { internSubtrees, planComponentBatches } from '../src/batches.mjs';
import { loadTokenSource } from '../src/measure.mjs';
import { bindingCoverageErrors, compileComponentSpec } from '../src/spec.mjs';
import { catalogRecord, reactTypes, syntheticAnatomy, syntheticMeasurement } from './support.mjs';

const { source } = await loadTokenSource();
const resolved = resolveAnatomy(syntheticAnatomy(), { catalogRecord, reactTypes });
const measurement = syntheticMeasurement(resolved);
const spec = compileComponentSpec({ resolvedFamilies: [resolved], measurements: [measurement], source });

function reorderKeys(value) {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorderKeys(item)]));
}

test('the spec is deterministic and independent of measurement key order', () => {
  const again = compileComponentSpec({ resolvedFamilies: [resolved], measurements: [reorderKeys(measurement)], source });
  assert.equal(canonicalJson(again), canonicalJson(spec));
  assert.equal(canonicalJson(planComponentBatches(again)), canonicalJson(planComponentBatches(spec)));
  assert.match(spec.provenance.specDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.doesNotMatch(JSON.stringify(spec), /20\d\d-\d\d-\d\dT/u);
});

test('the spec binds by token ID and reports every literal, derived, or lossy field', () => {
  const [family] = spec.families;
  assert.deepEqual(family.properties, [{ name: 'Variant', values: ['primary', 'ghost'] }, { name: 'State', values: ['rest', 'hover', 'focus-visible', 'disabled'] }]);
  const node = (key) => family.variants.find((variant) => variant.key === key).node;
  assert.deepEqual(node('variant=primary,state=rest').fills, [{ token: 'semantic.selection.track' }]);
  assert.deepEqual(node('variant=primary,state=rest').effects, { style: 'semantic.elevation.control' });
  // Figma paint order: the CSS top layer (the 2px inner ring) comes last.
  assert.deepEqual(node('variant=primary,state=focus-visible').effects.map(({ spread, color }) => [spread, color.token]), [[4, 'semantic.focus.ring'], [2, 'semantic.focus.inner']]);
  // A fill-less ring becomes outset stroke frames, one 2px band per layer.
  const ghostFocus = node('variant=ghost,state=focus-visible');
  assert.equal(ghostFocus.effects, undefined);
  assert.deepEqual(ghostFocus.children.filter(({ name }) => name === 'focus-ring').map(({ layout, strokes, strokeWeights, radius }) => [layout.placement, layout.outset, strokes[0].token, strokeWeights.top, radius.value]), [['outset', 2, 'semantic.focus.inner', 2, 10], ['outset', 4, 'semantic.focus.ring', 2, 12]]);
  const hover = node('variant=ghost,state=hover');
  assert.deepEqual([hover.fills, hover.children[0].fills, hover.children[0].opacity], [[], [{ token: 'semantic.surface.strong' }], { value: 0.08 }]);
  // Opacity carries on every part kind, text included.
  const disabled = node('variant=primary,state=disabled');
  assert.deepEqual([disabled.opacity, disabled.children.find(({ part }) => part === 'label').opacity], [{ value: 0.45 }, { value: 0.45 }]);
  assert.equal(node('variant=primary,state=rest').children.find(({ part }) => part === 'label').opacity, undefined);
  assert.deepEqual(bindingCoverageErrors(spec), []);
  const exceptions = spec.coverage.button.exceptions.map(({ part, field, status }) => `${part} ${field} ${status}`);
  assert.ok(exceptions.includes('root opacity literal'));
  assert.ok(exceptions.includes('root paddingTop derived'));
  assert.ok(exceptions.includes('label text.lineHeight literal'));
  assert.ok(exceptions.includes('label opacity literal'));
  assert.ok(exceptions.includes('icon width literal'));

  // An unbound painted colour fails binding coverage; a mode difference fails compilation.
  const literalFill = syntheticMeasurement(resolved, (variant, part, longhand) => (part === 'root' && longhand === 'background-color' && variant.axes.variant === 'primary'
    ? { kind: 'literal', value: 'red', computed: 'rgb(255, 0, 0)', rule: '.muxui-button' } : undefined));
  assert.deepEqual(bindingCoverageErrors(compileComponentSpec({ resolvedFamilies: [resolved], measurements: [literalFill], source })).map(({ part, field }) => `${part} ${field}`), ['root fills']);
  // A part measured on its parent's element does not repeat the parent's layer opacity.
  const shared = syntheticAnatomy();
  shared.parts[2] = { ...shared.parts[2], selector: '.muxui-button' };
  const sharedResolved = resolveAnatomy(shared, { catalogRecord, reactTypes });
  const sharedSpec = compileComponentSpec({ resolvedFamilies: [sharedResolved], measurements: [syntheticMeasurement(sharedResolved)], source });
  const sharedLabel = sharedSpec.families[0].variants.find(({ key }) => key === 'variant=primary,state=disabled').node.children.find(({ part }) => part === 'label');
  assert.equal(sharedLabel.opacity, undefined);
  assert.ok(sharedSpec.coverage.button.exceptions.some(({ part, field, status }) => `${part} ${field} ${status}` === 'label opacity derived'));
  const darkOverride = syntheticMeasurement(resolved, (variant, part, longhand, mode) => (part === 'label' && longhand === 'color' && mode.startsWith('dark') ? { kind: 'token', token: 'semantic.content.strong', rule: '@scope dark .muxui-button' } : undefined));
  assert.throws(() => compileComponentSpec({ resolvedFamilies: [resolved], measurements: [darkOverride], source }), /MUXUI_FIGMA_MODE_INCONSISTENT/u);
});

test('unresolved text, glyph, and stroke paints are unbound; only backgrounds may be empty', () => {
  const primaryRest = (variant) => variant.key === 'variant=primary,state=rest';
  const compiled = (override) => compileComponentSpec({ resolvedFamilies: [resolved], measurements: [syntheticMeasurement(resolved, (variant, part, longhand) => (primaryRest(variant) ? override[`${part} ${longhand}`] : undefined))], source });
  const border = (color) => Object.fromEntries(['top', 'right', 'bottom', 'left'].flatMap((side) => [
    [`root border-${side}-style`, { kind: 'literal', value: 'solid' }],
    [`root border-${side}-width`, { kind: 'literal', value: '1px' }],
    [`root border-${side}-color`, color],
  ]));
  const unbound = compiled({
    'label color': { kind: 'none' },
    'icon color': { kind: 'outside', rule: 'body (harness.css:1)' },
    'root background-color': { kind: 'none' },
    ...border({ kind: 'none' }),
  });
  assert.deepEqual(bindingCoverageErrors(unbound).map(({ part, field, value }) => [part, field, value ?? null]), [
    ['icon', 'glyph.strokes', 'body (harness.css:1)'],
    ['label', 'text.fills', null],
    ['root', 'strokes', null],
  ]);
  const node = unbound.families[0].variants.find(({ key }) => key === 'variant=primary,state=rest').node;
  assert.deepEqual(node.fills, []);

  // A plain token overlay paints at full opacity; a mixed stroke keeps its percent on the bound paint.
  const painted = compiled({
    'root background-image': { kind: 'overlay', paint: { kind: 'token', token: 'semantic.surface.strong' }, rule: '.muxui-button' },
    ...border({ kind: 'mix', token: 'semantic.focus.ring', percent: 40 }),
  });
  assert.deepEqual(bindingCoverageErrors(painted), []);
  const root = painted.families[0].variants.find(({ key }) => key === 'variant=primary,state=rest').node;
  assert.deepEqual(root.children[0], { part: 'root-overlay', type: 'FRAME', name: 'overlay', layout: { mode: 'NONE', positioning: 'ABSOLUTE', placement: 'fill' }, fills: [{ token: 'semantic.surface.strong' }], opacity: { value: 1 }, radius: root.radius });
  assert.deepEqual(root.strokes, [{ token: 'semantic.focus.ring', opacity: 0.4 }]);
});

test('batches fit the byte budget, lead with glyphs, and end with the orphan check and preview', () => {
  for (const budgetBytes of [40_000, 34_000]) {
    const plan = planComponentBatches(spec, { budgetBytes });
    const seen = [];
    for (const { bytes, script } of plan) {
      assert.ok(bytes <= budgetBytes && new TextEncoder().encode(script).length === bytes);
      const payload = JSON.parse(/^const payload = (.*);$/mu.exec(script)[1]);
      seen.push(...payload.sets.flatMap((set) => set.variants.map((variant) => (variant.$ === undefined ? variant.id : payload.defs[variant.$].id))));
    }
    assert.equal(plan[0].glyphs, 1);
    assert.deepEqual(plan[0].variants, {});
    assert.deepEqual(plan.slice(-2).map(({ orphanCheck, preview }) => [orphanCheck, preview]), [[true, false], [false, true]]);
    assert.deepEqual(seen, spec.families[0].variants.map(({ id }) => id));
  }
  assert.throws(() => planComponentBatches(spec, { budgetBytes: 12_000 }), /MUXUI_FIGMA_COMPONENTS_BATCH_ITEM_TOO_LARGE/u);
  assert.doesNotMatch(applyComponentBatch.toString(), /\?\.|\?\?|\.\.\.|=>/u);
  const { defs, value } = internSubtrees({ a: [{ long: 'repeated-subtree-value' }, { long: 'repeated-subtree-value' }] });
  assert.deepEqual([defs, value], [[{ long: 'repeated-subtree-value' }], { a: [{ $: 0 }, { $: 0 }] }]);
});

test('asymmetric corners bind per corner, and a fluid root takes the anatomy preview width', () => {
  const corners = { 'border-top-left-radius': '8px', 'border-top-right-radius': '8px', 'border-bottom-right-radius': '0', 'border-bottom-left-radius': '2px' };
  const asymmetric = syntheticMeasurement(resolved, (variant, part, longhand) => (part === 'root' && corners[longhand] ? { kind: 'literal', value: corners[longhand], rule: '.muxui-button' } : undefined));
  const compiled = compileComponentSpec({ resolvedFamilies: [resolved], measurements: [asymmetric], source });
  const root = compiled.families[0].variants[0].node;
  assert.deepEqual([root.radius, root.radii], [undefined, { topLeft: { value: 8 }, topRight: { value: 8 }, bottomRight: { value: 0 }, bottomLeft: { value: 2 } }]);
  assert.ok(compiled.coverage.button.exceptions.some(({ part, field }) => part === 'root' && field === 'bottomLeftRadius'));

  const fluid = (variant, part, longhand) => (part === 'root' && longhand === 'width' ? { kind: 'literal', value: '100%', computed: '206.781px', rule: '.muxui-button' } : undefined);
  assert.throws(() => compileComponentSpec({ resolvedFamilies: [resolved], measurements: [syntheticMeasurement(resolved, fluid)], source }), /MUXUI_FIGMA_COMPONENTS_FLUID_WIDTH: button root/u);
  const declared = syntheticAnatomy();
  declared.parts[0].layout = { ...declared.parts[0].layout, previewWidth: 208 };
  const declaredResolved = resolveAnatomy(declared, { catalogRecord, reactTypes });
  const preview = compileComponentSpec({ resolvedFamilies: [declaredResolved], measurements: [syntheticMeasurement(declaredResolved, fluid)], source });
  assert.deepEqual(preview.families[0].variants[0].node.width, { value: 208 });
  assert.ok(preview.coverage.button.exceptions.some(({ field, value, reason }) => field === 'width' && value === '208px' && /fills its container/u.test(reason)));
});

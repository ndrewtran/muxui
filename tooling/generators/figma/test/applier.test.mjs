import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAnatomy } from '../src/anatomy.mjs';
import { planComponentBatches } from '../src/batches.mjs';
import { loadTokenSource } from '../src/measure.mjs';
import { compileComponentSpec } from '../src/spec.mjs';
import { applyAll, createFakeFigma } from './fake-figma.mjs';
import { catalogRecord, reactTypes, syntheticAnatomy, syntheticMeasurement } from './support.mjs';

const { source } = await loadTokenSource();
const resolved = resolveAnatomy(syntheticAnatomy(), { catalogRecord, reactTypes });
const spec = compileComponentSpec({ resolvedFamilies: [resolved], measurements: [syntheticMeasurement(resolved)], source });

const byTag = (root, id) => root.findAll((node) => node.getSharedPluginData('muxui', 'id') === id)[0];

test('applier creates, then no-ops, updates a changed binding, and reports a removed variant without deleting', async () => {
  const { figma, state, pages, untouched, variableId } = createFakeFigma(source);
  const plan = planComponentBatches(spec);
  const first = await applyAll(figma, plan);
  // The new set's first placement on the canvas is its only layout update.
  assert.deepEqual([first.errors, first.orphans, first.updatedIds], [[], [], ['layout:component-set:button']]);
  assert.ok(first.created > spec.families[0].variants.length);

  const page = pages.find((candidate) => candidate.getSharedPluginData('muxui', 'id') === 'page:components');
  assert.equal(page.name, 'Components');
  assert.deepEqual([...state.createdOn], ['Components']);
  assert.deepEqual([pages[0].children.length, pages[1].children], [0, [untouched]]);
  const set = byTag(page, 'component-set:button');
  assert.equal(set.children.length, spec.families[0].variants.length);
  const primary = byTag(page, 'component:button/variant=primary,state=rest');
  assert.equal(primary.name, 'Variant=primary, State=rest');
  assert.equal(primary.fills[0].boundVariables.color.id, variableId('semantic.selection.track'));
  assert.equal(primary.boundVariables.minHeight.id, variableId('component.button.min-height'));
  const label = byTag(page, 'component:button/variant=primary,state=rest/label');
  assert.deepEqual([label.characters, label.boundVariables.fontSize.id, label.opacity], ['Button', variableId('semantic.typography.label-m-font-size'), 1]);
  assert.equal(byTag(page, 'component:button/variant=primary,state=disabled/label').opacity, 0.45);
  const focus = byTag(page, 'component:button/variant=primary,state=focus-visible');
  assert.deepEqual(focus.effects.map(({ spread, boundVariables }) => [spread, boundVariables.color.id]), [[4, variableId('semantic.focus.ring')], [2, variableId('semantic.focus.inner')]]);
  assert.equal(focus.clipsContent, true);
  const ring = byTag(page, 'component:button/variant=ghost,state=focus-visible/root-ring-2');
  assert.deepEqual([ring.layoutPositioning, ring.x, ring.width - ring.parent.width, ring.strokes[0].boundVariables.color.id], ['ABSOLUTE', -4, 8, variableId('semantic.focus.ring')]);
  assert.deepEqual(byTag(page, 'glyph:lucide-check').fills, []);
  const icon = byTag(page, 'component:button/variant=primary,state=rest/icon');
  assert.equal(icon.type, 'INSTANCE');
  assert.equal(icon.children[0].strokes[0].boundVariables.color.id, variableId('semantic.action.foreground'));

  const row = byTag(page, 'preview:button/Dark');
  assert.deepEqual(Object.values(row.explicitVariableModes), ['semantic-color:1', 'semantic-dimension:0']);
  assert.deepEqual(row.children.map((instance) => instance.mainComponent.name), ['Variant=primary, State=rest', 'Variant=ghost, State=focus-visible']);

  const writes = state.writes;
  const second = await applyAll(figma, plan);
  assert.deepEqual([second.created, second.updated, second.errors, second.orphans, state.writes], [0, 0, [], [], writes]);

  // Layout counts: a moved variant or set is an update; float drift within tolerance is not.
  primary.x += 10;
  byTag(page, 'component-set:button').y += 0.001;
  const moved = await applyAll(figma, plan);
  assert.deepEqual([moved.created, moved.updated, moved.updatedIds, moved.errors], [0, 1, ['layout:component-set:button'], []]);
  const settled = await applyAll(figma, plan);
  assert.deepEqual([settled.created, settled.updated], [0, 0]);

  const changed = structuredClone(spec);
  changed.families[0].variants[0].node.fills = [{ token: 'semantic.surface.strong' }];
  const third = await applyAll(figma, planComponentBatches(changed));
  assert.deepEqual([third.created, third.updated, third.errors], [0, 1, []]);
  assert.equal(primary.fills[0].boundVariables.color.id, variableId('semantic.surface.strong'));

  const removed = structuredClone(changed);
  removed.families[0].variants = removed.families[0].variants.filter(({ key }) => key !== 'variant=ghost,state=disabled');
  const fourth = await applyAll(figma, planComponentBatches(removed));
  assert.deepEqual([fourth.created, fourth.updated, fourth.orphans], [0, 0, ['component:button/variant=ghost,state=disabled']]);
  assert.equal(state.removes, 0);
  assert.equal(set.children.length, spec.families[0].variants.length);
});

test('applier refuses protected pages and leaves untagged children in place', async () => {
  const guarded = createFakeFigma(source);
  guarded.pages[1].setSharedPluginData('muxui', 'id', 'page:components');
  const refused = await applyAll(guarded.figma, planComponentBatches(spec).slice(0, 1));
  assert.match(refused.errors[0].message, /refusing to write to protected page Pilot components/u);
  assert.deepEqual([refused.created, guarded.pages[1].children], [0, [guarded.untouched]]);

  const { figma, state, pages } = createFakeFigma(source);
  const plan = planComponentBatches(spec);
  await applyAll(figma, plan);
  const variant = byTag(pages[2], 'component:button/variant=primary,state=rest');
  const extra = figma.createFrame();
  variant.appendChild(extra);
  const rerun = await applyAll(figma, plan);
  assert.deepEqual([rerun.created, rerun.updated, rerun.errors, state.removes], [0, 0, [], 0]);
  assert.ok(variant.children.includes(extra));
});

// Writes `run` makes to each of `nodes`, so a test can require zero.
async function writesDuring(state, nodes, run) {
  const before = nodes.map(({ id }) => state.nodeWrites.get(id) ?? 0);
  const result = await run();
  return { result, writes: nodes.map(({ id }, index) => (state.nodeWrites.get(id) ?? 0) - before[index]) };
}

test('designer instances and duplicated tagged nodes stay untouched, and duplicates are reported', async () => {
  const { figma, state, pages } = createFakeFigma(source);
  const plan = planComponentBatches(spec);
  await applyAll(figma, plan);
  const page = pages[2];
  const set = byTag(page, 'component-set:button');
  const primary = set.children.find((child) => child.getSharedPluginData('muxui', 'id') === 'component:button/variant=primary,state=rest');

  // An untagged instance of a variant reports the variant's tag but is not owned.
  const designerFrame = figma.createFrame();
  page.appendChild(designerFrame);
  const instance = primary.createInstance();
  designerFrame.appendChild(instance);
  const withInstance = await writesDuring(state, [instance, designerFrame], () => applyAll(figma, plan));
  assert.deepEqual([withInstance.result.created, withInstance.result.updated, withInstance.result.errors, withInstance.writes], [0, 0, [], [0, 0]]);
  assert.deepEqual([instance.parent.id, primary.parent.id], [designerFrame.id, set.id]);

  // A duplicated variant: both copies are reported and neither is written.
  const copy = primary.clone();
  const duplicated = await writesDuring(state, [primary, copy, ...primary.children, ...copy.children], () => applyAll(figma, plan));
  assert.deepEqual([duplicated.result.created, duplicated.result.updated, duplicated.writes.every((count) => count === 0)], [0, 0, true]);
  // Every batch indexes ownership itself, so each one reports the conflict.
  assert.deepEqual([...new Set(duplicated.result.errors.map(({ id }) => id))], ['component:button/variant=primary,state=rest']);
  assert.match(duplicated.result.errors[0].message, new RegExp(`2 nodes carry this tag \\(${primary.id}, ${copy.id}\\)`, 'u'));
  assert.equal(copy.parent.id, page.id);
  copy.remove();

  // A duplicated part inside its variant: reported, and neither copy is written.
  const label = primary.children.find(({ type }) => type === 'TEXT');
  const labelCopy = label.clone();
  primary.appendChild(labelCopy);
  const part = await writesDuring(state, [label, labelCopy], () => applyAll(figma, plan));
  assert.deepEqual([part.result.created, part.result.updated, part.writes], [0, 0, [0, 0]]);
  assert.deepEqual([...new Set(part.result.errors.map(({ id, message }) => `${id} ${message.slice(0, message.indexOf(';'))}`))], [
    `component:button/variant=primary,state=rest/label 2 nodes carry this tag (${label.id}, ${labelCopy.id})`,
  ]);
  labelCopy.remove();
  const settled = await applyAll(figma, plan);
  assert.deepEqual([settled.created, settled.updated, settled.errors], [0, 0, []]);
});

test('an untagged Components page is never adopted, and glyph updates tag only imported vectors', async () => {
  const { figma, pages } = createFakeFigma(source);
  const designerPage = figma.createPage();
  designerPage.name = 'Components';
  const plan = planComponentBatches(spec);
  const first = await applyAll(figma, plan.slice(0, 1));
  const page = pages.find((candidate) => candidate.getSharedPluginData('muxui', 'id') === 'page:components');
  assert.equal(page.name, 'Components (Mux UI)');
  assert.deepEqual(first.notices, ['created page Components (Mux UI) because an untagged page named Components exists']);
  assert.deepEqual([designerPage.getSharedPluginData('muxui', 'id'), designerPage.children], ['', []]);
  // The tagged page is reused without a notice.
  assert.deepEqual((await applyAll(figma, plan.slice(0, 1))).notices, []);

  const glyph = byTag(page, 'glyph:lucide-check');
  const extra = figma.createFrame();
  glyph.appendChild(extra);
  const changed = structuredClone(spec);
  changed.glyphs[0].svg = changed.glyphs[0].svg.replace('</svg>', '<path d="M1 1h2"></path></svg>');
  const rerun = await applyAll(figma, planComponentBatches(changed).slice(0, 1));
  assert.deepEqual([rerun.updated, rerun.errors], [1, []]);
  assert.deepEqual([extra.getSharedPluginData('muxui', 'id'), extra.constraints], ['', undefined]);
  assert.deepEqual(glyph.children.filter((child) => child !== extra).map((child) => [child.getSharedPluginData('muxui', 'id'), child.constraints.horizontal]), [
    ['glyph:lucide-check/vector-0', 'SCALE'],
    ['glyph:lucide-check/vector-1', 'SCALE'],
  ]);
});

test('per-corner radii set each corner and rerun unchanged', async () => {
  const { figma, pages, variableId } = createFakeFigma(source);
  const cornered = structuredClone(spec);
  cornered.families[0].variants[0].node.radii = { topLeft: { token: 'semantic.control.radius' }, topRight: { value: 8 }, bottomRight: { value: 0 }, bottomLeft: { value: 2 } };
  const plan = planComponentBatches(cornered);
  await applyAll(figma, plan);
  const root = byTag(pages[2], cornered.families[0].variants[0].id);
  assert.deepEqual([root.boundVariables.topLeftRadius.id, root.topRightRadius, root.bottomRightRadius, root.bottomLeftRadius], [variableId('semantic.control.radius'), 8, 0, 2]);
  const rerun = await applyAll(figma, plan);
  assert.deepEqual([rerun.created, rerun.updated, rerun.errors], [0, 0, []]);
});

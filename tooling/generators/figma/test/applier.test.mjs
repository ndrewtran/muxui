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
  const { result: refused, writes: pageWrites } = await writesDuring(guarded.state, [guarded.pages[1]], () => applyAll(guarded.figma, planComponentBatches(spec).slice(0, 1)));
  assert.match(refused.errors[0].message, /refusing to write to protected page Pilot components/u);
  assert.deepEqual([refused.created, refused.stamped, pageWrites, guarded.pages[1].children], [0, 0, [0], [guarded.untouched]]);
  // Refused before adoption: a legacy protected page gets no stamp.
  assert.equal(guarded.pages[1].getSharedPluginData('muxui', 'node'), '');

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

const STAMP = ['muxui', 'node'];
const stampOf = (node) => node.getSharedPluginData(...STAMP);
const tagged = (root) => root.findAll((node) => node.type !== 'INSTANCE' && node.getSharedPluginData('muxui', 'id') !== '' && !(node.parent && node.parent.type === 'INSTANCE'));
// Every tagged node the applier collects: instances too, but never an instance's sublayers.
const collected = (root) => root.findAll((node) => {
  if (node.getSharedPluginData('muxui', 'id') === '') return false;
  for (let parent = node.parent; parent; parent = parent.parent) if (parent.type === 'INSTANCE') return false;
  return true;
});

test('a designer instance of a variant is not owned and stays untouched, even in a preview row', async () => {
  const { figma, state, pages } = createFakeFigma(source);
  const plan = planComponentBatches(spec);
  await applyAll(figma, plan);
  const page = pages[2];
  const set = byTag(page, 'component-set:button');
  const primary = byTag(page, 'component:button/variant=primary,state=rest');
  const designerFrame = figma.createFrame();
  page.appendChild(designerFrame);
  const instance = primary.createInstance();
  designerFrame.appendChild(instance);
  const withInstance = await writesDuring(state, [instance, designerFrame], () => applyAll(figma, plan));
  assert.deepEqual([withInstance.result.created, withInstance.result.updated, withInstance.result.errors, withInstance.result.copies, withInstance.writes], [0, 0, [], [], [0, 0]]);
  assert.deepEqual([instance.parent.id, primary.parent.id], [designerFrame.id, set.id]);

  // In a preview row it reports the variant's tag, but it is neither owned nor an orphan.
  const row = byTag(page, 'preview:button/Light');
  row.appendChild(instance);
  const inRow = await writesDuring(state, [instance], () => applyAll(figma, plan));
  assert.deepEqual([inRow.result.created, inRow.result.updated, inRow.result.errors, inRow.result.orphans, inRow.writes], [0, 0, [], [], [0]]);
});

test('a copy carries the stamp under a new ID: reported, never adopted, and the original keeps updating', async () => {
  const { figma, state, pages, variableId } = createFakeFigma(source);
  const plan = planComponentBatches(spec);
  await applyAll(figma, plan);
  const page = pages[2];
  const set = byTag(page, 'component-set:button');
  const id = 'component:button/variant=primary,state=rest';
  const primary = byTag(page, id);
  assert.equal(stampOf(primary), primary.id);

  const copy = primary.clone();
  assert.deepEqual([copy.getSharedPluginData('muxui', 'id'), stampOf(copy), copy.id !== primary.id], [id, primary.id, true]);
  const copyNodes = [copy, ...copy.findAll(() => true)];
  const duplicated = await writesDuring(state, copyNodes, () => applyAll(figma, plan));
  assert.deepEqual([duplicated.result.created, duplicated.result.updated, duplicated.result.errors, duplicated.writes.every((count) => count === 0)], [0, 0, [], true]);
  // Every batch indexes ownership itself, so each one reports the copy.
  assert.deepEqual([...new Set(duplicated.result.copies.map(({ id: tag, node, stamp }) => `${tag} ${node} ${stamp}`))], [`${id} ${copy.id} ${primary.id}`]);

  // The original still updates while the copy exists.
  const changed = structuredClone(spec);
  changed.families[0].variants[0].node.fills = [{ token: 'semantic.surface.strong' }];
  const updated = await writesDuring(state, copyNodes, () => applyAll(figma, planComponentBatches(changed)));
  assert.deepEqual([updated.result.created, updated.result.updated, updated.result.errors, updated.writes.every((count) => count === 0)], [0, 1, [], true]);
  assert.equal(primary.fills[0].boundVariables.color.id, variableId('semantic.surface.strong'));
  assert.notEqual(copy.fills[0].boundVariables.color.id, variableId('semantic.surface.strong'));

  // With the original gone, the copy is still not adopted: a fresh variant is created.
  primary.remove();
  const replaced = await writesDuring(state, copyNodes, () => applyAll(figma, plan));
  assert.deepEqual([replaced.result.errors, replaced.writes.every((count) => count === 0), copy.parent.id], [[], true, page.id]);
  assert.ok(replaced.result.created > 1);
  const fresh = set.children.find((child) => child.getSharedPluginData('muxui', 'id') === id);
  assert.deepEqual([fresh.id !== copy.id, stampOf(fresh)], [true, fresh.id]);
  const settled = await applyAll(figma, plan);
  assert.deepEqual([settled.created, settled.updated, settled.errors, settled.copies.length > 0], [0, 0, [], true]);
});

test('a duplicated part and a mismatched stamp are reported and never written', async () => {
  const { figma, state, pages } = createFakeFigma(source);
  const plan = planComponentBatches(spec);
  await applyAll(figma, plan);
  const primary = byTag(pages[2], 'component:button/variant=primary,state=rest');
  const label = primary.children.find(({ type }) => type === 'TEXT');
  const labelCopy = label.clone();
  primary.appendChild(labelCopy);
  const part = await writesDuring(state, [label, labelCopy], () => applyAll(figma, plan));
  assert.deepEqual([part.result.created, part.result.updated, part.result.errors, part.writes], [0, 0, [], [0, 0]]);
  assert.deepEqual([...new Set(part.result.copies.map(({ node }) => node))], [labelCopy.id]);
  labelCopy.remove();

  // A stamp naming another node marks a copy, whatever its origin.
  label.setSharedPluginData(...STAMP, 'I:999');
  const mismatched = await writesDuring(state, [label], () => applyAll(figma, plan));
  assert.deepEqual([mismatched.result.errors, mismatched.writes, label.parent.id], [[], [0], primary.id]);
  assert.deepEqual([...new Set(mismatched.result.copies.map(({ id, node, stamp }) => `${id} ${node} ${stamp}`))], [`component:button/variant=primary,state=rest/label ${label.id} I:999`]);
});

test('unstamped legacy nodes are adopted once and stamped; two unstamped nodes with one tag are left alone', async () => {
  const { figma, state, pages } = createFakeFigma(source);
  const plan = planComponentBatches(spec);
  await applyAll(figma, plan);
  const page = pages[2];
  const owned = [page, ...collected(page)];
  for (const node of owned) node.data.delete('muxui/node');
  // Glyph-part and preview instances are legacy too. Once the run adopts their
  // main component they read its stamp, which must still count as unstamped.
  assert.ok(owned.filter((node) => node.type === 'INSTANCE').length > 0);
  assert.ok(owned.every((node) => stampOf(node) === ''));

  const writes = state.writes;
  const migrated = await applyAll(figma, plan);
  assert.deepEqual([migrated.created, migrated.updated, migrated.errors, migrated.orphans, migrated.copies, state.removes], [0, 0, [], [], [], 0]);
  // Only stamps were written: one per legacy node, once.
  assert.deepEqual([migrated.stamped, state.writes - writes], [owned.length, owned.length]);
  assert.ok(owned.every((node) => stampOf(node) === node.id));
  const after = state.writes;
  const rerun = await applyAll(figma, plan);
  assert.deepEqual([rerun.created, rerun.updated, rerun.stamped, rerun.errors, state.writes], [0, 0, 0, [], after]);

  // An unstamped node beside its stamped original is a copy: reported, never written.
  const primary = byTag(page, 'component:button/variant=primary,state=rest');
  const stray = primary.clone();
  stray.data.delete('muxui/node');
  const beside = await writesDuring(state, [primary, stray], () => applyAll(figma, plan));
  assert.deepEqual([beside.result.created, beside.result.updated, beside.result.stamped, beside.result.errors, beside.writes], [0, 0, 0, [], [0, 0]]);
  assert.deepEqual([...new Set(beside.result.copies.map(({ node, stamp }) => `${node} ${stamp}`))], [`${stray.id} `]);
  stray.remove();

  // A pre-stamp duplicate: both unstamped copies are reported and neither is written.
  primary.data.delete('muxui/node');
  const copy = primary.clone();
  const legacy = await writesDuring(state, [primary, copy], () => applyAll(figma, plan));
  assert.deepEqual([legacy.result.created, legacy.result.updated, legacy.result.stamped, legacy.writes], [0, 0, 0, [0, 0]]);
  assert.match(legacy.result.errors[0].message, new RegExp(`2 nodes carry this tag \\(${primary.id}, ${copy.id}\\)`, 'u'));
});

test('a duplicated Components page is reported and ignored; two unstamped tagged pages stop the batch', async () => {
  const { figma, state, pages } = createFakeFigma(source);
  const plan = planComponentBatches(spec);
  await applyAll(figma, plan);
  const page = pages[2];
  // Figma's Duplicate page copies plugin data onto the new page.
  const copy = page.clone();
  assert.deepEqual([pages.length, copy.getSharedPluginData('muxui', 'id'), stampOf(copy)], [4, 'page:components', page.id]);
  const duplicated = await writesDuring(state, [copy, ...copy.findAll(() => true)], () => applyAll(figma, plan));
  assert.deepEqual([duplicated.result.created, duplicated.result.updated, duplicated.result.errors, duplicated.writes.every((count) => count === 0)], [0, 0, [], true]);
  assert.deepEqual([...new Set(duplicated.result.copies.map(({ id, node }) => `${id} ${node}`))], [`page:components ${copy.id}`]);

  // Before stamps the two pages are indistinguishable, so nothing is written.
  page.data.delete('muxui/node');
  copy.data.delete('muxui/node');
  const writes = state.writes;
  const guarded = await applyAll(figma, plan);
  assert.deepEqual([guarded.created, guarded.updated, state.writes], [0, 0, writes]);
  assert.match(guarded.errors[0].message, new RegExp(`2 pages carry this tag \\(${page.id}, ${copy.id}\\)`, 'u'));
});

test('an untagged Components page is never adopted, and glyph updates tag only imported vectors', async () => {
  const fake = createFakeFigma(source);
  const { figma, pages } = fake;
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
  const replacedVectors = glyph.children.filter((child) => child !== extra).map((child) => child.id);
  const { state } = fake;
  const removesBefore = state.removed.length;
  const rerun = await applyAll(figma, planComponentBatches(changed).slice(0, 1));
  assert.deepEqual([rerun.updated, rerun.errors], [1, []]);
  // Only the replaced vectors and the emptied SVG import frame are removed; the designer's frame stays.
  const removed = state.removed.slice(removesBefore);
  assert.deepEqual(removed.filter(({ type }) => type === 'VECTOR').map(({ id }) => id), replacedVectors);
  assert.deepEqual(removed.filter(({ type }) => type !== 'VECTOR').map(({ type, tag }) => [type, tag]), [['FRAME', '']]);
  assert.equal(state.removes, replacedVectors.length + 1);
  assert.ok(glyph.children.includes(extra));
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

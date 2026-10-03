import assert from 'node:assert/strict';
import test from 'node:test';
import { anatomies } from '../src/anatomy/index.mjs';
import { AnatomyError, catalogAxes, loadAnatomySources, resolveAnatomy, validateAnatomyShape } from '../src/anatomy.mjs';
import { catalogRecord, reactTypes, syntheticAnatomy } from './support.mjs';

const rejects = (anatomy, pattern) => assert.throws(() => validateAnatomyShape(anatomy), (error) => error instanceof AnatomyError && pattern.test(error.message));

test('anatomy validation names the family and field of each structural error', () => {
  const valid = syntheticAnatomy();
  validateAnatomyShape(valid);
  rejects({ ...valid, family: 'Button' }, /\?\.family|Button\.family/u);
  rejects({ ...valid, states: ['hover'] }, /button\.states: must start with rest/u);
  rejects({ ...valid, states: ['rest', 'selected'] }, /button\.states: selected is not one of/u);
  rejects({ ...valid, parts: [{ ...valid.parts[1] }, valid.parts[0]] }, /button\.icon: the first part must be the root FRAME/u);
  rejects({ ...valid, parts: [valid.parts[0], { ...valid.parts[2], parent: 'missing' }] }, /button\.label\.parent: missing must be declared before its children/u);
  rejects({ ...valid, parts: [valid.parts[0], valid.parts[0]] }, /button\.parts\[1\]\.id: duplicate part root/u);
  rejects({ ...valid, parts: [valid.parts[0], { ...valid.parts[2], bind: ['fill'] }] }, /button\.label\.bind: a TEXT part must bind text/u);
  rejects({ ...valid, parts: [valid.parts[0], { ...valid.parts[1], glyph: 'lucide-check' }] }, /button\.icon\.glyph: a GLYPH part must name its glyph per variant/u);
  rejects({ ...valid, parts: [{ ...valid.parts[0], bind: ['paint'] }] }, /button\.root\.bind: must list bind groups/u);
});

test('axes come from the catalog record and React types, with the catalog default first', () => {
  assert.deepEqual(catalogAxes(syntheticAnatomy(), { catalogRecord, reactTypes }), [{ prop: 'variant', name: 'Variant', values: ['primary', 'ghost'] }]);
  const axisError = (anatomy, sources, pattern) => assert.throws(() => catalogAxes(anatomy, sources), (error) => error instanceof AnatomyError && pattern.test(error.message));
  axisError({ ...syntheticAnatomy(), axes: ['size'] }, { catalogRecord, reactTypes }, /button\.axes\.size: is not a web\.react prop in the catalog record/u);
  axisError(syntheticAnatomy(), { catalogRecord, reactTypes: reactTypes.replace("'ghost'", "'other'").replace("'primary' | ", '') }, /catalog default primary is not a React value/u);
  axisError(syntheticAnatomy(), { catalogRecord: { ...catalogRecord, id: 'muxui:component:link' }, reactTypes }, /catalog record id must be muxui:component:button/u);
  const { variants } = resolveAnatomy(syntheticAnatomy(), { catalogRecord, reactTypes });
  assert.deepEqual(variants.slice(0, 2).map(({ key, name }) => [key, name]), [
    ['variant=primary,state=rest', 'Variant=primary, State=rest'],
    ['variant=primary,state=hover', 'Variant=primary, State=hover'],
  ]);
});

test('the six admitted anatomies validate against the canonical catalog and generated React types', async () => {
  const counts = {};
  for (const anatomy of anatomies) {
    const { variants, axes } = resolveAnatomy(anatomy, await loadAnatomySources(anatomy));
    counts[anatomy.family] = [axes.map(({ name }) => name).join('/'), variants.length];
  }
  assert.deepEqual(counts, {
    button: ['Variant/Size', 105],
    checkbox: ['Size', 54],
    switch: ['Size', 36],
    'text-field': ['Size', 15],
    tabs: ['Variant/Size', 60],
    'tag-group': ['', 10],
  });
  // TagGroup previews the story's default, a tag without the remove action.
  const tagGroup = anatomies.find(({ family }) => family === 'tag-group');
  const remove = tagGroup.parts.find(({ id }) => id === 'remove');
  assert.deepEqual(tagGroup.preview.map((key) => remove.when({ selection: /removable=(\w+)/u.exec(key)[1] })), Array(5).fill(false));
});

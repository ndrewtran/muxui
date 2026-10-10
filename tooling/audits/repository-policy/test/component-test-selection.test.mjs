import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { componentTestSelection, selectComponentTestFiles } from '../src/component-test-selection.mjs';

const packageRoot = resolve(import.meta.dirname, '../../../../packages/react');

async function testFiles(root, prefix = '') {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await testFiles(root, `${relative}/`));
    else if (entry.name.endsWith('.test.mjs')) files.push(relative);
  }
  return files;
}

const records = [
  { family: 'Button', export: 'Button', slug: 'button', source: 'packages/react/src/button.mjs' },
  { family: 'Tree', export: 'Tree', slug: 'tree', source: 'packages/react/src/collections.mjs' },
  { family: 'TagSelect', export: 'TagSelect', slug: 'tag-select', source: 'packages/react/src/supplemental/index.mjs' },
];
const availableFiles = (await testFiles(resolve(packageRoot, 'test'))).map((file) => `test/${file}`);
const buttonFixture = await readFile(resolve(packageRoot, 'test/fixture.test.mjs'), 'utf8');
const parity = await readFile(resolve(packageRoot, 'test/r1-3-parity.test.mjs'), 'utf8');

test('default component routing retains shared source and integrity coverage', () => {
  const selected = selectComponentTestFiles([records[0]], availableFiles);
  assert.ok(selected.includes('test/fixture.test.mjs'));
  assert.ok(selected.includes('test/style-scopes.test.mjs'));
  assert.ok(selected.includes('test/styling-tokens.test.mjs'));
});

test('focused routing selects Tree and TagSelect behavior without unrelated source groups', () => {
  for (const family of ['Tree', 'TagSelect']) {
    const record = records.find((candidate) => candidate.family === family);
    const selected = componentTestSelection([record], availableFiles, { includeSharedSource: false });
    assert.ok(selected.files.includes(family === 'Tree'
      ? 'test/browser/tree-toggle-browser.test.mjs'
      : 'test/browser/tag-select-focus.test.mjs'));
    assert.ok(!selected.files.includes('test/components.test.mjs'));
    assert.equal(selected.files.includes('test/supplemental.test.mjs'), family === 'TagSelect');
    assert.equal(selected.files.includes('test/r1-3-parity.test.mjs'), family === 'Tree');
    assert.ok(selected.files.includes('test/style-scopes.test.mjs'));
    assert.ok(selected.files.includes('test/styling-tokens.test.mjs'));
  }
});

test('focused Tree and TagSelect retain only their named shared-source behavior cases', () => {
  const tree = componentTestSelection([records[1]], availableFiles, { includeSharedSource: false });
  assert.deepEqual(tree.testNamesByFile['test/r1-3-parity.test.mjs'], [
    'R1.3 Tree flattens nested items for keyboard collection semantics',
  ]);

  const tagSelect = componentTestSelection([records[2]], availableFiles, { includeSharedSource: false });
  assert.deepEqual(tagSelect.testNamesByFile['test/supplemental.test.mjs'], [
    'TagSelect preserves combobox filtering and chip focus/removal keyboard behavior',
    'TagSelect preserves selected-key order for controlled chips and removals',
  ]);
});

test('GridList routes to its cross-engine layout proof and its collection cases in both modes', () => {
  const record = { family: 'GridList', export: 'GridList', slug: 'grid-list', source: 'packages/react/src/collections.mjs' };
  const layoutProof = 'test/browser/grid-list-layout.test.mjs';
  assert.ok(selectComponentTestFiles([record], availableFiles).includes(layoutProof));
  assert.ok(selectComponentTestFiles([record], availableFiles).includes('test/r1-3-parity.test.mjs'));

  const focused = componentTestSelection([record], availableFiles, {
    includeSharedSource: false,
    testSources: { 'test/r1-3-parity.test.mjs': parity },
  });
  assert.ok(focused.files.includes(layoutProof));
  assert.ok(focused.testNamesByFile['test/r1-3-parity.test.mjs'].includes('R1.3 GridList layout and orientation reach the root and reject unsupported values'));
});

test('Virtualizer routes to its cross-engine grid proof and its named R1.3 cases in both modes', () => {
  const record = { family: 'Virtualizer', export: 'Virtualizer', slug: 'virtualizer', source: 'packages/react/src/collections.mjs' };
  const gridProof = 'test/browser/virtualizer-grid.test.mjs';
  assert.ok(selectComponentTestFiles([record], availableFiles).includes(gridProof));
  assert.ok(selectComponentTestFiles([record], availableFiles).includes('test/r1-3-parity.test.mjs'));

  const focused = componentTestSelection([record], availableFiles, {
    includeSharedSource: false,
    testSources: { 'test/r1-3-parity.test.mjs': parity },
  });
  assert.ok(focused.files.includes(gridProof));
  for (const name of ['R1.3 Virtualizer grid layout validates its options, child, and ref', 'R1.3 Virtualizer grid layout needs a vertical grid GridList and renders on the server']) {
    assert.ok(focused.testNamesByFile['test/r1-3-parity.test.mjs'].includes(name), name);
  }
});

test('focused Button routing keeps its existing named family cases instead of the whole fixture group', () => {
  const selected = componentTestSelection([records[0]], availableFiles, {
    includeSharedSource: false,
    testSources: { 'test/fixture.test.mjs': buttonFixture },
  });
  assert.deepEqual(selected.testNamesByFile['test/fixture.test.mjs'], [
    'Button exposes seven variants with stable root hooks',
    'Button generator guard binds the canonical finite API contract',
    'Button owns MuxUI selectors and required token bindings',
    'R1.1 MuxUI Button proves SSR, hydration, disabled and pending state',
    'pending Button preserves its accessible name without overriding caller naming',
  ]);
});

test('focused routing permits a canonical Storybook BrowserProof when no named React case exists', () => {
  const record = { family: 'NoReactCase', export: 'NoReactCase', slug: 'no-react-case', source: 'packages/react/src/elsewhere.mjs' };
  const selected = componentTestSelection([record], availableFiles, {
    includeSharedSource: false,
    behaviorProofFamilies: ['NoReactCase'],
  });
  assert.deepEqual(selected.behaviorProofFamilies, ['NoReactCase']);
  assert.throws(
    () => selectComponentTestFiles([record], availableFiles, { includeSharedSource: false }),
    /MUXUI_COMPONENT_FOCUSED_ROUTE_MISSING: NoReactCase/u,
  );
});

test('focused routing fails when a mapped behavioral test file is unavailable', () => {
  assert.throws(
    () => selectComponentTestFiles([records[1]], availableFiles.filter((file) => file !== 'test/browser/tree-toggle-browser.test.mjs'), { includeSharedSource: false }),
    /MUXUI_COMPONENT_TEST_ROUTE_FILE_MISSING/u,
  );
});

test('a family with no test, no source group, and no BrowserProof still fails explicitly', () => {
  const record = { family: 'Unknown', export: 'Unknown', slug: 'unknown', source: 'packages/react/src/unknown.mjs' };
  assert.throws(
    () => selectComponentTestFiles([record], availableFiles, { includeSharedSource: false }),
    /MUXUI_COMPONENT_FOCUSED_ROUTE_MISSING: Unknown/u,
  );
});

const sharedFiles = ['test/style-scopes.test.mjs', 'test/styling-tokens.test.mjs'];

test('slug-named tests route by convention without a map entry', () => {
  const record = { family: 'ScratchWidget', slug: 'scratch-widget', source: 'packages/react/src/elsewhere.mjs' };
  const both = [...sharedFiles, 'test/scratch-widget.test.mjs', 'test/browser/scratch-widget.test.mjs', 'test/scratch-widget-other.test.mjs'];
  for (const includeSharedSource of [true, false]) {
    assert.deepEqual(
      selectComponentTestFiles([record], both, { includeSharedSource }),
      ['test/browser/scratch-widget.test.mjs', 'test/scratch-widget.test.mjs', ...sharedFiles],
    );
  }
  assert.deepEqual(
    selectComponentTestFiles([record], [...sharedFiles, 'test/scratch-widget.test.mjs'], { includeSharedSource: false }),
    ['test/scratch-widget.test.mjs', ...sharedFiles],
  );
});

test('real families gain the slug-named browser test their old map entry omitted', () => {
  for (const [family, slug] of [['Text', 'text'], ['SelectNative', 'select-native'], ['IconButton', 'icon-button'], ['ProgressCircle', 'progress-circle']]) {
    const record = { family, slug, source: 'packages/react/src/supplemental/index.mjs' };
    const selected = selectComponentTestFiles([record], availableFiles, { includeSharedSource: false });
    assert.ok(selected.includes(`test/${slug}.test.mjs`), family);
    assert.ok(selected.includes(`test/browser/${slug}.test.mjs`), family);
  }
});

test('every canonical family resolves its routes against the real React tests', async () => {
  const contract = JSON.parse((await readFile(resolve(packageRoot, 'generated/r1-6-contract.json'), 'utf8'))
    .split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
  assert.ok(contract.components.length > 0);
  for (const record of contract.components) {
    for (const includeSharedSource of [true, false]) {
      // A stale explicit extra throws MUXUI_COMPONENT_TEST_ROUTE_FILE_MISSING here.
      const selected = selectComponentTestFiles([record], availableFiles, { includeSharedSource, behaviorProofFamilies: [record.family] });
      assert.ok(selected.length >= sharedFiles.length, record.family);
    }
  }
});

test('a family no test names runs its source group whole instead of failing', () => {
  const field = { family: 'ScratchField', slug: 'scratch-field', source: 'packages/react/src/fields.mjs' };
  const selected = componentTestSelection([field], availableFiles, { includeSharedSource: false, testSources: { 'test/fields.test.mjs': '' } });
  assert.deepEqual(selected.files, [
    'test/browser/form-fields.test.mjs',
    'test/fields.test.mjs',
    'test/r1-2-parity.test.mjs',
    ...sharedFiles,
  ]);
  assert.deepEqual(selected.testNamesByFile, {});
  assert.deepEqual(selected.behaviorProofFamilies, []);

  // Every supplemental module belongs to the supplemental group.
  const supplemental = { family: 'ScratchWidget', slug: 'scratch-widget', source: 'packages/react/src/supplemental/scratch-widget.mjs' };
  assert.deepEqual(
    selectComponentTestFiles([supplemental], availableFiles, { includeSharedSource: false }),
    [...sharedFiles, 'test/supplemental.test.mjs'],
  );
});

test('a whole-group fallback is never narrowed to another selected family\'s cases', () => {
  const field = { family: 'ScratchCollection', slug: 'scratch-collection', source: 'packages/react/src/collections.mjs' };
  const selected = componentTestSelection([records[1], field], availableFiles, {
    includeSharedSource: false,
    testSources: { 'test/r1-3-parity.test.mjs': parity },
  });
  assert.ok(selected.files.includes('test/r1-3-parity.test.mjs'));
  assert.equal('test/r1-3-parity.test.mjs' in selected.testNamesByFile, false);
  // Tree alone still narrows to its named case.
  const treeOnly = componentTestSelection([records[1]], availableFiles, {
    includeSharedSource: false,
    testSources: { 'test/r1-3-parity.test.mjs': parity },
  });
  assert.ok(treeOnly.testNamesByFile['test/r1-3-parity.test.mjs'].length > 0);
});

test('every candidate family retains all shared motion lifecycle cases in real scoped and CI source filtering', async () => {
  const file = 'test/browser/candidate-motion.test.mjs';
  const source = await readFile(resolve(packageRoot, file), 'utf8');
  const names = [
    'CodeBlock, PromptComposer, Message, Activity and DataDiff motion stays finite through feedback, typing, streaming and pending',
    'CodeBlock, PromptComposer, Message, Activity and DataDiff honor reduced ancestors and mid-flight system preferences',
    'CodeBlock, PromptComposer, Message, Activity and DataDiff clean up rapid reversals, animations and observers',
  ].sort();
  const candidates = ['Activity', 'DataDiff', 'Message', 'PromptComposer', 'CodeBlock']
    .map(family => ({ family, source: `packages/react/src/supplemental/${family}.mjs` }));
  for (const records of [...candidates.map(record => [record]), candidates]) {
    for (const includeSharedSource of [true, false]) {
      const selected = componentTestSelection(records, availableFiles, { includeSharedSource, testSources: { [file]: source } });
      assert.equal(selected.files.filter(selectedFile => selectedFile === file).length, 1);
      if (!includeSharedSource) assert.deepEqual(selected.testNamesByFile[file], names);
    }
  }
});

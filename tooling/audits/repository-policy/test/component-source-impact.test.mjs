import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  analyzeReactSourceChange,
  analyzeReactStyleChange,
} from '../src/component-source-impact.mjs';

const supplementalPath = 'packages/react/src/supplemental/index.mjs';
const collectionsPath = 'packages/react/src/collections.mjs';
const helperPath = 'packages/react/src/shared/labels.mjs';
const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');

const supplementalRecords = [
  { family: 'Input', export: 'Input', slug: 'input', source: supplementalPath, parts: ['root', 'input'] },
  { family: 'InputTags', export: 'InputTags', slug: 'input-tags', source: supplementalPath, parts: ['root', 'tag', 'input'] },
  { family: 'MultiSelect', export: 'MultiSelect', slug: 'multi-select', source: supplementalPath, parts: ['root', 'tag', 'input'] },
  { family: 'TagSelect', export: 'TagSelect', slug: 'tag-select', source: supplementalPath, parts: ['root', 'tag', 'input', 'item'] },
];

const tagSelectAndMultiSelect = supplementalRecords.filter(({ family }) => ['TagSelect', 'MultiSelect'].includes(family));

const collectionRecords = [
  { family: 'Tree', export: 'Tree', slug: 'tree', source: collectionsPath, parts: ['root', 'item', 'children'] },
  { family: 'TagGroup', export: 'TagGroup', slug: 'tag-group', source: collectionsPath, parts: ['root', 'item'] },
];

test('an owned TagSelect helper change reaches only TagSelect', () => {
  const before = `
    const AnimatedTagChip = () => h(IconButton, { type: 'button' });
    export const TagSelect = () => h(AnimatedTagChip);
    export const MultiSelect = () => h('div');
  `;
  const after = before.replace("{ type: 'button' }", "{ slot: null, type: 'button' }");
  const result = analyzeReactSourceChange({
    records: tagSelectAndMultiSelect,
    sourcePath: supplementalPath,
    before,
    after,
    moduleSources: { [supplementalPath]: { before, after } },
  });

  assert.deepEqual(result.families, ['TagSelect']);
  assert.equal(result.shared, false);
  assert.match(result.reason, /AnimatedTagChip/u);
});

test('the real TagSelect render factory change does not widen to MultiSelect', async () => {
  const sourcePath = 'packages/react/src/supplemental/index.mjs';
  const after = await readFile(path.join(repositoryRoot, sourcePath), 'utf8');
  assert.equal((after.match(/slot: null,\n/gu) ?? []).length, 1, 'fixture must target the single approved TagSelect slot change');
  const before = after.replace('slot: null,\n', '');
  const result = analyzeReactSourceChange({
    records: tagSelectAndMultiSelect,
    sourcePath,
    before,
    after,
    moduleSources: { [sourcePath]: { before, after } },
  });

  assert.deepEqual(result.families, ['TagSelect']);
  assert.equal(result.shared, false);
});

test('changed helper declarations select their reachable source families', () => {
  const before = `
    const normalizeLabel = (value) => value.trim();
    export const TagSelect = () => normalizeLabel('tag');
    export const MultiSelect = () => normalizeLabel('multi');
  `;
  const after = before.replace('value.trim()', 'value.trim().toLowerCase()');
  const result = analyzeReactSourceChange({
    records: tagSelectAndMultiSelect,
    sourcePath: supplementalPath,
    before,
    after,
    moduleSources: { [supplementalPath]: { before, after } },
  });

  assert.deepEqual(result.families, ['MultiSelect', 'TagSelect']);
  assert.equal(result.shared, true);
});

test('import changes widen to every canonical family in that source module', () => {
  const before = `
    import React from 'react';
    export const TagSelect = () => React.createElement('div');
    export const MultiSelect = () => React.createElement('div');
  `;
  const after = before.replace("from 'react'", "from 'preact'");
  const result = analyzeReactSourceChange({
    records: tagSelectAndMultiSelect,
    sourcePath: supplementalPath,
    before,
    after,
    moduleSources: { [supplementalPath]: { before, after } },
  });

  assert.deepEqual(result.families, ['MultiSelect', 'TagSelect']);
  assert.equal(result.shared, true);
  assert.match(result.reason, /imports/u);
});

test('a changed imported helper maps to its canonical family source', () => {
  const consumerPath = 'packages/react/src/label-consumer.mjs';
  const records = [{ family: 'Tree', export: 'Tree', slug: 'tree', source: consumerPath, parts: ['root'] }];
  const before = 'export const normalizeLabel = (value) => value.trim();';
  const after = 'export const normalizeLabel = (value) => value.trim().toLowerCase();';
  const result = analyzeReactSourceChange({
    records,
    sourcePath: helperPath,
    before,
    after,
    moduleSources: {
      [consumerPath]: "import { normalizeLabel } from './shared/labels.mjs'; export const Tree = () => normalizeLabel('tree');",
      [helperPath]: { before, after },
    },
  });

  assert.deepEqual(result.families, ['Tree']);
  assert.equal(result.shared, false);
  assert.match(result.reason, /imported by/u);
});

test('helper changes cross an imported binding re-exported under an alias', () => {
  const aliasesPath = 'packages/react/src/shared/label-aliases.mjs';
  const treeConsumerPath = 'packages/react/src/tree-consumer.mjs';
  const tagConsumerPath = 'packages/react/src/tag-consumer.mjs';
  const records = [
    { family: 'Tree', export: 'Tree', slug: 'tree', source: treeConsumerPath, parts: ['root'] },
    { family: 'TagGroup', export: 'TagGroup', slug: 'tag-group', source: tagConsumerPath, parts: ['root'] },
  ];
  const before = 'export const normalizeLabel = (value) => value.trim();';
  const after = 'export const normalizeLabel = (value) => value.trim().toLowerCase();';
  const aliases = "import { normalizeLabel as label } from './labels.mjs'; export { label as formatLabel };";
  const treeConsumer = "import { formatLabel } from './shared/label-aliases.mjs'; export const Tree = () => formatLabel('tree');";
  const tagConsumer = "import { formatLabel } from './shared/label-aliases.mjs'; export const TagGroup = () => formatLabel('tags');";
  const result = analyzeReactSourceChange({
    records,
    sourcePath: helperPath,
    before,
    after,
    moduleSources: {
      [helperPath]: { before, after },
      [aliasesPath]: aliases,
      [treeConsumerPath]: treeConsumer,
      [tagConsumerPath]: tagConsumer,
    },
  });

  assert.deepEqual(result.families, ['TagGroup', 'Tree']);
  assert.equal(result.shared, true);
  assert.match(result.reason, /imported by React families TagGroup, Tree/u);
});

test('changed helpers used by unowned top-level effects widen to all module consumers', () => {
  const effectPath = 'packages/react/src/effectful-components.mjs';
  const tagGroupPath = 'packages/react/src/tag-group.mjs';
  const records = [
    { family: 'Tree', export: 'Tree', slug: 'tree', source: effectPath, parts: ['root'] },
    { family: 'ListBox', export: 'ListBox', slug: 'list-box', source: effectPath, parts: ['root'] },
    { family: 'TagGroup', export: 'TagGroup', slug: 'tag-group', source: tagGroupPath, parts: ['root'] },
  ];
  const before = 'export const normalizeLabel = (value) => value.trim();';
  const after = 'export const normalizeLabel = (value) => value.trim().toLowerCase();';
  const effectfulComponents = `
    import { normalizeLabel } from './shared/labels.mjs';
    const registration = register(normalizeLabel);
    export const Tree = () => 'tree';
    export const ListBox = () => 'list';
  `;
  const tagGroup = "import { normalizeLabel } from './shared/labels.mjs'; export const TagGroup = () => normalizeLabel('tags');";
  const result = analyzeReactSourceChange({
    records,
    sourcePath: helperPath,
    before,
    after,
    moduleSources: {
      [helperPath]: { before, after },
      [effectPath]: effectfulComponents,
      [tagGroupPath]: tagGroup,
    },
  });

  assert.deepEqual(result.families, ['ListBox', 'TagGroup', 'Tree']);
  assert.equal(result.shared, true);
});

test('unknown registration callbacks remain conservative top-level effects', () => {
  const effectPath = 'packages/react/src/effectful-components.mjs';
  const tagGroupPath = 'packages/react/src/tag-group.mjs';
  const records = [
    { family: 'Tree', export: 'Tree', slug: 'tree', source: effectPath, parts: ['root'] },
    { family: 'ListBox', export: 'ListBox', slug: 'list-box', source: effectPath, parts: ['root'] },
    { family: 'TagGroup', export: 'TagGroup', slug: 'tag-group', source: tagGroupPath, parts: ['root'] },
  ];
  const before = 'export const normalizeLabel = (value) => value.trim();';
  const after = 'export const normalizeLabel = (value) => value.trim().toLowerCase();';
  const effectfulComponents = `
    import { normalizeLabel } from './shared/labels.mjs';
    const registration = register(() => normalizeLabel('tree'));
    export const Tree = () => 'tree';
    export const ListBox = () => 'list';
  `;
  const tagGroup = "import { normalizeLabel } from './shared/labels.mjs'; export const TagGroup = () => normalizeLabel('tags');";
  const result = analyzeReactSourceChange({
    records,
    sourcePath: helperPath,
    before,
    after,
    moduleSources: {
      [helperPath]: { before, after },
      [effectPath]: effectfulComponents,
      [tagGroupPath]: tagGroup,
    },
  });

  assert.deepEqual(result.families, ['ListBox', 'TagGroup', 'Tree']);
  assert.equal(result.shared, true);
});

test('immediately invoked module initializers retain eager effect references', () => {
  const effectPath = 'packages/react/src/effectful-components.mjs';
  const tagGroupPath = 'packages/react/src/tag-group.mjs';
  const records = [
    { family: 'Tree', export: 'Tree', slug: 'tree', source: effectPath, parts: ['root'] },
    { family: 'ListBox', export: 'ListBox', slug: 'list-box', source: effectPath, parts: ['root'] },
    { family: 'TagGroup', export: 'TagGroup', slug: 'tag-group', source: tagGroupPath, parts: ['root'] },
  ];
  const before = 'export const normalizeLabel = (value) => value.trim();';
  const after = 'export const normalizeLabel = (value) => value.trim().toLowerCase();';
  const effectfulComponents = `
    import { normalizeLabel } from './shared/labels.mjs';
    const registration = (() => register(normalizeLabel))();
    export const Tree = () => 'tree';
    export const ListBox = () => 'list';
  `;
  const tagGroup = "import { normalizeLabel } from './shared/labels.mjs'; export const TagGroup = () => normalizeLabel('tags');";
  const result = analyzeReactSourceChange({
    records,
    sourcePath: helperPath,
    before,
    after,
    moduleSources: {
      [helperPath]: { before, after },
      [effectPath]: effectfulComponents,
      [tagGroupPath]: tagGroup,
    },
  });

  assert.deepEqual(result.families, ['ListBox', 'TagGroup', 'Tree']);
  assert.equal(result.shared, true);
});

test('owned export changes include only families that consume its imported binding', () => {
  const buttonPath = 'packages/react/src/button.mjs';
  const iconButtonPath = 'packages/react/src/supplemental/icon-button.mjs';
  const sharedPath = 'packages/react/src/supplemental/shared-controls.mjs';
  const beforeButton = 'export const Button = ({ size }) => size;';
  const afterButton = 'export const Button = ({ size }) => size ?? "md";';
  const iconButtonSource = "import { Button } from '../button.mjs'; export const IconButton = () => Button({ size: 'sm' });";
  const sharedSource = "import { Button as SharedButton } from '../button.mjs'; export const UsesButton = () => SharedButton({ size: 'lg' }); export const Unrelated = () => null;";
  const records = [
    { family: 'Button', export: 'Button', slug: 'button', source: buttonPath, parts: ['root'] },
    { family: 'IconButton', export: 'IconButton', slug: 'icon-button', source: iconButtonPath, parts: ['root'] },
    { family: 'UsesButton', export: 'UsesButton', slug: 'uses-button', source: sharedPath, parts: ['root'] },
    { family: 'Unrelated', export: 'Unrelated', slug: 'unrelated', source: sharedPath, parts: ['root'] },
  ];
  const result = analyzeReactSourceChange({
    records,
    sourcePath: buttonPath,
    before: beforeButton,
    after: afterButton,
    moduleSources: {
      [buttonPath]: { before: beforeButton, after: afterButton },
      [iconButtonPath]: { before: iconButtonSource, after: iconButtonSource },
      [sharedPath]: { before: sharedSource, after: sharedSource },
    },
  });

  assert.deepEqual(result.families, ['Button', 'IconButton', 'UsesButton']);
  assert.equal(result.shared, true);
  assert.match(result.reason, /imported consumers: IconButton, UsesButton/u);
});

test('unowned or unresolvable source changes fail with an actionable diagnostic', () => {
  assert.throws(
    () => analyzeReactSourceChange({
      records: supplementalRecords,
      sourcePath: 'packages/react/src/unknown.mjs',
      before: 'export const value = 1;',
      after: 'export const value = 2;',
    }),
    /MUXUI_CI_IMPACT_SOURCE_OWNERSHIP/u,
  );

  assert.throws(
    () => analyzeReactSourceChange({
      records: [...supplementalRecords, ...collectionRecords],
      before: 'export const TagSelect = () => null;',
      after: 'export const TagSelect = () => true;',
    }),
    /sourcePath is required/u,
  );
});

test('formatting-only JavaScript changes return a semantic no-op', () => {
  const before = 'export const TagSelect = () => null;';
  const after = `// reformatted without changing behavior\nexport const TagSelect=()=>null;`;
  const result = analyzeReactSourceChange({
    records: tagSelectAndMultiSelect,
    sourcePath: supplementalPath,
    before,
    after,
  });

  assert.deepEqual(result.families, []);
  assert.equal(result.shared, false);
  assert.match(result.reason, /semantically unchanged/u);
});

test('isolated Tree and TagSelect style rules select only their owners', () => {
  const records = [...collectionRecords, ...supplementalRecords];
  const before = '.muxui-tree { color: black; } .muxui-tag-select__input { color: black; }';
  const after = '.muxui-tree { color: white; } .muxui-tag-select__input { color: black; }';
  const result = analyzeReactStyleChange({ records, sourcePath: 'packages/react/src/styles/test.css', before, after });

  assert.deepEqual(result.families, ['Tree']);
  assert.equal(result.theme, false);

  const tagSelect = analyzeReactStyleChange({
    records,
    sourcePath: 'packages/react/src/styles/test.css',
    before: '.muxui-tag-select__input { color: black; }',
    after: '.muxui-tag-select__input { color: blue; }',
  });
  assert.deepEqual(tagSelect.families, ['TagSelect']);
});

test('CSS owners expand through runtime composition when source snapshots are supplied', () => {
  const buttonPath = 'packages/react/src/button.mjs';
  const iconButtonPath = 'packages/react/src/supplemental/icon-button.mjs';
  const sharedPath = 'packages/react/src/supplemental/shared-controls.mjs';
  const buttonSource = 'export const Button = () => null;';
  const iconButtonSource = "import { Button } from '../button.mjs'; export const IconButton = () => Button();";
  const sharedSource = "import { Button as SharedButton } from '../button.mjs'; export const UsesButton = () => SharedButton(); export const Unrelated = () => null;";
  const records = [
    { family: 'Button', export: 'Button', slug: 'button', source: buttonPath, parts: ['root'] },
    { family: 'IconButton', export: 'IconButton', slug: 'icon-button', source: iconButtonPath, parts: ['root'] },
    { family: 'UsesButton', export: 'UsesButton', slug: 'uses-button', source: sharedPath, parts: ['root'] },
    { family: 'Unrelated', export: 'Unrelated', slug: 'unrelated', source: sharedPath, parts: ['root'] },
  ];
  const result = analyzeReactStyleChange({
    records,
    sourcePath: 'packages/react/src/styles/button.css',
    before: '.muxui-button { color: black; }',
    after: '.muxui-button { color: white; }',
    moduleSources: {
      [buttonPath]: { before: buttonSource, after: buttonSource },
      [iconButtonPath]: { before: iconButtonSource, after: iconButtonSource },
      [sharedPath]: { before: sharedSource, after: sharedSource },
    },
  });

  assert.deepEqual(result.families, ['Button', 'IconButton', 'UsesButton']);
  assert.match(result.reason, /runtime consumers: IconButton, UsesButton/u);
});

test('selector lists union owners and longest slug matching distinguishes InputTags', () => {
  const result = analyzeReactStyleChange({
    records: supplementalRecords,
    sourcePath: 'packages/react/src/styles/test.css',
    before: '.muxui-input, .muxui-input-tags { color: black; }',
    after: '.muxui-input, .muxui-input-tags { color: white; }',
  });

  assert.deepEqual(result.families, ['Input', 'InputTags']);
});

test('duplicate selector rules are compared independently', () => {
  const result = analyzeReactStyleChange({
    records: collectionRecords,
    sourcePath: 'packages/react/src/styles/test.css',
    before: '.muxui-tree { color: black; } .muxui-tree { background: white; }',
    after: '.muxui-tree { color: blue; } .muxui-tree { background: white; }',
  });

  assert.deepEqual(result.families, ['Tree']);
});

test('nested selectors inside at-rules inherit canonical root ownership', () => {
  const before = `
    @media (min-width: 40rem) {
      .muxui-tree {
        color: black;
        & .muxui-tree-item { color: black; }
      }
    }
  `;
  const after = before.replace('& .muxui-tree-item { color: black; }', '& .muxui-tree-item { color: white; }');
  const result = analyzeReactStyleChange({
    records: collectionRecords,
    sourcePath: 'packages/react/src/styles/test.css',
    before,
    after,
  });

  assert.deepEqual(result.families, ['Tree']);
  assert.match(result.reason, /@media/u);
});

test('declaration order relative to nested rules and at-rules is semantic', () => {
  const nestedBefore = '.muxui-tree { color: red; color: blue; & { color: green; } }';
  const nestedAfter = '.muxui-tree { color: red; & { color: green; } color: blue; }';
  const nestedImpact = analyzeReactStyleChange({
    records: collectionRecords,
    sourcePath: 'packages/react/src/styles/test.css',
    before: nestedBefore,
    after: nestedAfter,
  });
  assert.deepEqual(nestedImpact.families, ['Tree']);

  const atRuleBefore = '.muxui-tree { color: red; color: blue; @media (min-width: 40rem) { & { color: green; } } }';
  const atRuleAfter = '.muxui-tree { color: red; @media (min-width: 40rem) { & { color: green; } } color: blue; }';
  const atRuleImpact = analyzeReactStyleChange({
    records: collectionRecords,
    sourcePath: 'packages/react/src/styles/test.css',
    before: atRuleBefore,
    after: atRuleAfter,
  });
  assert.deepEqual(atRuleImpact.families, ['Tree']);

  const nestedAtRuleBefore = '.muxui-tree { @media (width > 1px) { color: red; color: blue; & { color: green; } } }';
  const nestedAtRuleAfter = '.muxui-tree { @media (width > 1px) { color: red; & { color: green; } color: blue; } }';
  const nestedAtRuleImpact = analyzeReactStyleChange({
    records: collectionRecords,
    sourcePath: 'packages/react/src/styles/test.css',
    before: nestedAtRuleBefore,
    after: nestedAtRuleAfter,
  });
  assert.deepEqual(nestedAtRuleImpact.families, ['Tree']);

  const formatted = analyzeReactStyleChange({
    records: collectionRecords,
    sourcePath: 'packages/react/src/styles/test.css',
    before: '.muxui-tree{color:red;color:blue;&{color:green;}}',
    after: '.muxui-tree {\n  color: red;\n  color: blue;\n  & { color: green; }\n}',
  });
  assert.deepEqual(formatted.families, []);
  assert.match(formatted.reason, /semantically unchanged/u);
});

test('CSS rule reordering is an impact while insertion preserves unaffected rule owners', () => {
  const records = [...collectionRecords, ...supplementalRecords, {
    family: 'Avatar', export: 'Avatar', slug: 'avatar', source: supplementalPath, parts: ['root'],
  }];
  const before = `
    @media (min-width: 40rem) {
      .muxui-tree.foo { color: black; }
      .muxui-tree.bar { color: white; }
    }
  `;
  const after = `
    @media (min-width: 40rem) {
      .muxui-tree.bar { color: white; }
      .muxui-tree.foo { color: black; }
    }
  `;
  const reordered = analyzeReactStyleChange({
    records,
    sourcePath: 'packages/react/src/styles/test.css',
    before,
    after,
  });
  assert.deepEqual(reordered.families, ['Tree']);
  assert.match(reordered.reason, /\.muxui-tree\.foo/u);
  assert.match(reordered.reason, /\.muxui-tree\.bar/u);

  const threeRuleReorder = analyzeReactStyleChange({
    records,
    sourcePath: 'packages/react/src/styles/test.css',
    before: '.muxui-tree .shared-content { color: red; } .muxui-avatar { color: blue; } .muxui-tag-select .shared-content { color: green; }',
    after: '.muxui-tag-select .shared-content { color: green; } .muxui-tree .shared-content { color: red; } .muxui-avatar { color: blue; }',
  });
  assert.deepEqual(threeRuleReorder.families, ['Avatar', 'TagSelect', 'Tree']);

  const inserted = analyzeReactStyleChange({
    records,
    sourcePath: 'packages/react/src/styles/test.css',
    before: '.muxui-tree { color: black; } .muxui-tag-select { color: black; }',
    after: '.muxui-tree { color: black; } .muxui-input { color: white; } .muxui-tag-select { color: black; }',
  });
  assert.deepEqual(inserted.families, ['Input']);
});

test('selector ownership excludes negative qualifiers and checks bounded versus unbounded pseudos', () => {
  const records = [...collectionRecords, {
    family: 'Table', export: 'Table', slug: 'table', source: collectionsPath, parts: ['root', 'row', 'cell'],
  }];
  const analyze = (selector) => analyzeReactStyleChange({
    records,
    sourcePath: 'packages/react/src/styles/test.css',
    before: `${selector} { color: black; }`,
    after: `${selector} { color: white; }`,
  });

  assert.deepEqual(analyze('.muxui-tree:not(.external-widget)').families, ['Tree']);
  assert.deepEqual(analyze('.muxui-tree:has(.external-widget)').families, ['Tree']);
  assert.deepEqual(analyze(':is(.muxui-tree, .muxui-table)').families, ['Table', 'Tree']);
  assert.throws(() => analyze(':not(.muxui-tree)'), /changed selector.*no canonical family owner/u);
  assert.throws(() => analyze('main:has(.muxui-tree)'), /relational selector :has\(\).*canonical owner/u);
  assert.throws(() => analyze(':is(.muxui-tree, .external-widget)'), /:is\(\) alternative.*no canonical component owner/u);
  assert.throws(() => analyze(':is(.muxui-tree, :focus)'), /:is\(\) alternative.*no canonical component owner/u,
    'a state alternative cannot borrow ownership from another :is() alternative');
});

test('state-only :is alternatives inherit the anchored owner for the real Autocomplete selector', async () => {
  const sourcePath = 'packages/react/src/styles/fields.css';
  const after = await readFile(path.join(repositoryRoot, sourcePath), 'utf8');
  const before = after.replace(
    'box-shadow: 0 0 0 3px var(--muxui-semantic-feedback-invalid-focus);',
    'box-shadow: 0 0 0 3px var(--muxui-semantic-focus-ring);',
  );
  assert.notEqual(before, after, 'fixture must update the real focused Autocomplete rule');
  const records = [{
    family: 'Autocomplete', export: 'Autocomplete', slug: 'autocomplete',
    source: 'packages/react/src/collections.mjs', parts: ['root', 'label', 'input'],
  }];

  const result = analyzeReactStyleChange({ records, sourcePath, before, after });
  assert.deepEqual(result.families, ['Autocomplete']);
  assert.match(result.reason, /\.muxui-autocomplete-search\[data-invalid\].*\.muxui-field-input:is\(:focus,\[data-focused\]\)/u);
});

test('unknown and global selectors fail while formatting-only CSS is a semantic no-op', () => {
  assert.throws(
    () => analyzeReactStyleChange({
      records: supplementalRecords,
      sourcePath: 'packages/react/src/styles/test.css',
      before: '.external-widget { color: black; }',
      after: '.external-widget { color: white; }',
    }),
    /MUXUI_CI_IMPACT_STYLE_OWNERSHIP: changed selector/u,
  );

  assert.throws(
    () => analyzeReactStyleChange({
      records: supplementalRecords,
      sourcePath: 'packages/react/src/styles/test.css',
      before: ':root { --muxui-color: black; }',
      after: ':root { --muxui-color: white; }',
    }),
    /requires its shared theme\/style owner/u,
  );

  const noOp = analyzeReactStyleChange({
    records: supplementalRecords,
    sourcePath: 'packages/react/src/styles/test.css',
    before: '.muxui-tag-select { color: black; }',
    after: '/* formatting */\n.muxui-tag-select{color:black;}',
  });
  assert.deepEqual(noOp.families, []);
  assert.equal(noOp.theme, false);
  assert.match(noOp.reason, /semantically unchanged/u);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { compareStorybookGeneratorEmissions } from '../src/storybook-generator-impact.mjs';

const storyDirectory = 'apps/react-storybook/.storybook/generated';

const pageIndex = [
  {
    family: 'Tree',
    storyFile: `${storyDirectory}/tree.stories.mjs`,
    stories: [
      { id: 'tree--default', exportName: 'Default' },
      { id: 'tree--states', exportName: 'States' },
    ],
  },
  {
    family: 'TagSelect',
    storyFile: `${storyDirectory}/tag-select.stories.mjs`,
    stories: [
      { id: 'tag-select--default', exportName: 'Default' },
      { id: 'tag-select--states', exportName: 'States' },
    ],
  },
];

function fixtureSource(files) {
  const writes = Object.entries(files).map(([name, content]) => (
    `await writeFile(resolve(generatedRoot, ${JSON.stringify(name)}), ${JSON.stringify(content)}, 'utf8');`
  )).join('\n');
  return [
    "import { mkdir, writeFile } from 'node:fs/promises';",
    "import { resolve } from 'node:path';",
    "const generatedRoot = '/redirected-by-the-impact-check';",
    'await mkdir(generatedRoot, { recursive: true });',
    writes,
  ].join('\n');
}

function storySource({ defaultTitle = 'Tree', states = 'states' } = {}) {
  return [
    `export default { title: ${JSON.stringify(defaultTitle)} };`,
    "export const Default = () => 'default';",
    `export const States = () => ${JSON.stringify(states)};`,
  ].join('\n');
}

test('generator emission comparison maps one changed export to its exact page', async () => {
  const beforeSource = fixtureSource({
    'tree.stories.mjs': storySource(),
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
    'manifest.mjs': 'export default { generated: true };',
  });
  const afterSource = fixtureSource({
    'tree.stories.mjs': storySource({ states: 'updated states' }),
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
    'manifest.mjs': 'export default { generated: true };',
  });

  const impact = await compareStorybookGeneratorEmissions({ beforeSource, afterSource, pageIndex });
  assert.deepEqual(impact.storyIds, ['tree--states']);
  assert.match(impact.reason, /canonical pages/u);
});

test('shared emitted template changes select all pages in the affected families', async () => {
  const beforeSource = fixtureSource({
    'tree.stories.mjs': storySource(),
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
  });
  const afterSource = fixtureSource({
    'tree.stories.mjs': storySource({ defaultTitle: 'Shared template' }),
    'tag-select.stories.mjs': storySource({ defaultTitle: 'Shared template' }),
  });

  const impact = await compareStorybookGeneratorEmissions({ beforeSource, afterSource, pageIndex });
  assert.deepEqual(impact.storyIds, [
    'tag-select--default', 'tag-select--states', 'tree--default', 'tree--states',
  ]);
});

test('changed generated example helpers select only their importing story export', async () => {
  const helperPageIndex = [{
    family: 'NumberField',
    storyFile: `${storyDirectory}/number-field.stories.mjs`,
    stories: [
      { id: 'number-field--default', exportName: 'Default' },
      { id: 'number-field--sizing', exportName: 'Sizing' },
    ],
  }];
  const storyFile = 'number-field.stories.mjs';
  const helperFile = 'number-field-sizing.example.mjs';
  const story = [
    "import { sizing } from './number-field-sizing.example.mjs';",
    "export const Default = () => 'default';",
    'export const Sizing = () => sizing;',
  ].join('\n');
  const beforeSource = fixtureSource({
    [storyFile]: story,
    [helperFile]: "export const sizing = 'before';",
  });
  const afterSource = fixtureSource({
    [storyFile]: story,
    [helperFile]: "export const sizing = 'after';",
  });

  const impact = await compareStorybookGeneratorEmissions({
    beforeSource,
    afterSource,
    pageIndex: helperPageIndex,
  });
  assert.deepEqual(impact.storyIds, ['number-field--sizing']);
});

test('manifest-only generator metadata changes do not select page audits', async () => {
  const beforeSource = fixtureSource({
    'tree.stories.mjs': `${storySource()}\nexport const __namedExportsOrder = ['Default', 'States'];`,
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
    'manifest.mjs': 'export default { schema: 1 };',
  });
  const afterSource = fixtureSource({
    'tree.stories.mjs': `${storySource()}\nexport const __namedExportsOrder = ['Default', 'States'];`,
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
    'manifest.mjs': 'export default { schema: 2, pageIndex: true };',
  });

  const impact = await compareStorybookGeneratorEmissions({ beforeSource, afterSource, pageIndex });
  assert.deepEqual(impact.storyIds, []);
  assert.match(impact.reason, /manifest metadata only/u);
});

test('head CSF inventory detects aliased named exports absent from pageIndex', async () => {
  const beforeSource = fixtureSource({
    'tree.stories.mjs': storySource(),
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
  });
  const afterSource = fixtureSource({
    'tree.stories.mjs': `${storySource()}\nconst Extra = () => 'extra';\nexport { Extra as ExtraStory };`,
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
  });

  await assert.rejects(
    compareStorybookGeneratorEmissions({ beforeSource, afterSource, pageIndex }),
    /STORYBOOK_GENERATOR_PAGE_EXPORT_UNKNOWN.*ExtraStory/u,
  );
});

test('head inventory rejects an unchanged orphan CSF file omitted from pageIndex', async () => {
  const source = fixtureSource({
    'tree.stories.mjs': storySource(),
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
    'orphan.stories.mjs': storySource({ defaultTitle: 'Orphan' }),
  });

  await assert.rejects(
    compareStorybookGeneratorEmissions({ beforeSource: source, afterSource: source, pageIndex }),
    /STORYBOOK_GENERATOR_PAGE_OUTPUT_UNKNOWN.*orphan\.stories\.mjs/u,
  );
});

test('head inventory allows a removed story file absent from the new pageIndex', async () => {
  const beforeSource = fixtureSource({
    'tree.stories.mjs': storySource(),
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
  });
  const afterSource = fixtureSource({
    'tree.stories.mjs': storySource(),
  });
  const headPageIndex = [pageIndex[0]];

  const impact = await compareStorybookGeneratorEmissions({ beforeSource, afterSource, pageIndex: headPageIndex });
  assert.deepEqual(impact.storyIds, []);
  assert.match(impact.reason, /removed CSF outputs have no head page owner.*tag-select\.stories\.mjs/u);
});

test('unmapped generator emissions fail with an actionable diagnostic', async () => {
  const beforeSource = fixtureSource({
    'tree.stories.mjs': storySource(),
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
  });
  const afterSource = fixtureSource({
    'tree.stories.mjs': storySource(),
    'tag-select.stories.mjs': storySource({ defaultTitle: 'TagSelect' }),
    'unowned-output.mjs': 'export const helper = true;',
  });

  await assert.rejects(
    compareStorybookGeneratorEmissions({ beforeSource, afterSource, pageIndex }),
    /STORYBOOK_GENERATOR_OUTPUT_UNMAPPED.*unowned-output\.mjs/u,
  );
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  buildPullRequestImpact,
  callsBrowserEngines,
  changedLockfileImporters,
  executeCommand,
  executeCommands,
  executionCommands,
  executionGroups,
  executionMode,
  fullWorkspacePlan,
  groupBrowserEngines,
  groupMatrix,
  groupPackageDirectories,
  isPolicyOnlyLockfileChange,
  isWorkspaceWideChange,
  needsStorybookGeneration,
  normalizeCommand,
  parseCliArguments,
  preparedCommandRunner,
  prepareStorybookMetadata,
  reactPackageWideChanges,
  rootPackageWideChanges,
  runCiImpact,
  shardStoryRun,
  storyShardPageBudget,
  validateScopedEntrypoints,
  workspaceDependentRoutes,
} from '../src/ci-impact.mjs';
import {
  affectedReason,
  createGitHubClient,
  decideReuse,
  groupSignature,
  loadEarlierRuns,
  planReuse,
  reuseBlockedPath,
  reuseDisabledReason,
  reuseRecord,
} from '../src/ci-reuse.mjs';
import { componentTestSelection } from '../src/component-test-selection.mjs';
import { loadPolicy } from '../src/policy.mjs';
import { dependencyClosure, familyRecordsFromContract } from '../src/scoped-verification.mjs';
import { discoverWorkspacePackages } from '../src/workspace-packages.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const config = (await loadPolicy(repositoryRoot)).pullRequestImpact;
const supplementalPath = 'packages/react/src/supplemental/index.mjs';
const collectionsPath = 'packages/react/src/collections.mjs';
const fieldsPath = 'packages/react/src/fields.mjs';
const sizingExamplePath = 'catalog/components/number-field/examples/react/sizing.tsx';
const sizingStoryId = 'muxui-react-r1-2-number-field--sizing';

const records = [
  { family: 'MultiSelect', export: 'MultiSelect', slug: 'multi-select', source: supplementalPath, parts: ['root', 'input', 'tag'] },
  { family: 'NumberField', export: 'NumberField', slug: 'number-field', source: fieldsPath, parts: ['root', 'input', 'stepper'] },
  { family: 'TagSelect', export: 'TagSelect', slug: 'tag-select', source: supplementalPath, parts: ['root', 'input', 'tag'] },
  { family: 'Tree', export: 'Tree', slug: 'tree', source: collectionsPath, parts: ['root', 'item', 'children'] },
];

const pageIndex = [
  {
    family: 'MultiSelect',
    storyFile: 'apps/react-storybook/.storybook/generated/multi-select.stories.mjs',
    stories: [
      { id: 'muxui-react-r1-6-multi-select--default', exportName: 'Default', name: 'Default' },
      { id: 'muxui-react-r1-6-multi-select--states', exportName: 'States', name: 'States' },
    ],
  },
  {
    family: 'NumberField',
    storyFile: 'apps/react-storybook/.storybook/generated/number-field.stories.mjs',
    stories: [
      { id: 'muxui-react-r1-2-number-field--default', exportName: 'Default', name: 'Default' },
      { id: sizingStoryId, exportName: 'Sizing', name: 'Sizing', source: sizingExamplePath },
    ],
  },
  {
    family: 'TagSelect',
    storyFile: 'apps/react-storybook/.storybook/generated/tag-select.stories.mjs',
    stories: [
      { id: 'muxui-react-r1-6-tag-select--default', exportName: 'Default', name: 'Default' },
      { id: 'muxui-react-r1-6-tag-select--states', exportName: 'States', name: 'States' },
    ],
  },
  {
    family: 'Tree',
    storyFile: 'apps/react-storybook/.storybook/generated/tree.stories.mjs',
    stories: [
      { id: 'muxui-react-r1-3-tree--default', exportName: 'Default', name: 'Default' },
      { id: 'muxui-react-r1-3-tree--states', exportName: 'States', name: 'States' },
      { id: 'muxui-react-r1-3-tree--browser-proof', exportName: 'BrowserProof', name: 'BrowserProof' },
    ],
  },
];

// Block (pattern) pages are not component families; the planner selects them by story ID.
const blockPages = [
  {
    family: 'Poster grid',
    storyFile: 'apps/react-storybook/.storybook/generated/block-poster-grid.stories.mjs',
    stories: [
      { id: 'muxui-block-poster-grid--css-grid', exportName: 'CssGrid', name: 'CssGrid', source: 'catalog/patterns/poster-grid/examples/react/css-grid.tsx' },
      { id: 'muxui-block-poster-grid--virtualized', exportName: 'Virtualized', name: 'Virtualized', source: 'catalog/patterns/poster-grid/examples/react/virtualized.tsx' },
    ],
  },
  {
    family: 'Task filters',
    storyFile: 'apps/react-storybook/.storybook/generated/block-task-filters.stories.mjs',
    stories: [{ id: 'muxui-block-task-filters--filter-bar', exportName: 'FilterBar', name: 'FilterBar', source: 'catalog/patterns/task-filters/examples/react/filter-bar.tsx' }],
  },
];

// Workspace links mirror the real package.json files.
const packages = [
  { name: '@muxui/catalog', path: 'packages/catalog', manifest: { dependencies: { '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/docs', path: 'apps/docs', manifest: { dependencies: { '@muxui/catalog': 'workspace:*', '@muxui/react': 'workspace:*' }, devDependencies: { '@muxui/tooling': 'workspace:*' }, scripts: { check: 'node ../../tooling/audits/repository-policy/src/prepare-prerequisites.mjs @muxui/docs^... && check' } } },
  { name: '@muxui/figma', path: 'tooling/generators/figma', manifest: { dependencies: { '@muxui/react': 'workspace:*', '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { check: 'check' } } },
  { name: '@muxui/foundation', path: 'packages/foundation', manifest: { scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/react', path: 'packages/react', manifest: { devDependencies: { '@muxui/catalog': 'workspace:*', '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { generate: 'generate', check: 'check', 'check:browser': 'node --test --test-concurrency=1 test/browser/*.test.mjs', 'check:component': 'node ../../tooling/audits/repository-policy/src/run-component-check.mjs' } } },
  { name: '@muxui/react-native', path: 'packages/react-native', manifest: { dependencies: { '@muxui/foundation': 'workspace:*' }, devDependencies: { '@muxui/catalog': 'workspace:*', '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/react-playground', path: 'apps/react-playground', manifest: { dependencies: { '@muxui/react': 'workspace:*' }, scripts: { check: 'check' } } },
  { name: '@muxui/react-storybook', path: 'apps/react-storybook', manifest: { dependencies: { '@muxui/react': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { generate: 'generate', 'check:scoped': 'node src/check-scoped.mjs' } } },
  { name: '@muxui/repository-policy', path: 'tooling/audits/repository-policy', manifest: { dependencies: { '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*', '@muxui/tooling': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/scale', path: 'apps/scale', manifest: { dependencies: { '@muxui/react': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { check: 'node ../../tooling/audits/repository-policy/src/prepare-prerequisites.mjs @muxui/react... && check' } } },
  { name: '@muxui/schema', path: 'packages/schema', manifest: { dependencies: {}, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/tokens', path: 'packages/tokens', manifest: { dependencies: { '@muxui/schema': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/tooling', path: 'packages/tooling', manifest: { dependencies: { '@muxui/catalog': 'workspace:*', '@muxui/schema': 'workspace:*' }, scripts: { generate: 'generate' } } },
  { name: '@muxui/web', path: 'packages/web', manifest: { devDependencies: { '@muxui/catalog': 'workspace:*', '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
];

const componentTestPaths = [
  'test/browser/tag-select-focus.test.mjs',
  'test/browser/tree-toggle-browser.test.mjs',
  'test/r1-3-parity.test.mjs',
  'test/style-scopes.test.mjs',
  'test/styling-tokens.test.mjs',
  'test/supplemental.test.mjs',
];
const componentTestSources = Object.fromEntries(await Promise.all(componentTestPaths.map(async (path) => [
  path,
  await readFile(resolve(repositoryRoot, 'packages/react', path), 'utf8'),
])));
const cssModuleSources = {
  [collectionsPath]: 'export const Tree = () => null;',
  [fieldsPath]: 'export const NumberField = () => null;',
  [supplementalPath]: 'export const MultiSelect = () => null; export const TagSelect = () => null;',
};

function inputFor(changedPaths, options = {}) {
  const { textSnapshots = {}, ...overrides } = options;
  return {
    changedPaths,
    config,
    records,
    pageIndex,
    packages,
    readBaseText: async (path) => textSnapshots[path]?.before ?? null,
    readHeadText: async (path) => textSnapshots[path]?.after ?? null,
    moduleSources: {},
    componentTestSources,
    ...overrides,
  };
}

function packagesWithScript(packageName, scriptName, value) {
  const result = structuredClone(packages);
  const owner = result.find(({ name }) => name === packageName);
  owner.manifest.scripts[scriptName] = value;
  return result;
}

function plan(changedPaths, options = {}) {
  return buildPullRequestImpact(inputFor(changedPaths, options));
}

function selectComponentTests(families) {
  return componentTestSelection(
    records.filter(({ family }) => families.includes(family)),
    Object.keys(componentTestSources),
    { includeSharedSource: false, testSources: componentTestSources },
  );
}

function lockfile(policyImporter, reactImporter = '') {
  return [
    "lockfileVersion: '9.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '',
    'importers:',
    '  tooling/audits/repository-policy:',
    policyImporter,
    '  packages/react:',
    reactImporter,
    '',
    'packages:',
    '  acorn@8.18.0:',
    '    resolution: {integrity: sha512-fixture}',
    '',
    'snapshots:',
    '  acorn@8.18.0:',
    '    dependencies:',
    '      dependency: 1.0.0',
    '',
  ].join('\n');
}

test('TagSelect helper runtime changes route to TagSelect pages and its focused tests only', async () => {
  const source = await readFile(resolve(repositoryRoot, supplementalPath), 'utf8');
  const before = source.replace('    slot: null,\n', '');
  assert.notEqual(before, source, 'fixture must represent the pre-fix TagSelect helper');

  const result = await plan([supplementalPath], {
    records: records.filter(({ family }) => ['TagSelect', 'MultiSelect'].includes(family)),
    textSnapshots: { [supplementalPath]: { before, after: source } },
    moduleSources: { [supplementalPath]: { before, after: source } },
  });

  assert.deepEqual(result.reactFamilies, ['TagSelect']);
  assert.deepEqual(result.storyRuns, [{
    proof: 'component',
    families: ['TagSelect'],
    storyIds: [],
    reason: 'all pages in the affected component families',
  }]);
  assert.deepEqual(result.reactTestFiles, ['test/motion-package-boundary.test.mjs']);
  assert.ok(!result.storyRuns.some(({ families }) => families.includes('MultiSelect')));

  const selection = selectComponentTests(['TagSelect']);
  assert.deepEqual(selection.files, [
    'test/browser/tag-select-focus.test.mjs',
    'test/style-scopes.test.mjs',
    'test/styling-tokens.test.mjs',
    'test/supplemental.test.mjs',
  ]);
  assert.deepEqual(selection.testNamesByFile['test/supplemental.test.mjs'], [
    'TagSelect preserves combobox filtering and chip focus/removal keyboard behavior',
    'TagSelect preserves selected-key order for controlled chips and removals',
    'TagSelect server-renders and mounts item render functions that return any content',
  ]);
});

test('a new supplemental family with no test of its own plans its supplemental group instead of failing', async () => {
  const source = await readFile(resolve(repositoryRoot, supplementalPath), 'utf8');
  const after = `${source}\nexport const ScratchWidget = () => null;\n`;
  const scratch = { family: 'ScratchWidget', export: 'ScratchWidget', slug: 'scratch-widget', source: supplementalPath, parts: ['root'] };
  const scratchPage = {
    family: 'ScratchWidget',
    storyFile: 'apps/react-storybook/.storybook/generated/scratch-widget.stories.mjs',
    stories: [{ id: 'muxui-react-r1-6-scratch-widget--default', exportName: 'Default', name: 'Default' }],
  };
  const result = await plan([supplementalPath], {
    records: [...records.filter(({ family }) => ['TagSelect', 'MultiSelect'].includes(family)), scratch],
    pageIndex: [...pageIndex, scratchPage],
    textSnapshots: { [supplementalPath]: { before: source, after } },
    moduleSources: { [supplementalPath]: { before: source, after } },
  });
  assert.deepEqual(result.reactFamilies, ['ScratchWidget']);
  assert.deepEqual(result.reactBehaviorProofFamilies, []);
  assert.ok(result.reactComponentTests.includes('test/supplemental.test.mjs'));
  // The group runs whole: the check names no per-case filter in the plan.
  const react = executionGroups(result, { packages, environment: {}, pageIndex: [...pageIndex, scratchPage], testSources: componentTestSources })
    .find(({ id }) => id === 'react');
  assert.equal(react.commands.find(({ args }) => args.includes('check:component')).env.MUXUI_COMPONENT_FAMILIES, 'ScratchWidget');
});

test('Tree browser-proof edits select their exact test file without story or family expansion', async () => {
  const result = await plan(['packages/react/test/browser/tree-toggle-browser.test.mjs']);

  assert.deepEqual(result.reactTestFiles, ['test/browser/tree-toggle-browser.test.mjs']);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.storyRuns, []);
  assert.equal(result.tailwind, false);
});

test('a canonical NumberField sizing example selects only its exact generated story page', async () => {
  const result = await plan([sizingExamplePath]);

  assert.deepEqual(result.storyIds, [sizingStoryId]);
  assert.deepEqual(result.storyIdFamilies, { [sizingStoryId]: 'NumberField' });
  assert.deepEqual(result.storyRuns, [{
    proof: 'story',
    families: ['NumberField'],
    storyIds: [sizingStoryId],
    reason: 'only the exact canonical story pages whose sources changed',
  }]);
  assert.deepEqual(result.storyFamilies, []);
  assert.equal(result.storyChrome, false);
});

test('generated CSF export changes select only the matching page ID', async () => {
  const path = 'apps/react-storybook/.storybook/generated/tree.stories.mjs';
  const before = [
    'export const Default = makeStory("default");',
    'export const States = makeStory("states");',
    'export const BrowserProof = makeStory("browser");',
  ].join('\n');
  const after = before.replace('makeStory("states")', 'makeStory("updated states")');
  const result = await plan([path], { textSnapshots: { [path]: { before, after } } });

  assert.deepEqual(result.storyIds, ['muxui-react-r1-3-tree--states']);
  assert.deepEqual(result.storyIdFamilies, { 'muxui-react-r1-3-tree--states': 'Tree' });
  assert.deepEqual(result.storyRuns.map(({ proof, families, storyIds }) => ({ proof, families, storyIds })), [{
    proof: 'story',
    families: ['Tree'],
    storyIds: ['muxui-react-r1-3-tree--states'],
  }]);
  assert.equal(result.storyChrome, false);
});

test('Storybook CI family selections project substrate families through public exports', async () => {
  const recordsWithModal = [...records, {
    family: 'Modal', export: 'Dialog', slug: 'dialog', source: 'packages/react/src/overlays.mjs', parts: ['root', 'trigger', 'panel'],
  }];
  const sharedStorybook = await plan(['apps/react-storybook/src/storybook-factory.mjs'], { records: recordsWithModal });
  const families = sharedStorybook.storyRuns[0].families;
  assert.ok(families.includes('Dialog'));
  assert.ok(!families.includes('Modal'));
  const command = executionCommands(sharedStorybook, { packages, environment: {} })
    .find(({ args }) => args.includes('check:scoped'));
  const selected = command.env.MUXUI_STORYBOOK_FAMILIES.split(',');
  assert.ok(selected.includes('Dialog'));
  assert.ok(!selected.includes('Modal'));

  const overlaysPath = 'packages/react/src/overlays.mjs';
  const dialogBefore = 'export const Dialog = () => null;';
  const dialogAfter = 'export const Dialog = () => 1;';
  const sourceChange = await plan([overlaysPath], {
    records: recordsWithModal,
    pageIndex: [{ family: 'Dialog', stories: [{ exportName: 'BrowserProof' }] }],
    textSnapshots: { [overlaysPath]: { before: dialogBefore, after: dialogAfter } },
    moduleSources: {
      ...cssModuleSources,
      [overlaysPath]: { before: dialogBefore, after: dialogAfter },
    },
  });
  assert.deepEqual(sourceChange.reactFamilies, ['Modal']);
  assert.deepEqual(sourceChange.reactBehaviorProofFamilies, ['Modal']);
  assert.deepEqual(sourceChange.storyRuns[0].families, ['Dialog']);
});

test('generator tooling checks emitted page IDs only when the generator output changes', async () => {
  const path = 'apps/react-storybook/src/generate-stories.mjs';
  const metadataOnly = await plan([path], {
    textSnapshots: { [path]: { before: 'export const before = true;', after: 'export const after = true;' } },
    compareGeneratorEmissions: async () => ({ storyIds: [], reason: 'manifest metadata only; story outputs unchanged' }),
  });
  assert.deepEqual(metadataOnly.storyRuns, []);
  assert.equal(metadataOnly.storyTooling, true);
  const metadataCommands = executionCommands(metadataOnly, { packages });
  assert.ok(metadataCommands.some(({ args }) => args.includes('generate:check')));
  assert.ok(!metadataCommands.some(({ args }) => args.includes('check:scoped')));

  const emittedPage = await plan([path], {
    textSnapshots: { [path]: { before: 'export const before = true;', after: 'export const after = true;' } },
    compareGeneratorEmissions: async () => ({ storyIds: [sizingStoryId], reason: 'changed emitted Sizing export' }),
  });
  assert.deepEqual(emittedPage.storyRuns, [{
    proof: 'story', families: ['NumberField'], storyIds: [sizingStoryId],
    reason: 'only the exact canonical story pages whose sources changed',
  }]);
  const pageCommands = executionCommands(emittedPage, { packages, environment: {} });
  assert.equal(pageCommands.filter(({ args }) => args.includes('check:scoped')).length, 1);
  assert.deepEqual(pageCommands.at(-1).env, {
    MUXUI_STORYBOOK_AUDIT_PROOF: 'story',
    MUXUI_STORYBOOK_FAMILIES: 'NumberField',
    MUXUI_STORYBOOK_STORY_IDS: sizingStoryId,
    MUXUI_STORYBOOK_A11Y_WORKERS: '1',
    MUXUI_STORYBOOK_COLORS_WORKERS: '2',
  });
});

test('isolated component CSS selects its owner while a shared selector unions owners', async () => {
  const path = 'packages/react/src/styles/components.css';
  const isolated = await plan([path], {
    textSnapshots: { [path]: { before: '.muxui-tree { color: black; }', after: '.muxui-tree { color: white; }' } },
    moduleSources: cssModuleSources,
  });
  assert.deepEqual(isolated.reactFamilies, ['Tree']);
  assert.deepEqual(isolated.storyRuns[0].families, ['Tree']);
  const isolatedRoute = selectComponentTests(isolated.reactFamilies);
  assert.ok(isolatedRoute.files.includes('test/browser/tree-toggle-browser.test.mjs'));
  assert.ok(!isolatedRoute.files.includes('test/browser/tag-select-focus.test.mjs'));

  const shared = await plan([path], {
    textSnapshots: {
      [path]: {
        before: '.muxui-tree, .muxui-tag-select__input { color: black; }',
        after: '.muxui-tree, .muxui-tag-select__input { color: white; }',
      },
    },
    moduleSources: cssModuleSources,
  });
  assert.deepEqual(shared.reactFamilies, ['TagSelect', 'Tree']);
  assert.deepEqual(shared.storyRuns[0].families, ['TagSelect', 'Tree']);
  const sharedRoute = selectComponentTests(shared.reactFamilies);
  assert.ok(sharedRoute.files.includes('test/browser/tree-toggle-browser.test.mjs'));
  assert.ok(sharedRoute.files.includes('test/browser/tag-select-focus.test.mjs'));
});

test('token changes request compiler and theme contrast proof without behavior audits', async () => {
  const result = await plan(['catalog/tokens/default-theme.json']);

  assert.equal(result.catalog, true);
  assert.equal(result.tokens, true);
  assert.equal(result.reactTheme, true);
  assert.equal(result.storyTheme, true);
  // The token source belongs to @muxui/tokens, so its runtime dependents
  // (catalog, docs, Scale, Figma, tooling, policy) run whole; React keeps its
  // theme proof rather than the full package check.
  assert.equal(result.docs && result.scale && result.policy, true);
  assert.equal(result.reactPackageFull, false);
  assert.deepEqual(result.packageChecks, ['@muxui/figma', '@muxui/react-native', '@muxui/tooling', '@muxui/web']);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.reactTestFiles, []);
  assert.deepEqual(result.storyRuns.map(({ proof, families, storyIds }) => ({ proof, families, storyIds })), [
    { proof: 'theme', families: [], storyIds: [] },
    { proof: 'chrome', families: [], storyIds: [] },
  ]);
});

test('foundation guide changes validate the catalog, tooling dense goldens, and docs', async () => {
  const path = 'catalog/guides/foundations-component-tokens.md';
  const result = await plan([path]);

  assert.equal(result.catalog && result.docs, true);
  // Guides belong to @muxui/catalog: tooling and policy depend on it at
  // runtime, while React Native and Web devDependencies run their package
  // checks only. React's catalog devDependency is scoped.
  assert.deepEqual(result.packageChecks, ['@muxui/react-native', '@muxui/tooling', '@muxui/web']);
  assert.equal(result.policy, true);
  assert.equal(result.tokens || result.reactTheme || result.reactPackageFull || result.storyTooling, false);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.storyRuns, []);
  assert.equal(result.reasons[0], `${path} is a canonical guide; validate the catalog, its dense goldens, and the docs that render it`);
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['checks', 'browser-chromium']);
  assert.deepEqual(groups[0].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/repository-policy', 'run', 'check'],
    ['--filter', '@muxui/catalog', 'run', 'check'],
    ['--filter', '@muxui/docs', 'run', 'check'],
    ['--filter', '@muxui/react-native', 'run', 'check'],
    ['--filter', '@muxui/tooling', 'run', 'check'],
    ['--filter', '@muxui/web', 'run', 'check'],
  ]);
});

test('per-family usage guides take the guide route without selecting their component family', async () => {
  const result = await plan(['catalog/guides/number-field-usage.md', 'catalog/guides/number-field-usage.json']);

  assert.equal(result.catalog && result.docs, true);
  assert.deepEqual(result.packageChecks, ['@muxui/react-native', '@muxui/tooling', '@muxui/web']);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.storyRuns, []);
});

test('the shared component navigation helper selects the docs and every Storybook family', async () => {
  const result = await plan(['apps/component-navigation.mjs']);
  assert.equal(result.docs, true);
  assert.equal(result.scale || result.catalog || result.tokens || result.reactTheme, false);
  assert.deepEqual(result.storyRuns.map(({ proof }) => proof), ['component']);
  assert.deepEqual(result.storyRuns[0].families, records.map(({ family }) => family));
});

test('Scale, Starlight docs, and CI policy edits stay in their independent owner scopes', async () => {
  const scale = await plan(['apps/scale/test/browser/theme-builder.test.mjs']);
  assert.equal(scale.scale, true);
  assert.equal(scale.docs || scale.catalog || scale.tokens || scale.reactTheme || scale.storyTooling, false);
  assert.deepEqual(scale.storyRuns, []);

  // Docs embeds Scale's App by path, so Scale source also selects the docs owner.
  const scaleSource = await plan(['apps/scale/src/App.jsx']);
  assert.equal(scaleSource.scale && scaleSource.docs, true);
  assert.equal(scaleSource.catalog || scaleSource.tokens || scaleSource.reactTheme || scaleSource.storyTooling, false);

  const docs = await plan(['apps/docs/src/content/docs/foundations/index.mdx']);
  assert.equal(docs.docs, true);
  assert.equal(docs.scale || docs.reactPackageFull || docs.tailwind || docs.storyTooling, false);
  assert.deepEqual(docs.storyRuns, []);

  const policy = await plan(['.github/workflows/ci.yml']);
  assert.equal(policy.policy, true);
  assert.equal(policy.full, false);
  assert.equal(policy.docs || policy.scale || policy.reactPackageFull || policy.storyTooling, false);
  assert.deepEqual(policy.storyRuns, []);

  const guidance = await plan(['.gitignore', 'docs/agents/domain.md']);
  assert.equal(guidance.policy, true);
  assert.equal(guidance.full || guidance.docs, false);
});

test('root and directory guidance docs without another owner take the policy route', async () => {
  const guidancePaths = [
    'LICENSE', 'README.md', 'apps/AGENTS.md', 'apps/react-storybook/AGENTS.md', 'catalog/AGENTS.md',
    'packages/AGENTS.md', 'tests/AGENTS.md', 'tests/evidence/README.md', 'tests/fixtures/g1.2/AGENTS.md',
  ];
  for (const path of guidancePaths) {
    const result = await plan([path]);
    assert.equal(result.policy, true, path);
    assert.equal(result.full || result.catalog || result.docs || result.storyTooling, false, path);
    assert.deepEqual(result.storyRuns, [], path);
  }
});

test('policy-run fixture tests and retained evidence route to the repository-policy check', async () => {
  const paths = [
    'tests/fixtures/g0.4/corpus.json', 'tests/fixtures/g1.0/consumers/button-web.consumer.mjs',
    'tests/evidence/README.md', 'tests/evidence/g0.4/index.json',
  ];
  for (const path of paths) {
    const result = await plan([path]);
    assert.equal(result.policy, true, path);
    assert.equal(result.full || result.docs || result.scale || result.catalog || result.storyTooling, false, path);
    assert.deepEqual(executionCommands(result, { packages }).slice(1).map(({ args }) => args), [
      ['--filter', '@muxui/repository-policy', 'run', 'check'],
    ], path);
  }
});

test('Scale and docs changes run the Scale docs browser test as one ordinary check', async () => {
  // The script builds the docs itself, so a build failure fails only this check.
  const { scripts } = JSON.parse(readFileSync(resolve(repositoryRoot, 'apps/scale/package.json'), 'utf8'));
  assert.match(scripts['check:browser:docs'], /^pnpm --filter @muxui\/docs build && /u);
  for (const path of ['apps/scale/src/App.jsx', 'apps/scale/test/browser/docs-theme.test.mjs', 'apps/docs/src/pages/scale.astro']) {
    const groups = executionGroups(await plan([path]), { packages, environment: {}, pageIndex });
    const browser = groups.find(({ id }) => id === 'browser-chromium');
    assert.ok(browser, path);
    const command = browser.commands.find(({ args }) => args.includes('check:browser:docs'));
    assert.deepEqual(command?.args, ['--filter', '@muxui/scale', 'run', 'check:browser:docs'], path);
    assert.notEqual(command.prerequisite, true, path);
    assert.ok(!browser.commands.some(({ args }) => args.includes('build')), path);
  }
  const policy = executionGroups(await plan(['.github/workflows/ci.yml']), { packages, environment: {}, pageIndex });
  assert.ok(!policy.some(({ kind }) => kind === 'browser'));
});

test('root package scripts remain policy-scoped while workspace toolchain inputs require full proof', async () => {
  const before = JSON.stringify({ name: 'workspace', scripts: { check: 'old' } });
  const after = JSON.stringify({ name: 'workspace', scripts: { check: 'new' } });
  assert.deepEqual(rootPackageWideChanges(before, after), { full: false, reason: null });

  const metadata = await plan(['package.json'], { rootPackageBefore: before, rootPackageAfter: after });
  assert.equal(metadata.policy, true);
  assert.equal(metadata.full, false);
  assert.deepEqual(metadata.storyRuns, []);

  const toolchain = await plan(['.node-version']);
  assert.equal(toolchain.full, true);
  assert.match(toolchain.fullReasons.join(' '), /workspace-wide execution input/u);

  assert.deepEqual(rootPackageWideChanges(
    JSON.stringify({ name: 'workspace', engines: { node: '>=24' } }),
    JSON.stringify({ name: 'workspace', engines: { node: '>=25' } }),
  ), { full: true, reason: 'root workspace/toolchain fields changed: engines' });
});

test('scoped CI runner scripts stay bound to the exact React and Storybook entrypoints', async () => {
  const [reactManifest, storybookManifest] = await Promise.all([
    readFile(resolve(repositoryRoot, 'packages/react/package.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repositoryRoot, 'apps/react-storybook/package.json'), 'utf8').then(JSON.parse),
  ]);
  assert.deepEqual(validateScopedEntrypoints([
    { name: '@muxui/react', manifest: reactManifest },
    { name: '@muxui/react-storybook', manifest: storybookManifest },
  ], ['react', 'storybook']), ['react', 'storybook']);

  const source = await readFile(resolve(repositoryRoot, supplementalPath), 'utf8');
  const runtimePlan = await plan([supplementalPath], {
    records: records.filter(({ family }) => ['TagSelect', 'MultiSelect'].includes(family)),
    textSnapshots: { [supplementalPath]: { before: source.replace('    slot: null,\n', ''), after: source } },
    moduleSources: { [supplementalPath]: { before: source.replace('    slot: null,\n', ''), after: source } },
  });
  const componentCommand = executionCommands(runtimePlan, { packages })
    .find(({ args }) => args.includes('check:component'));
  assert.deepEqual(componentCommand.args, [
    '--filter', '@muxui/react', 'run', 'check:component',
  ]);
  assert.throws(
    () => executionCommands(runtimePlan, { packages: packagesWithScript('@muxui/react', 'check:component', 'pnpm check') }),
    /MUXUI_CI_IMPACT_SCOPED_ENTRYPOINT_INVALID: @muxui\/react check:component/u,
  );

  const pagePlan = await plan([sizingExamplePath]);
  const pageCommand = executionCommands(pagePlan, { packages })
    .find(({ args }) => args.includes('check:scoped'));
  assert.deepEqual(pageCommand.args, [
    '--filter', '@muxui/react-storybook', 'run', 'check:scoped',
  ]);
  assert.throws(
    () => executionCommands(pagePlan, { packages: packagesWithScript('@muxui/react-storybook', 'check:scoped', 'pnpm check') }),
    /MUXUI_CI_IMPACT_SCOPED_ENTRYPOINT_INVALID: @muxui\/react-storybook check:scoped/u,
  );

  for (const [packageName, scriptName, command] of [
    ['@muxui/react', 'check:component', 'pnpm check'],
    ['@muxui/react', 'check:component', ''],
    ['@muxui/react', 'check:component', 'node src/check.mjs'],
    ['@muxui/react-storybook', 'check:scoped', 'pnpm check'],
    ['@muxui/react-storybook', 'check:scoped', ''],
    ['@muxui/react-storybook', 'check:scoped', 'node test/storybook-a11y.test.mjs'],
  ]) {
    const scopedName = packageName === '@muxui/react' ? 'react' : 'storybook';
    assert.throws(
      () => validateScopedEntrypoints(packagesWithScript(packageName, scriptName, command), [scopedName]),
      /MUXUI_CI_IMPACT_SCOPED_ENTRYPOINT_INVALID/u,
    );
  }

  const reactScriptsBefore = JSON.stringify({ scripts: { 'check:component': 'old-scoped-command' } });
  const reactScriptsAfter = JSON.stringify({ scripts: { 'check:component': 'node ../../tooling/audits/repository-policy/src/run-component-check.mjs' } });
  const reactScriptOnly = await plan(['packages/react/package.json'], {
    reactPackageBefore: reactScriptsBefore,
    reactPackageAfter: reactScriptsAfter,
  });
  assert.deepEqual(reactScriptOnly.scopedEntrypointChecks, ['react']);
  assert.deepEqual(reactScriptOnly.reactFamilies, []);

  await assert.rejects(plan(['packages/react/package.json'], {
    reactPackageBefore: reactScriptsBefore,
    reactPackageAfter: JSON.stringify({ scripts: { 'check:component': 'pnpm check' } }),
    packages: packagesWithScript('@muxui/react', 'check:component', 'pnpm check'),
  }), /MUXUI_CI_IMPACT_SCOPED_ENTRYPOINT_INVALID: @muxui\/react check:component/u);

  const storybookManifestPath = 'apps/react-storybook/package.json';
  const storybookScriptsBefore = JSON.stringify({ scripts: { 'check:scoped': 'old-scoped-command' } });
  const storybookScriptsAfter = JSON.stringify({ scripts: { 'check:scoped': 'node src/check-scoped.mjs' } });
  const storybookScriptOnly = await plan([storybookManifestPath], {
    textSnapshots: { [storybookManifestPath]: { before: storybookScriptsBefore, after: storybookScriptsAfter } },
  });
  assert.deepEqual(storybookScriptOnly.scopedEntrypointChecks, ['storybook']);
  assert.deepEqual(storybookScriptOnly.storyRuns, []);

  await assert.rejects(plan([storybookManifestPath], {
    textSnapshots: { [storybookManifestPath]: { before: storybookScriptsBefore, after: JSON.stringify({ scripts: { 'check:scoped': 'pnpm check' } }) } },
    packages: packagesWithScript('@muxui/react-storybook', 'check:scoped', 'pnpm check'),
  }), /MUXUI_CI_IMPACT_SCOPED_ENTRYPOINT_INVALID: @muxui\/react-storybook check:scoped/u);
});

test('policy-only lockfile changes stay scoped and other importer changes map to their package', async () => {
  const lockfileBefore = lockfile('    devDependencies: {}', '    dependencies: {}');
  const policyOnlyLockfile = lockfile('    devDependencies:\n      acorn:\n        specifier: 8.18.0\n        version: 8.18.0', '    dependencies: {}');
  assert.equal(isPolicyOnlyLockfileChange(lockfileBefore, policyOnlyLockfile), true);
  assert.deepEqual(changedLockfileImporters(lockfileBefore, policyOnlyLockfile), ['tooling/audits/repository-policy']);

  const policy = await plan(['pnpm-lock.yaml'], {
    lockfileBefore,
    lockfileAfter: policyOnlyLockfile,
  });
  assert.equal(policy.policy, true);
  assert.equal(policy.full, false);
  assert.deepEqual(policy.storyRuns, []);

  const reactLockfile = lockfile('    devDependencies: {}', '    dependencies:\n      react:\n        specifier: 19.0.0\n        version: 19.0.0');
  assert.deepEqual(changedLockfileImporters(lockfileBefore, reactLockfile), ['packages/react']);
  const react = await plan(['pnpm-lock.yaml'], {
    lockfileBefore,
    lockfileAfter: reactLockfile,
  });
  assert.equal(react.full, false);
  assert.equal(react.reactPackageFull, true);
  assert.deepEqual(react.storyRuns[0].families, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']);
});

test('metadata bootstrap follows lockfile consumers that require canonical React or Storybook records', () => {
  assert.equal(needsStorybookGeneration([], config, {
    packages,
    lockfileImporters: ['tooling/audits/repository-policy'],
  }), false);
  assert.equal(needsStorybookGeneration([], config, {
    packages,
    lockfileImporters: ['apps/docs'],
  }), false);
  assert.equal(needsStorybookGeneration([], config, {
    packages,
    lockfileImporters: ['packages/react'],
  }), true);
  assert.equal(needsStorybookGeneration([], config, {
    packages,
    lockfileImporters: ['apps/react-storybook'],
  }), true);
  assert.equal(needsStorybookGeneration([], config, {
    packages,
    lockfileImporters: ['packages/tokens'],
  }), true);
});

test('clean Storybook metadata bootstrap executes a normalized generation command', async () => {
  const spawnCalls = [];
  const commandCalls = [];
  const commandRunner = (command) => {
    commandCalls.push(normalizeCommand(command));
    return executeCommand(command, {
      environment: { MUXUI_BOOTSTRAP_TEST_ENV: 'preserved' },
      spawn: (...args) => {
        spawnCalls.push(args);
        return { status: 0 };
      },
    });
  };

  const prepared = await prepareStorybookMetadata({
    needsMetadata: true,
    readCurrentText: async () => null,
    commandRunner,
    log: () => {},
  });

  assert.equal(prepared, true);
  assert.deepEqual(commandCalls, [{
    command: 'pnpm',
    args: ['--filter', '@muxui/react-storybook', 'run', 'generate'],
    env: {},
    unsetEnv: [],
  }]);
  assert.equal(spawnCalls.length, 1, 'the bootstrap command is executed, not merely added to a preview plan');
  assert.equal(spawnCalls[0][0], 'pnpm');
  assert.deepEqual(spawnCalls[0][1], ['--filter', '@muxui/react-storybook', 'run', 'generate']);
  assert.equal(spawnCalls[0][2].env.MUXUI_BOOTSTRAP_TEST_ENV, 'preserved');

  const result = executeCommand({ command: 'fixture', args: [] }, {
    environment: { MUXUI_BOOTSTRAP_TEST_ENV: 'defaulted' },
    spawn: (...args) => {
      spawnCalls.push(args);
      return { status: 0 };
    },
  });
  assert.equal(result, 0);
  assert.equal(spawnCalls[1][2].env.MUXUI_BOOTSTRAP_TEST_ENV, 'defaulted');
});

function runFixture(statuses, prerequisites = []) {
  const ran = [];
  const errors = [];
  const exits = [];
  const commands = Object.keys(statuses).map((name) => ({
    command: name, args: [], prerequisite: prerequisites.includes(name),
  }));
  executeCommands(commands, {
    commandRunner: ({ command }) => {
      ran.push(command);
      return statuses[command];
    },
    log: () => {},
    logError: (line) => errors.push(line),
    exit: (status) => exits.push(status),
  });
  return { ran, errors, exits };
}

test('CI checks keep running after a failure and exit once with every failure summarized', () => {
  const { ran, errors, exits } = runFixture({ generate: 0, lint: 2, unit: 0, audit: 1 }, ['generate']);
  assert.deepEqual(ran, ['generate', 'lint', 'unit', 'audit']);
  assert.deepEqual(exits, [2]);
  assert.ok(errors.some((line) => line.includes('2 of 4 command(s) failed')));
  assert.ok(errors.some((line) => line.includes('exit 2: lint')));
  assert.ok(errors.some((line) => line.includes('exit 1: audit')));

  assert.deepEqual(runFixture({ lint: 0, unit: 0 }).exits, []);
});

test('a failed CI prerequisite stops the run before dependent checks', () => {
  const { ran, errors, exits } = runFixture({ generate: 3, lint: 0, unit: 0 }, ['generate']);
  assert.deepEqual(ran, ['generate']);
  assert.deepEqual(exits, [3]);
  assert.ok(errors.some((line) => line.includes('skipping the remaining 2 command(s)')));
});

test('generation and install commands are marked as CI prerequisites', async () => {
  const catalogCommands = executionCommands(await plan(['packages/catalog/src/compiler.mjs']), { packages });
  assert.deepEqual(catalogCommands.map(({ prerequisite }) => prerequisite === true), [true, ...Array(7).fill(false)]);
});

test('clean owner checks schedule only their generation dependencies before checks', async () => {
  const catalog = await plan(['packages/catalog/src/compiler.mjs']);
  const catalogCommands = executionCommands(catalog, { packages });
  // Catalog changes also run the tooling dense goldens that pin the catalog
  // digest, plan its runtime dependents (docs, tooling, and policy through
  // tooling) as if they changed, and run only the package checks of React
  // Native and Web, which depend on the catalog as a devDependency. React's
  // catalog devDependency is scoped: React never imports @muxui/catalog.
  // This matches the real `ci-impact.mjs --preview` for this change.
  assert.deepEqual(catalog.generationPackages, [
    '@muxui/catalog', '@muxui/foundation', '@muxui/react', '@muxui/react-native', '@muxui/repository-policy',
    '@muxui/schema', '@muxui/tokens', '@muxui/tooling', '@muxui/web',
  ]);
  assert.deepEqual(catalogCommands[0].args, [
    '--recursive', '--sort', '--workspace-concurrency=1', '--if-present',
    ...catalog.generationPackages.flatMap((name) => ['--filter', name]),
    'run', 'generate',
  ]);
  assert.deepEqual(catalogCommands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/repository-policy', 'run', 'check'],
    ['--filter', '@muxui/catalog', 'run', 'check'],
    ['--filter', '@muxui/docs', 'run', 'check'],
    ['--filter', '@muxui/scale', 'run', 'check:browser:docs'],
    ['--filter', '@muxui/react-native', 'run', 'check'],
    ['--filter', '@muxui/tooling', 'run', 'check'],
    ['--filter', '@muxui/web', 'run', 'check'],
  ]);
  assert.equal(catalog.reactPackageFull, false);
  assert.deepEqual(catalog.storyRuns, []);

  const policy = await plan(['.github/workflows/ci.yml']);
  const policyCommands = executionCommands(policy, { packages });
  assert.ok(policyCommands[0].args.includes('--filter'));
  assert.ok(policyCommands[0].args.includes('@muxui/react'));
  assert.ok(policyCommands[0].args.includes('@muxui/repository-policy'));
  assert.deepEqual(policyCommands[1].args, ['--filter', '@muxui/repository-policy', 'run', 'check']);
  assert.ok(!policyCommands.some(({ args }) => args.includes('@muxui/react-storybook')));

  // Local planning reads this prerequisite from policy; CI hard-codes it.
  const { generationPrerequisites } = await loadPolicy(repositoryRoot);
  for (const name of generationPrerequisites['@muxui/repository-policy']) {
    assert.ok(policy.generationPackages.includes(name), `CI policy route generates ${name}`);
  }

  const policyAfterStorybookBootstrap = executionCommands(policy, { packages, metadataPrepared: true });
  assert.ok(!policyAfterStorybookBootstrap[0].args.includes('@muxui/react'));
  assert.deepEqual(policyAfterStorybookBootstrap[1].args, ['--filter', '@muxui/repository-policy', 'run', 'check']);

  // Docs and Scale checks no longer generate their own prerequisites in CI:
  // the shared generation covers the docs closure, including for Scale-only
  // changes, whose docs browser test builds the docs site.
  const docsGeneration = [
    '--recursive', '--sort', '--workspace-concurrency=1', '--if-present',
    '--filter', '@muxui/catalog', '--filter', '@muxui/react', '--filter', '@muxui/schema',
    '--filter', '@muxui/tokens', '--filter', '@muxui/tooling', 'run', 'generate',
  ];
  const docs = await plan(['apps/docs/src/content/docs/foundations/index.mdx']);
  const docsCommands = executionCommands(docs, { packages });
  assert.deepEqual(docsCommands.map(({ args }) => args), [
    docsGeneration,
    ['--filter', '@muxui/docs', 'run', 'check'],
    ['--filter', '@muxui/scale', 'run', 'check:browser:docs'],
  ]);
  const scale = await plan(['apps/scale/test/browser/theme-builder.test.mjs']);
  assert.deepEqual(executionCommands(scale, { packages })[0].args, docsGeneration);
});

test('planned CI commands run with their prerequisites marked ready', () => {
  const environments = [];
  const spawn = (command, args, { env }) => {
    environments.push(env);
    return { status: 0 };
  };
  const runner = preparedCommandRunner({ PATH: 'bin' }, { spawn });
  assert.equal(runner({ command: 'pnpm', args: ['--filter', '@muxui/docs', 'run', 'check'], env: { EXTRA: '1' } }), 0);
  assert.deepEqual(environments, [{ PATH: 'bin', MUXUI_PREREQUISITES_READY: '1', EXTRA: '1' }]);
});

test('React package metadata expands only for runtime package boundary changes', async () => {
  const before = JSON.stringify({
    name: '@muxui/react', version: '1.0.0', type: 'module',
    exports: { '.': './generated/index.mjs' },
    dependencies: { react: '19.0.0' },
    scripts: { check: 'old-check' },
    devDependencies: { vite: '1.0.0' },
  });
  const scriptsOnly = JSON.stringify({
    name: '@muxui/react', version: '1.0.0', type: 'module',
    exports: { '.': './generated/index.mjs' },
    dependencies: { react: '19.0.0' },
    scripts: { check: 'new-check' },
    devDependencies: { vite: '1.0.0' },
  });
  const developmentDependencyOnly = JSON.stringify({
    name: '@muxui/react', version: '1.0.0', type: 'module',
    exports: { '.': './generated/index.mjs' },
    dependencies: { react: '19.0.0' },
    scripts: { check: 'old-check' },
    devDependencies: { vite: '2.0.0' },
  });
  const runtimeBoundary = JSON.stringify({
    name: '@muxui/react', version: '1.0.0', type: 'module',
    exports: { '.': './generated/index.mjs', './testing': './generated/testing.mjs' },
    dependencies: { react: '19.1.0' },
    scripts: { check: 'old-check' },
    devDependencies: { vite: '1.0.0' },
  });
  assert.deepEqual(reactPackageWideChanges(before, scriptsOnly), {
    pagesAffected: false,
    developmentDependenciesChanged: false,
    scriptsChanged: true,
    reason: 'React package scripts changed',
  });
  assert.deepEqual(reactPackageWideChanges(before, developmentDependencyOnly), {
    pagesAffected: false,
    developmentDependenciesChanged: true,
    scriptsChanged: false,
    reason: 'React package development dependencies changed',
  });
  assert.deepEqual(reactPackageWideChanges(before, runtimeBoundary), {
    pagesAffected: true,
    developmentDependenciesChanged: false,
    scriptsChanged: false,
    reason: 'React package runtime boundary changed: exports, dependencies',
  });
  assert.equal(needsStorybookGeneration(['packages/react/package.json'], config, {
    reactPackagePagesAffected: false,
  }), false);
  assert.equal(needsStorybookGeneration(['packages/react/package.json'], config, {
    reactPackagePagesAffected: true,
  }), true);

  const tooling = await plan(['packages/react/package.json'], {
    reactPackageBefore: before,
    reactPackageAfter: scriptsOnly,
  });
  assert.equal(tooling.policy, true);
  assert.equal(tooling.reactPackageFull, false);
  assert.deepEqual(tooling.storyRuns, []);

  const devOnly = await plan(['packages/react/package.json'], {
    reactPackageBefore: before,
    reactPackageAfter: developmentDependencyOnly,
  });
  assert.equal(devOnly.policy, false);
  assert.equal(devOnly.reactPackageFull, false);
  assert.deepEqual(devOnly.packageChecks, ['@muxui/react']);
  assert.deepEqual(devOnly.storyRuns, []);

  const runtime = await plan(['packages/react/package.json'], {
    reactPackageBefore: before,
    reactPackageAfter: runtimeBoundary,
  });
  assert.equal(runtime.reactPackageFull, true);
  assert.deepEqual(runtime.storyRuns[0].families, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']);
});

test('Storybook audit tooling runs explicit focused test names and never launches raw browser suites', async () => {
  const indexHelper = await plan(['apps/react-storybook/test/helpers/storybook-index.mjs']);
  const indexCommands = executionCommands(indexHelper, { packages });
  const indexUnit = indexCommands.find(({ args }) => args.includes('test/storybook-page-selection.test.mjs'));
  assert.ok(indexUnit);
  assert.ok(!indexUnit.args.some((arg) => arg.startsWith('--test-name-pattern=')), 'the light page-selection file runs whole');
  assert.ok(!indexCommands.some(({ args }) => args.includes('check:scoped')));

  const fullSelectionProof = await plan([
    'apps/react-storybook/src/check-scoped.mjs',
    'apps/react-storybook/test/helpers/storybook-index.mjs',
  ]);
  const fullSelectionCommand = executionCommands(fullSelectionProof, { packages })
    .find(({ args }) => args.includes('test/storybook-page-selection.test.mjs'));
  assert.ok(fullSelectionCommand);
  assert.ok(!fullSelectionCommand.args.some((arg) => arg.startsWith('--test-name-pattern=')));

  const auditTestEdit = await plan(['apps/react-storybook/test/storybook-colors.test.mjs']);
  const auditCommands = executionCommands(auditTestEdit, { packages });
  const rawColors = auditCommands.find(({ args }) => args.includes('test/storybook-colors.test.mjs'));
  assert.ok(rawColors);
  assert.ok(rawColors.args.some((arg) => arg.startsWith('--test-name-pattern=')));
  assert.ok(!auditCommands.some(({ args }) => args.includes('check:scoped')));

  const auditCleanupEdit = await plan(['apps/react-storybook/test/storybook-a11y.test.mjs']);
  const cleanupCommand = executionCommands(auditCleanupEdit, { packages })
    .find(({ args }) => args.includes('test/storybook-a11y.test.mjs'));
  assert.ok(cleanupCommand);
  assert.ok(cleanupCommand.args.some((arg) => arg.startsWith('--test-name-pattern=')));
  assert.doesNotMatch(cleanupCommand.args.join(' '), /selected Mux UI React Storybook pages|all selected Storybook pages/u);
});

test('mixed component and exact-page changes preserve each distinct proof scope', async () => {
  const source = await readFile(resolve(repositoryRoot, supplementalPath), 'utf8');
  const before = source.replace('    slot: null,\n', '');
  const result = await plan([supplementalPath, sizingExamplePath], {
    records: records.filter(({ family }) => ['TagSelect', 'MultiSelect'].includes(family)),
    textSnapshots: { [supplementalPath]: { before, after: source } },
    moduleSources: { [supplementalPath]: { before, after: source } },
  });

  assert.deepEqual(result.storyRuns.map(({ proof, families, storyIds }) => ({ proof, families, storyIds })), [
    { proof: 'component', families: ['TagSelect'], storyIds: [] },
    { proof: 'story', families: ['NumberField'], storyIds: [sizingStoryId] },
  ]);
});

test('an unowned path widens to the policy check with a notice; missing records and empty diffs still fail', async () => {
  const unowned = await plan(['scripts/unowned-change.mjs', 'scripts/other.mjs']);
  assert.equal(unowned.policy, true);
  assert.equal(unowned.full, false);
  assert.equal(unowned.notices.length, 1);
  assert.match(unowned.notices[0], /^scripts\/other\.mjs, scripts\/unowned-change\.mjs have no owner route; running the repository policy check/u);
  assert.ok(unowned.reasons.includes(unowned.notices[0]));
  // An owned path adds no notice.
  assert.deepEqual((await plan(['AGENTS.md'])).notices, []);
  await assert.rejects(plan(['catalog/components/not-a-family/examples/react/basic.example.json']), /MUXUI_CI_IMPACT_COMPONENT_RECORD_MISSING/u);
  await assert.rejects(plan([]), /MUXUI_CI_IMPACT_EMPTY/u);
});

const treeBefore = 'export const Tree = () => null;';
const treeAfter = 'export const Tree = () => 1;';
const treeRuntimeChange = {
  textSnapshots: { [collectionsPath]: { before: treeBefore, after: treeAfter } },
  moduleSources: { ...cssModuleSources, [collectionsPath]: { before: treeBefore, after: treeAfter } },
};
const groupIds = (groups) => groups.map(({ id }) => id);

test('React runtime changes run the Motion bundle boundary test; stylesheet-only changes do not', async () => {
  const runtime = await plan([collectionsPath], treeRuntimeChange);
  assert.ok(runtime.reactTestFiles.includes('test/motion-package-boundary.test.mjs'));
  assert.ok(executionCommands(runtime, { packages }).some(({ args }) => args.at(-1) === 'test/motion-package-boundary.test.mjs'));

  const cssPath = 'packages/react/src/styles/components.css';
  const stylesheet = await plan([cssPath], {
    textSnapshots: { [cssPath]: { before: '.muxui-tree { color: black; }', after: '.muxui-tree { color: white; }' } },
    moduleSources: cssModuleSources,
  });
  assert.ok(!stylesheet.reactTestFiles.includes('test/motion-package-boundary.test.mjs'));

  const generator = await plan(['packages/react/src/generate.mjs']);
  assert.equal(generator.reactPackageFull, true);
  assert.ok(!generator.reactTestFiles.includes('test/motion-package-boundary.test.mjs'), 'the full React check already runs it');
});

test('scoped plans split into independent groups that each repeat the generation prerequisite', async () => {
  const result = await plan([collectionsPath, '.github/workflows/ci.yml'], treeRuntimeChange);
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  // Docs, Scale, Figma, and the playground depend on React at runtime, so they
  // run whole (with the browser checks) while React and Storybook keep the Tree family scope.
  assert.deepEqual(groupIds(groups), ['checks', 'browser-chromium', 'react', 'storybook-component']);
  const generation = executionCommands(result, { packages })[0];
  assert.equal(generation.prerequisite, true);
  for (const group of groups) assert.deepEqual(group.commands[0], generation, `${group.id} starts with generation`);
  assert.deepEqual(groups[0].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/repository-policy', 'run', 'check'],
    ['--filter', '@muxui/docs', 'run', 'check'],
    ['--filter', '@muxui/scale', 'run', 'check'],
    ['--filter', '@muxui/figma', 'run', 'check'],
    ['--filter', '@muxui/react-playground', 'run', 'check'],
    ['--filter', '@muxui/react-storybook', 'run', 'generate:check'],
  ]);
  assert.deepEqual(groups[1].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/scale', 'run', 'check:browser'],
    ['--filter', '@muxui/scale', 'run', 'check:browser:docs'],
  ]);
  assert.ok(groups[2].commands.some(({ args }) => args.includes('check:component')));
  assert.equal(groups[3].commands.at(-1).env.MUXUI_STORYBOOK_FAMILIES, 'Tree');
  assert.deepEqual(groupMatrix(groups).map(({ id, kind }) => [id, kind]), [
    ['checks', 'checks'], ['browser-chromium', 'browser'], ['react', 'react'], ['storybook-component', 'storybook'],
  ]);

  const tokens = executionGroups(await plan(['catalog/tokens/default-theme.json']), { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(tokens), ['checks', 'browser-chromium', 'react', 'storybook-theme', 'storybook-chrome', 'tailwind']);
  assert.deepEqual(tokens.at(-1).commands.slice(1).map(({ prerequisite }) => prerequisite === true), [true, false]);
});

test('only groups that run a cross-engine browser test request Firefox and WebKit', async () => {
  assert.equal(groupBrowserEngines([{ env: {} }, { env: { MUXUI_BROWSER_ENGINES: 'chromium,webkit,firefox' } }]), 'firefox webkit');
  assert.equal(groupBrowserEngines([{ env: { MUXUI_BROWSER_ENGINES: 'chromium' } }]), '');

  const full = groupMatrix(executionGroups(fullWorkspacePlan('test'), { packages, environment: {} }));
  assert.deepEqual(full.filter(({ browserEngines }) => browserEngines).map(({ id, browserEngines }) => [id, browserEngines]), [
    ['browser-firefox', 'firefox'], ['browser-webkit', 'webkit'],
  ]);

  const tree = executionGroups(await plan([collectionsPath], treeRuntimeChange), { packages, environment: {}, pageIndex });
  assert.ok(tree.every(({ browserEngines }) => browserEngines === ''), 'Tree proof stays Chrome-only');

  const testFile = 'test/browser/autocomplete-dismissal.test.mjs';
  const dismissal = executionGroups(await plan([`packages/react/${testFile}`]), { packages, environment: {}, pageIndex });
  const react = dismissal.find(({ id }) => id === 'react');
  assert.equal(react.browserEngines, 'firefox webkit');
  assert.equal(react.commands.find(({ args }) => args.includes(testFile) || args.includes('check:component')).env.MUXUI_BROWSER_ENGINES, 'chromium,firefox,webkit');
});

test('only calls through the harness browserEngines() binding opt a test in', () => {
  const harness = "from './harness.mjs'";
  // Hand-written classification, independent of the planner.
  const supported = [
    ['a direct call', `import { browserEngines } ${harness};\nfor (const engine of browserEngines()) {}`],
    ['an import alias', `import { browserEngines as engines } ${harness};\nfor (const engine of engines()) {}`],
    ['a namespace member', `import * as harness ${harness};\nfor (const engine of harness.browserEngines()) {}`],
  ];
  const ignored = [
    ['a comment and a string', '// browserEngines() runs every engine\nconst note = "browserEngines()";'],
    ['an unused import', `import { browserEngines } ${harness};`],
    ['no opt-in', `import { launchBrowser } ${harness};\nawait launchBrowser();`],
    ['an object key', "const metadata = { browserEngines: ['chromium'] };"],
    ['a member of another object', 'const engines = options.browserEngines;'],
    ['a local function of the same name', 'function browserEngines() { return []; }\nbrowserEngines();'],
    ['a destructured option', 'const { browserEngines } = options;\nbrowserEngines();'],
    ['an import from another module', "import { browserEngines } from './other.mjs';\nbrowserEngines();"],
    ['another harness export', `import * as harness ${harness};\nawait harness.launchBrowser();`],
    ['a member call on another object', `import { launchBrowser } ${harness};\nsettings.browserEngines();`],
    ['unrelated names beside a harness import', `import { launchBrowser } ${harness};\nconst options = { browserEngines: [] };\nconst engines = options.browserEngines;`],
  ];
  for (const [name, source] of supported) assert.equal(callsBrowserEngines(source, 'x.test.mjs'), true, name);
  for (const [name, source] of ignored) assert.equal(callsBrowserEngines(source, 'x.test.mjs'), false, name);
  // A use of the harness binding the planner cannot follow would silently run Chromium only, so it throws.
  for (const source of [
    `import { browserEngines as engines } ${harness};\nconst pick = engines;\nfor (const engine of pick()) {}`,
    `import * as harness ${harness};\nconst pick = harness.browserEngines;\nfor (const engine of pick()) {}`,
    `import * as harness ${harness};\nconst module = harness;\nfor (const engine of module.browserEngines()) {}`,
    `const { browserEngines: engines } = await import('./harness.mjs');\nfor (const engine of engines()) {}`,
    `export { browserEngines } ${harness};`,
  ]) assert.throws(() => callsBrowserEngines(source, 'x.test.mjs'), /MUXUI_CI_IMPACT_BROWSER_ENGINES_FORM: x\.test\.mjs/u);
});

const browserGroups = (groups) => groups.filter(({ kind }) => kind === 'browser');
// A group's own commands, without the shared generation prerequisite.
const ownCommands = (group) => group.commands.filter(({ prerequisite }) => !prerequisite);
const argsLine = (command) => command.args.join(' ');
const reactBrowserDirectory = resolve(repositoryRoot, 'packages/react/test/browser');
const reactBrowserTests = readdirSync(reactBrowserDirectory)
  .filter((name) => name.endsWith('.test.mjs')).sort().map((name) => `test/browser/${name}`);
// The `engine file` runs a command list performs; an unset engine is Chromium, as in the harness.
const reactBrowserRuns = (commands) => commands
  .filter(({ args }) => args.includes('@muxui/react') && args.includes('--test-concurrency=1'))
  .flatMap(({ args, env }) => args
    .filter((arg) => arg.startsWith('test/browser/'))
    .map((file) => `${env.MUXUI_BROWSER_ENGINES ?? 'chromium'} ${file}`));
const fixedBrowserSources = (source) => Object.fromEntries(reactBrowserTests.map((file) => [file, source]));

test('the full plan runs the browser checks as parallel groups, each React test once per engine', () => {
  const crossEngine = reactBrowserTests
    .filter((file) => callsBrowserEngines(readFileSync(resolve(repositoryRoot, 'packages/react', file), 'utf8')));
  const chromiumOnly = reactBrowserTests.filter((file) => !crossEngine.includes(file));
  assert.ok(crossEngine.includes('test/browser/autocomplete-dismissal.test.mjs'));
  assert.ok(chromiumOnly.includes('test/browser/dialog-motion.test.mjs'), 'engine-agnostic tests are Chromium-only');

  const plan = fullWorkspacePlan('test');
  const groups = browserGroups(executionGroups(plan, { packages, environment: {} }));
  assert.deepEqual(groups.map(({ id, browserEngines, timeoutMinutes }) => [id, browserEngines, timeoutMinutes]), [
    ['browser-chromium', '', 30], ['browser-chromium-only', '', 30], ['browser-firefox', 'firefox', 30], ['browser-webkit', 'webkit', 30],
  ]);
  assert.ok(groupMatrix(groups).every(({ kind }) => kind === 'browser'));

  const exec = ['--filter', '@muxui/react', 'exec', 'node', '--test', '--test-concurrency=1'];
  const [chromium, only, firefox, webkit] = groups;
  assert.deepEqual(ownCommands(chromium).map(argsLine), [
    '--filter @muxui/scale run check:browser', [...exec, ...crossEngine].join(' '), '--filter @muxui/scale run check:browser:docs',
  ]);
  assert.deepEqual(ownCommands(chromium).map(({ env }) => env.MUXUI_BROWSER_ENGINES), [undefined, 'chromium', undefined]);
  assert.deepEqual(ownCommands(only).map(({ args, env }) => [args, env]), [[[...exec, ...chromiumOnly], {}]]);
  for (const [group, engine] of [[firefox, 'firefox'], [webkit, 'webkit']]) {
    assert.deepEqual(ownCommands(group).map(({ args, env }) => [args, env]), [
      [[...exec, ...crossEngine], { MUXUI_BROWSER_ENGINES: engine }],
    ], group.id);
  }

  // Every file runs exactly once in each engine it supports, and none is missed.
  const expected = [
    ...reactBrowserTests.map((file) => `chromium ${file}`),
    ...crossEngine.flatMap((file) => [`firefox ${file}`, `webkit ${file}`]),
  ].sort();
  const grouped = reactBrowserRuns(groups.flatMap(ownCommands)).sort();
  assert.deepEqual(grouped, expected);
  // Local serial runs cover the same runs, again once each.
  assert.deepEqual(reactBrowserRuns(executionCommands(plan, { packages })).sort(), expected);
  assert.ok(!groups.flatMap(ownCommands).some((command) => argsLine(command) === '--filter @muxui/react run check:browser'));
});

test('the browser groups follow how each test file opts in, and fail on a form they cannot classify', () => {
  const harness = "from './harness.mjs'";
  const source = (body) => `import { browserEngines, browserEngines as engines, launchBrowser } ${harness};\n${body}`;
  const [direct, alias, plain, unrelated, stored] = ['activity', 'code-block', 'message', 'icon-button', 'text']
    .map((name) => `test/browser/${name}.test.mjs`);
  const sources = {
    ...fixedBrowserSources('export {};'),
    [direct]: source('for (const engine of browserEngines()) {}'),
    [alias]: source('for (const engine of engines()) {}'),
    [plain]: source('await launchBrowser();'),
    // Same spelling, but not the harness binding: no opt-in, and planning does not fail.
    [unrelated]: "const metadata = { browserEngines: ['chromium'] };\nconst engines = options.browserEngines;",
  };
  const groups = browserGroups(executionGroups(fullWorkspacePlan('test'), { packages, environment: {}, testSources: sources }));
  const filesOf = (id) => ownCommands(groups.find((group) => group.id === id)).flatMap(({ args }) => args.filter((arg) => arg.startsWith('test/browser/')));
  assert.deepEqual(filesOf('browser-firefox'), [direct, alias]);
  assert.deepEqual(filesOf('browser-webkit'), [direct, alias]);
  assert.ok(filesOf('browser-chromium-only').includes(plain) && filesOf('browser-chromium-only').includes(unrelated));
  assert.ok(!filesOf('browser-chromium-only').includes(direct) && !filesOf('browser-chromium-only').includes(alias));

  const unclassifiable = { ...sources, [stored]: source('const pick = engines;\nfor (const engine of pick()) {}') };
  assert.throws(
    () => executionGroups(fullWorkspacePlan('test'), { packages, environment: {}, testSources: unclassifiable }),
    new RegExp(`MUXUI_CI_IMPACT_BROWSER_ENGINES_FORM: ${stored.replaceAll('.', '\\.')}`, 'u'),
  );
});

test('planning fails when the React check:browser script drifts from what CI runs', async () => {
  const drifted = packagesWithScript('@muxui/react', 'check:browser', 'node --test --test-concurrency=1 test/browser/**/*.test.mjs');
  const react = await plan(['packages/react/src/generate.mjs']);
  const contract = /MUXUI_CI_IMPACT_CHECK_BROWSER_CONTRACT: packages\/react\/package\.json check:browser is .*test\/browser\/\*\*.*Update reactBrowserScript .* in tooling\/audits\/repository-policy\/src\/ci-impact\.mjs/u;
  assert.throws(() => executionGroups(react, { packages: drifted, environment: {}, pageIndex }), contract);
  assert.throws(() => executionGroups(fullWorkspacePlan('test'), { packages: drifted, environment: {} }), contract);
  // Whitespace is not part of the contract; a changed selector, runner, or flag is.
  const reformatted = packagesWithScript('@muxui/react', 'check:browser', '  node   --test\t--test-concurrency=1\n  test/browser/*.test.mjs ');
  assert.doesNotThrow(() => executionGroups(react, { packages: reformatted, environment: {}, pageIndex }));
  for (const script of [
    'node --test --test-concurrency=1 test/browser/*.spec.mjs', 'node --test test/browser/*.test.mjs',
    'node --test --test-concurrency=1 test/browser/*.test.mjs test/extra/*.test.mjs',
  ]) {
    assert.throws(() => executionGroups(react, {
      packages: packagesWithScript('@muxui/react', 'check:browser', script), environment: {}, pageIndex,
    }), /MUXUI_CI_IMPACT_CHECK_BROWSER_CONTRACT/u, script);
  }
  const removed = packagesWithScript('@muxui/react', 'check:browser', undefined);
  assert.throws(() => executionGroups(react, { packages: removed, environment: {}, pageIndex }), /check:browser is undefined/u);
  // A plan without the React browser suite does not care.
  const docs = await plan(['apps/docs/src/content/docs/foundations/index.mdx']);
  assert.doesNotThrow(() => executionGroups(docs, { packages: drifted, environment: {}, pageIndex }));
});

test('scoped plans emit only the browser groups that have work', async () => {
  const options = { packages, environment: {}, pageIndex };
  const browserIds = (result, extra = {}) => groupIds(browserGroups(executionGroups(result, { ...options, ...extra })));
  const optIn = "import { browserEngines } from './harness.mjs'; browserEngines();";

  // The full React package proof runs every browser group.
  const react = await plan(['packages/react/src/generate.mjs']);
  assert.equal(react.reactPackageFull, true);
  assert.deepEqual(browserIds(react), ['browser-chromium', 'browser-chromium-only', 'browser-firefox', 'browser-webkit']);
  // Without a cross-engine test there is nothing for Firefox or WebKit.
  const none = browserIds(react, { testSources: fixedBrowserSources('export {};') });
  assert.ok(!none.some((id) => /firefox|webkit/u.test(id)) && none.includes('browser-chromium-only'), none.join(', '));
  // Without a Chromium-only test there is no Chromium-only group.
  const all = browserIds(react, { testSources: fixedBrowserSources(optIn) });
  assert.deepEqual(all, ['browser-chromium', 'browser-firefox', 'browser-webkit']);

  // Docs and Scale browser checks are Chromium-only and need no React browser group.
  assert.deepEqual(browserIds(await plan(['apps/docs/src/content/docs/foundations/index.mdx'])), ['browser-chromium']);
  assert.deepEqual(browserIds(await plan(['apps/scale/test/browser/theme-builder.test.mjs'])), ['browser-chromium']);

  // A routed cross-engine test stays in the React group, so no browser group is planned.
  assert.deepEqual(browserIds(await plan(['packages/react/test/browser/autocomplete-dismissal.test.mjs'])), []);
});

test('each browser group is reused on its own routing', () => {
  const group = (id) => ({ id, kind: 'browser', packageDirectories: ['packages/react'] });
  const delta = (groupIds) => ({ changedPaths: ['apps/docs/src/index.md'], groupIds, storyRuns: [], storyTooling: false });
  assert.equal(affectedReason(group('browser-firefox'), delta(['browser-chromium'])), null);
  assert.equal(affectedReason(group('browser-chromium-only'), delta(['browser-chromium'])), null);
  assert.match(affectedReason(group('browser-chromium-only'), delta(['browser-chromium-only'])), /route to browser-chromium-only/u);
  assert.match(affectedReason(group('browser-webkit'), delta(['browser-webkit'])), /route to browser-webkit/u);
  assert.match(affectedReason(group('browser-chromium'), delta(['react'])), /route to react/u);
});

test('an Autocomplete runtime change runs its component check in every engine', async () => {
  const dismissalTest = 'test/browser/autocomplete-dismissal.test.mjs';
  const testSources = {
    ...componentTestSources,
    [dismissalTest]: await readFile(resolve(repositoryRoot, 'packages/react', dismissalTest), 'utf8'),
  };
  const before = 'export const NumberField = () => null; export const Autocomplete = () => null;';
  const after = 'export const NumberField = () => null; export const Autocomplete = () => 1;';
  const autocompletePage = {
    family: 'Autocomplete',
    storyFile: 'apps/react-storybook/.storybook/generated/autocomplete.stories.mjs',
    stories: [{ id: 'muxui-react-r1-2-autocomplete--default', exportName: 'Default', name: 'Default' }],
  };
  const result = await plan([fieldsPath], {
    records: [...records, { family: 'Autocomplete', export: 'Autocomplete', slug: 'autocomplete', source: fieldsPath, parts: ['root', 'input'] }],
    pageIndex: [...pageIndex, autocompletePage],
    componentTestSources: testSources,
    textSnapshots: { [fieldsPath]: { before, after } },
    moduleSources: { ...cssModuleSources, [fieldsPath]: { before, after } },
  });
  assert.deepEqual(result.reactFamilies, ['Autocomplete']);
  const react = executionGroups(result, { packages, environment: {}, pageIndex: [...pageIndex, autocompletePage], testSources })
    .find(({ id }) => id === 'react');
  assert.equal(react.browserEngines, 'firefox webkit');
  const componentCheck = react.commands.find(({ args }) => args.includes('check:component'));
  assert.equal(componentCheck.env.MUXUI_COMPONENT_FAMILIES, 'Autocomplete');
  assert.equal(componentCheck.env.MUXUI_BROWSER_ENGINES, 'chromium,firefox,webkit');
});

const generationFilters = (command) => command.args.filter((_, index) => command.args[index - 1] === '--filter');

test('a React-test-only group generates the React closure it imports in its own runner', async () => {
  const testFile = 'test/browser/tree-toggle-browser.test.mjs';
  const groups = executionGroups(await plan([`packages/react/${testFile}`]), { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['react']);
  const [generation, check] = groups[0].commands;
  assert.equal(generation.prerequisite, true);
  assert.deepEqual(generationFilters(generation), ['@muxui/catalog', '@muxui/react', '@muxui/schema', '@muxui/tokens']);
  assert.equal(check.args.at(-1), testFile);
});

test('story page groups generate Storybook metadata unless this process already prepared it', async () => {
  const result = await plan([sizingExamplePath]);
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['checks', 'browser-chromium', 'react', 'storybook-story']);
  for (const group of groups) {
    assert.equal(group.commands[0].prerequisite, true);
    assert.ok(generationFilters(group.commands[0]).includes('@muxui/react-storybook'), `${group.id} generates Storybook`);
  }

  const prepared = executionGroups(result, { packages, environment: {}, pageIndex, metadataPrepared: true });
  assert.deepEqual(groupIds(prepared), groupIds(groups));
  // Only the catalog's other dependents (policy through tooling, React Native,
  // Web) and the tooling goldens the catalog digest feeds remain to generate.
  for (const command of prepared.flatMap(({ commands }) => commands).filter(({ prerequisite }) => prerequisite)) {
    assert.deepEqual(generationFilters(command), [
      '@muxui/foundation', '@muxui/react-native', '@muxui/repository-policy', '@muxui/tooling', '@muxui/web',
    ], 'metadata preparation already generated the React and Storybook closure');
  }
});

test('theme proof skips families already covered by component proof', async () => {
  const mixed = await plan(['catalog/tokens/default-theme.json', collectionsPath], treeRuntimeChange);
  assert.deepEqual(mixed.storyRuns.map(({ proof, families }) => ({ proof, families })), [
    { proof: 'component', families: ['Tree'] },
    { proof: 'theme', families: ['MultiSelect', 'NumberField', 'TagSelect'] },
    { proof: 'chrome', families: [] },
  ]);

  const everyFamily = await plan(['catalog/tokens/default-theme.json', 'apps/react-storybook/src/storybook-factory.mjs']);
  assert.ok(!everyFamily.storyRuns.some(({ proof }) => proof === 'theme'));
});

test('large Storybook runs shard by family into balanced jobs within the page budget', () => {
  // 79 families of six consumer pages plus one BrowserProof page, like the real index.
  const realIndex = Array.from({ length: 79 }, (_, index) => ({
    family: `F${String(index).padStart(2, '0')}`,
    stories: [
      ...Array.from({ length: 6 }, (_, story) => ({ id: `f${index}-${story}`, exportName: `S${story}` })),
      { id: `f${index}-proof`, exportName: 'BrowserProof' },
    ],
  }));
  const allFamilies = realIndex.map(({ family }) => family);
  const pagesIn = (shard, consumerOnly) => shard.families.length * (consumerOnly ? 6 : 7);

  const component = { proof: 'component', families: allFamilies, storyIds: [], reason: 'r' };
  const componentShards = shardStoryRun(component, realIndex);
  assert.equal(componentShards.length, Math.ceil(553 / storyShardPageBudget));
  assert.ok(componentShards.every((shard) => pagesIn(shard, false) <= storyShardPageBudget + 7));
  assert.deepEqual(componentShards.flatMap(({ families }) => families), allFamilies);

  // All-consumer theme proof counts only consumer pages and names families per shard;
  // a BrowserProof-only family has no theme pages and never becomes its own shard.
  const proofOnly = { family: 'ProofOnly', stories: [{ id: 'proof-only', exportName: 'BrowserProof' }] };
  const theme = { proof: 'theme', families: [], storyIds: [], reason: 'r' };
  const themeShards = shardStoryRun(theme, [...realIndex, proofOnly]);
  assert.equal(themeShards.length, Math.ceil(474 / storyShardPageBudget));
  assert.ok(themeShards.every((shard) => pagesIn(shard, true) <= storyShardPageBudget + 6));
  assert.ok(!themeShards.some(({ families }) => families.includes('ProofOnly')));

  const small = { ...component, families: allFamilies.slice(0, 5) };
  assert.deepEqual(shardStoryRun(small, realIndex), [small]);
  const story = { proof: 'story', families: ['F00', 'F02'], storyIds: ['f0-1', 'f2-2'], reason: 'r' };
  assert.deepEqual(shardStoryRun(story, realIndex, 1).map(({ families, storyIds }) => [families, storyIds]), [
    [['F00'], ['f0-1']], [['F02'], ['f2-2']],
  ]);

  const componentOnly = {
    ...fullWorkspacePlan(), full: false, storyRuns: [component], reactFamilies: [], reactTestFiles: [], packageChecks: [], storyUnitTests: [],
  };
  const sharded = executionGroups(componentOnly, { packages, environment: {}, pageIndex: realIndex });
  assert.deepEqual(groupIds(sharded), componentShards.map((_, index) => `storybook-component-${index + 1}`));
});

test('the CI plan job prepares missing metadata while --preview and --plan run no checks', () => {
  assert.deepEqual(executionMode({ planOnly: true }), { prepareMetadata: true, run: 'none' });
  assert.deepEqual(executionMode({ preview: true }), { prepareMetadata: false, run: 'none' });
  assert.deepEqual(executionMode({ group: 'react' }), { prepareMetadata: true, run: 'group' });
  assert.deepEqual(executionMode({}), { prepareMetadata: true, run: 'all' });
  assert.equal(parseCliArguments(['--plan', '--github-output']).planOnly, true);
});

test('the full plan splits check:all into independently runnable groups', () => {
  const groups = executionGroups(fullWorkspacePlan('push runs the full workspace graph'), {
    packages, environment: { RUNNER_TEMP: '/tmp/runner' },
  });
  assert.deepEqual(groupIds(groups), [
    'checks', 'react', 'browser-chromium', 'browser-chromium-only', 'browser-firefox', 'browser-webkit',
    'storybook-a11y', 'storybook', 'tailwind',
  ]);
  for (const group of groups) {
    assert.deepEqual(group.commands[0].args, ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present', 'run', 'generate']);
    assert.equal(group.commands[0].prerequisite, true);
    assert.ok(group.timeoutMinutes > 0);
  }
  const byId = Object.fromEntries(groups.map((group) => [group.id, group.commands.slice(1).map(({ args }) => args.join(' '))]));
  // The workspace root's `check` is the affected-scope runner, so it must stay excluded.
  assert.ok(byId.checks[0].endsWith(
    '--no-bail --filter !@muxui/workspace --filter !@muxui/react --filter !@muxui/react-storybook run check',
  ));
  assert.deepEqual(byId.checks.slice(1), ['generate:check']);
  assert.deepEqual(byId.react, ['--filter @muxui/react run check']);
  const reactBrowser = '--filter @muxui/react exec node --test --test-concurrency=1 test/browser/';
  assert.equal(byId['browser-chromium'].length, 3);
  assert.equal(byId['browser-chromium'][0], '--filter @muxui/scale run check:browser');
  assert.ok(byId['browser-chromium'][1].startsWith(reactBrowser));
  assert.equal(byId['browser-chromium'][2], '--filter @muxui/scale run check:browser:docs');
  for (const id of ['browser-chromium-only', 'browser-firefox', 'browser-webkit']) {
    assert.equal(byId[id].length, 1, id);
    assert.ok(byId[id][0].startsWith(reactBrowser), id);
  }
  assert.ok(byId['storybook-a11y'][0].endsWith('test/storybook-a11y.test.mjs'));
  assert.ok(!byId.storybook.at(-1).includes('storybook-a11y'));
  assert.ok(byId.storybook.at(-1).includes('test/storybook-colors.test.mjs'));
  const storybookEnv = groups.find(({ id }) => id === 'storybook-a11y').commands[1].env;
  assert.equal(storybookEnv.MUXUI_STORYBOOK_AUDIT_EVENT, 'check:all');
  assert.equal(storybookEnv.MUXUI_STORYBOOK_AUDIT_FORCE, '1');
  assert.equal(storybookEnv.MUXUI_STORYBOOK_COLORS_ARTIFACT_DIR, '/tmp/runner/storybook-colour-audit');
});

test('CLI arguments select preview, full, group, and GitHub output modes', () => {
  assert.deepEqual(parseCliArguments(['--full', '--group', 'react', '--github-output']), {
    preview: false, planOnly: false, includeWorktree: false, full: true, group: 'react', githubOutput: true, reuseRecord: null,
  });
  assert.equal(parseCliArguments(['--plan', '--reuse-record', '/tmp/record.json']).reuseRecord, '/tmp/record.json');
  assert.equal(parseCliArguments(['--dry-run']).preview, true);
  assert.throws(() => parseCliArguments(['--group']), /MUXUI_CI_IMPACT_ARGUMENT_UNKNOWN/u);
  assert.throws(() => parseCliArguments(['--nope']), /MUXUI_CI_IMPACT_ARGUMENT_UNKNOWN/u);
});

// Pull-request reuse of groups that passed in earlier runs.
const commitA = 'a'.repeat(40);
const commitB = 'b'.repeat(40);
const commitHead = 'c'.repeat(40);
const prHead = '1'.repeat(40);
const reuseGroups = [
  { id: 'checks', kind: 'checks', signature: 'd'.repeat(64), packageDirectories: [] },
  { id: 'react', kind: 'react', signature: 'e'.repeat(64), packageDirectories: ['packages/react'] },
  { id: 'storybook-component', kind: 'storybook', signature: 'f'.repeat(64), storyRun: { proof: 'component', families: ['Tree'] } },
];
const noDelta = { changedPaths: [] };
const noHeadChanges = async () => [];
const docsDelta = { changedPaths: ['apps/docs/src/index.md'], groupIds: ['checks'], storyRuns: [], storyTooling: false };

function earlierRun(runNumber, conclusions, { testedCommit = commitA, groups = reuseGroups, entryCommits = {}, headSha = prHead } = {}) {
  return {
    runId: 1000 + runNumber,
    runNumber,
    url: `https://github.com/o/r/actions/runs/${1000 + runNumber}`,
    headSha,
    jobs: Object.entries(conclusions).map(([id, conclusion]) => ({ name: `run ${id}`, conclusion })),
    record: {
      version: 1,
      testedCommit,
      headCommit: headSha,
      groups: groups.map(({ id, signature }) => ({ id, signature, testedCommit: entryCommits[id] ?? testedCommit })),
    },
  };
}

const decide = (earlierRuns, delta = noDelta, groups = reuseGroups, headChangesFor = noHeadChanges) => decideReuse({
  groups, earlierRuns, deltaFor: async () => delta, headChangesFor,
});
const outcome = (decisions) => Object.fromEntries(decisions.map(({ id, reusedFrom, reason }) => [id, reusedFrom ? 'reused' : reason]));

test('group signatures are stable under key order and change with any command detail', () => {
  const command = { command: 'pnpm', args: ['run', 'check'], env: { B: '2', A: '1' }, unsetEnv: [], prerequisite: true };
  const signature = groupSignature([command]);
  assert.match(signature, /^[0-9a-f]{64}$/u);
  assert.equal(groupSignature([{ ...command, env: { A: '1', B: '2' } }]), signature);
  for (const changed of [
    { ...command, args: ['run', 'check:all'] },
    { ...command, env: { A: '1', B: '3' } },
    { ...command, unsetEnv: ['A'] },
    { ...command, prerequisite: false },
  ]) assert.notEqual(groupSignature([changed]), signature);
});

test('only a successful job with an identical signature counts as an earlier pass', async () => {
  const signatureChanged = earlierRun(2, { checks: 'success' }, { groups: [{ id: 'checks', signature: '0'.repeat(64) }] });
  assert.deepEqual(outcome(await decide([earlierRun(1, { checks: 'failure', react: 'cancelled' })])), {
    checks: 'failure in run #1', react: 'no earlier pass', 'storybook-component': 'no earlier pass',
  });
  assert.equal(outcome(await decide([signatureChanged])).checks, 'signature changed');
  assert.equal(outcome(await decide([{ ...earlierRun(3, { checks: 'success' }), record: null }])).checks, 'no earlier pass');
  assert.equal(outcome(await decide([{ ...earlierRun(3, { checks: 'timed_out' }), record: null }])).checks, 'timed_out in run #3');
  assert.equal(outcome(await decide([{ ...earlierRun(3, { checks: 'success' }), jobs: null }])).checks, 'jobs of run #3 are unreadable');
});

test('an unaffected group is reused with the commit it was actually tested on', async () => {
  const seen = [];
  const run = earlierRun(4, { checks: 'success', react: 'success' }, { testedCommit: commitB, entryCommits: { react: commitA } });
  const decisions = await decideReuse({
    groups: reuseGroups,
    earlierRuns: [run],
    deltaFor: async (commit) => {
      seen.push(commit);
      return commit === commitA ? noDelta : docsDelta;
    },
    headChangesFor: noHeadChanges,
  });
  assert.deepEqual(outcome(decisions), {
    checks: `affected since ${commitB.slice(0, 7)}: changes route to checks`,
    react: 'reused',
    'storybook-component': 'no earlier pass',
  });
  assert.deepEqual(seen.sort(), [commitA, commitB]);
  const react = decisions.find(({ id }) => id === 'react');
  assert.match(react.reusedFrom, /run #4 \(https:\/\/github\.com\/o\/r\/actions\/runs\/1004\) at aaaaaaa/u);
  const record = reuseRecord({ head: commitHead, headCommit: prHead, groups: reuseGroups, decisions });
  assert.equal(record.headCommit, prHead);
  assert.deepEqual(record.groups.map(({ id, testedCommit }) => [id, testedCommit]), [
    ['checks', commitHead], ['react', commitA], ['storybook-component', commitHead],
  ]);
  assert.equal(groupMatrix([{ id: 'react', kind: 'react', timeoutMinutes: 30 }], decisions)[0].reusedFrom, react.reusedFrom);
});

test('a group walks back past unfinished jobs but a newer failure blocks reuse', async () => {
  const older = earlierRun(5, { checks: 'success', react: 'success' }, { testedCommit: commitA });
  const cancelled = earlierRun(6, { checks: 'cancelled', react: 'success' }, { testedCommit: commitB });
  const walked = await decide([cancelled, older]);
  assert.match(walked.find(({ id }) => id === 'checks').reusedFrom, /^run #5 /u);
  assert.match(walked.find(({ id }) => id === 'react').reusedFrom, /^run #6 /u);
  const inProgress = earlierRun(7, { checks: null, react: 'skipped' });
  assert.deepEqual(Object.values(outcome(await decide([inProgress, older]))).slice(0, 2), ['reused', 'reused']);
  const failed = earlierRun(8, { checks: 'failure', react: 'action_required' });
  assert.deepEqual(outcome(await decide([failed, older])), {
    checks: 'failure in run #8', react: 'action_required in run #8', 'storybook-component': 'no earlier pass',
  });
});

test('CI machinery, dependency, and toolchain changes block every reuse', async () => {
  for (const path of [
    '.github/workflows/ci.yml', 'tooling/audits/repository-policy/src/ci-impact.mjs', 'pnpm-lock.yaml', 'package.json',
    'pnpm-workspace.yaml', '.node-version', '.npmrc', 'packages/react/package.json',
  ]) {
    assert.ok(reuseBlockedPath(path), path);
    for (const group of reuseGroups) assert.match(affectedReason(group, { ...docsDelta, changedPaths: [path] }), /CI machinery changed/u);
  }
  assert.ok(!reuseBlockedPath('apps/docs/src/index.md'));
  assert.match(affectedReason(reuseGroups[0], { changedPaths: ['x'], full: 'workspace input' }), /full workspace/u);
  assert.match(affectedReason(reuseGroups[0], { changedPaths: ['x'] }), /no group mapping/u);

  // The earlier run's own PR head must share this run's workflow and planner.
  const all = { checks: 'success', react: 'success', 'storybook-component': 'success' };
  const heads = [];
  const machinery = await decide([earlierRun(9, all, { headSha: commitB })], noDelta, reuseGroups, async (head) => {
    heads.push(head);
    return ['apps/docs/src/index.md', '.github/workflows/ci.yml'];
  });
  assert.deepEqual(heads, [commitB]);
  assert.ok(machinery.every(({ reusedFrom, reason }) => reusedFrom === '' && reason.includes("run #9's head: .github/workflows/ci.yml")));
  const unfetchable = await decide([earlierRun(9, all)], noDelta, reuseGroups, async () => { throw new Error('fetch timed out'); });
  assert.ok(unfetchable.every(({ reason }) => reason.includes('fetch timed out')));
});

test('package groups rerun for changes inside their package closure', () => {
  const [checks, react] = reuseGroups;
  const insideReact = { changedPaths: ['packages/react/src/button.css'], groupIds: ['storybook-component'], storyRuns: [], storyTooling: false };
  assert.match(affectedReason(react, insideReact), /changes touch packages\/react\/src\/button\.css/u);
  assert.equal(affectedReason(checks, insideReact), null);
  assert.match(affectedReason({ ...checks, packageDirectories: null }, insideReact), /package set of checks is unknown/u);

  const byName = (name, path, dependencies = {}) => ({ name, path, manifest: { dependencies } });
  const workspace = [
    byName('@muxui/schema', 'packages/schema'),
    byName('@muxui/tokens', 'packages/tokens', { '@muxui/schema': 'workspace:*' }),
    byName('@muxui/react', 'packages/react', { '@muxui/tokens': 'workspace:*' }),
    byName('@muxui/docs', 'apps/docs'),
  ];
  const pnpm = (...args) => ({ command: 'pnpm', args });
  assert.deepEqual(groupPackageDirectories([pnpm('--filter', '@muxui/react', 'run', 'check')], workspace), [
    'packages/react', 'packages/schema', 'packages/tokens',
  ]);
  assert.deepEqual(groupPackageDirectories([
    pnpm('--dir', 'tests/fixtures/tailwind-consumer', 'install', '--ignore-workspace', '--frozen-lockfile'),
    pnpm('--dir', 'tests/fixtures/tailwind-consumer', 'run', 'check'),
  ], workspace), ['packages/react', 'packages/schema', 'packages/tokens', 'tests/fixtures/tailwind-consumer']);
  assert.equal(groupPackageDirectories([pnpm('generate:check')], workspace), null);
  assert.equal(groupPackageDirectories([pnpm('--filter', '!@muxui/react', 'run', 'check')], workspace), null);
  assert.equal(groupPackageDirectories([pnpm('--dir', 'elsewhere', 'run', 'check')], workspace), null);
});

test('Storybook groups are affected only by overlapping families, tooling, or chrome proof', () => {
  const [, react, tree] = reuseGroups;
  const chrome = { ...tree, id: 'storybook-chrome', storyRun: { proof: 'chrome', families: [] } };
  const storyDelta = (storyRuns, extra = {}) => ({
    changedPaths: ['catalog/components/number-field/artifact.json'], groupIds: ['react'], storyRuns, storyTooling: false, ...extra,
  });
  const numberField = storyDelta([{ proof: 'component', families: ['NumberField'] }]);
  assert.equal(affectedReason(tree, numberField), null);
  assert.equal(affectedReason(chrome, numberField), null);
  assert.match(affectedReason(react, numberField), /changes route to react/u);
  assert.match(affectedReason({ ...react, id: 'browser-firefox', kind: 'browser', packageDirectories: [] }, numberField), /react/u);
  assert.match(affectedReason(tree, storyDelta([{ proof: 'story', families: ['NumberField', 'Tree'] }])), /story proof for NumberField, Tree/u);
  assert.match(affectedReason(tree, storyDelta([{ proof: 'theme', families: [] }])), /every family/u);
  assert.match(affectedReason({ ...tree, storyRun: { proof: 'theme', families: [] } }, numberField), /NumberField/u);
  assert.match(affectedReason(tree, storyDelta([], { storyTooling: true })), /Storybook tooling/u);
  assert.match(affectedReason(chrome, storyDelta([{ proof: 'chrome', families: [] }])), /chrome/u);
  assert.match(affectedReason({ ...tree, storyRun: undefined }, numberField), /no reuse rule/u);
});

test('an identical tree reuses every earlier pass', async () => {
  const all = { checks: 'success', react: 'success', 'storybook-component': 'success' };
  assert.deepEqual(Object.values(outcome(await decide([earlierRun(7, all)]))), ['reused', 'reused', 'reused']);
});

const reuseEnvironment = {
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_REPOSITORY: 'o/r',
  GITHUB_RUN_ID: '2000',
  GITHUB_HEAD_REF: 'fix/thing',
  GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/ci.yml@refs/pull/9/merge',
  MUXUI_PR_HEAD_REPO: 'o/r',
  MUXUI_PR_HEAD_SHA: commitHead,
};
const commandGroups = reuseGroups.map(({ id, kind, storyRun, packageDirectories }) => ({
  id, kind, storyRun, packageDirectories, commands: [{ command: 'pnpm', args: [id] }],
}));

function fakeClient(runs, { jobsFail = [], recordFail = [] } = {}) {
  const calls = [];
  const find = (id) => runs.find(({ apiRun }) => apiRun.id === id);
  return {
    calls,
    listRuns(branch) {
      calls.push(['list', branch]);
      return runs.map(({ apiRun }) => apiRun);
    },
    runJobs(id) {
      if (jobsFail.includes(id)) throw new Error('HTTP 502');
      return find(id).jobs;
    },
    downloadRecord(id) {
      if (recordFail.includes(id)) throw new Error('no artifact');
      return find(id).record;
    },
  };
}

function apiRunFor(run, overrides = {}) {
  return {
    ...run,
    apiRun: {
      id: run.runId, run_number: run.runNumber, html_url: run.url, event: 'pull_request', head_sha: run.headSha,
      head_branch: 'fix/thing', head_repository: { full_name: 'o/r' }, ...overrides,
    },
  };
}

test('reuse is off outside first-attempt same-repository pull request runs, with the kill switch, or for full plans', async () => {
  assert.equal(reuseDisabledReason(reuseEnvironment), null);
  assert.match(reuseDisabledReason({ ...reuseEnvironment, GITHUB_RUN_ATTEMPT: '2' }), /attempt 2/u);
  assert.match(reuseDisabledReason({ ...reuseEnvironment, MUXUI_CI_REUSE: 'off' }), /MUXUI_CI_REUSE/u);
  assert.match(reuseDisabledReason(reuseEnvironment, { full: true }), /full-workspace/u);
  assert.match(reuseDisabledReason({ ...reuseEnvironment, GITHUB_EVENT_NAME: 'push' }), /not a pull_request/u);
  assert.match(reuseDisabledReason({ ...reuseEnvironment, MUXUI_PR_HEAD_REPO: 'fork/r' }), /fork pull request/u);
  assert.match(reuseDisabledReason({ ...reuseEnvironment, MUXUI_PR_HEAD_SHA: '' }), /MUXUI_PR_HEAD_SHA/u);
  for (const environment of [{ ...reuseEnvironment, MUXUI_CI_REUSE: 'off' }, { ...reuseEnvironment, MUXUI_PR_HEAD_REPO: 'fork/r' }]) {
    const client = fakeClient([]);
    const { decisions, record } = await planReuse({
      groups: commandGroups, head: commitHead, environment, client, deltaFor: async () => noDelta, headChangesFor: noHeadChanges, log: () => {},
    });
    assert.deepEqual(client.calls, []);
    assert.ok(decisions.every(({ reusedFrom }) => reusedFrom === ''));
    assert.ok(record.groups.every(({ testedCommit }) => testedCommit === commitHead));
  }
});

test('earlier runs come from the same PR head and API, artifact, or head mismatches degrade to no reuse', async () => {
  const signed = commandGroups.map(({ id, kind, storyRun, commands }) => ({ id, kind, storyRun, signature: groupSignature(commands) }));
  const all = { checks: 'success', react: 'success', 'storybook-component': 'success' };
  const good = apiRunFor(earlierRun(3, all, { groups: signed }));
  const brokenJobs = apiRunFor(earlierRun(4, all, { groups: signed }));
  const missingRecord = apiRunFor(earlierRun(5, all, { groups: signed }));
  const forgedHead = apiRunFor(earlierRun(6, all, { groups: signed }), { head_sha: commitB });
  const otherFork = apiRunFor(earlierRun(7, all, { groups: signed }), { head_repository: { full_name: 'fork/r' } });
  const current = apiRunFor(earlierRun(1000, all, { groups: signed }), { id: 2000 });
  const logs = [];
  const client = fakeClient([current, otherFork, forgedHead, missingRecord, brokenJobs, good], { jobsFail: [1004], recordFail: [1005] });
  const loaded = loadEarlierRuns({ client, environment: reuseEnvironment, log: (line) => logs.push(line) });
  assert.deepEqual(loaded.map(({ runNumber, jobs, record }) => [runNumber, jobs !== null, record !== null]), [
    [6, true, false], [5, true, false], [4, false, true], [3, true, true],
  ]);
  assert.ok(['HTTP 502', 'no artifact', 'is not the run head'].every((text) => logs.some((line) => line.includes(text))));

  const quiet = { head: commitHead, environment: reuseEnvironment, headChangesFor: noHeadChanges, log: () => {} };
  const blocked = await planReuse({ ...quiet, groups: commandGroups, client, deltaFor: async () => noDelta });
  assert.ok(blocked.decisions.every(({ reason }) => reason === 'jobs of run #4 are unreadable'));
  const reused = await planReuse({ ...quiet, groups: commandGroups, client: fakeClient([forgedHead, good]), deltaFor: async () => noDelta });
  assert.ok(reused.decisions.every(({ reusedFrom }) => reusedFrom.startsWith('run #3 ')));

  const failing = { listRuns() { throw new Error('HTTP 403'); } };
  const failed = await planReuse({ ...quiet, groups: commandGroups, client: failing, deltaFor: async () => noDelta });
  assert.ok(failed.decisions.every(({ reusedFrom, reason }) => reusedFrom === '' && reason.includes('HTTP 403')));

  const deltaFails = await planReuse({
    ...quiet, groups: commandGroups, client: fakeClient([good]), deltaFor: async () => { throw new Error('fetch failed'); },
  });
  assert.ok(deltaFails.decisions.every(({ reusedFrom, reason }) => reusedFrom === '' && reason.includes('delta plan failed: fetch failed')));
});

test('the GitHub client lists workflow runs and rejects partial job pages', () => {
  const calls = [];
  const client = createGitHubClient({
    repository: 'o/r',
    workflow: 'ci.yml',
    gh: (args) => {
      calls.push(args);
      return args[3].endsWith('/jobs')
        ? JSON.stringify({ total_count: 2, jobs: [{ name: 'run checks', conclusion: 'success' }] })
        : JSON.stringify({ workflow_runs: [] });
    },
  });
  assert.deepEqual(client.listRuns('fix/thing'), []);
  assert.deepEqual(calls[0], [
    'api', '-X', 'GET', 'repos/o/r/actions/workflows/ci.yml/runs', '-f', 'event=pull_request', '-f', 'branch=fix/thing', '-f', 'per_page=30',
  ]);
  assert.throws(() => client.runJobs(7), /unexpected jobs page/u);
});

test('a reuse failure still finishes planning with every group set to run', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ci-reuse-output-'));
  const output = join(directory, 'output');
  const log = console.log;
  console.log = () => {};
  try {
    await runCiImpact({
      full: true,
      planOnly: true,
      githubOutput: true,
      reuseRecord: join(directory, 'missing', 'record.json'),
      environment: { ...reuseEnvironment, GITHUB_OUTPUT: output },
    });
  } finally {
    console.log = log;
  }
  const matrix = JSON.parse(readFileSync(output, 'utf8').replace(/^groups=/u, ''));
  assert.ok(matrix.length > 0 && matrix.every(({ reusedFrom }) => reusedFrom === ''));
  rmSync(directory, { recursive: true, force: true });
});

// A real repository: T carries a commit that a force-push dropped from HEAD,
// and HEAD renames a docs page and edits a canonical story example.
test('deltaImpact diffs trees directly and maps story IDs to families in a real repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'ci-reuse-repo-'));
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const run = (...args) => {
    const result = spawnSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = (message) => run('git', '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qam', message);
  const example = 'catalog/components/number-field/examples/react/sizing.tsx';
  try {
    write('tooling/audits/repository-policy/repository-policy.json', JSON.stringify({ pullRequestImpact: config }));
    write('packages/react/package.json', JSON.stringify({
      name: '@muxui/react', scripts: { 'check:component': 'node ../../tooling/audits/repository-policy/src/run-component-check.mjs' },
    }));
    write('apps/react-storybook/package.json', JSON.stringify({
      name: '@muxui/react-storybook', dependencies: { '@muxui/react': 'workspace:*' }, scripts: { 'check:scoped': 'node src/check-scoped.mjs' },
    }));
    write('apps/docs/guide.md', '# Guide\n');
    write(example, 'export const Sizing = 1;\n');
    run('git', 'init', '-q', '-b', 'main');
    run('git', 'add', '.');
    commit('base');
    run('git', 'checkout', '-q', '-b', 'dropped');
    write('apps/scale/src/app.mjs', 'export {};\n');
    run('git', 'add', '.');
    commit('dropped by a force-push');
    const tested = run('git', 'rev-parse', 'HEAD');
    run('git', 'checkout', '-q', 'main');
    run('git', 'mv', 'apps/docs/guide.md', 'apps/docs/handbook.md');
    write(example, 'export const Sizing = 2;\n');
    commit('rename and edit');
    // Untracked generated metadata, as the plan job prepares it.
    write('packages/react/generated/r1-6-contract.json', JSON.stringify({
      components: [{ family: 'NumberField', export: 'NumberField', slug: 'number-field', source: 'packages/react/src/fields.mjs' }],
    }));
    write('apps/react-storybook/.storybook/generated/manifest.mjs', `export const manifest = Object.freeze(${JSON.stringify({
      schema: 'muxui-react-storybook-manifest-v1',
      pageIndex: [{
        family: 'NumberField',
        storyFile: 'apps/react-storybook/.storybook/generated/number-field.stories.mjs',
        stories: [{ id: 'number-field--sizing', exportName: 'Sizing', source: example }],
      }],
    })});\n`);

    const script = `const { deltaImpact } = await import(${JSON.stringify(resolve(import.meta.dirname, '../src/ci-impact.mjs'))});
      console.log(JSON.stringify(await deltaImpact(process.env.TESTED, { environment: {} })));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root, encoding: 'utf8', env: { ...process.env, MUXUI_TASK_REPOSITORY_ROOT: root, TESTED: tested },
    });
    assert.equal(result.status, 0, result.stderr);
    const delta = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.deepEqual(delta.changedPaths, ['apps/docs/guide.md', 'apps/docs/handbook.md', 'apps/scale/src/app.mjs', example]);
    assert.deepEqual(delta.groupIds, ['checks', 'browser-chromium', 'react', 'storybook-story']);
    assert.deepEqual(delta.storyRuns, [{ proof: 'story', families: ['NumberField'] }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Planned commands run with MUXUI_PREREQUISITES_READY=1, so every prerequisite
// a package script would prepare itself must be in the plan's shared generation.
function scriptPrerequisites(workspacePackages, owner, scriptName, seen = new Set()) {
  const key = `${owner.name} ${scriptName}`;
  const script = owner.manifest.scripts?.[scriptName];
  if (!script || seen.has(key)) return [];
  seen.add(key);
  const filters = [...script.matchAll(/prepare-prerequisites\.mjs (\S+)/gu)].map(([, filter]) => filter);
  // Follow `pnpm <script>` and `pnpm --filter <package> <script>` calls.
  const nested = [...script.matchAll(/(?:^|&& )pnpm (?:--filter (\S+) )?(?:run )?([a-z:]+)/gu)].flatMap(([, target, name]) => {
    const next = target ? workspacePackages.find((item) => item.name === target) : owner;
    return next ? scriptPrerequisites(workspacePackages, next, name, seen) : [];
  });
  return [...filters, ...nested];
}

function filterSelection(workspacePackages, filter) {
  const match = filter.match(/^(@[^.^]+)(\^?)\.\.\.$/u);
  assert.ok(match, `unsupported prerequisite filter ${filter}`);
  return dependencyClosure(workspacePackages, [match[1]])
    .filter(({ name }) => !match[2] || name !== match[1])
    .filter(({ manifest }) => typeof manifest.scripts?.generate === 'string')
    .map(({ name }) => name);
}

test('CI generation covers every prerequisite that planned package scripts would prepare', async () => {
  const workspacePackages = await discoverWorkspacePackages(repositoryRoot);
  const plans = {
    docs: await plan(['apps/docs/src/content/docs/foundations/index.mdx'], { packages: workspacePackages }),
    scale: await plan(['apps/scale/src/App.jsx'], { packages: workspacePackages }),
    scaleOnly: await plan(['apps/scale/test/browser/theme-builder.test.mjs'], { packages: workspacePackages }),
    storybook: await plan([sizingExamplePath], { packages: workspacePackages }),
    playground: await plan(['apps/react-playground/src/main.jsx'], { packages: workspacePackages }),
    full: fullWorkspacePlan(),
  };
  assert.ok(plans.playground.packageChecks.includes('@muxui/react-playground'));
  assert.ok(plans.storybook.storyRuns.length > 0);
  let checked = 0;
  for (const [label, planned] of Object.entries(plans)) {
    const commands = executionCommands(planned, { packages: workspacePackages, environment: {}, pageIndex });
    const generation = commands.find(({ prerequisite, args }) => prerequisite && args.at(-1) === 'generate');
    const generated = new Set(planned.full
      ? workspacePackages.map(({ name }) => name)
      : generation?.args.filter((_, index) => generation.args[index - 1] === '--filter') ?? []);
    for (const { args } of commands) {
      const runIndex = args.indexOf('run');
      const owner = workspacePackages.find(({ name }) => name === args[args.indexOf('--filter') + 1]);
      if (runIndex === -1 || !owner || args.includes('--recursive')) continue;
      for (const filter of scriptPrerequisites(workspacePackages, owner, args[runIndex + 1])) {
        checked += 1;
        for (const name of filterSelection(workspacePackages, filter)) {
          assert.ok(generated.has(name), `${label}: ${args.join(' ')} needs ${name} generated (${filter})`);
        }
      }
    }
  }
  assert.ok(checked >= 5, `expected prerequisite-preparing scripts in the plans, found ${checked}`);
});

// Planner gaps: each case is a legitimate change that planning used to reject
// or under-select.

const workspacePackages = await discoverWorkspacePackages(repositoryRoot);
const generatePath = 'packages/react/src/generate.mjs';
const contractsPath = 'packages/react/src/r1-contracts.mjs';
const cardStubPath = 'packages/react/src/supplemental/card.mjs';
const generatorModuleSources = {
  [generatePath]: "import { assertContracts } from './r1-contracts.mjs';\nassertContracts();",
  [contractsPath]: 'export function assertContracts() {}',
  [supplementalPath]: 'export const MultiSelect = () => null; export const TagSelect = () => null; export const Card = () => null;',
};

test('deleting an unimported React module runs the React package check', async () => {
  const stub = "export { Card } from './index.mjs';\n";
  const result = await plan([cardStubPath], {
    textSnapshots: { [cardStubPath]: { before: stub, after: null } },
    moduleSources: { ...generatorModuleSources, [cardStubPath]: { before: stub, after: null } },
  });
  assert.deepEqual(result.packageChecks, ['@muxui/react']);
  assert.deepEqual(result.reactTestFiles, [], 'the package check already runs every React unit test');
  assert.equal(result.reactPackageFull, false);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.storyRuns, []);

  // A changed module that nothing imports is still unowned.
  await assert.rejects(plan([cardStubPath], {
    textSnapshots: { [cardStubPath]: { before: stub, after: "export { TagSelect } from './index.mjs';\n" } },
    moduleSources: { ...generatorModuleSources, [cardStubPath]: { before: stub, after: "export { TagSelect } from './index.mjs';\n" } },
  }), /MUXUI_CI_IMPACT_SOURCE_OWNERSHIP/u);
});

test('a deleted React module still named outside React source routes to each referencing owner', async () => {
  const reactTestReferenceSources = await reactTestTexts();
  const deleted = (path, references) => plan([path], {
    packages: workspacePackages,
    reactTestReferenceSources,
    textSnapshots: { [path]: { before: 'export const Probe = 1;\n', after: null } },
    moduleSources: { ...generatorModuleSources, [path]: { before: 'export const Probe = 1;\n', after: null } },
    findReferences: async (needle) => {
      assert.equal(needle, path.slice('packages/react/'.length));
      return references;
    },
  });

  const commandPalette = await deleted('packages/react/src/supplemental/command-palette.mjs', [
    'packages/react/test/browser/bento-input-controls.test.mjs',
    'packages/react/test/command-palette-hook.test.mjs',
  ]);
  assert.deepEqual(commandPalette.reactTestFiles, [
    'test/browser/bento-input-controls.test.mjs',
    'test/command-palette-hook.test.mjs',
  ]);
  // A deletion no family or theme analysis ties to an export reaches no dependents.
  assert.deepEqual(commandPalette.packageChecks, ['@muxui/react']);

  const buttonFixture = await deleted('packages/react/src/button-fixture.mjs', ['apps/react-playground/src/main.jsx']);
  assert.deepEqual(buttonFixture.packageChecks, ['@muxui/react', '@muxui/react-playground']);

  // A reference with no owner route widens to the policy check instead of being dropped.
  const unowned = await deleted('packages/react/src/button-fixture.mjs', ['scripts/unowned.mjs']);
  assert.equal(unowned.policy, true);
  assert.match(unowned.notices[0], /^scripts\/unowned\.mjs has no owner route/u);
});

test('modules the React projection compiler imports take the compiler route', async () => {
  const after = 'export function assertContracts() { return true; }';
  const result = await plan([contractsPath], {
    textSnapshots: { [contractsPath]: { before: generatorModuleSources[contractsPath], after } },
    moduleSources: { ...generatorModuleSources, [contractsPath]: { before: generatorModuleSources[contractsPath], after } },
  });
  assert.equal(result.reactPackageFull, true);
  assert.deepEqual(result.storyFamilies, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']);
  assert.equal(result.tailwind, true);
  assert.equal(result.reactProjectionCheck, false);
});

function nativeLockfile(withRenderer) {
  return [
    "lockfileVersion: '9.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '',
    'importers:',
    '',
    '  packages/react-native:',
    '    devDependencies:',
    '      react:',
    '        specifier: 19.2.8',
    '        version: 19.2.8',
    ...(withRenderer ? [
      '      react-test-renderer:',
      '        specifier: 19.2.8',
      '        version: 19.2.8(react@19.2.8)',
    ] : []),
    '',
    'packages:',
    '',
    ...(withRenderer ? [
      '  react-is@19.2.8:',
      '    resolution: {integrity: sha512-is}',
      '',
      '  react-test-renderer@19.2.8:',
      '    resolution: {integrity: sha512-renderer}',
      '    peerDependencies:',
      '      react: ^19.2.8',
      '',
    ] : []),
    '  react@19.2.8:',
    '    resolution: {integrity: sha512-react}',
    '',
    '  scheduler@0.27.0:',
    '    resolution: {integrity: sha512-scheduler}',
    '',
    'snapshots:',
    '',
    ...(withRenderer ? [
      '  react-is@19.2.8: {}',
      '',
      '  react-test-renderer@19.2.8(react@19.2.8):',
      '    dependencies:',
      '      react: 19.2.8',
      '      react-is: 19.2.8',
      '      scheduler: 0.27.0',
      '',
    ] : []),
    '  react@19.2.8:',
    '    dependencies:',
    '      scheduler: 0.27.0',
    '',
    '  scheduler@0.27.0: {}',
    '',
  ].join('\n');
}

test('records pruned with a removed devDependency route to the importer that dropped it', async () => {
  const lockfileBefore = nativeLockfile(true);
  const lockfileAfter = nativeLockfile(false);
  assert.deepEqual(changedLockfileImporters(lockfileBefore, lockfileAfter), ['packages/react-native']);
  const result = await plan(['packages/react-native/package.json', 'pnpm-lock.yaml'], {
    packages: workspacePackages, lockfileBefore, lockfileAfter,
  });
  assert.deepEqual(result.packageChecks, ['@muxui/react-native']);
  assert.equal(result.full, false);
  assert.deepEqual(result.storyRuns, []);

  // A record removed without a dropped dependency that reached it is unexplained.
  const orphaned = lockfileBefore.replace('  scheduler@0.27.0: {}\n', '  scheduler@0.27.0: {}\n\n  orphan@1.0.0: {}\n');
  assert.throws(() => changedLockfileImporters(orphaned, lockfileAfter), /MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: .*orphan@1\.0\.0/u);
  // A removed record something still depends on is unexplained too.
  const dangling = nativeLockfile(false).replace('  react@19.2.8:\n    dependencies:\n      scheduler: 0.27.0\n',
    '  react@19.2.8:\n    dependencies:\n      react-is: 19.2.8\n      scheduler: 0.27.0\n');
  assert.throws(() => changedLockfileImporters(lockfileBefore, dangling), /MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: importer packages\/react-native reaches react-is@19\.2\.8, which has no snapshot record/u);
  // So is one still referenced only from a snapshot no importer reaches.
  const withOrphan = (source) => `${source}\n  orphan@1.0.0:\n    dependencies:\n      react-is: 19.2.8\n`;
  assert.throws(() => changedLockfileImporters(withOrphan(lockfileBefore), withOrphan(lockfileAfter)), /MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: existing package resolutions were removed/u);
});

// Trimmed from the pnpm-lock.yaml diff of the @internationalized/date
// 3.12.3 to 3.12.4 pin: React reaches the date package directly and through
// react-aria; React Native shares only react and scheduler with it.
function consumerLockfile(date = '3.12.3') {
  return [
    "lockfileVersion: '9.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '',
    'importers:',
    '',
    '  packages/react:',
    '    dependencies:',
    "      '@internationalized/date':",
    `        specifier: ${date}`,
    `        version: ${date}`,
    '      react-aria:',
    '        specifier: 3.51.0',
    '        version: 3.51.0(react@19.2.8)',
    '      string-width-cjs:',
    '        specifier: npm:string-width@4.2.3',
    '        version: string-width@4.2.3',
    '    devDependencies:',
    "      '@muxui/catalog':",
    '        specifier: workspace:*',
    '        version: link:../catalog',
    '',
    '  packages/react-native:',
    '    devDependencies:',
    '      react:',
    '        specifier: 19.2.8',
    '        version: 19.2.8',
    '',
    'packages:',
    '',
    `  '@internationalized/date@${date}':`,
    `    resolution: {integrity: sha512-date-${date}}`,
    '',
    "  '@swc/helpers@0.5.23':",
    '    resolution: {integrity: sha512-helpers}',
    '',
    '  react-aria@3.51.0:',
    '    resolution: {integrity: sha512-aria}',
    '',
    '  react@19.2.8:',
    '    resolution: {integrity: sha512-react}',
    '',
    '  scheduler@0.27.0:',
    '    resolution: {integrity: sha512-scheduler}',
    '',
    '  string-width@4.2.3:',
    '    resolution: {integrity: sha512-width}',
    '',
    'snapshots:',
    '',
    `  '@internationalized/date@${date}':`,
    '    dependencies:',
    "      '@swc/helpers': 0.5.23",
    '',
    "  '@swc/helpers@0.5.23': {}",
    '',
    '  react-aria@3.51.0(react@19.2.8):',
    '    dependencies:',
    `      '@internationalized/date': ${date}`,
    '      react: 19.2.8',
    '',
    '  react@19.2.8:',
    '    dependencies:',
    '      scheduler: 0.27.0',
    '',
    '  scheduler@0.27.0: {}',
    '',
    '  string-width@4.2.3: {}',
    '',
    '  orphan@1.0.0: {}',
    '',
  ].join('\n');
}

test('changed lockfile resolutions route to every importer that reaches them', () => {
  const base = consumerLockfile();
  // A transitive snapshot only React reaches plans only React.
  const aria = base.replace("      '@internationalized/date': 3.12.3\n      react: 19.2.8\n", "      '@internationalized/date': 3.12.3\n      '@swc/helpers': 0.5.23\n      react: 19.2.8\n");
  assert.notEqual(aria, base);
  assert.deepEqual(changedLockfileImporters(base, aria), ['packages/react']);
  // A snapshot or package record shared through react plans both importers.
  const scheduler = base.replace('  scheduler@0.27.0: {}', "  scheduler@0.27.0:\n    dependencies:\n      '@swc/helpers': 0.5.23");
  assert.deepEqual(changedLockfileImporters(base, scheduler), ['packages/react', 'packages/react-native']);
  const integrity = base.replace('sha512-scheduler', 'sha512-scheduler-repacked');
  assert.deepEqual(changedLockfileImporters(base, integrity), ['packages/react', 'packages/react-native']);
  // A package record maps through its peer-suffixed snapshot.
  const ariaIntegrity = base.replace('sha512-aria', 'sha512-aria-repacked');
  assert.deepEqual(changedLockfileImporters(base, ariaIntegrity), ['packages/react']);
  // An aliased dependency reaches its target record.
  const width = base.replace('  string-width@4.2.3: {}', '  string-width@4.2.3:\n    optional: true');
  assert.deepEqual(changedLockfileImporters(base, width), ['packages/react']);
});

test('lockfile consumer tracing follows optional dependencies and URL versions', () => {
  const withOptional = consumerLockfile()
    .replace("  packages/react-native:\n    devDependencies:\n      react:\n        specifier: 19.2.8\n        version: 19.2.8\n",
      "  packages/react-native:\n    devDependencies:\n      react:\n        specifier: 19.2.8\n        version: 19.2.8\n    optionalDependencies:\n      fsevents:\n        specifier: 2.3.3\n        version: 2.3.3\n")
    .replace('  orphan@1.0.0: {}', "  fsevents@2.3.3:\n    optionalDependencies:\n      nan: 2.22.0\n\n  nan@2.22.0: {}\n\n  orphan@1.0.0: {}");
  const nan = withOptional.replace('  nan@2.22.0: {}', '  nan@2.22.0:\n    optional: true');
  assert.deepEqual(changedLockfileImporters(withOptional, nan), ['packages/react-native']);

  // Tarball and git versions are snapshot keys under the dependency's own name.
  for (const [name, version] of [
    ['@scope/x', 'https://registry.npmjs.org/@scope/x/-/x-1.0.0.tgz'],
    ['y', 'git+ssh://git@github.com/owner/y.git#0123456789abcdef'],
  ]) {
    const base = consumerLockfile()
      .replace("  packages/react-native:\n    devDependencies:\n", `  packages/react-native:\n    devDependencies:\n      '${name}':\n        specifier: ${version}\n        version: ${version}\n`)
      .replace('  orphan@1.0.0: {}', `  '${name}@${version}': {}\n\n  orphan@1.0.0: {}`);
    const scheduler = base.replace('sha512-scheduler', 'sha512-scheduler-repacked');
    assert.deepEqual(changedLockfileImporters(base, scheduler), ['packages/react', 'packages/react-native'], name);
  }
});

test('changed lockfile records no importer reaches fail closed with their names', () => {
  const base = consumerLockfile();
  const orphan = base.replace('  orphan@1.0.0: {}', '  orphan@1.0.0:\n    optional: true');
  assert.throws(() => changedLockfileImporters(base, orphan), /MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: changed or removed lockfile records reach no workspace importer: orphan@1\.0\.0;/u);
  // So does a changed package record that no snapshot uses.
  const unused = (integrity) => base.replace('snapshots:', `  unused@1.0.0:\n    resolution: {integrity: ${integrity}}\n\nsnapshots:`);
  assert.throws(() => changedLockfileImporters(unused('sha512-unused'), unused('sha512-unused-repacked')), /reach no workspace importer: unused@1\.0\.0;/u);
  // A dependency without a snapshot record leaves the graph unresolvable.
  const dangling = base.replace('      scheduler: 0.27.0\n', '      scheduler: 0.27.0\n      missing: 1.0.0\n');
  assert.throws(() => changedLockfileImporters(base, dangling), /MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: importer packages\/(react|react-native) reaches missing@1\.0\.0/u);
});

test('the @internationalized/date pin plans like a React dependency change', async () => {
  const base = consumerLockfile();
  const pinned = consumerLockfile('3.12.4');
  assert.deepEqual(changedLockfileImporters(base, pinned), ['packages/react']);
  // Pin each side explicitly so the fixture holds whichever version the repository currently declares.
  const reactPackage = await readFile(resolve(repositoryRoot, 'packages/react/package.json'), 'utf8');
  const pinDate = (version) => reactPackage.replace(/"@internationalized\/date": "[^"]+"/u, `"@internationalized/date": "${version}"`);
  const reactPackageBefore = pinDate('3.12.3');
  const reactPackageAfter = pinDate('3.12.4');
  assert.notEqual(reactPackageAfter, reactPackageBefore);
  const manifest = { packages: workspacePackages, reactPackageBefore, reactPackageAfter };
  const result = await plan(['packages/react/package.json', 'pnpm-lock.yaml'], { ...manifest, lockfileBefore: base, lockfileAfter: pinned });
  const expected = await plan(['packages/react/package.json'], manifest);
  assert.equal(result.full, false);
  assert.equal(result.reactPackageFull, true);
  assert.deepEqual(
    executionGroups(result, { packages: workspacePackages, environment: {}, pageIndex }),
    executionGroups(expected, { packages: workspacePackages, environment: {}, pageIndex }),
  );
});

test('workspace-wide inputs skip lockfile importer mapping for override-only settings changes', () => {
  const lockfileBefore = nativeLockfile(true);
  const overridden = lockfileBefore.replace('importers:', "overrides:\n  scheduler: 0.27.0\n\nimporters:");
  assert.throws(() => changedLockfileImporters(lockfileBefore, overridden), /lockfile settings changed/u);
  assert.equal(isWorkspaceWideChange(['pnpm-workspace.yaml', 'pnpm-lock.yaml'], config), true);
  assert.equal(isWorkspaceWideChange(['pnpm-lock.yaml'], config), false);
  assert.equal(isWorkspaceWideChange(['package.json'], config, '{}', '{"devDependencies":{"x":"1.0.0"}}'), true);
});

test('React examples no Storybook story uses validate the catalog, docs, and family React proof', async () => {
  const record = await plan(['catalog/components/tree/examples/react/basic.example.json']);
  assert.equal(record.catalog, true);
  assert.equal(record.docs, true);
  // The selected React family changes React output, so React's runtime
  // dependents (Figma, the playground) run too.
  assert.deepEqual(record.packageChecks, ['@muxui/figma', '@muxui/react-native', '@muxui/react-playground', '@muxui/tooling', '@muxui/web']);
  assert.deepEqual(record.reactFamilies, ['Tree']);
  assert.deepEqual(record.storyIds, []);
  assert.deepEqual(record.reactTestFiles, []);

  // Example sources are compiled by the React example type test.
  const source = await plan(['catalog/components/tree/examples/react/basic.tsx']);
  assert.deepEqual(source.reactTestFiles, ['test/catalog-examples-types.test.mjs']);

  // A family proven only by its Storybook BrowserProof runs just that page.
  const proofOnlyIndex = pageIndex.map((page) => page.family === 'NumberField'
    ? { ...page, stories: [...page.stories, { id: 'muxui-react-r1-2-number-field--browser-proof', exportName: 'BrowserProof', name: 'BrowserProof' }] }
    : page);
  const proofOnly = await plan(['catalog/components/number-field/examples/react/basic.example.json'], { pageIndex: proofOnlyIndex });
  assert.deepEqual(proofOnly.reactBehaviorProofFamilies, ['NumberField']);
  assert.deepEqual(proofOnly.storyRuns.map(({ proof, storyIds }) => ({ proof, storyIds })), [
    { proof: 'story', storyIds: ['muxui-react-r1-2-number-field--browser-proof'] },
  ]);

  // An example a story renders keeps its exact page selection, and docs and
  // the example type test still read it.
  const exact = await plan([sizingExamplePath]);
  assert.deepEqual(exact.storyIds, [sizingStoryId]);
  assert.deepEqual(exact.reactFamilies, []);
  assert.equal(exact.docs, true);
  assert.deepEqual(exact.reactTestFiles, ['test/catalog-examples-types.test.mjs']);

  // Docs render every component record.
  assert.equal((await plan(['catalog/components/tree/artifact.json'])).docs, true);

  // Docs and the type test read only .tsx sources.
  await assert.rejects(plan(['catalog/components/tree/examples/react/basic.ts']), /MUXUI_CI_IMPACT_EXAMPLE_SOURCE_UNSUPPORTED/u);
});

test('generator inputs, package fixtures, and Storybook config each route to their owner', async () => {
  const route = (path) => plan([path], { packages: workspacePackages });

  const generatorInput = await route('catalog/react-r1-6/supplemental-components.json');
  assert.equal(generatorInput.reactPackageFull, true);
  assert.equal(generatorInput.policy, true);
  // Every React family changes, so React's runtime dependents run too.
  assert.equal(generatorInput.docs && generatorInput.scale, true);
  assert.deepEqual(generatorInput.packageChecks, ['@muxui/figma', '@muxui/react-playground']);

  // R1.0 inputs are also read by schema tests and Storybook unit tests.
  const upstreamExports = await route('catalog/react-r1-0/upstream-exports.json');
  assert.equal(upstreamExports.reactPackageFull, true);
  assert.equal(upstreamExports.policy, true);
  assert.deepEqual(upstreamExports.packageChecks, ['@muxui/figma', '@muxui/react-playground', '@muxui/schema']);
  assert.deepEqual(upstreamExports.storyUnitTests, [{ file: 'test/storybook.test.mjs' }]);

  const capability = await route('catalog/capabilities/query-baseline.json');
  assert.equal(capability.catalog, true);
  assert.deepEqual(capability.packageChecks, ['@muxui/react-native', '@muxui/tooling', '@muxui/web']);

  assert.deepEqual((await route('tests/fixtures/g0.5/corpus.json')).packageChecks, ['@muxui/tooling']);
  assert.deepEqual((await route('tests/fixtures/g1.1/platform-safety-fixtures.json')).packageChecks, ['@muxui/web']);
  assert.deepEqual((await route('tests/fixtures/g1.2/profile.mjs')).packageChecks, ['@muxui/react-native']);
  assert.equal((await route('tests/fixtures/g1.2/AGENTS.md')).policy, true);

  const tailwind = await route('tests/fixtures/tailwind-consumer/check.mjs');
  assert.equal(tailwind.tailwind, true);
  assert.deepEqual(tailwind.packageChecks, []);

  // main.mjs sets the manager head (fonts, theme CSS) and builds every page.
  const main = await route('apps/react-storybook/.storybook/main.mjs');
  assert.equal(main.storyChrome, true);
  assert.deepEqual(main.storyFamilies, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']);
  assert.deepEqual(main.storyUnitTests, [{ file: 'test/storybook.test.mjs' }]);
  const previewCss = await route('apps/react-storybook/.storybook/preview.css');
  assert.deepEqual(previewCss.storyUnitTests.map(({ file }) => file), ['test/storybook-colors.test.mjs', 'test/storybook.test.mjs']);
  assert.equal((await route('apps/react-storybook/.storybook/measure-palette.mjs')).storyUnitTests[0].file, 'test/storybook-colors.test.mjs');
  assert.equal((await route('apps/react-storybook/.storybook/manager.mjs')).storyChrome, true);
  assert.equal((await route('apps/react-storybook/.gitignore')).policy, true);
});

test('a Storybook tooling file with no focused unit route widens instead of failing', async () => {
  const route = (path) => plan([`apps/react-storybook/${path}`], { packages: workspacePackages });
  // A new test file runs itself.
  const newTest = await route('test/storybook-new.test.mjs');
  assert.equal(newTest.storyTooling, true);
  assert.deepEqual(newTest.storyUnitTests, [{ file: 'test/storybook-new.test.mjs' }]);
  assert.deepEqual(newTest.storyFamilies, []);
  assert.match(newTest.notices[0], /^apps\/react-storybook\/test\/storybook-new\.test\.mjs has no focused Storybook unit-test route; running that test file/u);
  // A helper with unknown importers gets the complete Storybook proof: every
  // component family, every Block page by story ID, and every unit test.
  const helper = await plan(['apps/react-storybook/test/helpers/new-helper.mjs'], {
    packages: workspacePackages,
    pageIndex: [...pageIndex, ...blockPages],
  });
  assert.deepEqual(helper.storyFamilies, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']);
  assert.deepEqual(helper.storyIds, [
    'muxui-block-poster-grid--css-grid',
    'muxui-block-poster-grid--virtualized',
    'muxui-block-task-filters--filter-bar',
  ]);
  assert.deepEqual(helper.storyRuns.map(({ proof, families }) => [proof, families]), [
    ['component', ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']],
    ['story', ['Poster grid', 'Task filters']],
  ]);
  const unitFiles = readdirSync(resolve(repositoryRoot, 'apps/react-storybook/test')).filter((name) => name.endsWith('.test.mjs')).sort();
  assert.ok(unitFiles.length >= 8);
  assert.deepEqual(helper.storyUnitTests.map(({ file }) => file), unitFiles.map((name) => `test/${name}`));
  // The a11y and colour files also hold browser audits, so only their pinned unit cases run.
  const pinned = new Set(helper.storyUnitTests.filter(({ testNamePattern }) => testNamePattern).map(({ file }) => file));
  assert.deepEqual([...pinned].sort(), ['test/storybook-a11y.test.mjs', 'test/storybook-colors.test.mjs']);
  assert.match(helper.notices[0], /unknown importers; running the complete Storybook proof/u);
  // A routed file adds no notice.
  assert.deepEqual((await route('test/storybook.test.mjs')).notices, []);
});

test('a CSS change no family owns widens to the full React and Storybook proof', async () => {
  const cssPath = 'packages/react/src/styles/base.css';
  const result = await plan([cssPath], {
    packages: workspacePackages,
    pageIndex: [...pageIndex, ...blockPages],
    textSnapshots: { [cssPath]: { before: ':root { --a: 1; }', after: ':root { --a: 2; }' } },
    moduleSources: cssModuleSources,
  });
  assert.equal(result.reactPackageFull, true);
  assert.equal(result.storyIds.length, 3, 'the Block pages are part of the full Storybook proof');
  assert.equal(result.reactProjectionCheck, false);
  assert.equal(result.tailwind, true);
  assert.deepEqual(result.storyFamilies, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']);
  assert.match(result.notices[0], /^packages\/react\/src\/styles\/base\.css: changed global selector ":root".*; running the full React and Storybook proof$/u);
  // A selector a family owns stays scoped and adds no notice.
  const scoped = await plan(['packages/react/src/styles/components.css'], {
    textSnapshots: { 'packages/react/src/styles/components.css': { before: '.muxui-tree { color: black; }', after: '.muxui-tree { color: white; }' } },
    moduleSources: cssModuleSources,
  });
  assert.equal(scoped.reactPackageFull, false);
  assert.deepEqual(scoped.notices, []);
});

test('every pinned Storybook unit-test title still names a test in its file', async () => {
  const paths = ['test/storybook-a11y.test.mjs', 'test/storybook-colors.test.mjs', '.storybook/measure-palette.mjs', '.storybook/preview.css'];
  let pinned = 0;
  for (const path of paths) {
    const { storyUnitTests } = await plan([`apps/react-storybook/${path}`], { packages: workspacePackages });
    for (const { file, testNamePattern } of storyUnitTests) {
      if (!testNamePattern) continue;
      const source = await readFile(resolve(repositoryRoot, 'apps/react-storybook', file), 'utf8');
      for (const pattern of testNamePattern.split('|')) {
        pinned += 1;
        // A renamed title would match no test, and node --test passes when nothing matches.
        assert.ok(source.includes(`test('${pattern.slice(1, -1)}'`), `${file}: ${pattern}`);
      }
    }
  }
  assert.equal(pinned, 9);
});

test('a shared Storybook path covers every page, Block pages included', async () => {
  const blockIds = blockPages.flatMap(({ stories }) => stories.map(({ id }) => id)).sort();
  for (const path of [
    'apps/react-storybook/.storybook/preview.mjs',
    'apps/react-storybook/.storybook/main.mjs',
    'apps/react-storybook/src/storybook-factory.mjs',
  ]) {
    const result = await plan([path], { packages: workspacePackages, pageIndex: [...pageIndex, ...blockPages] });
    assert.deepEqual(result.storyFamilies, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree'], path);
    assert.deepEqual(result.storyIds, blockIds, path);
    // main.mjs also adds the manager chrome proof.
    assert.deepEqual(result.storyRuns.filter(({ proof }) => proof !== 'chrome').map(({ proof, families }) => [proof, families]), [
      ['component', ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']],
      ['story', ['Poster grid', 'Task filters']],
    ], path);
  }
  // Without Block pages in the index the plan is the component families alone.
  const plain = await plan(['apps/react-storybook/.storybook/preview.mjs'], { packages: workspacePackages });
  assert.deepEqual(plain.storyIds, []);
});

test('every route that means every Storybook page plans the Block pages too', async () => {
  const withBlocks = { packages: workspacePackages, pageIndex: [...pageIndex, ...blockPages] };
  const blockIds = blockPages.flatMap(({ stories }) => stories.map(({ id }) => id)).sort();
  const reactBefore = JSON.stringify({ name: '@muxui/react', dependencies: { react: '19.0.0' } });
  const reactAfter = JSON.stringify({ name: '@muxui/react', dependencies: { react: '19.1.0' } });
  const storybookPath = 'apps/react-storybook/package.json';
  const importer = (before, after) => ({
    lockfileBefore: lockfile('    devDependencies: {}', before),
    lockfileAfter: lockfile('    devDependencies: {}', after),
  });
  const reactImporter = importer('    dependencies: {}', '    dependencies:\n      react:\n        specifier: 19.0.0\n        version: 19.0.0');
  const storybookImporter = Object.fromEntries(Object.entries(reactImporter).map(([key, text]) => [key, text.replace('  packages/react:', '  apps/react-storybook:')]));
  const cases = {
    'the React package runtime boundary': await plan(['packages/react/package.json'], { ...withBlocks, reactPackageBefore: reactBefore, reactPackageAfter: reactAfter }),
    'the Storybook package runtime boundary': await plan([storybookPath], {
      ...withBlocks,
      textSnapshots: { [storybookPath]: { before: JSON.stringify({ dependencies: { vite: '1' } }), after: JSON.stringify({ dependencies: { vite: '2' } }) } },
    }),
    'the React projection compiler': await plan(['packages/react/src/generate.mjs'], withBlocks),
    'a React lockfile importer': await plan(['pnpm-lock.yaml'], { ...withBlocks, ...reactImporter }),
    'a Storybook lockfile importer': await plan(['pnpm-lock.yaml'], { ...withBlocks, ...storybookImporter }),
    'a file owned by @muxui/react': await plan(['packages/react/advisory/note.md'], withBlocks),
  };
  for (const [label, result] of Object.entries(cases)) {
    assert.deepEqual(result.storyFamilies, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree'], label);
    assert.deepEqual(result.storyIds, blockIds, label);
    assert.ok(result.storyRuns.some(({ proof, families }) => proof === 'story' && families.includes('Poster grid')), label);
  }
  // Block pages take their titles from their patterns, so the component grouping selects component pages only.
  const navigation = await plan(['apps/component-navigation.mjs'], withBlocks);
  assert.deepEqual(navigation.storyFamilies, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']);
  assert.deepEqual(navigation.storyIds, []);
});

// Plans every tracked path as a no-op edit with the generated React records,
// a page per family, and real sources; any planner error fails the test.
test('every tracked path plans without a planner error', async () => {
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  const text = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');
  const generated = (path) => JSON.parse(text(path).split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
  const realRecords = familyRecordsFromContract(
    generated('packages/react/generated/r1-6-contract.json'),
    generated('packages/react/generated/descriptor.json').bindings ?? [],
  );
  const familyPages = realRecords.map(({ family, export: name, slug }) => ({
    family: name ?? family,
    storyFile: `apps/react-storybook/.storybook/generated/${slug}.stories.mjs`,
    stories: ['Default', 'BrowserProof'].map((exportName) => ({ id: `${slug}--${exportName.toLowerCase()}`, exportName, name: exportName })),
  }));
  const sources = (prefix, keep = () => true) => Object.fromEntries(tracked
    .filter((path) => path.startsWith(prefix) && keep(path))
    .map((path) => [path, text(path)]));
  const moduleSources = Object.fromEntries(Object.entries(sources('packages/react/src/', (path) => path.endsWith('.mjs')))
    .map(([path, source]) => [path, { before: source, after: source }]));
  const testTexts = Object.fromEntries(Object.entries(sources('packages/react/test/'))
    .map(([path, source]) => [path.slice('packages/react/'.length), source]));
  const failures = [];
  for (const path of tracked) {
    await buildPullRequestImpact({
      ...inputFor([path], {
        packages: workspacePackages,
        records: realRecords,
        pageIndex: familyPages,
        moduleSources,
        componentTestSources: Object.fromEntries(Object.entries(testTexts).filter(([file]) => file.endsWith('.test.mjs'))),
        reactTestReferenceSources: testTexts,
        compareGeneratorEmissions: async () => ({ storyIds: [], reason: 'unchanged emission' }),
      }),
      readBaseText: async (candidate) => text(candidate),
      readHeadText: async (candidate) => text(candidate),
      rootPackageBefore: text('package.json'),
      rootPackageAfter: text('package.json'),
      reactPackageBefore: text('packages/react/package.json'),
      reactPackageAfter: text('packages/react/package.json'),
    }).catch((error) => failures.push(`${path}: ${error.message.slice(0, 200)}`));
  }
  assert.deepEqual(failures, []);
});

async function reactTestTexts() {
  const files = spawnSync('git', ['ls-files', '-z', 'packages/react/test'], { cwd: repositoryRoot, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  return Object.fromEntries(await Promise.all(files.map(async (file) => [
    file.slice('packages/react/'.length),
    await readFile(resolve(repositoryRoot, file), 'utf8'),
  ])));
}

test('a shared React test helper reruns the test files that reference it', async () => {
  const reactTestReferenceSources = await reactTestTexts();
  const harness = await plan(['packages/react/test/browser/harness.mjs'], {
    reactTestReferenceSources,
    textSnapshots: { 'packages/react/test/browser/harness.mjs': { after: 'present' } },
  });
  const importers = Object.entries(reactTestReferenceSources)
    .filter(([file, text]) => file.endsWith('.test.mjs') && /from '\.\/harness\.mjs'/u.test(text))
    .map(([file]) => file);
  assert.ok(importers.length > 5, 'harness has browser test importers');
  for (const file of importers) assert.ok(harness.reactTestFiles.includes(file), `${file} reruns`);
  assert.ok(!harness.reactTestFiles.includes('test/browser/harness.mjs'));

  // Browser entries are named by path string, and fixtures reach tests through them.
  const fixture = await plan(['packages/react/test/fixtures/tree-motion-fixture.mjs'], {
    reactTestReferenceSources,
    textSnapshots: { 'packages/react/test/fixtures/tree-motion-fixture.mjs': { after: 'present' } },
  });
  assert.ok(fixture.reactTestFiles.includes('test/browser/tree-motion.test.mjs'));

  // A helper no test references has unknown consumers: the full React proof runs.
  const unused = await plan(['packages/react/test/support/unused.mjs'], {
    reactTestReferenceSources,
    textSnapshots: { 'packages/react/test/support/unused.mjs': { after: 'export {};' } },
  });
  assert.equal(unused.reactPackageFull, true);
  assert.match(unused.notices[0], /^packages\/react\/test\/support\/unused\.mjs is not referenced by any React test file; running the full React proof/u);
  assert.deepEqual(harness.notices, []);
});


test('a family-scoped React change runs its runtime workspace dependents whole and keeps the family scope', async () => {
  // Playground, docs, and Scale each declare "@muxui/react": "workspace:*" in dependencies.
  for (const name of ['@muxui/react-playground', '@muxui/docs', '@muxui/scale']) {
    assert.equal(workspacePackages.find((item) => item.name === name).manifest.dependencies['@muxui/react'], 'workspace:*', name);
  }
  // Tree is moved into fields.mjs here because the fixture has focused Tree tests.
  const fieldsBefore = `export const NumberField = () => null;\n${treeBefore}`;
  const fieldsAfter = `export const NumberField = () => null;\n${treeAfter}`;
  const result = await plan([fieldsPath], {
    packages: workspacePackages,
    records: records.map((record) => record.family === 'Tree' ? { ...record, source: fieldsPath } : record),
    textSnapshots: { [fieldsPath]: { before: fieldsBefore, after: fieldsAfter } },
    moduleSources: { ...cssModuleSources, [fieldsPath]: { before: fieldsBefore, after: fieldsAfter } },
  });
  assert.ok(result.packageChecks.includes('@muxui/react-playground'));
  assert.equal(result.docs && result.scale, true);
  assert.equal(result.reactPackageFull, false);
  assert.deepEqual(result.reactFamilies, ['Tree']);
  assert.deepEqual(result.storyRuns.map(({ proof, families }) => ({ proof, families })), [{ proof: 'component', families: ['Tree'] }]);
});

test('a dependent-only change never plans the workspaces it depends on', async () => {
  const result = await plan(['apps/react-playground/src/main.jsx'], { packages: workspacePackages });
  assert.deepEqual(result.packageChecks, ['@muxui/react-playground']);
  assert.equal(result.reactPackageFull || result.reactProjectionCheck || result.docs || result.scale, false);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.storyRuns, []);
});

const linkedPackage = (name, manifest = {}) => ({ name: `@fixture/${name}`, path: `packages/${name}`, manifest: { scripts: { check: 'check' }, ...manifest } });

test('runtime workspace dependents plan transitively; devDependency dependents run only their package check', async () => {
  const linked = [
    linkedPackage('a', { dependencies: { '@fixture/b': 'workspace:*' } }),
    linkedPackage('b', { peerDependencies: { '@fixture/c': 'link:../c' } }),
    linkedPackage('c'),
    linkedPackage('d', { devDependencies: { '@fixture/c': 'workspace:^' } }),
    linkedPackage('e', { dependencies: { '@fixture/d': 'workspace:*' } }),
    // A registry spec is not a workspace link.
    linkedPackage('f', { dependencies: { '@fixture/c': '1.0.0' } }),
    // Both edge kinds reach g: the runtime edge wins.
    linkedPackage('g', { devDependencies: { '@fixture/c': 'workspace:*' }, dependencies: { '@fixture/b': 'workspace:*' } }),
  ];
  assert.deepEqual(workspaceDependentRoutes(linked, ['@fixture/c']), [
    { name: '@fixture/a', via: '@fixture/b', scope: 'package' },
    { name: '@fixture/b', via: '@fixture/c', scope: 'package' },
    { name: '@fixture/d', via: '@fixture/c', scope: 'check' },
    { name: '@fixture/g', via: '@fixture/b', scope: 'package' },
  ]);
  const result = await plan(['packages/c/src/index.mjs'], { packages: linked });
  assert.deepEqual(result.packageChecks, ['@fixture/a', '@fixture/b', '@fixture/c', '@fixture/d', '@fixture/g']);
  assert.deepEqual(workspaceDependentRoutes(linked, ['@fixture/a']), []);
});

test('a devDependency on a changed package runs only the dependent package check', async () => {
  // React depends on the schema only as a devDependency.
  const result = await plan(['packages/schema/src/validation.mjs'], { packages: workspacePackages });
  assert.ok(result.packageChecks.includes('@muxui/react'));
  assert.equal(result.reactPackageFull, false);
  assert.deepEqual(result.reactFamilies, []);
  assert.ok(!result.storyRuns.some(({ proof }) => proof === 'component'));
  // React's runtime dependents are not reached through its devDependency edge.
  assert.ok(!result.packageChecks.includes('@muxui/react-playground'));
});

test('a workspace dependency cycle plans each member once without looping', async () => {
  const cycle = [
    linkedPackage('x', { dependencies: { '@fixture/y': 'workspace:*' } }),
    linkedPackage('y', { dependencies: { '@fixture/x': 'workspace:*' } }),
  ];
  assert.deepEqual(workspaceDependentRoutes(cycle, ['@fixture/x']), [
    { name: '@fixture/x', via: '@fixture/y', scope: 'package' },
    { name: '@fixture/y', via: '@fixture/x', scope: 'package' },
  ]);
  const result = await plan(['packages/x/src/index.mjs'], { packages: cycle });
  assert.deepEqual(result.packageChecks, ['@fixture/x', '@fixture/y']);
});

const reactDependents = ['@muxui/figma', '@muxui/react-playground'];

test('canonical token sources plan the token package dependents while React keeps its theme proof', async () => {
  const result = await plan(['catalog/tokens/default-theme.json'], { packages: workspacePackages });
  // Scale and docs read the token source directly and depend on tokens at runtime.
  assert.equal(result.scale && result.docs, true);
  assert.ok(result.packageChecks.includes('@muxui/figma'));
  // tokens -> catalog -> React is scoped by the originally changed tokens package.
  assert.equal(result.reactTheme, true);
  assert.equal(result.reactPackageFull, false);
  assert.ok(!result.packageChecks.includes('@muxui/react'));
  assert.ok(!result.packageChecks.includes('@muxui/react-playground'));
});

test('semantic no-op React source and unshipped package files plan no dependents', async () => {
  const before = 'export const NumberField = () => null;\n';
  const comment = await plan([fieldsPath], {
    packages: workspacePackages,
    textSnapshots: { [fieldsPath]: { before, after: `// Comment only.\n${before}` } },
    moduleSources: { ...cssModuleSources, [fieldsPath]: { before, after: `// Comment only.\n${before}` } },
  });
  assert.deepEqual(comment.reactFamilies, []);
  assert.equal(comment.docs || comment.scale, false);
  assert.deepEqual(comment.packageChecks, []);

  for (const path of ['packages/react/advisory/bento-migration.md', 'packages/react/AGENTS.md', 'packages/tokens/NOTICE', 'packages/tokens/README.md']) {
    const result = await plan([path], { packages: workspacePackages });
    assert.equal(result.docs || result.scale, false, path);
    assert.ok(!reactDependents.some((name) => result.packageChecks.includes(name)), path);
  }
});

test('a React lockfile importer change plans the React runtime dependents', async () => {
  const lockfileBefore = lockfile('    devDependencies: {}', '    dependencies:\n      react-aria-components:\n        specifier: 1.0.0\n        version: 1.0.0');
  const lockfileAfter = lockfile('    devDependencies: {}', '    dependencies:\n      react-aria-components:\n        specifier: 1.1.0\n        version: 1.1.0');
  const result = await plan(['pnpm-lock.yaml'], { packages: workspacePackages, lockfileBefore, lockfileAfter });
  assert.equal(result.reactPackageFull, true);
  assert.ok(result.packageChecks.includes('@muxui/react-playground'));
  assert.equal(result.docs && result.scale, true);
});

test('catalog edits run the React Native and Web package checks but not the React package check', async () => {
  for (const path of ['catalog/guides/accessibility.md', 'packages/catalog/src/compiler.mjs']) {
    const result = await plan([path], { packages: workspacePackages });
    const commands = executionCommands(result, { packages: workspacePackages }).map(({ args }) => args.join(' '));
    assert.ok(!commands.includes('--filter @muxui/react run check'), path);
    assert.equal(result.reactPackageFull, false, path);
    for (const name of ['@muxui/react-native', '@muxui/web']) assert.ok(result.packageChecks.includes(name), `${path} ${name}`);
  }
});

test('pattern sources route to the catalog, tooling goldens, docs, and the packed example type test without a React family', async () => {
  const directory = 'catalog/patterns/poster-grid';
  const browserTest = 'test/browser/pattern-poster-grid.test.mjs';
  const inputs = [
    `${directory}/artifact.json`,
    `${directory}/examples/react/css-grid.example.json`,
    `${directory}/examples/react/css-grid.tsx`,
    `${directory}/assets/mark.svg`,
  ];
  for (const path of inputs) {
    const result = await plan([path]);
    assert.equal(result.catalog && result.docs, true, path);
    // Patterns belong to @muxui/catalog, like guides: its dependents run their own checks.
    assert.deepEqual(result.packageChecks, ['@muxui/react-native', '@muxui/tooling', '@muxui/web'], path);
    assert.deepEqual(result.reactFamilies, [], path);
    assert.equal(result.tokens || result.reactTheme || result.reactPackageFull || result.storyTooling, false, path);
    assert.equal(
      result.reasons[0],
      `${path} is a canonical pattern input; validate the catalog, its dense goldens, the docs that render it, and its Storybook pages and ${browserTest}`,
    );
    // The packed React example type test now enumerates pattern variants, so a variant source joins it
    // (E-BL1-03); the pattern's declared browser test runs for every input of an interactive pattern.
    assert.deepEqual(
      result.reactTestFiles,
      [browserTest, ...(path.endsWith('.tsx') ? ['test/catalog-examples-types.test.mjs'] : [])],
      path,
    );
  }
  // A pattern with no declared browser test adds none.
  const hero = await plan(['catalog/patterns/hero/examples/react/centered.tsx']);
  assert.deepEqual(hero.reactTestFiles, ['test/catalog-examples-types.test.mjs']);
  const commands = executionCommands(await plan([inputs[2]], { packages: workspacePackages }), { packages: workspacePackages })
    .map(({ args }) => args.join(' '));
  assert.ok(commands.includes('--filter @muxui/catalog run check'));
  assert.ok(commands.includes('--filter @muxui/tooling run check'));
  assert.ok(commands.includes('--filter @muxui/react exec node --test --test-concurrency=1 test/catalog-examples-types.test.mjs'));
  assert.ok(commands.includes(`--filter @muxui/react exec node --test --test-concurrency=1 ${browserTest}`));
});

test('pattern inputs select their generated Storybook pages for the scoped audits', async () => {
  const directory = 'catalog/patterns/poster-grid';
  const [cssId, virtualizedId] = ['css-grid', 'virtualized'].map((name) => `muxui-block-poster-grid--${name}`);
  const withPages = {
    pageIndex: [...pageIndex,
      {
        family: 'Poster grid',
        storyFile: 'apps/react-storybook/.storybook/generated/block-poster-grid.stories.mjs',
        stories: [
          { id: cssId, exportName: 'CssGrid', name: 'CSS grid', source: `${directory}/examples/react/css-grid.tsx` },
          { id: virtualizedId, exportName: 'Virtualized', name: 'Virtualized', source: `${directory}/examples/react/virtualized.tsx` },
        ],
      },
      {
        family: 'Hero',
        storyFile: 'apps/react-storybook/.storybook/generated/block-hero.stories.mjs',
        stories: [{ id: 'muxui-block-hero--centered', exportName: 'Centered', name: 'Centered', source: 'catalog/patterns/hero/examples/react/centered.tsx' }],
      },
    ],
  };
  const storyRun = (storyIds) => ({
    proof: 'story',
    families: ['Poster grid'],
    storyIds,
    reason: 'only the exact canonical story pages whose sources changed',
  });

  // A variant source selects only its own page.
  const variant = await plan([`${directory}/examples/react/css-grid.tsx`], withPages);
  assert.deepEqual(variant.storyIds, [cssId]);
  assert.deepEqual(variant.storyIdFamilies, { [cssId]: 'Poster grid' });
  assert.deepEqual(variant.storyRuns, [storyRun([cssId])]);
  assert.deepEqual(variant.storyFamilies, []);

  // The record, an example record, and an asset can change every page of that pattern, and no other pattern's.
  for (const path of [`${directory}/artifact.json`, `${directory}/examples/react/css-grid.example.json`, `${directory}/assets/mark.svg`]) {
    const result = await plan([path], withPages);
    assert.deepEqual(result.storyIds, [cssId, virtualizedId], path);
    assert.deepEqual(result.storyRuns, [storyRun([cssId, virtualizedId])], path);
  }
  const hero = await plan(['catalog/patterns/hero/artifact.json'], withPages);
  assert.deepEqual(hero.storyRuns, [{ ...storyRun(['muxui-block-hero--centered']), families: ['Hero'] }]);

  // The scoped audit runs with the Block's family name and exact page IDs.
  const commands = executionCommands(variant, { packages, environment: {} });
  assert.deepEqual(commands.at(-1).env, {
    MUXUI_STORYBOOK_AUDIT_PROOF: 'story',
    MUXUI_STORYBOOK_FAMILIES: 'Poster grid',
    MUXUI_STORYBOOK_STORY_IDS: cssId,
    MUXUI_STORYBOOK_A11Y_WORKERS: '1',
    MUXUI_STORYBOOK_COLORS_WORKERS: '2',
  });

  // A removed pattern has no page left to audit, and stray inputs name no pattern.
  assert.deepEqual((await plan([`${directory}/artifact.json`], { pageIndex })).storyRuns, []);
  assert.deepEqual((await plan(['catalog/patterns/README.md'], withPages)).storyRuns, []);

  // Pattern inputs need the generated page index to route.
  const needs = (paths) => needsStorybookGeneration(paths, config);
  assert.equal(needs([`${directory}/examples/react/css-grid.tsx`]), true);
  assert.equal(needs([`${directory}/artifact.json`]), true);
  assert.equal(needs(['catalog/guides/discovery.md']), false);
});

const posterGridPages = [
  {
    family: 'Poster grid',
    storyFile: 'apps/react-storybook/.storybook/generated/block-poster-grid.stories.mjs',
    stories: ['css-grid', 'virtualized'].map((name) => ({
      id: `muxui-block-poster-grid--${name}`,
      exportName: name === 'css-grid' ? 'CssGrid' : 'Virtualized',
      name,
      source: `catalog/patterns/poster-grid/examples/react/${name}.tsx`,
    })),
  },
  {
    family: 'Hero',
    storyFile: 'apps/react-storybook/.storybook/generated/block-hero.stories.mjs',
    stories: [{ id: 'muxui-block-hero--centered', exportName: 'Centered', name: 'Centered', source: 'catalog/patterns/hero/examples/react/centered.tsx' }],
  },
];
const posterGridBrowserTest = 'test/browser/pattern-poster-grid.test.mjs';
const typesTest = 'test/catalog-examples-types.test.mjs';
const gridListRecord = { family: 'GridList', export: 'GridList', slug: 'grid-list', source: collectionsPath, parts: ['root', 'item'] };
// The patterns the catalog declares: the poster grid uses GridList, the hero uses no fixture component.
const declaredPatterns = [
  { slug: 'poster-grid', components: ['grid-list', 'virtualizer', 'image', 'text', 'link', 'button'] },
  { slug: 'hero', components: ['heading'] },
];
const participantFixture = {
  records: [...records, gridListRecord],
  pageIndex: [...pageIndex, ...posterGridPages],
  patterns: declaredPatterns,
  moduleSources: { ...cssModuleSources, [collectionsPath]: 'export const Tree = () => null; export const GridList = () => null;' },
  componentTestSources: {
    ...componentTestSources,
    ...Object.fromEntries(['test/browser/grid-list-layout.test.mjs', posterGridBrowserTest].map((file) => [file, readFileSync(resolve(repositoryRoot, 'packages/react', file), 'utf8')])),
  },
};

test('a participant component change plans its patterns Block pages, packed type test, and browser test', async () => {
  const posterIds = posterGridPages[0].stories.map(({ id }) => id);
  const cssPath = 'packages/react/src/styles/components.css';
  const gridListCss = { [cssPath]: { before: '.muxui-grid-list { color: black; }', after: '.muxui-grid-list { color: white; }' } };
  const gridListSource = {
    before: 'export const Tree = () => null; export const GridList = () => null;',
    after: 'export const Tree = () => null; export const GridList = () => 1;',
  };
  const changes = {
    'component CSS': await plan([cssPath], { ...participantFixture, textSnapshots: gridListCss }),
    'component source': await plan([collectionsPath], {
      ...participantFixture,
      textSnapshots: { [collectionsPath]: gridListSource },
      moduleSources: { ...participantFixture.moduleSources, [collectionsPath]: gridListSource },
    }),
  };
  for (const [change, result] of Object.entries(changes)) {
    assert.deepEqual(result.reactFamilies, ['GridList'], change);
    assert.deepEqual(result.storyIds, posterIds, `${change} plans the Block pages and no other pattern's`);
    assert.deepEqual(result.reactTestFiles.filter((file) => file === posterGridBrowserTest || file === typesTest).sort(), [typesTest, posterGridBrowserTest].sort(), change);
    assert.ok(result.reasons.some((reason) => reason.startsWith('poster-grid uses changed grid-list')), change);
    assert.ok(result.storyRuns.some(({ proof, families, storyIds }) => proof === 'story' && families.includes('Poster grid') && storyIds.length === 2), change);
    const commands = executionCommands(result, { packages, environment: {} }).map(({ args }) => args.join(' '));
    assert.ok(commands.includes(`--filter @muxui/react exec node --test --test-concurrency=1 ${posterGridBrowserTest}`), change);
  }

  // A component no pattern uses plans no pattern proof.
  const tree = await plan([cssPath], {
    ...participantFixture,
    textSnapshots: { [cssPath]: { before: '.muxui-tree { color: black; }', after: '.muxui-tree { color: white; }' } },
    moduleSources: participantFixture.moduleSources,
  });
  assert.deepEqual(tree.reactFamilies, ['Tree']);
  assert.deepEqual(tree.storyIds, []);
  assert.ok(!tree.reactTestFiles.includes(posterGridBrowserTest));

  // The routing follows the catalog: with no declared participant, a GridList change plans no pattern.
  const undeclared = await plan([cssPath], { ...participantFixture, patterns: [], textSnapshots: gridListCss });
  assert.deepEqual(undeclared.storyIds, []);
  assert.ok(!undeclared.reactTestFiles.includes(posterGridBrowserTest));

  // A package-wide React change reaches every pattern's pages; the full React check runs the tests.
  const full = await plan(['packages/react/src/generate.mjs'], { ...participantFixture, moduleSources: {} });
  assert.equal(full.reactPackageFull, true);
  assert.deepEqual(full.storyIds, [...posterIds].concat('muxui-block-hero--centered').sort());
});

test('a catalog source manifest change that adds or removes a pattern plans Storybook generation and the pattern proofs', async () => {
  const path = 'packages/catalog/catalog-sources.json';
  const entry = (file) => ({ family: file.endsWith('artifact.json') ? 'pattern' : 'example', path: file });
  const poster = ['artifact.json', 'examples/react/css-grid.example.json', 'examples/react/virtualized.example.json'].map((file) => entry(`catalog/patterns/poster-grid/${file}`));
  const base = { records: [{ family: 'guide', path: 'catalog/guides/discovery.md' }] };
  const manifestText = (value) => JSON.stringify(value);
  const withPoster = manifestText({ records: [...base.records, ...poster] });
  const without = manifestText(base);
  const posterIds = posterGridPages[0].stories.map(({ id }) => id);

  const added = await plan([path], { ...participantFixture, textSnapshots: { [path]: { before: without, after: withPoster } } });
  assert.equal(added.storyTooling, true);
  assert.deepEqual(added.storyIds, posterIds);
  assert.ok(added.reactTestFiles.includes(posterGridBrowserTest) && added.reactTestFiles.includes(typesTest));
  assert.ok(added.reasons.some((reason) => reason.includes('adds or removes entries of poster-grid')));
  assert.ok(executionCommands(added, { packages, environment: {} }).some(({ args }) => args.join(' ') === '--filter @muxui/react-storybook run generate:check'));

  // A removed pattern leaves no page to audit, but generation still has to catch up.
  const removed = await plan([path], { ...participantFixture, pageIndex, textSnapshots: { [path]: { before: withPoster, after: without } } });
  assert.equal(removed.storyTooling, true);
  assert.deepEqual(removed.storyIds, []);

  // An entry outside catalog/patterns plans no Storybook generation.
  const unrelated = await plan([path], { ...participantFixture, textSnapshots: { [path]: { before: without, after: manifestText({ records: [...base.records, entry('catalog/components/button/artifact.json')] }) } } });
  assert.equal(unrelated.storyTooling, false);
  assert.deepEqual(unrelated.storyIds, []);

  // Preview mode must also prepare the page index.
  assert.equal(needsStorybookGeneration([path], config, { patternManifestChanged: true }), true);
  assert.equal(needsStorybookGeneration([path], config, { patternManifestChanged: false }), false);
});

test('the Block naming helper and its test route to the unit tests that read them', async () => {
  const helper = await plan(['apps/react-storybook/src/block-pages.mjs']);
  assert.equal(helper.storyTooling, true);
  assert.deepEqual(helper.storyUnitTests.map(({ file }) => file), ['test/block-pages.test.mjs', 'test/storybook-family-selection.test.mjs']);
  const unit = await plan(['apps/react-storybook/test/block-pages.test.mjs']);
  assert.deepEqual(unit.storyUnitTests, [{ file: 'test/block-pages.test.mjs' }]);
});

test('catalog fixtures plan both the catalog and the tooling tests that read them', async () => {
  // packages/tooling/test/pattern-cli.test.mjs compiles the same poster-grid fixture as the catalog tests.
  for (const path of [
    'packages/catalog/test/fixtures/fixture-catalog.mjs',
    'packages/catalog/test/fixtures/patterns/poster-grid/artifact.json',
    'packages/catalog/test/fixtures/patterns/poster-grid/examples/react/css-grid.tsx',
  ]) {
    const result = await plan([path], { packages: workspacePackages });
    assert.equal(result.catalog, true, path);
    assert.ok(result.packageChecks.includes('@muxui/tooling'), path);
    assert.equal(result.reasons[0], `${path} is a fixture read by @muxui/catalog and @muxui/tooling tests`, path);
    const commands = executionCommands(result, { packages: workspacePackages }).map(({ args }) => args.join(' '));
    assert.ok(commands.includes('--filter @muxui/catalog run check'), path);
    assert.ok(commands.includes('--filter @muxui/tooling run check'), path);
  }
  // A catalog test outside the fixtures stays a plain package path.
  assert.equal(
    (await plan(['packages/catalog/test/pattern-catalog.test.mjs'])).reasons[0],
    'packages/catalog/test/pattern-catalog.test.mjs is owned by @muxui/catalog',
  );
});

const reactRuntimeDependentsPlanned = (result) => result.docs && result.scale
  && ['@muxui/figma', '@muxui/react-playground'].every((name) => result.packageChecks.includes(name));

test('canonical React inputs that change React output plan React runtime dependents', async () => {
  const generatorInput = await plan(['catalog/react-r1-6/supplemental-components.json'], { packages: workspacePackages });
  assert.equal(generatorInput.reactPackageFull, true);
  assert.ok(reactRuntimeDependentsPlanned(generatorInput));

  const autocompleteRecord = { family: 'Autocomplete', export: 'Autocomplete', slug: 'autocomplete', source: fieldsPath, parts: ['root'] };
  const artifact = await plan(['catalog/components/autocomplete/artifact.json'], {
    packages: workspacePackages,
    records: [...records, autocompleteRecord],
    componentTestSources: {
      ...componentTestSources,
      'test/browser/autocomplete-dismissal.test.mjs': readFileSync(resolve(repositoryRoot, 'packages/react/test/browser/autocomplete-dismissal.test.mjs'), 'utf8'),
    },
    pageIndex: [...pageIndex, {
      family: 'Autocomplete',
      storyFile: 'apps/react-storybook/.storybook/generated/autocomplete.stories.mjs',
      stories: [{ id: 'autocomplete--browser-proof', exportName: 'BrowserProof', name: 'BrowserProof' }],
    }],
  });
  assert.deepEqual(artifact.reactFamilies, ['Autocomplete']);
  assert.equal(artifact.reactPackageFull, false);
  assert.ok(reactRuntimeDependentsPlanned(artifact));
});

test('generator inputs outside src plan their package dependents', async () => {
  const catalogSources = await plan(['packages/catalog/catalog-sources.json'], { packages: workspacePackages });
  assert.equal(catalogSources.docs && catalogSources.policy, true);
  assert.ok(catalogSources.packageChecks.includes('@muxui/tooling'));

  const commandRegistry = await plan(['packages/tooling/command-registry.json'], { packages: workspacePackages });
  // Docs depends on tooling only as a devDependency; policy depends on it at runtime.
  assert.ok(commandRegistry.packageChecks.includes('@muxui/docs'));
  assert.equal(commandRegistry.policy, true);
});

test('a manifest bin change is a runtime boundary change', async () => {
  const before = JSON.stringify({ name: '@muxui/tooling', bin: { muxui: './bin/muxui.mjs' } });
  const after = JSON.stringify({ name: '@muxui/tooling', bin: { muxui: './bin/muxui-cli.mjs' } });
  assert.equal(reactPackageWideChanges(before, after).pagesAffected, true);
  const path = 'packages/tooling/package.json';
  const changed = await plan([path], { packages: workspacePackages, textSnapshots: { [path]: { before, after } } });
  assert.equal(changed.policy, true);
  const scriptsOnly = JSON.stringify({ name: '@muxui/tooling', bin: { muxui: './bin/muxui.mjs' }, scripts: { check: 'new' } });
  const unchanged = await plan([path], { packages: workspacePackages, textSnapshots: { [path]: { before, after: scriptsOnly } } });
  assert.equal(unchanged.policy, false);
});

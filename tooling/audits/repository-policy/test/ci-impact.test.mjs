import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'acorn';
import test from 'node:test';
import {
  browserShardIndex,
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
  isEvidenceInput,
  isPolicyOnlyLockfileChange,
  isWorkspaceWideChange,
  needsStorybookGeneration,
  normalizeCommand,
  parseCliArguments,
  planStorybookCommands,
  preparedCommandRunner,
  prepareStorybookMetadata,
  reactPackageWideChanges,
  rootPackageWideChanges,
  runCiImpact,
  shardStoryRun,
  storybookSelection,
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
import { componentTestSelection, isBrowserTestFile, testNamePattern } from '../src/component-test-selection.mjs';
import { loadPolicy } from '../src/policy.mjs';
import { dependencyClosure, familyRecordsFromContract } from '../src/scoped-verification.mjs';
import { discoverWorkspacePackages } from '../src/workspace-packages.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const config = (await loadPolicy(repositoryRoot)).pullRequestImpact;
const supplementalPath = 'packages/react/src/supplemental/index.mjs';
const multiSelectPath = 'packages/react/src/supplemental/multi-select.mjs';
const tagSelectPath = 'packages/react/src/supplemental/tag-select.mjs';
const collectionsPath = 'packages/react/src/collections.mjs';
const fieldsPath = 'packages/react/src/fields.ts';
const sizingExamplePath = 'catalog/components/number-field/examples/react/sizing.tsx';
const sizingStoryId = 'muxui-react-r1-2-number-field--sizing';

const records = [
  { family: 'MultiSelect', export: 'MultiSelect', slug: 'multi-select', source: multiSelectPath, parts: ['root', 'input', 'tag'] },
  { family: 'NumberField', export: 'NumberField', slug: 'number-field', source: fieldsPath, parts: ['root', 'input', 'stepper'] },
  { family: 'TagSelect', export: 'TagSelect', slug: 'tag-select', source: tagSelectPath, parts: ['root', 'input', 'tag'] },
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
  { name: '@muxui/catalog', path: 'packages/catalog', manifest: { dependencies: { '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, devDependencies: { '@muxui/react': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/docs', path: 'apps/docs', manifest: { dependencies: { '@muxui/catalog': 'workspace:*', '@muxui/react': 'workspace:*' }, devDependencies: { '@muxui/tooling': 'workspace:*' }, scripts: { check: 'node ../../tooling/audits/repository-policy/src/prepare-prerequisites.mjs @muxui/docs^... && check' } } },
  { name: '@muxui/figma', path: 'tooling/generators/figma', manifest: { dependencies: { '@muxui/react': 'workspace:*', '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { check: 'check' } } },
  { name: '@muxui/react', path: 'packages/react', manifest: { devDependencies: { '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { generate: 'generate', check: 'check', 'check:browser': 'node --test --test-concurrency=1 test/browser/*.test.mjs', 'check:component': 'node ../../tooling/audits/repository-policy/src/run-component-check.mjs' } } },
  { name: '@muxui/react-playground', path: 'apps/react-playground', manifest: { dependencies: { '@muxui/react': 'workspace:*' }, scripts: { check: 'check' } } },
  { name: '@muxui/react-storybook', path: 'apps/react-storybook', manifest: { dependencies: { '@muxui/react': 'workspace:*', '@muxui/tokens': 'workspace:*' }, devDependencies: { '@muxui/catalog': 'workspace:*' }, scripts: { generate: 'generate', 'check:scoped': 'node src/check-scoped.mjs' } } },
  { name: '@muxui/repository-policy', path: 'tooling/audits/repository-policy', manifest: { dependencies: { '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*', '@muxui/tooling': 'workspace:*' }, scripts: { generate: 'generate', check: 'check', 'check:evidence': 'check:evidence' } } },
  { name: '@muxui/scale', path: 'apps/scale', manifest: { dependencies: { '@muxui/react': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { check: 'node ../../tooling/audits/repository-policy/src/prepare-prerequisites.mjs @muxui/react... && check' } } },
  { name: '@muxui/schema', path: 'packages/schema', manifest: { dependencies: {}, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/tokens', path: 'packages/tokens', manifest: { dependencies: { '@muxui/schema': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/tooling', path: 'packages/tooling', manifest: { dependencies: { '@muxui/catalog': 'workspace:*', '@muxui/schema': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
];

const componentTestPaths = [
  'test/browser/tag-select-focus.test.mjs',
  'test/browser/tree-toggle-browser.test.mjs',
  'test/public-surface-baseline.test.mjs',
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
  [multiSelectPath]: 'export const MultiSelect = () => null;',
  [tagSelectPath]: 'export const TagSelect = () => null;',
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

// Snapshots of files that exist before and after the change. The planner counts
// an evidence presence input (README.md, the CI workflow) only when it is added or removed.
const edited = (...paths) => ({ textSnapshots: Object.fromEntries(paths.map((path) => [path, { before: 'before\n', after: 'after\n' }])) });

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
  const source = await readFile(resolve(repositoryRoot, tagSelectPath), 'utf8');
  const before = source.replace('    slot: null,\n', '');
  assert.notEqual(before, source, 'fixture must represent the pre-fix TagSelect helper');

  const result = await plan([tagSelectPath], {
    records: records.filter(({ family }) => ['TagSelect', 'MultiSelect'].includes(family)),
    textSnapshots: { [tagSelectPath]: { before, after: source } },
    moduleSources: { ...cssModuleSources, [tagSelectPath]: { before, after: source } },
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
    'test/public-surface-baseline.test.mjs',
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
  const source = await readFile(resolve(repositoryRoot, tagSelectPath), 'utf8');
  const after = `${source}\nexport const ScratchWidget = () => null;\n`;
  const scratch = { family: 'ScratchWidget', export: 'ScratchWidget', slug: 'scratch-widget', source: tagSelectPath, parts: ['root'] };
  const scratchPage = {
    family: 'ScratchWidget',
    storyFile: 'apps/react-storybook/.storybook/generated/scratch-widget.stories.mjs',
    stories: [{ id: 'muxui-react-r1-6-scratch-widget--default', exportName: 'Default', name: 'Default' }],
  };
  const result = await plan([tagSelectPath], {
    records: [...records.filter(({ family }) => ['TagSelect', 'MultiSelect'].includes(family)), scratch],
    pageIndex: [...pageIndex, scratchPage],
    textSnapshots: { [tagSelectPath]: { before: source, after } },
    moduleSources: { ...cssModuleSources, [tagSelectPath]: { before: source, after } },
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

test('a deleted React test file is not run, and its owner package is checked instead', async () => {
  const retired = 'packages/react/test/retired-parity.test.mjs';
  const deleted = await plan([retired], { textSnapshots: { [retired]: { before: 'before\n', after: null } } });
  assert.deepEqual(deleted.reactTestFiles, []);
  assert.deepEqual(deleted.packageChecks, ['@muxui/react']);
  // A test with no snapshot, or one edited in place, still runs.
  assert.deepEqual((await plan([retired])).reactTestFiles, ['test/retired-parity.test.mjs']);
  assert.deepEqual((await plan([retired], edited(retired))).reactTestFiles, ['test/retired-parity.test.mjs']);
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
    family: 'Modal', export: 'Dialog', slug: 'dialog', source: 'packages/react/src/overlays.ts', parts: ['root', 'trigger', 'panel'],
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

  const overlaysPath = 'packages/react/src/overlays.ts';
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
    MUXUI_STORYBOOK_A11Y_WORKERS: '2',
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
  // theme proof rather than the full package check, plus the surface tests that read the token source.
  assert.equal(result.docs && result.scale && result.policy, true);
  assert.equal(result.reactPackageFull, false);
  assert.deepEqual(result.packageChecks, ['@muxui/figma', '@muxui/tooling']);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.reactTestFiles, ['test/public-surface-baseline.test.mjs', 'test/public-surface.test.mjs']);
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
  // runtime. React's catalog devDependency is scoped.
  assert.deepEqual(result.packageChecks, ['@muxui/tooling']);
  assert.equal(result.policy, true);
  assert.equal(result.tokens || result.reactTheme || result.reactPackageFull || result.storyTooling, false);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.storyRuns, []);
  assert.equal(result.reasons[0], `${path} is a canonical guide; validate the catalog, its dense goldens, and the docs that render it`);
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['checks-policy', 'checks-tooling', 'checks', 'browser-chromium']);
  // A catalog change reaches policy through tooling, so the evidence tests run too.
  assert.deepEqual(groups[0].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/repository-policy', 'run', 'check'],
    ['--filter', '@muxui/repository-policy', 'run', 'check:evidence'],
  ]);
  assert.deepEqual(groups[1].commands.slice(1).map(({ args }) => args), [['--filter', '@muxui/tooling', 'run', 'check']]);
  assert.deepEqual(groups[2].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/catalog', 'run', 'check'],
    ['--filter', '@muxui/docs', 'run', 'check'],
  ]);
});

test('per-family usage guides take the guide route without selecting their component family', async () => {
  const result = await plan(['catalog/guides/number-field-usage.md', 'catalog/guides/number-field-usage.json']);

  assert.equal(result.catalog && result.docs, true);
  assert.deepEqual(result.packageChecks, ['@muxui/tooling']);
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

test('the shared component reference helper selects the docs and every Storybook family', async () => {
  const result = await plan(['apps/component-reference.mjs']);
  assert.equal(result.docs, true);
  assert.equal(result.scale || result.catalog || result.tokens || result.reactTheme, false);
  assert.deepEqual(result.storyRuns.map(({ proof }) => proof), ['component']);
  assert.deepEqual(result.storyRuns[0].families, records.map(({ family }) => family));
});

test('the inputs a Storybook Docs page embeds plan generation and the Docs page test, not the browser audit', async () => {
  const docsTest = [{ file: 'test/component-docs.test.mjs' }];
  const embedded = [
    'catalog/components/tree/artifact.json',
    'catalog/components/tree/examples/react/basic.tsx',
    'catalog/components/tree/examples/react/basic.example.json',
    sizingExamplePath,
    'catalog/guides/number-field-usage.md',
    'catalog/guides/number-field-usage.json',
    'catalog/guides/accessibility.md',
    'catalog/guides/accessibility.json',
    'catalog/patterns/poster-grid/artifact.json',
    'apps/component-reference.mjs',
    'apps/guide-links.mjs',
  ];
  for (const path of embedded) {
    const result = await plan([path]);
    assert.equal(result.storyTooling, true, path);
    assert.deepEqual(result.storyUnitTests, docsTest, path);
    const selection = storybookSelection(result, { packages, environment: {}, pageIndex });
    assert.equal(selection.full, false, path);
    const commands = selection.commands.map(({ args }) => args.join(' '));
    assert.ok(commands.includes('--filter @muxui/react-storybook run generate:check'), path);
    assert.ok(commands.includes('--filter @muxui/react-storybook exec node --test test/component-docs.test.mjs'), path);
  }

  // A guide with no family, another shared guide and a pattern's example record are not embedded.
  for (const path of ['catalog/guides/control-sizing-usage.md', 'catalog/guides/lifecycle.md', 'catalog/patterns/poster-grid/examples/react/css-grid.example.json']) {
    const result = await plan([path]);
    assert.equal(result.storyTooling, false, path);
    assert.deepEqual(result.storyUnitTests, [], path);
  }

  // Adding or removing a pattern entry changes which components list a Block.
  const manifest = (slugs) => JSON.stringify({ records: slugs.map((slug) => ({ family: 'pattern', path: `catalog/patterns/${slug}/artifact.json` })) });
  const added = await plan(['packages/catalog/catalog-sources.json'], {
    textSnapshots: { 'packages/catalog/catalog-sources.json': { before: manifest(['poster-grid']), after: manifest(['poster-grid', 'task-filters']) } },
  });
  assert.deepEqual(added.storyUnitTests.filter(({ file }) => file === 'test/component-docs.test.mjs'), docsTest);
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

  const policy = await plan(['.github/CODEOWNERS']);
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
    'packages/AGENTS.md', 'tests/AGENTS.md', 'tests/evidence/README.md',
  ];
  for (const path of guidancePaths) {
    const result = await plan([path], edited(path));
    assert.equal(result.policy, true, path);
    // Only the retained evidence's own guidance is an input of the evidence tests.
    assert.equal(result.evidence, path === 'tests/evidence/README.md', path);
    assert.equal(result.full || result.catalog || result.docs || result.storyTooling, false, path);
    assert.deepEqual(result.storyRuns, [], path);
  }
});

test('policy-run fixture tests and retained evidence route to the repository-policy check', async () => {
  const policyCheck = ['--filter', '@muxui/repository-policy', 'run', 'check'];
  const evidenceCheck = ['--filter', '@muxui/repository-policy', 'run', 'check:evidence'];
  const paths = new Map([
    ['tests/fixtures/g0.4/corpus.json', [policyCheck]],
    ['tests/fixtures/g1.0/consumers/button-web.consumer.mjs', [policyCheck]],
    ['tests/evidence/README.md', [policyCheck, evidenceCheck]],
    ['tests/evidence/g0.4/index.json', [policyCheck, evidenceCheck]],
  ]);
  for (const [path, expected] of paths) {
    const result = await plan([path]);
    assert.equal(result.policy, true, path);
    assert.equal(result.full || result.docs || result.scale || result.catalog || result.storyTooling, false, path);
    assert.deepEqual(executionCommands(result, { packages }).slice(1).map(({ args }) => args), expected, path);
  }
});

// The retained-evidence tests (tooling/audits/repository-policy/test/evidence-*.test.mjs, `check:evidence`)
// take most of the policy check's time, so a pull request runs them only when the change reaches
// something they load or read. This is the set `pullRequestImpact.evidenceInputs` names; the closure test below fails
// when the tests' imports outgrow it. Besides these paths, the tests also load the packages policy depends on
// (catalog, schema, tokens, tooling), which reach policy through the workspace links.
const evidenceInputs = [
  '.github/workflows/',
  '.gitignore',
  'apps/docs/src/lib/block-presets.ts',
  'decisions/0022-rc1-assistive-technology-non-claim.md',
  'packages/react/src/r1-deferred-evidence.mjs',
  'strategy/platform-safety-contract.json',
  'tests/evidence/',
  'tooling/audits/repository-policy/src/canonical-json.mjs',
  'tooling/audits/repository-policy/src/evidence-verify.mjs',
  'tooling/audits/repository-policy/src/npm-publication.mjs',
  'tooling/audits/repository-policy/src/pattern-variants.mjs',
  'tooling/audits/repository-policy/src/policy.mjs',
  'tooling/audits/repository-policy/src/release-proof.mjs',
  'tooling/audits/repository-policy/src/workspace-packages.mjs',
  'tooling/audits/repository-policy/test/evidence-',
];
// Path classes a prefix cannot name: every package manifest (the auditor reads each one's version, publish configuration,
// and dependencies, and the fixture edits several), an attributes file at any depth (`git archive` of HEAD, and of each
// revision the auditor extracts, honors export-ignore and export-subst from every directory's .gitattributes), the hosting
// and deployment names the auditor flags (the auditor's own pattern, workflows included), and Astro's site settings.
// Ignore files are not a class: the fixture stages with `git add -A -f`, so only the root .gitignore stays, as a conservative input.
const hostingPaths = String.raw`(?:^|\/)(?:netlify\.toml|vercel\.json|wrangler\.(?:toml|jsonc?)|firebase\.json|fly\.toml|render\.yaml|Procfile|app\.yaml|serverless\.ya?ml|staticwebapp\.config\.json|CNAME|_headers|_redirects|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.vercel\/.*|\.netlify\/.*|\.github\/workflows\/.*)$`;
const evidenceInputPatterns = [String.raw`(?:^|/)package\.json$`, String.raw`(?:^|/)\.gitattributes$`, hostingPaths, String.raw`^apps/[^/]+/astro\.config\.[^/]+$`];
// Files the tests only look up by name, so adding or removing one matters: the growth fixture edits the README and the
// lockfile in an archive of HEAD, the stylesheet check shows the React stylesheet at both revisions, and every shipped
// `pattern-<slug>` browser test must belong to an enabled pattern.
const evidencePresenceInputs = ['README.md', 'packages/react/src/supplemental/styles.css', 'packages/react/test/browser/pattern-', 'pnpm-lock.yaml'];
const policyCommand = ['--filter', '@muxui/repository-policy', 'run', 'check'];
const evidenceCommand = ['--filter', '@muxui/repository-policy', 'run', 'check:evidence'];

const policyGroupArgs = async (paths, options = {}) => {
  const groups = executionGroups(await plan(paths, options), { packages, environment: {}, pageIndex });
  return groups.find(({ id }) => id === 'checks-policy')?.commands.slice(1).map(({ args }) => args);
};

test('the evidence trigger set is the one the route test names, and planning refuses a policy without it', async () => {
  assert.deepEqual(config.evidenceInputs, evidenceInputs);
  assert.deepEqual(config.evidenceInputPatterns, evidenceInputPatterns);
  assert.deepEqual(config.evidencePresenceInputs, evidencePresenceInputs);
  for (const key of ['evidenceInputs', 'evidenceInputPatterns', 'evidencePresenceInputs']) {
    await assert.rejects(plan(['AGENTS.md'], { config: { ...config, [key]: undefined } }), new RegExp(`MUXUI_CI_IMPACT_POLICY_INVALID: pullRequestImpact\\.${key}`, 'u'));
    await assert.rejects(plan(['AGENTS.md'], { config: { ...config, [key]: [''] } }), new RegExp(`MUXUI_CI_IMPACT_POLICY_INVALID: pullRequestImpact\\.${key}`, 'u'));
  }
  await assert.rejects(plan(['AGENTS.md'], { config: { ...config, evidenceInputPatterns: ['('] } }), /evidenceInputPatterns entry "\(" is not a regular expression/u);
});

// Everything the evidence tests import, statically or by a literal `import()`, and everything those modules import.
// A change to any of those files must plan the evidence tests, however it routes: through the named inputs here, or
// through a package policy depends on.
test('every module the evidence tests load plans check:evidence when it changes', async () => {
  const testFiles = globSync('tooling/audits/repository-policy/test/evidence-*.test.mjs', { cwd: repositoryRoot }).sort();
  assert.ok(testFiles.length >= 4 && testFiles.includes('tooling/audits/repository-policy/test/evidence-integrity.test.mjs'), testFiles.join(', '));
  const seen = new Set();
  const workspaceImports = new Set();
  const visit = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!/\.m?js$/u.test(file)) return;
    const source = await readFile(resolve(repositoryRoot, file), 'utf8').catch(() => null);
    // Generated projections have no source file in a clean checkout; their sources are in the closure.
    if (source === null) return;
    const specifiers = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (node.source?.type === 'Literal' && ['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration', 'ImportExpression'].includes(node.type)) {
        specifiers.push(node.source.value);
      }
      Object.entries(node).filter(([key]) => !['start', 'end', 'loc'].includes(key)).forEach(([, value]) => walk(value));
    };
    walk(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
    for (const specifier of specifiers.filter((value) => value.startsWith('.'))) {
      await visit(join(dirname(file), specifier).split('\\').join('/'));
    }
    specifiers.filter((value) => value.startsWith('@muxui/')).forEach((value) => workspaceImports.add(value.split('/').slice(0, 2).join('/')));
  };
  for (const testFile of testFiles) await visit(testFile);

  const workspacePackages = await discoverWorkspacePackages(repositoryRoot);
  // Workspace packages the loaded modules import by name must be ones policy depends on, so changing them plans policy.
  const policyDependencies = dependencyClosure(workspacePackages, ['@muxui/repository-policy']).map(({ name }) => name);
  for (const name of workspaceImports) assert.ok(policyDependencies.includes(name), `${name} is imported by the evidence tests but policy does not depend on it; name its paths in evidenceInputs`);
  const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' }).split('\0'));
  const loaded = [...seen].filter((file) => tracked.has(file)).sort();
  // The tests reach the compiler, the tooling API, the capture tools, and the docs presets, not only their own helpers.
  for (const file of ['tests/evidence/capture-r1-exit.mjs', 'tests/evidence/bl1/growth-scope.mjs', 'packages/catalog/src/compiler.mjs',
    'packages/tooling/src/index.mjs', 'packages/react/src/r1-deferred-evidence.mjs', 'tooling/audits/repository-policy/src/release-proof.mjs',
    'tooling/audits/repository-policy/test/evidence-growth-repository.mjs']) {
    assert.ok(loaded.includes(file), `${file} is expected in the tests' import closure`);
  }
  for (const file of loaded) {
    const result = await plan([file], { packages: workspacePackages });
    assert.equal(result.evidence, true, `${file} is loaded by the evidence tests but changing it skips check:evidence`);
  }
  // The block presets are read as a module and as source text by path.
  assert.ok(config.evidenceInputs.includes('apps/docs/src/lib/block-presets.ts'));
});

// The closure test above follows imports only. The growth auditor and the fixture that archives HEAD also read data: what
// the catalog compiler is told to read, every package manifest, hosting and workflow files, the ignore and attribute files,
// and the files the fixture edits. Each of those must plan check:evidence when it changes, or (for a file only looked up
// by name) when it is added or removed. The cases come from the sources, so a new read shows up here.
test('the data the growth auditor and its fixture read, not only the modules they import, plans check:evidence', async () => {
  const workspacePackages = await discoverWorkspacePackages(repositoryRoot);
  const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');
  // The file as it is (so manifests and the source manifest parse), edited by a trailing newline or removed.
  const planned = async (path, removed) => {
    const text = existsSync(resolve(repositoryRoot, path)) ? read(path) : '{}\n';
    return plan([path], {
      packages: workspacePackages,
      reactPackageBefore: read('packages/react/package.json'),
      reactPackageAfter: read('packages/react/package.json'),
      textSnapshots: { [path]: { before: text, after: removed ? null : `${text}\n` } },
    });
  };
  // Edited, the path plans the evidence tests (or the full workspace, which always runs them).
  const editReaches = async (path) => {
    const result = await planned(path, false);
    return result.evidence || result.full;
  };
  // Looked up by name only: editing it may skip them, but removing it must not.
  const reaches = async (path) => await editReaches(path) || (await planned(path, true)).evidence;

  // What the compiler reads from the archived tree: every path the source manifest names, and each directory its records live in.
  const manifest = JSON.parse(read('packages/catalog/catalog-sources.json'));
  const named = Object.entries(manifest).filter(([key, value]) => key.endsWith('Path') && typeof value === 'string').map(([, value]) => value);
  assert.ok(named.includes('strategy/platform-safety-contract.json') && named.includes('packages/tooling/command-registry.json'), named.join(', '));
  const recordDirectories = new Map();
  for (const { path } of manifest.records.filter(({ path: candidate }) => !candidate.includes('/examples/'))) {
    const directory = path.split('/').slice(0, 2).join('/');
    if (!recordDirectories.has(directory)) recordDirectories.set(directory, path);
  }
  assert.ok(recordDirectories.size >= 5, [...recordDirectories.keys()].join(', '));
  for (const path of [...named, ...recordDirectories.values()]) assert.equal(await editReaches(path), true, `${path} is read by the catalog compile`);
  assert.equal(await editReaches('packages/catalog/package.json'), true, 'the compiler reads the catalog manifest');

  // Every package manifest: the auditor reads each one's version, privacy, publish configuration and dependencies.
  const manifests = execFileSync('git', ['ls-files', '-z', '*package.json'], { cwd: repositoryRoot, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(manifests.length >= 11 && manifests.includes('package.json') && manifests.includes('packages/react/package.json'), manifests.join(', '));
  for (const path of manifests) assert.equal(await editReaches(path), true, `${path} is a package manifest`);

  // The auditor's hosting names (workflows among them) are one pattern, copied here from its source; its other reads are named files.
  const auditor = read('tests/evidence/bl1/boundary-audit.mjs');
  const auditorHosting = auditor.match(/^const hostingPaths = \/(.*)\/u;$/mu)?.[1];
  assert.ok(config.evidenceInputPatterns.includes(auditorHosting), 'the planner names the auditor\'s hostingPaths pattern as written');
  for (const path of [
    'netlify.toml', 'vercel.json', 'wrangler.toml', 'wrangler.jsonc', 'firebase.json', 'fly.toml', 'render.yaml', 'Procfile', 'app.yaml', 'serverless.yml',
    'staticwebapp.config.json', 'CNAME', '_headers', '_redirects', 'Dockerfile', 'Dockerfile.prod', 'docker-compose.yml', '.vercel/project.json',
    '.netlify/state.json', '.github/workflows/ci.yml', '.github/workflows/npm-publish.yml', 'apps/docs/public/_redirects', 'apps/docs/netlify.toml',
  ]) {
    assert.ok(new RegExp(auditorHosting, 'u').test(path), `${path} is a hosting or workflow name to the auditor`);
    assert.equal(isEvidenceInput(path, config), true, `${path} is a hosting or workflow name`);
  }
  for (const path of ['apps/docs/astro.config.mjs', 'apps/scale/astro.config.ts']) assert.equal(isEvidenceInput(path, config), true, path);
  assert.match(auditor, /exists\(headRevision, 'apps\/docs\/astro\.config\.mjs'\)/u, 'the auditor reads this Astro configuration');
  for (const path of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.node-version']) {
    assert.match(auditor, new RegExp(`'${path.replaceAll('.', '\\.')}'`, 'u'), `${path} is one the auditor compares`);
    assert.equal(await reaches(path), true, path);
  }
  assert.equal(await reaches('packages/react/src/supplemental/styles.css'), true, 'the stylesheet check shows it at both revisions');

  // What git itself reads while the fixture builds its repository: `git archive` honors the attributes file of every directory,
  // so each depth is an input.
  for (const path of ['.gitattributes', '.github/.gitattributes', 'apps/docs/.gitattributes', 'packages/react/src/deep/er/.gitattributes']) {
    assert.equal(await reaches(path), true, path);
  }
  // Ignore rules are not read: every `git add` in the growth fixture is forced, so a nested .gitignore cannot change what a commit holds.
  // The root .gitignore stays a trigger only as a conservative input.
  assert.equal(await editReaches('.gitignore'), true, '.gitignore');
  // The growth fixture and every test that builds on it (the tests stage commits of their own).
  const growthSources = globSync('tooling/audits/repository-policy/test/evidence-growth-*.mjs', { cwd: repositoryRoot }).sort().map((path) => read(path)).join('\n');
  const stagings = [...growthSources.matchAll(/gitIn\(cwd, 'add'[^)]*\)/gu)].map(([call]) => call);
  assert.ok(stagings.length >= 4, `the growth fixture stages its commits ${stagings.length} times`);
  for (const call of stagings) assert.match(call, /'-f'/u, `${call} must force-add, or ignore files become evidence inputs`);

  // Every file the fixture edits by a literal path, whichever way it is reached.
  const edits = [...new Set([...growthSources.matchAll(/\bedit\(\s*'([^'$`]+)'/gu)].map(([, path]) => path))];
  for (const path of ['README.md', '.github/workflows/ci.yml', 'pnpm-lock.yaml', 'catalog/components/button/artifact.json', 'packages/react/package.json',
    'packages/schema/src/index.mjs', 'packages/catalog/src/pattern-content.mjs', 'packages/catalog/catalog-sources.json']) {
    assert.ok(edits.includes(path), `${path} is expected among the files the fixture edits`);
  }
  for (const path of edits) assert.equal(await reaches(path), true, `${path} is edited in the growth fixture`);
});

test('growth-fixture state the old trigger set skipped now plans check:evidence', async () => {
  const workspacePackages = await discoverWorkspacePackages(repositoryRoot);
  const version = (value) => JSON.stringify({ name: '@muxui/react', version: value, exports: { '.': './x.mjs' } });
  const cases = [
    // The root ignore file stays a conservative input (the fixture force-adds, so it no longer decides what a commit holds).
    ['.gitignore', { textSnapshots: { '.gitignore': { before: 'dist\n', after: 'dist\nnetlify.toml\n' } } }],
    // The fixture bumps this version; HEAD already at the bumped value would make the bump a no-op.
    ['packages/react/package.json', {
      reactPackageBefore: version('0.1.0-rc.1'),
      reactPackageAfter: version('0.1.0-rc.2'),
      textSnapshots: { 'packages/react/package.json': { before: version('0.1.0-rc.1'), after: version('0.1.0-rc.2') } },
    }],
    // A manifest no route sends to policy: a development dependency of a package policy does not depend on.
    ['apps/react-playground/package.json', { textSnapshots: { 'apps/react-playground/package.json': { before: '{"devDependencies":{"vite":"1"}}', after: '{"devDependencies":{"vite":"2"}}' } } }],
    // The compiler reads the contract from the archived tree.
    ['strategy/platform-safety-contract.json', { textSnapshots: { 'strategy/platform-safety-contract.json': { before: '{}', after: '{ }' } } }],
    // `git archive` of HEAD honors an attributes file in any directory: this one would leave the CI workflow out of the fixture.
    ['.gitattributes', { textSnapshots: { '.gitattributes': { before: '* text=auto\n', after: '* text=auto\n.github/workflows/ci.yml export-ignore\n' } } }],
    ['.github/.gitattributes', { textSnapshots: { '.github/.gitattributes': { before: null, after: 'workflows/ci.yml export-ignore\n' } } }],
    ['apps/docs/.gitattributes', { textSnapshots: { 'apps/docs/.gitattributes': { before: null, after: 'src/lib/block-presets.ts export-ignore\n' } } }],
    ['.github/workflows/npm-publish.yml', { textSnapshots: { '.github/workflows/npm-publish.yml': { before: 'a', after: 'b' } } }],
    ['netlify.toml', { textSnapshots: { 'netlify.toml': { before: null, after: '[build]\n' } } }],
    ['apps/docs/astro.config.mjs', { textSnapshots: { 'apps/docs/astro.config.mjs': { before: 'a', after: 'b' } } }],
  ];
  for (const [path, options] of cases) {
    const result = await plan([path], { packages: workspacePackages, ...options });
    assert.equal(result.evidence, true, path);
    const groups = executionGroups(result, { packages: workspacePackages, environment: {}, pageIndex });
    const commands = groups.find(({ id }) => id === 'checks-policy')?.commands.map(({ args }) => args.at(-1));
    assert.ok(commands?.includes('check:evidence'), `${path}: ${commands}`);
  }
});

test('policy-run paths that no evidence test reads skip check:evidence', async () => {
  for (const path of [
    'decisions/0028-release-proof.md', 'strategy/milestone-roadmap.md', '.github/CODEOWNERS', '.github/pull_request_template.md',
    'AGENTS.md', 'apps/react-storybook/.gitignore', 'docs/agents/domain.md', '.agents/skills/muxui-delivery/SKILL.md', 'catalog/AGENTS.md',
    'tooling/audits/repository-policy/README.md', 'tooling/audits/repository-policy/src/ci-impact.mjs',
    'tooling/audits/repository-policy/test/ci-impact.test.mjs', 'tooling/audits/repository-policy/repository-policy.json',
    'tests/fixtures/g0.4/corpus.json', 'tests/fixtures/g1.0/entry-contract.test.mjs',
  ]) {
    const result = await plan([path]);
    assert.equal(result.policy, true, path);
    assert.equal(result.evidence, false, path);
    assert.deepEqual(await policyGroupArgs([path]), [policyCommand], path);
  }
  // The README, the lockfile, the React stylesheet, or a pattern browser test that is edited, not added or removed, is not a lookup change.
  const editedLookups = ['README.md', 'pnpm-lock.yaml', 'packages/react/src/supplemental/styles.css', 'packages/react/test/browser/pattern-poster-grid.test.mjs'];
  for (const path of editedLookups) {
    assert.equal((await plan([path], edited(path))).evidence, false, path);
  }
  // Test-only edits in a package policy depends on are not dependent-facing, so policy is not planned at all.
  const toolingTest = await plan(['packages/tooling/test/authoring.test.mjs']);
  assert.equal(toolingTest.policy || toolingTest.evidence, false);
  assert.deepEqual(toolingTest.packageChecks, ['@muxui/tooling']);
});

test('the evidence tests run beside the policy check when a change reaches their inputs', async () => {
  const policyAndEvidence = [policyCommand, evidenceCommand];
  const named = evidenceInputs.map((path) => (path.endsWith('/') ? `${path}${path.startsWith('tests/') ? 'bl1/index.json' : 'ci.yml'}` : path));
  for (const path of named) {
    const result = await plan([path]);
    assert.equal(result.evidence, true, path);
    assert.ok(result.reasons.some((reason) => reason.includes('retained-evidence tests; run check:evidence')), path);
    // Retained evidence and the policy modules and tests are also policy machinery; the others are not.
    const args = await policyGroupArgs([path]);
    assert.ok(args.some((command) => command.at(-1) === 'check:evidence'), path);
    assert.deepEqual(args, result.policy ? policyAndEvidence : [evidenceCommand], path);
  }

  // Packages the tests load reach policy through the workspace links, as they did before the split.
  for (const path of ['packages/tooling/src/index.mjs', 'packages/catalog/src/compiler.mjs', 'packages/schema/src/index.mjs', 'packages/tokens/src/index.mjs',
    'catalog/patterns/poster-grid/artifact.json', 'catalog/guides/foundations-component-tokens.md']) {
    const result = await plan([path]);
    assert.equal(result.policy && result.evidence, true, path);
    assert.deepEqual(await policyGroupArgs([path]), policyAndEvidence, path);
  }

  // A change no route owns widens to the whole policy proof, evidence included.
  const unowned = await plan(['scripts/unowned-change.mjs']);
  assert.equal(unowned.policy && unowned.evidence, true);
});

test('an evidence input alone plans a policy group that runs only the evidence tests', async () => {
  const result = await plan(['apps/docs/src/lib/block-presets.ts']);
  assert.equal(result.policy, false);
  assert.equal(result.evidence, true);
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['checks-policy', 'checks', 'browser-chromium']);
  assert.deepEqual(groups[0].commands.slice(1).map(({ args }) => args), [evidenceCommand]);
  // The group generates what policy's closure needs, like any policy group.
  const generation = groups[0].commands[0].args.filter((_, index, args) => args[index - 1] === '--filter');
  for (const name of ['@muxui/catalog', '@muxui/react', '@muxui/repository-policy', '@muxui/tooling']) assert.ok(generation.includes(name), name);
});

test('adding or removing a looked-up file plans the evidence tests; editing it does not', async () => {
  const added = (path) => ({ textSnapshots: { [path]: { before: null, after: 'new\n' } } });
  const removed = (path) => ({ textSnapshots: { [path]: { before: 'old\n', after: null } } });
  const patternTest = 'packages/react/test/browser/pattern-new-block.test.mjs';
  for (const path of ['README.md', 'pnpm-lock.yaml', 'packages/react/src/supplemental/styles.css', patternTest]) {
    for (const options of [added(path), removed(path)]) {
      const result = await plan([path], options);
      assert.equal(result.evidence, true, path);
      assert.match(result.reasons.join('\n'), new RegExp(`${path.replaceAll('.', '\\.')} is added or removed, and is looked up by the retained-evidence tests`, 'u'));
    }
  }
  // Another browser test, added or removed, is not looked up by name.
  assert.equal((await plan(['packages/react/test/browser/tree-toggle-browser.test.mjs'], added('packages/react/test/browser/tree-toggle-browser.test.mjs'))).evidence, false);
  // A pattern test added alone still plans its own browser proof and now the evidence check that pairs it with a pattern.
  // The file has no source here to opt into other engines, so its proof runs in the Chromium-only group.
  const groups = executionGroups(await plan([patternTest], added(patternTest)), { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['checks-policy', 'browser-chromium-only']);
});

test('the policy package splits its check script from the evidence script without dropping a test', async () => {
  const policyDirectory = resolve(repositoryRoot, 'tooling/audits/repository-policy');
  const { scripts } = JSON.parse(readFileSync(resolve(policyDirectory, 'package.json'), 'utf8'));
  // `check` globs every test file but the evidence ones; `check:evidence` globs those and verifies the retained evidence. The evidence
  // tests are separate files so they run in parallel processes, one per file, which the explicit concurrency keeps true on a small runner.
  const glob = scripts.check.match(/node --test '(test\/[^']+)'/u)?.[1];
  assert.equal(glob, 'test/!(evidence-*).test.mjs');
  const everyTest = globSync('test/*.test.mjs', { cwd: policyDirectory }).sort();
  const checked = globSync(glob, { cwd: policyDirectory }).sort();
  const evidenceTests = everyTest.filter((file) => !checked.includes(file));
  assert.ok(evidenceTests.length >= 4 && evidenceTests.every((file) => file.startsWith('test/evidence-')), evidenceTests.join(', '));
  assert.deepEqual(globSync('test/evidence-*.test.mjs', { cwd: policyDirectory }).sort(), evidenceTests);
  assert.ok(checked.length >= 10 && checked.includes('test/ci-impact.test.mjs'));
  assert.match(scripts.check, /^node src\/cli\.mjs && node src\/evidence-verify\.mjs && node --test /u);
  assert.equal(scripts['check:evidence'], `node src/evidence-verify.mjs && node --test --test-concurrency=${evidenceTests.length} 'test/evidence-*.test.mjs'`);
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
  const policy = executionGroups(await plan(['.github/CODEOWNERS']), { packages, environment: {}, pageIndex });
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

  const source = await readFile(resolve(repositoryRoot, tagSelectPath), 'utf8');
  const runtimePlan = await plan([tagSelectPath], {
    records: records.filter(({ family }) => ['TagSelect', 'MultiSelect'].includes(family)),
    textSnapshots: { [tagSelectPath]: { before: source.replace('    slot: null,\n', ''), after: source } },
    moduleSources: { ...cssModuleSources, [tagSelectPath]: { before: source.replace('    slot: null,\n', ''), after: source } },
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
  // Policy's own parser dependencies are loaded by the evidence tests.
  assert.equal(policy.evidence, true);
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
  assert.deepEqual(catalogCommands.map(({ prerequisite }) => prerequisite === true), [true, ...Array(6).fill(false)]);
});

test('clean owner checks schedule only their generation dependencies before checks', async () => {
  const catalog = await plan(['packages/catalog/src/compiler.mjs']);
  const catalogCommands = executionCommands(catalog, { packages });
  // Catalog changes also run the tooling dense goldens that snapshot catalog
  // responses and plan its runtime dependents (docs, tooling, and policy through
  // tooling) as if they changed. React's catalog devDependency is scoped:
  // React never imports @muxui/catalog.
  // This matches the real `ci-impact.mjs --preview` for this change.
  assert.deepEqual(catalog.generationPackages, [
    '@muxui/catalog', '@muxui/react', '@muxui/repository-policy',
    '@muxui/schema', '@muxui/tokens', '@muxui/tooling',
  ]);
  assert.deepEqual(catalogCommands[0].args, [
    '--recursive', '--sort', '--workspace-concurrency=1', '--if-present',
    ...catalog.generationPackages.flatMap((name) => ['--filter', name]),
    'run', 'generate',
  ]);
  assert.deepEqual(catalogCommands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/repository-policy', 'run', 'check'],
    ['--filter', '@muxui/repository-policy', 'run', 'check:evidence'],
    ['--filter', '@muxui/tooling', 'run', 'check'],
    ['--filter', '@muxui/catalog', 'run', 'check'],
    ['--filter', '@muxui/docs', 'run', 'check'],
    ['--filter', '@muxui/scale', 'run', 'check:browser:docs'],
  ]);
  assert.equal(catalog.reactPackageFull, false);
  assert.deepEqual(catalog.storyRuns, []);

  const policy = await plan(['.github/CODEOWNERS']);
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
  const source = await readFile(resolve(repositoryRoot, tagSelectPath), 'utf8');
  const before = source.replace('    slot: null,\n', '');
  const result = await plan([tagSelectPath, sizingExamplePath], {
    records: records.filter(({ family }) => ['TagSelect', 'MultiSelect'].includes(family)),
    textSnapshots: { [tagSelectPath]: { before, after: source } },
    moduleSources: { ...cssModuleSources, [tagSelectPath]: { before, after: source } },
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

test('a change to a collections module runs the collections guards even when it affects no family', async () => {
  const sliderPath = 'packages/react/src/color-slider.ts';
  // Dropping the pure annotation changes no export, so no family is affected.
  const before = 'export const ColorSlider = /* @__PURE__ */ (() => () => null)();\n';
  const after = 'export const ColorSlider = (() => () => null)();\n';
  const result = await plan([sliderPath], {
    records: [...records, { family: 'ColorSlider', export: 'ColorSlider', slug: 'color-slider', source: sliderPath, parts: ['root'] }],
    textSnapshots: { [sliderPath]: { before, after } },
    moduleSources: { ...cssModuleSources, [sliderPath]: { before, after } },
  });
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.reactTestFiles, ['test/collections-modules.test.mjs', 'test/motion-package-boundary.test.mjs', 'test/public-surface-baseline.test.mjs', 'test/tree-shaking.test.mjs']);
  const commands = executionCommands(result, { packages }).map(({ args }) => args.at(-1));
  assert.ok(commands.includes('test/collections-modules.test.mjs') && commands.includes('test/tree-shaking.test.mjs'));
});

test('a family module that moves from .mjs to .ts is planned through the barrel that re-exports it', async () => {
  const mjsPath = 'packages/react/src/color-area.mjs';
  const tsPath = 'packages/react/src/color-area.ts';
  const moduleText = 'export const ColorArea = () => null;\n';
  const barrel = { before: "export const Tree = () => null;\nexport { ColorArea } from './color-area.mjs';\n" };
  barrel.after = barrel.before.replace('color-area.mjs', 'color-area.ts');
  const changes = {
    [collectionsPath]: barrel,
    [mjsPath]: { before: moduleText, after: null },
    [tsPath]: { before: null, after: moduleText },
  };
  const result = await plan([collectionsPath, mjsPath, tsPath], {
    records: [...records, { family: 'ColorArea', export: 'ColorArea', slug: 'color-area', source: tsPath, parts: ['root'] }],
    textSnapshots: changes,
    moduleSources: { ...cssModuleSources, ...changes },
  });
  // The deleted module's only importer is the barrel, which changed in the same PR, so the barrel and the new module carry the change.
  assert.deepEqual(result.reactFamilies, ['ColorArea', 'Tree']);
  assert.ok(result.packageChecks.includes('@muxui/react'));

  // An importer the PR did not change would be left importing a module that no longer exists, so the analysis still owns it.
  await assert.rejects(plan([mjsPath], {
    records: [...records, { family: 'ColorArea', export: 'ColorArea', slug: 'color-area', source: tsPath, parts: ['root'] }],
    textSnapshots: { [mjsPath]: changes[mjsPath] },
    moduleSources: { ...cssModuleSources, [collectionsPath]: barrel.before, [mjsPath]: changes[mjsPath] },
  }), /MUXUI_CI_IMPACT_SOURCE_OWNERSHIP/u);
});

test('a TypeScript React source takes the runtime source route; a declaration file does not', async () => {
  const treePath = 'packages/react/src/tree.ts';
  const typed = records.map((record) => (record.family === 'Tree' ? { ...record, source: treePath } : record));
  const before = 'export const Tree = (props: { label: string }): string => props.label;\n';
  const after = before.replace('props.label;', 'props.label.trim();');
  const result = await plan([treePath], {
    records: typed,
    textSnapshots: { [treePath]: { before, after } },
    moduleSources: { ...cssModuleSources, [collectionsPath]: 'export const TagGroup = () => null;', [treePath]: { before, after } },
  });
  assert.deepEqual(result.reactFamilies, ['Tree']);
  assert.equal(result.reactProjectionCheck, true);
  assert.ok(result.reactTestFiles.includes('test/motion-package-boundary.test.mjs'));
  assert.ok(result.reasons.includes(`${treePath} is React runtime or compiler source; AST ownership determines the affected families`));

  const declarations = await plan(['packages/react/src/supplemental/index.d.ts']);
  assert.equal(declarations.reactPackageFull, true);
  assert.ok(!declarations.reasons.some((reason) => reason.includes('AST ownership')));
});

test('the catalog generates after React: catalog inputs still plan React proof and React output plans the catalog check', async () => {
  // The real manifests carry the edge: the catalog's devDependency on React orders generation.
  const workspacePackages = await discoverWorkspacePackages(repositoryRoot);
  const manifest = (name) => workspacePackages.find((item) => item.name === name).manifest;
  assert.equal(manifest('@muxui/catalog').devDependencies['@muxui/react'], 'workspace:*');
  assert.equal(manifest('@muxui/react').devDependencies?.['@muxui/catalog'], undefined);
  assert.equal(manifest('@muxui/react-storybook').devDependencies['@muxui/catalog'], 'workspace:*');
  for (const fixture of ['@muxui/catalog', '@muxui/react', '@muxui/react-storybook']) {
    assert.deepEqual(
      packages.find(({ name }) => name === fixture).manifest.devDependencies,
      Object.fromEntries(Object.entries(manifest(fixture).devDependencies ?? {}).filter(([name]) => name.startsWith('@muxui/'))),
      `the ${fixture} fixture mirrors its workspace devDependencies`,
    );
  }

  // catalog/ inputs React reads directly keep their React routes without a workspace edge.
  const record = await plan(['catalog/components/tree/artifact.json']);
  assert.deepEqual(record.reactFamilies, ['Tree']);
  assert.equal(record.catalog, true);
  assert.deepEqual(record.packageChecks, ['@muxui/figma', '@muxui/react-playground', '@muxui/tooling'], 'the catalog route runs the catalog check once');
  assert.equal((await plan(['catalog/react-r1-6/supplemental-components.json'])).reactPackageFull, true);
  assert.equal((await plan(['catalog/tokens/default-theme.json'])).reactTheme, true);

  // React output reaches the catalog check through the devDependency edge.
  const runtime = await plan([collectionsPath], treeRuntimeChange);
  assert.equal(runtime.catalog, false);
  assert.ok(runtime.packageChecks.includes('@muxui/catalog'));
  assert.ok(runtime.reasons.includes('@muxui/catalog has a workspace devDependency on changed @muxui/react; run its package check'));
  assert.ok(executionCommands(runtime, { packages }).some(({ args }) => args.join(' ') === '--filter @muxui/catalog run check'));
  // The edge stops there: tooling and Storybook keep their own routes.
  assert.ok(!runtime.packageChecks.includes('@muxui/tooling'));
});

test('a derived API routes like its family\'s component record', async () => {
  const path = 'packages/react/api/tree.json';
  const derived = await plan([path]);
  const record = await plan(['catalog/components/tree/artifact.json']);
  for (const field of ['reactFamilies', 'storyFamilies', 'catalog', 'docs', 'storyTooling', 'storyUnitTests', 'packageChecks']) {
    assert.deepEqual(derived[field], record[field], field);
  }
  assert.ok(derived.reasons.includes(`${path} is the derived API of Tree; validate it like the canonical component record`));
  assert.equal(needsStorybookGeneration([path], {}), true);
  await assert.rejects(plan(['packages/react/api/missing.json']), /MUXUI_CI_IMPACT_COMPONENT_RECORD_MISSING: packages\/react\/api\/missing\.json/u);
});

test('scoped plans split into independent groups that each repeat the generation prerequisite', async () => {
  const result = await plan([collectionsPath, '.github/CODEOWNERS'], treeRuntimeChange);
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  // Docs, Scale, Figma, and the playground depend on React at runtime, so they
  // run whole (with the browser checks) while React and Storybook keep the Tree
  // family scope. The family's browser test runs in the browser group, not the component check.
  // The catalog compiles React's derived APIs (Decision 0031), so it runs its own check.
  assert.deepEqual(groupIds(groups), ['checks-policy', 'checks', 'browser-chromium', 'react', 'browser-chromium-only', 'storybook-component']);
  const generation = executionCommands(result, { packages })[0];
  assert.equal(generation.prerequisite, true);
  for (const group of groups) assert.deepEqual(group.commands[0], generation, `${group.id} starts with generation`);
  // Ownership rules are policy machinery, not an input of the evidence tests.
  assert.deepEqual(groups[0].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/repository-policy', 'run', 'check'],
  ]);
  assert.deepEqual(groups[1].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/docs', 'run', 'check'],
    ['--filter', '@muxui/scale', 'run', 'check'],
    ['--filter', '@muxui/catalog', 'run', 'check'],
    ['--filter', '@muxui/figma', 'run', 'check'],
    ['--filter', '@muxui/react-playground', 'run', 'check'],
    ['--filter', '@muxui/react-storybook', 'run', 'generate:check'],
  ]);
  assert.deepEqual(groups[2].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/scale', 'run', 'check:browser'],
    ['--filter', '@muxui/scale', 'run', 'check:browser:docs'],
  ]);
  const componentCheck = groups[3].commands.find(({ args }) => args.includes('check:component'));
  assert.equal(componentCheck.env.MUXUI_COMPONENT_SKIP_BROWSER_TESTS, '1');
  assert.deepEqual(groups[4].commands.slice(1).map(({ args }) => args.slice(-1)), [['test/browser/tree-toggle-browser.test.mjs']]);
  assert.equal(groups[5].commands.at(-1).env.MUXUI_STORYBOOK_FAMILIES, 'Tree');
  assert.deepEqual(groupMatrix(groups).map(({ id, kind }) => [id, kind]), [
    ['checks-policy', 'checks'], ['checks', 'checks'], ['browser-chromium', 'browser'], ['react', 'react'], ['browser-chromium-only', 'browser'], ['storybook-component', 'storybook'],
  ]);

  // Tokens reach policy through tooling and the workspace links, so its evidence tests run as well.
  const tokens = executionGroups(await plan(['catalog/tokens/default-theme.json']), { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(tokens), ['checks-policy', 'checks-tooling', 'checks', 'browser-chromium', 'react', 'storybook-theme', 'storybook-chrome', 'tailwind']);
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

  // A changed cross-engine test runs in one group per engine, and each group installs only its own engine.
  const testFile = 'test/browser/autocomplete-dismissal.test.mjs';
  const dismissal = executionGroups(await plan([`packages/react/${testFile}`]), { packages, environment: {}, pageIndex });
  assert.deepEqual(dismissal.map(({ id, browserEngines }) => [id, browserEngines]), [
    ['browser-chromium', ''], ['browser-firefox', 'firefox'], ['browser-webkit', 'webkit'],
  ]);
});

// Hand-written limits: only the groups that install Firefox's or WebKit's system libraries get the 30 minute setup
// allowance on top of their checks limit, so a slow apt mirror cannot spend the time their tests need.
test('groups that install browser system libraries get a setup allowance outside their checks limit', async () => {
  const limits = (groups) => groupMatrix(groups).map(({ id, timeoutMinutes, jobTimeoutMinutes }) => [id, timeoutMinutes, jobTimeoutMinutes]);
  assert.deepEqual(limits(executionGroups(fullWorkspacePlan('test'), { packages, environment: {} })), [
    ['checks-policy', 30, 30], ['checks-tooling', 30, 30], ['checks', 30, 30], ['react', 30, 30],
    ['browser-chromium', 30, 30], ['browser-chromium-only-1', 30, 30], ['browser-chromium-only-2', 30, 30], ['browser-chromium-only-3', 30, 30],
    ['browser-firefox', 30, 60], ['browser-webkit', 30, 60],
    ['storybook-a11y', 30, 30], ['storybook', 30, 30], ['tailwind', 15, 15],
  ]);

  const dismissal = await plan(['packages/react/test/browser/autocomplete-dismissal.test.mjs']);
  assert.deepEqual(limits(executionGroups(dismissal, { packages, environment: {}, pageIndex })), [
    ['browser-chromium', 30, 30], ['browser-firefox', 30, 60], ['browser-webkit', 30, 60],
  ]);
});

test('the workflow limits the job, the browser install and the checks separately', async () => {
  const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
  const step = (name) => workflow.split('\n      - ').find((block) => block.startsWith(`name: ${name}\n`)) ?? '';
  // The job limit comes from the planner, which adds the setup allowance; expressions cannot add.
  assert.match(workflow, /\n    runs-on: ubuntu-latest\n(?: {4}#.*\n)*? {4}timeout-minutes: \$\{\{ matrix\.group\.jobTimeoutMinutes \}\}\n/u);
  // The checks keep the group's own limit as a step limit.
  assert.match(step('Run ${{ matrix.group.id }} checks'), /\n {8}timeout-minutes: \$\{\{ matrix\.group\.timeoutMinutes \}\}\n/u);
  // A stuck install fails by itself, inside the allowance and with time left for the other setup steps.
  const [firefox] = groupMatrix(executionGroups(fullWorkspacePlan('test'), { packages, environment: {} })).filter(({ id }) => id === 'browser-firefox');
  const installLimit = Number(step('Install Playwright browsers').match(/\n {8}timeout-minutes: (\d+)\n/u)?.[1]);
  assert.ok(installLimit > 0 && installLimit < firefox.jobTimeoutMinutes - firefox.timeoutMinutes, `install step limit ${installLimit}`);
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

// The documented shard of a file: the first four bytes of sha256(path), big-endian, modulo the shard count.
const shardOf = (file, count) => createHash('sha256').update(file).digest().readUInt32BE(0) % count;
const browserFilesOf = (group) => ownCommands(group).flatMap(({ args }) => args.filter((arg) => arg.startsWith('test/browser/')));
const crossEngineTests = reactBrowserTests
  .filter((file) => callsBrowserEngines(readFileSync(resolve(repositoryRoot, 'packages/react', file), 'utf8')));

test('the full plan runs the browser checks as parallel groups, each React test once per engine', () => {
  const crossEngine = crossEngineTests;
  const chromiumOnly = reactBrowserTests.filter((file) => !crossEngine.includes(file));
  assert.ok(crossEngine.includes('test/browser/autocomplete-dismissal.test.mjs'));
  assert.ok(chromiumOnly.includes('test/browser/dialog-motion.test.mjs'), 'engine-agnostic tests are Chromium-only');

  // The Chromium-only list is main's long pole, so it splits into three stable shards; the
  // cross-engine lists stay whole to keep main's matrix near 14 jobs.
  const shards = Array.from({ length: 3 }, (_, index) => chromiumOnly.filter((file) => shardOf(file, 3) === index));
  assert.ok(shards.every((files) => files.length > 0), 'each Chromium-only shard has files');

  const plan = fullWorkspacePlan('test');
  const groups = browserGroups(executionGroups(plan, { packages, environment: {} }));
  assert.deepEqual(groups.map(({ id, browserEngines, timeoutMinutes }) => [id, browserEngines, timeoutMinutes]), [
    ['browser-chromium', '', 30],
    ['browser-chromium-only-1', '', 30], ['browser-chromium-only-2', '', 30], ['browser-chromium-only-3', '', 30],
    ['browser-firefox', 'firefox', 30], ['browser-webkit', 'webkit', 30],
  ]);
  assert.ok(groupMatrix(groups).every(({ kind }) => kind === 'browser'));

  const exec = ['--filter', '@muxui/react', 'exec', 'node', '--test', '--test-concurrency=1'];
  const [chromium, ...only] = groups.slice(0, 4);
  const [firefox, webkit] = groups.slice(4);
  assert.deepEqual(ownCommands(chromium).map(({ args, env }) => [args, env]), [[[...exec, ...crossEngine], { MUXUI_BROWSER_ENGINES: 'chromium' }]]);
  // Scale's browser checks, one of which builds the docs site, join the last shard, which has the most slack.
  const scale = [['--filter', '@muxui/scale', 'run', 'check:browser'], ['--filter', '@muxui/scale', 'run', 'check:browser:docs']];
  only.forEach((group, index) => {
    const own = ownCommands(group);
    assert.deepEqual(own[0], { command: 'pnpm', args: [...exec, ...shards[index]], env: {}, unsetEnv: [] }, group.id);
    assert.deepEqual(own.slice(1).map(({ args }) => args), index === only.length - 1 ? scale : [], group.id);
  });
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
  assert.ok(!grouped.some((run) => /^(?:firefox|webkit) /u.test(run) && chromiumOnly.includes(run.split(' ')[1])), 'Chromium-only files never run in Firefox or WebKit');
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
  // A family's files across its shards.
  const filesOf = (family) => groups.filter(({ id }) => id.replace(/-\d+$/u, '') === family).flatMap(browserFilesOf).sort();
  assert.deepEqual(filesOf('browser-firefox'), [direct, alias].sort());
  assert.deepEqual(filesOf('browser-webkit'), [direct, alias].sort());
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
  const shardIds = (id, count) => Array.from({ length: count }, (_, index) => `${id}-${index + 1}`);

  // The full React package proof runs every browser group as the full plan does: the Chromium-only list in shards.
  const react = await plan(['packages/react/src/generate.mjs']);
  assert.equal(react.reactPackageFull, true);
  assert.deepEqual(browserIds(react), [
    'browser-chromium', ...shardIds('browser-chromium-only', 3), 'browser-firefox', 'browser-webkit',
  ]);
  // Without a cross-engine test there is nothing for Firefox or WebKit; Scale's browser checks keep browser-chromium.
  const none = browserIds(react, { testSources: fixedBrowserSources('export {};') });
  assert.deepEqual(none, ['browser-chromium', ...shardIds('browser-chromium-only', 3)]);
  // Without a Chromium-only test there is no Chromium-only group.
  const all = browserIds(react, { testSources: fixedBrowserSources(optIn) });
  assert.deepEqual(all, ['browser-chromium', 'browser-firefox', 'browser-webkit']);

  // Docs and Scale browser checks are Chromium-only and need no React browser group.
  assert.deepEqual(browserIds(await plan(['apps/docs/src/content/docs/foundations/index.mdx'])), ['browser-chromium']);
  assert.deepEqual(browserIds(await plan(['apps/scale/test/browser/theme-builder.test.mjs'])), ['browser-chromium']);

  // A changed cross-engine test plans one group per engine and nothing in the React group.
  const dismissal = await plan(['packages/react/test/browser/autocomplete-dismissal.test.mjs']);
  assert.deepEqual(browserIds(dismissal), ['browser-chromium', 'browser-firefox', 'browser-webkit']);
  assert.ok(!groupIds(executionGroups(dismissal, options)).includes('react'));
});

test('the full React proof runs a browser test that the plan also selects only once per engine', async () => {
  const react = await plan(['packages/react/src/generate.mjs']);
  const file = 'test/browser/sidebar.test.mjs';
  const groups = browserGroups(executionGroups({ ...react, reactTestFiles: [file] }, { packages, environment: {}, pageIndex }));
  assert.deepEqual(reactBrowserRuns(groups.flatMap(ownCommands)).filter((run) => run.endsWith(file)).sort(), [
    `chromium ${file}`, `firefox ${file}`, `webkit ${file}`,
  ]);
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

// Synthetic React browser tests: `cross` files opt into every engine, `only` files run in Chromium.
const syntheticBrowserTests = (cross, only) => {
  const name = (kind, index) => `test/browser/${kind}-${String(index).padStart(2, '0')}.test.mjs`;
  const crossFiles = Array.from({ length: cross }, (_, index) => name('cross', index));
  const onlyFiles = Array.from({ length: only }, (_, index) => name('only', index));
  const optIn = "import { browserEngines } from './harness.mjs'; browserEngines();";
  return {
    files: [...crossFiles, ...onlyFiles].sort(),
    crossFiles,
    onlyFiles,
    testSources: Object.fromEntries([...crossFiles.map((file) => [file, optIn]), ...onlyFiles.map((file) => [file, 'export {};'])]),
  };
};

// A pull request plan that selects exactly these React test files.
async function plannedWith(reactTestFiles, extra = {}) {
  return { ...await plan(['packages/react/test/browser/sidebar.test.mjs']), reactTestFiles, ...extra };
}

const groupFamily = (id) => id.replace(/-\d+$/u, '');

test('browser shards follow a stable hash of the path and stay balanced', () => {
  // The documented rule: the first four bytes of sha256(path), big-endian, modulo the shard count.
  const paths = Array.from({ length: 300 }, (_, index) => `test/browser/synthetic-${index}.test.mjs`);
  for (const path of paths.slice(0, 20)) {
    for (const count of [1, 2, 3]) assert.equal(browserShardIndex(path, count), shardOf(path, count));
  }
  // A file keeps its shard when other files come and go, so the shard that did not change keeps its identity.
  for (const count of [2, 3]) {
    const before = new Map(paths.map((path) => [path, browserShardIndex(path, count)]));
    const after = paths.filter((_, index) => index % 7 !== 0).map((path) => [path, browserShardIndex(path, count)]);
    for (const [path, shard] of after) assert.equal(shard, before.get(path), path);
  }
  // Large lists spread within a fifth of an even split.
  for (const count of [2, 3]) {
    const sizes = Array.from({ length: count }, (_, shard) => paths.filter((path) => browserShardIndex(path, count) === shard).length);
    for (const size of sizes) assert.ok(Math.abs(size - paths.length / count) <= paths.length / count / 5, `${count} shards: ${sizes.join(', ')}`);
  }
});

test('a pull request runs each selected browser test once per engine it supports, sharded when the list is long', async () => {
  const exec = ['--filter', '@muxui/react', 'exec', 'node', '--test', '--test-concurrency=1'];
  const planFor = async (cross, only, unit = []) => {
    const { files, crossFiles, onlyFiles, testSources } = syntheticBrowserTests(cross, only);
    const result = await plannedWith([...unit, ...files].sort());
    const groups = executionGroups(result, { packages, environment: {}, pageIndex, testSources });
    const browser = browserGroups(groups);
    const runs = reactBrowserRuns(browser.flatMap(ownCommands)).sort();
    const expected = [
      ...files.map((file) => `chromium ${file}`), ...crossFiles.flatMap((file) => [`firefox ${file}`, `webkit ${file}`]),
    ].sort();
    // Every selected file and engine pair runs exactly once, and a Chromium-only file never leaves Chromium.
    assert.deepEqual(runs, expected, `${cross} cross-engine and ${only} Chromium-only files`);
    assert.ok(!runs.some((run) => /^(?:firefox|webkit) /u.test(run) && onlyFiles.includes(run.split(' ')[1])));
    return { groups, browser, crossFiles, onlyFiles };
  };

  // Short lists keep the full plan's group ids.
  const short = await planFor(6, 18, ['test/fixture.test.mjs']);
  assert.deepEqual(groupIds(short.browser), ['browser-chromium', 'browser-chromium-only', 'browser-firefox', 'browser-webkit']);
  // Unit tests stay in the React group, one command each, with no engine.
  const react = short.groups.find(({ id }) => id === 'react');
  assert.deepEqual(ownCommands(react).map(({ args, env }) => [args, env]), [[[...exec, 'test/fixture.test.mjs'], {}]]);
  assert.equal(react.browserEngines, '');
  // Each group installs only its own engine.
  assert.deepEqual(short.browser.map(({ id, browserEngines }) => [id, browserEngines]), [
    ['browser-chromium', ''], ['browser-chromium-only', ''], ['browser-firefox', 'firefox'], ['browser-webkit', 'webkit'],
  ]);

  // One file past the limit splits the list, and a file lands in the same-numbered shard in every engine.
  const sharded = await planFor(12, 19);
  assert.deepEqual(groupIds(sharded.browser), [
    'browser-chromium-1', 'browser-chromium-2', 'browser-chromium-only-1', 'browser-chromium-only-2',
    'browser-firefox-1', 'browser-firefox-2', 'browser-webkit-1', 'browser-webkit-2',
  ]);
  const shardFiles = (id) => browserFilesOf(sharded.browser.find((group) => group.id === id));
  for (const [count, family, files] of [[2, 'browser-chromium', sharded.crossFiles], [2, 'browser-firefox', sharded.crossFiles], [2, 'browser-webkit', sharded.crossFiles], [2, 'browser-chromium-only', sharded.onlyFiles]]) {
    for (let shard = 1; shard <= count; shard += 1) {
      assert.deepEqual(shardFiles(`${family}-${shard}`), files.filter((file) => shardOf(file, count) === shard - 1), `${family}-${shard}`);
    }
  }
  // Neither shard of a list is under a third of it.
  for (const family of ['browser-chromium', 'browser-chromium-only']) {
    const sizes = [1, 2].map((shard) => shardFiles(`${family}-${shard}`).length);
    assert.ok(Math.min(...sizes) >= (sizes[0] + sizes[1]) / 3, `${family}: ${sizes.join(', ')}`);
  }
  assert.ok(sharded.browser.every(({ timeoutMinutes, kind }) => timeoutMinutes === 30 && kind === 'browser'));

  // A long Chromium-only list takes up to three shards; cross-engine lists never take more than two.
  const wide = await planFor(30, 60);
  assert.deepEqual(groupIds(wide.browser).filter((id) => id.startsWith('browser-chromium-only')), [
    'browser-chromium-only-1', 'browser-chromium-only-2', 'browser-chromium-only-3',
  ]);
  assert.equal(groupIds(wide.browser).filter((id) => id.startsWith('browser-firefox')).length, 2);

  // A list that hashes into one shard keeps the plain id instead of an empty sibling.
  const crowded = Array.from({ length: 400 }, (_, index) => `test/browser/cross-${index}.test.mjs`)
    .filter((file) => shardOf(file, 2) === 0).slice(0, 8);
  const optIn = "import { browserEngines } from './harness.mjs'; browserEngines();";
  const oneShard = executionGroups(await plannedWith(crowded), {
    packages, environment: {}, pageIndex, testSources: Object.fromEntries(crowded.map((file) => [file, optIn])),
  });
  assert.deepEqual(groupIds(oneShard), ['browser-chromium', 'browser-firefox', 'browser-webkit']);
});

test('a shard keeps its identity while the files of the other shard change', async () => {
  const { files, testSources } = syntheticBrowserTests(12, 0);
  const idOf = (groups, file, engine) => groups.find((group) => groupFamily(group.id) === `browser-${engine}` && browserFilesOf(group).includes(file)).id;
  const groupsFor = async (selected) => browserGroups(executionGroups(await plannedWith(selected), { packages, environment: {}, pageIndex, testSources }));
  const base = await groupsFor(files);
  const withoutOne = await groupsFor(files.filter((file) => file !== files[0]));
  // Dropping one file moves no other file between shards, and the untouched shard keeps its signature.
  for (const file of files.slice(1)) for (const engine of ['chromium', 'firefox', 'webkit']) assert.equal(idOf(withoutOne, file, engine), idOf(base, file, engine));
  const untouched = base.find((group) => !browserFilesOf(group).includes(files[0]) && group.id.startsWith('browser-chromium'));
  const same = withoutOne.find(({ id }) => id === untouched.id);
  assert.equal(groupSignature(same.commands), groupSignature(untouched.commands));
  const touched = base.find((group) => browserFilesOf(group).includes(files[0]) && group.id.startsWith('browser-chromium'));
  assert.notEqual(groupSignature(withoutOne.find(({ id }) => id === touched.id).commands), groupSignature(touched.commands));
  // Every group id is planned once.
  assert.equal(new Set(groupIds(base)).size, base.length);
});

test('a changed shared browser helper still widens to every file that references it, once per engine', async () => {
  const reactTestReferenceSources = await reactTestTexts();
  const helperPath = 'packages/react/test/browser/pattern-probes.mjs';
  const helper = await plan([helperPath], { reactTestReferenceSources, textSnapshots: { [helperPath]: { after: 'present' } } });
  const importers = Object.entries(reactTestReferenceSources)
    .filter(([file, text]) => file.endsWith('.test.mjs') && /pattern-probes\.mjs/u.test(text))
    .map(([file]) => file);
  assert.ok(importers.length > 5, 'the helper has browser test importers');
  for (const file of importers) assert.ok(helper.reactTestFiles.includes(file), `${file} reruns`);
  const referencing = helper.reactTestFiles;
  const browserTests = referencing.filter(isBrowserTestFile);
  const groups = executionGroups(helper, { packages, environment: {}, pageIndex });
  const expected = browserTests.flatMap((file) => (crossEngineTests.includes(file)
    ? [`chromium ${file}`, `firefox ${file}`, `webkit ${file}`]
    : [`chromium ${file}`])).sort();
  assert.deepEqual(reactBrowserRuns(browserGroups(groups).flatMap(ownCommands)).sort(), expected);
  // Nothing else runs in the React group: the helper's importers are browser tests.
  assert.ok(!groupIds(groups).includes('react') || referencing.some((file) => !isBrowserTestFile(file)));
});

test('a component check names its focused browser test cases in the browser groups', async () => {
  const file = 'test/browser/candidate-motion.test.mjs';
  const whole = 'test/browser/activity.test.mjs';
  const names = ['Activity keeps a (tricky) title', 'Activity second'];
  const result = await plannedWith([], {
    reactFamilies: ['Activity'],
    reactComponentTests: [file, whole, 'test/style-scopes.test.mjs', 'test/styling-tokens.test.mjs'],
    reactComponentTestNames: { [file]: names },
  });
  const sources = { [file]: 'export {};', [whole]: 'export {};' };
  const groups = executionGroups(result, { packages, environment: {}, pageIndex, testSources: sources });
  const chromiumOnly = groups.find(({ id }) => id === 'browser-chromium-only');
  const exec = ['--filter', '@muxui/react', 'exec', 'node', '--test', '--test-concurrency=1'];
  // Whole files share one command; a focused file keeps the case filter the component check applies.
  assert.deepEqual(ownCommands(chromiumOnly).map(({ args }) => args), [
    [...exec, whole], [...exec, `--test-name-pattern=${testNamePattern(names)}`, file],
  ]);
  assert.equal(testNamePattern(names), '^(?:Activity keeps a \\(tricky\\) title|Activity second)$');
  const check = groups.find(({ id }) => id === 'react').commands.find(({ args }) => args.includes('check:component'));
  assert.equal(check.env.MUXUI_COMPONENT_SKIP_BROWSER_TESTS, '1');
});

test('a plan without component browser tests leaves the component check as it was', async () => {
  const result = await plannedWith([], {
    reactFamilies: ['Activity'],
    reactComponentTests: ['test/activity.test.mjs', 'test/style-scopes.test.mjs', 'test/styling-tokens.test.mjs'],
    reactComponentTestNames: {},
  });
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['react']);
  const check = groups[0].commands.find(({ args }) => args.includes('check:component'));
  assert.equal(check.env.MUXUI_COMPONENT_SKIP_BROWSER_TESTS, undefined);
});

test('browser shard failures aggregate into the single required check', () => {
  const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
  // Every group, shards included, is one entry of the `run` matrix.
  assert.match(workflow, /group:\s*\$\{\{ fromJSON\(needs\.plan\.outputs\.groups\) \}\}/u);
  assert.match(workflow, /fail-fast: false/u);
  // `check` waits for the whole matrix and passes only when it succeeded.
  assert.match(workflow, /\n  check:\n    needs: \[plan, run\]\n    if: always\(\)/u);
  assert.match(workflow, /\[ "\$RUN_RESULT" = success \]/u);
});

test('an Autocomplete runtime change runs its browser test in every engine, in the browser groups', async () => {
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
  const groups = executionGroups(result, { packages, environment: {}, pageIndex: [...pageIndex, autocompletePage], testSources });
  // The component check keeps the family's other tests and the typecheck, but leaves the browser test to its groups.
  const react = groups.find(({ id }) => id === 'react');
  assert.equal(react.browserEngines, '');
  const componentCheck = react.commands.find(({ args }) => args.includes('check:component'));
  assert.equal(componentCheck.env.MUXUI_COMPONENT_FAMILIES, 'Autocomplete');
  assert.equal(componentCheck.env.MUXUI_COMPONENT_SKIP_BROWSER_TESTS, '1');
  assert.equal(componentCheck.env.MUXUI_BROWSER_ENGINES, undefined);
  assert.deepEqual(reactBrowserRuns(groups.flatMap(ownCommands)).sort(), [
    `chromium ${dismissalTest}`, `firefox ${dismissalTest}`, `webkit ${dismissalTest}`,
  ]);
  assert.deepEqual(browserGroups(groups).map(({ id, browserEngines }) => [id, browserEngines]), [
    ['browser-chromium', ''], ['browser-firefox', 'firefox'], ['browser-webkit', 'webkit'],
  ]);
});

const generationFilters = (command) => command.args.filter((_, index) => command.args[index - 1] === '--filter');

test('a React-test-only group generates the React closure it imports in its own runner', async () => {
  const testFile = 'test/browser/tree-toggle-browser.test.mjs';
  const groups = executionGroups(await plan([`packages/react/${testFile}`]), { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['browser-chromium-only']);
  const [generation, check] = groups[0].commands;
  assert.equal(generation.prerequisite, true);
  // React no longer depends on the catalog; the catalog depends on React (Decision 0031).
  assert.deepEqual(generationFilters(generation), ['@muxui/react', '@muxui/schema', '@muxui/tokens']);
  assert.equal(check.args.at(-1), testFile);
});

test('story page groups generate Storybook metadata unless this process already prepared it', async () => {
  const result = await plan([sizingExamplePath]);
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['checks-policy', 'checks-tooling', 'checks', 'browser-chromium', 'react', 'storybook-story']);
  for (const group of groups) {
    assert.equal(group.commands[0].prerequisite, true);
    assert.ok(generationFilters(group.commands[0]).includes('@muxui/react-storybook'), `${group.id} generates Storybook`);
  }

  const prepared = executionGroups(result, { packages, environment: {}, pageIndex, metadataPrepared: true });
  assert.deepEqual(groupIds(prepared), groupIds(groups));
  // Only the catalog's other dependents (policy through tooling) and the tooling
  // goldens that snapshot catalog responses remain to generate.
  for (const command of prepared.flatMap(({ commands }) => commands).filter(({ prerequisite }) => prerequisite)) {
    assert.deepEqual(generationFilters(command), [
      '@muxui/repository-policy', '@muxui/tooling',
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

const storybookSlice = (selection) => selection.commands.map(({ args, env }) => ({ args, env }));
const storybookEnv = { MUXUI_STORYBOOK_A11Y_WORKERS: '2', MUXUI_STORYBOOK_COLORS_WORKERS: '2' };

test('a family runtime change gives the local run one scoped Storybook audit with CI environment', async () => {
  const result = await plan([collectionsPath], treeRuntimeChange);
  const selection = storybookSelection(result, { packages, environment: {}, pageIndex });

  assert.equal(selection.full, false);
  assert.equal(selection.pages, 3);
  assert.deepEqual(storybookSlice(selection), [
    { args: ['--filter', '@muxui/react-storybook', 'run', 'generate:check'], env: {} },
    {
      args: ['--filter', '@muxui/react-storybook', 'run', 'check:scoped'],
      env: { MUXUI_STORYBOOK_AUDIT_PROOF: 'component', MUXUI_STORYBOOK_FAMILIES: 'Tree', ...storybookEnv },
    },
  ]);
  // The audit clears inherited page selections, and nothing but Storybook is in the slice.
  assert.deepEqual(selection.commands.at(-1).unsetEnv, ['MUXUI_STORYBOOK_FAMILIES', 'MUXUI_STORYBOOK_STORY_IDS']);
  assert.ok(executionCommands(result, { packages, environment: {}, pageIndex }).length > selection.commands.length);

  // The slice is what CI's own Storybook group runs.
  const group = executionGroups(result, { packages, environment: {}, pageIndex }).find(({ id }) => id === 'storybook-component');
  assert.deepEqual(selection.commands.at(-1), group.commands.at(-1));
});

test('mixed proofs keep one command each with their own page selection', async () => {
  const result = await plan([collectionsPath, sizingExamplePath, 'catalog/tokens/default-theme.json'], treeRuntimeChange);
  const selection = storybookSelection(result, { packages, environment: {}, pageIndex });

  assert.equal(selection.full, false);
  assert.deepEqual(selection.commands.filter(({ env }) => env.MUXUI_STORYBOOK_AUDIT_PROOF).map(({ env }) => [env.MUXUI_STORYBOOK_AUDIT_PROOF, env.MUXUI_STORYBOOK_FAMILIES, env.MUXUI_STORYBOOK_STORY_IDS]), [
    ['component', 'Tree', undefined],
    ['story', 'NumberField', sizingStoryId],
    ['theme', 'MultiSelect,NumberField,TagSelect', undefined],
    ['chrome', undefined, undefined],
  ]);
});

test('a plan with no Storybook proof gives the local run nothing to run', async () => {
  const result = await plan(['packages/react/test/browser/tree-toggle-browser.test.mjs']);
  assert.deepEqual(storybookSelection(result, { packages, environment: {}, pageIndex }), { full: false, pages: 0, commands: [] });
});

test('a selection CI would shard, or cannot bound, keeps the full local audit with its reason', async () => {
  // A shared path selects every page: pad the index past one shard.
  const filler = { family: 'Filler', stories: Array.from({ length: storyShardPageBudget }, (_, index) => ({ id: `filler--${index}`, exportName: 'Default' })) };
  const wideIndex = [...pageIndex, filler];
  const shared = await plan(['apps/react-storybook/src/storybook-factory.mjs'], { pageIndex: wideIndex });
  assert.match(storybookSelection(shared, { packages, environment: {}, pageIndex: wideIndex }).reason, /shard the selection of \d+ pages \(more than 80 per shard\)/u);
  assert.equal(storybookSelection(shared, { packages, environment: {}, pageIndex: wideIndex }).full, true);

  // Chrome proof audits the manager UI, not pages, so a wide index never shards it.
  const chrome = await plan(['apps/react-storybook/.storybook/manager.mjs'], { pageIndex: wideIndex });
  assert.deepEqual(chrome.storyRuns.map(({ proof }) => proof), ['chrome']);
  const chromeSelection = storybookSelection(chrome, { packages, environment: {}, pageIndex: wideIndex });
  assert.equal(chromeSelection.full, false);
  assert.equal(chromeSelection.pages, 0);
  assert.deepEqual(chromeSelection.commands.map(({ env }) => env.MUXUI_STORYBOOK_AUDIT_PROOF).filter(Boolean), ['chrome']);
  assert.equal(chromeSelection.commands.filter(({ args }) => args.includes('check:scoped')).length, 1);

  // The same shared path fits one shard in the small fixture index.
  const narrow = await plan(['apps/react-storybook/src/storybook-factory.mjs']);
  assert.equal(storybookSelection(narrow, { packages, environment: {}, pageIndex }).full, false);

  const theme = await plan(['catalog/tokens/default-theme.json'], { pageIndex: [] });
  assert.match(storybookSelection(theme, { packages, environment: {}, pageIndex: [] }).reason, /page index is unavailable/u);

  const full = storybookSelection(fullWorkspacePlan('a workspace-wide input changed'));
  assert.equal(full.full, true);
  assert.match(full.reason, /full workspace graph \(a workspace-wide input changed\)/u);
});

test('a planner failure keeps the full local audit instead of throwing', async () => {
  const selection = await planStorybookCommands({ changedPaths: [collectionsPath], baseRef: 'refs/heads/muxui-no-such-base' });
  assert.equal(selection.full, true);
  assert.match(selection.reason, /the CI planner could not plan these paths \(MUXUI_CI_IMPACT_BASE_UNAVAILABLE/u);
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
    'checks-policy', 'checks-tooling', 'checks', 'react', 'browser-chromium', 'browser-chromium-only-1', 'browser-chromium-only-2',
    'browser-chromium-only-3', 'browser-firefox', 'browser-webkit', 'storybook-a11y', 'storybook', 'tailwind',
  ]);
  for (const group of groups) {
    assert.deepEqual(group.commands[0].args, ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present', 'run', 'generate']);
    assert.equal(group.commands[0].prerequisite, true);
    assert.ok(group.timeoutMinutes > 0);
  }
  const byId = Object.fromEntries(groups.map((group) => [group.id, group.commands.slice(1).map(({ args }) => args.join(' '))]));
  // Policy keeps both its scripts on the full plan, and tooling has its own group.
  assert.deepEqual(byId['checks-policy'], ['--filter @muxui/repository-policy run check', '--filter @muxui/repository-policy run check:evidence']);
  assert.deepEqual(byId['checks-tooling'], ['--filter @muxui/tooling run check']);
  // Every other package check is one command per package, as in pull-request plans, and the root's `check` (the affected-scope runner) stays out.
  assert.equal(byId.checks.at(-1), 'generate:check');
  const rest = byId.checks.slice(0, -1);
  assert.ok(rest.every((command) => /^--filter \S+ run check$/u.test(command)), rest.join('\n'));
  assert.ok(!rest.some((command) => /@muxui\/(?:workspace|react|react-storybook|repository-policy|tooling) /u.test(command)));
  for (const { name, manifest } of packages) {
    const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    const position = rest.indexOf(`--filter ${name} run check`);
    for (const dependency of dependencies) {
      const earlier = rest.indexOf(`--filter ${dependency} run check`);
      if (position !== -1 && earlier !== -1) assert.ok(earlier < position, `${dependency} is checked before ${name}`);
    }
  }
  assert.deepEqual(byId.react, ['--filter @muxui/react run check']);
  const reactBrowser = '--filter @muxui/react exec node --test --test-concurrency=1 test/browser/';
  for (const id of ['browser-chromium', 'browser-chromium-only-1', 'browser-chromium-only-2', 'browser-chromium-only-3', 'browser-firefox', 'browser-webkit']) {
    assert.ok(byId[id][0].startsWith(reactBrowser), id);
    assert.equal(byId[id].length, id === 'browser-chromium-only-3' ? 3 : 1, id);
  }
  // Scale's browser checks, one of which builds the docs site, ride in the last Chromium-only shard, away from the cross-engine groups.
  assert.deepEqual(byId['browser-chromium-only-3'].slice(1), ['--filter @muxui/scale run check:browser', '--filter @muxui/scale run check:browser:docs']);
  assert.ok(byId['storybook-a11y'][0].endsWith('test/storybook-a11y.test.mjs'));
  assert.ok(!byId.storybook.at(-1).includes('storybook-a11y'));
  assert.ok(byId.storybook.at(-1).includes('test/storybook-colors.test.mjs'));
  const storybookEnv = groups.find(({ id }) => id === 'storybook-a11y').commands[1].env;
  assert.equal(storybookEnv.MUXUI_STORYBOOK_AUDIT_EVENT, 'check:all');
  assert.equal(storybookEnv.MUXUI_STORYBOOK_AUDIT_FORCE, '1');
  assert.equal(storybookEnv.MUXUI_STORYBOOK_COLORS_ARTIFACT_DIR, '/tmp/runner/storybook-colour-audit');
});

// Decision 0030: Storybook's own-interface colour proofs are not release proof, so only a main
// push skips them; the weekly schedule, manual runs, and pull request plans keep them.
test('a main push skips the Storybook own-interface colour proofs and every other event keeps them', async () => {
  const colours = (event) => {
    const groups = executionGroups(fullWorkspacePlan(`${event} runs the full workspace graph`), {
      packages, environment: event ? { GITHUB_EVENT_NAME: event, RUNNER_TEMP: '/tmp/runner' } : {},
    });
    const storybook = groups.find(({ id }) => id === 'storybook').commands.find(({ args }) => args.includes('test/storybook-colors.test.mjs'));
    assert.equal(groups.find(({ id }) => id === 'storybook-a11y').commands.at(-1).env.MUXUI_STORYBOOK_UI_PROOF, undefined, 'the a11y group has no own-interface proof');
    return storybook.env.MUXUI_STORYBOOK_UI_PROOF;
  };
  assert.equal(colours('push'), 'skip');
  for (const event of ['schedule', 'workflow_dispatch', 'pull_request', undefined]) assert.equal(colours(event), undefined, String(event));

  // A pull request that changes Storybook chrome plans the manager and docs proof without the switch.
  const chrome = executionGroups(await plan(['apps/react-storybook/.storybook/theme.mjs']), { packages, environment: { GITHUB_EVENT_NAME: 'pull_request' }, pageIndex });
  const chromeRun = chrome.find(({ id }) => id === 'storybook-chrome');
  assert.ok(chromeRun, 'a Storybook theme change plans the chrome proof');
  assert.equal(chromeRun.commands.at(-1).env.MUXUI_STORYBOOK_UI_PROOF, undefined);
  assert.equal(chromeRun.commands.at(-1).env.MUXUI_STORYBOOK_AUDIT_PROOF, 'chrome');
});

// Before the split, main ran `pnpm --recursive --sort --if-present --filter '!<root>' --filter '!@muxui/react'
// --filter '!@muxui/react-storybook' run check`: every workspace project with a `check` script except those three.
test('the full plan runs the package checks the recursive command ran, once each, in dependency order', async () => {
  const projects = JSON.parse(execFileSync('pnpm', ['--recursive', 'ls', '--depth', '-1', '--json'], { cwd: repositoryRoot, encoding: 'utf8' }));
  const rootName = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')).name;
  const before = projects
    .filter(({ name }) => ![rootName, '@muxui/react', '@muxui/react-storybook'].includes(name))
    .filter(({ path }) => typeof JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8')).scripts?.check === 'string')
    .map(({ name }) => name)
    .sort();
  assert.ok(before.length >= 8 && before.includes('@muxui/repository-policy') && before.includes('@muxui/tooling'), before.join(', '));

  const workspacePackages = await discoverWorkspacePackages(repositoryRoot);
  const groups = executionGroups(fullWorkspacePlan(), { packages: workspacePackages, environment: {} });
  const checkGroups = groups.filter(({ kind }) => kind === 'checks');
  assert.deepEqual(checkGroups.map(({ id }) => id), ['checks-policy', 'checks-tooling', 'checks']);
  const packageChecks = checkGroups.flatMap(({ commands }) => commands)
    .filter(({ args }) => args[0] === '--filter' && args.slice(2).join(' ') === 'run check')
    .map(({ args }) => args[1]);
  assert.deepEqual([...packageChecks].sort(), before, 'every package that ran before still runs, and none twice');

  // Within the `checks` group each package follows the packages it depends on.
  const rest = packageChecks.filter((name) => !['@muxui/repository-policy', '@muxui/tooling'].includes(name));
  for (const { name, manifest } of workspacePackages) {
    const position = rest.indexOf(name);
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies })) {
      if (position !== -1 && rest.includes(dependency)) assert.ok(rest.indexOf(dependency) < position, `${dependency} is checked before ${name}`);
    }
  }
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

test('a docs change after a full React proof reruns whichever group hosts the Scale docs check', async () => {
  const docsFile = 'apps/docs/src/theme-prepaint-entry.mjs';
  const scaleDocs = 'check:browser:docs';
  // Workspace links as in the repository: the Scale docs check builds the docs site inside its script.
  const workspace = packagesWithScript('@muxui/scale', scaleDocs, 'pnpm --filter @muxui/docs build && node --test test/browser/docs-theme.test.mjs');
  const options = { packages: workspace, environment: {}, pageIndex };
  const host = (groups) => groups.find(({ commands }) => commands.some(({ args }) => args.includes(scaleDocs)));
  // The full plan's generation prerequisite names no package, so the hosting commands alone bound the group here.
  const forReuse = (group) => ({
    id: group.id, kind: group.kind, signature: groupSignature(group.commands), packageDirectories: groupPackageDirectories(ownCommands(group), workspace),
  });

  // Before the fix a docs-only follow-up routed to browser-chromium while the earlier run hosted the check elsewhere.
  const later = await plan([docsFile]);
  const laterGroups = executionGroups(later, options);
  assert.ok(laterGroups.some(({ id }) => id === 'browser-chromium'), 'a docs change plans the docs check in browser-chromium');
  const delta = { changedPaths: [docsFile], groupIds: groupIds(laterGroups), storyRuns: [], storyTooling: false };

  // The earlier run: the full React proof, a pull request plan, and the full plan that main runs.
  const earlier = {
    'a full React proof': executionGroups(await plan(['packages/react/src/generate.mjs']), options),
    'the full plan': executionGroups(fullWorkspacePlan('test'), options),
  };
  for (const [label, groups] of Object.entries(earlier)) {
    const hosting = forReuse(host(groups));
    // The docs site is an input of the hosting group, so no routing is needed to rerun it.
    assert.ok(hosting.packageDirectories.includes('apps/docs'), label);
    assert.match(affectedReason(hosting, delta), /changes touch apps\/docs\/src\/theme-prepaint-entry\.mjs/u, label);
    // A decision from an earlier run that passed every group must not reuse that group.
    const passed = earlierRun(5, Object.fromEntries(groups.map(({ id }) => [id, 'success'])), { groups: groups.map(forReuse) });
    const decisions = await decide([passed], delta, groups.map(forReuse));
    assert.equal(decisions.find(({ id }) => id === hosting.id).reusedFrom, '', `${label}: ${hosting.id} reruns`);
  }
  // A pull request plan keeps the check in the browser-chromium family, the family a docs change routes to.
  assert.equal(groupFamily(host(earlier['a full React proof']).id), 'browser-chromium');
  const selected = await plannedWith(['test/browser/sidebar.test.mjs'], { docs: true });
  assert.equal(groupFamily(host(executionGroups(selected, options)).id), 'browser-chromium');
  const sharded = syntheticBrowserTests(12, 19);
  const wide = executionGroups(await plannedWith(sharded.files, { docs: true }), { ...options, testSources: sharded.testSources });
  assert.equal(groupFamily(host(wide).id), 'browser-chromium');
});

test('a package script that builds another package makes that package an input of the group', () => {
  const byName = (name, path, scripts = {}) => ({ name, path, manifest: { dependencies: {}, scripts } });
  const workspace = [
    byName('@muxui/scale', 'apps/scale', { 'check:browser:docs': 'pnpm --filter @muxui/docs build && node --test x.mjs', check: 'node --test y.mjs' }),
    byName('@muxui/docs', 'apps/docs'),
  ];
  const run = (script) => [{ command: 'pnpm', args: ['--filter', '@muxui/scale', 'run', script] }];
  assert.deepEqual(groupPackageDirectories(run('check:browser:docs'), workspace), ['apps/docs', 'apps/scale']);
  assert.deepEqual(groupPackageDirectories(run('check'), workspace), ['apps/scale']);
  // A script that names a package outside the workspace cannot be bounded, so nothing is reused.
  assert.equal(groupPackageDirectories(run('check:browser:docs'), workspace.slice(0, 1)), null);
});

test('hidden package inputs read every filter spelling and fail closed on any selector they cannot resolve', () => {
  const byName = (name, path, scripts = {}) => ({ name, path, manifest: { dependencies: {}, scripts } });
  const directoriesFor = (script, outer = ['--filter', '@muxui/scale', 'run', 'build']) => groupPackageDirectories(
    [{ command: 'pnpm', args: outer }],
    [byName('@muxui/scale', 'apps/scale', { build: script }), byName('@muxui/docs', 'apps/docs')],
  );
  // Each spelling of a workspace package name is an input.
  for (const script of [
    'pnpm --filter @muxui/docs build', 'pnpm --filter=@muxui/docs build', 'pnpm -F @muxui/docs build', 'pnpm -F=@muxui/docs build',
    'pnpm --filter "@muxui/docs" build', "pnpm --filter='@muxui/docs' build",
  ]) assert.deepEqual(directoriesFor(script), ['apps/docs', 'apps/scale'], script);
  // The command's own selector may use the equals form too.
  assert.deepEqual(directoriesFor('node x.mjs', ['--filter=@muxui/scale', 'run', 'build']), ['apps/scale']);
  // A package outside the workspace cannot be bounded, in either form.
  for (const script of ['pnpm --filter @outside/pkg build', 'pnpm --filter=@outside/pkg build']) {
    assert.equal(directoriesFor(script), null, script);
  }
  assert.equal(directoriesFor('node x.mjs', ['--filter=@outside/pkg', 'run', 'build']), null);
  // So is any selector that is not exactly a workspace package name.
  for (const selector of [
    '@muxui/docs...', '...@muxui/docs', '...^@muxui/docs', '@muxui/*', '!@muxui/docs', './apps/docs', '{apps/docs}', 'docs', '[@muxui/docs]',
  ]) {
    for (const script of [`pnpm --filter ${selector} build`, `pnpm --filter=${selector} build`, `pnpm -F ${selector} build`]) {
      assert.equal(directoriesFor(script), null, script);
    }
  }
  // Filter flags this reader does not model, or without a value, are not guessed at.
  for (const script of ['pnpm --filter-prod @muxui/docs build', 'pnpm --filter-prod=@muxui/docs build', 'pnpm --filter', 'pnpm --filter= build', 'pnpm -Fdocs build']) {
    assert.equal(directoriesFor(script), null, script);
  }
  // A script with no filter adds nothing.
  assert.deepEqual(directoriesFor('node --test x.mjs'), ['apps/scale']);
});

test('a browser test that moved out of the react group is still rerun by its own routing', async () => {
  const options = { packages, environment: {}, pageIndex };
  const patternTest = 'test/browser/pattern-task-filters.test.mjs';
  const files = ['test/browser/dialog-motion.test.mjs', 'test/browser/sidebar.test.mjs', patternTest];
  const earlier = executionGroups(await plannedWith(files), options).map((group) => ({
    id: group.id, kind: group.kind, signature: groupSignature(group.commands), packageDirectories: groupPackageDirectories(group.commands, packages),
  }));
  assert.deepEqual(groupIds(earlier), ['browser-chromium', 'browser-chromium-only', 'browser-firefox', 'browser-webkit']);
  // The pattern's catalog source lies outside every package directory, so only routing can rerun its test.
  const path = 'catalog/patterns/task-filters/pattern.json';
  const delta = (groups) => ({ changedPaths: [path], groupIds: groupIds(groups), storyRuns: [], storyTooling: false });
  const routed = delta(executionGroups(await plannedWith([patternTest]), options));
  const reasons = Object.fromEntries(earlier.map((group) => [group.id, affectedReason(group, routed)]));
  assert.match(reasons['browser-chromium'], /route to browser-chromium/u);
  assert.match(reasons['browser-firefox'], /route to browser-firefox/u);
  assert.match(reasons['browser-webkit'], /route to browser-webkit/u);
  assert.equal(reasons['browser-chromium-only'], null, 'a Chromium-only family does not run the pattern test');
});

test('browser shards reuse by their engine family and only while their own file list is unchanged', async () => {
  const group = (id) => ({ id, kind: 'browser', packageDirectories: ['packages/react'] });
  const routed = (groupIds) => ({ changedPaths: ['catalog/patterns/task-filters/pattern.json'], groupIds, storyRuns: [], storyTooling: false });
  // A change routes to a family, never to one shard, so a pass is not reused beside a changed file.
  assert.match(affectedReason(group('browser-chromium-1'), routed(['browser-chromium-2'])), /route to browser-chromium/u);
  assert.match(affectedReason(group('browser-chromium-only-2'), routed(['browser-chromium-only'])), /route to browser-chromium-only/u);
  assert.match(affectedReason(group('browser-webkit-2'), routed(['browser-webkit-1'])), /route to browser-webkit/u);
  // Other engines, and the Chromium-only family, are untouched by it.
  assert.equal(affectedReason(group('browser-firefox-1'), routed(['browser-chromium-1', 'browser-chromium-only-1'])), null);
  assert.equal(affectedReason(group('browser-chromium-only-1'), routed(['browser-chromium-2'])), null);
  // A change inside the React package reruns every shard.
  const inReact = { ...routed([]), changedPaths: ['packages/react/test/browser/sidebar.test.mjs'] };
  for (const id of ['browser-chromium-1', 'browser-chromium-only-3', 'browser-firefox-2', 'browser-webkit']) {
    assert.match(affectedReason(group(id), inReact), /changes touch packages\/react\/test\/browser\/sidebar\.test\.mjs/u, id);
  }

  // Identity is the shard id plus its command signature: a shard whose files changed reruns, its sibling does not.
  const shards = ['1', '2'].map((digit) => ({ ...group(`browser-chromium-${digit}`), signature: digit.repeat(64) }));
  const passed = earlierRun(3, { 'browser-chromium-1': 'success', 'browser-chromium-2': 'success' }, { groups: shards });
  assert.deepEqual(outcome(await decide([passed], noDelta, shards)), { 'browser-chromium-1': 'reused', 'browser-chromium-2': 'reused' });
  const regrouped = [shards[0], { ...shards[1], signature: '3'.repeat(64) }];
  assert.deepEqual(outcome(await decide([passed], noDelta, regrouped)), { 'browser-chromium-1': 'reused', 'browser-chromium-2': 'signature changed' });
  // A pass of the unsharded group says nothing about a shard.
  const plain = earlierRun(4, { 'browser-chromium': 'success' }, { groups: [{ ...shards[0], id: 'browser-chromium' }] });
  assert.deepEqual(outcome(await decide([plain], noDelta, shards)), { 'browser-chromium-1': 'no earlier pass', 'browser-chromium-2': 'no earlier pass' });
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

test('checks-* groups keep kind checks and the checks timeout in pull-request and full plans', async () => {
  const pullRequest = executionGroups(await plan(['catalog/guides/foundations-component-tokens.md']), { packages, environment: {}, pageIndex });
  const full = executionGroups(fullWorkspacePlan(), { packages, environment: {} });
  for (const groups of [pullRequest, full]) {
    const checks = groups.filter(({ id }) => id === 'checks' || id.startsWith('checks-'));
    assert.deepEqual(checks.map(({ id }) => id), ['checks-policy', 'checks-tooling', 'checks']);
    for (const group of checks) {
      assert.equal(group.kind, 'checks', group.id);
      assert.equal(group.timeoutMinutes, 30, group.id);
    }
    assert.deepEqual(groupMatrix(groups).filter(({ id }) => id.startsWith('checks')).map(({ id, kind, timeoutMinutes }) => [id, kind, timeoutMinutes]), [
      ['checks-policy', 'checks', 30], ['checks-tooling', 'checks', 30], ['checks', 'checks', 30],
    ]);
  }
});

// A pass reused for `checks-policy` or `checks-tooling` follows the same rules as any package group: its own id decides
// whether the changes since the tested commit route to it, and a changed command signature reruns it.
test('checks-policy and checks-tooling are reused and rerun independently of the other check groups', async () => {
  const signedGroups = async (paths, options = {}) => executionGroups(await plan(paths, options), { packages, environment: {}, pageIndex })
    .map(({ id, kind, commands }) => ({ id, kind, signature: groupSignature(commands), packageDirectories: groupPackageDirectories(commands, packages) }));
  const groups = await signedGroups(['catalog/guides/foundations-component-tokens.md']);
  assert.deepEqual(groups.map(({ id }) => id), ['checks-policy', 'checks-tooling', 'checks', 'browser-chromium']);
  const passed = earlierRun(3, Object.fromEntries(groups.map(({ id }) => [id, 'success'])), { groups });
  const decideAll = (delta, earlier = [passed], current = groups) => decide(earlier, delta, current);
  const reused = (decisions) => Object.fromEntries(decisions.map(({ id, reusedFrom }) => [id, reusedFrom !== '']));

  assert.deepEqual(reused(await decideAll(noDelta)), { 'checks-policy': true, 'checks-tooling': true, checks: true, 'browser-chromium': true });
  // A follow-up that routes only to `checks` leaves the two long suites reused.
  const docsOnly = { changedPaths: ['apps/docs/src/index.md'], groupIds: ['checks'], storyRuns: [], storyTooling: false };
  const afterDocs = await decideAll(docsOnly);
  assert.deepEqual(reused(afterDocs), { 'checks-policy': true, 'checks-tooling': true, checks: false, 'browser-chromium': true });
  assert.match(afterDocs.find(({ id }) => id === 'checks').reason, /affected since .*: changes (?:touch apps\/docs|route to checks)/u);
  // Each group reruns for its own id, never for a sibling's.
  for (const [id, others] of [['checks-tooling', ['checks-policy', 'checks']], ['checks-policy', ['checks-tooling', 'checks']]]) {
    const own = { changedPaths: ['x'], groupIds: [id], storyRuns: [], storyTooling: false };
    const decisions = await decideAll(own);
    assert.match(decisions.find((decision) => decision.id === id).reason, new RegExp(`changes route to ${id}`, 'u'));
    for (const other of others) assert.equal(reused(decisions)[other], true, `${other} stays reused when only ${id} is affected`);
  }

  // Planning the evidence tests changes the policy group's commands, so the earlier pass no longer applies; the rest stays reusable.
  const withEvidence = await signedGroups(['catalog/guides/foundations-component-tokens.md', 'tests/evidence/README.md']);
  const policyOnly = await signedGroups(['decisions/0028-release-proof.md']);
  assert.notEqual(policyOnly[0].signature, withEvidence[0].signature);
  const earlierPolicyOnly = earlierRun(4, { 'checks-policy': 'success' }, { groups: policyOnly });
  const regrouped = await decide([earlierPolicyOnly], noDelta, withEvidence.slice(0, 1));
  assert.deepEqual(outcome(regrouped), { 'checks-policy': 'signature changed' });

  // The reusable kind covers the new ids: a `checks` kind with no known package set never reuses.
  assert.match(affectedReason({ ...groups[0], packageDirectories: null }, docsOnly), /package set of checks-policy is unknown/u);
  assert.equal(affectedReason({ id: 'checks-policy', kind: 'checks', packageDirectories: [] }, docsOnly), null);
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
      components: [{ family: 'NumberField', export: 'NumberField', slug: 'number-field', source: 'packages/react/src/fields.ts' }],
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
    assert.deepEqual(delta.groupIds, ['checks-tooling', 'checks', 'browser-chromium', 'react', 'storybook-story']);
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
  [multiSelectPath]: 'export const MultiSelect = () => null;',
  [tagSelectPath]: 'export const TagSelect = () => null;',
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

test('a changed React module only files outside React source import routes to their owners', async () => {
  // PR #342: the Button fixture's import moves from ./button.mjs to ./button.ts. The fixture is no
  // family's source and no React module imports it; the playground and a React test do.
  const fixturePath = 'packages/react/src/button-fixture.mjs';
  const before = "import React from 'react';\nimport { Button } from './button.mjs';\nexport function R1ButtonFixture() { return React.createElement(Button); }\n";
  const after = before.replace("'./button.mjs'", "'./button.ts'");
  const changed = (references) => plan([fixturePath], {
    packages: workspacePackages,
    textSnapshots: { [fixturePath]: { before, after } },
    moduleSources: {
      ...generatorModuleSources,
      [fieldsPath]: 'export const NumberField = () => null;',
      [collectionsPath]: 'export const Tree = () => null;',
      'packages/react/src/button.mjs': { before: 'export const Button = () => null;', after: null },
      'packages/react/src/button.ts': { before: null, after: 'export const Button = (): null => null;' },
      [fixturePath]: { before, after },
    },
    findReferences: async (needle) => {
      assert.equal(needle, 'src/button-fixture.mjs');
      return references;
    },
  });

  const routed = await changed(['apps/react-playground/src/main.jsx', 'packages/react/test/fixture.test.mjs']);
  assert.deepEqual(routed.packageChecks, ['@muxui/react-playground']);
  assert.ok(routed.reactTestFiles.includes('test/fixture.test.mjs'));
  assert.deepEqual(routed.reactFamilies, []);
  assert.ok(routed.reasons.includes('apps/react-playground/src/main.jsx references changed packages/react/src/button-fixture.mjs; validate its owner'));

  // With no file importing it, the changed module is still unowned.
  await assert.rejects(changed([]), /MUXUI_CI_IMPACT_SOURCE_OWNERSHIP: changed module packages\/react\/src\/button-fixture\.mjs has no canonical family source or resolvable React importer/u);
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

test('an unchanged React manifest that names a changed module routes the React package check', async () => {
  // A script runs publish-guard.mjs, which no React module imports. Routing the unchanged
  // manifest as though it had changed failed the plan with MUXUI_CI_IMPACT_JSON_INVALID.
  const guardPath = 'packages/react/src/publish-guard.mjs';
  const before = "throw new Error('Use the release workflow to publish @muxui/react.');\n";
  const after = `// Blocks a manual publish.\n${before}`;
  const result = await plan([guardPath], {
    packages: workspacePackages,
    textSnapshots: { [guardPath]: { before, after } },
    moduleSources: { ...generatorModuleSources, [guardPath]: { before, after } },
    findReferences: async (needle) => {
      assert.equal(needle, 'src/publish-guard.mjs');
      return ['packages/react/package.json', 'packages/react/test/react-substrate.test.mjs'];
    },
  });
  assert.ok(result.packageChecks.includes('@muxui/react'));
  assert.ok(result.reactTestFiles.includes('test/react-substrate.test.mjs'));
  assert.equal(result.reactPackageFull, false);
  assert.ok(result.reasons.includes('packages/react/package.json names a changed React module in a script; run the React package check'));
});

test('the changed projection compiler takes the compiler route, not those of the files that name it', async () => {
  // A search for src/generate.mjs also finds every other package's generator and the retained
  // evidence logs; the compiler route already validates every React family, so they add nothing.
  const before = generatorModuleSources[generatePath];
  const after = `${before}\nexport const changed = true;`;
  const planned = (references) => plan([generatePath], {
    packages: workspacePackages,
    textSnapshots: { [generatePath]: { before, after } },
    moduleSources: { ...generatorModuleSources, [generatePath]: { before, after } },
    findReferences: async () => references,
  });
  const result = await planned(['packages/react/package.json', 'packages/catalog/package.json', 'tests/evidence/archive/g0.5/validation/pnpm-check.txt']);
  assert.equal(result.reactPackageFull, true);
  assert.deepEqual(result, await planned([]));
});

function playgroundLockfile(withRenderer) {
  return [
    "lockfileVersion: '9.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '',
    'importers:',
    '',
    '  apps/react-playground:',
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
  const lockfileBefore = playgroundLockfile(true);
  const lockfileAfter = playgroundLockfile(false);
  assert.deepEqual(changedLockfileImporters(lockfileBefore, lockfileAfter), ['apps/react-playground']);
  const result = await plan(['apps/react-playground/package.json', 'pnpm-lock.yaml'], {
    packages: workspacePackages, lockfileBefore, lockfileAfter,
  });
  assert.deepEqual(result.packageChecks, ['@muxui/react-playground']);
  assert.equal(result.full, false);
  assert.deepEqual(result.storyRuns, []);

  // A record removed without a dropped dependency that reached it is unexplained.
  const orphaned = lockfileBefore.replace('  scheduler@0.27.0: {}\n', '  scheduler@0.27.0: {}\n\n  orphan@1.0.0: {}\n');
  assert.throws(() => changedLockfileImporters(orphaned, lockfileAfter), /MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: .*orphan@1\.0\.0/u);
  // A removed record something still depends on is unexplained too.
  const dangling = playgroundLockfile(false).replace('  react@19.2.8:\n    dependencies:\n      scheduler: 0.27.0\n',
    '  react@19.2.8:\n    dependencies:\n      react-is: 19.2.8\n      scheduler: 0.27.0\n');
  assert.throws(() => changedLockfileImporters(lockfileBefore, dangling), /MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: importer apps\/react-playground reaches react-is@19\.2\.8, which has no snapshot record/u);
  // So is one still referenced only from a snapshot no importer reaches.
  const withOrphan = (source) => `${source}\n  orphan@1.0.0:\n    dependencies:\n      react-is: 19.2.8\n`;
  assert.throws(() => changedLockfileImporters(withOrphan(lockfileBefore), withOrphan(lockfileAfter)), /MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: existing package resolutions were removed/u);
});

test('a lockfile importer whose workspace package was removed plans the full workspace', async () => {
  const lockfileBefore = playgroundLockfile(false);
  const lockfileAfter = ["lockfileVersion: '9.0'", '', 'settings:', '  autoInstallPeers: true', '', 'importers:', '', 'packages:', '', 'snapshots:', ''].join('\n');
  assert.deepEqual(changedLockfileImporters(lockfileBefore, lockfileAfter), ['apps/react-playground']);

  const removed = await plan(['apps/react-playground/package.json', 'pnpm-lock.yaml'], {
    packages: packages.filter(({ name }) => name !== '@muxui/react-playground'), lockfileBefore, lockfileAfter,
  });
  assert.equal(removed.full, true);
  assert.deepEqual(removed.fullReasons, ['pnpm-lock.yaml drops the importer apps/react-playground, whose workspace package was removed']);

  // An importer dropped while its package stays in the workspace still routes to that package.
  const kept = await plan(['apps/react-playground/package.json', 'pnpm-lock.yaml'], { packages, lockfileBefore, lockfileAfter });
  assert.equal(kept.full, false);
  assert.deepEqual(kept.packageChecks, ['@muxui/react-playground']);
});

// Trimmed from the pnpm-lock.yaml diff of the @internationalized/date
// 3.12.3 to 3.12.4 pin: React reaches the date package directly and through
// react-aria; the playground shares only react and scheduler with it.
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
    '  apps/react-playground:',
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
  assert.deepEqual(changedLockfileImporters(base, scheduler), ['apps/react-playground', 'packages/react']);
  const integrity = base.replace('sha512-scheduler', 'sha512-scheduler-repacked');
  assert.deepEqual(changedLockfileImporters(base, integrity), ['apps/react-playground', 'packages/react']);
  // A package record maps through its peer-suffixed snapshot.
  const ariaIntegrity = base.replace('sha512-aria', 'sha512-aria-repacked');
  assert.deepEqual(changedLockfileImporters(base, ariaIntegrity), ['packages/react']);
  // An aliased dependency reaches its target record.
  const width = base.replace('  string-width@4.2.3: {}', '  string-width@4.2.3:\n    optional: true');
  assert.deepEqual(changedLockfileImporters(base, width), ['packages/react']);
});

test('lockfile consumer tracing follows optional dependencies and URL versions', () => {
  const withOptional = consumerLockfile()
    .replace("  apps/react-playground:\n    devDependencies:\n      react:\n        specifier: 19.2.8\n        version: 19.2.8\n",
      "  apps/react-playground:\n    devDependencies:\n      react:\n        specifier: 19.2.8\n        version: 19.2.8\n    optionalDependencies:\n      fsevents:\n        specifier: 2.3.3\n        version: 2.3.3\n")
    .replace('  orphan@1.0.0: {}', "  fsevents@2.3.3:\n    optionalDependencies:\n      nan: 2.22.0\n\n  nan@2.22.0: {}\n\n  orphan@1.0.0: {}");
  const nan = withOptional.replace('  nan@2.22.0: {}', '  nan@2.22.0:\n    optional: true');
  assert.deepEqual(changedLockfileImporters(withOptional, nan), ['apps/react-playground']);

  // Tarball and git versions are snapshot keys under the dependency's own name.
  for (const [name, version] of [
    ['@scope/x', 'https://registry.npmjs.org/@scope/x/-/x-1.0.0.tgz'],
    ['y', 'git+ssh://git@github.com/owner/y.git#0123456789abcdef'],
  ]) {
    const base = consumerLockfile()
      .replace("  apps/react-playground:\n    devDependencies:\n", `  apps/react-playground:\n    devDependencies:\n      '${name}':\n        specifier: ${version}\n        version: ${version}\n`)
      .replace('  orphan@1.0.0: {}', `  '${name}@${version}': {}\n\n  orphan@1.0.0: {}`);
    const scheduler = base.replace('sha512-scheduler', 'sha512-scheduler-repacked');
    assert.deepEqual(changedLockfileImporters(base, scheduler), ['apps/react-playground', 'packages/react'], name);
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
  assert.throws(() => changedLockfileImporters(base, dangling), /MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: importer (packages\/react|apps\/react-playground) reaches missing@1\.0\.0/u);
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
  const lockfileBefore = playgroundLockfile(true);
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
  assert.deepEqual(record.packageChecks, ['@muxui/figma', '@muxui/react-playground', '@muxui/tooling']);
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
  // Every React family changes, so React's runtime dependents run too, and the
  // catalog that compiles React's derived APIs runs its check.
  assert.equal(generatorInput.docs && generatorInput.scale, true);
  assert.deepEqual(generatorInput.packageChecks, ['@muxui/catalog', '@muxui/figma', '@muxui/react-playground']);

  // R1.0 inputs are also read by schema tests and Storybook unit tests.
  const upstreamExports = await route('catalog/react-r1-0/upstream-exports.json');
  assert.equal(upstreamExports.reactPackageFull, true);
  assert.equal(upstreamExports.policy, true);
  assert.deepEqual(upstreamExports.packageChecks, ['@muxui/catalog', '@muxui/figma', '@muxui/react-playground', '@muxui/schema']);
  assert.deepEqual(upstreamExports.storyUnitTests, [{ file: 'test/storybook.test.mjs' }]);

  const capability = await route('catalog/capabilities/query-baseline.json');
  assert.equal(capability.catalog, true);
  assert.deepEqual(capability.packageChecks, ['@muxui/tooling']);

  assert.deepEqual((await route('tests/fixtures/g0.5/corpus.json')).packageChecks, ['@muxui/tooling']);

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
  // The component Docs page and its catalog projection shape every family page, and run their own unit test.
  for (const path of ['.storybook/component-docs-page.mjs', 'src/component-docs.mjs']) {
    const docs = await route(`apps/react-storybook/${path}`);
    assert.deepEqual(docs.storyFamilies, main.storyFamilies, path);
    assert.deepEqual(docs.storyUnitTests, [{ file: 'test/component-docs.test.mjs' }], path);
  }
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

test('a generator whose base cannot run against the head helpers widens to the complete Storybook proof', async () => {
  const path = 'apps/react-storybook/src/generate-stories.mjs';
  const widened = await plan([path], {
    packages: workspacePackages,
    pageIndex: [...pageIndex, ...blockPages],
    textSnapshots: { [path]: { before: 'export const before = true;', after: 'export const after = true;' } },
    compareGeneratorEmissions: async () => ({ storyIds: [], baseRunFailed: true, reason: 'the base generator could not run against the head helpers (Error: helper changed), so its emissions cannot be compared' }),
  });
  assert.equal(widened.storyTooling, true);
  assert.deepEqual(widened.storyFamilies, ['MultiSelect', 'NumberField', 'TagSelect', 'Tree']);
  assert.deepEqual(widened.storyIds, [
    'muxui-block-poster-grid--css-grid',
    'muxui-block-poster-grid--virtualized',
    'muxui-block-task-filters--filter-bar',
  ]);
  assert.ok(widened.storyUnitTests.length >= 8);
  assert.equal(widened.notices.length, 1);
  assert.match(widened.notices[0], /^apps\/react-storybook\/src\/generate-stories\.mjs: the base generator could not run against the head helpers \(Error: helper changed\).*running the complete Storybook proof/u);
  assert.ok(widened.reasons.includes(widened.notices[0]));
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

// Decision 0031 item 13: the surface check moved from @muxui/web into this React test, so a change to
// anything it reads must still run it. It reads Button's record and React example, the token source,
// the React manifest `exports`, and the stylesheet generated from React's sources.
test('the React public-surface test runs for every input it reads', async () => {
  const surfaceTest = 'test/public-surface.test.mjs';
  const artifact = 'catalog/components/button/artifact.json';
  const exampleRecord = 'catalog/components/button/examples/react/basic.example.json';
  const exampleSource = 'catalog/components/button/examples/react/basic.tsx';
  const reactTests = await reactTestTexts();
  const buttonRecord = { family: 'Button', export: 'Button', slug: 'button', source: 'packages/react/src/button.mjs', parts: ['root', 'label'] };
  const buttonPage = (stories) => ({
    family: 'Button',
    storyFile: 'apps/react-storybook/.storybook/generated/button.stories.mjs',
    stories,
  });
  const unusedExample = { records: [...records, buttonRecord], pageIndex: [...pageIndex, buttonPage([])] };
  const usedExample = {
    records: [...records, buttonRecord],
    pageIndex: [...pageIndex, buttonPage([{ id: 'muxui-react-r1-1-button--basic', exportName: 'Basic', name: 'Basic', source: exampleSource }])],
  };
  const withButtonTests = {
    componentTestSources: {
      ...componentTestSources,
      [surfaceTest]: reactTests[surfaceTest],
      'test/fixture.test.mjs': reactTests['test/fixture.test.mjs'],
    },
  };
  const surfaceTestRuns = (result) => executionCommands(result, { packages })
    .some(({ args }) => args.at(-1) === surfaceTest && args.includes('--test'));

  // Button's record and its React example, when no story uses the example, run Button's component route,
  // which names every test of the file so the negative cases run too.
  for (const [path, options] of [[artifact, unusedExample], [exampleRecord, unusedExample], [exampleSource, unusedExample]]) {
    const result = await plan([path], { ...options, ...withButtonTests });
    assert.deepEqual(result.reactFamilies, ['Button'], path);
    assert.ok(result.reactComponentTests.includes(surfaceTest), path);
    assert.ok(result.reactComponentTestNames[surfaceTest].includes('the Button surface refuses a missing style export, a missing binding, and a non-component identity'), path);
    assert.equal(result.reactPackageFull, false, path);
  }

  // A story that uses the example source sends it to that page and not to Button's family,
  // so the test is planned on its own.
  const used = await plan([exampleSource], { ...usedExample, ...withButtonTests });
  assert.deepEqual(used.reactFamilies, []);
  assert.deepEqual(used.storyIds, ['muxui-react-r1-1-button--basic']);
  assert.ok(used.reactTestFiles.includes(surfaceTest));
  assert.equal(surfaceTestRuns(used), true);

  // The token source plans the React theme proof, not the full React check, so the test is planned beside it.
  const tokens = await plan(['catalog/tokens/default-theme.json'], withButtonTests);
  assert.equal(tokens.reactTheme, true);
  assert.equal(tokens.reactPackageFull, false);
  assert.ok(tokens.reactTestFiles.includes(surfaceTest));
  assert.equal(surfaceTestRuns(tokens), true);

  // A change to the manifest exports plans the full React check, whose test glob runs this file.
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/react/package.json'), 'utf8'));
  const exported = JSON.stringify({ ...manifest, exports: { ...manifest.exports, './surface.css': './generated/surface.css' } });
  const manifestChange = await plan(['packages/react/package.json'], {
    reactPackageBefore: JSON.stringify(manifest),
    reactPackageAfter: exported,
  });
  assert.equal(manifestChange.reactPackageFull, true);
  assert.ok(executionCommands(manifestChange, { packages }).some(({ args }) => args.join(' ') === '--filter @muxui/react run check'));
  const check = manifest.scripts.check;
  assert.match(check, /node --test 'test\/!\(/u);
  assert.doesNotMatch(check, /public-surface/u);

  // A change to the scanners or the surface compiler reruns it as a referencing test.
  for (const helper of ['compile-surface.mjs', 'scan-surface.mjs']) {
    const result = await plan([`packages/react/test/support/${helper}`], {
      reactTestReferenceSources: reactTests,
      textSnapshots: { [`packages/react/test/support/${helper}`]: { after: 'present' } },
    });
    assert.ok(result.reactTestFiles.includes(surfaceTest), helper);
  }
});

// The public types are held against the declarations from before the TypeScript moves (test/public-surface-baseline.test.mjs).
// Every change that can alter them must plan that test, and a change that cannot must not.
test('the public-surface check is planned for every change that can alter the public types', async () => {
  const surface = 'test/public-surface-baseline.test.mjs';
  const controls = 'test/public-surface-controls.test.mjs';
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/react/package.json'), 'utf8'));
  for (const file of [surface, controls]) assert.ok(existsSync(resolve(repositoryRoot, 'packages/react', file)), `${file} exists`);
  // The full React check's test glob excludes only the serial files, so it runs both.
  assert.match(manifest.scripts.check, /node --test 'test\/!\(capability-enrichment\|catalog-examples-types\|code-block\|code-block-highlight\|code-block-lifecycle\|code-block-package-boundary\)\.test\.mjs'/u);

  const reactCheck = (result) => executionCommands(result, { packages }).some(({ args }) => args.join(' ') === '--filter @muxui/react run check');
  const runs = (result) => {
    const commands = executionCommands(result, { packages });
    if (result.reactPackageFull || result.packageChecks.includes('@muxui/react')) return reactCheck(result);
    // A family check runs its selection, which includes the shared tests.
    if (result.reactComponentTests.includes(surface)) return commands.some(({ args }) => args.includes('check:component'));
    return commands.some(({ args }) => args.at(-1) === surface && args.includes('--test'));
  };
  const once = (result) => [result.reactTestFiles.includes(surface), result.reactComponentTests.includes(surface)].filter(Boolean).length <= 1;

  // A family source edit: the family check selects it as a shared test, and the plan does not run it twice.
  const family = await plan([collectionsPath], treeRuntimeChange);
  assert.deepEqual(family.reactFamilies, ['Tree']);
  assert.ok(family.reactComponentTests.includes(surface));
  assert.ok(runs(family) && once(family));

  // A type-only edit affects no family, so only the source route can plan it.
  const sliderPath = 'packages/react/src/color-slider.ts';
  const before = 'export const ColorSlider = /* @__PURE__ */ (() => () => null)();\n';
  const after = 'export const ColorSlider = (() => () => null)();\n';
  const typeOnly = await plan([sliderPath], {
    records: [...records, { family: 'ColorSlider', export: 'ColorSlider', slug: 'color-slider', source: sliderPath, parts: ['root'] }],
    textSnapshots: { [sliderPath]: { before, after } },
    moduleSources: { ...cssModuleSources, [sliderPath]: { before, after } },
  });
  assert.deepEqual(typeOnly.reactFamilies, []);
  assert.ok(typeOnly.reactTestFiles.includes(surface) && runs(typeOnly));

  // A declaration-only edit, the generator, and the manifest exports plan the full React check.
  for (const path of ['packages/react/src/supplemental/index.d.ts', 'packages/react/src/generate.mjs']) {
    const result = await plan([path]);
    assert.equal(result.reactPackageFull, true, path);
    assert.ok(runs(result), path);
  }
  const exported = JSON.stringify({ ...manifest, exports: { ...manifest.exports, './surface.css': './generated/surface.css' } });
  const exportMap = await plan(['packages/react/package.json'], { reactPackageBefore: JSON.stringify(manifest), reactPackageAfter: exported });
  assert.equal(exportMap.reactPackageFull, true);
  assert.ok(runs(exportMap));

  // A bump of @types/react or either compiler, development dependencies of the package, plans the package check;
  // react-dom is a peer dependency, so it is a runtime boundary change.
  for (const [field, name] of [['devDependencies', '@types/react'], ['devDependencies', 'typescript'], ['devDependencies', 'typescript-6'], ['peerDependencies', 'react-dom']]) {
    const bumped = JSON.stringify({ ...manifest, [field]: { ...manifest[field], [name]: '99.0.0' } });
    const result = await plan(['packages/react/package.json'], { reactPackageBefore: JSON.stringify(manifest), reactPackageAfter: bumped });
    assert.ok(runs(result), `${name} bump`);
    assert.ok(result.reactPackageFull || result.packageChecks.includes('@muxui/react'), name);
  }

  // The fixture and the harness plan the check without widening to the full React proof; the harness plans its controls too.
  for (const [path, tests] of [
    ['packages/react/test/fixtures/public-surface-baseline/lightbox.d.ts', [surface]],
    ['packages/react/test/fixtures/public-surface-baseline/provenance.json', [surface]],
    ['packages/react/test/fixtures/public-surface-accepted.json', [surface]],
    ['packages/react/test/fixtures/public-surface-inventory.json', [surface]],
    ['packages/react/test/support/public-surface-probes.mjs', [controls, surface]],
    ['packages/react/test/support/public-surface-snapshots.mjs', [controls, surface]],
    ['packages/react/test/support/public-surface-subjects.mjs', [controls, surface]],
    ['packages/react/test/support/declaration-surface.mjs', [controls, surface]],
  ]) {
    const result = await plan([path], { textSnapshots: { [path]: { before: 'before\n', after: 'after\n' } }, reactTestReferenceSources: await reactTestTexts() });
    assert.equal(result.reactPackageFull, false, path);
    for (const test of tests) assert.ok(result.reactTestFiles.includes(test), `${path} plans ${test}`);
    assert.deepEqual(result.notices, [], path);
  }

  // Documentation and a catalog guide cannot change the public types.
  for (const path of ['apps/docs/src/content/docs/index.mdx', 'catalog/guides/accessibility.md']) {
    const result = await plan([path]);
    assert.equal(result.reactPackageFull, false, path);
    assert.ok(!result.reactTestFiles.includes(surface) && !result.reactComponentTests.includes(surface) && !result.packageChecks.includes('@muxui/react'), path);
    assert.ok(!executionCommands(result, { packages }).some(({ args }) => args.includes(surface)), path);
  }
});

// The token source behind ./themes generates the MuxUIStandardThemeId and MuxUIMonochromeThemeId unions of
// themes.d.ts, so a preset ID change alters the public types and nothing under packages/react/src changes.
test('a preset ID change in the token source plans the public-surface check', async () => {
  const surface = 'test/public-surface-baseline.test.mjs';
  const tokenPath = 'catalog/tokens/default-theme.json';
  const after = readFileSync(resolve(repositoryRoot, tokenPath), 'utf8');
  const [{ id }] = JSON.parse(after).theme.scale.standardPresets;
  const before = after.replace(`"${id}"`, `"${id}-review"`);
  assert.notEqual(before, after, 'fixture must rename a preset ID');
  const result = await plan([tokenPath], { textSnapshots: { [tokenPath]: { before, after } } });
  assert.ok(result.reactTestFiles.includes(surface));
  assert.equal(result.reactPackageFull, false);
  assert.ok(executionCommands(result, { packages }).some(({ args }) => args.at(-1) === surface && args.includes('--test')));
});

// Every catalog file the generator reads by name must plan the check, or the full React check that runs it: a
// catalog input the generator starts reading cannot silently skip the public types it may now change. A component
// artifact routes through its family, whose check selects the shared test (see the family case above).
test('every catalog file the React generator names plans the public-surface check', async () => {
  const surface = 'test/public-surface-baseline.test.mjs';
  const sources = ['packages/react/src/generate.mjs', 'packages/react/src/supplemental-mapping.mjs'].map((path) => readFileSync(resolve(repositoryRoot, path), 'utf8'));
  const named = [...new Set(sources.flatMap((source) => [...source.matchAll(/'(catalog\/[^'$]+\.json)'/gu)].map((match) => match[1])))]
    .filter((path) => !path.startsWith('catalog/components/')).sort();
  assert.ok(named.includes('catalog/tokens/default-theme.json') && named.includes('catalog/react-r1-6/supplemental-components.json'), 'the scan finds the generator inputs');
  for (const path of named) {
    assert.ok(existsSync(resolve(repositoryRoot, path)), `${path} exists`);
    const result = await plan([path], edited(path));
    const commands = executionCommands(result, { packages });
    const runs = commands.some(({ args }) => args.join(' ') === '--filter @muxui/react run check')
      || commands.some(({ args }) => args.at(-1) === surface && args.includes('--test'))
      || result.reactComponentTests.includes(surface);
    assert.ok(runs, `${path} plans the public-surface check`);
  }
});

test('reactTestInputs names the test files and inputs they read', async () => {
  const inputsByTest = config.reactTestInputs;
  assert.ok(Object.keys(inputsByTest).length > 0);
  for (const [testFile, inputs] of Object.entries(inputsByTest)) {
    const source = readFileSync(resolve(repositoryRoot, 'packages/react', testFile), 'utf8');
    for (const input of inputs) {
      assert.ok(existsSync(resolve(repositoryRoot, input)), `${input} exists`);
      assert.ok(source.includes(input), `${testFile} names ${input}`);
    }
    // The other direction: a catalog input the test reads but the config omits would not rerun it.
    const read = [...source.matchAll(/'(catalog\/[^']+\.(?:json|tsx))'/gu)].map((match) => match[1]);
    assert.ok(read.length > 0, `${testFile} reads catalog inputs`);
    assert.deepEqual(read.filter((input) => !inputs.includes(input)), [], `${testFile} reads inputs the config omits`);
  }
});

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
  // Tree is moved into fields.ts here because the fixture has focused Tree tests.
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

test('catalog edits run the tooling package check but not the React package check', async () => {
  for (const path of ['catalog/guides/accessibility.md', 'packages/catalog/src/compiler.mjs']) {
    const result = await plan([path], { packages: workspacePackages });
    const commands = executionCommands(result, { packages: workspacePackages }).map(({ args }) => args.join(' '));
    assert.ok(!commands.includes('--filter @muxui/react run check'), path);
    assert.equal(result.reactPackageFull, false, path);
    assert.ok(result.packageChecks.includes('@muxui/tooling'), path);
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
    assert.deepEqual(result.packageChecks, ['@muxui/tooling'], path);
    assert.deepEqual(result.reactFamilies, [], path);
    assert.equal(result.tokens || result.reactTheme || result.reactPackageFull, false, path);
    // Only the record names participants, so only it changes a component's Used in blocks.
    assert.equal(result.storyTooling, path.endsWith('/artifact.json'), path);
    assert.equal(
      result.reasons[0],
      `${path} is a canonical pattern input; validate the catalog, its dense goldens, the docs that render it, and its Storybook pages and ${browserTest}`,
    );
    // The packed React example type test now enumerates pattern variants, so a variant source joins it
    // (E-BL1-03); the pattern's own browser test runs for every input of an interactive pattern.
    assert.deepEqual(
      result.reactTestFiles,
      [browserTest, ...(path.endsWith('.tsx') ? ['test/catalog-examples-types.test.mjs'] : [])],
      path,
    );
  }
  // A pattern with no pattern-<slug>.test.mjs adds none.
  const hero = await plan(['catalog/patterns/hero/examples/react/centered.tsx']);
  assert.deepEqual(hero.reactTestFiles, ['test/catalog-examples-types.test.mjs']);
  const commands = executionCommands(await plan([inputs[2]], { packages: workspacePackages }), { packages: workspacePackages })
    .map(({ args }) => args.join(' '));
  assert.ok(commands.includes('--filter @muxui/catalog run check'));
  assert.ok(commands.includes('--filter @muxui/tooling run check'));
  assert.ok(commands.includes('--filter @muxui/react exec node --test --test-concurrency=1 test/catalog-examples-types.test.mjs'));
  assert.ok(commands.includes(`--filter @muxui/react exec node --test --test-concurrency=1 ${browserTest}`));
});

test('a new block adds its browser test by adding the file, with no policy entry', () => {
  // The planner reads the checkout named by MUXUI_TASK_REPOSITORY_ROOT when it loads, so plan in a process pointed at a fixture.
  const root = mkdtempSync(join(tmpdir(), 'muxui-block-test-'));
  try {
    mkdirSync(join(root, 'packages/react/test/browser'), { recursive: true });
    writeFileSync(join(root, 'packages/react/test/browser/pattern-fresh-block.test.mjs'), '');
    const script = `const { buildPullRequestImpact } = await import(${JSON.stringify(resolve(import.meta.dirname, '../src/ci-impact.mjs'))});
      const { readFileSync } = await import('node:fs');
      const plan = await buildPullRequestImpact({ ...JSON.parse(readFileSync(process.env.INPUT_PATH, 'utf8')), readBaseText: async () => null, readHeadText: async () => null });
      console.log(JSON.stringify(plan.reactTestFiles));`;
    const changedPaths = ['catalog/patterns/fresh-block/artifact.json', 'catalog/patterns/plain-block/artifact.json'];
    // The input is a file, not an environment variable: Linux caps one environment string at 128 KiB.
    const inputPath = join(root, 'input.json');
    writeFileSync(inputPath, JSON.stringify(inputFor(changedPaths)));
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root, encoding: 'utf8', env: { ...process.env, MUXUI_TASK_REPOSITORY_ROOT: root, INPUT_PATH: inputPath },
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    // The block with a test file routes it; the block without one routes nothing.
    assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)), ['test/browser/pattern-fresh-block.test.mjs']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    MUXUI_STORYBOOK_A11Y_WORKERS: '2',
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
    // The Block's browser test is cross-engine, so it runs once in each engine.
    const runs = reactBrowserRuns(executionCommands(result, { packages, environment: {} }));
    assert.deepEqual(runs.filter((run) => run.endsWith(posterGridBrowserTest)).sort(), [
      `chromium ${posterGridBrowserTest}`, `firefox ${posterGridBrowserTest}`, `webkit ${posterGridBrowserTest}`,
    ], change);
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

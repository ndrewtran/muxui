import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  buildPullRequestImpact,
  changedLockfileImporters,
  executeCommand,
  executeCommands,
  executionCommands,
  executionGroups,
  executionMode,
  fullWorkspacePlan,
  groupMatrix,
  groupPackageDirectories,
  isPolicyOnlyLockfileChange,
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
import { dependencyClosure } from '../src/scoped-verification.mjs';
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

const packages = [
  { name: '@muxui/catalog', path: 'packages/catalog', manifest: { dependencies: { '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/docs', path: 'apps/docs', manifest: { dependencies: { '@muxui/catalog': 'workspace:*', '@muxui/react': 'workspace:*', '@muxui/tooling': 'workspace:*' }, scripts: { check: 'node ../../tooling/audits/repository-policy/src/prepare-prerequisites.mjs @muxui/docs^... && check' } } },
  { name: '@muxui/react', path: 'packages/react', manifest: { dependencies: { '@muxui/catalog': 'workspace:*', '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { generate: 'generate', check: 'check', 'check:component': 'node ../../tooling/audits/repository-policy/src/run-component-check.mjs' } } },
  { name: '@muxui/react-storybook', path: 'apps/react-storybook', manifest: { dependencies: { '@muxui/react': 'workspace:*', '@muxui/tokens': 'workspace:*' }, scripts: { generate: 'generate', 'check:scoped': 'node src/check-scoped.mjs' } } },
  { name: '@muxui/repository-policy', path: 'tooling/audits/repository-policy', manifest: { dependencies: { '@muxui/schema': 'workspace:*', '@muxui/tokens': 'workspace:*', '@muxui/tooling': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/scale', path: 'apps/scale', manifest: { dependencies: { '@muxui/react': 'workspace:*' }, scripts: { check: 'node ../../tooling/audits/repository-policy/src/prepare-prerequisites.mjs @muxui/react... && check' } } },
  { name: '@muxui/schema', path: 'packages/schema', manifest: { dependencies: {}, scripts: { generate: 'generate', check: 'check' } } },
  { name: '@muxui/tooling', path: 'packages/tooling', manifest: { dependencies: {}, scripts: { generate: 'generate' } } },
  { name: '@muxui/tokens', path: 'packages/tokens', manifest: { dependencies: { '@muxui/schema': 'workspace:*' }, scripts: { generate: 'generate', check: 'check' } } },
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

test('token changes request compiler and theme contrast proof without behavior or documentation audits', async () => {
  const result = await plan(['catalog/tokens/default-theme.json']);

  assert.equal(result.catalog, true);
  assert.equal(result.tokens, true);
  assert.equal(result.reactTheme, true);
  assert.equal(result.storyTheme, true);
  assert.equal(result.docs, false);
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
  assert.deepEqual(result.packageChecks, ['@muxui/tooling']);
  assert.equal(result.tokens || result.reactTheme || result.reactPackageFull || result.storyTooling || result.policy, false);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.storyRuns, []);
  assert.deepEqual(result.reasons, [
    `${path} is a canonical guide; validate the catalog, its dense goldens, and the docs that render it`,
  ]);
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['checks', 'browser']);
  assert.deepEqual(groups[0].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/catalog', 'run', 'check'],
    ['--filter', '@muxui/docs', 'run', 'check'],
    ['--filter', '@muxui/tooling', 'run', 'check'],
  ]);
});

test('per-family usage guides take the guide route without selecting their component family', async () => {
  const result = await plan(['catalog/guides/number-field-usage.md', 'catalog/guides/number-field-usage.json']);

  assert.equal(result.catalog && result.docs, true);
  assert.deepEqual(result.packageChecks, ['@muxui/tooling']);
  assert.deepEqual(result.reactFamilies, []);
  assert.deepEqual(result.storyRuns, []);
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
    const browser = groups.find(({ id }) => id === 'browser');
    assert.ok(browser, path);
    const command = browser.commands.find(({ args }) => args.includes('check:browser:docs'));
    assert.deepEqual(command?.args, ['--filter', '@muxui/scale', 'run', 'check:browser:docs'], path);
    assert.notEqual(command.prerequisite, true, path);
    assert.ok(!browser.commands.some(({ args }) => args.includes('build')), path);
  }
  const policy = executionGroups(await plan(['.github/workflows/ci.yml']), { packages, environment: {}, pageIndex });
  assert.ok(!policy.some(({ id }) => id === 'browser'));
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
  assert.deepEqual(catalogCommands.map(({ prerequisite }) => prerequisite === true), [true, false]);
});

test('clean owner checks schedule only their generation dependencies before checks', async () => {
  const catalog = await plan(['packages/catalog/src/compiler.mjs']);
  const catalogCommands = executionCommands(catalog, { packages });
  assert.deepEqual(catalog.generationPackages, [
    '@muxui/catalog', '@muxui/schema', '@muxui/tokens',
  ]);
  assert.deepEqual(catalogCommands[0].args, [
    '--recursive', '--sort', '--workspace-concurrency=1', '--if-present',
    '--filter', '@muxui/catalog', '--filter', '@muxui/schema', '--filter', '@muxui/tokens', 'run', 'generate',
  ]);
  assert.deepEqual(catalogCommands[1].args, ['--filter', '@muxui/catalog', 'run', 'check']);

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
    '--filter', '@muxui/tooling', '--filter', '@muxui/tokens', 'run', 'generate',
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
  assert.match(indexUnit.args.find((arg) => arg.startsWith('--test-name-pattern=')), /storybook page index requests honor cancellation/u);
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

test('unknown owners, missing exact page metadata, and empty diffs fail closed', async () => {
  await assert.rejects(plan(['scripts/unowned-change.mjs']), /MUXUI_CI_IMPACT_OWNER_MISSING/u);
  await assert.rejects(plan(['catalog/components/number-field/examples/react/unknown.tsx']), /MUXUI_CI_IMPACT_STORY_PAGE_MISSING/u);
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
  assert.deepEqual(groupIds(groups), ['checks', 'react', 'storybook-component']);
  const generation = executionCommands(result, { packages })[0];
  assert.equal(generation.prerequisite, true);
  for (const group of groups) assert.deepEqual(group.commands[0], generation, `${group.id} starts with generation`);
  assert.deepEqual(groups[0].commands.slice(1).map(({ args }) => args), [
    ['--filter', '@muxui/repository-policy', 'run', 'check'],
    ['--filter', '@muxui/react-storybook', 'run', 'generate:check'],
  ]);
  assert.ok(groups[1].commands.some(({ args }) => args.includes('check:component')));
  assert.equal(groups[2].commands.at(-1).env.MUXUI_STORYBOOK_FAMILIES, 'Tree');
  assert.deepEqual(groupMatrix(groups).map(({ id, kind }) => [id, kind]), [
    ['checks', 'checks'], ['react', 'react'], ['storybook-component', 'storybook'],
  ]);

  const tokens = executionGroups(await plan(['catalog/tokens/default-theme.json']), { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(tokens), ['checks', 'react', 'storybook-theme', 'storybook-chrome', 'tailwind']);
  assert.deepEqual(tokens.at(-1).commands.slice(1).map(({ prerequisite }) => prerequisite === true), [true, false]);
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

test('story-only groups generate Storybook metadata unless this process already prepared it', async () => {
  const result = await plan([sizingExamplePath]);
  const groups = executionGroups(result, { packages, environment: {}, pageIndex });
  assert.deepEqual(groupIds(groups), ['checks', 'storybook-story']);
  for (const group of groups) {
    assert.equal(group.commands[0].prerequisite, true);
    assert.ok(generationFilters(group.commands[0]).includes('@muxui/react-storybook'), `${group.id} generates Storybook`);
  }

  const prepared = executionGroups(result, { packages, environment: {}, pageIndex, metadataPrepared: true });
  assert.deepEqual(groupIds(prepared), groupIds(groups));
  assert.ok(!prepared.flatMap(({ commands }) => commands).some(({ prerequisite }) => prerequisite), 'metadata preparation already generated the closure');
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
  assert.deepEqual(groupIds(groups), ['checks', 'react', 'browser', 'storybook-a11y', 'storybook', 'tailwind']);
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
  assert.deepEqual(byId.browser, [
    '--filter @muxui/scale run check:browser', '--filter @muxui/react run check:browser',
    '--filter @muxui/scale run check:browser:docs',
  ]);
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
  assert.match(affectedReason({ ...react, id: 'browser', kind: 'browser', packageDirectories: [] }, numberField), /react/u);
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
    assert.deepEqual(delta.groupIds, ['checks', 'browser', 'storybook-story']);
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

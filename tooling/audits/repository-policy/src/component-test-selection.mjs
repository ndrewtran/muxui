import { parse } from 'acorn';

const SHARED_TESTS = Object.freeze([
  'test/style-scopes.test.mjs',
  'test/styling-tokens.test.mjs',
]);

const SOURCE_ROUTES = Object.freeze({
  button: ['test/fixture.test.mjs'],
  components: ['test/components.test.mjs'],
  fields: ['test/fields.test.mjs', 'test/r1-2-parity.test.mjs', 'test/browser/form-fields.test.mjs'],
  collections: ['test/r1-3-parity.test.mjs'],
  overlays: ['test/r1-4-overlays.test.mjs'],
  markdown: ['test/heavy-components.test.mjs'],
  'text-editor': ['test/heavy-components.test.mjs'],
});

const FAMILY_ROUTES = Object.freeze({
  Activity: ['test/activity.test.mjs', 'test/browser/activity.test.mjs', 'test/browser/candidate-motion.test.mjs'],
  DataDiff: ['test/data-diff.test.mjs', 'test/browser/data-diff.test.mjs', 'test/browser/candidate-motion.test.mjs'],
  Message: ['test/message.test.mjs', 'test/browser/message.test.mjs', 'test/browser/candidate-motion.test.mjs'],
  PromptComposer: ['test/prompt-composer.test.mjs', 'test/browser/prompt-composer.test.mjs', 'test/browser/candidate-motion.test.mjs'],
  Autocomplete: ['test/browser/autocomplete-dismissal.test.mjs'],
  Avatar: ['test/image-avatar.test.mjs'],
  CodeBlock: ['test/code-block.test.mjs', 'test/code-block-highlight.test.mjs', 'test/code-block-lifecycle.test.mjs', 'test/code-block-package-boundary.test.mjs', 'test/browser/code-block.test.mjs', 'test/browser/candidate-motion.test.mjs'],
  ColorPicker: ['test/color-swatch.test.mjs'],
  ColorSwatch: ['test/color-swatch.test.mjs'],
  CommandPalette: ['test/command-palette-hook.test.mjs'],
  GridList: ['test/browser/grid-list-layout.test.mjs'],
  IconButton: ['test/icon-button.test.mjs'],
  Image: ['test/image-avatar.test.mjs'],
  Lightbox: ['test/heavy-components.test.mjs'],
  Markdown: ['test/heavy-components.test.mjs'],
  ProgressCircle: ['test/progress-circle.test.mjs'],
  Resizable: ['test/heavy-components.test.mjs'],
  SelectNative: ['test/select-native.test.mjs'],
  Table: ['test/browser/table-sort-indicator.test.mjs'],
  Text: ['test/text.test.mjs'],
  TextEditor: ['test/heavy-components.test.mjs', 'test/browser/text-editor-selection-actions.test.mjs'],
  TagSelect: ['test/browser/tag-select-focus.test.mjs'],
  Tree: ['test/browser/tree-toggle-browser.test.mjs'],
  Virtualizer: ['test/browser/virtualizer-grid.test.mjs'],
});

const FAMILY_TEST_NAMES = Object.freeze({
  TagSelect: {
    'test/supplemental.test.mjs': [
      'TagSelect preserves combobox filtering and chip focus/removal keyboard behavior',
      'TagSelect preserves selected-key order for controlled chips and removals',
    ],
  },
  Tree: {
    'test/r1-3-parity.test.mjs': [
      'R1.3 Tree flattens nested items for keyboard collection semantics',
    ],
  },
});

// The test files a family routes to directly, without its shared source group.
export function familyRouteFiles(family) {
  return [...new Set([...(FAMILY_ROUTES[family] ?? []), ...Object.keys(FAMILY_TEST_NAMES[family] ?? {})])];
}

function sourceRoute(record) {
  const source = record.source ?? '';
  if (source.endsWith('/supplemental/index.mjs')) return ['test/supplemental.test.mjs'];
  const sourceName = source.split('/').at(-1)?.replace(/\.mjs$/u, '');
  return SOURCE_ROUTES[sourceName] ?? [];
}

export function componentTestRoute(record, { includeSharedSource = true } = {}) {
  const familyTestFiles = Object.keys(FAMILY_TEST_NAMES[record.family] ?? {});
  const route = [
    ...(FAMILY_ROUTES[record.family] ?? []),
    ...familyTestFiles,
    ...(includeSharedSource ? sourceRoute(record) : []),
  ];
  if (route.length === 0) {
    const code = includeSharedSource ? 'MUXUI_COMPONENT_TEST_ROUTE_MISSING' : 'MUXUI_COMPONENT_FOCUSED_ROUTE_MISSING';
    throw new Error(`${code}: ${record.family} (${record.source ?? 'no source'}); add a verified family test route`);
  }
  return [...new Set(route)];
}

function testTitles(source, file) {
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (error) {
    throw new Error(`MUXUI_COMPONENT_TEST_SOURCE_INVALID: ${file}: ${error.message}`);
  }
  const titles = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && ['test', 'it'].includes(node.callee.name)) {
      const title = node.arguments[0];
      if (title?.type === 'Literal' && typeof title.value === 'string') titles.push(title.value);
    }
    for (const [key, value] of Object.entries(node)) {
      if (!['start', 'end', 'loc', 'range'].includes(key) && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return [...new Set(titles)];
}

function familyWords(family) {
  return String(family).replace(/([a-z0-9])([A-Z])/gu, '$1 $2').toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
}

function familyTestNames(family, source, file) {
  const words = familyWords(family);
  const titles = testTitles(source, file);
  return titles.filter((title) => {
    const titleWords = familyWords(title);
    return titleWords.some((_, index) => words.every((word, offset) => titleWords[index + offset] === word));
  });
}

export function componentTestSelection(records, availableFiles, {
  includeSharedSource = true,
  testSources = {},
  behaviorProofFamilies = [],
} = {}) {
  const available = new Set(availableFiles);
  const behaviorProofs = new Set(behaviorProofFamilies);
  const selectedBehaviorProofs = new Set();
  const selected = new Set();
  const namedFiles = new Map();
  for (const record of records) {
    const sourceFiles = sourceRoute(record);
    const explicitRoute = new Set(FAMILY_ROUTES[record.family] ?? []);
    const familyNames = FAMILY_TEST_NAMES[record.family] ?? {};
    const route = [...(FAMILY_ROUTES[record.family] ?? [])];
    for (const [file, names] of Object.entries(familyNames)) {
      if (includeSharedSource || explicitRoute.has(file)) continue;
      route.push(file);
      const existing = namedFiles.get(file) ?? new Set();
      names.forEach((name) => existing.add(name));
      namedFiles.set(file, existing);
    }

    if (includeSharedSource) route.push(...sourceFiles);
    else {
      for (const file of route) {
        const source = testSources[file];
        if (!source) continue;
        const names = familyTestNames(record.family, source, file);
        if (names.length === 0) continue;
        const existing = namedFiles.get(file) ?? new Set();
        names.forEach((name) => existing.add(name));
        namedFiles.set(file, existing);
      }
      for (const file of sourceFiles) {
        const source = testSources[file];
        if (!source) continue;
        const names = familyTestNames(record.family, source, file);
        if (names.length === 0) continue;
        route.push(file);
        const existing = namedFiles.get(file) ?? new Set();
        names.forEach((name) => existing.add(name));
        namedFiles.set(file, existing);
      }
    }

    const uniqueRoute = [...new Set(route)];
    if (uniqueRoute.length === 0 && !includeSharedSource && !behaviorProofs.has(record.family)) {
      throw new Error(`MUXUI_COMPONENT_FOCUSED_ROUTE_MISSING: ${record.family}; no named React case or verified Storybook BrowserProof is available`);
    }
    if (uniqueRoute.length === 0 && !includeSharedSource) selectedBehaviorProofs.add(record.family);
    for (const file of uniqueRoute) {
      if (!available.has(file)) throw new Error(`MUXUI_COMPONENT_TEST_ROUTE_FILE_MISSING: ${record.family}: ${file}`);
      selected.add(file);
    }
  }
  const missingShared = SHARED_TESTS.filter((file) => !available.has(file));
  if (missingShared.length > 0) throw new Error(`MUXUI_COMPONENT_TEST_SHARED_FILE_MISSING: ${missingShared.join(', ')}`);
  SHARED_TESTS.forEach((file) => selected.add(file));
  const files = [...selected].sort();
  return {
    files,
    behaviorProofFamilies: [...selectedBehaviorProofs].sort(),
    testNamesByFile: Object.fromEntries([...namedFiles].map(([file, names]) => [file, [...names].sort()])),
  };
}

/** Resolve existing behavioral test groups for canonical component records. */
export function selectComponentTestFiles(records, availableFiles, options) {
  return componentTestSelection(records, availableFiles, options).files;
}

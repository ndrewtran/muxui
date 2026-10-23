import { parse } from 'acorn';

// Every family check runs these: the style integrity tests, and the public types against the declarations from
// before the TypeScript moves, which any family's TypeScript can change.
export const SHARED_TESTS = Object.freeze([
  'test/public-surface-baseline.test.mjs',
  'test/style-scopes.test.mjs',
  'test/styling-tokens.test.mjs',
]);

const SOURCE_ROUTES = Object.freeze({
  button: ['test/fixture.test.mjs'],
  components: ['test/components.test.mjs'],
  fields: ['test/fields.test.mjs', 'test/browser/form-fields.test.mjs'],
  calendar: ['test/r1-3-parity.test.mjs'],
  'color-swatch': ['test/r1-3-parity.test.mjs'],
  'color-field': ['test/r1-3-parity.test.mjs'],
  'color-area': ['test/r1-3-parity.test.mjs'],
  'color-slider': ['test/r1-3-parity.test.mjs'],
  'color-wheel': ['test/r1-3-parity.test.mjs'],
  'color-picker': ['test/r1-3-parity.test.mjs'],
  'color-swatch-picker': ['test/r1-3-parity.test.mjs'],
  'list-box': ['test/r1-3-parity.test.mjs'],
  'grid-list': ['test/r1-3-parity.test.mjs'],
  virtualizer: ['test/r1-3-parity.test.mjs'],
  menu: ['test/r1-3-parity.test.mjs'],
  select: ['test/r1-3-parity.test.mjs'],
  'combo-box': ['test/r1-3-parity.test.mjs'],
  'radio-group': ['test/r1-3-parity.test.mjs'],
  slider: ['test/r1-3-parity.test.mjs'],
  table: ['test/r1-3-parity.test.mjs'],
  tabs: ['test/r1-3-parity.test.mjs'],
  'tag-group': ['test/r1-3-parity.test.mjs'],
  'toggle-button-group': ['test/r1-3-parity.test.mjs'],
  'token-field': ['test/r1-3-parity.test.mjs'],
  toolbar: ['test/r1-3-parity.test.mjs'],
  tree: ['test/r1-3-parity.test.mjs'],
  // The supplemental family modules. A family's source names the module that declares it, not the barrel.
  text: ['test/supplemental.test.mjs'],
  'button-group': ['test/supplemental.test.mjs'],
  'color-mode-toggle': ['test/supplemental.test.mjs'],
  'progress-circle': ['test/supplemental.test.mjs'],
  card: ['test/supplemental.test.mjs'],
  'checkbox-field': ['test/supplemental.test.mjs'],
  'radio-field': ['test/supplemental.test.mjs'],
  'switch-field': ['test/supplemental.test.mjs'],
  overlays: ['test/r1-4-overlays.test.mjs'],
  markdown: ['test/heavy-components.test.mjs'],
  'text-editor': ['test/heavy-components.test.mjs'],
});

// Guards on how the collections modules fit together and bundle. A change that only drops a pure
// annotation affects no family, so family routing never selects them; any change to a collections
// module does. Its modules are the barrel, the helpers the families share, and the family modules,
// which are the SOURCE_ROUTES keys that route to the R1.3 parity group.
const COLLECTIONS_GUARD_TESTS = Object.freeze(['test/collections-modules.test.mjs', 'test/tree-shaking.test.mjs']);
const COLLECTIONS_SHARED_MODULES = Object.freeze(['collections', 'control-utils', 'collection-items', 'read-only-guard', 'color-context', 'collection-trigger', 'grid-virtualizer-context']);

/** The guard tests a changed React source file selects whatever families it affects. */
export function sourceGuardTests(path) {
  const name = /^packages\/react\/src\/([\w-]+)\.(?:mjs|ts)$/u.exec(path)?.[1];
  const collections = name !== undefined && (COLLECTIONS_SHARED_MODULES.includes(name)
    || (Object.hasOwn(SOURCE_ROUTES, name) && SOURCE_ROUTES[name].includes('test/r1-3-parity.test.mjs')));
  return collections ? COLLECTIONS_GUARD_TESTS : [];
}

// Tests that belong to a family but are not named for its slug. The slug-named
// pair (`test/<slug>.test.mjs`, `test/browser/<slug>.test.mjs`) is found by
// convention and needs no entry here.
const FAMILY_EXTRA_TESTS = Object.freeze({
  Activity: ['test/browser/candidate-motion.test.mjs'],
  DataDiff: ['test/browser/candidate-motion.test.mjs'],
  Message: ['test/browser/candidate-motion.test.mjs'],
  PromptComposer: ['test/browser/candidate-motion.test.mjs'],
  Autocomplete: ['test/browser/autocomplete-dismissal.test.mjs'],
  Avatar: ['test/image-avatar.test.mjs'],
  Button: ['test/public-surface.test.mjs'],
  CodeBlock: ['test/code-block-highlight.test.mjs', 'test/code-block-lifecycle.test.mjs', 'test/code-block-package-boundary.test.mjs', 'test/browser/candidate-motion.test.mjs'],
  ColorPicker: ['test/color-swatch.test.mjs'],
  ColorSwatch: ['test/color-swatch.test.mjs'],
  CommandPalette: ['test/command-palette-hook.test.mjs'],
  GridList: ['test/browser/grid-list-layout.test.mjs'],
  Image: ['test/image-avatar.test.mjs'],
  Lightbox: ['test/heavy-components.test.mjs'],
  Markdown: ['test/heavy-components.test.mjs'],
  Resizable: ['test/heavy-components.test.mjs'],
  Table: ['test/browser/table-sort-indicator.test.mjs'],
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

const SUPPLEMENTAL_TESTS = Object.freeze(['test/supplemental.test.mjs']);

// The files a family routes to directly, without its shared source group: the
// slug-named pair that exists, plus its explicit extras.
function familyRoute(record, available) {
  const named = record.slug ? [`test/${record.slug}.test.mjs`, `test/browser/${record.slug}.test.mjs`] : [];
  return [...named.filter((file) => available.has(file)), ...(FAMILY_EXTRA_TESTS[record.family] ?? [])];
}

function sourceRoute(record) {
  const source = record.source ?? '';
  if (source.endsWith('/supplemental/index.mjs')) return SUPPLEMENTAL_TESTS;
  const sourceName = source.split('/').at(-1)?.replace(/\.(?:mjs|ts)$/u, '');
  return SOURCE_ROUTES[sourceName] ?? [];
}

// What a family with no test of its own runs: its source group, whole. Every
// supplemental module belongs to the supplemental group.
function sourceGroupTests(record) {
  const group = sourceRoute(record);
  if (group.length > 0) return group;
  return record.source?.includes('/supplemental/') ? SUPPLEMENTAL_TESTS : [];
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
  const wholeFiles = new Set();
  for (const record of records) {
    const sourceFiles = sourceRoute(record);
    const ownFiles = familyRoute(record, available);
    const explicitRoute = new Set(ownFiles);
    const familyNames = FAMILY_TEST_NAMES[record.family] ?? {};
    const route = [...ownFiles];
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

    let uniqueRoute = [...new Set(route)];
    if (uniqueRoute.length === 0 && !behaviorProofs.has(record.family)) {
      // No test names the family, so its source group runs whole, in local and
      // focused checks alike. Focused CI with no group either has no proof to run.
      uniqueRoute = sourceGroupTests(record);
      if (uniqueRoute.length === 0 && !includeSharedSource) {
        throw new Error(`MUXUI_COMPONENT_FOCUSED_ROUTE_MISSING: ${record.family} (${record.source ?? 'no source'}); no test names it, its source has no test group, and no verified Storybook BrowserProof is available`);
      }
      uniqueRoute.forEach((file) => wholeFiles.add(file));
    }
    if (uniqueRoute.length === 0 && !includeSharedSource) selectedBehaviorProofs.add(record.family);
    for (const file of uniqueRoute) {
      if (!available.has(file)) throw new Error(`MUXUI_COMPONENT_TEST_ROUTE_FILE_MISSING: ${record.family}: ${file}`);
      selected.add(file);
    }
  }
  // A group file one family needs whole is never narrowed to another family's cases.
  wholeFiles.forEach((file) => namedFiles.delete(file));
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

/** True for the real-browser tests `check:browser` globs (test/browser/*.test.mjs). */
export function isBrowserTestFile(file) {
  return /^test\/browser\/[^/]+\.test\.mjs$/u.test(file);
}

/** The `--test-name-pattern` value that runs exactly the named tests. */
export function testNamePattern(names) {
  return `^(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})$`;
}

/** Resolve existing behavioral test groups for canonical component records. */
export function selectComponentTestFiles(records, availableFiles, options) {
  return componentTestSelection(records, availableFiles, options).files;
}

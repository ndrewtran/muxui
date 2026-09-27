import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { pathToFileURL } from 'node:url';
import { analyzeReactSourceChange, analyzeReactStyleChange } from './component-source-impact.mjs';
import { compareStorybookGeneratorEmissions } from './storybook-generator-impact.mjs';
import { dependencyClosure, familyRecordsFromContract } from './scoped-verification.mjs';
import { componentTestSelection } from './component-test-selection.mjs';
import { loadPolicy, normalizePath } from './policy.mjs';
import { discoverWorkspacePackages } from './workspace-packages.mjs';

const repositoryRoot = resolve(process.env.MUXUI_TASK_REPOSITORY_ROOT ?? resolve(import.meta.dirname, '../../../..'));
const reactContractPath = 'packages/react/generated/r1-6-contract.json';
const reactDescriptorPath = 'packages/react/generated/descriptor.json';
const storybookManifestPath = 'apps/react-storybook/.storybook/generated/manifest.mjs';

const scopedEntrypoints = {
  react: {
    packageName: '@muxui/react',
    scriptName: 'check:component',
    command: 'node ../../tooling/audits/repository-policy/src/run-component-check.mjs',
  },
  storybook: {
    packageName: '@muxui/react-storybook',
    scriptName: 'check:scoped',
    command: 'node src/check-scoped.mjs',
  },
};

export function validateScopedEntrypoints(packages, required) {
  const validated = [];
  for (const name of [...new Set(required)].sort()) {
    const entrypoint = scopedEntrypoints[name];
    if (!entrypoint) {
      throw new Error(`MUXUI_CI_IMPACT_SCOPED_ENTRYPOINT_UNKNOWN: ${name}`);
    }
    const owner = packages.find(({ name: packageName }) => packageName === entrypoint.packageName);
    const actual = owner?.manifest?.scripts?.[entrypoint.scriptName];
    if (actual !== entrypoint.command) {
      throw new Error(
        `MUXUI_CI_IMPACT_SCOPED_ENTRYPOINT_INVALID: ${entrypoint.packageName} ${entrypoint.scriptName} `
        + `must be exactly ${JSON.stringify(entrypoint.command)} for scoped CI; found ${JSON.stringify(actual ?? null)}`,
      );
    }
    validated.push(name);
  }
  return validated;
}

function requireScopedEntrypoint(plan, packages, name) {
  validateScopedEntrypoints(packages, [name]);
  plan.scopedEntrypointChecks.add(name);
}

function scopedEntrypointArgs(name, packages) {
  validateScopedEntrypoints(packages, [name]);
  const { packageName, scriptName } = scopedEntrypoints[name];
  return ['--filter', packageName, 'run', scriptName];
}

function git(args, { cwd = repositoryRoot, allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`MUXUI_CI_IMPACT_GIT_FAILED: git ${args.join(' ')} exited ${result.status ?? 'unknown'}`);
  }
  return result;
}

function parseNameStatus(bytes) {
  const values = bytes.toString('utf8').split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < values.length;) {
    const status = values[index++];
    if (status.startsWith('R') || status.startsWith('C')) {
      paths.push(values[index++], values[index++]);
    } else {
      paths.push(values[index++]);
    }
  }
  return paths.map(normalizePath).filter(Boolean);
}

export function collectPullRequestPaths({ baseRef, includeWorktree = false, repositoryRoot: root = repositoryRoot }) {
  const check = git(['rev-parse', '--verify', `${baseRef}^{commit}`], { cwd: root, allowFailure: true });
  if (check.status !== 0) {
    throw new Error(`MUXUI_CI_IMPACT_BASE_UNAVAILABLE: ${baseRef} is unavailable; fetch the PR base ref before planning`);
  }
  const changed = parseNameStatus(git([
    'diff', '--name-status', '-z', '--find-renames', `${baseRef}...HEAD`,
  ], { cwd: root }).stdout);
  if (!includeWorktree) return [...new Set(changed)].sort();

  const worktree = parseNameStatus(git(['diff', '--name-status', '-z', '--find-renames', 'HEAD'], { cwd: root }).stdout);
  const staged = parseNameStatus(git(['diff', '--cached', '--name-status', '-z', '--find-renames'], { cwd: root }).stdout);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }).stdout
    .toString('utf8').split('\0').filter(Boolean).map(normalizePath);
  return [...new Set([...changed, ...worktree, ...staged, ...untracked])].sort();
}

function resolveMergeBase(baseRef, root = repositoryRoot) {
  const result = git(['merge-base', baseRef, 'HEAD'], { cwd: root, allowFailure: true });
  if (result.status !== 0) {
    throw new Error(`MUXUI_CI_IMPACT_BASE_UNAVAILABLE: cannot resolve merge-base for ${baseRef}`);
  }
  return result.stdout.toString('utf8').trim();
}

function matches(path, values = []) {
  return values.some((value) => value.endsWith('/') ? path.startsWith(value) : path === value);
}

function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`MUXUI_CI_IMPACT_JSON_INVALID: ${label}: ${error.message}`);
  }
}

async function currentText(path) {
  return readFile(resolve(repositoryRoot, path), 'utf8').catch(() => null);
}

function textAtRef(ref, path) {
  const result = git(['show', `${ref}:${path}`], { allowFailure: true });
  return result.status === 0 ? result.stdout.toString('utf8') : null;
}

function lockfileSections(source) {
  if (source === null) return null;
  const lines = source.split(/\r?\n/u);
  const sectionAt = (name) => {
    const start = lines.findIndex((line) => line === `${name}:`);
    if (start < 0) return new Map();
    const end = lines.findIndex((line, index) => index > start && /^[^\s#][^:]*:\s*$/u.test(line));
    const block = lines.slice(start + 1, end < 0 ? lines.length : end);
    const records = new Map();
    let key = null;
    let body = [];
    const commit = () => {
      if (key !== null) records.set(key, body.join('\n').trimEnd());
    };
    for (const line of block) {
      // pnpm lock sections nest importer/package values at four spaces; only
      // two-space keys begin a record in importers, packages, and snapshots.
      const child = line.match(/^ {2}([^ ].*):\s*$/u);
      if (child) {
        commit();
        key = child[1];
        body = [];
      } else if (key !== null) {
        body.push(line);
      }
    }
    commit();
    return records;
  };
  const importerRecords = sectionAt('importers');
  const packageRecords = sectionAt('packages');
  const snapshotRecords = sectionAt('snapshots');
  const importerStart = lines.findIndex((line) => line === 'importers:');
  const prefix = lines.slice(0, importerStart < 0 ? lines.length : importerStart);
  return { importerRecords, packageRecords, snapshotRecords, prefix: prefix.join('\n').trim() };
}

export function isPolicyOnlyLockfileChange(before, after, changedImporter = 'tooling/audits/repository-policy') {
  const oldSections = lockfileSections(before);
  const newSections = lockfileSections(after);
  if (!oldSections || !newSections || oldSections.prefix !== newSections.prefix) return false;
  const importerKeys = new Set([...oldSections.importerRecords.keys(), ...newSections.importerRecords.keys()]);
  const changedImporters = [...importerKeys].filter((key) => oldSections.importerRecords.get(key) !== newSections.importerRecords.get(key));
  if (changedImporters.length === 0 || changedImporters.some((key) => key !== changedImporter)) return false;
  for (const sectionName of ['packageRecords', 'snapshotRecords']) {
    const oldRecords = oldSections[sectionName];
    const newRecords = newSections[sectionName];
    for (const [key, value] of oldRecords) {
      if (!newRecords.has(key) || newRecords.get(key) !== value) return false;
    }
  }
  return true;
}

export function changedLockfileImporters(before, after) {
  const oldSections = lockfileSections(before);
  const newSections = lockfileSections(after);
  if (!oldSections || !newSections || oldSections.prefix !== newSections.prefix) {
    throw new Error('MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: lockfile settings changed; identify the affected workspace owner explicitly');
  }
  const importerKeys = new Set([...oldSections.importerRecords.keys(), ...newSections.importerRecords.keys()]);
  const changedImporters = [...importerKeys].filter((key) => oldSections.importerRecords.get(key) !== newSections.importerRecords.get(key));
  if (changedImporters.length === 0) {
    throw new Error('MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: dependency resolutions changed without an importer change; map the changed resolution to its consumers');
  }
  for (const sectionName of ['packageRecords', 'snapshotRecords']) {
    const oldRecords = oldSections[sectionName];
    const newRecords = newSections[sectionName];
    const changedExisting = [...oldRecords].some(([key, value]) => !newRecords.has(key) || newRecords.get(key) !== value);
    if (changedExisting) {
      throw new Error(`MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: existing ${sectionName === 'packageRecords' ? 'package' : 'snapshot'} resolutions changed; resolve all importers that consume those resolutions`);
    }
  }
  return changedImporters.map((key) => key.replace(/^['"]|['"]$/gu, '')).sort();
}

function objectExpressionValue(node, source) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map((item) => objectExpressionValue(item, source));
  if (node.type === 'ObjectExpression') {
    return Object.fromEntries(node.properties.map((property) => {
      if (property.type !== 'Property' || property.computed || property.kind !== 'init') {
        throw new Error('MUXUI_CI_IMPACT_STORYBOOK_MANIFEST_INVALID: manifest fields must be literal data');
      }
      const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
      return [key, objectExpressionValue(property.value, source)];
    }));
  }
  if (node.type === 'UnaryExpression' && node.operator === '-') return -objectExpressionValue(node.argument, source);
  throw new Error(`MUXUI_CI_IMPACT_STORYBOOK_MANIFEST_INVALID: unsupported ${node.type}`);
}

export function parseStorybookManifest(source) {
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (error) {
    throw new Error(`MUXUI_CI_IMPACT_STORYBOOK_MANIFEST_INVALID: ${error.message}`);
  }
  const declaration = ast.body
    .filter((node) => node.type === 'ExportNamedDeclaration')
    .flatMap((node) => node.declaration?.type === 'VariableDeclaration' ? node.declaration.declarations : [])
    .find((node) => node.id.type === 'Identifier' && node.id.name === 'manifest');
  const init = declaration?.init;
  const object = init?.type === 'CallExpression' && init.callee.type === 'MemberExpression'
    && init.callee.object.name === 'Object' && init.callee.property.name === 'freeze'
    ? init.arguments[0]
    : null;
  if (!object || object.type !== 'ObjectExpression') {
    throw new Error('MUXUI_CI_IMPACT_STORYBOOK_MANIFEST_INVALID: generated manifest object not found');
  }
  const manifest = objectExpressionValue(object, source);
  if (manifest.schema !== 'muxui-react-storybook-manifest-v1' || !Array.isArray(manifest.pageIndex)) {
    throw new Error('MUXUI_CI_IMPACT_STORYBOOK_PAGE_INDEX_MISSING: regenerate React Storybook to publish canonical page ownership');
  }
  return manifest;
}

async function generatedReactRecords() {
  const [contractSource, descriptorSource] = await Promise.all([
    currentText(reactContractPath),
    currentText(reactDescriptorPath),
  ]);
  if (!contractSource) throw new Error('MUXUI_CI_IMPACT_REACT_METADATA_MISSING: run the scoped React/Storybook generation prerequisite');
  const contract = parseJson(contractSource.split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'), reactContractPath);
  const descriptor = descriptorSource
    ? parseJson(descriptorSource.split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'), reactDescriptorPath)
    : {};
  const records = familyRecordsFromContract(contract, descriptor.bindings ?? []);
  if (records.length === 0) throw new Error('MUXUI_CI_IMPACT_REACT_METADATA_EMPTY: generated React contract has no canonical component records');
  return records;
}

async function generatedStoryIndex() {
  const source = await currentText(storybookManifestPath);
  if (!source) throw new Error('MUXUI_CI_IMPACT_STORYBOOK_METADATA_MISSING: run the scoped Storybook generation prerequisite');
  return parseStorybookManifest(source).pageIndex;
}

function routeCatalogExample(path, pageIndex) {
  const exact = pageIndex.flatMap((page) => page.stories
    .filter((story) => story.source === path)
    .map((story) => ({ family: page.family, id: story.id })));
  return exact;
}

function recordForSlug(records, slug) {
  return records.find((record) => record.slug === slug);
}

function storybookPageOwners(path, pageIndex) {
  return pageIndex.filter((page) => page.storyFile === path);
}

function storyExportBodies(source) {
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (error) {
    throw new Error(`MUXUI_CI_IMPACT_STORY_SOURCE_INVALID: ${error.message}`);
  }
  const exports = new Map();
  const shared = [];
  for (const node of ast.body) {
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration') {
      for (const declaration of node.declaration.declarations) {
        if (declaration.id.type === 'Identifier') exports.set(declaration.id.name, source.slice(node.start, node.end));
      }
    } else if (node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name) {
      exports.set(node.declaration.id.name, source.slice(node.start, node.end));
    } else if (node.type === 'ImportDeclaration') {
      shared.push(source.slice(node.start, node.end));
    } else {
      shared.push(source.slice(node.start, node.end));
    }
  }
  return { exports, shared: shared.join('\n') };
}

function changedStoryIds(path, before, after, pageIndex) {
  const pages = storybookPageOwners(path, pageIndex);
  if (pages.length === 0) throw new Error(`MUXUI_CI_IMPACT_STORY_PAGE_MISSING: ${path} is generated Storybook output without a canonical pageIndex owner`);
  const oldStories = storyExportBodies(before ?? '');
  const newStories = storyExportBodies(after ?? '');
  const changedExports = new Set([...oldStories.exports.keys(), ...newStories.exports.keys()].filter((name) => (
    oldStories.exports.get(name) !== newStories.exports.get(name)
  )));
  const sharedChanged = oldStories.shared !== newStories.shared;
  const ids = [];
  for (const page of pages) {
    if (sharedChanged || changedExports.size === 0) {
      ids.push(...page.stories.map(({ id }) => id));
      continue;
    }
    for (const story of page.stories) {
      if (changedExports.has(story.exportName)) ids.push(story.id);
    }
  }
  return [...new Set(ids)].sort();
}

async function reactModuleSources(baseRef) {
  const root = resolve(repositoryRoot, 'packages/react/src');
  const currentFiles = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.mjs')) currentFiles.push(fullPath);
    }
  }
  await visit(root);
  const basePaths = git(['ls-tree', '-r', '--name-only', baseRef, '--', 'packages/react/src'], { allowFailure: true });
  if (basePaths.status !== 0) throw new Error(`MUXUI_CI_IMPACT_BASE_SOURCE_MISSING: cannot list React source at ${baseRef}`);
  const paths = new Set([
    ...basePaths.stdout.toString('utf8').split('\n').filter((path) => path.endsWith('.mjs')),
    ...currentFiles.map((file) => file.slice(repositoryRoot.length + 1).replaceAll('\\', '/')),
  ]);
  return Object.fromEntries(await Promise.all([...paths].map(async (path) => [
    path,
    {
      before: textAtRef(baseRef, path),
      after: await currentText(path),
    },
  ])));
}

async function reactTestSources() {
  const root = resolve(repositoryRoot, 'packages/react/test');
  const sources = {};
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
        const path = fullPath.slice(repositoryRoot.length + 1).replaceAll('\\', '/').slice('packages/react/'.length);
        sources[path] = await readFile(fullPath, 'utf8');
      }
    }
  }
  await visit(root);
  return sources;
}

export function rootPackageWideChanges(before, after) {
  if (before === null || after === null) return { full: true, reason: 'root package manifest was added or removed' };
  const oldManifest = parseJson(before, 'base package.json');
  const newManifest = parseJson(after, 'package.json');
  const broadFields = ['engines', 'packageManager', 'workspaces', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'pnpm'];
  const changed = broadFields.filter((field) => JSON.stringify(oldManifest[field] ?? null) !== JSON.stringify(newManifest[field] ?? null));
  return changed.length > 0
    ? { full: true, reason: `root workspace/toolchain fields changed: ${changed.join(', ')}` }
    : { full: false, reason: null };
}

export function storybookPackageWideChanges(before, after) {
  if (before === null || after === null) return { pagesAffected: true, reason: 'Storybook package manifest was added or removed' };
  const oldManifest = parseJson(before, 'base Storybook package.json');
  const newManifest = parseJson(after, 'Storybook package.json');
  const broadFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'exports', 'engines', 'files', 'type', 'name', 'version'];
  const changed = broadFields.filter((field) => JSON.stringify(oldManifest[field] ?? null) !== JSON.stringify(newManifest[field] ?? null));
  return changed.length > 0
    ? { pagesAffected: true, reason: `Storybook runtime/test boundary fields changed: ${changed.join(', ')}` }
    : { pagesAffected: false, reason: 'Storybook package scripts or metadata changed without changing page runtime dependencies' };
}

export function reactPackageWideChanges(before, after) {
  if (before === null || after === null) {
    return {
      pagesAffected: true,
      developmentDependenciesChanged: false,
      scriptsChanged: false,
      reason: 'React package boundary was added or removed',
    };
  }
  const oldManifest = parseJson(before, 'base React package.json');
  const newManifest = parseJson(after, 'React package.json');
  const runtimeFields = [
    'name', 'type', 'exports', 'imports', 'main', 'module', 'types', 'typings',
    'browser', 'files', 'sideEffects', 'dependencies', 'peerDependencies', 'optionalDependencies',
  ];
  const changed = runtimeFields.filter((field) => (
    JSON.stringify(oldManifest[field] ?? null) !== JSON.stringify(newManifest[field] ?? null)
  ));
  const developmentDependenciesChanged = JSON.stringify(oldManifest.devDependencies ?? null)
    !== JSON.stringify(newManifest.devDependencies ?? null);
  const scriptsChanged = JSON.stringify(oldManifest.scripts ?? null) !== JSON.stringify(newManifest.scripts ?? null);
  return {
    pagesAffected: changed.length > 0,
    developmentDependenciesChanged,
    scriptsChanged,
    reason: changed.length > 0
      ? `React package runtime boundary changed: ${changed.join(', ')}`
      : developmentDependenciesChanged
        ? 'React package development dependencies changed'
        : scriptsChanged
          ? 'React package scripts changed'
          : 'React package non-runtime metadata changed',
  };
}

function packageByPath(path, packages) {
  return packages.filter(({ path: packagePath }) => path === packagePath || path.startsWith(`${packagePath}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

function addUnique(target, value) {
  if (target instanceof Set) target.add(value);
  else if (Array.isArray(target) && !target.includes(value)) target.push(value);
}

function applyPackageImpact(plan, packageName, records) {
  if (packageName === '@muxui/repository-policy') {
    plan.policy = true;
    return 'repository-policy machinery';
  }
  if (packageName === '@muxui/catalog') {
    plan.catalog = true;
    return 'catalog compiler';
  }
  if (packageName === '@muxui/tokens') {
    plan.tokens = true;
    plan.reactTheme = true;
    plan.storyTheme = true;
    plan.storyChrome = true;
    plan.tailwind = true;
    return 'token compiler and theme consumers';
  }
  if (packageName === '@muxui/foundation') {
    addUnique(plan.packageChecks, packageName);
    plan.storyTheme = true;
    return 'foundation package and theme consumers';
  }
  if (packageName === '@muxui/docs') {
    plan.docs = true;
    return 'documentation application';
  }
  if (packageName === '@muxui/scale') {
    plan.scale = true;
    return 'theme authoring application';
  }
  if (packageName === '@muxui/react') {
    plan.reactPackageFull = true;
    familyAll(records).forEach((family) => addUnique(plan.storyFamilies, family));
    plan.tailwind = true;
    return 'React renderer and all direct component consumers';
  }
  if (packageName === '@muxui/react-storybook') {
    familyAll(records).forEach((family) => addUnique(plan.storyFamilies, family));
    plan.storyTooling = true;
    return 'Storybook renderer and all emitted pages';
  }

  return packageName;
}

function routeLockfileImporter(plan, importer, packages, records) {
  const owner = packageByPath(importer, packages);
  if (!owner || owner.path !== importer) {
    throw new Error(`MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: importer ${importer} has no current workspace package owner`);
  }
  const description = applyPackageImpact(plan, owner.name, records);
  if (!['@muxui/repository-policy', '@muxui/catalog', '@muxui/tokens', '@muxui/foundation', '@muxui/docs', '@muxui/scale', '@muxui/react', '@muxui/react-storybook'].includes(owner.name)) {
    addUnique(plan.packageChecks, owner.name);
  }
  plan.reasons.push(`lockfile importer ${importer} changes ${description}`);
}

function familyAll(records) {
  return records.map(({ family }) => family).sort();
}

function storybookUnitRoute(path) {
  const file = path.slice('apps/react-storybook/'.length);
  const exact = (testFile, names) => ({
    file: testFile,
    testNamePattern: names.map((name) => `^${name}$`).join('|'),
  });

  if (file === 'test/storybook-a11y.test.mjs') {
    return exact('test/storybook-a11y.test.mjs', [
      'Storybook startup cancellation terminates its child process',
      'audit cleanup closes a browser acquired after timeout exactly once',
    ]);
  }
  if (file === 'test/storybook-colors.test.mjs'
      || file === 'test/helpers/color-audit.mjs') {
    return exact('test/storybook-colors.test.mjs', [
      'Storybook colour audit detects solid, alpha, shadow, gradient, SVG and pseudo-element leaks',
      'Storybook colour audit recognizes canonical token mixes and shadow-only focus opacity',
      'Storybook colour declarations reference Mux tokens, including values that happen to match the palette',
      'Storybook canvas palette adapter rejects upstream drift and removes generated alpha',
      'Storybook search status icons use canonical action and option-state colours',
    ]);
  }
  if (file === 'test/helpers/storybook-index.mjs') {
    return exact('test/storybook-page-selection.test.mjs', [
      'storybook page index requests honor cancellation and a bounded timeout',
    ]);
  }
  if (file === 'test/storybook-page-selection.mjs' || file === 'test/storybook-page-selection.test.mjs'
      || file === 'src/check-scoped.mjs') {
    return { file: 'test/storybook-page-selection.test.mjs' };
  }
  if (file === 'test/storybook-family-selection.mjs' || file === 'test/storybook-family-selection.test.mjs') {
    return { file: 'test/storybook-family-selection.test.mjs' };
  }
  if (file === 'test/storybook-colors-report.mjs' || file === 'test/storybook-colors-report.test.mjs') {
    return { file: 'test/storybook-colors-report.test.mjs' };
  }
  if (file === 'test/storybook.test.mjs') {
    return exact('test/storybook.test.mjs', [
      'private host and exact Mux UI React family projection',
      'current Storybook manifest covers the complete package union',
    ]);
  }
  return null;
}

function addStoryUnitRoute(plan, path) {
  const route = storybookUnitRoute(path);
  if (!route) {
    throw new Error(`MUXUI_CI_IMPACT_STORY_TOOLING_TEST_MISSING: ${path} has no focused unit-test route`);
  }
  const previous = plan.storyUnitTests.get(route.file);
  if (!previous) {
    plan.storyUnitTests.set(route.file, route);
    return;
  }
  if (!previous.testNamePattern || !route.testNamePattern) {
    plan.storyUnitTests.set(route.file, { file: route.file });
    return;
  }
  const patterns = [...new Set(`${previous.testNamePattern}|${route.testNamePattern}`.split('|'))];
  plan.storyUnitTests.set(route.file, { ...route, testNamePattern: patterns.join('|') });
}

function selectedCheckOwners(plan, packages) {
  const names = new Set(plan.packageChecks);
  if (plan.policy) {
    names.add('@muxui/repository-policy');
    // The policy release-preparation proof consumes ignored React projections
    // without declaring React as a package dependency.
    names.add('@muxui/react');
  }
  if (plan.catalog) names.add('@muxui/catalog');
  if (plan.tokens) names.add('@muxui/tokens');
  if (plan.docs) names.add('@muxui/docs');
  if (plan.scale) names.add('@muxui/scale');
  if (plan.reactTheme || plan.reactProjectionCheck || plan.reactPackageFull || plan.reactFamilies.length > 0) {
    names.add('@muxui/react');
  }
  return [...names].filter((name) => packages.some((item) => item.name === name));
}

export function scopedGenerationPackages(plan, packages) {
  const selfGeneratingChecks = new Set(['@muxui/docs', '@muxui/scale']);
  const roots = selectedCheckOwners(plan, packages).filter((name) => !selfGeneratingChecks.has(name));
  return dependencyClosure(packages, roots)
    .filter(({ manifest }) => typeof manifest.scripts?.generate === 'string')
    .map(({ name }) => name);
}

function normalizeTaskPaths(changedPaths) {
  return [...new Set(changedPaths.map(normalizePath).filter(Boolean))].sort();
}

function refreshStoryRuns(plan) {
  plan.storyRuns = [];
  if (plan.storyFamilies.length > 0) {
    plan.storyRuns.push({
      proof: 'component',
      families: plan.storyFamilies,
      storyIds: [],
      reason: 'all pages in the affected component families',
    });
  }
  const exactStoryIds = plan.storyIds.filter((id) => !plan.storyFamilies.includes(plan.storyIdFamilies[id]));
  if (exactStoryIds.length > 0) {
    const exactFamilies = [...new Set(exactStoryIds.map((id) => plan.storyIdFamilies[id]).filter(Boolean))].sort();
    if (exactFamilies.length !== new Set(exactStoryIds.map((id) => plan.storyIdFamilies[id])).size) {
      throw new Error('MUXUI_CI_IMPACT_STORY_PAGE_MISSING: an exact page ID has no canonical family owner');
    }
    plan.storyRuns.push({
      proof: 'story',
      families: exactFamilies,
      storyIds: exactStoryIds,
      reason: 'only the exact canonical story pages whose sources changed',
    });
  }
  if (plan.storyTheme) plan.storyRuns.push({
    proof: 'theme',
    families: plan.themeFamilies,
    storyIds: plan.themeStoryIds,
    reason: plan.themeFamilies.length || plan.themeStoryIds.length
      ? 'theme contrast proof for the affected CSS consumer pages'
      : 'all-consumer theme contrast proof',
  });
  if (plan.storyChrome) plan.storyRuns.push({ proof: 'chrome', families: [], storyIds: [], reason: 'manager chrome color proof' });
  plan.storybookGenerationCheck = plan.storyRuns.length > 0;
  return plan;
}

export async function buildPullRequestImpact({
  changedPaths,
  config,
  records,
  pageIndex,
  packages,
  readBaseText,
  readHeadText,
  moduleSources,
  componentTestSources = {},
  compareGeneratorEmissions = compareStorybookGeneratorEmissions,
  rootPackageBefore,
  rootPackageAfter,
  reactPackageBefore,
  reactPackageAfter,
  lockfileBefore,
  lockfileAfter,
}) {
  const changed = normalizeTaskPaths(changedPaths);
  if (changed.length === 0) throw new Error('MUXUI_CI_IMPACT_EMPTY: the pull request diff contains no changed paths');
  const plan = {
    schemaVersion: 1,
    changedPaths: changed,
    full: false,
    fullReasons: [],
    policy: false,
    docs: false,
    scale: false,
    catalog: false,
    tokens: false,
    reactTheme: false,
    reactProjectionCheck: false,
    reactPackageFull: false,
    reactFamilies: new Set(),
    reactBehaviorProofFamilies: [],
    scopedEntrypointChecks: new Set(),
    storyIds: new Set(),
    storyIdFamilies: new Map(),
    storyFamilies: new Set(),
    storyTheme: false,
    themeFamilies: new Set(),
    themeStoryIds: new Set(),
    storyChrome: false,
    storyTooling: false,
    storyUnitTests: new Map(),
    reactTestFiles: new Set(),
    packageChecks: new Set(),
    tailwind: false,
    reasons: [],
  };
  const missing = [];

  for (const path of changed) {
    if (config.fullInputPaths.includes(path)) {
      plan.fullReasons.push(`${path} is a workspace-wide execution input`);
      continue;
    }
    if (path === 'package.json') {
      plan.policy = true;
      plan.reasons.push('root package metadata changed; CI policy validation is required');
      continue;
    }
    if (path === 'pnpm-lock.yaml') {
      continue;
    }
    if (matches(path, config.policyPrefixes)) {
      plan.policy = true;
      plan.reasons.push(`${path} is CI, ownership, or delivery-policy machinery`);
      continue;
    }
    if (matches(path, config.themePrefixes)) {
      if (path.startsWith('catalog/tokens/')) {
        plan.tokens = true;
        plan.catalog = true;
        plan.storyChrome = true;
      } else if (path.startsWith('packages/tokens/')) {
        plan.tokens = true;
        if (path.startsWith('packages/tokens/src/') || path === 'packages/tokens/package.json') {
          plan.storyChrome = true;
        }
      } else if (path.startsWith('packages/foundation/')) {
        plan.packageChecks.add('@muxui/foundation');
      }
      plan.reactTheme = true;
      plan.storyTheme = true;
      plan.tailwind ||= matches(path, config.tailwindRelevantPrefixes) || config.tailwindRelevantPaths.includes(path);
      plan.reasons.push(`${path} changes theme/token inputs; validate compiler, projections, and consumer contrast`);
      continue;
    }
    if (matches(path, config.documentationPrefixes)) {
      plan.docs = true;
      plan.reasons.push(`${path} is owned by the documentation application`);
      continue;
    }
    if (path.startsWith('apps/scale/')) {
      plan.scale = true;
      plan.reasons.push(`${path} is owned by the theme authoring application`);
      continue;
    }

    if (matches(path, config.reactStylePrefixes)) plan.tailwind = true;

    if (path.startsWith('packages/react/src/') && path.endsWith('.css')) {
      plan.tailwind = true;
      plan.reactProjectionCheck = true;
      // CSS ownership is resolved from parsed selectors and canonical family slugs by the source-impact analyzer.
      plan.reasons.push(`${path} is component CSS; selector ownership determines the affected families`);
      continue;
    }

    if (path.startsWith('packages/react/src/') && path.endsWith('.mjs')) {
      plan.reactProjectionCheck = true;
      plan.reasons.push(`${path} is React runtime or compiler source; AST ownership determines the affected families`);
      continue;
    }

    if (path === 'packages/react/package.json') {
      requireScopedEntrypoint(plan, packages, 'react');
      const impact = reactPackageWideChanges(reactPackageBefore, reactPackageAfter);
      if (impact.pagesAffected) {
        plan.reactPackageFull = true;
        familyAll(records).forEach((family) => plan.storyFamilies.add(family));
        plan.tailwind = true;
        plan.reasons.push(`${impact.reason}; validate every direct component consumer`);
      } else {
        if (impact.developmentDependenciesChanged) plan.packageChecks.add('@muxui/react');
        if (impact.scriptsChanged || !impact.developmentDependenciesChanged) plan.policy = true;
        plan.reasons.push(`${impact.reason}; validate only the affected package metadata and test owner`);
      }
      continue;
    }

    if (path.startsWith('packages/react/test/')) {
      plan.reactTestFiles.add(path.slice('packages/react/'.length));
      plan.reasons.push(`${path} is React proof code; run only the changed test file`);
      continue;
    }

    if (path.startsWith('apps/react-storybook/')) {
      if (config.reactStorybookChromePaths.includes(path)) {
        plan.storyChrome = true;
        plan.reasons.push(`${path} changes Storybook manager chrome`);
      } else if (config.reactStorybookSharedPaths.includes(path)) {
        familyAll(records).forEach((family) => plan.storyFamilies.add(family));
        plan.reasons.push(`${path} is shared by every Storybook page`);
      } else if (config.reactStorybookGeneratorPaths.includes(path)) {
        plan.storyTooling = true;
        plan.reasons.push(`${path} changes Storybook generation; generated page diffs decide whether page audits are needed`);
      } else if (config.reactStorybookSelectionPaths.includes(path)) {
        plan.storyTooling = true;
        addStoryUnitRoute(plan, path);
        plan.reasons.push(`${path} changes Storybook selection tooling; run its focused unit proof`);
      } else if (path.startsWith('apps/react-storybook/.storybook/generated/')) {
        plan.reasons.push(`${path} is generated Storybook page output; map emitted exports to canonical page IDs`);
        if (path.endsWith('.stories.mjs') && storybookPageOwners(path, pageIndex).length === 0) {
          throw new Error(`MUXUI_CI_IMPACT_STORY_PAGE_MISSING: ${path} has no current canonical pageIndex owner; provide the base/head page owner mapping for this removal or rename`);
        }
      } else if (path.startsWith('apps/react-storybook/test/')) {
        plan.storyTooling = true;
        addStoryUnitRoute(plan, path);
        plan.reasons.push(`${path} is Storybook audit test machinery`);
      } else if (path.startsWith('apps/react-storybook/src/')) {
        plan.storyTooling = true;
        if (storybookUnitRoute(path)) addStoryUnitRoute(plan, path);
        plan.reasons.push(`${path} changes Storybook audit tooling`);
      } else if (path === 'apps/react-storybook/package.json') {
        requireScopedEntrypoint(plan, packages, 'storybook');
        const before = await readBaseText(path);
        const after = await readHeadText(path);
        const impact = storybookPackageWideChanges(before, after);
        if (impact.pagesAffected) familyAll(records).forEach((family) => plan.storyFamilies.add(family));
        plan.storyTooling = true;
        addStoryUnitRoute(plan, 'apps/react-storybook/test/storybook-page-selection.test.mjs');
        plan.reasons.push(impact.pagesAffected
          ? `${impact.reason}; audit all emitted Storybook pages`
          : `${impact.reason}; validate scoped audit selection`);
      } else if (path === 'apps/react-storybook/README.md') {
        plan.policy = true;
        plan.reasons.push(`${path} documents scoped Storybook CI behavior`);
      } else {
        missing.push(path);
      }
      continue;
    }

    if (path.startsWith('catalog/components/')) {
      const parts = path.split('/');
      const record = parts[2] ? recordForSlug(records, parts[2]) : null;
      if (record && /\/artifact\.json$/u.test(path)) {
        plan.reactFamilies.add(record.family);
        plan.storyFamilies.add(record.family);
        plan.catalog = true;
        plan.reasons.push(`${path} changes the canonical component record for ${record.family}`);
      } else if (/\/examples\/react\/.*\.tsx?$/u.test(path) || /\/examples\/react\/.*\.example\.json$/u.test(path)) {
        const owners = routeCatalogExample(path, pageIndex);
        if (owners.length === 0) {
          throw new Error(`MUXUI_CI_IMPACT_STORY_PAGE_MISSING: ${path} has no exact generated Storybook page owner`);
        }
        for (const owner of owners) {
          plan.storyIds.add(owner.id);
          plan.storyIdFamilies.set(owner.id, owner.family);
        }
        plan.catalog = true;
        plan.reasons.push(`${path} is checked against its canonical Storybook page mapping`);
      } else {
        plan.catalog = true;
        plan.reasons.push(`${path} is a catalog-owned input`);
      }
      continue;
    }

    const packageOwner = packageByPath(path, packages);
    if (packageOwner) {
      const { name } = packageOwner;
      const description = applyPackageImpact(plan, name, records);
      if (description === name) plan.packageChecks.add(name);
      plan.reasons.push(`${path} is owned by ${name}`);
      continue;
    }

    missing.push(path);
  }

  for (const path of changed.filter((candidate) => config.reactStorybookGeneratorPaths.includes(candidate))) {
    const impact = await compareGeneratorEmissions({
      beforeSource: await readBaseText(path),
      afterSource: await readHeadText(path),
      pageIndex,
    });
    for (const id of impact.storyIds) {
      const page = pageIndex.find(({ stories }) => stories.some((story) => story.id === id));
      if (!page) throw new Error(`MUXUI_CI_IMPACT_STORY_PAGE_MISSING: emitted page ID ${id} is absent from the canonical pageIndex`);
      plan.storyIds.add(id);
      plan.storyIdFamilies.set(id, page.family);
    }
    plan.reasons.push(`${path}: ${impact.reason}`);
  }

  if (changed.includes('package.json') && rootPackageBefore !== undefined && rootPackageAfter !== undefined) {
    const impact = rootPackageWideChanges(rootPackageBefore, rootPackageAfter);
    if (impact.full) {
      plan.fullReasons.push(impact.reason);
      plan.reasons.push(`full workspace proof: ${impact.reason}`);
    }
  }
  if (changed.includes('pnpm-lock.yaml') && lockfileBefore !== undefined && lockfileAfter !== undefined) {
    if (isPolicyOnlyLockfileChange(lockfileBefore, lockfileAfter)) {
      plan.policy = true;
      plan.reasons.push('pnpm-lock.yaml changes only the repository-policy importer and adds its parser resolutions');
    } else if (plan.fullReasons.length === 0) {
      for (const importer of changedLockfileImporters(lockfileBefore, lockfileAfter)) routeLockfileImporter(plan, importer, packages, records);
    }
  }

  if (missing.length > 0) {
    throw new Error(`MUXUI_CI_IMPACT_OWNER_MISSING: ${missing.join(', ')}; add an explicit canonical owner route to pullRequestImpact`);
  }
  if (plan.fullReasons.length > 0) {
    plan.full = true;
    plan.reasons.push(...plan.fullReasons.map((reason) => `full workspace proof: ${reason}`));
  }

  const reactSourcePaths = changed.filter((path) => path.startsWith('packages/react/src/') && path.endsWith('.mjs'));
  for (const path of reactSourcePaths) {
    if (path === 'packages/react/src/generate.mjs') {
      plan.reactPackageFull = true;
      plan.reactProjectionCheck = false;
      familyAll(records).forEach((family) => plan.storyFamilies.add(family));
      plan.tailwind = true;
      plan.reasons.push('React projection compiler changes every canonical React family');
      continue;
    }
    const before = await readBaseText(path) ?? '';
    const after = await readHeadText(path) ?? '';
    const impact = analyzeReactSourceChange({ before, after, sourcePath: path, records, moduleSources });
    impact.families.forEach((family) => {
      plan.reactFamilies.add(family);
      plan.storyFamilies.add(family);
    });
    if (impact.families.length > 0) plan.reasons.push(impact.reason ?? `${path} changed exported ${impact.families.join(', ')}`);
  }

  const cssPaths = changed.filter((path) => path.startsWith('packages/react/src/') && path.endsWith('.css'));
  for (const path of cssPaths) {
    const before = await readBaseText(path);
    const after = await readHeadText(path);
    const impact = analyzeReactStyleChange({ before: before ?? '', after: after ?? '', records, sourcePath: path, moduleSources });
    impact.families.forEach((family) => {
      if (impact.theme) plan.themeFamilies.add(family);
      else {
        plan.reactFamilies.add(family);
        plan.storyFamilies.add(family);
      }
    });
    if (impact.theme) {
      plan.storyTheme = true;
      plan.reactTheme = true;
    }
    if (impact.families.length > 0) plan.reasons.push(impact.reason ?? `${path} changed CSS for ${impact.families.join(', ')}`);
  }

  for (const path of changed) {
    const pageOwners = routeCatalogExample(path, pageIndex);
    for (const owner of pageOwners) {
      plan.storyIds.add(owner.id);
    }
    const generatedPages = storybookPageOwners(path, pageIndex);
    if (generatedPages.length > 0) {
      plan.storyTooling = true;
      const before = await readBaseText(path);
      const after = await readHeadText(path);
      for (const id of changedStoryIds(path, before, after, pageIndex)) {
        plan.storyIds.add(id);
        const page = generatedPages.find(({ stories }) => stories.some((story) => story.id === id));
        if (page) plan.storyIdFamilies.set(id, page.family);
      }
    }
  }

  plan.reactFamilies = [...plan.reactFamilies].sort();
  plan.storyFamilies = [...plan.storyFamilies].sort();
  plan.storyIds = [...plan.storyIds].sort();
  plan.storyIdFamilies = Object.fromEntries([...plan.storyIdFamilies].sort(([left], [right]) => left.localeCompare(right)));
  plan.themeFamilies = [...plan.themeFamilies].sort();
  plan.themeStoryIds = [...plan.themeStoryIds].sort();
  plan.storyUnitTests = [...plan.storyUnitTests.values()].sort((left, right) => left.file.localeCompare(right.file));
  let componentRoutedTestFiles = new Set();
  if (plan.reactFamilies.length > 0) {
    const selectedRecords = plan.reactFamilies.map((family) => {
      const record = records.find((candidate) => candidate.family === family);
      if (!record) throw new Error(`MUXUI_CI_IMPACT_COMPONENT_RECORD_MISSING: ${family}`);
      return record;
    });
    const behaviorProofFamilies = selectedRecords.flatMap(({ family }) => {
      const page = pageIndex.find((candidate) => candidate.family === family);
      return page?.stories.some((story) => story.exportName === 'BrowserProof') ? [family] : [];
    });
    const selection = componentTestSelection(selectedRecords, Object.keys(componentTestSources), {
      includeSharedSource: false,
      testSources: componentTestSources,
      behaviorProofFamilies,
    });
    componentRoutedTestFiles = new Set(selection.files);
    plan.reactBehaviorProofFamilies = selection.behaviorProofFamilies;
  }
  plan.reactTestFiles = [...plan.reactTestFiles].filter((file) => !componentRoutedTestFiles.has(file)).sort();
  plan.packageChecks = [...plan.packageChecks].sort();
  if (plan.reactFamilies.length > 0) requireScopedEntrypoint(plan, packages, 'react');
  plan.generationPackages = scopedGenerationPackages(plan, packages);
  const refreshed = refreshStoryRuns(plan);
  if (refreshed.storyRuns.length > 0) requireScopedEntrypoint(refreshed, packages, 'storybook');
  refreshed.scopedEntrypointChecks = [...refreshed.scopedEntrypointChecks].sort();
  return refreshed;
}

export function needsStorybookGeneration(paths, config, {
  packages = [], lockfileImporters = [], reactPackagePagesAffected = false,
} = {}) {
  const sourceNeedsMetadata = paths.some((path) => path.startsWith('packages/react/src/')
    || (path === 'packages/react/package.json' && reactPackagePagesAffected)
    || (path.startsWith('catalog/components/') && (/\/artifact\.json$/u.test(path)
      || /\/examples\/react\/.*\.(?:tsx?|example\.json)$/u.test(path)))
    || path.startsWith('apps/react-storybook/src/')
    || path.startsWith('apps/react-storybook/test/')
    || path.startsWith('apps/react-storybook/.storybook/')
    || path === 'apps/react-storybook/package.json'
    || matches(path, config.themePrefixes)
    || config.reactStorybookSharedPaths.includes(path)
    || config.reactStorybookChromePaths.includes(path)
    || config.reactStorybookGeneratorPaths.includes(path)
    || path.startsWith('apps/react-storybook/.storybook/generated/'));
  if (sourceNeedsMetadata) return true;

  return lockfileImporters.some((importer) => {
    const owner = packageByPath(importer, packages);
    return ['@muxui/react', '@muxui/react-storybook', '@muxui/tokens', '@muxui/foundation'].includes(owner?.name);
  });
}

function pnpmCommand(args, { env = {}, unsetEnv = [] } = {}) {
  return { command: 'pnpm', args, env, unsetEnv };
}

function storyProofEnvironment(storyRun, environment) {
  return {
    MUXUI_STORYBOOK_AUDIT_PROOF: storyRun.proof,
    ...(storyRun.families.length ? { MUXUI_STORYBOOK_FAMILIES: storyRun.families.join(',') } : {}),
    ...(storyRun.storyIds.length ? { MUXUI_STORYBOOK_STORY_IDS: storyRun.storyIds.join(',') } : {}),
    MUXUI_STORYBOOK_A11Y_WORKERS: '1',
    MUXUI_STORYBOOK_COLORS_WORKERS: '2',
    ...(environment.RUNNER_TEMP ? { MUXUI_STORYBOOK_COLORS_ARTIFACT_DIR: `${environment.RUNNER_TEMP}/storybook-colour-audit` } : {}),
  };
}

export function executionCommands(plan, {
  packages = [], metadataPrepared = false, environment = process.env,
} = {}) {
  const commands = [];
  const add = (args, options) => commands.push(pnpmCommand(args, options));
  const requiredEntrypoints = new Set(plan.scopedEntrypointChecks ?? []);
  if (!plan.full && !plan.reactPackageFull && plan.reactFamilies?.length > 0) requiredEntrypoints.add('react');
  if (!plan.full && plan.storyRuns?.length > 0) requiredEntrypoints.add('storybook');
  validateScopedEntrypoints(packages, [...requiredEntrypoints]);
  if (plan.full) {
    add(['check:all']);
    add(['--filter', '@muxui/scale', 'run', 'check:browser']);
    add(['--filter', '@muxui/react', 'run', 'check:browser']);
    add(['--dir', 'tests/fixtures/tailwind-consumer', 'install', '--ignore-workspace', '--frozen-lockfile']);
    add(['--dir', 'tests/fixtures/tailwind-consumer', 'run', 'check']);
    add(['generate:check']);
    return commands;
  }

  let generationPackages = plan.generationPackages ?? scopedGenerationPackages(plan, packages);
  if (metadataPrepared) {
    const preparedNames = new Set(dependencyClosure(packages, ['@muxui/react'])
      .filter(({ manifest }) => typeof manifest.scripts?.generate === 'string')
      .map(({ name }) => name));
    generationPackages = generationPackages.filter((name) => !preparedNames.has(name));
  }
  if (generationPackages.length > 0) {
    const args = ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present'];
    for (const name of generationPackages) args.push('--filter', name);
    args.push('run', 'generate');
    add(args);
  }

  if (plan.policy) add(['--filter', '@muxui/repository-policy', 'run', 'check']);
  if (plan.catalog) add(['--filter', '@muxui/catalog', 'run', 'check']);
  if (plan.tokens) add(['--filter', '@muxui/tokens', 'run', 'check']);
  if (plan.docs) add(['--filter', '@muxui/docs', 'run', 'check']);
  if (plan.scale) {
    add(['--filter', '@muxui/scale', 'run', 'check']);
    add(['--filter', '@muxui/scale', 'run', 'check:browser']);
  }
  if (plan.reactTheme) {
    add(['--filter', '@muxui/react', 'run', 'generate:check']);
    add(['--filter', '@muxui/react', 'exec', 'node', '--test', 'test/style-scopes.test.mjs', 'test/styling-tokens.test.mjs']);
  }
  if (plan.reactProjectionCheck && !plan.reactPackageFull && !plan.reactTheme) {
    add(['--filter', '@muxui/react', 'run', 'generate:check']);
  }
  if (plan.reactPackageFull) {
    add(['--filter', '@muxui/react', 'run', 'check']);
    add(['--filter', '@muxui/react', 'run', 'check:browser']);
  } else if (plan.reactFamilies.length > 0) {
    const env = {
      MUXUI_COMPONENT_FAMILIES: plan.reactFamilies.join(','),
      MUXUI_COMPONENT_INCLUDE_SHARED_SOURCE: '0',
      ...(plan.reactBehaviorProofFamilies.length ? { MUXUI_COMPONENT_BROWSER_PROOF_FAMILIES: plan.reactBehaviorProofFamilies.join(',') } : {}),
    };
    add(scopedEntrypointArgs('react', packages), {
      env,
      unsetEnv: ['MUXUI_COMPONENT_BROWSER_PROOF_FAMILIES'],
    });
  }
  for (const testFile of plan.reactTestFiles) {
    add(['--filter', '@muxui/react', 'exec', 'node', '--test', '--test-concurrency=1', testFile]);
  }
  for (const packageName of plan.packageChecks) add(['--filter', packageName, 'run', 'check']);
  if (plan.storyTooling || plan.storybookGenerationCheck) {
    add(['--filter', '@muxui/react-storybook', 'run', 'generate:check']);
  }
  if (plan.storyTooling) {
    for (const { file, testNamePattern } of plan.storyUnitTests) {
      add([
        '--filter', '@muxui/react-storybook', 'exec', 'node', '--test',
        ...(testNamePattern ? [`--test-name-pattern=${testNamePattern}`] : []),
        file,
      ], {
        unsetEnv: ['MUXUI_STORYBOOK_AUDIT_PROOF', 'MUXUI_STORYBOOK_FAMILIES', 'MUXUI_STORYBOOK_STORY_IDS'],
      });
    }
  }
  for (const storyRun of plan.storyRuns) {
    add(scopedEntrypointArgs('storybook', packages), {
      env: storyProofEnvironment(storyRun, environment),
      unsetEnv: ['MUXUI_STORYBOOK_FAMILIES', 'MUXUI_STORYBOOK_STORY_IDS'],
    });
  }
  if (plan.tailwind) {
    add(['--dir', 'tests/fixtures/tailwind-consumer', 'install', '--ignore-workspace', '--frozen-lockfile']);
    add(['--dir', 'tests/fixtures/tailwind-consumer', 'run', 'check']);
  }
  return commands;
}

function run(command) {
  const env = { ...process.env };
  for (const key of command.unsetEnv) delete env[key];
  Object.assign(env, command.env);
  const result = spawnSync(command.command, command.args, { cwd: repositoryRoot, stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function execute(commands) {
  for (const command of commands) {
    console.log(`[ci-impact] command: ${[command.command, ...command.args].join(' ')}`);
    if (Object.keys(command.env).length > 0) console.log(`[ci-impact] command env: ${JSON.stringify(command.env)}`);
    run(command);
  }
}

function planReport(plan, { baseRef, mergeBase, metadataPrepared, commands }) {
  return {
    schemaVersion: plan.schemaVersion,
    baseRef,
    mergeBase,
    changedPaths: plan.changedPaths,
    decision: plan.full ? 'full-workspace' : 'owner-scoped',
    fullReasons: plan.fullReasons,
    metadataPreparation: metadataPrepared ? ['@muxui/react-storybook generate'] : [],
    preparationCommands: metadataPrepared
      ? [{ command: 'pnpm', args: ['--filter', '@muxui/react-storybook', 'run', 'generate'], env: {} }]
      : [],
    commands: commands.map(({ command, args, env, unsetEnv }) => ({ command, args, env, unsetEnv })),
    generationPackages: plan.generationPackages,
    checks: {
      policy: plan.policy,
      catalog: plan.catalog,
      tokens: plan.tokens,
      docs: plan.docs,
      scale: plan.scale,
      reactTheme: plan.reactTheme,
      reactProjectionCheck: plan.reactProjectionCheck,
      reactPackageFull: plan.reactPackageFull,
      reactFamilies: plan.reactFamilies,
      reactBehaviorProofFamilies: plan.reactBehaviorProofFamilies,
      scopedEntrypointChecks: plan.scopedEntrypointChecks,
      reactTestFiles: plan.reactTestFiles,
      storyTooling: plan.storyTooling,
      storybookGenerationCheck: plan.storybookGenerationCheck,
      storyUnitTests: plan.storyUnitTests,
      packageChecks: plan.packageChecks,
      tailwind: plan.tailwind,
      fullWorkspace: plan.full,
    },
    storyRuns: plan.storyRuns,
    reasons: [...new Set(plan.reasons)],
  };
}

export async function runCiImpact({ preview = false, includeWorktree = false, environment = process.env } = {}) {
  const baseRef = environment.MUXUI_BASE_REF ?? (environment.GITHUB_BASE_REF ? `origin/${environment.GITHUB_BASE_REF}` : 'origin/main');
  const mergeBase = resolveMergeBase(baseRef);
  const config = (await loadPolicy(repositoryRoot)).pullRequestImpact;
  if (!config || config.schemaVersion !== 1) throw new Error('MUXUI_CI_IMPACT_POLICY_MISSING: pullRequestImpact schemaVersion 1 is required');
  const changedPaths = collectPullRequestPaths({ baseRef: mergeBase, includeWorktree });
  const packages = await discoverWorkspacePackages(repositoryRoot);
  const rootPackageBefore = changedPaths.includes('package.json') ? textAtRef(mergeBase, 'package.json') : undefined;
  const rootPackageAfter = changedPaths.includes('package.json') ? await currentText('package.json') : undefined;
  const reactPackageBefore = changedPaths.includes('packages/react/package.json')
    ? textAtRef(mergeBase, 'packages/react/package.json')
    : undefined;
  const reactPackageAfter = changedPaths.includes('packages/react/package.json')
    ? await currentText('packages/react/package.json')
    : undefined;
  const reactPackageImpact = reactPackageBefore !== undefined && reactPackageAfter !== undefined
    ? reactPackageWideChanges(reactPackageBefore, reactPackageAfter)
    : { pagesAffected: false };
  const workspaceWideRootChange = rootPackageBefore !== undefined && rootPackageAfter !== undefined
    && rootPackageWideChanges(rootPackageBefore, rootPackageAfter).full;
  const lockfileBefore = changedPaths.includes('pnpm-lock.yaml') ? textAtRef(mergeBase, 'pnpm-lock.yaml') : undefined;
  const lockfileAfter = changedPaths.includes('pnpm-lock.yaml') ? await currentText('pnpm-lock.yaml') : undefined;
  const lockfileImporters = changedPaths.includes('pnpm-lock.yaml') && lockfileBefore !== undefined && lockfileAfter !== undefined && !workspaceWideRootChange
    && !isPolicyOnlyLockfileChange(lockfileBefore, lockfileAfter)
    ? changedLockfileImporters(lockfileBefore, lockfileAfter)
    : [];
  const needsMetadata = needsStorybookGeneration(changedPaths, config, {
    packages,
    lockfileImporters,
    reactPackagePagesAffected: reactPackageImpact.pagesAffected,
  });
  let metadataPrepared = false;
  if (needsMetadata) {
    const [contractSource, manifestSource] = await Promise.all([
      currentText(reactContractPath),
      currentText(storybookManifestPath),
    ]);
    if (!contractSource || !manifestSource) {
      if (preview) {
        throw new Error('MUXUI_CI_IMPACT_METADATA_MISSING: run the scoped React/Storybook generation prerequisite before dry-run planning');
      }
      console.log('[ci-impact] metadata preparation: generate the React contract and Storybook page index required by this owner scope');
      run('pnpm', ['--filter', '@muxui/react-storybook', 'run', 'generate']);
      metadataPrepared = true;
    }
  }

  const records = needsMetadata ? await generatedReactRecords() : [];
  const pageIndex = needsMetadata ? await generatedStoryIndex() : [];
  const reactSourceChanged = changedPaths.some((path) => path.startsWith('packages/react/src/') && /\.(?:mjs|css)$/u.test(path));
  const moduleSources = reactSourceChanged ? await reactModuleSources(mergeBase) : {};
  const componentTestSources = reactSourceChanged ? await reactTestSources() : {};
  const readBaseText = async (path) => textAtRef(mergeBase, path);
  const readHeadText = currentText;
  const plan = await buildPullRequestImpact({
    changedPaths,
    config,
    records,
    pageIndex,
    packages,
    readBaseText,
    readHeadText,
    moduleSources,
    componentTestSources,
    rootPackageBefore,
    rootPackageAfter,
    reactPackageBefore,
    reactPackageAfter,
    lockfileBefore,
    lockfileAfter,
  });

  const commands = executionCommands(plan, { packages, metadataPrepared, environment });
  const report = planReport(plan, { baseRef, mergeBase, metadataPrepared, commands });
  console.log(`[ci-impact] changed paths=${changedPaths.join(', ') || '(none)'}`);
  console.log(`[ci-impact] plan=${JSON.stringify(report, null, 2)}`);
  if (preview) {
    console.log('[ci-impact] preview complete; no checks executed');
  } else {
    await execute(commands);
  }
  return report;
}

const cliArgs = process.argv.slice(2);
const preview = cliArgs.some((arg) => arg === '--dry-run' || arg === '--preview');
const includeWorktree = cliArgs.includes('--include-worktree');
const unknownArgs = cliArgs.filter((arg) => !['--dry-run', '--preview', '--include-worktree'].includes(arg));
if (unknownArgs.length > 0) throw new Error(`MUXUI_CI_IMPACT_ARGUMENT_UNKNOWN: ${unknownArgs.join(', ')}`);
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCiImpact({ preview, includeWorktree });
}

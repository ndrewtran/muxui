import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { pathToFileURL } from 'node:url';
import { analyzeReactSourceChange, analyzeReactStyleChange, localModuleImports } from './component-source-impact.mjs';
import { planReuse, reuseBlockedPath, reuseCommandTimeoutMs, reuseSummary } from './ci-reuse.mjs';
import { prerequisitesReadyVariable } from './prepare-prerequisites.mjs';
import { compareStorybookGeneratorEmissions } from './storybook-generator-impact.mjs';
import { dependencyClosure, familyRecordsFromContract } from './scoped-verification.mjs';
import { componentTestSelection, familyRouteFiles } from './component-test-selection.mjs';
import { loadPolicy, normalizePath } from './policy.mjs';
import { discoverWorkspacePackages } from './workspace-packages.mjs';

const repositoryRoot = resolve(process.env.MUXUI_TASK_REPOSITORY_ROOT ?? resolve(import.meta.dirname, '../../../..'));
const reactContractPath = 'packages/react/generated/r1-6-contract.json';
const reactDescriptorPath = 'packages/react/generated/descriptor.json';
const storybookManifestPath = 'apps/react-storybook/.storybook/generated/manifest.mjs';
const motionBoundaryTestFile = 'test/motion-package-boundary.test.mjs';
const catalogExampleTypesTestFile = 'test/catalog-examples-types.test.mjs';
const reactGeneratorPath = 'packages/react/src/generate.mjs';
const tailwindFixture = 'tests/fixtures/tailwind-consumer';

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

function git(args, { cwd = repositoryRoot, allowFailure = false, timeout } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, timeout });
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
      // Empty records are written inline as `key: {}`.
      const child = line.match(/^ {2}([^ ].*?):(\s*\{\})?\s*$/u);
      if (child) {
        commit();
        key = child[1];
        body = child[2] ? ['{}'] : [];
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
  const changedRecords = (sectionName) => [...oldSections[sectionName]]
    .filter(([key, value]) => newSections[sectionName].has(key) && newSections[sectionName].get(key) !== value);
  const changedSnapshots = changedRecords('snapshotRecords');
  const removedSnapshots = [...oldSections.snapshotRecords.keys()].filter((key) => !newSections.snapshotRecords.has(key));
  // Each changed or removed record plans every importer that reaches it, as if
  // that importer changed: removals in the base graph, changes in either graph.
  const records = [
    ...changedSnapshots.map(([key]) => ({ key: unquoteLockKey(key), graphs: [oldSections, newSections] })),
    ...changedRecords('packageRecords').map(([key]) => ({ key: unquoteLockKey(key), graphs: [oldSections, newSections], isPackage: true })),
    ...removedSnapshots.map((key) => ({ key: unquoteLockKey(key), graphs: [oldSections] })),
  ];
  const consumers = new Set(changedImporters.map(unquoteLockKey));
  const reaches = new Map();
  const unmapped = [];
  for (const { key, graphs, isPackage } of records) {
    let mapped = false;
    for (const sections of graphs) {
      if (!reaches.has(sections)) reaches.set(sections, importerReach(sections));
      for (const [importer, reached] of reaches.get(sections)) {
        const consumes = isPackage ? [...reached].some((snapshot) => lockPackageKey(snapshot) === key) : reached.has(key);
        if (!consumes) continue;
        consumers.add(importer);
        mapped = true;
      }
    }
    if (!mapped) unmapped.push(key);
  }
  if (unmapped.length > 0) {
    throw new Error(`MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: changed or removed lockfile records reach no workspace importer: ${[...new Set(unmapped)].sort().join(', ')}; identify their consumers explicitly`);
  }
  if (consumers.size === 0) {
    throw new Error('MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: dependency resolutions changed without an importer change; map the changed resolution to its consumers');
  }
  const droppedFrom = [
    ...changedImporters.map((key) => [oldSections.importerRecords.get(key), newSections.importerRecords.get(key)]),
    ...changedSnapshots.map(([key, body]) => [body, newSections.snapshotRecords.get(key)]),
  ];
  if (!removedResolutionsAreExplained(oldSections, newSections, droppedFrom)) {
    throw new Error('MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: existing package resolutions were removed that no dropped importer or snapshot dependency exclusively reached; resolve all importers that consume those resolutions');
  }
  return [...consumers].sort();
}

function unquoteLockKey(key) {
  return key.replace(/^['"]|['"]$/gu, '');
}

// `name: version` (snapshot) or `name:\n  version: version` (importer) entries
// under the dependency sections of one lockfile record body.
function lockRecordDependencies(body) {
  const dependencies = [];
  let inDependencies = false;
  let name = null;
  for (const line of body.split('\n')) {
    const section = line.match(/^ {4}(\w+):\s*$/u);
    if (section) {
      inDependencies = ['dependencies', 'devDependencies', 'optionalDependencies'].includes(section[1]);
      continue;
    }
    if (!inDependencies) continue;
    const inline = line.match(/^ {6}([^ ].*?):\s+(\S.*)$/u);
    const nested = line.match(/^ {6}([^ ].*?):\s*$/u);
    const version = line.match(/^ {8}version:\s+(\S.*)$/u);
    if (inline) dependencies.push(lockDependencyKey(unquoteLockKey(inline[1]), unquoteLockKey(inline[2])));
    else if (nested) name = unquoteLockKey(nested[1]);
    else if (version && name) dependencies.push(lockDependencyKey(name, unquoteLockKey(version[1])));
  }
  return dependencies.filter((key) => !/@link:/u.test(key));
}

// An aliased dependency (`alias: name@1.0.0`) records its target snapshot key
// as the version. Peer suffixes such as `1.0.0(react@19.2.8)` and URL versions
// such as `https://…/x-1.0.0.tgz` or `git+ssh://git@…` are not aliases.
function lockDependencyKey(name, version) {
  return /^(@[^/@:]+\/)?[^@/:(]+@/u.test(version) ? version : `${name}@${version}`;
}

// `name@version(peer…)` snapshot keys share the `name@version` package key.
function lockPackageKey(snapshot) {
  return snapshot.replace(/\(.*$/u, '');
}

// Snapshot keys each importer transitively reaches. Workspace `link:`
// dependencies are skipped: a linked workspace is routed exactly as a direct
// edit to it would be, so its dependents are not planned. Any other
// dependency without a snapshot record leaves the graph unresolvable.
function importerReach(sections) {
  const graph = new Map([...sections.snapshotRecords].map(([key, body]) => [unquoteLockKey(key), lockRecordDependencies(body)]));
  return new Map([...sections.importerRecords].map(([importer, body]) => {
    const reached = new Set();
    const queue = lockRecordDependencies(body);
    while (queue.length > 0) {
      const key = queue.pop();
      if (reached.has(key)) continue;
      if (!graph.has(key)) {
        throw new Error(`MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: importer ${unquoteLockKey(importer)} reaches ${key}, which has no snapshot record; resolve the lockfile graph before mapping its consumers`);
      }
      reached.add(key);
      queue.push(...graph.get(key));
    }
    return [unquoteLockKey(importer), reached];
  }));
}

// A dependency removal prunes the records only that dependency reached. Every
// removed snapshot must be reachable from a dependency a changed importer or
// snapshot dropped (`droppedFrom` holds their base and head bodies), its
// package record must go with its last snapshot, and nothing left in the
// lockfile may still reference a removed snapshot.
function removedResolutionsAreExplained(oldSections, newSections, droppedFrom) {
  const removedSnapshots = [...oldSections.snapshotRecords.keys()].filter((key) => !newSections.snapshotRecords.has(key)).map(unquoteLockKey);
  const removedPackages = [...oldSections.packageRecords.keys()].filter((key) => !newSections.packageRecords.has(key)).map(unquoteLockKey);
  if (removedSnapshots.length === 0 && removedPackages.length === 0) return true;
  const oldGraph = new Map([...oldSections.snapshotRecords].map(([key, body]) => [unquoteLockKey(key), lockRecordDependencies(body)]));
  const queue = droppedFrom.flatMap(([before, after]) => {
    const remaining = new Set(lockRecordDependencies(after ?? ''));
    return lockRecordDependencies(before ?? '').filter((key) => !remaining.has(key));
  });
  const reachable = new Set();
  while (queue.length > 0) {
    const key = queue.shift();
    if (reachable.has(key) || !oldGraph.has(key)) continue;
    reachable.add(key);
    queue.push(...oldGraph.get(key));
  }
  if (removedSnapshots.some((key) => !reachable.has(key))) return false;
  const remainingPackages = new Set([...newSections.snapshotRecords.keys()].map((key) => lockPackageKey(unquoteLockKey(key))));
  const removedPackageKeys = new Set(removedSnapshots.map(lockPackageKey));
  if (removedPackages.some((key) => !removedPackageKeys.has(key) || remainingPackages.has(key))) return false;
  const removed = new Set(removedSnapshots);
  const stillReferenced = [...newSections.importerRecords.values(), ...newSections.snapshotRecords.values()]
    .some((body) => lockRecordDependencies(body).some((key) => removed.has(key)));
  return !stillReferenced;
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
    // A checkout without React tests (fixture repositories) has no sources.
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
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

// Tracked files outside packages/react/src whose text names `needle`.
async function trackedReferences(needle) {
  const result = git(['grep', '-l', '-z', '-F', '-e', needle, '--', '.', ':!packages/react/src'], { allowFailure: true });
  if (result.status > 1) throw new Error(`MUXUI_CI_IMPACT_GIT_FAILED: git grep ${needle} exited ${result.status}`);
  return result.stdout.toString('utf8').split('\0').filter(Boolean).map(normalizePath).sort();
}

// Every text file under packages/react/test, keyed `test/...`, for helper scans.
async function reactTestReferenceTexts() {
  const root = resolve(repositoryRoot, 'packages/react/test');
  const sources = {};
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && /\.(?:mjs|tsx?|html|json)$/u.test(entry.name)) {
        sources[`test/${fullPath.slice(root.length + 1).replaceAll('\\', '/')}`] = await readFile(fullPath, 'utf8');
      }
    }
  }
  await visit(root);
  return sources;
}

// Test files that reach a React test helper through static imports or path
// strings (browser entries, HTML pages). A file references the helper when
// its text names the helper's file name after a path or quote boundary;
// matches transitively through other helpers and fixtures.
export function reactTestFilesReferencing(helperPath, sources) {
  const reached = new Set([helperPath]);
  const queue = [helperPath];
  while (queue.length > 0) {
    const fileName = queue.shift().split('/').at(-1);
    const pattern = new RegExp(`(?:^|[/'"\`\\s])${fileName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|['"\`\\s?#])`, 'mu');
    for (const [path, text] of Object.entries(sources)) {
      if (!reached.has(path) && pattern.test(text)) {
        reached.add(path);
        queue.push(path);
      }
    }
  }
  return [...reached].filter((path) => path.endsWith('.test.mjs')).sort();
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

// True when the plan will be full anyway, so lockfile importer mapping is
// skipped. Full-workspace inputs such as `pnpm-workspace.yaml` overrides may
// rewrite lockfile settings that no single importer owns.
export function isWorkspaceWideChange(changedPaths, config, rootPackageBefore, rootPackageAfter) {
  return changedPaths.some((path) => config.fullInputPaths.includes(path))
    || (rootPackageBefore !== undefined && rootPackageAfter !== undefined
      && rootPackageWideChanges(rootPackageBefore, rootPackageAfter).full);
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
    storybookFamilies(records).forEach((family) => addUnique(plan.storyFamilies, family));
    plan.tailwind = true;
    return 'React renderer and all direct component consumers';
  }
  if (packageName === '@muxui/react-storybook') {
    storybookFamilies(records).forEach((family) => addUnique(plan.storyFamilies, family));
    plan.storyTooling = true;
    return 'Storybook renderer and all emitted pages';
  }

  return packageName;
}

// Applies a workspace package's impact; packages without a dedicated plan
// flag run their own package check.
function routePackage(plan, packageName, records) {
  const description = applyPackageImpact(plan, packageName, records);
  if (description === packageName) plan.packageChecks.add(packageName);
  return description;
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
  return owner.name;
}

// Package-relative paths a dependent can consume: `src/`, plus the manifest
// `files` entries and `exports`, `main`, and `bin` targets.
function shippedPath(file, manifest) {
  if (file.startsWith('src/')) return true;
  const targets = [];
  const collect = (value) => {
    if (typeof value === 'string') targets.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  [manifest.exports, manifest.main, manifest.bin].forEach(collect);
  return [...(manifest.files ?? []), ...targets].some((entry) => {
    const target = entry.replace(/^\.\//u, '').replace(/\*.*$/u, '');
    return target.endsWith('/') ? file.startsWith(target) : file === target || file.startsWith(`${target}/`);
  });
}

// The workspace package whose dependents a changed path can affect, with
// `manifest: true` for its package.json (dependents are affected only when a
// runtime field changes). Canonical sources outside any package belong to the
// package that reads them (`packageSourceOwners`). Inside a package only
// shipped paths count; tests, guidance, notices, and licenses need only the
// package's own check.
// Known limits: unexported generator inputs (such as
// packages/catalog/catalog-sources.json and packages/tooling/command-registry.json)
// plan no dependents although they shape generated exports, and
// packages/react/README.md plans no dependents although docs renders it.
function dependentFacingPackage(path, packages, config) {
  const sourceOwner = Object.entries(config.packageSourceOwners ?? {}).find(([prefix]) => matches(path, [prefix]))?.[1];
  if (sourceOwner) return { name: sourceOwner, manifest: false };
  const owner = packageByPath(path, packages);
  if (!owner) return null;
  const file = path.slice(owner.path.length + 1);
  if (file === 'package.json') return { name: owner.name, manifest: true };
  if (/^(?:README|AGENTS|NOTICE|LICENSE)(?:\.|$)/iu.test(file.split('/').at(-1)) || file.startsWith('licenses/')) return null;
  return shippedPath(file, owner.manifest) ? { name: owner.name, manifest: false } : null;
}

// Direct dependents whose proof a changed package's own route already scopes:
// React source and CSS ownership select the Storybook families, and token
// routes plan the React theme and Storybook theme and chrome proofs. An edge
// is scoped when either its upstream or the originally changed package lists
// the dependent, so tokens -> catalog -> React keeps React at its theme proof.
// React's catalog devDependency serves only its prepack script: React source
// and tests never import @muxui/catalog, and the React catalog and component
// routes already plan the canonical inputs React reads directly.
const scopedDependents = {
  '@muxui/catalog': ['@muxui/react'],
  '@muxui/react': ['@muxui/react-storybook'],
  '@muxui/tokens': ['@muxui/react', '@muxui/react-storybook'],
};

const linkSpec = /^(?:workspace|link):/u;

// Workspaces that depend on a changed package through a `workspace:` or
// `link:` spec in their package.json. A runtime edge (`dependencies`,
// `peerDependencies`) plans the dependent as if it changed (`scope: 'package'`)
// and passes the change on transitively. A devDependency-only edge plans just
// the dependent's own package check (`scope: 'check'`) and stops there; a
// runtime edge wins when both reach a dependent. Scoped edges plan nothing
// extra, but a scoped runtime edge still passes the change on.
export function workspaceDependentRoutes(packages, changedNames) {
  const routes = new Map();
  const reached = new Set(changedNames.map((name) => `${name}\0${name}`));
  const queue = changedNames.map((name) => ({ upstream: name, origin: name }));
  while (queue.length > 0) {
    const { upstream, origin } = queue.shift();
    for (const { name, manifest } of packages) {
      const runtime = ['dependencies', 'peerDependencies'].some((field) => linkSpec.test(manifest[field]?.[upstream] ?? ''));
      if (!runtime && !linkSpec.test(manifest.devDependencies?.[upstream] ?? '')) continue;
      if (![upstream, origin].some((source) => scopedDependents[source]?.includes(name))) {
        if (runtime && routes.get(name)?.scope !== 'package') routes.set(name, { via: upstream, scope: 'package' });
        else if (!routes.has(name)) routes.set(name, { via: upstream, scope: 'check' });
      }
      const key = `${origin}\0${name}`;
      if (!runtime || reached.has(key)) continue;
      reached.add(key);
      queue.push({ upstream: name, origin });
    }
  }
  return [...routes].map(([name, route]) => ({ name, ...route })).sort((left, right) => left.name.localeCompare(right.name));
}

function requirePackage(packages, name, path) {
  if (!packages.some((item) => item.name === name)) {
    throw new Error(`MUXUI_CI_IMPACT_OWNER_MISSING: ${path} names unknown owner ${name}`);
  }
  return name;
}

function storybookFamilies(records) {
  return records.map((record) => record.export ?? record.family).sort();
}

function storybookFamilyFor(records, family) {
  const record = records.find((candidate) => candidate.family === family);
  if (!record) throw new Error(`MUXUI_CI_IMPACT_COMPONENT_RECORD_MISSING: ${family}`);
  return record.export ?? record.family;
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
  if (file === 'test/storybook-audit-failures.mjs' || file === 'test/storybook-audit-failures.test.mjs') {
    return { file: 'test/storybook-audit-failures.test.mjs' };
  }
  // Shared Storybook config files that unit tests read directly.
  if (file === '.storybook/main.mjs') {
    return exact('test/storybook.test.mjs', ['showcase does not expose React Aria as a public import']);
  }
  if (file === '.storybook/measure-palette.mjs') {
    return exact('test/storybook-colors.test.mjs', ['Storybook canvas palette adapter rejects upstream drift and removes generated alpha']);
  }
  if (file === '.storybook/preview.css') {
    return [
      exact('test/storybook.test.mjs', [
        'preview exposes the Mux UI theme and direction host contract',
        'manager projection covers internal chrome and keeps docs syntax scoped',
      ]),
      exact('test/storybook-colors.test.mjs', [
        'Storybook colour declarations reference Mux tokens, including values that happen to match the palette',
      ]),
    ];
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
  const routes = storybookUnitRoute(path);
  if (!routes) {
    throw new Error(`MUXUI_CI_IMPACT_STORY_TOOLING_TEST_MISSING: ${path} has no focused unit-test route`);
  }
  for (const route of [routes].flat()) addStoryUnitTest(plan, route);
}

function addStoryUnitTest(plan, route) {
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
  // Either route runs Scale's docs browser test, which builds the docs site.
  if (plan.docs || plan.scale) names.add('@muxui/docs');
  if (plan.scale) names.add('@muxui/scale');
  // Every React test and the Tailwind consumer import generated React output.
  if (plan.reactTheme || plan.reactProjectionCheck || plan.reactPackageFull || plan.reactFamilies.length > 0
    || plan.reactTestFiles?.length > 0 || plan.tailwind) {
    names.add('@muxui/react');
  }
  // Story proofs and Storybook unit tests read the generated page index.
  if (plan.storyTooling || plan.storybookGenerationCheck || plan.storyRuns?.length > 0) {
    names.add('@muxui/react-storybook');
  }
  return [...names].filter((name) => packages.some((item) => item.name === name));
}

// Each group generates these once, serially, before its checks; package
// scripts then skip their standalone prerequisite generation.
export function scopedGenerationPackages(plan, packages) {
  return dependencyClosure(packages, selectedCheckOwners(plan, packages))
    .filter(({ manifest }) => typeof manifest.scripts?.generate === 'string')
    .map(({ name }) => name);
}

function normalizeTaskPaths(changedPaths) {
  return [...new Set(changedPaths.map(normalizePath).filter(Boolean))].sort();
}

function refreshStoryRuns(plan, pageIndex) {
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
  if (plan.storyTheme) {
    // Component proof runs full axe (color-contrast included) and the same
    // colour audit on every page of its families, so theme proof skips them.
    const componentFamilies = new Set(plan.storyFamilies);
    const allConsumer = plan.themeFamilies.length === 0 && plan.themeStoryIds.length === 0;
    if (componentFamilies.size === 0 || plan.themeStoryIds.length > 0 || (allConsumer && pageIndex.length === 0)) {
      plan.storyRuns.push({
        proof: 'theme',
        families: plan.themeFamilies,
        storyIds: plan.themeStoryIds,
        reason: allConsumer ? 'all-consumer theme contrast proof' : 'theme contrast proof for the affected CSS consumer pages',
      });
    } else {
      const candidates = allConsumer
        ? pageIndex.filter(({ stories }) => stories.some(({ exportName }) => exportName !== 'BrowserProof')).map(({ family }) => family)
        : plan.themeFamilies;
      const families = [...new Set(candidates)].filter((family) => !componentFamilies.has(family)).sort();
      if (families.length > 0) plan.storyRuns.push({
        proof: 'theme',
        families,
        storyIds: [],
        reason: 'theme contrast proof for consumer pages outside the component proof families',
      });
    }
  }
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
  reactTestReferenceSources = {},
  findReferences = async () => [],
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
  const reactGeneratorPaths = [];
  // Files outside packages/react/src can name a React module by path (tests,
  // browser entries, apps, catalog inputs). A deleted module's referencing
  // files are routed through their own owners as though they changed.
  const routedPaths = [...changed];
  for (const path of changed.filter((candidate) => candidate.startsWith('packages/react/src/') && candidate.endsWith('.mjs'))) {
    if (await readHeadText(path) !== null) continue;
    for (const reference of await findReferences(path.slice('packages/react/'.length))) {
      if (routedPaths.includes(reference) || reference.startsWith('packages/react/src/')) continue;
      routedPaths.push(reference);
      plan.reasons.push(`${reference} references deleted ${path}; validate its owner`);
    }
  }

  for (const path of routedPaths) {
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
    // Canonical React catalog inputs route to each verified reader: the React
    // projection compiler, policy release preparation, package tests, and the
    // Storybook unit tests that read them.
    const catalogReaders = Object.entries(config.reactCatalogInputReaders ?? {}).find(([prefix]) => matches(path, [prefix]))?.[1];
    if (catalogReaders) {
      if (catalogReaders.reactGenerator) reactGeneratorPaths.push(path);
      if (catalogReaders.policy) plan.policy = true;
      for (const name of catalogReaders.packageChecks ?? []) routePackage(plan, requirePackage(packages, name, path), records);
      for (const { file, names } of catalogReaders.storybookUnitTests ?? []) {
        plan.storyTooling = true;
        addStoryUnitTest(plan, { file, testNamePattern: names.map((name) => `^${name}$`).join('|') });
      }
      plan.reasons.push(`${path} is a canonical React catalog input; validate its readers`);
      continue;
    }
    const fixtureOwner = Object.entries(config.packageFixtureOwners ?? {}).find(([prefix]) => matches(path, [prefix]))?.[1];
    if (fixtureOwner) {
      routePackage(plan, requirePackage(packages, fixtureOwner, path), records);
      plan.reasons.push(`${path} is a fixture read by ${fixtureOwner} tests`);
      continue;
    }
    if (path.startsWith(`${tailwindFixture}/`)) {
      plan.tailwind = true;
      plan.reasons.push(`${path} is the Tailwind consumer fixture`);
      continue;
    }
    // Docs also embeds source it imports by path (Scale's App), so a path can
    // select both the documentation and its owning application.
    const documentationInput = matches(path, config.documentationPrefixes);
    if (documentationInput) {
      plan.docs = true;
      plan.reasons.push(`${path} is owned by or embedded in the documentation application`);
    }
    if (path.startsWith('apps/scale/')) {
      plan.scale = true;
      plan.reasons.push(`${path} is owned by the theme authoring application`);
      continue;
    }
    if (documentationInput) continue;

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
        storybookFamilies(records).forEach((family) => plan.storyFamilies.add(family));
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
      const testPath = path.slice('packages/react/'.length);
      if (testPath.endsWith('.test.mjs')) {
        plan.reactTestFiles.add(testPath);
        plan.reasons.push(`${path} is React proof code; run only the changed test file`);
      } else if (testPath === 'test/tsconfig.json' || testPath.endsWith('.tsx')) {
        // Only the React package check (and component checks) run this typecheck.
        plan.packageChecks.add('@muxui/react');
        plan.reasons.push(`${path} is React type-test input; run the React package check that typechecks it`);
      } else {
        const testFiles = reactTestFilesReferencing(testPath, reactTestReferenceSources);
        if (testFiles.length === 0 && await readHeadText(path) !== null) {
          throw new Error(`MUXUI_CI_IMPACT_REACT_TEST_OWNER_MISSING: ${path} is not referenced by any React test file; reference it from a test or remove it`);
        }
        testFiles.forEach((file) => plan.reactTestFiles.add(file));
        plan.reasons.push(`${path} is a shared React test helper; run the test files that reference it`);
      }
      continue;
    }

    if (path.startsWith('apps/react-storybook/')) {
      const chrome = config.reactStorybookChromePaths.includes(path);
      const shared = config.reactStorybookSharedPaths.includes(path);
      if (chrome || shared) {
        // A config file can shape both the manager chrome and every page.
        if (chrome) {
          plan.storyChrome = true;
          plan.reasons.push(`${path} changes Storybook manager chrome`);
        }
        if (shared) {
          storybookFamilies(records).forEach((family) => plan.storyFamilies.add(family));
          plan.reasons.push(`${path} is shared by every Storybook page`);
        }
        if (storybookUnitRoute(path)) {
          plan.storyTooling = true;
          addStoryUnitRoute(plan, path);
        }
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
        if (impact.pagesAffected) storybookFamilies(records).forEach((family) => plan.storyFamilies.add(family));
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
        plan.storyFamilies.add(record.export ?? record.family);
        plan.catalog = true;
        // Docs render every component record.
        plan.docs = true;
        plan.reasons.push(`${path} changes the canonical component record for ${record.family}`);
      } else if (/\/examples\/react\/[^/]+\.(?:tsx|example\.json)$/u.test(path)) {
        const owners = routeCatalogExample(path, pageIndex);
        plan.catalog = true;
        // Docs load every React example, and the React example type test
        // compiles every example source.
        plan.docs = true;
        if (path.endsWith('.tsx')) plan.reactTestFiles.add(catalogExampleTypesTestFile);
        if (owners.length > 0) {
          for (const owner of owners) {
            plan.storyIds.add(owner.id);
            plan.storyIdFamilies.set(owner.id, owner.family);
          }
          plan.reasons.push(`${path} is checked against its canonical Storybook page mapping`);
          continue;
        }
        if (!record) throw new Error(`MUXUI_CI_IMPACT_COMPONENT_RECORD_MISSING: ${path} names no canonical React component ${parts[2]}`);
        plan.reactFamilies.add(record.family);
        plan.reasons.push(`${path} is a React example no Storybook story uses; validate the catalog, docs, and ${record.family} React proof`);
      } else if (path.includes('/examples/react/')) {
        // Docs and the example type test read only `.tsx` sources.
        throw new Error(`MUXUI_CI_IMPACT_EXAMPLE_SOURCE_UNSUPPORTED: ${path}; React examples are .tsx sources with .example.json records`);
      } else {
        plan.catalog = true;
        plan.reasons.push(`${path} is a catalog-owned input`);
      }
      continue;
    }

    // Guide bytes feed the catalog digest pinned by @muxui/tooling dense
    // goldens, and docs renders every guide. No renderer or Storybook page
    // reads guides, so per-family usage guides need no family route.
    if (path.startsWith('catalog/guides/')) {
      plan.catalog = true;
      plan.docs = true;
      plan.packageChecks.add('@muxui/tooling');
      plan.reasons.push(`${path} is a canonical guide; validate the catalog, its dense goldens, and the docs that render it`);
      continue;
    }
    if (path.startsWith('catalog/capabilities/')) {
      plan.catalog = true;
      plan.reasons.push(`${path} is a canonical capability record compiled into the catalog`);
      continue;
    }

    const packageOwner = packageByPath(path, packages);
    if (packageOwner) {
      const { name } = packageOwner;
      routePackage(plan, name, records);
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
  const changedPackages = new Set();
  if (changed.includes('pnpm-lock.yaml') && lockfileBefore !== undefined && lockfileAfter !== undefined) {
    if (isPolicyOnlyLockfileChange(lockfileBefore, lockfileAfter)) {
      plan.policy = true;
      plan.reasons.push('pnpm-lock.yaml changes only the repository-policy importer and adds its parser resolutions');
    } else if (plan.fullReasons.length === 0) {
      for (const importer of changedLockfileImporters(lockfileBefore, lockfileAfter)) {
        changedPackages.add(routeLockfileImporter(plan, importer, packages, records));
      }
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
  // The projection compiler and every local module it imports (at base or
  // head) shape every generated family, as do its canonical catalog inputs.
  const generatorModules = new Set([reactGeneratorPath]);
  const importsBySide = reactSourcePaths.length === 0 ? { before: new Map(), after: new Map() } : {
    before: localModuleImports(moduleSources, 'before'),
    after: localModuleImports(moduleSources, 'after'),
  };
  for (const side of ['before', 'after']) {
    const imports = importsBySide[side];
    const queue = [reactGeneratorPath];
    while (queue.length > 0) {
      for (const target of imports.get(queue.shift()) ?? []) {
        if (!generatorModules.has(target)) {
          generatorModules.add(target);
          queue.push(target);
        }
      }
    }
  }
  reactGeneratorPaths.push(...reactSourcePaths.filter((path) => generatorModules.has(path)));
  if (reactGeneratorPaths.length > 0) {
    plan.reactPackageFull = true;
    plan.reactProjectionCheck = false;
    storybookFamilies(records).forEach((family) => plan.storyFamilies.add(family));
    plan.tailwind = true;
    plan.reasons.push(`React projection compiler inputs changed (${reactGeneratorPaths.join(', ')}); every canonical React family is affected`);
  }
  const baseImporters = new Set([...importsBySide.before.values()].flat());
  for (const path of reactSourcePaths) {
    if (generatorModules.has(path)) continue;
    const headSource = await readHeadText(path);
    // A deleted module that no base module imported cannot change any family;
    // the React package check regenerates and tests the package without it.
    if (headSource === null && !baseImporters.has(path) && !records.some((record) => record.source === path)) {
      plan.packageChecks.add('@muxui/react');
      plan.reasons.push(`${path} was deleted and no React module imported it; run the React package check`);
      continue;
    }
    const before = await readBaseText(path) ?? '';
    const after = headSource ?? '';
    const impact = analyzeReactSourceChange({ before, after, sourcePath: path, records, moduleSources });
    impact.families.forEach((family) => {
      plan.reactFamilies.add(family);
      plan.storyFamilies.add(storybookFamilyFor(records, family));
    });
    if (impact.families.length > 0) plan.reasons.push(impact.reason ?? `${path} changed exported ${impact.families.join(', ')}`);
  }
  // Family routing cannot see bundle leaks (Motion pulled into unrelated
  // public exports), so every runtime change also runs the bundle boundary test
  // unless a full or package-wide React check already runs it.
  if (reactSourcePaths.length > 0 && !plan.reactPackageFull && !plan.packageChecks.has('@muxui/react')) {
    plan.reactTestFiles.add(motionBoundaryTestFile);
    plan.reasons.push('React runtime source changed; verify public export bundles keep their Motion boundary');
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
        plan.storyFamilies.add(storybookFamilyFor(records, family));
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

  // A React source change reaches dependents only when its analysis found a
  // family, theme, or package-wide impact.
  const reactSourceImpact = plan.reactFamilies.size > 0 || plan.themeFamilies.size > 0 || plan.reactPackageFull;
  for (const path of routedPaths) {
    const owner = dependentFacingPackage(path, packages, config);
    if (!owner) continue;
    if (owner.manifest) {
      const [before, after] = path === 'packages/react/package.json' && reactPackageBefore !== undefined
        ? [reactPackageBefore, reactPackageAfter]
        : [await readBaseText(path), await readHeadText(path)];
      // The runtime package boundary fields apply to every workspace manifest.
      if (!reactPackageWideChanges(before, after).pagesAffected) continue;
    }
    if (path.startsWith('packages/react/src/') && /\.(?:mjs|css)$/u.test(path) && !reactSourceImpact) continue;
    changedPackages.add(owner.name);
  }
  for (const { name, via, scope } of workspaceDependentRoutes(packages, [...changedPackages].sort())) {
    if (scope === 'package') {
      routePackage(plan, name, records);
      plan.reasons.push(`${name} depends on changed ${via} through a workspace link; plan it as if it changed`);
    } else {
      plan.packageChecks.add(name);
      plan.reasons.push(`${name} has a workspace devDependency on changed ${via}; run its package check`);
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
    const behaviorProofFamilies = selectedRecords.flatMap((record) => {
      const family = record.family;
      const storyFamily = record.export ?? family;
      const page = pageIndex.find((candidate) => candidate.family === storyFamily);
      return page?.stories.some((story) => story.exportName === 'BrowserProof') ? [family] : [];
    });
    const selection = componentTestSelection(selectedRecords, Object.keys(componentTestSources), {
      includeSharedSource: false,
      testSources: componentTestSources,
      behaviorProofFamilies,
    });
    componentRoutedTestFiles = new Set(selection.files);
    plan.reactBehaviorProofFamilies = selection.behaviorProofFamilies;
    // A family proven only by its Storybook BrowserProof needs that page even
    // when no other page of the family is selected.
    for (const family of selection.behaviorProofFamilies) {
      const storyFamily = storybookFamilyFor(records, family);
      if (plan.storyFamilies.includes(storyFamily)) continue;
      const proof = pageIndex.find((page) => page.family === storyFamily).stories.find((story) => story.exportName === 'BrowserProof');
      plan.storyIds = [...new Set([...plan.storyIds, proof.id])].sort();
      plan.storyIdFamilies[proof.id] = storyFamily;
    }
  }
  plan.reactTestFiles = [...plan.reactTestFiles].filter((file) => !componentRoutedTestFiles.has(file)).sort();
  // Every catalog input changes the catalog digest that @muxui/tooling dense
  // goldens pin.
  if (plan.catalog) plan.packageChecks.add('@muxui/tooling');
  // The full React check already runs the React package check.
  if (plan.reactPackageFull) plan.packageChecks.delete('@muxui/react');
  plan.packageChecks = [...plan.packageChecks].sort();
  if (plan.reactFamilies.length > 0) requireScopedEntrypoint(plan, packages, 'react');
  const refreshed = refreshStoryRuns(plan, pageIndex);
  if (refreshed.storyRuns.length > 0) requireScopedEntrypoint(refreshed, packages, 'storybook');
  refreshed.scopedEntrypointChecks = [...refreshed.scopedEntrypointChecks].sort();
  refreshed.generationPackages = scopedGenerationPackages(refreshed, packages);
  return refreshed;
}

export function needsStorybookGeneration(paths, config, {
  packages = [], lockfileImporters = [], reactPackagePagesAffected = false,
} = {}) {
  const sourceNeedsMetadata = paths.some((path) => path.startsWith('packages/react/src/')
    || (path === 'packages/react/package.json' && reactPackagePagesAffected)
    || (path.startsWith('catalog/components/') && (/\/artifact\.json$/u.test(path)
      || /\/examples\/react\/[^/]+\.(?:tsx|example\.json)$/u.test(path)))
    || path.startsWith('apps/react-storybook/src/')
    || path.startsWith('apps/react-storybook/test/')
    || path.startsWith('apps/react-storybook/.storybook/')
    || path === 'apps/react-storybook/package.json'
    || matches(path, config.themePrefixes)
    || Object.keys(config.reactCatalogInputReaders ?? {}).some((prefix) => matches(path, [prefix]))
    || config.reactStorybookSharedPaths.includes(path)
    || config.reactStorybookChromePaths.includes(path)
    || config.reactStorybookGeneratorPaths.includes(path)
    || path.startsWith('apps/react-storybook/.storybook/generated/'));
  if (sourceNeedsMetadata) return true;

  const metadataOwners = ['@muxui/react', '@muxui/react-storybook', '@muxui/tokens', '@muxui/foundation'];
  const importerOwners = lockfileImporters.map((importer) => packageByPath(importer, packages)?.name).filter(Boolean);
  if (importerOwners.some((name) => metadataOwners.includes(name))) return true;
  // A dependent routed as if it changed reads the same records.
  const changedPackages = [
    ...paths.map((path) => dependentFacingPackage(path, packages, config)?.name).filter(Boolean),
    ...importerOwners,
  ];
  return workspaceDependentRoutes(packages, [...new Set(changedPackages)])
    .some(({ name, scope }) => scope === 'package' && metadataOwners.includes(name));
}

export function normalizeCommand(command) {
  if (!command || typeof command.command !== 'string' || !Array.isArray(command.args)) {
    throw new Error('MUXUI_CI_IMPACT_COMMAND_INVALID: commands require a command string and argument array');
  }
  return {
    command: command.command,
    args: command.args,
    env: command.env ?? {},
    unsetEnv: command.unsetEnv ?? [],
    // Prerequisites (install/generation) stop the run on failure because later
    // results would be meaningless; every other command is a collect-all check.
    ...(command.prerequisite ? { prerequisite: true } : {}),
  };
}

function pnpmCommand(args, { env = {}, unsetEnv = [], prerequisite = false } = {}) {
  return normalizeCommand({ command: 'pnpm', args, env, unsetEnv, prerequisite });
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

// CI shards large Storybook page selections by family so one job stays inside
// the scoped audit timeouts in apps/react-storybook/test.
// 80 pages keeps the scoped formula (120 s + 6 s/page) near its 600 s cap.
export const storyShardPageBudget = 80;

const sharedGroup = '*';
const workspaceRootPackage = '@muxui/workspace';
const groupTimeoutMinutes = { checks: 30, react: 30, browser: 30, tailwind: 15, storybook: 30 };
const fullStorybookEnvironment = {
  MUXUI_STORYBOOK_AUDIT_EVENT: 'check:all',
  MUXUI_STORYBOOK_AUDIT_FORCE: '1',
};
const storybookSelectionKeys = [
  'MUXUI_STORYBOOK_AUDIT_PROOF', 'MUXUI_STORYBOOK_FAMILIES', 'MUXUI_STORYBOOK_STORY_IDS',
  'MUXUI_STORYBOOK_FAMILY_FILTER', 'MUXUI_STORYBOOK_FAMILY', 'MUXUI_COMPONENT_FAMILIES',
];

function storyRunPageCounts(storyRun, pageIndex) {
  const counts = new Map();
  const add = (family) => counts.set(family, (counts.get(family) ?? 0) + 1);
  if (storyRun.storyIds.length > 0) {
    for (const page of pageIndex) {
      for (const story of page.stories) if (storyRun.storyIds.includes(story.id)) add(page.family);
    }
    return counts;
  }
  const families = new Set(storyRun.families);
  for (const page of pageIndex) {
    if (storyRun.families.length > 0 && !families.has(page.family)) continue;
    for (const story of page.stories) {
      if (storyRun.proof !== 'theme' || story.exportName !== 'BrowserProof') add(page.family);
    }
  }
  return counts;
}

// Splits a story run over ceil(pages / budget) shards of consecutive families,
// balanced by page count (a shard may exceed the budget by at most one family).
// Families with no selected pages are dropped; a run within budget (or chrome
// proof, which selects no pages) stays whole.
export function shardStoryRun(storyRun, pageIndex = [], budget = storyShardPageBudget) {
  if (storyRun.proof === 'chrome' || pageIndex.length === 0) return [storyRun];
  const counts = storyRunPageCounts(storyRun, pageIndex);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total <= budget) return [storyRun];
  const families = (storyRun.families.length > 0 ? storyRun.families : [...counts.keys()])
    .filter((family) => (counts.get(family) ?? 0) > 0);
  const shardCount = Math.ceil(total / budget);
  const chunks = Array.from({ length: shardCount }, () => []);
  let before = 0;
  for (const family of families) {
    const count = counts.get(family);
    // Each family goes to the shard containing its middle page.
    chunks[Math.min(shardCount - 1, Math.floor(((before + count / 2) * shardCount) / total))].push(family);
    before += count;
  }
  const familyOfStory = new Map(pageIndex.flatMap(({ family, stories }) => stories.map(({ id }) => [id, family])));
  return chunks.filter((chunk) => chunk.length > 0).map((chunk) => ({
    ...storyRun,
    families: chunk,
    storyIds: storyRun.storyIds.filter((id) => chunk.includes(familyOfStory.get(id))),
  }));
}

// A React browser test opts into Firefox and WebKit by calling the harness's
// browserEngines(). Commands that run one carry MUXUI_BROWSER_ENGINES, and the
// workflow installs those engines only for their groups (see groupBrowserEngines).
const crossEngineEnvironment = { MUXUI_BROWSER_ENGINES: 'chromium,firefox,webkit' };

// True when the source calls browserEngines(); a mention in a comment or
// string does not opt in.
export function callsBrowserEngines(source) {
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    return false;
  }
  const visit = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(visit);
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'browserEngines') return true;
    return Object.entries(node).some(([key, value]) => !['start', 'end', 'loc', 'range'].includes(key) && typeof value === 'object' && visit(value));
  };
  return visit(ast);
}

// Reads the planner's React test sources (paths relative to packages/react),
// falling back to the checkout for plans that loaded none.
function runsInEveryEngine(testFile, testSources = {}) {
  let source = testSources[testFile];
  if (source === undefined) {
    try {
      source = readFileSync(resolve(repositoryRoot, 'packages/react', testFile), 'utf8');
    } catch {
      return false;
    }
  }
  return callsBrowserEngines(source);
}

// The Playwright-managed engines a group's commands need, space-separated for
// the workflow install step; empty when the group runs Chrome alone.
export function groupBrowserEngines(commands) {
  const engines = new Set(commands.flatMap(({ env = {} }) => (env.MUXUI_BROWSER_ENGINES ?? '').split(',')));
  return ['firefox', 'webkit'].filter((engine) => engines.has(engine)).join(' ');
}

function storybookTestFiles() {
  return readdirSync(resolve(repositoryRoot, 'apps/react-storybook/test'))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => `test/${name}`);
}

// Scale's `check:browser:docs` builds `apps/docs/dist` and then serves it, so a
// failed docs build fails only this command, never later checks.
function addScaleDocsBrowserCommand(add) {
  add('browser', ['--filter', '@muxui/scale', 'run', 'check:browser:docs']);
}

function fullPlannedCommands(environment) {
  const planned = [];
  const add = (group, args, options) => planned.push({ group, command: pnpmCommand(args, options) });
  const storybookEnv = {
    ...fullStorybookEnvironment,
    MUXUI_STORYBOOK_A11Y_WORKERS: '1',
    MUXUI_STORYBOOK_COLORS_WORKERS: '2',
    ...(environment.RUNNER_TEMP ? { MUXUI_STORYBOOK_COLORS_ARTIFACT_DIR: `${environment.RUNNER_TEMP}/storybook-colour-audit` } : {}),
  };
  const nodeTest = ['--filter', '@muxui/react-storybook', 'exec', 'node', '--test', '--test-concurrency=1'];
  const a11yFile = 'test/storybook-a11y.test.mjs';
  // `pnpm check:all` split into independent groups: full generation, then each
  // package's own check script, with React and Storybook in their own jobs.
  add(sharedGroup, ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present', 'run', 'generate'], { prerequisite: true });
  // Exclusion-only filters select the workspace root too; its `check` script is
  // the affected-scope runner, not a package check, so exclude it explicitly.
  add('checks', [
    '--recursive', '--sort', '--workspace-concurrency=1', '--if-present', '--no-bail',
    '--filter', `!${workspaceRootPackage}`, '--filter', '!@muxui/react', '--filter', '!@muxui/react-storybook', 'run', 'check',
  ], { unsetEnv: storybookSelectionKeys });
  add('checks', ['generate:check']);
  add('react', ['--filter', '@muxui/react', 'run', 'check']);
  add('browser', ['--filter', '@muxui/scale', 'run', 'check:browser']);
  add('browser', ['--filter', '@muxui/react', 'run', 'check:browser'], { env: crossEngineEnvironment });
  addScaleDocsBrowserCommand(add);
  add('storybook-a11y', [...nodeTest, a11yFile], { env: storybookEnv, unsetEnv: storybookSelectionKeys });
  add('storybook', ['--filter', '@muxui/react-storybook', 'run', 'generate:check']);
  add('storybook', [...nodeTest, ...storybookTestFiles().filter((file) => file !== a11yFile)], {
    env: storybookEnv, unsetEnv: storybookSelectionKeys,
  });
  add('tailwind', ['--dir', 'tests/fixtures/tailwind-consumer', 'install', '--ignore-workspace', '--frozen-lockfile'], { prerequisite: true });
  add('tailwind', ['--dir', 'tests/fixtures/tailwind-consumer', 'run', 'check']);
  return planned;
}

function plannedCommands(plan, {
  packages = [], metadataPrepared = false, environment = process.env, pageIndex = [], testSources = {},
} = {}) {
  const planned = [];
  const add = (group, args, options) => planned.push({ group, command: pnpmCommand(args, options) });
  const requiredEntrypoints = new Set(plan.scopedEntrypointChecks ?? []);
  if (!plan.full && !plan.reactPackageFull && plan.reactFamilies?.length > 0) requiredEntrypoints.add('react');
  if (!plan.full && plan.storyRuns?.length > 0) requiredEntrypoints.add('storybook');
  validateScopedEntrypoints(packages, [...requiredEntrypoints]);
  if (plan.full) return fullPlannedCommands(environment);

  // Every group repeats this generation in its own fresh runner. Only skip
  // what metadata preparation already generated earlier in this same process:
  // `@muxui/react-storybook generate` covers `@muxui/react...` plus itself.
  let generationPackages = plan.generationPackages ?? scopedGenerationPackages(plan, packages);
  if (metadataPrepared) {
    const preparedNames = new Set(['@muxui/react-storybook', ...dependencyClosure(packages, ['@muxui/react']).map(({ name }) => name)]);
    generationPackages = generationPackages.filter((name) => !preparedNames.has(name));
  }
  if (generationPackages.length > 0) {
    const args = ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present'];
    for (const name of generationPackages) args.push('--filter', name);
    args.push('run', 'generate');
    add(sharedGroup, args, { prerequisite: true });
  }

  if (plan.policy) add('checks', ['--filter', '@muxui/repository-policy', 'run', 'check']);
  if (plan.catalog) add('checks', ['--filter', '@muxui/catalog', 'run', 'check']);
  if (plan.tokens) add('checks', ['--filter', '@muxui/tokens', 'run', 'check']);
  if (plan.docs) add('checks', ['--filter', '@muxui/docs', 'run', 'check']);
  if (plan.scale) {
    add('checks', ['--filter', '@muxui/scale', 'run', 'check']);
    add('browser', ['--filter', '@muxui/scale', 'run', 'check:browser']);
  }
  if (plan.reactTheme) {
    add('react', ['--filter', '@muxui/react', 'run', 'generate:check']);
    add('react', ['--filter', '@muxui/react', 'exec', 'node', '--test', 'test/style-scopes.test.mjs', 'test/styling-tokens.test.mjs']);
  }
  if (plan.reactProjectionCheck && !plan.reactPackageFull && !plan.reactTheme) {
    add('react', ['--filter', '@muxui/react', 'run', 'generate:check']);
  }
  if (plan.reactPackageFull) {
    add('react', ['--filter', '@muxui/react', 'run', 'check']);
    add('browser', ['--filter', '@muxui/react', 'run', 'check:browser'], { env: crossEngineEnvironment });
  } else if (plan.reactFamilies.length > 0) {
    const env = {
      MUXUI_COMPONENT_FAMILIES: plan.reactFamilies.join(','),
      MUXUI_COMPONENT_INCLUDE_SHARED_SOURCE: '0',
      ...(plan.reactBehaviorProofFamilies.length ? { MUXUI_COMPONENT_BROWSER_PROOF_FAMILIES: plan.reactBehaviorProofFamilies.join(',') } : {}),
      ...(plan.reactFamilies.some((family) => familyRouteFiles(family).some((file) => runsInEveryEngine(file, testSources))) ? crossEngineEnvironment : {}),
    };
    add('react', scopedEntrypointArgs('react', packages), {
      env,
      unsetEnv: ['MUXUI_COMPONENT_BROWSER_PROOF_FAMILIES'],
    });
  }
  if (plan.docs || plan.scale) addScaleDocsBrowserCommand(add);
  for (const testFile of plan.reactTestFiles) {
    add('react', ['--filter', '@muxui/react', 'exec', 'node', '--test', '--test-concurrency=1', testFile], {
      env: runsInEveryEngine(testFile, testSources) ? crossEngineEnvironment : {},
    });
  }
  for (const packageName of plan.packageChecks) add('checks', ['--filter', packageName, 'run', 'check']);
  if (plan.storyTooling || plan.storybookGenerationCheck) {
    add('checks', ['--filter', '@muxui/react-storybook', 'run', 'generate:check']);
  }
  if (plan.storyTooling) {
    for (const { file, testNamePattern } of plan.storyUnitTests) {
      add('checks', [
        '--filter', '@muxui/react-storybook', 'exec', 'node', '--test',
        ...(testNamePattern ? [`--test-name-pattern=${testNamePattern}`] : []),
        file,
      ], {
        unsetEnv: ['MUXUI_STORYBOOK_AUDIT_PROOF', 'MUXUI_STORYBOOK_FAMILIES', 'MUXUI_STORYBOOK_STORY_IDS'],
      });
    }
  }
  for (const storyRun of plan.storyRuns) {
    const shards = shardStoryRun(storyRun, pageIndex);
    shards.forEach((shard, index) => {
      add(`storybook-${storyRun.proof}${shards.length > 1 ? `-${index + 1}` : ''}`, scopedEntrypointArgs('storybook', packages), {
        env: storyProofEnvironment(shard, environment),
        unsetEnv: ['MUXUI_STORYBOOK_FAMILIES', 'MUXUI_STORYBOOK_STORY_IDS'],
      });
      planned.at(-1).storyRun = { proof: shard.proof, families: shard.families };
    });
  }
  if (plan.tailwind) {
    add('tailwind', ['--dir', 'tests/fixtures/tailwind-consumer', 'install', '--ignore-workspace', '--frozen-lockfile'], { prerequisite: true });
    add('tailwind', ['--dir', 'tests/fixtures/tailwind-consumer', 'run', 'check']);
  }
  return planned;
}

// Serial command list for running the whole plan in one process.
export function executionCommands(plan, options = {}) {
  return plannedCommands(plan, options).map(({ command }) => command);
}

// Independent CI jobs: each group repeats the shared prerequisites (generation)
// so it can run alone in a fresh runner.
export function executionGroups(plan, options = {}) {
  const planned = plannedCommands(plan, options);
  const shared = planned.filter(({ group }) => group === sharedGroup).map(({ command }) => command);
  const groups = new Map();
  const storyRuns = new Map();
  for (const { group, command, storyRun } of planned) {
    if (group === sharedGroup) continue;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(command);
    if (storyRun) storyRuns.set(group, storyRun);
  }
  return [...groups].map(([id, commands]) => {
    const kind = id.startsWith('storybook') ? 'storybook' : id;
    return {
      id,
      kind,
      timeoutMinutes: groupTimeoutMinutes[kind],
      browserEngines: groupBrowserEngines(commands),
      commands: [...shared, ...commands],
      // Scoped Storybook groups keep their page selection for reuse decisions.
      ...(storyRuns.has(id) ? { storyRun: storyRuns.get(id) } : {}),
    };
  });
}

export function executeCommand(command, {
  spawn = spawnSync,
  cwd = repositoryRoot,
  environment = process.env,
} = {}) {
  const normalized = normalizeCommand(command);
  const env = { ...environment };
  for (const key of normalized.unsetEnv) delete env[key];
  Object.assign(env, normalized.env);
  const result = spawn(normalized.command, normalized.args, { cwd, stdio: 'inherit', env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

// Planned commands run after the plan's shared generation (or, for a scoped
// plan, the metadata preparation it replaces), so package scripts skip their
// standalone prerequisite generation instead of writing generated output again.
export function preparedCommandRunner(environment = process.env, { spawn = spawnSync } = {}) {
  const prepared = { ...environment, [prerequisitesReadyVariable]: '1' };
  return (command) => executeCommand(command, { environment: prepared, spawn });
}

const commandLine = (command) => [command.command, ...command.args].join(' ');

// Runs every check and reports all failures at the end; a failed prerequisite
// stops immediately. Exits with the first failure's status when anything failed.
export function executeCommands(commands, {
  commandRunner = executeCommand,
  log = console.log,
  logError = console.error,
  exit = process.exit,
} = {}) {
  const failures = [];
  const finish = () => {
    if (failures.length === 0) return failures;
    logError(`[ci-impact] ${failures.length} of ${commands.length} command(s) failed:`);
    for (const { command, status } of failures) logError(`[ci-impact]   exit ${status}: ${commandLine(command)}`);
    exit(failures[0].status);
    return failures;
  };
  for (const [index, command] of commands.map(normalizeCommand).entries()) {
    log(`[ci-impact] command: ${commandLine(command)}`);
    if (Object.keys(command.env).length > 0) log(`[ci-impact] command env: ${JSON.stringify(command.env)}`);
    const status = commandRunner(command);
    if (status === 0) continue;
    failures.push({ command, status });
    if (command.prerequisite) {
      logError(`[ci-impact] prerequisite failed; skipping the remaining ${commands.length - index - 1} command(s)`);
      return finish();
    }
  }
  return finish();
}

function storybookGenerationCommand() {
  return pnpmCommand(['--filter', '@muxui/react-storybook', 'run', 'generate']);
}

export async function prepareStorybookMetadata({
  needsMetadata,
  preview = false,
  readCurrentText = currentText,
  commandRunner = executeCommand,
  log = console.log,
} = {}) {
  if (!needsMetadata) return false;
  const [contractSource, manifestSource] = await Promise.all([
    readCurrentText(reactContractPath),
    readCurrentText(storybookManifestPath),
  ]);
  if (contractSource && manifestSource) return false;
  if (preview) {
    throw new Error('MUXUI_CI_IMPACT_METADATA_MISSING: run the scoped React/Storybook generation prerequisite before dry-run planning');
  }
  log('[ci-impact] metadata preparation: generate the React contract and Storybook page index required by this owner scope');
  const status = commandRunner(storybookGenerationCommand());
  if (status !== 0) {
    console.error(`[ci-impact] metadata preparation failed with exit ${status}; skipping all checks`);
    process.exit(status);
  }
  return true;
}

function planReport(plan, { baseRef, mergeBase, metadataPrepared, groups }) {
  return {
    schemaVersion: plan.schemaVersion,
    baseRef,
    mergeBase,
    changedPaths: plan.changedPaths,
    decision: plan.full ? 'full-workspace' : 'owner-scoped',
    fullReasons: plan.fullReasons,
    metadataPreparation: metadataPrepared ? ['@muxui/react-storybook generate'] : [],
    preparationCommands: metadataPrepared ? [storybookGenerationCommand()] : [],
    groups,
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

// The push/schedule/manual plan: the whole workspace graph without a diff.
export function fullWorkspacePlan(reason = 'full workspace graph requested') {
  return {
    schemaVersion: 1,
    changedPaths: [],
    full: true,
    fullReasons: [reason],
    generationPackages: [],
    scopedEntrypointChecks: [],
    storyRuns: [],
    reasons: [`full workspace proof: ${reason}`],
  };
}

// The GitHub Actions matrix: one entry per independently runnable group.
// `reusedFrom` and `browserEngines` are always strings so workflow `if:`
// comparisons stay exact.
export function groupMatrix(groups, decisions = []) {
  return groups.map(({ id, kind, timeoutMinutes, browserEngines = '' }) => ({
    id, kind, timeoutMinutes, browserEngines, reusedFrom: decisions.find((decision) => decision.id === id)?.reusedFrom ?? '',
  }));
}

// Plans the owner-scoped checks for `changedPaths` between `base` and the
// current worktree; the pull-request plan and the reuse delta plan share it.
async function planAgainstBase({ base: mergeBase, changedPaths, preview }) {
  const config = (await loadPolicy(repositoryRoot)).pullRequestImpact;
  if (!config || config.schemaVersion !== 1) throw new Error('MUXUI_CI_IMPACT_POLICY_MISSING: pullRequestImpact schemaVersion 1 is required');
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
  const workspaceWideRootChange = isWorkspaceWideChange(changedPaths, config, rootPackageBefore, rootPackageAfter);
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
  const metadataPrepared = await prepareStorybookMetadata({ needsMetadata, preview });

  const records = needsMetadata ? await generatedReactRecords() : [];
  const pageIndex = needsMetadata ? await generatedStoryIndex() : [];
  const reactSourceChanged = changedPaths.some((path) => path.startsWith('packages/react/src/') && /\.(?:mjs|css)$/u.test(path));
  const moduleSources = reactSourceChanged ? await reactModuleSources(mergeBase) : {};
  // Any route that selects React families (source, CSS, catalog records) needs the test sources.
  const componentTestSources = needsMetadata ? await reactTestSources() : {};
  const reactModuleDeleted = (await Promise.all(changedPaths
    .filter((path) => path.startsWith('packages/react/src/') && path.endsWith('.mjs'))
    .map(async (path) => await currentText(path) === null))).some(Boolean);
  // Deleted modules can be referenced from test helpers, so their references
  // need the same helper scan as a helper change.
  const reactTestHelperChanged = reactModuleDeleted
    || changedPaths.some((path) => path.startsWith('packages/react/test/') && !path.endsWith('.test.mjs'));
  const reactTestReferenceSources = reactTestHelperChanged ? await reactTestReferenceTexts() : {};
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
    reactTestReferenceSources,
    findReferences: trackedReferences,
    rootPackageBefore,
    rootPackageAfter,
    reactPackageBefore,
    reactPackageAfter,
    lockfileBefore,
    lockfileAfter,
  });
  return { plan, packages, pageIndex, metadataPrepared, testSources: componentTestSources };
}

async function pullRequestPlan({ preview, includeWorktree, environment }) {
  const baseRef = environment.MUXUI_BASE_REF ?? (environment.GITHUB_BASE_REF ? `origin/${environment.GITHUB_BASE_REF}` : 'origin/main');
  const mergeBase = resolveMergeBase(baseRef);
  const changedPaths = collectPullRequestPaths({ baseRef: mergeBase, includeWorktree });
  return { ...(await planAgainstBase({ base: mergeBase, changedPaths, preview })), baseRef, mergeBase };
}

function ensureCommit(commit) {
  if (!/^[0-9a-f]{40}$/u.test(commit ?? '')) throw new Error(`MUXUI_CI_REUSE_COMMIT_INVALID: ${commit}`);
  if (git(['cat-file', '-e', `${commit}^{commit}`], { allowFailure: true }).status !== 0) {
    git(['fetch', '--no-tags', '--quiet', 'origin', commit], { timeout: reuseCommandTimeoutMs });
  }
}

// Paths that differ between two commits. A direct tree diff (not merge-base)
// so commits that a force-push dropped still count as changes.
export function changedPathsBetween(from, to = 'HEAD') {
  ensureCommit(from);
  if (to !== 'HEAD') ensureCommit(to);
  return [...new Set(parseNameStatus(git(['diff', '--name-status', '-z', '--find-renames', from, to]).stdout))].sort();
}

// The reuse delta: what the planner would run for the changes from an earlier
// tested commit to HEAD.
export async function deltaImpact(testedCommit, { environment = process.env } = {}) {
  const changedPaths = changedPathsBetween(testedCommit);
  if (changedPaths.length === 0 || changedPaths.some(reuseBlockedPath)) return { changedPaths };
  // Preview mode: a delta that needs Storybook metadata the current plan did
  // not prepare throws, which means no reuse rather than extra generation.
  const { plan, packages, pageIndex, metadataPrepared } = await planAgainstBase({ base: testedCommit, changedPaths, preview: true });
  if (plan.full) return { changedPaths, full: plan.fullReasons.join('; ') };
  const groups = executionGroups(plan, { packages, metadataPrepared, environment, pageIndex });
  const familyOfStory = new Map(pageIndex.flatMap(({ family, stories }) => stories.map(({ id }) => [id, family])));
  return {
    changedPaths,
    groupIds: groups.map(({ id }) => id),
    storyTooling: plan.storyTooling,
    storyRuns: plan.storyRuns.map(({ proof, families, storyIds }) => ({
      proof,
      // An unknown story ID selects every family.
      families: storyIds.some((id) => !familyOfStory.has(id))
        ? []
        : [...new Set([...families, ...storyIds.map((id) => familyOfStory.get(id))])].sort(),
    })),
  };
}

// Directories of the packages a group's commands operate on plus their
// dependency closure; null when any command's package scope is not explicit.
export function groupPackageDirectories(commands, packages) {
  const roots = new Set();
  const directories = new Set();
  for (const { args } of commands) {
    const filters = args.filter((_, index) => args[index - 1] === '--filter');
    const directory = args[args.indexOf('--dir') + 1];
    if (args.includes('--dir')) {
      if (directory !== tailwindFixture) return null;
      // The fixture consumes the published React and token outputs.
      directories.add(tailwindFixture);
      roots.add('@muxui/react').add('@muxui/tokens');
    } else if (filters.length === 0) {
      return null;
    }
    filters.forEach((name) => roots.add(name));
  }
  if ([...roots].some((name) => !packages.some((item) => item.name === name))) return null;
  const closure = dependencyClosure(packages, [...roots]).map(({ path }) => path);
  return [...new Set([...closure, ...directories])].sort();
}

// Decides which groups an earlier run of this PR already proved, then writes
// this run's reuse record and step summary. Reuse problems never fail planning.
async function writeReuse({ plan, full, groups, packages, reuseRecord, reuseClient, environment }) {
  try {
    const head = git(['rev-parse', 'HEAD']).stdout.toString('utf8').trim();
    const { decisions, record } = await planReuse({
      groups: groups.map((group) => ({ ...group, packageDirectories: groupPackageDirectories(group.commands, packages) })),
      head,
      full: full || plan.full,
      environment,
      client: reuseClient,
      deltaFor: (testedCommit) => deltaImpact(testedCommit, { environment }),
      headChangesFor: (earlierHead) => changedPathsBetween(earlierHead, environment.MUXUI_PR_HEAD_SHA),
    });
    if (record) await writeFile(reuseRecord, `${JSON.stringify(record, null, 2)}\n`);
    if (environment.GITHUB_STEP_SUMMARY) await appendFile(environment.GITHUB_STEP_SUMMARY, reuseSummary(decisions));
    return decisions;
  } catch (error) {
    console.log(`[ci-reuse] reuse failed; running every group: ${error.message}`);
    return [];
  }
}

// --preview plans from existing metadata and fails if it is missing; --plan
// (the CI plan job) prepares metadata on a fresh checkout but runs no checks.
export function executionMode({ preview = false, planOnly = false, group = null } = {}) {
  return {
    prepareMetadata: !preview,
    run: preview || planOnly ? 'none' : group ? 'group' : 'all',
  };
}

export async function runCiImpact({
  preview = false, planOnly = false, includeWorktree = false, full = false, group = null, githubOutput = false,
  reuseRecord = null, reuseClient = null, environment = process.env,
} = {}) {
  const mode = executionMode({ preview, planOnly, group });
  const context = full
    ? {
      plan: fullWorkspacePlan(`${environment.GITHUB_EVENT_NAME ?? 'local'} runs the full workspace graph`),
      packages: await discoverWorkspacePackages(repositoryRoot),
      pageIndex: [],
      baseRef: null,
      mergeBase: null,
      metadataPrepared: false,
    }
    : await pullRequestPlan({ preview: !mode.prepareMetadata, includeWorktree, environment });
  const { plan, packages, pageIndex, baseRef, mergeBase, metadataPrepared, testSources } = context;
  const options = { packages, metadataPrepared, environment, pageIndex, testSources };
  const groups = executionGroups(plan, options);
  const report = planReport(plan, { baseRef, mergeBase, metadataPrepared, groups });
  const reuse = reuseRecord ? await writeReuse({ plan, full, groups, packages, reuseRecord, reuseClient, environment }) : [];
  const matrix = groupMatrix(groups, reuse);
  console.log(`[ci-impact] changed paths=${plan.changedPaths.join(', ') || '(none)'}`);
  console.log(`[ci-impact] plan=${JSON.stringify(report, null, 2)}`);
  console.log(`[ci-impact] groups=${JSON.stringify(matrix)}`);
  if (githubOutput) {
    if (!environment.GITHUB_OUTPUT) throw new Error('MUXUI_CI_IMPACT_GITHUB_OUTPUT_MISSING: --github-output needs GITHUB_OUTPUT');
    await appendFile(environment.GITHUB_OUTPUT, `groups=${JSON.stringify(matrix)}\n`);
  }
  if (mode.run === 'none') {
    console.log('[ci-impact] planning complete; no checks executed');
  } else if (mode.run === 'group') {
    const selected = groups.find(({ id }) => id === group);
    if (!selected) {
      throw new Error(`MUXUI_CI_IMPACT_GROUP_UNKNOWN: ${group} is not in this plan (${groups.map(({ id }) => id).join(', ') || 'no groups'})`);
    }
    console.log(`[ci-impact] running group ${selected.id} (${selected.commands.length} command(s))`);
    executeCommands(selected.commands, { commandRunner: preparedCommandRunner(environment) });
  } else {
    executeCommands(executionCommands(plan, options), { commandRunner: preparedCommandRunner(environment) });
  }
  return report;
}

export function parseCliArguments(args) {
  const options = {
    preview: false, planOnly: false, includeWorktree: false, full: false, group: null, githubOutput: false, reuseRecord: null,
  };
  const flags = {
    '--dry-run': 'preview',
    '--preview': 'preview',
    '--plan': 'planOnly',
    '--include-worktree': 'includeWorktree',
    '--full': 'full',
    '--github-output': 'githubOutput',
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (flags[arg]) options[flags[arg]] = true;
    else if (arg === '--group' && args[index + 1] && !args[index + 1].startsWith('--')) options.group = args[++index];
    else if (arg === '--reuse-record' && args[index + 1] && !args[index + 1].startsWith('--')) options.reuseRecord = args[++index];
    else throw new Error(`MUXUI_CI_IMPACT_ARGUMENT_UNKNOWN: ${arg}`);
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCiImpact(parseCliArguments(process.argv.slice(2)));
}

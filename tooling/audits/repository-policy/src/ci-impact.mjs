import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { pathToFileURL } from 'node:url';
import { analyzeReactSourceChange, analyzeReactStyleChange, isReactModuleSource, localModuleImports } from './component-source-impact.mjs';
import { planReuse, reuseBlockedPath, reuseCommandTimeoutMs, reuseSummary } from './ci-reuse.mjs';
import { prerequisitesReadyVariable } from './prepare-prerequisites.mjs';
import { compareStorybookGeneratorEmissions } from './storybook-generator-impact.mjs';
import { dependencyClosure, dependencyOrder, familyRecordsFromContract } from './scoped-verification.mjs';
import { componentTestSelection, isBrowserTestFile, sourceGuardTests, testNamePattern } from './component-test-selection.mjs';
import { loadPolicy, normalizePath } from './policy.mjs';
import { changedPatternSlugs, patternBrowserTest, patternParticipants } from './pattern-variants.mjs';
import { discoverWorkspacePackages } from './workspace-packages.mjs';

const repositoryRoot = resolve(process.env.MUXUI_TASK_REPOSITORY_ROOT ?? resolve(import.meta.dirname, '../../../..'));
const reactContractPath = 'packages/react/generated/r1-6-contract.json';
const reactDescriptorPath = 'packages/react/generated/descriptor.json';
const storybookManifestPath = 'apps/react-storybook/.storybook/generated/manifest.mjs';
const motionBoundaryTestFile = 'test/motion-package-boundary.test.mjs';
const catalogExampleTypesTestFile = 'test/catalog-examples-types.test.mjs';
// The check of the public type surface against the declarations from before the TypeScript moves, and
// the controls that show it can fail. Any React source can change that surface, and the fixtures and
// harness decide what it proves.
const publicSurfaceTestFile = 'test/public-surface-baseline.test.mjs';
const publicSurfaceControlsTestFile = 'test/public-surface-controls.test.mjs';
const patternManifestPath = 'packages/catalog/catalog-sources.json';
const componentDocsTestFile = 'test/component-docs.test.mjs';
const componentReferencePath = 'apps/component-reference.mjs';
const guideLinksPath = 'apps/guide-links.mjs';
// A family's own usage guide, which its Storybook Docs page shows: `<family-slug>-usage.md` and its record.
const familyUsageGuidePath = /^catalog\/guides\/([a-z0-9-]+)-usage\.(?:md|json)$/u;
// The shared accessibility guide, whose support status and verification sections every family's Docs page shows.
const accessibilityGuidePath = /^catalog\/guides\/accessibility\.(?:md|json)$/u;
// A family's derived web.react API (Decision 0031), which the catalog merges into its component record.
const derivedApiPath = /^packages\/react\/api\/([a-z0-9-]+)\.json$/u;
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

// An importer the head lockfile no longer lists, whose package left the workspace.
function isRemovedWorkspaceImporter(importer, packages, lockfileAfter) {
  if (packageByPath(importer, packages)) return false;
  return ![...lockfileSections(lockfileAfter).importerRecords.keys()].map(unquoteLockKey).includes(importer);
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

// Every family's Storybook Docs page embeds its catalog record, canonical example sources, usage guide and
// Block relations (apps/react-storybook/src/component-docs.mjs). An edit to any of them plans Storybook
// generation and its drift check plus the Docs page test, not the browser audit.
function addComponentDocsProof(plan) {
  plan.storyTooling = true;
  addStoryUnitTest(plan, { file: componentDocsTestFile });
}

// A change to a family's compiled component record: its React and Storybook
// proof, the catalog, the docs that render every record, and its Docs page.
function routeComponentRecord(plan, record) {
  plan.reactFamilies.add(record.family);
  plan.storyFamilies.add(record.export ?? record.family);
  plan.catalog = true;
  plan.docs = true;
  addComponentDocsProof(plan);
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
      else if (entry.isFile() && isReactModuleSource(`packages/react/src/${entry.name}`)) currentFiles.push(fullPath);
    }
  }
  await visit(root);
  const basePaths = git(['ls-tree', '-r', '--name-only', baseRef, '--', 'packages/react/src'], { allowFailure: true });
  if (basePaths.status !== 0) throw new Error(`MUXUI_CI_IMPACT_BASE_SOURCE_MISSING: cannot list React source at ${baseRef}`);
  const paths = new Set([
    ...basePaths.stdout.toString('utf8').split('\n').filter(isReactModuleSource),
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

// The public-surface tests a change to one of their inputs reruns: the frozen declarations and their
// records run the check, and the harness (and the runner it shares) runs the check and its controls.
export function publicSurfaceTestsFor(path) {
  if (path.startsWith('packages/react/test/fixtures/public-surface-')) return [publicSurfaceTestFile];
  if (path.startsWith('packages/react/test/support/public-surface-') || path === 'packages/react/test/support/declaration-surface.mjs') {
    return [publicSurfaceTestFile, publicSurfaceControlsTestFile];
  }
  return [];
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
    'browser', 'bin', 'files', 'sideEffects', 'dependencies', 'peerDependencies', 'optionalDependencies',
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

// Plans every Storybook page: each component family, and each Block page by
// story ID, since Blocks are not component families.
function addEveryStoryPage(plan, records, pageIndex) {
  const families = storybookFamilies(records);
  families.forEach((family) => addUnique(plan.storyFamilies, family));
  for (const page of pageIndex.filter(({ family }) => !families.includes(family))) {
    for (const story of page.stories) {
      plan.storyIds.add(story.id);
      plan.storyIdFamilies.set(story.id, page.family);
    }
  }
}

function applyPackageImpact(plan, packageName, records, pageIndex) {
  if (packageName === '@muxui/repository-policy') {
    plan.policy = true;
    // Reached through a dependency (tooling, catalog, schema, tokens) or its own
    // lockfile importer: the evidence tests load those, so they run too.
    plan.evidence = true;
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
    addEveryStoryPage(plan, records, pageIndex);
    plan.tailwind = true;
    return 'React renderer and all direct component consumers';
  }
  if (packageName === '@muxui/react-storybook') {
    addEveryStoryPage(plan, records, pageIndex);
    plan.storyTooling = true;
    return 'Storybook renderer and all emitted pages';
  }

  return packageName;
}

// Applies a workspace package's impact; packages without a dedicated plan
// flag run their own package check.
function routePackage(plan, packageName, records, pageIndex) {
  const description = applyPackageImpact(plan, packageName, records, pageIndex);
  if (description === packageName) plan.packageChecks.add(packageName);
  return description;
}

function routeLockfileImporter(plan, importer, packages, records, pageIndex) {
  const owner = packageByPath(importer, packages);
  if (!owner || owner.path !== importer) {
    throw new Error(`MUXUI_CI_IMPACT_LOCKFILE_OWNER_MISSING: importer ${importer} has no current workspace package owner`);
  }
  const description = applyPackageImpact(plan, owner.name, records, pageIndex);
  if (!['@muxui/repository-policy', '@muxui/catalog', '@muxui/tokens', '@muxui/docs', '@muxui/scale', '@muxui/react', '@muxui/react-storybook'].includes(owner.name)) {
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
// Unexported generator inputs a package ships through its generated output
// (such as packages/catalog/catalog-sources.json) are listed in
// `packageSourceOwners` too. Known limit: packages/react/README.md plans no
// dependents although docs renders it.
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
// The catalog's devDependency on React orders generation: the catalog compiles
// React's derived APIs (Decision 0031), so it is unscoped and a React source
// change plans the catalog check. Storybook's catalog devDependency only
// generates the bundle its component docs query; the catalog routes already
// plan the Storybook proofs a catalog change needs.
const scopedDependents = {
  '@muxui/catalog': ['@muxui/react-storybook'],
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
  if (file === 'test/helpers/storybook-index.mjs' || file === 'test/storybook-page-selection.mjs'
      || file === 'test/storybook-page-selection.test.mjs' || file === 'src/check-scoped.mjs') {
    return { file: 'test/storybook-page-selection.test.mjs' };
  }
  if (file === 'test/storybook-family-selection.mjs' || file === 'test/storybook-family-selection.test.mjs') {
    return { file: 'test/storybook-family-selection.test.mjs' };
  }
  // The Block naming rules the generator and the family selection both use.
  if (file === 'src/block-pages.mjs') {
    return [{ file: 'test/block-pages.test.mjs' }, { file: 'test/storybook-family-selection.test.mjs' }];
  }
  if (file === 'test/block-pages.test.mjs') return { file: 'test/block-pages.test.mjs' };
  // The component Docs page: its catalog projection, its layout, and the test that renders every family's entry.
  if (file === 'src/component-docs.mjs' || file === '.storybook/component-docs-page.mjs' || file === 'test/component-docs.test.mjs') {
    return { file: 'test/component-docs.test.mjs' };
  }
  if (file === 'test/storybook-colors-report.mjs' || file === 'test/storybook-colors-report.test.mjs') {
    return { file: 'test/storybook-colors-report.test.mjs' };
  }
  if (file === 'test/storybook-audit-failures.mjs' || file === 'test/storybook-audit-failures.test.mjs') {
    return { file: 'test/storybook-audit-failures.test.mjs' };
  }
  // Shared Storybook config files that unit tests read directly. The jsdom unit
  // file runs whole; the colour and a11y files also hold browser audits, so
  // only their pure unit cases are pinned by title.
  if (file === '.storybook/main.mjs' || file === 'test/storybook.test.mjs') return { file: 'test/storybook.test.mjs' };
  if (file === '.storybook/measure-palette.mjs') {
    return exact('test/storybook-colors.test.mjs', ['Storybook canvas palette adapter rejects upstream drift and removes generated alpha']);
  }
  if (file === '.storybook/preview.css') {
    return [
      { file: 'test/storybook.test.mjs' },
      exact('test/storybook-colors.test.mjs', [
        'Storybook colour declarations reference Mux tokens, including values that happen to match the palette',
      ]),
    ];
  }
  return null;
}

// Adds the focused unit tests for a Storybook tooling path; false when the path
// has no focused route.
function addStoryUnitRoute(plan, path) {
  const routes = storybookUnitRoute(path);
  if (!routes) return false;
  for (const route of [routes].flat()) addStoryUnitTest(plan, route);
  return true;
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
  if (plan.policy || plan.evidence) {
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

// A block's browser test is the file `test/browser/pattern-<slug>.test.mjs` in the
// React package, when the checkout has it: adding the file is the whole declaration.
const blockBrowserTest = (slug) => patternBrowserTest(resolve(repositoryRoot, 'packages/react'), slug);

// The retained-evidence tests (`check:evidence`, about a minute) run when a
// change reaches something they load or read, not for every policy-routed path.
// `pullRequestImpact` names those inputs three ways:
// - `evidenceInputs`: path prefixes (a directory ends in a slash);
// - `evidenceInputPatterns`: regular expressions for path classes a prefix
//   cannot name, such as every package manifest;
// - `evidencePresenceInputs`: files the tests only look up by name, where adding
//   or removing one counts and editing it does not.
// Changes to the packages policy depends on reach the tests through the
// dependent routes instead.
const startsWithAny = (path, prefixes) => prefixes.some((prefix) => path.startsWith(prefix));

export function isEvidenceInput(path, config) {
  return startsWithAny(path, config.evidenceInputs) || config.evidenceInputPatterns.some((source) => new RegExp(source, 'u').test(path));
}

function assertEvidenceInputs(config) {
  for (const key of ['evidenceInputs', 'evidenceInputPatterns', 'evidencePresenceInputs']) {
    if (!Array.isArray(config[key]) || config[key].some((entry) => typeof entry !== 'string' || entry === '')) {
      throw new Error(`MUXUI_CI_IMPACT_POLICY_INVALID: pullRequestImpact.${key} must list the retained-evidence test inputs as non-empty strings`);
    }
  }
  for (const source of config.evidenceInputPatterns) {
    try {
      new RegExp(source, 'u');
    } catch (error) {
      throw new Error(`MUXUI_CI_IMPACT_POLICY_INVALID: pullRequestImpact.evidenceInputPatterns entry ${JSON.stringify(source)} is not a regular expression (${error.message})`);
    }
  }
}

// Plans every generated Block page whose variants live in the pattern's directory.
function addPatternPages(plan, slug, pageIndex) {
  for (const page of pageIndex) {
    for (const story of page.stories) {
      if (!story.source?.startsWith(`catalog/patterns/${slug}/`)) continue;
      plan.storyIds.add(story.id);
      plan.storyIdFamilies.set(story.id, page.family);
    }
  }
}

export async function buildPullRequestImpact({
  changedPaths,
  config,
  records,
  pageIndex,
  patterns = [],
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
  assertEvidenceInputs(config);
  const plan = {
    schemaVersion: 1,
    changedPaths: changed,
    full: false,
    fullReasons: [],
    policy: false,
    evidence: false,
    docs: false,
    scale: false,
    catalog: false,
    tokens: false,
    reactTheme: false,
    reactProjectionCheck: false,
    reactPackageFull: false,
    reactFamilies: new Set(),
    reactBehaviorProofFamilies: [],
    reactComponentTests: [],
    reactComponentTestNames: {},
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
    notices: [],
  };
  const missing = [];
  const reactGeneratorPaths = [];
  // A route the planner cannot resolve widens the plan instead of failing it;
  // the notice says what widened and why.
  const widen = (message) => {
    plan.notices.push(message);
    plan.reasons.push(message);
  };
  const addCompleteStorybookProof = () => {
    addEveryStoryPage(plan, records, pageIndex);
    for (const file of storybookTestFiles()) {
      for (const route of [storybookUnitRoute(`apps/react-storybook/${file}`) ?? { file }].flat()) addStoryUnitTest(plan, route);
    }
  };
  // A Storybook tooling file with no focused unit route: a test file runs
  // itself, and any other file (a helper whose importers are unknown) gets the
  // complete Storybook proof: every page and every Storybook unit test.
  const routeStoryUnit = (path) => {
    plan.storyTooling = true;
    if (addStoryUnitRoute(plan, path)) return;
    if (path.endsWith('.test.mjs')) {
      addStoryUnitTest(plan, { file: path.slice('apps/react-storybook/'.length) });
      widen(`${path} has no focused Storybook unit-test route; running that test file`);
      return;
    }
    addCompleteStorybookProof();
    widen(`${path} has no focused Storybook unit-test route and unknown importers; running the complete Storybook proof (every page and every unit test)`);
  };
  // Files outside packages/react/src can name a React module by path (tests,
  // browser entries, apps, catalog inputs). A deleted module's referencing
  // files are routed through their own owners as though they changed.
  const routedPaths = [...changed];
  const reactSourcePaths = changed.filter(isReactModuleSource);
  const importsBySide = reactSourcePaths.length === 0 ? { before: new Map(), after: new Map() } : {
    before: localModuleImports(moduleSources, 'before'),
    after: localModuleImports(moduleSources, 'after'),
  };
  const importedModules = new Set(['before', 'after'].flatMap((side) => [...importsBySide[side].values()].flat()));
  // A changed module that is no family's source and that no React module imports
  // (a fixture such as button-fixture.mjs, which the playground and a test import)
  // reaches nothing through React source. Its referencing files route through their
  // owners, as a deletion's do; with none it stays unowned, and the source analysis
  // below fails. The projection compiler is the exception: it takes the compiler route
  // below, which validates every React family, and its path, src/generate.mjs, also names
  // every other package's own generator, so a reference search would route their owners.
  const externallyImported = new Set();
  for (const path of reactSourcePaths) {
    const deleted = await readHeadText(path) === null;
    if (!deleted && (path === reactGeneratorPath || importedModules.has(path) || records.some((record) => record.source === path))) continue;
    const references = await findReferences(path.slice('packages/react/'.length));
    if (!deleted && references.length > 0) externallyImported.add(path);
    for (const reference of references) {
      if (routedPaths.includes(reference) || reference.startsWith('packages/react/src/')) continue;
      routedPaths.push(reference);
      plan.reasons.push(`${reference} references ${deleted ? 'deleted' : 'changed'} ${path}; validate its owner`);
    }
  }

  for (const path of routedPaths) {
    // A React test can read inputs outside packages/react. It runs when any of them changes,
    // whatever else routes the path, so a moved check never lapses (Decision 0031 item 13).
    for (const [testFile, inputs] of Object.entries(config.reactTestInputs ?? {})) {
      if (!matches(path, inputs)) continue;
      plan.reactTestFiles.add(testFile);
      plan.reasons.push(`${path} is read by the React test ${testFile}`);
    }
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
      for (const name of catalogReaders.packageChecks ?? []) routePackage(plan, requirePackage(packages, name, path), records, pageIndex);
      for (const file of catalogReaders.storybookUnitTests ?? []) {
        plan.storyTooling = true;
        addStoryUnitTest(plan, { file });
      }
      plan.reasons.push(`${path} is a canonical React catalog input; validate its readers`);
      continue;
    }
    // An added or removed pattern entry changes the generated Block pages: plan
    // Storybook generation, the new pattern's pages, and its proofs. The
    // manifest is then routed as the fixture it is.
    if (path === patternManifestPath) {
      const slugs = changedPatternSlugs(await readBaseText(path), await readHeadText(path));
      for (const slug of slugs) {
        plan.storyTooling = true;
        addComponentDocsProof(plan);
        plan.reactTestFiles.add(catalogExampleTypesTestFile);
        addPatternPages(plan, slug, pageIndex);
        const browserTest = blockBrowserTest(slug);
        if (browserTest) plan.reactTestFiles.add(browserTest);
      }
      if (slugs.length > 0) plan.reasons.push(`${path} adds or removes entries of ${slugs.join(', ')}; validate the generated Block pages and the pattern proofs`);
    }
    // A fixture is read by one package, or by several when its value is a list.
    const fixtureOwner = Object.entries(config.packageFixtureOwners ?? {}).find(([prefix]) => matches(path, [prefix]))?.[1];
    if (fixtureOwner) {
      const owners = [fixtureOwner].flat();
      for (const owner of owners) routePackage(plan, requirePackage(packages, owner, path), records, pageIndex);
      plan.reasons.push(`${path} is a fixture read by ${owners.join(' and ')} tests`);
      continue;
    }
    if (path.startsWith(`${tailwindFixture}/`)) {
      plan.tailwind = true;
      plan.reasons.push(`${path} is the Tailwind consumer fixture`);
      continue;
    }
    // The shared component helpers drive the docs and every generated component
    // page: the grouping names the navigation and the page titles, and the
    // reference projects each page's catalog facts. Each selects the docs and
    // every component page. Block pages take their titles from their patterns,
    // not this grouping.
    if (config.componentNavigationPaths?.includes(path)) {
      plan.docs = true;
      storybookFamilies(records).forEach((family) => plan.storyFamilies.add(family));
      // The reference and the guide link reader also project every Storybook Docs page entry.
      if (path === componentReferencePath || path === guideLinksPath) addComponentDocsProof(plan);
      plan.reasons.push(`${path} is shared by the docs and every component Storybook page`);
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

    // React generation writes the derived API from the family's source; it
    // reaches users only through the merged catalog record, so it routes like one.
    const derivedApi = derivedApiPath.exec(path);
    if (derivedApi) {
      const record = recordForSlug(records, derivedApi[1]);
      if (!record) throw new Error(`MUXUI_CI_IMPACT_COMPONENT_RECORD_MISSING: ${path} names no canonical React component ${derivedApi[1]}`);
      routeComponentRecord(plan, record);
      plan.reasons.push(`${path} is the derived API of ${record.family}; validate it like the canonical component record`);
      continue;
    }

    if (isReactModuleSource(path)) {
      plan.reactProjectionCheck = true;
      plan.reasons.push(`${path} is React runtime or compiler source; AST ownership determines the affected families`);
      continue;
    }

    if (path === 'packages/react/package.json') {
      requireScopedEntrypoint(plan, packages, 'react');
      // The manifest can be routed unchanged, as a file that names a changed module (a script
      // runs publish-guard.mjs). It then has no base and head snapshots to compare, and the
      // React package check validates what it names.
      if (!changed.includes(path)) {
        plan.packageChecks.add('@muxui/react');
        plan.reasons.push(`${path} names a changed React module in a script; run the React package check`);
        continue;
      }
      const impact = reactPackageWideChanges(reactPackageBefore, reactPackageAfter);
      if (impact.pagesAffected) {
        plan.reactPackageFull = true;
        addEveryStoryPage(plan, records, pageIndex);
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
        if (await readHeadText(path) === null && await readBaseText(path) !== null) {
          // A retired test has nothing to run; the React package check runs the rest.
          plan.packageChecks.add('@muxui/react');
          plan.reasons.push(`${path} was deleted; run the React package check`);
        } else {
          plan.reactTestFiles.add(testPath);
          plan.reasons.push(`${path} is React proof code; run only the changed test file`);
        }
      } else if (testPath === 'test/tsconfig.json' || testPath.endsWith('.tsx')) {
        // Only the React package check (and component checks) run this typecheck.
        plan.packageChecks.add('@muxui/react');
        plan.reasons.push(`${path} is React type-test input; run the React package check that typechecks it`);
      } else {
        const testFiles = [...new Set([...reactTestFilesReferencing(testPath, reactTestReferenceSources), ...publicSurfaceTestsFor(path)])].sort();
        if (testFiles.length === 0 && await readHeadText(path) !== null) {
          plan.reactPackageFull = true;
          widen(`${path} is not referenced by any React test file; running the full React proof (reference it from a test or remove it to narrow this)`);
          continue;
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
          addEveryStoryPage(plan, records, pageIndex);
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
        routeStoryUnit(path);
        plan.reasons.push(`${path} changes Storybook selection tooling; run its focused unit proof`);
      } else if (path.startsWith('apps/react-storybook/.storybook/generated/')) {
        plan.reasons.push(`${path} is generated Storybook page output; map emitted exports to canonical page IDs`);
        if (path.endsWith('.stories.mjs') && storybookPageOwners(path, pageIndex).length === 0) {
          throw new Error(`MUXUI_CI_IMPACT_STORY_PAGE_MISSING: ${path} has no current canonical pageIndex owner; provide the base/head page owner mapping for this removal or rename`);
        }
      } else if (path.startsWith('apps/react-storybook/test/')) {
        routeStoryUnit(path);
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
        if (impact.pagesAffected) addEveryStoryPage(plan, records, pageIndex);
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
        routeComponentRecord(plan, record);
        plan.reasons.push(`${path} changes the canonical component record for ${record.family}`);
      } else if (/\/examples\/react\/[^/]+\.(?:tsx|example\.json)$/u.test(path)) {
        const owners = routeCatalogExample(path, pageIndex);
        plan.catalog = true;
        // Docs load every React example, and the React example type test
        // compiles every example source.
        plan.docs = true;
        addComponentDocsProof(plan);
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

    // Pattern records, variant example records, their sources, and assets
    // compile into the catalog that @muxui/tooling queries and renders. Docs
    // projects them and follows from the catalog's dependents.
    // A pattern names no component family, so no React family route applies.
    // A variant source joins the packed React example type test and its exact
    // generated Storybook page; any other pattern input (record, example
    // record, asset) can change every page of that pattern, because the page
    // title, story names, and rendered source come from them. An interactive
    // pattern also runs its browser test.
    if (path.startsWith('catalog/patterns/')) {
      plan.catalog = true;
      // A pattern record names its participant components, which list it under Used in blocks.
      if (path.endsWith('/artifact.json')) addComponentDocsProof(plan);
      const slug = path.split('/')[2];
      if (path.endsWith('.tsx')) plan.reactTestFiles.add(catalogExampleTypesTestFile);
      if (path.endsWith('.tsx')) {
        for (const owner of routeCatalogExample(path, pageIndex)) {
          plan.storyIds.add(owner.id);
          plan.storyIdFamilies.set(owner.id, owner.family);
        }
      } else if (slug !== undefined) {
        addPatternPages(plan, slug, pageIndex);
      }
      const browserTest = slug === undefined ? undefined : blockBrowserTest(slug);
      if (browserTest) plan.reactTestFiles.add(browserTest);
      plan.reasons.push(`${path} is a canonical pattern input; validate the catalog, its dense goldens, the docs that render it, and its Storybook pages${browserTest ? ` and ${browserTest}` : ''}`);
      continue;
    }

    // Guides compile into the catalog that @muxui/tooling queries and renders,
    // and docs renders every guide. No renderer or Storybook page runs a guide,
    // so per-family usage guides need no family route. A family's own usage
    // guide is shown on its Storybook Docs page, which plans the Docs page test, and so is the accessibility
    // guide on every family page.
    if (path.startsWith('catalog/guides/')) {
      plan.catalog = true;
      plan.docs = true;
      plan.packageChecks.add('@muxui/tooling');
      const usageGuide = familyUsageGuidePath.exec(path);
      if (usageGuide && recordForSlug(records, usageGuide[1])) addComponentDocsProof(plan);
      if (accessibilityGuidePath.test(path)) addComponentDocsProof(plan);
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
      routePackage(plan, name, records, pageIndex);
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
    // A base generator that cannot run against the head helpers has no emission to compare.
    if (impact.baseRunFailed) {
      addCompleteStorybookProof();
      widen(`${path}: ${impact.reason}; running the complete Storybook proof (every page and every unit test)`);
      continue;
    }
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
      plan.evidence = true;
      plan.reasons.push('pnpm-lock.yaml changes only the repository-policy importer and adds its parser resolutions');
    } else if (plan.fullReasons.length === 0) {
      for (const importer of changedLockfileImporters(lockfileBefore, lockfileAfter)) {
        // Removing a workspace package changes the workspace graph itself: no owner remains to scope the proof to.
        if (isRemovedWorkspaceImporter(importer, packages, lockfileAfter)) {
          plan.fullReasons.push(`pnpm-lock.yaml drops the importer ${importer}, whose workspace package was removed`);
          continue;
        }
        changedPackages.add(routeLockfileImporter(plan, importer, packages, records, pageIndex));
      }
    }
  }

  if (missing.length > 0) {
    plan.policy = true;
    plan.evidence = true;
    widen(`${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no owner route; running the repository policy check (add an owner route to pullRequestImpact to narrow this)`);
  }
  for (const path of changed) {
    const input = isEvidenceInput(path, config);
    const lookup = !input && startsWithAny(path, config.evidencePresenceInputs)
      && (await readHeadText(path) === null || await readBaseText(path) === null);
    if (!input && !lookup) continue;
    plan.evidence = true;
    plan.reasons.push(`${path} ${input ? 'is an input of' : 'is added or removed, and is looked up by'} the retained-evidence tests; run check:evidence`);
  }
  if (plan.fullReasons.length > 0) {
    plan.full = true;
    plan.reasons.push(...plan.fullReasons.map((reason) => `full workspace proof: ${reason}`));
  }

  // The projection compiler and every local module it imports (at base or
  // head) shape every generated family, as do its canonical catalog inputs.
  const generatorModules = new Set([reactGeneratorPath]);
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
    addEveryStoryPage(plan, records, pageIndex);
    plan.tailwind = true;
    plan.reasons.push(`React projection compiler inputs changed (${reactGeneratorPaths.join(', ')}); every canonical React family is affected`);
  }
  // Families whose component source or CSS changed: the patterns that use them are replanned below.
  const changedSourceFamilies = new Set();
  for (const path of reactSourcePaths) {
    if (generatorModules.has(path)) continue;
    if (externallyImported.has(path)) {
      plan.reasons.push(`${path} is imported only outside React source; the files that reference it validate the change`);
      continue;
    }
    const headSource = await readHeadText(path);
    // A deleted module that no base module imported cannot change any family, and neither can one
    // whose every importer changed in this PR (a module moving from .mjs to .ts): each importer is
    // analyzed in its own right. The React package check regenerates and tests the package without it.
    if (headSource === null && !records.some((record) => record.source === path)) {
      const importers = [...importsBySide.before].filter(([, targets]) => targets.includes(path)).map(([importer]) => importer);
      if (importers.every((importer) => reactSourcePaths.includes(importer))) {
        plan.packageChecks.add('@muxui/react');
        plan.reasons.push(`${path} was deleted and ${importers.length === 0 ? 'no React module imported it' : 'every React module that imported it changed'}; run the React package check`);
        continue;
      }
    }
    const before = await readBaseText(path) ?? '';
    const after = headSource ?? '';
    const impact = analyzeReactSourceChange({ before, after, sourcePath: path, records, moduleSources });
    impact.families.forEach((family) => {
      plan.reactFamilies.add(family);
      changedSourceFamilies.add(family);
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
    // A type-only edit affects no family, so family routing cannot see that it changed the public types.
    plan.reactTestFiles.add(publicSurfaceTestFile);
    plan.reasons.push('React runtime source changed; verify the public types still match the declarations from before the TypeScript moves');
    // Guards on a module's text and bundles that no affected family predicts.
    reactSourcePaths.flatMap(sourceGuardTests).forEach((file) => plan.reactTestFiles.add(file));
  }

  const cssPaths = changed.filter((path) => path.startsWith('packages/react/src/') && path.endsWith('.css'));
  for (const path of cssPaths) {
    const before = await readBaseText(path);
    const after = await readHeadText(path);
    let impact;
    try {
      impact = analyzeReactStyleChange({ before: before ?? '', after: after ?? '', records, sourcePath: path, moduleSources });
    } catch (error) {
      if (!error.message.startsWith('MUXUI_CI_IMPACT_STYLE_OWNERSHIP:')) throw error;
      // The analyzer cannot attribute the change to families, so every family is affected.
      plan.reactPackageFull = true;
      plan.reactProjectionCheck = false;
      addEveryStoryPage(plan, records, pageIndex);
      plan.tailwind = true;
      widen(`${path}: ${error.message.slice('MUXUI_CI_IMPACT_STYLE_OWNERSHIP: '.length)}; running the full React and Storybook proof`);
      continue;
    }
    impact.families.forEach((family) => {
      changedSourceFamilies.add(family);
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

  // A participant's source change reaches the patterns that use it: their Block
  // pages, the packed example type test, and the pattern's browser test. A
  // compiler or package-wide change reaches every pattern. A full React check
  // already runs those tests, so only the pages are added then.
  const changedComponentSlugs = new Set(records.filter(({ family }) => changedSourceFamilies.has(family)).map(({ slug }) => slug));
  for (const { slug, components } of patterns) {
    const changedComponents = plan.reactPackageFull ? components : components.filter((component) => changedComponentSlugs.has(component));
    if (changedComponents.length === 0) continue;
    addPatternPages(plan, slug, pageIndex);
    const browserTest = blockBrowserTest(slug);
    if (!plan.reactPackageFull) {
      plan.reactTestFiles.add(catalogExampleTypesTestFile);
      if (browserTest) plan.reactTestFiles.add(browserTest);
    }
    plan.reasons.push(`${slug} uses changed ${changedComponents.join(', ')}; validate its Block pages${plan.reactPackageFull ? '' : `, the packed example type test${browserTest ? `, and ${browserTest}` : ''}`}`);
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
  // React output changed when the analysis selected React families or theme
  // families, or a projection compiler input changed. A React source change
  // without that impact (a comment) and unshipped React files (advisory docs)
  // reach no dependents.
  const reactOutputChanged = plan.reactFamilies.size > 0 || plan.themeFamilies.size > 0 || reactGeneratorPaths.length > 0;
  if (reactOutputChanged) changedPackages.add('@muxui/react');
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
    if (isReactModuleSource(path) || (path.startsWith('packages/react/src/') && path.endsWith('.css'))) continue;
    changedPackages.add(owner.name);
  }
  for (const { name, via, scope } of workspaceDependentRoutes(packages, [...changedPackages].sort())) {
    if (scope === 'package') {
      routePackage(plan, name, records, pageIndex);
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
    plan.reactComponentTests = selection.files;
    plan.reactComponentTestNames = selection.testNamesByFile;
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
  // Every catalog input compiles into the catalog that @muxui/tooling queries
  // and renders, so its tests and dense goldens run.
  if (plan.catalog) plan.packageChecks.add('@muxui/tooling');
  // The catalog route runs the catalog check that React's devDependency edge also plans.
  if (plan.catalog) plan.packageChecks.delete('@muxui/catalog');
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
  packages = [], lockfileImporters = [], reactPackagePagesAffected = false, patternManifestChanged = false,
} = {}) {
  const sourceNeedsMetadata = paths.some((path) => path.startsWith('packages/react/src/')
    || derivedApiPath.test(path)
    || (path === 'packages/react/package.json' && reactPackagePagesAffected)
    || (path.startsWith('catalog/components/') && (/\/artifact\.json$/u.test(path)
      || /\/examples\/react\/[^/]+\.(?:tsx|example\.json)$/u.test(path)))
    // A usage guide is routed by the family record it names.
    || familyUsageGuidePath.test(path)
    // Pattern pages are generated Storybook pages; routing needs the page index.
    || path.startsWith('catalog/patterns/')
    || (path === patternManifestPath && patternManifestChanged)
    || path.startsWith('apps/react-storybook/src/')
    || path.startsWith('apps/react-storybook/test/')
    || path.startsWith('apps/react-storybook/.storybook/')
    || path === 'apps/react-storybook/package.json'
    || matches(path, config.themePrefixes)
    || Object.keys(config.reactCatalogInputReaders ?? {}).some((prefix) => matches(path, [prefix]))
    || config.reactStorybookSharedPaths.includes(path)
    || config.componentNavigationPaths?.includes(path)
    || config.reactStorybookChromePaths.includes(path)
    || config.reactStorybookGeneratorPaths.includes(path)
    || path.startsWith('apps/react-storybook/.storybook/generated/'));
  if (sourceNeedsMetadata) return true;

  const metadataOwners = ['@muxui/react', '@muxui/react-storybook', '@muxui/tokens'];
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
    MUXUI_STORYBOOK_A11Y_WORKERS: '2',
    MUXUI_STORYBOOK_COLORS_WORKERS: '2',
    ...(environment.RUNNER_TEMP ? { MUXUI_STORYBOOK_COLORS_ARTIFACT_DIR: `${environment.RUNNER_TEMP}/storybook-colour-audit` } : {}),
  };
}

// CI shards large Storybook page selections by family so one job stays inside
// the scoped audit timeouts in apps/react-storybook/test.
// 80 pages keeps the scoped formula (120 s + 6 s/page) near its 600 s cap.
export const storyShardPageBudget = 80;

const sharedGroup = '*';
const groupTimeoutMinutes = { checks: 30, react: 30, browser: 30, tailwind: 15, storybook: 30 };

// Package checks run in independent CI groups so the two long suites overlap
// instead of queueing behind every other package check. Every `checks-*` id
// keeps kind `checks` (timeout and reuse rules); other packages share `checks`.
const policyPackage = '@muxui/repository-policy';
const toolingPackage = '@muxui/tooling';
const policyChecksGroup = 'checks-policy';
const toolingChecksGroup = 'checks-tooling';
const checksGroup = 'checks';
const checksGroupFor = (name) => (name === policyPackage ? policyChecksGroup : name === toolingPackage ? toolingChecksGroup : checksGroup);
const fullStorybookEnvironment = {
  MUXUI_STORYBOOK_AUDIT_EVENT: 'check:all',
  MUXUI_STORYBOOK_AUDIT_FORCE: '1',
};
const storybookSelectionKeys = [
  'MUXUI_STORYBOOK_AUDIT_PROOF', 'MUXUI_STORYBOOK_FAMILIES', 'MUXUI_STORYBOOK_STORY_IDS',
  'MUXUI_STORYBOOK_FAMILY_FILTER', 'MUXUI_STORYBOOK_FAMILY', 'MUXUI_COMPONENT_FAMILIES',
];

// Pages a run audits per family. Chrome proof audits the manager and docs UI, not pages.
function storyRunPageCounts(storyRun, pageIndex) {
  const counts = new Map();
  if (storyRun.proof === 'chrome') return counts;
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

// Browser suites run as parallel CI groups: one per engine for the React tests
// that call browserEngines() plus, in the Chromium group, Scale. The React tests
// that are not engine-aware only exist in Chromium, so they get their own group
// to keep the Chromium job from being the long pole. A long list splits further
// into numbered shards (browser-chromium-only-1, ...).
const browserGroup = (engine) => `browser-${engine}`;
const chromiumGroup = browserGroup('chromium');
const chromiumOnlyGroup = 'browser-chromium-only';

// A browser list runs as ceil(files / limit) shards, at most the plan's cap. A
// cross-engine file takes about 35 s per engine and a Chromium-only file about
// 13 s, so a full shard of 6 or 18 files runs about 4 minutes. A pull request
// that selects test files splits a long cross-engine list in two. A plan that
// runs the whole browser suite (main, the weekly run, and a pull request that
// needs the full React proof) keeps those lists whole: main's matrix stays near
// 14 jobs so that a main push and a pull request fit in the 20 concurrent jobs
// of GitHub's Free plan, and the Chromium-only list is its long pole, so that
// list takes the shards.
const browserShardLimit = { crossEngine: 6, chromiumOnly: 18 };
const browserShardCap = {
  selected: { crossEngine: 2, chromiumOnly: 3 },
  suite: { crossEngine: 1, chromiumOnly: 3 },
};

// The shard a test file belongs to: a hash of its path, so a file keeps its
// shard, and a shard its identity, while other files are added or removed.
export function browserShardIndex(file, count) {
  return createHash('sha256').update(file).digest().readUInt32BE(0) % count;
}

// True when the source calls browserEngines() imported from the harness
// module: by name, by import alias, or as a member of a namespace import of it.
// Only bindings resolved from that import count, so an unrelated `browserEngines`
// name, property, or mention in a comment or string is ignored. Any other use of
// the harness binding itself (stored in a variable, re-exported, reached through
// a dynamic import) throws, because the test would otherwise silently run in
// Chromium only. There is no scope analysis: a shadowing declaration counts as
// the binding.
export function callsBrowserEngines(source, label = 'the source') {
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    return false;
  }
  const isHarness = (node) => typeof node?.value === 'string' && /(?:^|\/)harness\.mjs$/u.test(node.value);
  // Local names bound to the harness's browserEngines, and to the whole module.
  const functions = new Set();
  const namespaces = new Set();
  for (const declaration of ast.body) {
    if (declaration.type !== 'ImportDeclaration' || !isHarness(declaration.source)) continue;
    for (const { type, imported, local } of declaration.specifiers) {
      if (type === 'ImportNamespaceSpecifier') namespaces.add(local.name);
      else if (type === 'ImportSpecifier' && (imported.name ?? imported.value) === 'browserEngines') functions.add(local.name);
    }
  }
  const memberName = (node) => (node.computed ? node.property.value : node.property.name);
  let called = false;
  let otherUse = false;
  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parent);
      return;
    }
    if (node.type === 'ImportDeclaration') return;
    if (node.type === 'ImportExpression' && isHarness(node.source)) otherUse = true;
    if (node.type === 'ExportNamedDeclaration' && isHarness(node.source)) {
      if (node.specifiers.some(({ local }) => (local.name ?? local.value) === 'browserEngines')) otherUse = true;
      return;
    }
    let reference = node.type === 'Identifier' && (functions.has(node.name) || namespaces.has(node.name));
    // A member of the harness namespace: only browserEngines (or an unknown computed member) matters.
    const viaNamespace = node.type === 'MemberExpression' && node.object.type === 'Identifier' && namespaces.has(node.object.name);
    if (viaNamespace) {
      const name = memberName(node);
      reference = name === 'browserEngines' || name === undefined;
    }
    if (reference) {
      if (parent?.type === 'CallExpression' && parent.callee === node) called = true;
      else otherUse = true;
    }
    if (viaNamespace) return;
    for (const [key, value] of Object.entries(node)) {
      if (['start', 'end', 'loc', 'range'].includes(key)) continue;
      // Member and property names are not references to a binding.
      if (key === 'property' && node.type === 'MemberExpression' && !node.computed) continue;
      if (key === 'key' && !node.computed && !node.shorthand && ['Property', 'PropertyDefinition', 'MethodDefinition'].includes(node.type)) continue;
      visit(value, node);
    }
  };
  visit(ast, null);
  if (!called && otherUse) {
    throw new Error(`MUXUI_CI_IMPACT_BROWSER_ENGINES_FORM: ${label} uses the harness's browserEngines in a form the planner cannot classify; import it statically and call it as browserEngines() (an import alias or namespace member is fine) so CI runs it in every engine`);
  }
  return called;
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
  return callsBrowserEngines(source, testFile);
}

// The Playwright-managed engines a group's commands need, space-separated for
// the workflow install step; empty when the group runs Chrome alone.
export function groupBrowserEngines(commands) {
  const engines = new Set(commands.flatMap(({ env = {} }) => (env.MUXUI_BROWSER_ENGINES ?? '').split(',')));
  return ['firefox', 'webkit'].filter((engine) => engines.has(engine)).join(' ');
}

// CI runs the React browser suite as explicit file lists so it can split the
// files by engine. That repeats the package's `check:browser` script, so
// planning fails when the script no longer matches what this planner assumes.
const reactBrowserScript = 'node --test --test-concurrency=1 test/browser/*.test.mjs';

function assertReactBrowserScript(packages) {
  const actual = packages.find(({ name }) => name === '@muxui/react')?.manifest.scripts?.['check:browser'];
  // Whitespace is not part of the contract: only the runner, flags, and selectors are.
  const tokens = (script) => script?.trim().split(/\s+/u).join(' ');
  if (tokens(actual) === tokens(reactBrowserScript)) return;
  throw new Error(`MUXUI_CI_IMPACT_CHECK_BROWSER_CONTRACT: packages/react/package.json check:browser is ${JSON.stringify(actual)}, but CI runs the React browser suite as explicit test/browser/*.test.mjs file lists equivalent to ${JSON.stringify(reactBrowserScript)}. Update reactBrowserScript and browserLayout in tooling/audits/repository-policy/src/ci-impact.mjs to match the script, or restore the script.`);
}

// Every React browser test file (paths relative to packages/react, sorted by
// name): the files `check:browser` globs. A checkout without them has none.
function reactBrowserTests() {
  try {
    return readdirSync(resolve(repositoryRoot, 'packages/react/test/browser'))
      .filter((name) => name.endsWith('.test.mjs')).sort().map((name) => `test/browser/${name}`);
  } catch {
    return [];
  }
}

// Every React browser test as a run (paths relative to packages/react): the
// files `check:browser` globs.
function reactBrowserSuiteRuns(packages) {
  assertReactBrowserScript(packages);
  return reactBrowserTests().map((file) => ({ file }));
}

// The groups one browser list runs in: the plain group, or numbered shards
// (`-1`, `-2`, ...) named by hash bucket. Empty shards are dropped, and a list
// that lands in one shard keeps the plain id.
function browserShards(group, runs, kind, caps) {
  const count = Math.max(1, Math.min(caps[kind], Math.ceil(runs.length / browserShardLimit[kind])));
  const shards = Array.from({ length: count }, (_, index) => ({
    id: `${group}-${index + 1}`,
    runs: runs.filter(({ file }) => browserShardIndex(file, count) === index),
  })).filter((shard) => shard.runs.length > 0);
  return shards.length === 1 ? [{ id: group, runs: shards[0].runs }] : shards;
}

// Where browser test runs execute, `{ file, names? }` each (`names` narrows a
// component check to its own test cases). Files that call browserEngines() run
// in every engine's groups, the rest only in browser-chromium-only, so each
// file runs once per engine it supports. Groups with no files are not planned.
function browserLayout(runs, testSources, caps) {
  const crossEngine = runs.filter(({ file }) => runsInEveryEngine(file, testSources));
  const chromiumOnly = runs.filter((run) => !crossEngine.includes(run));
  const inEngine = (engine, shards) => shards.map((shard) => ({ ...shard, env: { MUXUI_BROWSER_ENGINES: engine } }));
  return {
    chromium: inEngine('chromium', browserShards(chromiumGroup, crossEngine, 'crossEngine', caps)),
    chromiumOnly: browserShards(chromiumOnlyGroup, chromiumOnly, 'chromiumOnly', caps).map((shard) => ({ ...shard, env: {} })),
    firefox: inEngine('firefox', browserShards(browserGroup('firefox'), crossEngine, 'crossEngine', caps)),
    webkit: inEngine('webkit', browserShards(browserGroup('webkit'), crossEngine, 'crossEngine', caps)),
  };
}

// The group for Scale's browser checks, one of which builds the docs site (~95 s).
// Pull requests keep them in the browser-chromium family, whatever else the plan
// runs: reuse routes a docs or Scale change to that family, so an earlier and a
// later plan must host them in the same one. Main never reuses, so the full plan
// puts them in the last Chromium-only shard, which has the slack and keeps the
// cross-engine groups, its long pole, clear of them.
const scaleHost = (layout, full) => (full ? layout.chromiumOnly.at(-1)?.id : undefined) ?? layout.chromium[0]?.id ?? chromiumGroup;

function addBrowserLayout(add, layout) {
  for (const { id, runs, env } of [...layout.chromium, ...layout.chromiumOnly, ...layout.firefox, ...layout.webkit]) {
    const addTests = (args) => add(id, ['--filter', '@muxui/react', 'exec', 'node', '--test', '--test-concurrency=1', ...args], { env });
    const whole = runs.filter(({ names }) => !names).map(({ file }) => file);
    if (whole.length > 0) addTests(whole);
    for (const { file, names } of runs) if (names) addTests([`--test-name-pattern=${testNamePattern(names)}`, file]);
  }
}

function storybookTestFiles() {
  return readdirSync(resolve(repositoryRoot, 'apps/react-storybook/test'))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => `test/${name}`);
}

// Scale's `check:browser:docs` builds `apps/docs/dist` and then serves it, so a
// failed docs build fails only this command, never later checks.
function addScaleDocsBrowserCommand(add, group) {
  add(group, ['--filter', '@muxui/scale', 'run', 'check:browser:docs']);
}

function fullPlannedCommands(environment, testSources, packages) {
  const planned = [];
  const add = (group, args, options) => planned.push({ group, command: pnpmCommand(args, options) });
  const storybookEnv = {
    ...fullStorybookEnvironment,
    MUXUI_STORYBOOK_A11Y_WORKERS: '2',
    MUXUI_STORYBOOK_COLORS_WORKERS: '2',
    ...(environment.RUNNER_TEMP ? { MUXUI_STORYBOOK_COLORS_ARTIFACT_DIR: `${environment.RUNNER_TEMP}/storybook-colour-audit` } : {}),
  };
  const nodeTest = ['--filter', '@muxui/react-storybook', 'exec', 'node', '--test', '--test-concurrency=1'];
  const a11yFile = 'test/storybook-a11y.test.mjs';
  // `pnpm check:all` split into independent groups: full generation, then each
  // package's own check script, with React and Storybook in their own jobs.
  add(sharedGroup, ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present', 'run', 'generate'], { prerequisite: true });
  // Every workspace package with a `check` script except React and Storybook,
  // the same set `pnpm -r run check` covered, one command per package like the
  // pull-request plan. The policy and tooling suites each get a group; the rest
  // run together in dependency order. The root is not a workspace package here:
  // its `check` is the affected-scope runner, not a package check.
  const checked = dependencyOrder(packages)
    .filter(({ name, manifest }) => typeof manifest.scripts?.check === 'string' && !['@muxui/react', '@muxui/react-storybook'].includes(name))
    .map(({ name }) => name);
  const longSuites = [policyPackage, toolingPackage].filter((name) => checked.includes(name));
  for (const name of [...longSuites, ...checked.filter((name) => !longSuites.includes(name))]) {
    add(checksGroupFor(name), ['--filter', name, 'run', 'check']);
    // The pull-request plan runs this only when the change reaches its inputs.
    if (name === policyPackage) add(policyChecksGroup, ['--filter', name, 'run', 'check:evidence']);
  }
  add(checksGroup, ['generate:check']);
  add('react', ['--filter', '@muxui/react', 'run', 'check']);
  const browser = browserLayout(reactBrowserSuiteRuns(packages), testSources, browserShardCap.suite);
  addBrowserLayout(add, browser);
  add(scaleHost(browser, true), ['--filter', '@muxui/scale', 'run', 'check:browser']);
  addScaleDocsBrowserCommand(add, scaleHost(browser, true));
  add('storybook-a11y', [...nodeTest, a11yFile], { env: storybookEnv, unsetEnv: storybookSelectionKeys });
  add('storybook', ['--filter', '@muxui/react-storybook', 'run', 'generate:check']);
  // Storybook's own-interface colour proofs are not release proof (Decision 0030): a main push skips
  // them. The schedule, manual runs, and pull request plans keep them.
  add('storybook', [...nodeTest, ...storybookTestFiles().filter((file) => file !== a11yFile)], {
    env: { ...storybookEnv, ...(environment.GITHUB_EVENT_NAME === 'push' ? { MUXUI_STORYBOOK_UI_PROOF: 'skip' } : {}) },
    unsetEnv: storybookSelectionKeys,
  });
  add('tailwind', ['--dir', 'tests/fixtures/tailwind-consumer', 'install', '--ignore-workspace', '--frozen-lockfile'], { prerequisite: true });
  add('tailwind', ['--dir', 'tests/fixtures/tailwind-consumer', 'run', 'check']);
  return planned;
}

// The browser tests a pull request plan runs, sorted by path: the whole suite
// for the full React proof, else the family check's browser tests (each with its
// focused test names) and the selected test files, each once.
function pullRequestBrowserRuns(plan, packages) {
  const runs = new Map();
  const addRun = (file, names) => {
    if (!runs.has(file)) runs.set(file, { file, ...(names?.length ? { names } : {}) });
  };
  if (plan.reactPackageFull) reactBrowserSuiteRuns(packages).forEach(({ file }) => addRun(file));
  else (plan.reactComponentTests ?? []).filter(isBrowserTestFile).forEach((file) => addRun(file, plan.reactComponentTestNames?.[file]));
  (plan.reactTestFiles ?? []).filter(isBrowserTestFile).forEach((file) => addRun(file));
  return [...runs.values()].sort((left, right) => (left.file < right.file ? -1 : 1));
}

function plannedCommands(plan, {
  packages = [], metadataPrepared = false, environment = process.env, pageIndex = [], testSources = {},
} = {}) {
  const planned = [];
  const add = (group, args, options) => planned.push({ group, command: pnpmCommand(args, options) });
  // Storybook-owned commands are tagged so local runs can take just this slice.
  const addStorybook = (group, args, options) => {
    add(group, args, options);
    planned.at(-1).storybook = true;
  };
  const requiredEntrypoints = new Set(plan.scopedEntrypointChecks ?? []);
  if (!plan.full && !plan.reactPackageFull && plan.reactFamilies?.length > 0) requiredEntrypoints.add('react');
  if (!plan.full && plan.storyRuns?.length > 0) requiredEntrypoints.add('storybook');
  validateScopedEntrypoints(packages, [...requiredEntrypoints]);
  if (plan.full) return fullPlannedCommands(environment, testSources, packages);
  const browser = browserLayout(
    pullRequestBrowserRuns(plan, packages), testSources, plan.reactPackageFull ? browserShardCap.suite : browserShardCap.selected,
  );
  const scaleGroup = scaleHost(browser, false);

  // Every group repeats this generation in its own fresh runner. Only skip
  // what metadata preparation already generated earlier in this same process:
  // `@muxui/react-storybook generate` covers its workspace dependencies plus itself.
  let generationPackages = plan.generationPackages ?? scopedGenerationPackages(plan, packages);
  if (metadataPrepared) {
    const preparedNames = new Set(dependencyClosure(packages, ['@muxui/react-storybook']).map(({ name }) => name));
    generationPackages = generationPackages.filter((name) => !preparedNames.has(name));
  }
  if (generationPackages.length > 0) {
    const args = ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present'];
    for (const name of generationPackages) args.push('--filter', name);
    args.push('run', 'generate');
    add(sharedGroup, args, { prerequisite: true });
  }

  if (plan.policy) add(policyChecksGroup, ['--filter', policyPackage, 'run', 'check']);
  if (plan.evidence) add(policyChecksGroup, ['--filter', policyPackage, 'run', 'check:evidence']);
  // Tooling is the other long package check, so its group is planned beside policy's.
  const packageChecks = plan.packageChecks.filter((name) => name !== toolingPackage);
  if (plan.packageChecks.includes(toolingPackage)) add(toolingChecksGroup, ['--filter', toolingPackage, 'run', 'check']);
  if (plan.catalog) add(checksGroup, ['--filter', '@muxui/catalog', 'run', 'check']);
  if (plan.tokens) add(checksGroup, ['--filter', '@muxui/tokens', 'run', 'check']);
  if (plan.docs) add(checksGroup, ['--filter', '@muxui/docs', 'run', 'check']);
  if (plan.scale) {
    add(checksGroup, ['--filter', '@muxui/scale', 'run', 'check']);
    add(scaleGroup, ['--filter', '@muxui/scale', 'run', 'check:browser']);
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
  } else if (plan.reactFamilies.length > 0) {
    const env = {
      MUXUI_COMPONENT_FAMILIES: plan.reactFamilies.join(','),
      MUXUI_COMPONENT_INCLUDE_SHARED_SOURCE: '0',
      ...(plan.reactBehaviorProofFamilies.length ? { MUXUI_COMPONENT_BROWSER_PROOF_FAMILIES: plan.reactBehaviorProofFamilies.join(',') } : {}),
      // The family's browser tests run in the browser groups below, not here.
      ...(plan.reactComponentTests.some(isBrowserTestFile) ? { MUXUI_COMPONENT_SKIP_BROWSER_TESTS: '1' } : {}),
      ...(plan.reactComponentTests.some((file) => !isBrowserTestFile(file) && runsInEveryEngine(file, testSources)) ? crossEngineEnvironment : {}),
    };
    add('react', scopedEntrypointArgs('react', packages), {
      env,
      unsetEnv: ['MUXUI_COMPONENT_BROWSER_PROOF_FAMILIES'],
    });
  }
  if (plan.docs || plan.scale) addScaleDocsBrowserCommand(add, scaleGroup);
  for (const testFile of plan.reactTestFiles.filter((file) => !isBrowserTestFile(file))) {
    add('react', ['--filter', '@muxui/react', 'exec', 'node', '--test', '--test-concurrency=1', testFile], {
      env: runsInEveryEngine(testFile, testSources) ? crossEngineEnvironment : {},
    });
  }
  addBrowserLayout(add, browser);
  for (const packageName of packageChecks) add(checksGroup, ['--filter', packageName, 'run', 'check']);
  if (plan.storyTooling || plan.storybookGenerationCheck) {
    addStorybook(checksGroup, ['--filter', '@muxui/react-storybook', 'run', 'generate:check']);
  }
  if (plan.storyTooling) {
    for (const { file, testNamePattern } of plan.storyUnitTests) {
      addStorybook(checksGroup, [
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
      addStorybook(`storybook-${storyRun.proof}${shards.length > 1 ? `-${index + 1}` : ''}`, scopedEntrypointArgs('storybook', packages), {
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
    // Sharded, per-engine and per-owner groups (storybook-*, browser-*, checks-*) share their family's kind.
    const kind = id.match(/^(?:storybook|browser|checks)(?=-|$)/u)?.[0] ?? id;
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

// The Storybook slice of a plan for a local run: the generation check, the
// focused unit tests, and the scoped page audits, each with CI's environment.
// A local run executes them serially in one lane, so it takes the selection
// only when CI would run it as a single shard; a wider or unboundable
// selection returns `full` with the reason, and the caller keeps the full audit.
export function storybookSelection(plan, options = {}) {
  const { pageIndex = [] } = options;
  if (plan.full) {
    return { full: true, reason: `CI plans the full workspace graph (${plan.fullReasons.join('; ')})` };
  }
  if (plan.storyRuns.some(({ proof }) => proof !== 'chrome') && pageIndex.length === 0) {
    return { full: true, reason: 'the Storybook page index is unavailable, so the page selection cannot be bounded' };
  }
  const pages = plan.storyRuns
    .flatMap((storyRun) => [...storyRunPageCounts(storyRun, pageIndex).values()])
    .reduce((sum, count) => sum + count, 0);
  if (pages > storyShardPageBudget) {
    return {
      full: true,
      reason: `CI would shard the selection of ${pages} pages (more than ${storyShardPageBudget} per shard)`,
    };
  }
  const commands = plannedCommands(plan, options).filter(({ storybook }) => storybook).map(({ command }) => command);
  return { full: false, pages, commands };
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
      evidence: plan.evidence,
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
    notices: plan.notices ?? [],
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
  const patternManifestChanged = changedPaths.includes(patternManifestPath)
    && changedPatternSlugs(textAtRef(mergeBase, patternManifestPath), await currentText(patternManifestPath)).length > 0;
  const needsMetadata = needsStorybookGeneration(changedPaths, config, {
    packages,
    lockfileImporters,
    reactPackagePagesAffected: reactPackageImpact.pagesAffected,
    patternManifestChanged,
  });
  const metadataPrepared = await prepareStorybookMetadata({ needsMetadata, preview });

  const records = needsMetadata ? await generatedReactRecords() : [];
  const pageIndex = needsMetadata ? await generatedStoryIndex() : [];
  const patterns = needsMetadata ? await patternParticipants(repositoryRoot) : [];
  const reactSourceChanged = changedPaths.some((path) => isReactModuleSource(path) || (path.startsWith('packages/react/src/') && path.endsWith('.css')));
  const moduleSources = reactSourceChanged ? await reactModuleSources(mergeBase) : {};
  // Any route that selects React families (source, CSS, catalog records) needs the test sources.
  const componentTestSources = needsMetadata ? await reactTestSources() : {};
  const reactModuleDeleted = (await Promise.all(changedPaths
    .filter(isReactModuleSource)
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
    patterns,
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

const baseRefFor = (environment) => environment.MUXUI_BASE_REF ?? (environment.GITHUB_BASE_REF ? `origin/${environment.GITHUB_BASE_REF}` : 'origin/main');

async function pullRequestPlan({ preview, includeWorktree, environment }) {
  const baseRef = baseRefFor(environment);
  const mergeBase = resolveMergeBase(baseRef);
  const changedPaths = collectPullRequestPaths({ baseRef: mergeBase, includeWorktree });
  return { ...(await planAgainstBase({ base: mergeBase, changedPaths, preview })), baseRef, mergeBase };
}

// The Storybook commands CI would plan for exactly `changedPaths`, compared
// with the merge base of `baseRef`, for the local `pnpm check` runner. It never
// generates metadata, so it needs the generation the runner performs first.
// Any planner failure returns `full` with its message instead of throwing.
export async function planStorybookCommands({
  changedPaths,
  environment = process.env,
  baseRef = baseRefFor(environment),
}) {
  try {
    const paths = normalizeTaskPaths(changedPaths);
    const { plan, packages, pageIndex, metadataPrepared, testSources } = await planAgainstBase({
      base: resolveMergeBase(baseRef),
      changedPaths: paths,
      preview: true,
    });
    return storybookSelection(plan, { packages, metadataPrepared, environment, pageIndex, testSources });
  } catch (error) {
    return { full: true, reason: `the CI planner could not plan these paths (${error.message})` };
  }
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

// The package selectors a command line names: `--filter <name>`, `--filter=<name>`,
// `-F <name>`, and `-F=<name>`. Null when a filter flag is spelled in a way this
// does not read (`--filter-prod`, a missing value), so the caller does not guess.
function filterSelectors(tokens) {
  const selectors = [];
  for (const [index, token] of tokens.entries()) {
    const flag = token.match(/^(?:--filter|-F)(?:=(.*))?$/u);
    if (!flag) {
      if (/^(?:--filter|-F)/u.test(token)) return null;
      continue;
    }
    const value = (flag[1] ?? tokens[index + 1] ?? '').replace(/^(['"])(.*)\1$/u, '$2');
    if (value === '') return null;
    selectors.push(value);
  }
  return selectors;
}

// Directories of the packages a group's commands operate on plus their
// dependency closure; null when any command's package scope is not explicit.
// A script that builds another package (Scale's docs browser check runs
// `pnpm --filter @muxui/docs build`) makes that package an input too. Only a
// selector that is exactly a workspace package name is understood: a glob, a
// `...` closure, a path, a `!` exclusion, or an unknown name returns null, so
// the group is never reused.
export function groupPackageDirectories(commands, packages) {
  const roots = new Set();
  const directories = new Set();
  for (const { args } of commands) {
    const filters = filterSelectors(args);
    if (filters === null) return null;
    const directory = args[args.indexOf('--dir') + 1];
    if (args.includes('run')) {
      const script = args[args.indexOf('run') + 1];
      for (const name of filters) {
        const text = packages.find((item) => item.name === name)?.manifest.scripts?.[script] ?? '';
        const built = filterSelectors(text.split(/\s+/u).filter(Boolean));
        if (built === null) return null;
        built.forEach((target) => roots.add(target));
      }
    }
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
  for (const notice of plan.notices ?? []) console.log(`[ci-impact] notice: ${notice}`);
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

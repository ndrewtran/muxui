import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import { canonicalJson } from './canonical-json.mjs';

const requiredReleaseRoots = Object.freeze([
  'generated',
  'assets',
  'README.md',
  'LICENSE',
  'NOTICE',
  'package.json',
  'licenses',
]);

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function normalizePath(value) {
  return value.replace(/\\/gu, '/').replace(/^package\//u, '').replace(/\/$/u, '');
}

function isDeclared(relativePath, manifestFile) {
  const normalized = normalizePath(manifestFile);
  return relativePath === normalized || relativePath.startsWith(`${normalized}/`);
}

export function assertPackedFileBoundary({ entries, manifestFiles, requiredEntries = [] }) {
  const actualEntries = [...entries].sort();
  const manifest = [...manifestFiles];
  const duplicates = actualEntries.filter((entry, index) => entry === actualEntries[index - 1]);
  if (duplicates.length !== 0) fail('R1_EXIT_PACK_CONTENT_INVALID', `duplicate archive entries: ${duplicates.join(', ')}`);

  for (const required of requiredReleaseRoots) {
    if (!manifest.includes(required)) fail('R1_EXIT_PACK_CONTENT_INVALID', `manifest files omit required release entry: ${required}`);
  }

  for (const required of requiredEntries) {
    if (!actualEntries.includes(required)) fail('R1.5_PACK_CONTENT_MISSING', required);
  }

  for (const entry of actualEntries) {
    if (!entry.startsWith('package/') || entry.endsWith('/') || entry.includes('/../')) {
      fail('R1_EXIT_PACK_CONTENT_INVALID', entry);
    }
    const relative = normalizePath(entry);
    if (!manifest.some((file) => isDeclared(relative, file))) {
      fail('R1.5_PACK_CONTENT_INVALID', `archive entry is outside the declared package boundary: ${entry}`);
    }
  }

  for (const manifestFile of manifest) {
    if (!actualEntries.some((entry) => isDeclared(normalizePath(entry), manifestFile))) {
      fail('R1.5_PACK_CONTENT_MISSING', `declared package entry is absent: ${manifestFile}`);
    }
  }

  for (const requiredDirectory of ['generated', 'assets', 'licenses']) {
    if (!actualEntries.some((entry) => normalizePath(entry).startsWith(`${requiredDirectory}/`))) {
      fail('R1.5_PACK_CONTENT_MISSING', `${requiredDirectory}/`);
    }
  }

  return actualEntries;
}

export function assertExactArchiveEntries(actual, expected, code = 'R1.5_PACK_CONTENT_INVALID') {
  const actualEntries = [...actual].sort();
  const expectedEntries = [...expected].sort();
  if (actualEntries.length !== expectedEntries.length
    || actualEntries.some((entry, index) => entry !== expectedEntries[index])) {
    const missing = expectedEntries.filter((entry) => !actualEntries.includes(entry));
    const unexpected = actualEntries.filter((entry) => !expectedEntries.includes(entry));
    const duplicates = actualEntries.filter((entry, index) => entry === actualEntries[index - 1]);
    fail(code, `archive entries differ from the expected package set; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}; duplicate: ${duplicates.join(', ') || 'none'}`);
  }
  return actualEntries;
}

export function assertStylesheetAssetUrls({ stylesheet, stylesheetEntry, entries, entrySizes }) {
  const localUrls = [...stylesheet.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/gu)]
    .map(([, doubleQuoted, singleQuoted, bare]) => doubleQuoted ?? singleQuoted ?? bare)
    .filter((url) => !/^(?:data:|https?:|#)/u.test(url));
  if (localUrls.length === 0) fail('R1.5_PACK_STYLE_ASSET_MISSING', 'stylesheet contains no local asset URLs');

  for (const url of localUrls) {
    const relative = url.split(/[?#]/u, 1)[0];
    const archiveEntry = posix.normalize(posix.join(posix.dirname(stylesheetEntry), relative));
    if (!archiveEntry.startsWith('package/') || archiveEntry.includes('/../')) {
      fail('R1.5_PACK_STYLE_ASSET_MISSING', `stylesheet URL escapes the package: ${url}`);
    }
    if (!entries.includes(archiveEntry)) fail('R1.5_PACK_STYLE_ASSET_MISSING', archiveEntry);
    const size = entrySizes instanceof Map ? entrySizes.get(archiveEntry) : entrySizes?.[archiveEntry];
    if (!Number.isFinite(size) || size <= 0) fail('R1.5_PACK_STYLE_ASSET_MISSING', archiveEntry);
  }
}

export function assertExactDependencyGraph(actual, expected) {
  const actualNames = Object.keys(actual ?? {}).sort();
  const expectedNames = Object.keys(expected ?? {}).sort();
  if (actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])
    || expectedNames.some((name) => actual[name] !== expected[name])) {
    fail('R1_EXIT_PACK_MANIFEST_INVALID', `runtime dependency graph drifted: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

export function assertExactExportList(actual, expected, code = 'R1.5_PACK_EXPORT_SURFACE_INVALID') {
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    fail(code, `expected ${expected.join(', ')}, received ${actual.join(', ')}`);
  }
}

export function deriveCurrentExportSurface({ historicalFamilies, supplementalComponents }) {
  const canonicalHistoricalExports = historicalFamilies.map(({ corePublicFamily }) => corePublicFamily);
  const sortedSupplementalComponents = supplementalComponents.slice().sort((left, right) => left.slug.localeCompare(right.slug));
  const supplementalExports = sortedSupplementalComponents.map(({ export: { name } }) => name);
  const currentComponentExports = [...canonicalHistoricalExports, ...supplementalExports];
  const currentRootExports = [
    ...canonicalHistoricalExports,
    ...sortedSupplementalComponents.filter(({ export: { module } }) => module === '.').map(({ export: { name } }) => name),
  ];
  const isolatedExportModules = sortedSupplementalComponents
    .filter(({ export: { module } }) => module !== '.')
    .map(({ export: { name, module } }) => `${name}:${module}`);
  return { canonicalHistoricalExports, currentComponentExports, currentRootExports, isolatedExportModules };
}

// The React generator's output map is the single owner of the packed generated/ file set.
export function readGeneratedOutputNames(packageRoot) {
  const result = spawnSync(process.execPath, ['src/generate.mjs', '--list-outputs'], { cwd: packageRoot, encoding: 'utf8' });
  if (result.status !== 0) fail('R1.5_PACK_GENERATED_OUTPUTS_UNAVAILABLE', result.stderr || result.stdout);
  let names;
  try {
    names = JSON.parse(result.stdout);
  } catch (error) {
    fail('R1.5_PACK_GENERATED_OUTPUTS_INVALID', `generator --list-outputs did not print JSON: ${error.message}`);
  }
  if (!Array.isArray(names) || names.length === 0) {
    fail('R1.5_PACK_GENERATED_OUTPUTS_INVALID', 'generator --list-outputs must print a non-empty array');
  }
  if (new Set(names).size !== names.length) {
    fail('R1.5_PACK_GENERATED_OUTPUTS_INVALID', 'generator --list-outputs printed duplicate names');
  }
  const invalid = names.filter((name) => typeof name !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/u.test(name));
  if (invalid.length !== 0) {
    fail('R1.5_PACK_GENERATED_OUTPUTS_INVALID', `generated output names must be flat lowercase file names: ${invalid.map(String).join(', ')}`);
  }
  return names.sort();
}

export function deriveExpectedPackageEntries({ generatedOutputs, fixedEntries, trackedEntries }) {
  return [
    ...generatedOutputs.map((name) => `package/generated/${name}`),
    ...fixedEntries,
    ...trackedEntries,
  ].sort();
}

export { requiredReleaseRoots };

// Node's node_modules lookup: every ancestor that is not itself a node_modules directory.
function findInstalledPackage(fromDirectory, name) {
  for (let directory = fromDirectory; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name);
    if (basename(directory) !== 'node_modules' && existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(directory) === directory) return null;
  }
}

/**
 * Walks the installed runtime closure of `rootName` from a consumer through
 * Node's node_modules lookup, so npm, pnpm, and yarn node-modules layouts agree.
 * Installed peers are followed; `excludedNames` (the consumer-owned React peers)
 * are not. Returns a sorted Map of package name to its installed versions.
 */
export function collectInstalledClosure(consumerRoot, rootName, { excludedNames = [] } = {}) {
  const excluded = new Set(excludedNames);
  const rootDirectory = findInstalledPackage(consumerRoot, rootName);
  if (!rootDirectory) fail('R1_EXIT_CONSUMER_GRAPH_INVALID', `${rootName} is not installed in ${consumerRoot}`);
  const versions = new Map();
  const visited = new Set();
  const pending = [rootDirectory];
  while (pending.length !== 0) {
    const directory = pending.pop();
    if (visited.has(directory)) continue;
    visited.add(directory);
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    if (!versions.has(manifest.name)) versions.set(manifest.name, new Set());
    versions.get(manifest.name).add(manifest.version);
    // An optionalDependencies entry overrides the same name in dependencies.
    const optional = new Set(Object.keys(manifest.optionalDependencies ?? {}));
    const edges = [
      ...Object.keys(manifest.dependencies ?? {}).map((name) => [name, !optional.has(name)]),
      ...[...optional, ...Object.keys(manifest.peerDependencies ?? {})].map((name) => [name, false]),
    ];
    for (const [name, required] of edges) {
      if (excluded.has(name)) continue;
      const next = findInstalledPackage(directory, name);
      if (next) pending.push(next);
      else if (required) fail('R1_EXIT_CONSUMER_GRAPH_INVALID', `${manifest.name} cannot resolve its dependency ${name}`);
    }
  }
  return new Map([...versions].sort(([left], [right]) => left.localeCompare(right))
    .map(([name, set]) => [name, [...set].sort()]));
}

export function assertSingleInstalledVersion(closure, name, code) {
  const versions = closure.get(name) ?? [];
  if (versions.length !== 1) {
    fail(code, `expected exactly one installed ${name} version, found ${versions.length === 0 ? 'none' : versions.join(', ')}`);
  }
  return versions[0];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Builds the upstream-name matcher for the public surface. A scoped name or a bare
 * scope such as `@tiptap/` matches the whole scope; hyphenated or dotted names match
 * anywhere as names; plain words
 * such as `motion` or `marked` match only in specifier form (quoted, `name/x`,
 * or `name@1`) so prose like "typography and motion tokens" stays allowed.
 */
export function createUpstreamNameMatcher(packageNames, tokens = ['UNSTABLE_']) {
  const scopes = new Set();
  const distinctive = new Set();
  const plain = new Set();
  for (const name of packageNames) {
    if (name.startsWith('@')) scopes.add(name.slice(0, name.indexOf('/') + 1));
    else if (/[-.]/u.test(name)) distinctive.add(name);
    else plain.add(name);
  }
  const sources = [
    ...[...scopes].map((scope) => `(?<![\\w@/.-])${escapeRegExp(scope)}[\\w.-]+`),
    ...[...distinctive].map((name) => `(?<![\\w@/.-])${escapeRegExp(name)}(?![\\w-])`),
    ...[...plain].map((name) => `(?<=['"\`])${escapeRegExp(name)}(?=['"\`/@])|(?<![\\w@/.-])${escapeRegExp(name)}(?:@\\d|/[a-z])`),
    ...tokens.map(escapeRegExp),
  ];
  return new RegExp(sources.join('|'), 'gu');
}

function jsonPathMatches(path, pattern) {
  return path === pattern || path.startsWith(`${pattern}.`) || path.startsWith(`${pattern}[`);
}

function collectJsonLeaks(value, path, matcher, allowedPaths, findings, file) {
  if (allowedPaths.some((pattern) => jsonPathMatches(path, pattern))) return;
  if (Array.isArray(value)) {
    value.forEach((child) => collectJsonLeaks(child, `${path}[]`, matcher, allowedPaths, findings, file));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (allowedPaths.some((pattern) => jsonPathMatches(childPath, pattern))) continue;
      for (const [match] of key.matchAll(matcher)) findings.push({ file, location: `${childPath} (key)`, match });
      collectJsonLeaks(child, childPath, matcher, allowedPaths, findings, file);
    }
    return;
  }
  if (typeof value === 'string') {
    for (const [match] of value.matchAll(matcher)) findings.push({ file, location: path, match });
  }
}

const moduleSpecifierPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|<reference\s+types\s*=\s*)(['"])([^'"]+)\1/gu;

/**
 * Finds upstream names on the public surface. `declarations` may reference only
 * relative files and `allowedSpecifiers`; `entries` may not re-export a bare
 * specifier; `texts` and `json` guidance must not name an upstream package
 * outside `allowedJsonPaths` (dependency disclosure and donor provenance).
 */
export function findPublicSurfaceLeaks({
  declarations = [],
  entries = [],
  texts = [],
  json = [],
  matcher,
  allowedSpecifiers = ['react', 'react-dom'],
}) {
  const findings = [];
  const allowed = new Set(allowedSpecifiers);
  const bare = (specifier) => !specifier.startsWith('.') && !specifier.startsWith('/');
  const isAllowed = (specifier) => allowed.has(specifier) || [...allowed].some((name) => specifier.startsWith(`${name}/`));
  for (const { file, text } of declarations) {
    for (const [, , specifier] of text.matchAll(moduleSpecifierPattern)) {
      if (bare(specifier) && !isAllowed(specifier)) findings.push({ file, location: 'module specifier', match: specifier });
    }
    for (const [match] of text.matchAll(matcher)) findings.push({ file, location: 'declaration text', match });
  }
  for (const { file, text } of entries) {
    for (const [statement, , specifier] of text.matchAll(/\bexport\s+(?:\*|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s*(['"])([^'"]+)\1/gu)) {
      if (bare(specifier)) findings.push({ file, location: 'public re-export', match: statement });
    }
  }
  for (const { file, text } of texts) {
    for (const [match] of text.matchAll(matcher)) findings.push({ file, location: 'guidance text', match });
  }
  for (const { file, value, allowedJsonPaths = [] } of json) {
    collectJsonLeaks(value, '$', matcher, allowedJsonPaths, findings, file);
  }
  return findings;
}

export function assertNoPublicSurfaceLeaks(options) {
  const findings = findPublicSurfaceLeaks(options);
  if (findings.length !== 0) {
    fail('R1_EXIT_PACK_PUBLIC_LEAK', `upstream implementation detail leaked through the public surface: ${findings
      .map(({ file, location, match }) => `${file} ${location}: ${match}`).join('; ')}`);
  }
}

/** Maps a bundled module id to its installed package name, or null for consumer files. */
export function bundledModulePackage(id) {
  const normalized = id.replace(/\\/gu, '/').replace(/^\0/u, '');
  const index = normalized.lastIndexOf('/node_modules/');
  if (index === -1) return null;
  const segments = normalized.slice(index + '/node_modules/'.length).split('/');
  return segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
}

/**
 * Asserts a consumer bundle keeps `required` module ids and drops every
 * `forbidden` group; each forbidden entry names a label and a module-id test.
 */
export function assertBundleRetention({ modules, required = [], forbidden = [], code = 'R1_EXIT_PACK_TREE_SHAKING_FAILED' }) {
  const ids = modules.map(({ id }) => id.replace(/\\/gu, '/'));
  const missing = required.filter(({ test }) => !ids.some((id) => test(id))).map(({ label }) => label);
  const retained = forbidden.flatMap(({ label, test }) => {
    const hits = ids.filter((id) => test(id));
    return hits.length === 0 ? [] : [`${label} (${hits.slice(0, 3).join(', ')}${hits.length > 3 ? `, +${hits.length - 3} more` : ''})`];
  });
  if (missing.length !== 0 || retained.length !== 0) {
    fail(code, `required: ${missing.join(', ') || 'present'}; retained: ${retained.join('; ') || 'none'}`);
  }
}

/** Sums rendered bytes per installed package, with package-local files grouped under `self`. */
export function summarizeBundleModules(modules, self) {
  const totals = new Map();
  for (const { id, bytes } of modules) {
    const name = bundledModulePackage(id) ?? self;
    totals.set(name, (totals.get(name) ?? 0) + bytes);
  }
  return [...totals].sort(([, left], [, right]) => right - left);
}

const pureCallees = new Set(['React.forwardRef', 'React.createContext', 'React.memo', 'forwardRef', 'createContext', 'memo']);
const pureConstructors = new Set(['Set', 'Map', 'WeakMap', 'WeakSet']);

function calleeName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier') return `${node.object.name}.${node.property.name}`;
  return null;
}

/**
 * Allowlist of import-time-pure initializers: literals, functions, identifiers and
 * plain member reads, `new Set/Map/WeakMap/WeakSet()`, `React.forwardRef/createContext/memo`,
 * `Object.freeze` of literals, `typeof`-guarded choices between those, and calls
 * annotated `/*#__PURE__*\/`. Everything else may run code when the module loads.
 */
function isPureInitializer(node, pureAnnotated) {
  const pure = (child) => isPureInitializer(child, pureAnnotated);
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'UnaryExpression':
      return node.operator !== 'delete' && pure(node.argument);
    case 'BinaryExpression':
      return ['===', '!==', '==', '!='].includes(node.operator) && pure(node.left) && pure(node.right);
    case 'ConditionalExpression':
      return pure(node.test) && pure(node.consequent) && pure(node.alternate);
    case 'MemberExpression':
      return !node.computed && (node.object.type === 'Identifier' || node.object.type === 'MemberExpression') && pure(node.object);
    case 'ArrayExpression':
      return node.elements.every((element) => element !== null && element.type !== 'SpreadElement' && pure(element));
    case 'ObjectExpression':
      return node.properties.every((property) => property.type === 'Property' && property.kind === 'init'
        && (!property.computed || property.key.type === 'Literal') && pure(property.value));
    case 'NewExpression':
      return node.callee.type === 'Identifier' && pureConstructors.has(node.callee.name) && node.arguments.every(pure);
    case 'CallExpression': {
      const name = calleeName(node.callee);
      if (name === 'Object.freeze') return node.arguments.length === 1 && pure(node.arguments[0]);
      if ((pureCallees.has(name) || pureAnnotated.has(node.start)) && node.arguments.every(pure)) return true;
      return false;
    }
    default:
      return false;
  }
}

function isPureClass(node, pureAnnotated) {
  const superClass = node.superClass === null || ['Identifier', 'MemberExpression'].includes(node.superClass.type);
  return superClass && node.body.body.every((member) => member.type === 'MethodDefinition'
    || (member.type === 'PropertyDefinition' && (!member.static || member.value === null || isPureInitializer(member.value, pureAnnotated))));
}

function isPureDeclaration(node, pureAnnotated) {
  if (node.type === 'FunctionDeclaration') return true;
  if (node.type === 'ClassDeclaration') return isPureClass(node, pureAnnotated);
  if (node.type === 'VariableDeclaration') return node.declarations.every(({ init }) => init === null || isPureInitializer(init, pureAnnotated));
  return false;
}

/**
 * Returns the top-level statements of an ES module that may run code at import
 * time, judged by the allowlist above. `X.displayName` and `X.Root` assignments of
 * a literal or identifier are allowed component metadata.
 */
export function findModuleSideEffects(source) {
  const comments = [];
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', onComment: comments });
  const pureAnnotated = new Set();
  for (const comment of comments) {
    if (comment.type !== 'Block' || !/^\s*[#@]__PURE__\s*$/u.test(comment.value)) continue;
    const next = source.slice(comment.end).match(/^\s*/u)[0].length + comment.end;
    pureAnnotated.add(next);
  }
  const findings = [];
  const report = (node) => findings.push(source.slice(node.start, Math.min(node.end, node.start + 80)).replace(/\s+/gu, ' '));
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      if (node.specifiers.length === 0) report(node);
    } else if (node.type === 'ExportAllDeclaration') {
      continue;
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration && !isPureDeclaration(node.declaration, pureAnnotated)) report(node);
    } else if (node.type === 'ExportDefaultDeclaration') {
      const { declaration } = node;
      const pure = declaration.type === 'FunctionDeclaration'
        || (declaration.type === 'ClassDeclaration' ? isPureClass(declaration, pureAnnotated) : isPureInitializer(declaration, pureAnnotated));
      if (!pure) report(node);
    } else if (node.type === 'ExpressionStatement') {
      const { expression } = node;
      const metadata = expression.type === 'AssignmentExpression' && expression.operator === '='
        && expression.left.type === 'MemberExpression' && !expression.left.computed
        && expression.left.object.type === 'Identifier'
        && ['displayName', 'Root'].includes(expression.left.property.name)
        && ['Literal', 'Identifier'].includes(expression.right.type);
      if (!metadata) report(node);
    } else if (!isPureDeclaration(node, pureAnnotated)) {
      report(node);
    }
  }
  return findings;
}

/**
 * Environment for clean-consumer installs: drops the npm_* script context and any
 * YARN_* settings, and points npm/pnpm/yarn 1 user and global config at two empty
 * files (npm refuses to load one file twice) so the host's registry auth never reaches a consumer install.
 */
export function isolatedPackageManagerEnvironment(baseEnvironment, { userConfig, globalConfig }) {
  const environment = Object.fromEntries(Object.entries(baseEnvironment)
    .filter(([name]) => !/^(?:npm_|yarn_|PNPM_SCRIPT_SRC_DIR$|INIT_CWD$)/iu.test(name)));
  return {
    ...environment,
    npm_config_userconfig: userConfig,
    npm_config_globalconfig: globalConfig,
    npm_config_engine_strict: 'false',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    COREPACK_ENABLE_AUTO_PIN: '0',
  };
}

/**
 * Lists exact-pinned runtime dependencies that resolve to more than one installed
 * version in a consumer closure, as `{ name, pinned, versions }`.
 */
export function findPinnedDuplicateVersions(closure, dependencies) {
  return Object.entries(dependencies)
    .filter(([, range]) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(range))
    .map(([name, pinned]) => ({ name, pinned, versions: closure.get(name) ?? [] }))
    .filter(({ versions }) => versions.length > 1);
}

/** Path of a CLI bundled with the running Node (`npm` or `corepack`); fails closed when absent. */
export function nodeBundledCli(name, execPath = process.execPath) {
  const relative = { npm: 'npm/bin/npm-cli.js', corepack: 'corepack/dist/corepack.js' }[name];
  const path = join(dirname(execPath), '..', 'lib', 'node_modules', relative);
  if (!existsSync(path)) fail('R1_EXIT_CONSUMER_MATRIX_UNAVAILABLE', `${name} is not bundled with ${execPath}`);
  return path;
}

const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const lucideIconSpecifier = /lucide-react\/dist\/esm\/icons\/([a-z0-9-]+)\.mjs/gu;
const byPath = (left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

/** Digests each `{ path, bytes }` and the sorted set; any byte or membership change moves the set digest. */
export function digestFileSet(files, code = 'R1_EXIT_CORRELATION_INVALID') {
  const entries = files.map(({ path, bytes }) => ({ path, sha256: digest(bytes) })).sort(byPath);
  if (entries.length === 0) fail(code, 'a file set must not be empty');
  if (new Set(entries.map(({ path }) => path)).size !== entries.length) fail(code, 'duplicate file path');
  return { digest: digest(canonicalJson(entries)), entries };
}

/**
 * Decision 0011 amendment 02: a token, stylesheet (geometry), Lucide version,
 * or icon-mapping change invalidates the recorded visual comparison. This
 * identity binds exactly those inputs; `modules` are the packed runtime files
 * whose Lucide imports form the icon mapping.
 */
export function deriveVisualContract({ tokenSource, stylesheets, lucide, modules }) {
  const code = 'R1_EXIT_VISUAL_CONTRACT_INVALID';
  if (!tokenSource?.path || !tokenSource.bytes?.length) fail(code, 'the canonical token source is required');
  if (!/^\d+\.\d+\.\d+$/u.test(lucide?.version ?? '') || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(lucide?.integrity ?? '')) {
    fail(code, 'Lucide requires an exact version and lockfile integrity');
  }
  const icons = Object.fromEntries(modules
    .map(({ path, source }) => [path, [...new Set([...source.matchAll(lucideIconSpecifier)].map(([, name]) => name))].sort()])
    .filter(([, names]) => names.length > 0)
    .sort(([left], [right]) => (left < right ? -1 : 1)));
  if (Object.keys(icons).length === 0) fail(code, 'no packed module imports a Lucide affordance');
  const inputs = {
    tokens: { path: tokenSource.path, sha256: digest(tokenSource.bytes) },
    stylesheets: digestFileSet(stylesheets, code).entries,
    lucide: { version: lucide.version, integrity: lucide.integrity, icons },
  };
  return { digest: digest(canonicalJson(inputs)), inputs };
}

/** Names every recorded visual-contract input that the current identity no longer matches. */
export function findVisualContractInvalidations(recorded, current) {
  const changed = [];
  const same = (left, right) => canonicalJson(left ?? null) === canonicalJson(right ?? null);
  if (!same(recorded.inputs.tokens, current.inputs.tokens)) changed.push('tokens');
  const recordedSheets = new Map(recorded.inputs.stylesheets.map(({ path, sha256 }) => [path, sha256]));
  const currentSheets = new Map(current.inputs.stylesheets.map(({ path, sha256 }) => [path, sha256]));
  for (const path of [...new Set([...recordedSheets.keys(), ...currentSheets.keys()])].sort()) {
    if (recordedSheets.get(path) !== currentSheets.get(path)) changed.push(`stylesheet:${path}`);
  }
  for (const key of ['version', 'integrity', 'icons']) {
    if (!same(recorded.inputs.lucide[key], current.inputs.lucide[key])) changed.push(`lucide.${key}`);
  }
  if (changed.length === 0 && recorded.digest !== current.digest) changed.push('digest');
  return changed;
}

/**
 * Architecture release manifest: exact source, lockfile, generated-output,
 * catalog, token, binding-spec, package, evidence, exception, and visual
 * contract identities for one candidate. Missing identities fail closed.
 */
export function buildReleaseCorrelation({
  source, lockfile, generated, catalogPackage, catalogBundle, bindings, workspacePackages, retainedEvidence, activeExceptions,
  visualContract,
}) {
  const code = 'R1_EXIT_CORRELATION_INVALID';
  if (!/^[0-9a-f]{40}$/u.test(source?.revision ?? '') || !/^[0-9a-f]{40}$/u.test(source?.tree ?? '')) {
    fail(code, 'source revision and tree must be exact Git object IDs');
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(catalogPackage?.catalogDigest ?? '') || catalogPackage.catalogDigest !== catalogBundle?.catalogDigest) {
    fail(code, 'catalog package and bundle digests must agree');
  }
  const token = catalogBundle.artifacts.find(({ kind }) => kind === 'token');
  if (!token?.record?.tokenContractVersion) fail(code, 'the catalog token source has no contract version');
  const bindingIdentities = [...bindings].sort().map((binding) => {
    const [artifactId, profile] = binding.split('#');
    const artifact = catalogBundle.artifacts.find(({ id }) => id === artifactId);
    const identity = {
      binding,
      specRevision: artifact?.bindingSpecRevisions?.[profile],
      tokenRequirementSet: catalogPackage.tokenRequirementSets?.[`${binding}:${profile}`],
      platformSafetyRequirementSet: catalogPackage.platformSafetyRequirementSets?.[`${binding}:${profile}`],
    };
    const missing = Object.entries(identity).filter(([, value]) => typeof value !== 'string').map(([key]) => key);
    if (missing.length !== 0) fail(code, `${binding} has no catalog ${missing.join(', ')}`);
    return identity;
  });
  if (retainedEvidence.length === 0) fail(code, 'retained evidence indexes are required');
  return {
    source: { revision: source.revision, tree: source.tree },
    lockfile: { path: lockfile.path, sha256: digest(lockfile.bytes) },
    generatedOutputs: digestFileSet(generated, code),
    catalog: {
      name: catalogPackage.name,
      version: catalogPackage.catalogVersion,
      digest: catalogPackage.catalogDigest,
      schemaVersion: catalogBundle.schemaVersion,
      queryApiVersion: catalogPackage.queryApiVersion,
      sourceRevision: catalogPackage.sourceRevision,
      platformSafetyContract: catalogPackage.platformSafetyContract,
    },
    tokens: { id: token.id, contentRevision: token.contentRevision, tokenContractVersion: token.record.tokenContractVersion },
    bindings: bindingIdentities,
    packages: [...workspacePackages]
      .map(({ name, version, private: isPrivate }) => ({ name, version, private: isPrivate === true }))
      .sort((left, right) => (left.name < right.name ? -1 : 1)),
    evidence: {
      retained: retainedEvidence.map(({ milestone, path, bytes }) => ({ milestone, path, sha256: digest(bytes) })),
      activeExceptions: activeExceptions.map((exception) => digest(canonicalJson(exception))),
    },
    visualContract,
  };
}

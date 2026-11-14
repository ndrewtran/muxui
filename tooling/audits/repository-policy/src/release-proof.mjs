import { spawnSync } from 'node:child_process';
import { parse } from 'acorn';
import * as cssTree from 'css-tree';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';

export { deriveVisualContract, digestFileSet, readLockedIntegrity } from './release-contract.mjs';

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

// The single-colon spellings CSS keeps for the CSS 2 pseudo-elements.
const legacyPseudoElements = new Set(['before', 'after', 'first-line', 'first-letter']);

/**
 * Adds the whole class names a selector's subject compound requires, the elements its rule styles: class selectors and
 * `[class~=x]` (not `[class*=]` or `[class^=]`), with escapes decoded, and the subjects of `:is()` and `:where()` arguments.
 * Ancestor and sibling compounds and `:not()`, `:has()` and other pseudo-class arguments never count, and neither does a compound
 * with a pseudo-element (`::after`, `::placeholder`, legacy `:before`): the rule styles that pseudo-element, not the element.
 * Nesting is not supported: a nested rule is left unparsed, so `&` never counts its parent.
 */
function addSubjectClasses(selector, styled) {
  const nodes = [...selector.children];
  const subject = nodes.slice(nodes.findLastIndex(({ type }) => type === 'Combinator') + 1);
  if (subject.some(({ type, name }) => type === 'PseudoElementSelector'
    || (type === 'PseudoClassSelector' && legacyPseudoElements.has(name.toLowerCase())))) return;
  for (const node of subject) {
    if (node.type === 'ClassSelector') styled.add(cssTree.ident.decode(node.name));
    if (node.type === 'AttributeSelector' && node.matcher === '~=' && cssTree.ident.decode(node.name.name).toLowerCase() === 'class') {
      styled.add(node.value.type === 'String' ? node.value.value : cssTree.ident.decode(node.value.name));
    }
    if (node.type === 'PseudoClassSelector' && ['is', 'where'].includes(node.name.toLowerCase())) {
      for (const list of node.children ?? []) {
        if (list.type === 'SelectorList') for (const argument of list.children) addSubjectClasses(argument, styled);
      }
    }
  }
}

/**
 * The classes a stylesheet styles: each whole class name in the subject of a style rule that has a declaration or a nested rule.
 * Comments, empty rules, at-rule conditions (`@scope` roots and limits, `@supports selector()`) and mentions outside a subject
 * never count. The React styling inventory reads authored CSS through this too, so a `hookOnly` row in the part map means the same
 * thing to it and to the packed check: a documented hook outside this set.
 */
export function styledSubjectClasses(stylesheet) {
  const styled = new Set();
  cssTree.walk(cssTree.parse(stylesheet, { positions: false, parseValue: false }), {
    visit: 'Rule',
    enter: ({ prelude, block }) => {
      if (prelude.type !== 'SelectorList' || block.children.isEmpty) return;
      for (const selector of prelude.children) addSubjectClasses(selector, styled);
    },
  });
  return styled;
}

/**
 * Fails unless the packed stylesheet styles (`styledSubjectClasses`) every hook the part map
 * (`packages/react/test/support/styling-parts.ts`) says a Mux rule styles for each component: its `class`, `root-element` and
 * shared `field` rows that are not `hookOnly`. A `styledThrough` row needs its supplying class styled instead. A component whose
 * rows have no such hook, such as one another family supplies the whole look of, needs no rule of its own; a component with no
 * rows at all fails.
 */
export function assertPackedComponentStyles({ stylesheet, componentExports, partRows }) {
  const styled = styledSubjectClasses(stylesheet);
  const failures = componentExports.flatMap((name) => {
    const slug = name.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();
    const rows = partRows.filter(({ family }) => family === slug);
    if (rows.length === 0) return [`${name}: the part map has no rows for ${slug}`];
    return rows
      .filter(({ disposition, hook, hookOnly }) => (
        ['class', 'root-element', 'field'].includes(disposition) && hook !== undefined && hookOnly === undefined
      ))
      .flatMap(({ hook, styledThrough }) => {
        if (styledThrough !== undefined) return styled.has(styledThrough) ? [] : [`${name}: no rule selects .${styledThrough}, which styles .${hook}`];
        return styled.has(hook) ? [] : [`${name}: no rule selects .${hook}`];
      });
  });
  if (failures.length !== 0) fail('R1.5_PACK_STYLE_MISSING', failures.join('; '));
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
 * Guidance scanning separately recognizes the complete emitted Shortcut attribute
 * statement; the matcher itself still includes the transitive `aria-hidden` name.
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

/**
 * The emitted Shortcut statement describes the ARIA attribute, not the installed
 * package of the same name. Recognize that complete statement only at the start
 * of a guidance string or line (optionally a Markdown bullet). Do not infer an
 * attribute from a nearby "is", "attribute", or boolean property: those also
 * occur in dependency descriptions and maps. Other wording stays fail-closed;
 * declarations and JSON keys use the unchanged strict name matcher.
 */
function publicGuidanceMatches(text, matcher) {
  return [...text.matchAll(matcher)].filter((match) => match[0] !== 'aria-hidden'
    || !/(?:^|\n)[ \t]*(?:[-*][ \t]+)?Shortcut is $/u.test(text.slice(0, match.index))
    || !/^ by default\.(?=\s|$)/u.test(text.slice(match.index + match[0].length)));
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
    for (const [match] of publicGuidanceMatches(value, matcher)) findings.push({ file, location: path, match });
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
    for (const [match] of publicGuidanceMatches(text, matcher)) findings.push({ file, location: 'guidance text', match });
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

// Relative paths of every file under `root`, skipping nested `node_modules`
// (npm and yarn may nest unhoisted dependencies inside an installed package).
function listPackageFiles(root, directory = '') {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listPackageFiles(root, path);
    return [path];
  }).sort();
}

/**
 * Fails with R1_EXIT_CONSUMER_MATRIX_CANDIDATE_MISMATCH unless the `name` package
 * installed for `consumerRoot` is byte-identical to the extracted candidate in
 * `candidateRoot` (the archive's `package/` directory), so a cached or stale build
 * of the same version cannot stand in for the packed candidate.
 */
export function assertInstalledCandidate(consumerRoot, name, candidateRoot) {
  const installed = findInstalledPackage(consumerRoot, name);
  const mismatch = (details) => fail('R1_EXIT_CONSUMER_MATRIX_CANDIDATE_MISMATCH', JSON.stringify({ package: name, consumer: consumerRoot, ...details }));
  if (!installed) mismatch({ installed: null });
  const expected = listPackageFiles(candidateRoot);
  const actual = new Set(listPackageFiles(installed));
  const missing = expected.filter((path) => !actual.has(path));
  const changed = expected.filter((path) => actual.has(path)
    && !readFileSync(join(candidateRoot, path)).equals(readFileSync(join(installed, path))));
  const expectedSet = new Set(expected);
  const added = [...actual].filter((path) => !expectedSet.has(path));
  if (missing.length || changed.length || added.length) mismatch({ installed, missing, changed, added });
  return { installed, files: expected.length };
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

/**
 * Applies every version rewrite in one pass, so a rewrite never feeds another
 * (rc.1 -> rc.2 and rc.2 -> rc.3 together). A version never matches inside a
 * longer one (`rc.1` inside `rc.10`, or `0.1.0` inside `10.1.0`).
 */
export function replaceVersions(text, rewrites) {
  const pattern = new RegExp(`(?<![\\d.])(?:${[...rewrites.keys()].map((key) => key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})(?!\\d)`, 'gu');
  return text.replace(pattern, (match) => rewrites.get(match));
}

/**
 * How the checks behind a candidate ran, for the release manifest: the full graph in this process's
 * `pnpm release:prepare`, or a green full main CI run that the publish workflow's dry run relied on, named by
 * MUXUI_RELEASE_MAIN_CI_RUN and MUXUI_RELEASE_MAIN_CI_ATTEMPT.
 */
export function derivePreparation(environment, headRevision) {
  const run = environment.MUXUI_RELEASE_MAIN_CI_RUN ?? '';
  const attempt = environment.MUXUI_RELEASE_MAIN_CI_ATTEMPT ?? '';
  if (run === '' && attempt === '') return { mode: 'full-checks' };
  if (!/^[1-9]\d*$/u.test(run) || !/^[1-9]\d*$/u.test(attempt)) {
    fail('R1_EXIT_PREPARATION_INVALID', 'MUXUI_RELEASE_MAIN_CI_RUN and MUXUI_RELEASE_MAIN_CI_ATTEMPT must both be positive integers');
  }
  return {
    mode: 'main-ci-reused',
    mainCi: {
      workflow: '.github/workflows/ci.yml', event: 'push', branch: 'main', headRevision, runId: Number(run), runAttempt: Number(attempt),
    },
  };
}

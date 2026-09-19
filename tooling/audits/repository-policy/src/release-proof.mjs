import { posix } from 'node:path';

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
    fail(code, `expected ${expectedEntries.join(', ')}, received ${actualEntries.join(', ')}`);
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

export { requiredReleaseRoots };

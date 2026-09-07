import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createCatalogApi, createCatalogDiagnostic } from '@muxui/catalog';
import {
  QUERY_API_VERSIONS,
  canonicalDigest,
  canonicalJson,
  parseJsonStrict,
} from '@muxui/schema';
import { valid, validRange } from 'semver';
import { resolveCatalogGraph } from './local-resolver.mjs';

const CATALOG_PACKAGE = '@muxui/catalog';

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isSafeRelative(value) {
  return typeof value === 'string'
    && value.length > 0
    && /^[A-Za-z0-9._/-]+$/u.test(value)
    && !isAbsolute(value)
    && !value.split('/').includes('..');
}

function safeRelativeFrom(root, path, fallback = 'invalid-relative-path') {
  const value = relative(root, path).split('\\').join('/') || '.';
  return isSafeRelative(value) ? value : fallback;
}

function readJson(path) {
  return parseJsonStrict(readFileSync(path, 'utf8'));
}

function findPnpmRoot(start) {
  let current = start;
  while (true) {
    const manifestPath = join(current, 'package.json');
    let manifest = null;
    try {
      manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
    } catch {
      return null;
    }
    if (
      existsSync(join(current, 'pnpm-lock.yaml'))
      && /^pnpm@\d+\.\d+\.\d+$/u.test(manifest?.packageManager ?? '')
    ) return { path: current, packageManager: manifest.packageManager };
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function declaredCatalogRange(manifest) {
  const declarations = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
  ].filter(Boolean);
  const matches = declarations
    .filter((dependencies) => Object.hasOwn(dependencies, CATALOG_PACKAGE))
    .map((dependencies) => dependencies[CATALOG_PACKAGE]);
  return matches.length === 1 ? matches[0] : matches.length === 0 ? null : 'ambiguous';
}

function safeDeclaredRange(value) {
  if (value === null || value === 'ambiguous') return value;
  const normalized = value?.startsWith('workspace:') ? value.slice('workspace:'.length) : value;
  if (['workspace:*', 'workspace:^', 'workspace:~'].includes(value)) return value;
  if (['^', '~'].includes(normalized)) return 'unsupported';
  return validRange(normalized) !== null ? value : 'unsupported';
}

function safeWorkspacePackage(value) {
  return /^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/u.test(value ?? '') ? value : null;
}

function pnpmList(projectPath, packageName, lockfileOnly) {
  const result = spawnSync('pnpm', [
    '--dir', projectPath, 'list', packageName, '--depth', '0', '--json',
    ...(lockfileOnly ? ['--lockfile-only'] : []),
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) return null;
  try {
    const roots = parseJsonStrict(result.stdout);
    if (!Array.isArray(roots) || roots.length !== 1) return null;
    return roots[0].dependencies?.[packageName]
      ?? roots[0].devDependencies?.[packageName]
      ?? roots[0].optionalDependencies?.[packageName]
      ?? null;
  } catch {
    return null;
  }
}

function resolvedVersion(dependency) {
  if (!dependency) return null;
  if (valid(dependency.version)) return dependency.version;
  if (typeof dependency.path === 'string' && existsSync(join(dependency.path, 'package.json'))) {
    try {
      return valid(readJson(join(dependency.path, 'package.json')).version);
    } catch {
      return null;
    }
  }
  return null;
}

function resolutionIntegrity(dependency) {
  if (!dependency) return null;
  const integrity = dependency.integrity ?? dependency.resolution?.integrity;
  if (typeof integrity === 'string' && /^(?:sha512-|sha512:)/u.test(integrity)) return integrity;
  if (typeof dependency.version === 'string' && /^(?:link|file):/u.test(dependency.version)) {
    return dependency.version;
  }
  return null;
}

function parseProjectionSidecar(path, expectedPath, bytes) {
  const sidecar = readFileSync(`${path}.provenance`, 'utf8');
  const match = sidecar.match(
    /^\/\/ @generated-from: ([^\n]+)\n\/\/ @generated-content-sha256: (sha256:[a-f0-9]{64})\n([\s\S]+)$/u,
  );
  if (!match || sha256(match[3]) !== match[2]) return false;
  let record;
  try {
    record = parseJsonStrict(match[3]);
  } catch {
    return false;
  }
  return record.path === expectedPath && record.sha256 === sha256(bytes);
}

function hasExactFields(value, fields) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => fields.includes(field));
}

function hasDigestMap(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.values(value).every((digest) => /^sha256:[a-f0-9]{64}$/u.test(digest));
}

function loadCatalogCandidate(packageRoot) {
  const failures = [];
  let packageManifest;
  let identity;
  let bundle;
  let identityValid = false;
  let releaseManifest = null;
  try {
    packageManifest = readJson(join(packageRoot, 'package.json'));
    const identityPointer = packageManifest.muxUi?.catalogPackage;
    if (!isSafeRelative(identityPointer)) throw new Error('unsafe catalog pointer');
    const identityPath = resolve(packageRoot, identityPointer);
    const identityBytes = readFileSync(identityPath, 'utf8');
    identity = parseJsonStrict(identityBytes);
    const identityFields = [
      'bundle', 'catalogDigest', 'catalogVersion', 'name', 'provenance',
      'queryApiVersion', 'supportedQueryApiVersions', 'releaseManifest', 'schema', 'schemaRange',
      'sourceRevision', 'tokenRequirementSets', 'platformSafetyContract',
      'platformSafetyRequirementSets', 'version',
    ];
    identityValid = (
      identity.schema !== 'muxui-catalog-package-v2'
      ? false
      : hasExactFields(identity, identityFields)
        && hasExactFields(identity.provenance, ['kind', 'value'])
        && identity.tokenRequirementSets !== null
        && typeof identity.tokenRequirementSets === 'object'
        && !Array.isArray(identity.tokenRequirementSets)
        && hasExactFields(identity.platformSafetyContract, ['digest', 'version'])
        && identity.platformSafetyRequirementSets !== null
        && typeof identity.platformSafetyRequirementSets === 'object'
        && !Array.isArray(identity.platformSafetyRequirementSets)
        && Array.isArray(identity.supportedQueryApiVersions)
        && identity.supportedQueryApiVersions.length > 0
        && identity.supportedQueryApiVersions.every((value) => typeof value === 'string')
        && new Set(identity.supportedQueryApiVersions).size === identity.supportedQueryApiVersions.length
        && identity.supportedQueryApiVersions.includes(identity.queryApiVersion)
        && [
          identity.bundle,
          identity.catalogDigest,
          identity.catalogVersion,
          identity.name,
          identity.provenance.kind,
          identity.provenance.value,
          identity.queryApiVersion,
          identity.schemaRange,
          identity.sourceRevision,
          identity.version,
        ].every((value) => typeof value === 'string')
    );
    if (!identityValid) failures.push('catalog-package-schema-mismatch');
    if (!parseProjectionSidecar(
      identityPath,
      'packages/catalog/generated/catalog-package.json',
      identityBytes,
    )) failures.push('catalog-package-provenance-mismatch');
    if (!isSafeRelative(identity.bundle)) throw new Error('unsafe bundle pointer');
    const bundlePath = resolve(dirname(identityPath), identity.bundle);
    const bundleBytes = readFileSync(bundlePath, 'utf8');
    bundle = parseJsonStrict(bundleBytes);
    if (!parseProjectionSidecar(
      bundlePath,
      'packages/catalog/generated/catalog.json',
      bundleBytes,
    )) failures.push('catalog-bundle-provenance-mismatch');
  } catch {
    failures.push('catalog-package-metadata-missing');
  }
  if (packageManifest && identity && bundle) {
    const { catalogDigest: _catalogDigest, ...preimage } = bundle;
    if (
      packageManifest.name !== CATALOG_PACKAGE
      || identity.name !== CATALOG_PACKAGE
      || !valid(packageManifest.version)
      || !valid(identity.version)
      || packageManifest.version !== identity.version
      || identity.version !== identity.catalogVersion
      || identity.catalogVersion !== bundle.catalogVersion
    ) failures.push('catalog-version-mismatch');
    if (
      identity.catalogDigest !== canonicalDigest(preimage)
      || identity.catalogDigest !== bundle.catalogDigest
    ) failures.push('catalog-digest-mismatch');
    if (
      identity.sourceRevision !== bundle.sourceRevision
      || identity.provenance?.kind !== 'source-revision'
      || identity.provenance.value !== bundle.sourceRevision
    ) failures.push('catalog-provenance-mismatch');
    if (
      identity.queryApiVersion !== bundle.apiVersion
      || canonicalJson(identity.supportedQueryApiVersions ?? [])
        !== canonicalJson(bundle.supportedQueryApiVersions ?? [])
    ) failures.push('query-api-mismatch');
    try {
      createCatalogApi(bundle);
    } catch {
      failures.push('catalog-bundle-invalid');
    }
    const release = identity.releaseManifest;
    const releaseFields = [
      'bindings', 'catalog', 'id', 'queryApiVersion', 'releaseVersion',
      'schemaVersion', 'sourceRevision', 'tokenContractVersion',
    ];
    const bindingFields = [
      'binding', 'descriptor', 'export', 'package', 'specRevision',
      'tokenRequirementSetDigests', 'platformSafetyRequirementSetDigests', 'version',
    ];
    const bindingScalarFields = [
      'binding', 'descriptor', 'export', 'package', 'specRevision', 'version',
    ];
    const releaseValid = hasExactFields(release, releaseFields)
      && hasExactFields(release.catalog, ['digest', 'id', 'version'])
      && Array.isArray(release.bindings)
      && release.bindings.every((binding) => hasExactFields(binding, bindingFields))
      && release.bindings.every((binding) => (
        hasDigestMap(binding.tokenRequirementSetDigests)
        && hasDigestMap(binding.platformSafetyRequirementSetDigests)
      ))
      && [
        release.id,
        release.queryApiVersion,
        release.releaseVersion,
        release.schemaVersion,
        release.sourceRevision,
        release.tokenContractVersion,
        release.catalog.digest,
        release.catalog.id,
        release.catalog.version,
        ...release.bindings.flatMap((binding) => bindingScalarFields.map((field) => binding[field])),
      ].every((value) => typeof value === 'string')
      && new Set(release.bindings.map(({ binding }) => binding)).size === release.bindings.length;
    if (
      !releaseValid
      || release?.sourceRevision !== identity.sourceRevision
      || release?.catalog?.version !== identity.version
      || release?.catalog?.digest !== identity.catalogDigest
      || release?.queryApiVersion !== identity.queryApiVersion
      || !Array.isArray(release?.bindings)
    ) failures.push('release-manifest-mismatch');
    if (releaseValid) releaseManifest = release;
  }
  return {
    packageManifest,
    identity: identityValid ? identity : null,
    releaseManifest,
    bundle,
    packageRoot,
    failures: [...new Set(failures)],
  };
}

function loadRendererCandidate(packageRoot, expectedDescriptorId) {
  try {
    const packageManifest = readJson(join(packageRoot, 'package.json'));
    const pointer = packageManifest.muxUi?.rendererDescriptor;
    if (!isSafeRelative(pointer)) return null;
    const descriptorPath = resolve(packageRoot, pointer);
    const bytes = readFileSync(descriptorPath, 'utf8');
    const descriptor = parseJsonStrict(bytes);
    if (!parseProjectionSidecar(
      descriptorPath,
      `packages/${packageManifest.name.replace(/^@muxui\//u, '')}/generated/renderer-descriptor.json`,
      bytes,
    )) return null;
    if (
      descriptor.id !== expectedDescriptorId
      || descriptor.package !== packageManifest.name
      || descriptor.version !== packageManifest.version
    ) return null;
    if (Object.values(descriptor.bindings ?? {}).some(({ export: exportName }) => {
      const prefix = `${packageManifest.name}/`;
      if (typeof exportName !== 'string' || !exportName.startsWith(prefix)) return true;
      return !Object.hasOwn(packageManifest.exports ?? {}, `./${exportName.slice(prefix.length)}`);
    })) return null;
    return descriptor;
  } catch {
    return null;
  }
}

function cacheRoot(projectPath, cache) {
  return join(
    projectPath,
    '.cache/muxui/catalogs',
    cache.version,
    cache.digest.replace(/^sha256:/u, ''),
  );
}

function projectFailure(packageManager = 'pnpm@0.0.0') {
  const [name, version] = packageManager.split('@');
  return resolveCatalogGraph({
    packageManager: { name: name || 'pnpm', version: version || '0.0.0', lockfileVersion: '0.0' },
    catalogs: [],
    rendererDescriptors: [],
    releaseManifests: [],
    graph: {
      id: 'pnpm-project',
      selectedWorkspace: '.',
      workspaceRoot: '.',
      workspaces: [],
      lockfile: [],
      installed: [],
      caches: [],
      request: { bindings: [], cache: null, queryApiVersion: null },
    },
  });
}

function cacheIdentityFailure(workspacePath, packageManager, declaredRange, cache) {
  return createCatalogDiagnostic({
    code: 'MUXUI_CATALOG_INTEGRITY_MISMATCH',
    ruleId: 'resolver.catalog.cache-identity',
    message: 'The explicit cache identity is not an exact version and SHA-256 digest.',
    retryable: true,
    details: {
      workspacePackage: null,
      workspacePath,
      packageManager,
      declaredRange,
      lockfileVersions: [],
      installedVersions: [],
      catalogVersion: valid(cache?.version) ?? null,
      catalogDigest: /^sha256:[a-f0-9]{64}$/u.test(cache?.digest ?? '') ? cache.digest : null,
      expectedDigest: null,
      actualDigest: null,
      candidates: [],
      compatibilityFailures: [],
      secondaryFailures: [],
    },
    nextCommand: {
      command: `pnpm --dir ${workspacePath} why ${CATALOG_PACKAGE}`,
      effect: 'read-only',
      requiresConfirmation: false,
    },
  });
}

function bindingForPlatform(record, platform) {
  if (record?.kind !== 'component' || platform === null) return null;
  if (record.bindings?.[platform]) return `${record.id}#${platform}`;
  const match = Object.entries(record.bindings ?? {}).find(([, binding]) => (
    Object.hasOwn(binding.runtimeProfiles ?? {}, platform)
  ));
  return match ? `${record.id}#${match[0]}` : null;
}

function requestedBindings(bundle, { artifact, bindings, platform }) {
  if (bindings.length > 0) return [...new Set(bindings)].sort();
  if (platform === null) return [];
  const artifacts = artifact === null
    ? bundle.artifacts
    : bundle.artifacts.filter(({ id }) => id === artifact);
  return artifacts
    .map(({ record }) => bindingForPlatform(record, platform))
    .filter(Boolean)
    .sort();
}

export function resolvePnpmProjectCatalog({
  project = null,
  cache = null,
  bindings = [],
  artifact = null,
  platform = null,
  filterBindings = false,
  queryApiVersion = null,
} = {}) {
  if (
    !Array.isArray(bindings)
    || bindings.some((binding) => typeof binding !== 'string')
    || (artifact !== null && typeof artifact !== 'string')
    || (platform !== null && typeof platform !== 'string')
    || typeof filterBindings !== 'boolean'
    || (queryApiVersion !== null && !QUERY_API_VERSIONS.includes(queryApiVersion))
    || (project !== null && !isSafeRelative(project))
  ) return projectFailure('pnpm@0.0.0');
  const selectedPath = resolve(process.cwd(), project ?? '.');
  try {
    if (!existsSync(selectedPath) || !statSync(selectedPath).isDirectory()) {
      return projectFailure('pnpm@0.0.0');
    }
  } catch {
    return projectFailure('pnpm@0.0.0');
  }

  let projectManifest;
  try {
    projectManifest = readJson(join(selectedPath, 'package.json'));
  } catch {
    return projectFailure('pnpm@0.0.0');
  }
  const pnpmRoot = findPnpmRoot(selectedPath);
  if (!pnpmRoot || pnpmRoot.packageManager !== 'pnpm@10.33.0') {
    return projectFailure(pnpmRoot?.packageManager);
  }
  const workspacePath = safeRelativeFrom(pnpmRoot.path, selectedPath, '.');
  const declaredRange = safeDeclaredRange(declaredCatalogRange(projectManifest));
  if (
    cache !== null
    && (valid(cache.version) === null || !/^sha256:[a-f0-9]{64}$/u.test(cache.digest ?? ''))
  ) {
    return cacheIdentityFailure(
      workspacePath,
      pnpmRoot.packageManager,
      declaredRange,
      cache,
    );
  }

  const installedCatalog = pnpmList(selectedPath, CATALOG_PACKAGE, false);
  const lockedCatalog = pnpmList(selectedPath, CATALOG_PACKAGE, true);
  const installedVersion = resolvedVersion(installedCatalog);
  const lockedVersion = resolvedVersion(lockedCatalog);
  const candidateRoot = cache
    ? cacheRoot(selectedPath, cache)
    : installedCatalog?.path;
  const candidate = candidateRoot
    ? loadCatalogCandidate(candidateRoot)
    : { identity: null, bundle: null, failures: ['catalog-package-metadata-missing'] };
  const identity = candidate.identity;
  const release = candidate.releaseManifest;
  const bindingRequests = candidate.bundle && candidate.failures.length === 0
    ? requestedBindings(candidate.bundle, { artifact, bindings, platform })
    : bindings;
  const catalogId = release?.catalog?.id ?? 'unresolved-catalog';
  const catalogs = identity ? [{
    id: catalogId,
    name: identity.name,
    version: identity.version,
    catalogVersion: identity.catalogVersion,
    catalogDigest: identity.catalogDigest,
    queryApiVersion: identity.queryApiVersion,
    supportedQueryApiVersions: identity.supportedQueryApiVersions,
    schemaRange: identity.schemaRange,
    sourceRevision: identity.sourceRevision,
    provenance: identity.provenance,
    releaseManifest: release?.id ?? 'unresolved-release',
    tokenRequirementSets: identity.tokenRequirementSets,
    platformSafetyRequirementSets: identity.platformSafetyRequirementSets,
  }] : [];
  const releaseManifests = release ? [release] : [];

  const rendererDescriptors = [];
  const rendererInstalled = [];
  const rendererLocks = [];
  const selectedBindings = new Set(bindingRequests);
  const requiredRenderers = [...new Map(
    (release?.bindings ?? [])
      .filter(({ binding }) => selectedBindings.has(binding))
      .map((binding) => [binding.package, binding]),
  ).values()];
  for (const expected of requiredRenderers) {
    const installed = pnpmList(selectedPath, expected.package, false);
    const locked = pnpmList(selectedPath, expected.package, true);
    const descriptor = installed?.path
      ? loadRendererCandidate(installed.path, expected.descriptor)
      : null;
    if (descriptor) rendererDescriptors.push(descriptor);
    const rendererVersion = resolvedVersion(installed);
    if (rendererVersion) {
      rendererInstalled.push({
        workspace: workspacePath,
        name: expected.package,
        version: rendererVersion,
        kind: 'renderer',
        fixture: descriptor?.id ?? `unresolved:${expected.package}`,
        relativePath: safeRelativeFrom(pnpmRoot.path, installed.path),
        observedDigest: null,
        integrity: resolutionIntegrity(installed),
      });
    }
    const rendererLockVersion = resolvedVersion(locked);
    if (rendererLockVersion) {
      rendererLocks.push({
        workspace: workspacePath,
        name: expected.package,
        version: rendererLockVersion,
        integrity: resolutionIntegrity(locked),
      });
    }
  }

  const candidateRelativePath = candidateRoot
    ? safeRelativeFrom(pnpmRoot.path, candidateRoot)
    : 'invalid-relative-path';
  const verifiedDigest = candidate.failures.length === 0 ? identity?.catalogDigest : null;
  const installed = [...rendererInstalled];
  if (installedCatalog && installedVersion) {
    installed.push({
      workspace: workspacePath,
      name: CATALOG_PACKAGE,
      version: installedVersion,
      kind: 'catalog',
      fixture: cache ? `installed:${installedVersion}` : catalogId,
      relativePath: safeRelativeFrom(pnpmRoot.path, installedCatalog.path),
      observedDigest: cache ? null : verifiedDigest,
      integrity: resolutionIntegrity(installedCatalog),
      integrityFailures: cache ? [] : candidate.failures,
    });
  }
  const lockfile = [...rendererLocks];
  if (lockedVersion) {
    lockfile.push({
      workspace: workspacePath,
      name: CATALOG_PACKAGE,
      version: lockedVersion,
      integrity: resolutionIntegrity(lockedCatalog),
    });
  }
  const caches = cache ? [{
    catalog: catalogId,
    version: cache.version,
    digest: cache.digest,
    observedDigest: verifiedDigest,
    relativePath: candidateRelativePath,
    provenanceVerified: candidate.failures.length === 0,
    integrityFailures: candidate.failures,
  }] : [];
  const packageManager = {
    name: 'pnpm',
    version: pnpmRoot.packageManager.slice('pnpm@'.length),
    lockfileVersion: '9.0',
  };
  const graphBase = {
    selectedWorkspace: workspacePath,
    workspaceRoot: '.',
    workspaces: [{
      path: workspacePath,
      name: safeWorkspacePackage(projectManifest.name),
      packageManager: pnpmRoot.packageManager,
      catalogRange: declaredRange,
    }],
    lockfile,
    installed,
    caches,
  };
  function resolveBindings(requested, id = 'pnpm-project') {
    const input = {
      packageManager,
      catalogs,
      rendererDescriptors,
      releaseManifests,
      graph: { id, ...graphBase, request: { bindings: requested, cache, queryApiVersion } },
    };
    return resolveCatalogGraph(input);
  }
  let finalResolution;
  let availableBindings;
  if (filterBindings && bindingRequests.length > 0) {
    const base = resolveBindings([], 'pnpm-project-filter-base');
    if (base.type === 'error') return base;
    availableBindings = [];
    const targetPackages = { ...base.resolution.targetPackages };
    for (const binding of bindingRequests) {
      const bindingResult = resolveBindings([binding], 'pnpm-project-filter-binding');
      if (bindingResult.type === 'success') {
        availableBindings.push(binding);
        Object.assign(targetPackages, bindingResult.resolution.targetPackages);
      }
    }
    finalResolution = Object.freeze({ ...base.resolution, targetPackages });
  } else {
    const resolved = resolveBindings(bindingRequests);
    if (resolved.type === 'error') return resolved;
    finalResolution = resolved.resolution;
    availableBindings = bindingRequests.length > 0 ? bindingRequests : undefined;
  }
  const api = createCatalogApi(candidate.bundle, {
    resolution: finalResolution,
    ...(availableBindings === undefined ? {} : { availableBindings }),
  });
  return {
    type: 'success',
    api,
    package: {
      name: CATALOG_PACKAGE,
      version: identity.version,
      catalogVersion: identity.catalogVersion,
      catalogDigest: identity.catalogDigest,
      sourceRevision: identity.sourceRevision,
    },
  };
}

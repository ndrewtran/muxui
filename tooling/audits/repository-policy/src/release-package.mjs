// What release preparation does to one package of the publish set, and what it checks about the result:
// the candidate manifest (rc version, sibling ranges), the `E-P2.1-01` audit of a packed tarball, and the renderer
// descriptor's pack-time provenance and export audit (`E-P2.1-02`). Pure functions; the callers hold the files.
import { posix } from 'node:path';
import { canonicalJson } from './canonical-json.mjs';

export const CANDIDATE_PUBLISH_CONFIG = Object.freeze({
  access: 'public',
  tag: 'next',
  registry: 'https://registry.npmjs.org',
});

/** Fields a candidate carries over from its source manifest unchanged. */
const carriedFields = ['type', 'license', 'repository', 'homepage', 'bugs', 'engines', 'bin', 'files', 'sideEffects', 'muxUi', 'peerDependencies'];

/** A sibling edge is a package-manager request for the rc and later builds of its line, not an exact pin. */
export const siblingRange = (version) => `^${version}`;

const major = (version) => Number(/^(\d+)\./u.exec(version)?.[1]);

/**
 * Decision 0032 item 8: a dependency on `@muxui/catalog` is a range bound to the query API major tooling reads, so
 * the catalog the candidate set ships must be a release of that major.
 */
export function assertCatalogRangeBound({ catalogVersion, queryApiVersion }) {
  if (!(major(catalogVersion) === major(queryApiVersion))) {
    throw new Error(`P2_1_CATALOG_RANGE_UNBOUND: catalog ${catalogVersion} is not a release of the query API major ${major(queryApiVersion)} tooling reads (${queryApiVersion})`);
  }
}

/**
 * The manifest a candidate publishes, from the manifest `pnpm pack` wrote: the rc version, `private: false`, the
 * publish configuration, the commit it was built from (`gitHead`, which npm records at publish time as well), and
 * every edge to a publish-set member as a range on that member's rc. Lifecycle scripts and development dependencies
 * are not part of a published package.
 */
export function rewritePackedManifest({ packed, entry, versions, sourceRevision }) {
  const candidate = {
    ...packed,
    version: versions.get(entry.name),
    private: false,
    gitHead: sourceRevision,
    publishConfig: { ...CANDIDATE_PUBLISH_CONFIG },
  };
  delete candidate.scripts;
  delete candidate.devDependencies;
  if (packed.dependencies) {
    candidate.dependencies = Object.fromEntries(Object.entries(packed.dependencies).map(([name, range]) => [
      name,
      entry.runtimeEdges.includes(name) ? siblingRange(versions.get(name)) : range,
    ]));
  }
  return candidate;
}

/**
 * Whether a dependency specifier can only resolve against the registry: a semver range (`7.8.5`, `^1.2.3-rc.1`,
 * `>=1 <2 || 3.x`, a hyphen range) or a dist-tag (`latest`). Anything with a `:`, `/` or `@` is a path, link, Git
 * (URL or SCP form), tarball URL, hosting shorthand, other protocol, or npm alias, and is refused whatever its spelling.
 */
export const isRegistrySpecifier = (range) => /^(?=.*\S)[\w.^~<>=*|+\s-]+$/u.test(String(range));

const targetsOf = (value) => (typeof value === 'string' ? [value] : Object.values(value ?? {}).flatMap(targetsOf));
const archivePath = (target) => `package/${posix.normalize(target)}`;
const unconditional = new Set(['package/package.json', 'package/README.md', 'package/LICENSE', 'package/NOTICE']);

/**
 * Problems (`{ code, detail }`) in a packed tarball against its publish-set entry and source manifest
 * (`E-P2.1-01`): only the declared public entries and the files `files` allows, no workspace-only entry, no
 * `workspace:` specifier, no dependency outside the registry and the publish set, no `@muxui/tokens`, and sibling
 * edges only along the declared runtime edges, as ranges on this release's rc versions. `entries` are `package/...`
 * archive paths and `packed` the tarball's manifest.
 */
export function findPackedPackageProblems({ entry, source, packed, entries, versions, sourceRevision }) {
  const problems = [];
  const add = (code, detail) => problems.push({ code, detail });
  const drift = (detail) => add('P2_1_PACK_MANIFEST_DRIFT', detail);

  if (packed.name !== entry.name || packed.version !== versions.get(entry.name)) drift(`${packed.name}@${packed.version} is not ${entry.name}@${versions.get(entry.name)}`);
  if (packed.private !== false) drift('private is not false');
  if (packed.scripts !== undefined) drift('lifecycle scripts are packed');
  if (packed.devDependencies !== undefined) drift('devDependencies are packed');
  if (packed.gitHead !== sourceRevision) drift(`gitHead is ${packed.gitHead}, not the release commit`);
  if (canonicalJson(packed.publishConfig) !== canonicalJson(CANDIDATE_PUBLISH_CONFIG)) drift('publishConfig is not the candidate publish configuration');
  for (const field of carriedFields) {
    if (canonicalJson(packed[field] ?? null) !== canonicalJson(source[field] ?? null)) drift(`${field} differs from the source manifest`);
  }

  // Exports: the declared public entries, and none of the workspace-only ones.
  const declared = source.publishConfig?.exports ?? source.exports ?? {};
  const workspaceOnly = Object.keys(source.exports ?? {}).filter((key) => !Object.hasOwn(declared, key));
  const leakedEntries = workspaceOnly.filter((key) => Object.hasOwn(packed.exports ?? {}, key));
  if (leakedEntries.length > 0) add('P2_1_PACK_ENTRY_LEAKED', `workspace-only entries are exported: ${leakedEntries.join(', ')}`);
  else if (canonicalJson(packed.exports ?? null) !== canonicalJson(declared)) add('P2_1_PACK_EXPORTS_DRIFT', 'exports differ from the declared public entries');
  const publicTargets = new Set([...targetsOf(declared), ...targetsOf(source.bin)].map(archivePath));
  const leakedFiles = workspaceOnly.flatMap((key) => targetsOf(source.exports[key])).map(archivePath)
    .filter((path) => !publicTargets.has(path) && entries.includes(path));
  if (leakedFiles.length > 0) add('P2_1_PACK_ENTRY_LEAKED', `workspace-only files are packed: ${leakedFiles.join(', ')}`);

  // Files: the allowlist, and every public target present.
  const allowed = (path) => unconditional.has(path) || (source.files ?? []).some((file) => {
    const declaredPath = archivePath(file);
    return path === declaredPath || path.startsWith(`${declaredPath}/`);
  });
  const undeclared = entries.filter((path) => !allowed(path));
  if (undeclared.length > 0) add('P2_1_PACK_FILE_UNDECLARED', `files outside the allowlist: ${undeclared.join(', ')}`);
  const missing = [...publicTargets].filter((target) => (target.endsWith('*')
    ? !entries.some((path) => path.startsWith(target.slice(0, -1)))
    : !entries.includes(target)));
  if (missing.length > 0) add('P2_1_PACK_ENTRY_MISSING', `public entries are not packed: ${missing.join(', ')}`);

  // Dependencies: registry packages at the range the source declares, and only the declared Mux UI edges.
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [dependency, range] of Object.entries(packed[field] ?? {})) {
      const declared = source[field]?.[dependency];
      if (String(range).startsWith('workspace:')) add('P2_1_PACK_WORKSPACE_SPECIFIER', `${field} ${dependency} keeps its workspace specifier`);
      else if (dependency === '@muxui/tokens') add('P2_1_PACK_TOKENS_DEPENDENCY', `${field} ${dependency}: tokens stay a private build authority`);
      else if (dependency.startsWith('@muxui/')) {
        if (!(field === 'dependencies' && entry.runtimeEdges.includes(dependency))) {
          add('P2_1_PACK_UNLISTED_DEPENDENCY', `${field} ${dependency} is not an allowed Mux UI edge`);
        }
      } else if (!isRegistrySpecifier(range)) {
        add('P2_1_PACK_DEPENDENCY_SOURCE', `${field} ${dependency} is ${range}, not a registry range`);
      } else if (declared === undefined) {
        add('P2_1_PACK_UNLISTED_DEPENDENCY', `${field} ${dependency} is not a dependency the source declares`);
      } else if (range !== declared) {
        add('P2_1_PACK_DEPENDENCY_SOURCE', `${field} ${dependency} is ${range}, not the source's ${declared}`);
      }
    }
  }
  for (const edge of entry.runtimeEdges) {
    if (packed.dependencies?.[edge] !== siblingRange(versions.get(edge))) {
      add('P2_1_PACK_EDGE_RANGE', `dependencies ${edge} is ${packed.dependencies?.[edge]}, not ${siblingRange(versions.get(edge))}`);
    }
  }
  return problems;
}

export function assertPackedPackage(options) {
  const problems = findPackedPackageProblems(options);
  if (problems.length > 0) {
    throw new Error(`${problems[0].code}: ${options.entry.name}: ${problems.map(({ code, detail }) => `${detail} (${code})`).join('; ')}`);
  }
}

/**
 * The renderer descriptor with the release it was packed for. The provenance records where these bytes came from;
 * the resolver reads it and never compares it, so a catalog-only release leaves an unchanged package valid. The
 * source must be the generator's canonical form, so the stamped bytes stay canonical too.
 */
export function stampDescriptorProvenance(text, provenance) {
  const descriptor = JSON.parse(text);
  if (descriptor.provenance !== undefined || `${canonicalJson(descriptor)}\n` !== text) {
    throw new Error('P2_1_DESCRIPTOR_STAMP_INVALID: the descriptor is not the generator\'s canonical form without provenance');
  }
  return `${canonicalJson({ ...descriptor, provenance })}\n`;
}

const memberName = /^[A-Za-z_$][\w$]*$/u;

/**
 * Each descriptor binding's export identity, `<package>[/<subpath>]#<Member>`: exactly one `#`, then a plain
 * identifier. `valid` is false for anything else, the way the installed resolver rejects it.
 */
export function descriptorExports(descriptor) {
  return Object.entries(descriptor.bindings ?? {}).map(([binding, { export: identity }]) => {
    const parts = String(identity).split('#');
    const [specifier, member] = parts;
    return { binding, identity: String(identity), specifier, member, valid: parts.length === 2 && specifier.length > 0 && memberName.test(member) };
  });
}

/** Whether `specifier` is the package or a subpath of it (`<package>/<subpath>`). */
export const isPackageSpecifier = (specifier, packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`);

/**
 * Problems in a descriptor against the exports its installed package really has (`E-P2.1-02`). `exportNames` maps a
 * module specifier to the names that module exports, and each binding must name `packageName` or one of its modules.
 * A member a different module exports does not count: `@muxui/react/markdown#Button` fails when only the package
 * root exports `Button`.
 */
export function findDescriptorExportProblems(descriptor, exportNames, { packageName }) {
  return descriptorExports(descriptor).flatMap(({ binding, identity, specifier, member, valid }) => {
    if (!valid) return [`${binding}: ${identity} is not <specifier>#<Member>`];
    if (!isPackageSpecifier(specifier, packageName)) return [`${binding}: ${specifier} is not ${packageName} or one of its modules`];
    const names = exportNames.get(specifier);
    if (names === undefined) return [`${binding}: ${specifier} is not an importable module of the package`];
    return names.includes(member) ? [] : [`${binding}: ${specifier} does not export ${member}`];
  });
}

// Pure derivations of a release's identity from bytes: file-set digests, the lockfile integrity of one package, the
// catalog, token and binding-spec identities, and the icon visual-contract identity. Builtins only, so the portfolio manifest verifier (which runs in a job that
// installs nothing) and the release proof share one implementation.
import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.mjs';

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const lucideSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])(lucide-react(?:\/[^'"]*)?)\1/gu;
const lucideIconModule = /^lucide-react\/dist\/esm\/icons\/([a-z0-9-]+)\.mjs$/u;
const byPath = (left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

/** Digests each `{ path, bytes }` and the sorted set; any byte or membership change moves the set digest. */
export function digestFileSet(files, code = 'R1_EXIT_CORRELATION_INVALID') {
  const entries = files.map(({ path, bytes }) => ({ path, sha256: digest(bytes) })).sort(byPath);
  if (entries.length === 0) fail(code, 'a file set must not be empty');
  if (new Set(entries.map(({ path }) => path)).size !== entries.length) fail(code, 'duplicate file path');
  return { digest: digest(canonicalJson(entries)), entries };
}

/** The pnpm lockfile integrity recorded for one exact `name@version`, or undefined. */
export function readLockedIntegrity(lockfileText, name, version) {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
  const quotedName = `'?${escape(name)}@${escape(version)}'?`;
  return lockfileText.match(new RegExp(`\\n {2}${quotedName}:\\n\\s+resolution: \\{integrity: (sha512-[^}]+)\\}`, 'u'))?.[1];
}

/**
 * Identity of the icon visual-contract inputs (Decision 0028, Icons):
 * dependency version (Lucide version and integrity), icon mapping and
 * call-site geometry or accessibility semantics (the full bytes of every
 * packed module importing Lucide), and styling geometry (tokens and packed
 * stylesheets). No visual baseline is recorded (`comparison: none-recorded`);
 * a different identity means any earlier visual comparison no longer applies.
 */
export function deriveVisualContract({ tokenSource, stylesheets, lucide, modules }) {
  const code = 'R1_EXIT_VISUAL_CONTRACT_INVALID';
  if (!tokenSource?.path || !tokenSource.bytes?.length) fail(code, 'the canonical token source is required');
  if (!/^\d+\.\d+\.\d+$/u.test(lucide?.version ?? '') || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(lucide?.integrity ?? '')) {
    fail(code, 'Lucide requires an exact version and lockfile integrity');
  }
  const icons = {};
  const iconModules = [];
  for (const { path, bytes } of modules) {
    const specifiers = [...bytes.toString('utf8').matchAll(lucideSpecifier)].map(([, , specifier]) => specifier);
    if (specifiers.length === 0) continue;
    const names = specifiers.map((specifier) => {
      const name = specifier.match(lucideIconModule)?.[1];
      // A barrel or unlisted subpath import cannot be mapped to icons.
      if (!name) fail(code, `${path} imports ${specifier}; only per-icon lucide-react/dist/esm/icons modules can be mapped`);
      return name;
    });
    icons[path] = [...new Set(names)].sort();
    iconModules.push({ path, bytes });
  }
  if (iconModules.length === 0) fail(code, 'no packed module imports a Lucide affordance');
  const inputs = {
    tokens: { path: tokenSource.path, sha256: digest(tokenSource.bytes) },
    stylesheets: digestFileSet(stylesheets, code).entries,
    lucide: {
      version: lucide.version,
      integrity: lucide.integrity,
      icons: Object.fromEntries(Object.entries(icons).sort(([left], [right]) => (left < right ? -1 : 1))),
      modules: digestFileSet(iconModules, code).entries,
    },
  };
  return { comparison: 'none-recorded', digest: digest(canonicalJson(inputs)), inputs };
}

/**
 * The catalog, token and binding-spec identities of a release: the catalog package and bundle must agree on the
 * digest, and every binding needs its spec revision and both requirement sets in the catalog.
 */
export function deriveCatalogIdentity({ catalogPackage, catalogBundle, bindings }, code = 'R1_EXIT_CORRELATION_INVALID') {
  if (!/^sha256:[0-9a-f]{64}$/u.test(catalogPackage?.catalogDigest ?? '') || catalogPackage.catalogDigest !== catalogBundle?.catalogDigest) {
    fail(code, 'catalog package and bundle digests must agree');
  }
  const token = catalogBundle.artifacts.find(({ kind }) => kind === 'token');
  if (!token?.record?.tokenContractVersion) fail(code, 'the catalog token source has no contract version');
  return {
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
    bindings: [...bindings].sort().map((binding) => {
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
    }),
  };
}

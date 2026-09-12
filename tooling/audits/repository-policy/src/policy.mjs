import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '.pnpm-store', '.migration-archive']);
const STALE_IDENTITY_PATTERNS = Object.freeze([
  { label: 'legacy machine identity', pattern: /\bcore-ui\b/iu },
  { label: 'legacy display identity', pattern: /\bCore UI\b/iu },
  { label: 'legacy package scope', pattern: /@core-ui(?:\/|(?=[\s'"`]|$))/iu },
  { label: 'legacy artifact namespace', pattern: /\bcore:(?:component|pattern|guide|example|token|capability):/iu },
  { label: 'legacy diagnostics/environment prefix', pattern: /\bCORE_[A-Z0-9_]+\b/u },
  { label: 'legacy CSS class hook', pattern: /\.core-[a-z0-9-]+\b/iu },
  { label: 'legacy CSS custom-property hook', pattern: /--core-[a-z0-9-]+\b/iu },
  { label: 'legacy data hook', pattern: /data-core-[a-z0-9-]+\b/iu },
  { label: 'legacy ownership wording', pattern: /\bCore-owned\b/iu },
  { label: 'legacy renderer wording', pattern: /\bCore React\b/iu },
  // These are easy to miss in a broad display/package rename because they are
  // executable tokens or data keys rather than prose identity references.
  { label: 'legacy bare CLI command', pattern: /(?:complete\s+-F\s+\S+\s+|(?:cli|command|executable|bin)\s*[:=]\s*[\s'"`"]?)core\b/iu },
  { label: 'legacy shell completion helper', pattern: /\b_core_complete\b/u },
  { label: 'legacy experimental namespace', pattern: /\bcore\.experimental(?:[./:_-]|$)/u },
  { label: 'legacy current fixture key', pattern: /\bcoreFixture[A-Za-z0-9_]*\b/u },
  { label: 'legacy active object key', pattern: /\bcore(?:Source|Input|Commit|Tree|RawClassification|RawExports|PublicFamily|StateCoverage|Tokens?|TokenIds?)\b\s*:/u },
]);

export function isIgnoredRepositoryEntry(name) {
  return name === '.DS_Store' || IGNORED_DIRECTORIES.has(name);
}

export class PolicyError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'PolicyError';
    this.code = code;
  }
}

export function normalizePath(path) {
  return path.split(sep).join('/').replace(/^\.\//, '');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function loadPolicy(repositoryRoot) {
  const path = join(
    repositoryRoot,
    'tooling/audits/repository-policy/repository-policy.json',
  );
  const policy = JSON.parse(await readFile(path, 'utf8'));
  const artifactRefPath = join(
    repositoryRoot,
    'packages/schema/schemas/artifact-ref.schema.json',
  );
  const artifactRef = await readFile(artifactRefPath, 'utf8')
    .then((bytes) => JSON.parse(bytes))
    .catch(() => null);
  if (artifactRef?.pattern) {
    policy.artifactIdPattern = artifactRef.pattern;
  }
  return policy;
}

export function classifyPath(repositoryPath, policy) {
  const normalized = normalizePath(repositoryPath);
  const segments = normalized.split('/');
  const retainedFixture = policy.retainedProjectionFixtureRoots?.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  ) ?? false;
  if (
    !retainedFixture
    && segments.some((segment) => policy.projectionPathSegments.includes(segment))
  ) {
    return 'projection';
  }

  const owner = policy.majorOwners.find(
    ({ path }) => normalized === path || normalized.startsWith(`${path}/`),
  );
  return owner?.classification ?? 'repository';
}

export function generatedText({ source, body, policy }) {
  const digest = sha256(body);
  return [
    `// ${policy.generatedMarkers.source} ${source}`,
    `// ${policy.generatedMarkers.digest} sha256:${digest}`,
    body,
  ].join('\n');
}

function markerValue(lines, marker) {
  const index = lines.findIndex((line) => line.includes(marker));
  if (index === -1) return null;
  return {
    index,
    value: lines[index].slice(lines[index].indexOf(marker) + marker.length).trim(),
  };
}

export async function validateGeneratedFile(repositoryRoot, repositoryPath, policy) {
  const normalized = normalizePath(repositoryPath);
  const content = await readFile(join(repositoryRoot, normalized), 'utf8');
  const strictJson = policy.strictJsonProjections?.find(({ path }) => path === normalized);
  if (strictJson) {
    JSON.parse(content);
    const provenance = normalizePath(strictJson.provenance);
    await validateGeneratedFile(repositoryRoot, provenance, policy);
    const provenanceContent = await readFile(join(repositoryRoot, provenance), 'utf8');
    const provenanceLines = provenanceContent.split('\n');
    const sourceMarker = markerValue(
      provenanceLines.slice(0, 8),
      policy.generatedMarkers.source,
    );
    const digestMarker = markerValue(
      provenanceLines.slice(0, 8),
      policy.generatedMarkers.digest,
    );
    const bodyStart = Math.max(sourceMarker.index, digestMarker.index) + 1;
    const declaration = JSON.parse(provenanceLines.slice(bodyStart).join('\n'));
    const actual = `sha256:${sha256(content)}`;
    if (declaration.path !== normalized || declaration.sha256 !== actual) {
      throw new PolicyError(
        'PROJECTION_DIGEST_MISMATCH',
        `${normalized} was edited outside generation; repair ${sourceMarker.value} and regenerate`,
      );
    }
    return { path: normalized, source: sourceMarker.value, digest: actual };
  }
  const lines = content.split('\n');
  const sourceMarker = markerValue(lines.slice(0, 8), policy.generatedMarkers.source);
  const digestMarker = markerValue(lines.slice(0, 8), policy.generatedMarkers.digest);

  if (!sourceMarker || !digestMarker) {
    throw new PolicyError(
      'GENERATED_MARKER_MISSING',
      `${normalized} must identify its earliest source and generated content digest`,
    );
  }

  const source = normalizePath(sourceMarker.value);
  if (!source || source.startsWith('/') || source.split('/').includes('..')) {
    throw new PolicyError(
      'GENERATED_SOURCE_INVALID',
      `${normalized} has unsafe source pointer ${JSON.stringify(source)}`,
    );
  }

  const sourcePath = join(repositoryRoot, source);
  let sourceStats;
  try {
    sourceStats = await stat(sourcePath);
  } catch {
    throw new PolicyError(
      'GENERATED_SOURCE_MISSING',
      `${normalized} points to missing canonical source ${source}`,
    );
  }

  if (!sourceStats.isFile() || classifyPath(source, policy) === 'projection') {
    throw new PolicyError(
      'GENERATED_SOURCE_NOT_CANONICAL',
      `${normalized} must point to a non-projection file; repair ${source}`,
    );
  }

  const bodyStart = Math.max(sourceMarker.index, digestMarker.index) + 1;
  const body = lines.slice(bodyStart).join('\n');
  const expected = `sha256:${sha256(body)}`;
  if (digestMarker.value !== expected) {
    throw new PolicyError(
      'PROJECTION_DIGEST_MISMATCH',
      `${normalized} was edited outside generation; repair ${source} and regenerate`,
    );
  }

  return { path: normalized, source, digest: expected };
}

export async function walkFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (isIgnoredRepositoryEntry(entry.name)) continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, path));
    } else if (entry.isFile()) {
      files.push(normalizePath(relative(root, path)));
    }
  }
  return files;
}

function isAllowlistedIdentityPath(path, allowlistedPaths) {
  return allowlistedPaths.some((prefix) => {
    const normalizedPrefix = prefix.replace(/\/+$/u, '');
    return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`);
  });
}

export async function auditCurrentIdentity(repositoryRoot, policy, files = null) {
  const identity = policy.identityReset?.current;
  if (
    identity?.display !== 'Mux UI'
    || identity?.machine !== 'muxui'
    || identity?.repository !== 'ndrewtran/muxui'
    || identity?.packageScope !== '@muxui/'
    || identity?.artifactPrefix !== 'muxui:'
    || identity?.cli !== 'muxui'
    || JSON.stringify(identity.publicRoots) !== JSON.stringify(['.muxui-', '--muxui-', 'data-muxui-'])
    || identity?.diagnosticsPrefix !== 'MUXUI_'
    || identity?.environmentPrefix !== 'MUXUI_'
  ) {
    throw new PolicyError('CURRENT_IDENTITY_POLICY_INVALID', 'repository policy must own the accepted Mux UI identity');
  }

  const allFiles = files ?? await walkFiles(repositoryRoot);
  const allowlistedPaths = policy.identityReset.allowlistedPaths ?? [];
  const violations = [];
  let scanned = 0;
  let allowlisted = 0;
  for (const path of allFiles) {
    if (isAllowlistedIdentityPath(path, allowlistedPaths)) {
      allowlisted += 1;
      continue;
    }
    scanned += 1;
    const content = await readFile(join(repositoryRoot, path), 'utf8');
    for (const [index, line] of content.split('\n').entries()) {
      for (const { label, pattern } of STALE_IDENTITY_PATTERNS) {
        const match = pattern.exec(line);
        if (match) {
          violations.push(`${path}:${index + 1} ${label}: ${match[0]}`);
          break;
        }
      }
    }
  }
  if (violations.length > 0) {
    throw new PolicyError(
      'STALE_CURRENT_IDENTITY',
      `current files retain superseded identity (${violations.slice(0, 20).join('; ')}${violations.length > 20 ? `; ... ${violations.length - 20} more` : ''})`,
    );
  }
  return { scanned, allowlisted };
}

async function auditNavigation(repositoryRoot, policy) {
  const rootAgentsPath = join(repositoryRoot, 'AGENTS.md');
  const rootAgents = await readFile(rootAgentsPath, 'utf8');
  for (const { path } of policy.majorOwners) {
    const ownerPath = join(repositoryRoot, path);
    const ownerStats = await stat(ownerPath).catch(() => null);
    if (!ownerStats?.isDirectory()) {
      throw new PolicyError('OWNER_ROOT_MISSING', `required owner root ${path}/ is missing`);
    }
    const localAgents = await stat(join(ownerPath, 'AGENTS.md')).catch(() => null);
    if (!localAgents?.isFile()) {
      throw new PolicyError('NAVIGATION_MISSING', `${path}/AGENTS.md is missing`);
    }
    if (!rootAgents.includes(`\`${path}/\``)) {
      throw new PolicyError('ROUTE_MISSING', `root AGENTS.md does not route to ${path}/`);
    }
  }

  if (/\b(?:Button|TextField|Switch|Dialog|Select)\b/.test(rootAgents)) {
    throw new PolicyError(
      'ROOT_INVENTORY_FORBIDDEN',
      'root AGENTS.md must route to owners, not maintain a component inventory',
    );
  }
}

async function auditRootContract(repositoryRoot, policy) {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
  const scripts = Object.keys(packageJson.scripts ?? {}).sort();
  const required = [...policy.requiredRootCommands].sort();
  if (JSON.stringify(scripts) !== JSON.stringify(required)) {
    throw new PolicyError(
      'ROOT_COMMAND_SURFACE_DRIFT',
      `root scripts must be exactly: ${required.join(', ')}`,
    );
  }

  if (packageJson.packageManager !== `pnpm@${policy.toolchain.pnpm}`) {
    throw new PolicyError('PNPM_PIN_DRIFT', 'root packageManager does not match policy');
  }
  if (packageJson.engines?.node !== policy.toolchain.nodeRange) {
    throw new PolicyError('NODE_POLICY_DRIFT', 'root Node engine does not match policy');
  }
  const nodeVersion = (await readFile(join(repositoryRoot, '.node-version'), 'utf8')).trim();
  if (nodeVersion !== policy.toolchain.node) {
    throw new PolicyError('NODE_PIN_DRIFT', '.node-version does not match policy');
  }
}

export async function auditAliases(repositoryRoot, policy, files = null) {
  const allFiles = files ?? await walkFiles(repositoryRoot);
  const artifactFiles = allFiles.filter(
    (path) => path.startsWith('catalog/') && path.endsWith('/artifact.json'),
  );
  if (!policy.artifactIdPattern) {
    throw new PolicyError(
      'ARTIFACT_REF_CONTRACT_MISSING',
      'packages/schema/schemas/artifact-ref.schema.json must own ArtifactRef syntax',
    );
  }
  const idPattern = new RegExp(policy.artifactIdPattern);
  const slugPattern = new RegExp(policy.slugPattern);
  const claimed = new Map();

  for (const path of artifactFiles) {
    const record = JSON.parse(await readFile(join(repositoryRoot, path), 'utf8'));
    const match = idPattern.exec(record.id ?? '');
    if (!match) {
      throw new PolicyError('ARTIFACT_ID_INVALID', `${path} has invalid ArtifactRef`);
    }
    const slug = record.id.split(':')[2];
    if (dirname(path).split('/').at(-1) !== slug) {
      throw new PolicyError('ARTIFACT_PATH_DRIFT', `${path} must use the ArtifactRef slug ${slug}`);
    }
    for (const value of [slug, ...(record.aliases ?? [])]) {
      if (!slugPattern.test(value)) {
        throw new PolicyError('ALIAS_INVALID', `${path} has invalid slug or alias ${value}`);
      }
      const owner = claimed.get(value);
      if (owner && owner !== record.id) {
        throw new PolicyError(
          'ALIAS_COLLISION',
          `${value} is owned by both ${owner} and ${record.id}`,
        );
      }
      claimed.set(value, record.id);
    }
  }

  return { artifacts: artifactFiles.length, claimedNames: claimed.size };
}

export async function auditRepository(repositoryRoot) {
  const resolvedRoot = resolve(repositoryRoot);
  const policy = await loadPolicy(resolvedRoot);
  await auditNavigation(resolvedRoot, policy);
  await auditRootContract(resolvedRoot, policy);

  const files = await walkFiles(resolvedRoot);
  const identity = await auditCurrentIdentity(resolvedRoot, policy, files);
  const generatedFiles = files.filter((path) => classifyPath(path, policy) === 'projection');
  for (const path of generatedFiles) {
    await validateGeneratedFile(resolvedRoot, path, policy);
  }
  const aliases = await auditAliases(resolvedRoot, policy, files);

  return {
    owners: policy.majorOwners.length,
    generatedFiles: generatedFiles.length,
    artifacts: aliases.artifacts,
    claimedNames: aliases.claimedNames,
    identity,
  };
}

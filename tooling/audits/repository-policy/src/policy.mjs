import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '.pnpm-store', '.migration-archive']);
function isIgnoredRepositoryEntry(name) {
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

// A path under a projection segment (generated, dist, ...) is a projection, outside the retained fixture roots;
// everything else is source.
export function classifyPath(repositoryPath, policy) {
  const normalized = normalizePath(repositoryPath);
  const segments = normalized.split('/');
  const retainedFixture = policy.retainedProjectionFixtureRoots?.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  ) ?? false;
  return !retainedFixture && segments.some((segment) => policy.projectionPathSegments.includes(segment)) ? 'projection' : 'source';
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
  // A nested directory with its own .git (e.g. an agent worktree) is a
  // separate checkout, not part of this repository.
  if (current !== root && entries.some(({ name }) => name === '.git')) return [];
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

// Narrows walked files to repository content (tracked plus untracked but not
// ignored). Roots outside a repository, such as test fixtures, keep every
// walked file.
export function repositoryVisibleFiles(repositoryRoot, files) {
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return files;
  const visible = new Set(result.stdout.split('\0').filter(Boolean).map(normalizePath));
  return files.filter((path) => visible.has(path));
}

// Mirrors a clean CI checkout after generation: visible projections plus the
// ignored `generated/` outputs that generation creates. Other ignored local
// build output (dist/, build/, coverage/) cannot carry markers and is skipped.
export function projectionFilesToValidate(files, visibleFiles, policy) {
  const visible = new Set(visibleFiles);
  return files.filter((path) => classifyPath(path, policy) === 'projection'
    && (visible.has(path) || path.split('/').includes('generated')));
}

// The root package manager, Node engine, and .node-version match the policy toolchain.
export async function auditToolchain(repositoryRoot, policy) {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
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
  await auditToolchain(resolvedRoot, policy);

  const files = await walkFiles(resolvedRoot);
  const visibleFiles = repositoryVisibleFiles(resolvedRoot, files);
  const generatedFiles = projectionFilesToValidate(files, visibleFiles, policy);
  for (const path of generatedFiles) {
    await validateGeneratedFile(resolvedRoot, path, policy);
  }
  const aliases = await auditAliases(resolvedRoot, policy, files);

  return {
    generatedFiles: generatedFiles.length,
    artifacts: aliases.artifacts,
    claimedNames: aliases.claimedNames,
  };
}

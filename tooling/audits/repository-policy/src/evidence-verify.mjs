import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { canonicalJson } from './canonical-json.mjs';

export class EvidenceIntegrityError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'EvidenceIntegrityError';
    this.code = code;
  }
}

export function hasUnsanitizedEvidenceOutput(text, repositoryRoot) {
  // Public token IDs, including the historical `core:` namespace in retained
  // logs, are artifact identities rather than credentials.
  const withoutPublicTokenIds = text.replace(
    /"(muxui|core):token:[a-z0-9]+(?:-[a-z0-9]+)*"/gu,
    '"$1:<public-token-id>"',
  );
  // Quoted public identifiers in value position (lowercase segments joined by
  // `.` or `:`, such as `component.button.background` or `web.html:web.html`)
  // are not credentials even under a key like `token` or `key`. Keys are never
  // rewritten, so a key such as `auth.token` is still checked.
  const withoutPublicIds = withoutPublicTokenIds.replace(
    /(:\s*)(["'])[a-z0-9]+(?:-[a-z0-9]+)*(?:[.:][a-z0-9]+(?:-[a-z0-9]+)*)+\2/gu,
    '$1$2<public-id>$2',
  );
  return withoutPublicTokenIds.includes(repositoryRoot)
    || /\/(?:Users|Volumes|home|root|tmp|private(?:\/(?:tmp|var\/folders))?|var\/folders)\//u.test(withoutPublicTokenIds)
    || /(?:^|[\s"'(=])[A-Za-z]:\\(?:Users|Temp)\\/mu.test(withoutPublicTokenIds)
    || /(?:authorization|api[-_]?key|token)\s*[:=]\s*\S+/iu.test(withoutPublicTokenIds)
    // GitHub, npm, and bearer token formats.
    || /\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_|\bnpm_[A-Za-z0-9]{36}\b|\bBearer\s+\S{8,}/u.test(withoutPublicTokenIds)
    // A double- or single-quoted key naming a credential (`token`,
    // `github-token`, `apiKey`, `password`, `Authorization`) with a quoted
    // value that is not a public identifier.
    || /(["'])[^"']*(?:token|secret|key|password|authorization|auth|credentials)\1\s*:\s*(["'])(?!<public-id>\2)/iu.test(withoutPublicIds);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Source files an index lists but does not own. A later change may edit them in the working tree (a block
 * added after the BL1 capture edits the regression thresholds), so the index pins each at the revision it
 * binds: the digest is checked against the git object at `index.sourceRevision`, never the working-tree file.
 */
export const REVISION_BOUND_INPUTS = new Set(['tests/evidence/bl1/regression-thresholds.json']);

/** The bytes of `path` at `revision`, read from the git objects of `gitRoot`. */
export function readAtRevision(gitRoot, revision, path) {
  try {
    return execFileSync('git', ['show', `${revision}:${path}`], { cwd: gitRoot, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new EvidenceIntegrityError('EVIDENCE_REVISION_UNAVAILABLE', `${path} cannot be read at ${revision}; fetch the full history`);
  }
}

async function readCanonicalJson(path) {
  const bytes = await readFile(path, 'utf8');
  let value;
  try {
    value = JSON.parse(bytes);
  } catch (error) {
    throw new EvidenceIntegrityError('EVIDENCE_JSON_INVALID', `${path}: ${error.message}`);
  }
  if (typeof value !== 'object' || value === null || bytes.trim().length === 0) {
    throw new EvidenceIntegrityError('EVIDENCE_JSON_INVALID', `${path} must contain a JSON object`);
  }
  if (bytes !== canonicalJson(value)) {
    throw new EvidenceIntegrityError('EVIDENCE_NOT_CANONICAL', `${path} must use canonical evidence JSON`);
  }
  return { bytes, value };
}

async function assertReference(repositoryRoot, reference, kind, bound) {
  if (!reference || typeof reference.path !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(reference.sha256 ?? '')) {
    throw new EvidenceIntegrityError('EVIDENCE_REFERENCE_INVALID', `${kind} reference must contain path and sha256`);
  }
  const bytes = bound
    ? readAtRevision(bound.gitRoot, bound.revision, reference.path)
    : await readFile(join(repositoryRoot, reference.path)).catch(() => {
      throw new EvidenceIntegrityError('EVIDENCE_REFERENCE_MISSING', `${reference.path} is missing`);
    });
  const actual = `sha256:${sha256(bytes)}`;
  if (actual !== reference.sha256) {
    throw new EvidenceIntegrityError('EVIDENCE_DIGEST_MISMATCH', `${reference.path} has ${actual}; expected ${reference.sha256}`);
  }
  return bytes;
}

async function assertIndexReferences(repositoryRoot, index, gitRoot) {
  for (const key of ['records', 'artifacts']) {
    if (!Array.isArray(index[key])) continue;
    for (const reference of index[key]) {
      const bound = key === 'artifacts' && REVISION_BOUND_INPUTS.has(reference.path) ? { gitRoot, revision: index.sourceRevision } : undefined;
      if (bound && !/^[0-9a-f]{40}$/u.test(bound.revision ?? '')) {
        throw new EvidenceIntegrityError('EVIDENCE_REFERENCE_INVALID', `${reference.path} is bound to the index's sourceRevision, which is not a full revision`);
      }
      await assertReference(repositoryRoot, reference, key, bound);
    }
  }
  if (index.validation) await assertReference(repositoryRoot, index.validation, 'validation');
}

/**
 * Verify current evidence indexes and their content-addressed child records. `tests/evidence/archive/` holds
 * closed milestone evidence kept byte-exact (Decision 0027); nothing current reads it, so it is not verified.
 * `gitRoot` names the repository whose git objects hold the revision-bound inputs (see REVISION_BOUND_INPUTS);
 * it defaults to `repositoryRoot`, and differs only when the evidence tree is a rehearsal outside the repository.
 */
export async function verifyEvidence(repositoryRoot, options) {
  const { gitRoot = repositoryRoot, ...retired } = options ?? {};
  if (Object.keys(retired).length > 0) {
    throw new EvidenceIntegrityError(
      'EVIDENCE_OPTIONS_UNSUPPORTED',
      'verifyEvidence accepts only the repository root and gitRoot; legacy identity options are retired',
    );
  }
  const evidenceRoot = join(repositoryRoot, 'tests/evidence');
  const entries = await readdir(evidenceRoot, { withFileTypes: true }).catch(() => []);
  const roots = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'archive');
  let recordCount = 0;
  let artifactCount = 0;
  for (const root of roots) {
    const indexPath = join(evidenceRoot, root.name, 'index.json');
    const { value: index } = await readCanonicalJson(indexPath).catch((error) => {
      if (error?.code === 'ENOENT') {
        throw new EvidenceIntegrityError('EVIDENCE_INDEX_MISSING', `${root.name} has no index.json`);
      }
      throw error;
    });
    await assertIndexReferences(repositoryRoot, index, gitRoot);
    recordCount += index.records?.length ?? 0;
    artifactCount += index.artifacts?.length ?? 0;
  }
  return {
    indexCount: roots.length,
    recordCount,
    artifactCount,
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const repositoryRoot = resolve(import.meta.dirname, '../../../..');
  try {
    const result = await verifyEvidence(repositoryRoot);
    console.log(`[evidence] verified ${result.indexCount} indexes, ${result.recordCount} records, and ${result.artifactCount} artifacts`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

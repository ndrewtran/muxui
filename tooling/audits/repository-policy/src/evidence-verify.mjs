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
  const withoutPublicTokenIds = text.replace(
    /"muxui:token:[a-z0-9]+(?:-[a-z0-9]+)*"/gu,
    '"muxui:<public-token-id>"',
  );
  return withoutPublicTokenIds.includes(repositoryRoot)
    || /\/(?:Users|Volumes|home|root|tmp|private(?:\/(?:tmp|var\/folders))?|var\/folders)\//u.test(withoutPublicTokenIds)
    || /(?:^|[\s"'(=])[A-Za-z]:\\(?:Users|Temp)\\/mu.test(withoutPublicTokenIds)
    || /(?:authorization|api[-_]?key|token)\s*[:=]\s*\S+/iu.test(withoutPublicTokenIds);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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

async function assertReference(repositoryRoot, reference, kind) {
  if (!reference || typeof reference.path !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(reference.sha256 ?? '')) {
    throw new EvidenceIntegrityError('EVIDENCE_REFERENCE_INVALID', `${kind} reference must contain path and sha256`);
  }
  const path = join(repositoryRoot, reference.path);
  const bytes = await readFile(path).catch(() => {
    throw new EvidenceIntegrityError('EVIDENCE_REFERENCE_MISSING', `${reference.path} is missing`);
  });
  const actual = `sha256:${sha256(bytes)}`;
  if (actual !== reference.sha256) {
    throw new EvidenceIntegrityError('EVIDENCE_DIGEST_MISMATCH', `${reference.path} has ${actual}; expected ${reference.sha256}`);
  }
  return bytes;
}

async function assertIndexReferences(repositoryRoot, index) {
  for (const key of ['records', 'artifacts', 'recertifications', 'supersessions']) {
    if (!Array.isArray(index[key])) continue;
    for (const reference of index[key]) await assertReference(repositoryRoot, reference, key);
  }
  if (index.validation) await assertReference(repositoryRoot, index.validation, 'validation');
}

/** Verify current evidence indexes and their content-addressed child records. */
export async function verifyEvidence(repositoryRoot, options) {
  if (options !== undefined) {
    throw new EvidenceIntegrityError(
      'EVIDENCE_OPTIONS_UNSUPPORTED',
      'verifyEvidence accepts only the repository root; legacy identity options are retired',
    );
  }
  const evidenceRoot = join(repositoryRoot, 'tests/evidence');
  const entries = await readdir(evidenceRoot, { withFileTypes: true }).catch(() => []);
  const roots = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
  let recordCount = 0;
  let artifactCount = 0;
  let recertificationCount = 0;
  let supersessionCount = 0;
  for (const root of roots) {
    const indexPath = join(evidenceRoot, root.name, 'index.json');
    const { value: index } = await readCanonicalJson(indexPath).catch((error) => {
      if (error?.code === 'ENOENT') {
        throw new EvidenceIntegrityError('EVIDENCE_INDEX_MISSING', `${root.name} has no index.json`);
      }
      throw error;
    });
    await assertIndexReferences(repositoryRoot, index);
    recordCount += index.records?.length ?? 0;
    artifactCount += index.artifacts?.length ?? 0;
    recertificationCount += index.recertifications?.length ?? 0;
    supersessionCount += index.supersessions?.length ?? 0;
  }
  return {
    indexCount: roots.length,
    recordCount,
    artifactCount,
    recertificationCount,
    supersessionCount,
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

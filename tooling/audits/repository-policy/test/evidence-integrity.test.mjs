import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../src/canonical-json.mjs';
import { hasUnsanitizedEvidenceOutput, verifyEvidence } from '../src/evidence-verify.mjs';

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

test('evidence output privacy recognizes public token IDs without accepting credentials', () => {
  const root = '/tmp/muxui-evidence';
  assert.equal(hasUnsanitizedEvidenceOutput('"muxui:token:default-theme"', root), false);
  assert.equal(hasUnsanitizedEvidenceOutput('token=secret-value', root), true);
  assert.equal(hasUnsanitizedEvidenceOutput(`${root}/packages/tokens`, root), true);
});

test('content-addressed evidence indexes verify canonical child records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-evidence-'));
  try {
    const evidence = join(root, 'tests/evidence/example');
    await mkdir(evidence, { recursive: true });
    const record = canonicalJson({ outcome: 'pass', schema: 'muxui-evidence-record-v1' });
    const recordPath = join(evidence, 'record.json');
    await writeFile(recordPath, record);
    const index = canonicalJson({
      artifacts: [],
      records: [{ path: 'tests/evidence/example/record.json', sha256: digest(record) }],
      schema: 'muxui-evidence-index-v1',
      sourceRevision: '0'.repeat(40),
      sourceTree: '1'.repeat(40),
    });
    await writeFile(join(evidence, 'index.json'), index);
    assert.deepEqual(await verifyEvidence(root), {
      indexCount: 1,
      recordCount: 1,
      artifactCount: 0,
      recertificationCount: 0,
      supersessionCount: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('content-addressed evidence rejects a changed child record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-evidence-'));
  try {
    const evidence = join(root, 'tests/evidence/example');
    await mkdir(evidence, { recursive: true });
    const recordPath = join(evidence, 'record.json');
    await writeFile(recordPath, canonicalJson({ outcome: 'pass', schema: 'muxui-evidence-record-v1' }));
    await writeFile(join(evidence, 'index.json'), canonicalJson({
      records: [{ path: 'tests/evidence/example/record.json', sha256: `sha256:${'0'.repeat(64)}` }],
      schema: 'muxui-evidence-index-v1',
      sourceRevision: '0'.repeat(40),
      sourceTree: '1'.repeat(40),
    }));
    await assert.rejects(verifyEvidence(root), /EVIDENCE_DIGEST_MISMATCH/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('generic evidence verification rejects retired identity options', async () => {
  await assert.rejects(
    verifyEvidence(process.cwd(), { expectedIdentity: 'retired' }),
    (error) => error?.code === 'EVIDENCE_OPTIONS_UNSUPPORTED',
  );
});

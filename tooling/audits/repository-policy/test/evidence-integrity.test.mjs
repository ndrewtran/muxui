import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../src/canonical-json.mjs';
import { hasUnsanitizedEvidenceOutput, verifyEvidence } from '../src/evidence-verify.mjs';
import { DEFERRED_R1_EVIDENCE } from '../../../../packages/react/src/r1-deferred-evidence.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

test('evidence output privacy recognizes public token IDs without accepting credentials', () => {
  const root = '/tmp/muxui-evidence';
  assert.equal(hasUnsanitizedEvidenceOutput('"muxui:token:default-theme"', root), false);
  assert.equal(hasUnsanitizedEvidenceOutput('"core:token:default-theme"', root), false);
  assert.equal(hasUnsanitizedEvidenceOutput('token=secret-value', root), true);
  assert.equal(hasUnsanitizedEvidenceOutput('github-token: core:token:default-theme', root), true);
  const githubToken = `ghp_${'A1b2'.repeat(9)}`;
  for (const credential of [
    `{"token":"${githubToken}"}`,
    '"github-token": "ghs_abc"',
    githubToken,
    `ghs_${'x'.repeat(24)}`,
    'github_pat_11ABCDEFG',
    '{"apiKey":"value"}',
    '{"client_secret":"value"}',
    '{"password":"value"}',
  ]) {
    assert.equal(hasUnsanitizedEvidenceOutput(credential, root), true, credential);
  }
  assert.equal(hasUnsanitizedEvidenceOutput('{"tokenId":"muxui:token:default-theme","tokenizer":"word"}', root), false);
  assert.equal(hasUnsanitizedEvidenceOutput('{"artifactId":"core:token:default-theme"}', root), false);
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

// Decision 0022: R1.1-R1.5 logged CI evidence is retained before the R1 exit.
test('R1.1-R1.5 retained CI evidence covers every assertion honestly and stays disclosable', async () => {
  const assertionCounts = { 'R1.1': 4, 'R1.2': 4, 'R1.3': 5, 'R1.4': 6, 'R1.5': 6 };
  const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  // The reviewed outcome per assertion; a change here is a deliberate evidence change.
  const expectedOutcomes = {
    'E-R1.1-01': 'pass', 'E-R1.1-02': 'inconclusive', 'E-R1.1-03': 'pass', 'E-R1.1-04': 'partial',
    'E-R1.2-01': 'pass', 'E-R1.2-02': 'pass', 'E-R1.2-03': 'partial', 'E-R1.2-04': 'inconclusive',
    'E-R1.3-01': 'pass', 'E-R1.3-02': 'pass', 'E-R1.3-03': 'pass', 'E-R1.3-04': 'partial', 'E-R1.3-05': 'inconclusive',
    'E-R1.4-01': 'pass', 'E-R1.4-02': 'pass', 'E-R1.4-03': 'pass', 'E-R1.4-04': 'unmet', 'E-R1.4-05': 'inconclusive', 'E-R1.4-06': 'inconclusive',
    'E-R1.5-01': 'pass', 'E-R1.5-02': 'pass', 'E-R1.5-03': 'partial', 'E-R1.5-04': 'pass', 'E-R1.5-05': 'inconclusive', 'E-R1.5-06': 'inconclusive',
  };
  for (const [milestone, count] of Object.entries(assertionCounts)) {
    const root = join(repositoryRoot, 'tests/evidence', milestone.toLowerCase());
    const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'));
    assert.equal(index.milestone, milestone);
    assert.equal(index.disclosureClass, 'public-sanitized');
    const expectedIds = Array.from({ length: count }, (_, offset) => `E-${milestone}-${String(offset + 1).padStart(2, '0')}`);
    assert.deepEqual(index.records.map(({ assertionId }) => assertionId), expectedIds);
    const verification = JSON.parse(await readFile(join(repositoryRoot, index.validation.path), 'utf8'));
    const excerpts = new Map();
    for (const { execution, rawLog, excerpt } of verification.results) {
      assert.equal(execution.conclusion, 'success');
      assert.match(execution.executedRevision, /^[0-9a-f]{40}$/u);
      assert.equal(execution.executedTree, index.sourceTree, 'the executed merge tree is the merged source tree');
      assert.match(rawLog.sha256, /^sha256:[0-9a-f]{64}$/u);
      assert.equal(rawLog.retained, false);
      const bytes = await readFile(join(repositoryRoot, excerpt.path));
      assert.equal(sha(bytes), excerpt.sha256, `${excerpt.path} matches its recorded digest`);
      excerpts.set(excerpt.path, bytes.toString('utf8').split('\n'));
    }
    const [artifact] = index.artifacts;
    const observation = JSON.parse(await readFile(join(repositoryRoot, artifact.path), 'utf8'));
    assert.equal(typeof observation.hostedReviews, 'number');
    for (const { assertionId, path } of index.records) {
      const record = JSON.parse(await readFile(join(repositoryRoot, path), 'utf8'));
      const deferred = DEFERRED_R1_EVIDENCE.find(({ id }) => id === assertionId);
      const { coverage } = record;
      // A pass rests entirely on retained excerpt lines; anything author-reported is not a pass.
      const expected = deferred
        ? (/\bhalf\b/u.test(deferred.part) ? 'partial' : 'unmet')
        : (coverage.authorReportedOnly.length === 0 && coverage.evidencedInExcerpt.length > 0 ? 'pass' : 'inconclusive');
      assert.equal(record.outcome, expected, assertionId);
      assert.equal(record.outcome, expectedOutcomes[assertionId], assertionId);
      assert.equal(record.deferred?.deferredTo, deferred?.deferredTo, assertionId);
      assert.equal(record.deferred?.provisional, deferred?.provisional, assertionId);
      for (const { test: name, excerpt, line } of coverage.evidencedInExcerpt) {
        assert.ok(excerpts.get(excerpt)?.[line - 1]?.includes(`✔ ${name} (`), `${assertionId} cites ${excerpt}:${line}`);
      }
    }
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const text = await readFile(join(entry.parentPath, entry.name), 'utf8');
      assert.equal(hasUnsanitizedEvidenceOutput(text, repositoryRoot), false, entry.name);
      assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/u, `${entry.name} retains no email address`);
    }
  }
});

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import { canonicalJson } from '../src/canonical-json.mjs';
import { REVISION_BOUND_INPUTS, hasUnsanitizedEvidenceOutput, readAtRevision, verifyEvidence } from '../src/evidence-verify.mjs';
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
    '{"Authorization": "Bearer abc"}',
    '"authorization":"token abc"',
    'Bearer eyJhbGciOiJIUzI1NiJ9.payload',
    `npm_${'a1B2'.repeat(9)}`,
    "{'token': 'abc'}",
    '{"credentials":"value"}',
    '{"token":"Component.Button"}',
    '{"auth.token":"S3cretValue"}',
    '{"npm.token":"S3cret"}',
    '{"aws:secret":"AbC123"}',
  ]) {
    assert.equal(hasUnsanitizedEvidenceOutput(credential, root), true, credential);
  }
  assert.equal(hasUnsanitizedEvidenceOutput('{"tokenId":"muxui:token:default-theme","tokenizer":"word"}', root), false);
  assert.equal(hasUnsanitizedEvidenceOutput('{"artifactId":"core:token:default-theme"}', root), false);
  assert.equal(hasUnsanitizedEvidenceOutput('{"token":"component.button.background","key":"web.html:web.html"}', root), false);
  assert.equal(hasUnsanitizedEvidenceOutput("{'key': 'native.react-native:ios'}", root), false);
  assert.equal(hasUnsanitizedEvidenceOutput(`${root}/packages/tokens`, root), true);
});

// Every retained root must pass the current disclosure check, so a stricter
// pattern cannot silently start flagging historical public identifiers.
test('every retained evidence root passes the disclosure check', async () => {
  const evidenceRoot = join(repositoryRoot, 'tests/evidence');
  const flagged = [];
  for (const entry of await readdir(evidenceRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:json|txt|md)$/u.test(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    if (hasUnsanitizedEvidenceOutput(await readFile(path, 'utf8'), repositoryRoot)) flagged.push(path.slice(repositoryRoot.length + 1));
  }
  assert.deepEqual(flagged, []);
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

// Decision 0027: closed milestone evidence under archive/ is kept byte-exact and is not verified.
test('evidence verification skips the archive directory and still verifies current roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-evidence-'));
  try {
    const evidence = join(root, 'tests/evidence');
    await mkdir(join(evidence, 'example'), { recursive: true });
    await mkdir(join(evidence, 'archive/g0.0'), { recursive: true });
    await writeFile(join(evidence, 'archive/g0.0/index.json'), '{"records":[{"path":"missing.json","sha256":"sha256:0"}]}');
    await writeFile(join(evidence, 'example/index.json'), canonicalJson({
      records: [],
      schema: 'muxui-evidence-index-v1',
      sourceRevision: '0'.repeat(40),
      sourceTree: '1'.repeat(40),
    }));
    assert.deepEqual(await verifyEvidence(root), { indexCount: 1, recordCount: 0, artifactCount: 0 });
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
    'E-R1.1-01': 'pass', 'E-R1.1-02': 'inconclusive', 'E-R1.1-03': 'pass', 'E-R1.1-04': 'inconclusive',
    'E-R1.2-01': 'pass', 'E-R1.2-02': 'pass', 'E-R1.2-03': 'partial', 'E-R1.2-04': 'inconclusive',
    'E-R1.3-01': 'pass', 'E-R1.3-02': 'pass', 'E-R1.3-03': 'pass', 'E-R1.3-04': 'partial', 'E-R1.3-05': 'inconclusive',
    'E-R1.4-01': 'pass', 'E-R1.4-02': 'pass', 'E-R1.4-03': 'pass', 'E-R1.4-04': 'unmet', 'E-R1.4-05': 'inconclusive', 'E-R1.4-06': 'inconclusive',
    'E-R1.5-01': 'pass', 'E-R1.5-02': 'pass', 'E-R1.5-03': 'inconclusive', 'E-R1.5-04': 'pass', 'E-R1.5-05': 'inconclusive', 'E-R1.5-06': 'inconclusive',
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
      const shown = coverage.authorReportedOnly.length === 0 && coverage.noEvidenceFound.length === 0 && coverage.evidencedInExcerpt.length > 0;
      for (const { prBodyLine } of coverage.authorReportedOnly) {
        assert.ok(observation.authorReportedValidation.includes(prBodyLine), `${assertionId} cites a PR-body validation line`);
      }
      const expected = deferred && !/\bhalf\b/u.test(deferred.part) ? 'unmet'
        : !shown ? 'inconclusive' : deferred ? 'partial' : 'pass';
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

// Decision 0022 amendment 01: the retained R1.2-R1.4 retroactive reviews.
test('R1.2-R1.4 retroactive review records match their reports and never overclaim', async () => {
  const root = 'tests/evidence/r1-retro-review';
  const index = JSON.parse(await readFile(join(repositoryRoot, root, 'index.json'), 'utf8'));
  assert.equal(index.authority, 'muxui:decision:0022:amendment:01');
  assert.deepEqual(index.milestones, ['R1.2', 'R1.3', 'R1.4']);
  assert.equal(index.disclosureClass, 'public-sanitized');
  assert.deepEqual(index.records.map(({ reviewId }) => reviewId), ['r1.2-fields', 'r1.3a-collections', 'r1.3b-pickers', 'r1.4-overlays']);
  const verification = JSON.parse(await readFile(join(repositoryRoot, index.validation.path), 'utf8'));
  assert.ok(verification.reports.every(({ report }) => report.retained === false && /^sha256:[0-9a-f]{64}$/u.test(report.sha256)));
  for (const { reviewId, path } of index.records) {
    const record = JSON.parse(await readFile(join(repositoryRoot, path), 'utf8'));
    assert.equal(record.reviewedRevision, index.sourceRevision);
    assert.equal(record.reviewedTree, index.sourceTree);
    assert.equal(record.executedRevision, record.reviewedRevision);
    assert.equal(record.executedTree, record.reviewedTree);
    assert.equal(record.manualAndAssistiveTechnology.status, 'unmet');
    assert.equal(record.manualAndAssistiveTechnology.deferredTo, 'S1.0');
    assert.equal(record.originalPullRequest.hostedReviews, 0, `${reviewId} reviews a pull request that had no hosted review`);
    // Each finding is a report heading under its severity section, and no report finding is left out.
    const report = await readFile(join(repositoryRoot, record.artifact.path), 'utf8');
    const sectionOf = (id) => {
      const at = report.indexOf(`**${id}.`);
      assert.ok(at >= 0, `${reviewId} ${id} is in its report`);
      return [...report.slice(0, at).matchAll(/^### (High|Medium|Low)$/gmu)].at(-1)?.[1].toLowerCase();
    };
    assert.deepEqual(
      [...new Set([...report.matchAll(/\*\*([HMLF]\d+)\./gu)].map(([, id]) => id))].sort(),
      record.findings.map(({ id }) => id).sort(),
      reviewId,
    );
    const counts = { high: 0, medium: 0, low: 0 };
    for (const { id, severity, families, resolution } of record.findings) {
      assert.equal(sectionOf(id), severity, `${reviewId} ${id}`);
      counts[severity] += 1;
      assert.ok(families.length > 0 && families.every((family) => record.families.some((entry) => entry.family === family)));
      // Decision 0022 amendment 01: every finding is resolved before the review evidence counts.
      assert.notEqual(resolution.status, 'pending', `${reviewId} ${id} is resolved`);
      if (resolution.status === 'fixed') assert.match(resolution.fixCommit, /^[0-9a-f]{40}$/u);
      else assert.ok(resolution.status === 'accepted-unfixed' && resolution.reason && resolution.acceptedBy, `${reviewId} ${id} records its reason and who accepted it`);
    }
    assert.deepEqual(record.severityCounts, counts);
    // A family is clear only when no finding names it; a lane with findings is never a pass.
    for (const { family, verdict, findings } of record.families) {
      const named = record.findings.filter(({ families }) => families.includes(family)).map(({ id }) => id);
      assert.deepEqual(findings, named, `${reviewId} ${family}`);
      assert.equal(verdict, named.length === 0 ? 'clear' : 'findings', `${reviewId} ${family}`);
    }
    assert.equal(record.outcome, record.findings.length === 0 ? 'clear' : 'findings');
  }
  for (const entry of await readdir(join(repositoryRoot, root), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const text = await readFile(join(entry.parentPath, entry.name), 'utf8');
    assert.equal(hasUnsanitizedEvidenceOutput(text, repositoryRoot), false, entry.name);
    assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/u, `${entry.name} retains no email address`);
  }
});

// Roadmap R1 exit: the E-R1-EXIT capture tool binds the dry run, publish run,
// and registry to one candidate. Fixtures mirror npm-publish.yml job-log shapes.
const r1Exit = await import('../../../../tests/evidence/capture-r1-exit.mjs');

function r1ExitFixture({ version = '0.1.0-rc.1', tarballBytes = Buffer.from('r1 exit fixture tarball') } = {}) {
  const head = 'a'.repeat(40);
  const tree = 'b'.repeat(40);
  const entries = ['package/package.json', 'package/generated/index.mjs', 'package/generated/styles.css'];
  const facts = r1Exit.tarballFacts(tarballBytes, entries);
  const exportsMap = { '.': './generated/index.mjs', './styles.css': './generated/styles.css' };
  const manifest = {
    package: { name: '@muxui/react', version, exports: exportsMap, dependencies: {}, peerDependencies: {} },
    source: { revision: head, preparationTool: { path: 'tooling/audits/repository-policy/src/release-prepare.mjs', sha256: `sha256:${'c'.repeat(64)}` } },
    correlation: { source: { revision: head, tree } },
    artifact: { file: `muxui-react-${version}.tgz`, bytes: facts.bytes, sha256: facts.sha256, shasum: facts.shasum, integrity: facts.integrity },
    files: entries.map((entry) => entry.slice('package/'.length)),
    consumerVerification: { onlineMatrix: [], warnings: { duplicateDependencyVersions: [] } },
    publication: { status: 'prepared', distTag: 'next', authorization: 'required-external-human-authorization' },
    preflight: { checks: [{ name: 'version collision', command: `npm view @muxui/react@${version} version`, status: 'pending' }] },
    rollback: { status: 'prepared-not-exercised', steps: ['deprecate and fix forward'] },
  };
  const at = (index) => `2026-10-04T07:48:${String(index % 60).padStart(2, '0')}.0000000Z`;
  const log = (lines) => lines.map((line, index) => `${at(index)} ${line}`).join('\n');
  const script = (line) => `\u001b[36;1m${line}\u001b[0m`;
  const prepareLog = (mode, expected) => log([
    'Current runner version: \'2.337.0\'',
    '##[group]Run actions/checkout@v4',
    '[command]/usr/bin/git log -1 --format=%H',
    head,
    '##[group]Run set -euo pipefail',
    script('pnpm release:prepare 2>&1 | tee "$RUNNER_TEMP/release-prepare.log"'),
    '##[endgroup]',
    'unrelated check output',
    `R1 exit release preparation passed for ${version}; source @muxui/react remains private and unpublished.`,
    '##[group]Run set -euo pipefail',
    script('source_dir=$(sed -n \'s/^R1 exit artifacts written to //p\' "$RUNNER_TEMP/release-prepare.log")'),
    '##[endgroup]',
    `Candidate ${version} ${facts.integrity}`,
    '##[group]Run set -euo pipefail',
    script('npm publish "$TARBALL" --tag next --provenance --access public --dry-run'),
    '##[endgroup]',
    `+ @muxui/react@${version}`,
    '##[group]Run set -euo pipefail',
    script('if [ -z "$EXPECTED_SHA512" ]; then'),
    'env:',
    `  MODE: ${mode}`,
    `  EXPECTED_VERSION: ${version}`,
    `  EXPECTED_SHA512: ${expected}`,
    '##[endgroup]',
    '##[group]Run actions/upload-artifact@v4',
    '##[endgroup]',
    'Post job cleanup.',
  ]);
  const abbreviated = `${facts.integrity.slice(0, 20)}[...]${facts.integrity.slice(-15)}`;
  // `outcome`: 'passed' read-back, 'propagation' (registry still empty), 'mismatch'
  // (registry had other bytes), 'misplaced' (propagation lines outside the
  // read-back step), or 'eotp' (nothing published).
  const publishLog = ({ input = facts.integrity, readBack = facts.integrity, outcome = 'passed' } = {}) => log([
    '##[group]Run set -euo pipefail',
    script('tarballs=("$RUNNER_TEMP"/npm-candidate/*.tgz)'),
    'env:',
    `  EXPECTED_VERSION: ${version}`,
    `  EXPECTED_SHA512: ${input}`,
    '##[endgroup]',
    '##[group]Run set -euo pipefail',
    script('publisher=$(npm whoami --registry="$registry")'),
    'env:',
    '  NODE_AUTH_TOKEN: ***',
    '##[endgroup]',
    'npm whoami: ndrewtran',
    `@muxui/react@${version}: E404 (no collision)`,
    '@muxui/react dist-tags: E404 (first publish)',
    '##[group]Run set -euo pipefail',
    script('# Stop on publisher drift since the preflight.'),
    '##[endgroup]',
    `npm notice shasum: ${facts.shasum}`,
    `npm notice integrity: ${abbreviated}`,
    'npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=7',
    ...(outcome === 'misplaced' ? ['dist.integrity: missing', `##[error]Registry has nothing; expected ${facts.integrity}.`] : []),
    ...(outcome === 'eotp' ? ['npm error code EOTP', '##[error]Process completed with exit code 1.'] : [
      `+ @muxui/react@${version}`,
      '##[group]Run set -euo pipefail',
      script('read_back() {'),
      '##[endgroup]',
      ...(outcome === 'propagation' ? [
        `Waiting for npm view @muxui/react@${version} dist.integrity (attempt 1)`,
        'dist.integrity: missing',
        `##[error]Registry has nothing; expected ${facts.integrity}.`,
      ] : outcome === 'mismatch' ? [
        'dist.integrity: sha512-other',
        `##[error]Registry has sha512-other; expected ${facts.integrity}.`,
      ] : outcome === 'misplaced' ? [] : [
        `dist.integrity: ${readBack}`,
        'dist.attestations: {',
        '  "provenance": { "predicateType": "https://slsa.dev/provenance/v1" }',
        '}',
        'dist-tags: {',
        `  "latest": "${version}",`,
        `  "next": "${version}"`,
        '}',
      ]),
    ]),
    'Post job cleanup.',
  ]);
  const run = (id, overrides = {}) => ({
    id, name: 'npm publish', path: '.github/workflows/npm-publish.yml', event: 'workflow_dispatch', status: 'completed',
    conclusion: 'success', head_branch: 'main', head_sha: head, run_attempt: 1, run_started_at: '2026-10-04T07:34:16Z', ...overrides,
  });
  const job = (id, name, steps = []) => ({ id, name, conclusion: 'success', started_at: '2026-10-04T07:34:21Z', completed_at: '2026-10-04T07:48:33Z', steps });
  const step = (name, conclusion = 'success') => ({ name, conclusion, completed_at: '2026-10-04T13:05:34Z' });
  const publishJob = (id, outcome = 'passed', { publish = outcome === 'eotp' ? 'failure' : 'success', readBack = { passed: 'success', eotp: 'skipped' }[outcome] ?? 'failure' } = {}) => ({
    ...job(id, 'publish', [
      step('Re-verify candidate'),
      step('Registry preflight (read-only)'),
      step('Publish to next', publish),
      step('Read back registry state', readBack),
    ]),
    conclusion: outcome === 'passed' ? 'success' : 'failure',
  });
  const credentials = {
    run: run(37130250844, { head_sha: 'd'.repeat(40) }),
    jobs: [job(3, 'verify-credentials')],
    log: log(['##[group]Run set -euo pipefail', script('npm whoami'), '##[endgroup]', 'npm whoami:', 'ndrewtran', 'Packages in @muxui visible to this token:', '{}', '##[notice]@muxui/react returned E404, expected before the first publish.', 'Post job cleanup.']),
  };
  const artifact = {
    manifest: { file: `muxui-react-${version}.release-manifest.json`, bytes: Buffer.from(JSON.stringify(manifest)) },
    tarball: { file: `muxui-react-${version}.tgz`, bytes: tarballBytes, entries, packageJson: { name: '@muxui/react', version, exports: exportsMap } },
  };
  const dryRunInput = { run: run(1), jobs: [job(11, 'prepare')], prepareLog: prepareLog('dry-run', ''), artifact, sourceTree: tree, credentials };
  // The registry's attestation document: a DSSE-wrapped SLSA v1 statement.
  const attestationDocument = ({ commit = head, path = '.github/workflows/npm-publish.yml', runId = 2 } = {}) => ({
    attestations: [{
      predicateType: 'https://slsa.dev/provenance/v1',
      bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify({
        subject: [{ name: `pkg:npm/%40muxui/react@${version}`, digest: { sha512: Buffer.from(facts.integrity.slice(7), 'base64').toString('hex') } }],
        predicate: {
          buildDefinition: { externalParameters: { workflow: { ref: 'refs/heads/main', repository: 'https://github.com/ndrewtran/muxui', path } }, resolvedDependencies: [{ digest: { gitCommit: commit } }] },
          runDetails: { builder: { id: 'https://github.com/actions/runner/github-hosted' }, metadata: { invocationId: `https://github.com/ndrewtran/muxui/actions/runs/${runId}/attempts/1` } },
        },
      })).toString('base64') } },
    }],
  });
  const view = {
    integrity: facts.integrity, shasum: facts.shasum,
    attestations: { url: 'https://registry.example/attestations', provenance: { predicateType: 'https://slsa.dev/provenance/v1' } },
    distTags: { latest: version, next: version }, versions: [version],
    time: { created: '2026-10-04T13:05:33.464Z', [version]: '2026-10-04T13:05:33.917Z' },
  };
  const consumer = { installedVersion: version, lockIntegrity: facts.integrity, smoke: { imported: ['@muxui/react'], resolved: ['@muxui/react/styles.css'], rendered: ['Button'] } };
  // The trusted-publishing workflow's publish job: npm-publication.mjs output.
  // `outcome`: 'passed', 'propagation' (bounded read-back timed out), or
  // 'no-recheck' (the drift recheck printed nothing).
  const oidcPublishLog = ({ outcome = 'passed', prior = '0.1.0-rc.1' } = {}) => log([
    '##[group]Run set -euo pipefail',
    script('tarballs=("$RUNNER_TEMP"/npm-candidate/*.tgz)'),
    'env:',
    `  EXPECTED_VERSION: ${version}`,
    `  EXPECTED_SHA512: ${facts.integrity}`,
    '##[endgroup]',
    '##[group]Run node tooling/audits/repository-policy/src/npm-publication.mjs preflight',
    script('node tooling/audits/repository-policy/src/npm-publication.mjs preflight'),
    'shell: /usr/bin/bash -e {0}',
    'env:',
    `  VERSION: ${version}`,
    '##[endgroup]',
    `@muxui/react@${version}: 404 (no collision)`,
    `@muxui/react dist-tags latest=${prior} next=${prior}`,
    '##[group]Run set -euo pipefail',
    script('# Stop on registry drift since the preflight.'),
    script('node tooling/audits/repository-policy/src/npm-publication.mjs recheck'),
    'env:',
    '  PRE_KIND: later',
    '##[endgroup]',
    ...(outcome === 'no-recheck' ? [] : [`No drift since the preflight: @muxui/react dist-tags latest=${prior} next=${prior}`]),
    `npm notice shasum: ${facts.shasum}`,
    `npm notice integrity: ${abbreviated}`,
    'npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=8',
    `+ @muxui/react@${version}`,
    '##[group]Run node tooling/audits/repository-policy/src/npm-publication.mjs read-back',
    script('node tooling/audits/repository-policy/src/npm-publication.mjs read-back'),
    'env:',
    `  VERSION: ${version}`,
    '##[endgroup]',
    ...(outcome === 'propagation' ? [
      `Waiting for @muxui/react dist-tags next=${version} (attempt 1 of 41)`,
      `##[error]@muxui/react dist-tags next=${version} did not appear after 41 attempts.`,
    ] : [
      `dist.integrity: ${facts.integrity}`,
      'provenance: https://slsa.dev/provenance/v1',
      `dist-tags: {"latest":"${prior}","next":"${version}"}`,
    ]),
    'Post job cleanup.',
  ]);
  return { head, tree, version, facts, entries, exportsMap, manifest, artifact, run, job, publishJob, prepareLog, publishLog, oidcPublishLog, dryRunInput, attestationDocument, view, consumer };
}

const r1ExitCode = (code) => (error) => error?.code === code;

function r1ExitPublish(fixture, dryRun, overrides = {}) {
  return r1Exit.bindPublish({
    dryRun, run: fixture.run(2), jobs: [fixture.job(21, 'prepare'), fixture.publishJob(22)],
    prepareLog: fixture.prepareLog('publish', fixture.facts.integrity), publishLog: fixture.publishLog(), ...overrides,
  });
}

test('R1 exit capture binds the dry run, publish run, and registry to one candidate', () => {
  const fixture = r1ExitFixture();
  const dryRun = { ...r1Exit.bindDryRun(fixture.dryRunInput), manifest: fixture.manifest };
  assert.equal(dryRun.execution.executedRevision, fixture.head);
  assert.equal(dryRun.candidate.tarball.integrity, fixture.facts.integrity);
  assert.equal(dryRun.credentials.observed.npmUser, 'ndrewtran');
  const excerpt = dryRun.excerpt.text;
  assert.doesNotMatch(excerpt, /unrelated check output|release:prepare 2>&1/u, 'long-step noise and workflow script lines are not retained');
  assert.match(excerpt, /R1 exit release preparation passed/u);
  const approvals = [{ state: 'approved', user: { login: 'ndrewtran' }, environments: [{ name: 'npm-publish' }], comment: '' }];
  const publish = r1ExitPublish(fixture, dryRun, { approvals, approvalMethod: 'web UI' });
  assert.equal(publish.observed.workflowReadBack.status, 'passed');
  assert.equal(publish.observed.preflight.version, 'E404 (no collision)');
  assert.deepEqual(publish.approvals[0].method.value, 'web UI');
  const registry = r1Exit.bindRegistry({ dryRun, view: fixture.view, attestations: fixture.attestationDocument(), consumer: fixture.consumer, publishRunId: 2 });
  assert.equal(registry.provenance.slsa.gitCommit, fixture.head);
  const ref = { path: 'tests/evidence/r1-exit/x', sha256: `sha256:${'0'.repeat(64)}` };
  const phase = (value) => ({ ...value, captureTimestamp: 't', proofTool: {} });
  const verification = { phases: { dryRun: phase(dryRun), publish: phase(publish), registry: phase(registry) }, sourceRevision: fixture.head, sourceTree: fixture.tree, proofTool: {} };
  const records = Object.fromEntries(Object.entries(r1Exit.buildRoute(verification, { validation: ref, manifest: ref, registry: ref })).map(([id, text]) => [id, JSON.parse(text)]));
  assert.deepEqual(Object.keys(records), ['E-R1-EXIT-01', 'E-R1-EXIT-02', 'E-R1-EXIT-03', 'E-R1-EXIT-04']);
  assert.equal(records['E-R1-EXIT-02'].outcome, 'pass');
  // latest is observed as registry-set, never claimed; rollback is prepared, not exercised.
  assert.deepEqual(records['E-R1-EXIT-04'].distTags.latest, {
    observed: fixture.version, setBy: 'the registry on first publish (Decision 0023)', claimed: false, promoted: false,
    basis: { versions: [fixture.version], packageCreated: '2026-10-04T13:05:33.464Z', versionPublished: '2026-10-04T13:05:33.917Z' },
  });
  assert.equal(records['E-R1-EXIT-02'].registryReadBack.registryPublishedAt, '2026-10-04T13:05:33.917Z');
  assert.equal(records['E-R1-EXIT-04'].rollback.status, 'prepared-not-exercised');
  for (const record of Object.values(records)) {
    assert.ok(record.deferredToS1.every(({ status, deferredTo }) => status === 'unmet' && deferredTo === 'S1.0'));
    assert.ok(record.nonClaims.some((claim) => claim.includes('No assistive-technology support claim')));
  }
  // Without the registry read-back, E-R1-EXIT-02 is not a pass, even after publish.
  for (const phases of [{ dryRun: phase(dryRun) }, { dryRun: phase(dryRun), publish: phase(publish) }]) {
    assert.equal(JSON.parse(r1Exit.buildRoute({ ...verification, phases }, { validation: ref, manifest: ref })['E-R1-EXIT-02']).outcome, 'partial');
  }
});

test('R1 exit capture records a read-back that failed on registry propagation and a prior attempt that published nothing', () => {
  const fixture = r1ExitFixture();
  const dryRun = { ...r1Exit.bindDryRun(fixture.dryRunInput), manifest: fixture.manifest };
  const publish = r1ExitPublish(fixture, dryRun, {
    run: fixture.run(2, { conclusion: 'failure' }),
    jobs: [fixture.job(21, 'prepare'), fixture.publishJob(22, 'propagation')],
    publishLog: fixture.publishLog({ outcome: 'propagation' }),
  });
  assert.equal(publish.observed.workflowReadBack.status, 'failed-registry-propagation');
  assert.equal(publish.observed.published, '@muxui/react@0.1.0-rc.1');
  assert.equal(publish.execution.executedRevision, fixture.head);
  assert.equal(publish.execution.executedTree, fixture.tree);
  // Any other read-back failure is not accepted.
  const failed = (outcome, steps) => () => r1ExitPublish(fixture, dryRun, {
    run: fixture.run(2, { conclusion: 'failure' }),
    jobs: [fixture.job(21, 'prepare'), fixture.publishJob(22, outcome, steps)],
    publishLog: fixture.publishLog({ outcome }),
  });
  assert.throws(failed('passed', { readBack: 'failure' }), r1ExitCode('R1_EXIT_RUN_INVALID'), 'a failed step without the propagation lines');
  assert.throws(failed('mismatch'), r1ExitCode('R1_EXIT_RUN_INVALID'), 'a read-back that found other bytes');
  assert.throws(failed('misplaced'), r1ExitCode('R1_EXIT_RUN_INVALID'), 'propagation lines outside the read-back step');
  assert.throws(failed('propagation', { publish: 'failure' }), r1ExitCode('R1_EXIT_TUPLE_MISMATCH'), 'a failed Publish to next');
  for (const readBack of ['skipped', 'cancelled']) assert.throws(failed('propagation', { readBack }), r1ExitCode('R1_EXIT_RUN_INVALID'), readBack);
  const prior = r1Exit.bindPriorPublish({ dryRun, run: fixture.run(3, { conclusion: 'failure' }), jobs: [fixture.job(31, 'prepare'), fixture.publishJob(32, 'eotp')], publishLog: fixture.publishLog({ outcome: 'eotp' }) });
  assert.equal(prior.observed.published, false);
  assert.equal(prior.observed.failedStep.errorCode, 'EOTP');
  assert.equal(prior.observed.orphanTransparencyLog, 'https://search.sigstore.dev/?logIndex=7');
  assert.throws(() => r1Exit.bindPriorPublish({ dryRun, run: fixture.run(3), jobs: [fixture.job(31, 'prepare'), fixture.publishJob(32)], publishLog: fixture.publishLog() }), r1ExitCode('R1_EXIT_PRIOR_ATTEMPT_INVALID'));
});

test('R1 exit capture rejects a source.revision, head commit, digest, provenance, or branch mismatch', () => {
  const fixture = r1ExitFixture();
  const withManifest = (change) => {
    const manifest = structuredClone(fixture.manifest);
    change(manifest);
    return { ...fixture.dryRunInput, artifact: { ...fixture.artifact, manifest: { ...fixture.artifact.manifest, bytes: Buffer.from(JSON.stringify(manifest)) } } };
  };
  assert.throws(() => r1Exit.bindDryRun(withManifest((manifest) => { manifest.source.revision = 'e'.repeat(40); })), r1ExitCode('R1_EXIT_SOURCE_REVISION_MISMATCH'));
  assert.throws(() => r1Exit.bindDryRun(withManifest((manifest) => { manifest.artifact.integrity = 'sha512-other'; })), r1ExitCode('R1_EXIT_DIGEST_MISMATCH'));
  assert.throws(() => r1Exit.bindDryRun({ ...fixture.dryRunInput, run: fixture.run(1, { head_branch: 'ci/npm-publish-rc' }) }), r1ExitCode('R1_EXIT_RUN_NOT_MAIN'));

  const dryRun = { ...r1Exit.bindDryRun(fixture.dryRunInput), manifest: fixture.manifest };
  assert.throws(() => r1ExitPublish(fixture, dryRun, { run: fixture.run(2, { head_sha: 'f'.repeat(40) }) }), r1ExitCode('R1_EXIT_HEAD_SHA_MISMATCH'));
  assert.throws(() => r1ExitPublish(fixture, dryRun, { publishLog: fixture.publishLog({ input: 'sha512-other-input' }) }), r1ExitCode('R1_EXIT_DIGEST_MISMATCH'));
  assert.throws(() => r1ExitPublish(fixture, dryRun, { prepareLog: fixture.prepareLog('publish', 'sha512-other-input').replace(fixture.facts.integrity, 'sha512-other') }), r1ExitCode('R1_EXIT_DIGEST_MISMATCH'));
  const registry = (overrides) => r1Exit.bindRegistry({ dryRun, view: fixture.view, attestations: fixture.attestationDocument(), consumer: fixture.consumer, publishRunId: 2, ...overrides });
  assert.throws(() => registry({ view: { ...fixture.view, integrity: 'sha512-other' } }), r1ExitCode('R1_EXIT_DIGEST_MISMATCH'));
  assert.throws(() => registry({ attestations: fixture.attestationDocument({ commit: 'f'.repeat(40) }) }), r1ExitCode('R1_EXIT_PROVENANCE_MISMATCH'));
  assert.throws(() => registry({ attestations: fixture.attestationDocument({ path: '.github/workflows/other.yml' }) }), r1ExitCode('R1_EXIT_PROVENANCE_MISMATCH'));
  assert.throws(() => registry({ attestations: fixture.attestationDocument({ runId: 9 }) }), r1ExitCode('R1_EXIT_PROVENANCE_MISMATCH'));
  assert.throws(() => registry({ view: { ...fixture.view, distTags: { latest: fixture.version } } }), r1ExitCode('R1_EXIT_NEXT_MISMATCH'));
  assert.throws(() => registry({ view: { ...fixture.view, distTags: { latest: '0.0.9', next: fixture.version } } }), r1ExitCode('R1_EXIT_LATEST_UNEXPECTED'));
  assert.throws(() => registry({ view: { ...fixture.view, versions: ['0.0.9', fixture.version] } }), r1ExitCode('R1_EXIT_VERSIONS_UNEXPECTED'));
  assert.equal(registry({ view: { ...fixture.view, distTags: { next: fixture.version } } }).view.distTags.latest, undefined, 'an absent latest is accepted');
});

test('R1 exit capture fails closed when the npm-candidate artifact is missing', async () => {
  const fixture = r1ExitFixture();
  assert.throws(() => r1Exit.bindDryRun({ ...fixture.dryRunInput, artifact: null }), r1ExitCode('R1_EXIT_ARTIFACT_MISSING'));
  // End to end, an expired or absent download writes nothing.
  const root = await mkdtemp(join(tmpdir(), 'muxui-r1-exit-'));
  try {
    const out = join(root, 'tests/evidence/r1-exit');
    const github = {
      run: (id) => (id === 37130250844 ? fixture.dryRunInput.credentials.run : fixture.run(id)),
      jobs: (id) => (id === 37130250844 ? fixture.dryRunInput.credentials.jobs : fixture.dryRunInput.jobs),
      log: (jobId) => (jobId === 3 ? fixture.dryRunInput.credentials.log : fixture.dryRunInput.prepareLog),
      tree: () => fixture.tree,
      approvals: () => [],
      download: () => false,
    };
    await assert.rejects(r1Exit.main(['--rehearsal', `--out=${out}`, '--capture-timestamp=2026-10-04T10:00:00Z', '--dry-run-run=1'], github), r1ExitCode('R1_EXIT_ARTIFACT_MISSING'));
    assert.deepEqual(await readdir(root), [], 'no evidence root is created');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('R1 exit capture discloses a failed earlier dry-run attempt and masks npm auth URLs', () => {
  const fixture = r1ExitFixture();
  const dryRun = r1Exit.bindDryRun({ ...fixture.dryRunInput, run: fixture.run(1, { run_attempt: 2 }) });
  const failedLog = fixture.prepareLog('dry-run', '').replace('unrelated check output', 'apps/react-storybook check: ✖ Storybook manager and docs paint only canonical Mux colours in light and dark (1.5ms)');
  const attempt = fixture.run(1, { run_attempt: 1, conclusion: 'failure' });
  const jobs = [{ ...fixture.job(10, 'prepare', [{ name: 'Prepare release candidate', conclusion: 'failure', completed_at: '2026-10-04T10:07:09Z' }]), conclusion: 'failure' }];
  const prior = r1Exit.bindPriorDryRunAttempt({ dryRun, attempt, jobs, prepareLog: failedLog });
  assert.deepEqual(prior.failingTests, ['Storybook manager and docs paint only canonical Mux colours in light and dark']);
  assert.deepEqual(prior.failedSteps.map(({ step }) => step), ['Prepare release candidate']);
  assert.match(prior.excerpt.text, /✖ Storybook manager/u);
  assert.throws(() => r1Exit.bindPriorDryRunAttempt({ dryRun, attempt: { ...attempt, head_sha: 'f'.repeat(40) }, jobs, prepareLog: failedLog }), r1ExitCode('R1_EXIT_PRIOR_ATTEMPT_INVALID'));

  const id = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
  const line = (text) => `2026-10-04T12:40:36.1044474Z npm error   ${text}`;
  assert.equal(r1Exit.sanitize(line(`https://www.npmjs.com/auth/cli/${id}`)), line('<npm-auth-url>'));
  assert.equal(r1Exit.sanitize(line(`https://registry.npmjs.org/-/v1/done?authId=${id}`)), line('https://registry.npmjs.org/-/v1/done?<npm-auth-url>'));
  assert.ok(r1Exit.sanitizationRules.some((rule) => rule.includes('<npm-auth-url>')));
});

test('R1 exit capture rebuilds the committed route byte for byte from its verification.json', async () => {
  const read = (relative) => readFileSync(join(repositoryRoot, relative), 'utf8');
  const { files } = r1Exit.assembleRoute(JSON.parse(read(`${r1Exit.route}/verification.json`)), read);
  assert.deepEqual([...files.keys()].sort(), ['README.md', 'index.json', 'records/E-R1-EXIT-01.json', 'records/E-R1-EXIT-02.json', 'records/E-R1-EXIT-03.json', 'records/E-R1-EXIT-04.json', 'verification.json'].map((file) => `${r1Exit.route}/${file}`));
  for (const [relative, text] of files) assert.equal(text, read(relative), relative);
});

// A rehearsal route holding a captured dry run, written as the tool would.
async function seedR1ExitRoute(out, fixture) {
  const bound = r1Exit.bindDryRun(fixture.dryRunInput);
  const files = new Map();
  const retain = (relative, text) => {
    files.set(relative, text);
    return { path: relative, sha256: digest(text) };
  };
  const { excerpt, credentials, manifest, ...rest } = bound;
  const { value, rewrites } = r1Exit.sanitizeManifest(manifest);
  const route = r1Exit.route;
  const verification = {
    schema: 'muxui-evidence-validation-v1',
    phases: { dryRun: { ...rest, captureTimestamp: '2026-10-04T10:00:00Z', excerpt: excerpt.ranges, manifestSanitization: rewrites, proofTool: {}, credentials: { ...credentials, excerpt: credentials.excerpt.ranges }, priorAttempts: [] } },
    retained: {
      manifest: retain(`${route}/artifacts/release-manifest.json`, canonicalJson(value)),
      dryRunExcerpt: retain(`${route}/validation/dry-run-prepare-11.txt`, excerpt.text),
      credentialsExcerpt: retain(`${route}/validation/verify-credentials-3.txt`, credentials.excerpt.text),
    },
    sourceRevision: fixture.head,
    sourceTree: fixture.tree,
    proofTool: {},
    rehearsal: { status: 'rehearsal', note: 'development capture; not release evidence' },
  };
  for (const [relative, text] of r1Exit.assembleRoute(verification, (relative) => files.get(relative)).files) files.set(relative, text);
  for (const [relative, text] of files) {
    if (text === null) continue;
    const target = join(out, relative.slice(route.length + 1));
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, text);
  }
}

async function snapshotTree(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  return Object.fromEntries(await Promise.all(files.sort().map(async (file) => [file.slice(directory.length), await readFile(file, 'utf8')])));
}

test('R1 exit capture replaces the route atomically and leaves it unchanged when the rebuild fails', async () => {
  const fixture = r1ExitFixture();
  const github = {
    run: (id) => fixture.run(id),
    jobs: () => [fixture.job(21, 'prepare'), fixture.publishJob(22)],
    log: (jobId) => (jobId === 21 ? fixture.prepareLog('publish', fixture.facts.integrity) : fixture.publishLog()),
    approvals: () => [],
  };
  const argv = (out) => ['--rehearsal', `--out=${out}`, '--capture-timestamp=2026-10-04T14:00:00Z', '--publish-run=2'];
  const root = await mkdtemp(join(tmpdir(), 'muxui-r1-exit-'));
  try {
    const out = join(root, 'r1-exit');
    await seedR1ExitRoute(out, fixture);
    // An older capture whose dry run holds a field the rebuild cannot read: the
    // publish phase binds, then the rebuild throws.
    const verificationPath = join(out, 'verification.json');
    const stale = JSON.parse(await readFile(verificationPath, 'utf8'));
    stale.phases.dryRun.priorAttempts = {};
    await writeFile(verificationPath, canonicalJson(stale));
    const before = await snapshotTree(out);
    await assert.rejects(r1Exit.main(argv(out), github), TypeError);
    assert.deepEqual(await snapshotTree(out), before, 'the route is byte-identical after a failed rebuild');
    assert.deepEqual(await readdir(root), ['r1-exit'], 'no staging directory is left behind');

    // A write that fails inside the staging directory: a directory already
    // occupies the path of a staged excerpt.
    await rm(out, { recursive: true });
    await seedR1ExitRoute(out, fixture);
    await mkdir(join(out, 'validation/publish-22.txt'));
    await writeFile(join(out, 'validation/publish-22.txt/occupant'), 'x');
    const occupied = await snapshotTree(out);
    await assert.rejects(r1Exit.main(argv(out), github), { code: 'EISDIR' });
    assert.deepEqual(await snapshotTree(out), occupied, 'the route is byte-identical after a failed staging write');
    assert.deepEqual(await readdir(root), ['r1-exit'], 'no staging or previous directory is left behind');

    await rm(out, { recursive: true });
    await seedR1ExitRoute(out, fixture);
    await chmod(out, 0o750);
    await r1Exit.main(argv(out), github);
    assert.deepEqual(await readdir(root), ['r1-exit'], 'the staged route replaced the old one in place');
    assert.equal((await stat(out)).mode & 0o777, 0o750, 'the route keeps its directory mode');
    const index = JSON.parse(await readFile(join(out, 'index.json'), 'utf8'));
    for (const ref of [...index.artifacts, ...index.records, index.validation]) {
      assert.equal(digest(await readFile(join(out, ref.path.slice(r1Exit.route.length + 1)))), ref.sha256, ref.path);
    }
    assert.ok(index.artifacts.some(({ path }) => path.endsWith('/validation/publish-22.txt')));
    assert.equal(JSON.parse(await readFile(join(out, 'records/E-R1-EXIT-02.json'), 'utf8')).postPublication.execution.runId, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Trusted-publishing workflow: a fix-forward rc binds from npm-publication.mjs
// output, with latest unchanged, into its own route.
test('R1 exit capture binds a trusted-publishing fix-forward rc with latest unchanged', () => {
  const fixture = r1ExitFixture({ version: '0.1.0-rc.2' });
  const dryRun = { ...r1Exit.bindDryRun({ ...fixture.dryRunInput, credentials: undefined }), manifest: fixture.manifest };
  assert.equal(dryRun.credentials, undefined, 'no verify-credentials run under trusted publishing');
  const publishInput = { dryRun, run: fixture.run(2), jobs: [fixture.job(21, 'prepare'), fixture.publishJob(22)], prepareLog: fixture.prepareLog('publish', fixture.facts.integrity) };
  const publish = r1Exit.bindPublish({ ...publishInput, publishLog: fixture.oidcPublishLog() });
  assert.deepEqual(publish.observed.preflight, {
    version: '404 (no collision)', kind: 'later', latest: '0.1.0-rc.1', next: '0.1.0-rc.1',
    recheck: 'No drift since the preflight: @muxui/react dist-tags latest=0.1.0-rc.1 next=0.1.0-rc.1',
  });
  assert.deepEqual(publish.observed.workflowReadBack, {
    status: 'passed', completedAt: '2026-10-04T13:05:34Z', integrity: fixture.facts.integrity,
    provenancePredicateType: 'https://slsa.dev/provenance/v1', distTags: { latest: '0.1.0-rc.1', next: '0.1.0-rc.2' },
  });
  assert.match(publish.excerpts.publish.text, /# step: Read back registry state/u);
  assert.doesNotMatch(publish.excerpts.publish.text, /Stop on registry drift/u, 'workflow script lines are not retained');

  const timedOut = r1Exit.bindPublish({
    ...publishInput,
    run: fixture.run(2, { conclusion: 'failure' }),
    jobs: [fixture.job(21, 'prepare'), fixture.publishJob(22, 'propagation')],
    publishLog: fixture.oidcPublishLog({ outcome: 'propagation' }),
  });
  assert.equal(timedOut.observed.workflowReadBack.status, 'failed-registry-propagation');
  assert.equal(timedOut.observed.workflowReadBack.retries, 1);
  assert.throws(() => r1Exit.bindPublish({ ...publishInput, publishLog: fixture.oidcPublishLog({ outcome: 'no-recheck' }) }), r1ExitCode('R1_EXIT_RUN_INVALID'));

  const prior = { kind: 'later', latest: '0.1.0-rc.1', next: '0.1.0-rc.1' };
  const view = { ...fixture.view, distTags: { latest: '0.1.0-rc.1', next: '0.1.0-rc.2' }, versions: ['0.1.0-rc.1', '0.1.0-rc.2'] };
  const bindRegistry = (overrides) => r1Exit.bindRegistry({ dryRun, view, attestations: fixture.attestationDocument(), consumer: fixture.consumer, publishRunId: 2, prior, ...overrides });
  const registry = bindRegistry();
  assert.deepEqual(registry.prior, prior);
  assert.throws(() => bindRegistry({ view: { ...view, distTags: { latest: '0.1.0-rc.2', next: '0.1.0-rc.2' } } }), r1ExitCode('R1_EXIT_LATEST_UNEXPECTED'));
  assert.throws(() => bindRegistry({ view: { ...view, distTags: { ...view.distTags, beta: '0.1.0-rc.2' } } }), r1ExitCode('R1_EXIT_LATEST_UNEXPECTED'));
  assert.throws(() => bindRegistry({ view: { ...view, versions: ['0.1.0-rc.2'] } }), r1ExitCode('R1_EXIT_VERSIONS_UNEXPECTED'));
  assert.throws(() => bindRegistry({ prior: { kind: 'first' } }), r1ExitCode('R1_EXIT_LATEST_UNEXPECTED'), 'a first-publish expectation rejects a moved latest');

  const ref = { path: 'tests/evidence/r1-exit-0.1.0-rc.2/x', sha256: `sha256:${'0'.repeat(64)}` };
  const phase = (value) => ({ ...value, captureTimestamp: 't', proofTool: {} });
  const verification = { phases: { dryRun: phase(dryRun), publish: phase(publish), registry: phase(registry) }, sourceRevision: fixture.head, sourceTree: fixture.tree, proofTool: {} };
  const records = Object.fromEntries(Object.entries(r1Exit.buildRoute(verification, { validation: ref, manifest: ref, registry: ref })).map(([id, text]) => [id, JSON.parse(text)]));
  assert.equal(records['E-R1-EXIT-02'].outcome, 'pass');
  assert.equal(records['E-R1-EXIT-02'].prePublication.verifyCredentials, undefined);
  assert.equal(records['E-R1-EXIT-04'].distTags.latest.observed, '0.1.0-rc.1');
  assert.match(records['E-R1-EXIT-04'].distTags.latest.setBy, /^unchanged by this publish/u);
  assert.equal(records['E-R1-EXIT-04'].distTags.latest.claimed, false);
  assert.ok(records['E-R1-EXIT-01'].nonClaims.some((claim) => claim.includes('0.1.0-rc.2 claims none')));
});

test('R1 exit capture routes each candidate version to its own evidence root', async () => {
  assert.equal(r1Exit.routeFor('0.1.0-rc.1'), 'tests/evidence/r1-exit');
  assert.equal(r1Exit.route, 'tests/evidence/r1-exit');
  assert.equal(r1Exit.routeFor('0.1.0-rc.2'), 'tests/evidence/r1-exit-0.1.0-rc.2');
  for (const invalid of ['0.1.0-rc.0', '../r1-exit', '0.1.0']) assert.throws(() => r1Exit.routeFor(invalid), r1ExitCode('R1_EXIT_ARGUMENT_INVALID'));

  const root = await mkdtemp(join(tmpdir(), 'muxui-r1-exit-route-'));
  try {
    // A real npm-candidate artifact for 0.1.0-rc.2, as gh run download leaves it.
    const version = '0.1.0-rc.2';
    const exportsMap = { '.': './generated/index.mjs', './styles.css': './generated/styles.css' };
    const packageRoot = join(root, 'pack/package');
    await mkdir(join(packageRoot, 'generated'), { recursive: true });
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: '@muxui/react', version, exports: exportsMap }));
    await writeFile(join(packageRoot, 'generated/index.mjs'), 'export {};\n');
    await writeFile(join(packageRoot, 'generated/styles.css'), '\n');
    execFileSync('tar', ['-czf', join(root, 'candidate.tgz'), '-C', join(root, 'pack'), 'package']);
    const fixture = r1ExitFixture({ version, tarballBytes: await readFile(join(root, 'candidate.tgz')) });
    const requested = [];
    const github = {
      run: (id) => {
        requested.push(id);
        return fixture.run(id);
      },
      jobs: () => fixture.dryRunInput.jobs,
      log: () => fixture.dryRunInput.prepareLog,
      tree: () => fixture.tree,
      approvals: () => [],
      download: (_runId, directory) => {
        copyFileSync(join(root, 'candidate.tgz'), join(directory, `muxui-react-${version}.tgz`));
        writeFileSync(join(directory, `muxui-react-${version}.release-manifest.json`), fixture.artifact.manifest.bytes);
        return true;
      },
    };
    const argv = (out, requestedVersion) => ['--rehearsal', `--out=${out}`, `--version=${requestedVersion}`, '--capture-timestamp=2026-10-05T10:00:00Z', '--dry-run-run=1'];

    const mismatch = join(root, 'out-mismatch');
    await assert.rejects(r1Exit.main(argv(mismatch, '0.1.0-rc.3'), github), r1ExitCode('R1_EXIT_VERSION_MISMATCH'));
    await assert.rejects(readdir(mismatch), { code: 'ENOENT' }, 'a version mismatch writes nothing');

    const out = join(root, 'out');
    await r1Exit.main(argv(out, version), github);
    assert.deepEqual([...new Set(requested)], [1], 'no verify-credentials run is fetched for a fix-forward rc');
    const index = JSON.parse(await readFile(join(out, 'index.json'), 'utf8'));
    assert.ok([...index.artifacts, ...index.records, index.validation].every(({ path }) => path.startsWith('tests/evidence/r1-exit-0.1.0-rc.2/')));
    assert.ok(!index.artifacts.some(({ path }) => path.includes('verify-credentials')));
    const verification = JSON.parse(await readFile(join(out, 'verification.json'), 'utf8'));
    assert.match(verification.captureProcedure, /--version=0\.1\.0-rc\.2 /u);
    assert.match(await readFile(join(out, 'README.md'), 'utf8'), /^# R1 exit retained publication evidence for 0\.1\.0-rc\.2\n/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('R1 exit capture refuses a route or existing capture that belongs to another candidate version', async () => {
  const fixture = r1ExitFixture();
  const unused = new Proxy({}, { get: () => () => assert.fail('no hosted read before the version guard') });
  const timestamp = '--capture-timestamp=2026-10-05T10:00:00Z';
  // --out naming another version's route, including rc.1's committed route.
  for (const [version, out] of [['0.1.0-rc.2', 'tests/evidence/r1-exit'], ['0.1.0-rc.1', 'tests/evidence/r1-exit-0.1.0-rc.2'], ['0.1.0-rc.3', 'tests/evidence/r1-exit-0.1.0-rc.2']]) {
    await assert.rejects(r1Exit.main([`--version=${version}`, `--out=${join(repositoryRoot, out)}`, timestamp, '--registry'], unused), r1ExitCode('R1_EXIT_VERSION_MISMATCH'), `${version} into ${out}`);
  }
  // An existing capture of rc.1 cannot be continued as rc.2, and stays unchanged.
  const root = await mkdtemp(join(tmpdir(), 'muxui-r1-exit-guard-'));
  try {
    const out = join(root, 'r1-exit');
    await seedR1ExitRoute(out, fixture);
    const before = await snapshotTree(out);
    await assert.rejects(r1Exit.main(['--rehearsal', `--out=${out}`, '--version=0.1.0-rc.2', timestamp, '--publish-run=2'], unused), r1ExitCode('R1_EXIT_VERSION_MISMATCH'));
    assert.deepEqual(await snapshotTree(out), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// BL1 close-out: the E-BL1-09 boundary audit can fail. Each control runs one check over history known to break it, or
// gives a predicate an input it must reject, and names the legs of the check that must fail; the other legs must hold.
// A leg with no control proves nothing, so every leg needs one. This needs the full git history, which CI fetches.
test('the BL1 boundary audit fails exactly the legs each negative control names, and every leg has a control', async () => {
  const { checkIds, checkLegs, checksWithoutControl, legsWithoutControl, negativeControls, runNegativeControls } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  assert.deepEqual(checksWithoutControl(), [], 'every audit check has a negative control');
  assert.deepEqual(legsWithoutControl(), {}, 'every leg of every check has a negative control');
  assert.ok(negativeControls.every(({ check, failingLegs }) => checkIds.includes(check) && failingLegs.every((leg) => checkLegs[check].includes(leg))), 'every control names a real check and legs');
  const results = runNegativeControls();
  assert.deepEqual(results.map(({ id }) => id), negativeControls.map(({ id }) => id));
  for (const { id, rejected, accepted, expectedFailingLegs, failingLegs } of results) {
    assert.deepEqual(failingLegs, expectedFailingLegs, `${id}: exactly the named legs fail`);
    assert.equal(rejected, true, `${id}: the check rejects its control`);
    // A function control also names an input the check must accept, so a predicate that rejects everything fails here.
    if (accepted !== null) assert.equal(accepted, true, `${id}: the check accepts the shipped input`);
  }
});

test('the BL1 close-out scope check is skipped only for a growth capture', async () => {
  const { auditBoundary } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  const only = ['closeout-scope', 'react-package-manifest'];
  assert.deepEqual(auditBoundary({ offline: true, only }).checks.map(({ id }) => id), ['react-package-manifest', 'closeout-scope']);
  assert.deepEqual(auditBoundary({ offline: true, only, closeoutBase: null }).checks.map(({ id }) => id), ['react-package-manifest']);
});

// The page widths live only in code (Decision 0029): the capture imports apps/docs/src/lib/block-presets.ts, and a retained capture
// is held to the list that file has at the capture's own source revision. No decision text is read.
const pageWidthsSource = 'apps/docs/src/lib/block-presets.ts';

/** The `pageWidths` list in the source of the docs presets module. */
function parsePageWidths(source) {
  const body = /export const pageWidths = \[([^\]]*)\] as const;/u.exec(source)?.[1];
  assert.ok(body !== undefined, `${pageWidthsSource} exports pageWidths as a literal list`);
  return [...body.matchAll(/\d+/gu)].map(([width]) => Number(width));
}
const pageWidthsAt = (revision) => parsePageWidths(readAtRevision(repositoryRoot, revision, pageWidthsSource).toString('utf8'));

test('the BL1 page widths are the list in the docs presets module, read at the capture\'s own revision', async () => {
  const { pageWidths } = await import('../../../../apps/docs/src/lib/block-presets.ts');
  assert.deepEqual(parsePageWidths(await readFile(join(repositoryRoot, pageWidthsSource), 'utf8')), [...pageWidths], 'the list the integrity test reads from code is the list the capture imports');
  assert.ok(pageWidths.length > 0);
  assert.deepEqual(parsePageWidths('export const pageWidths = [320, 640] as const;'), [320, 640]);
  assert.throws(() => parsePageWidths('export const widths = [1];'), /exports pageWidths as a literal list/u);
});

// BL1 close-out: the capture's refusals and carry-forwards, on throwaway repositories.
const gitIn = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();

async function commitFiles(cwd, files, message) {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(cwd, path, '..'), { recursive: true });
    await writeFile(join(cwd, path), text);
  }
  gitIn(cwd, 'add', '-A');
  gitIn(cwd, 'commit', '-q', '-m', message);
  return gitIn(cwd, 'rev-parse', 'HEAD');
}

/** A repository with main at `source` (origin/main points there), `reviewed` before it, and `branch` off main, not in main. */
async function reviewRepository() {
  const cwd = await mkdtemp(join(tmpdir(), 'muxui-bl1-support-'));
  gitIn(cwd, 'init', '-q', '-b', 'main');
  const reviewed = await commitFiles(cwd, { 'tests/evidence/capture-bl1.mjs': 'v1\n', 'a.txt': 'a\n' }, 'reviewed');
  const source = await commitFiles(cwd, { 'tests/evidence/capture-bl1.mjs': 'v2\n', 'b.txt': 'b\n' }, 'source');
  gitIn(cwd, 'update-ref', 'refs/remotes/origin/main', source);
  gitIn(cwd, 'checkout', '-q', '-b', 'feature');
  const branch = await commitFiles(cwd, { 'c.txt': 'c\n' }, 'branch only');
  gitIn(cwd, 'checkout', '-q', 'main');
  return { cwd, reviewed, source, branch, sourceTree: gitIn(cwd, 'rev-parse', `${source}^{tree}`) };
}

test('the BL1 capture refuses a source revision that is not in main\'s history', async () => {
  const { assertDurableSource } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const { cwd, reviewed, source, branch } = await reviewRepository();
  try {
    assertDurableSource({ cwd, revision: source });
    assertDurableSource({ cwd, revision: reviewed });
    assert.throws(() => assertDurableSource({ cwd, revision: branch }), /EVIDENCE_SOURCE_NOT_DURABLE/u);
    // With no main to compare, it fails closed rather than passing.
    gitIn(cwd, 'update-ref', '-d', 'refs/remotes/origin/main');
    assert.throws(() => assertDurableSource({ cwd, revision: source }), /EVIDENCE_SOURCE_NOT_DURABLE/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a BL1 review is retained with its own revision and tree, compared with the source, and reused only while its digest holds', async () => {
  const { retainReview } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const { cwd, reviewed, source, branch, sourceTree } = await reviewRepository();
  const outputRoot = await mkdtemp(join(tmpdir(), 'muxui-bl1-support-out-'));
  const root = 'tests/evidence/bl1';
  const artifactPath = `${root}/artifacts/E-BL1-09-exit-review.md`;
  const record = (revision, extra = '') => `# Review\n\n**Reviewer:** an independent reviewer, not the author.\n**Revision:** \`${revision.slice(0, 8)}\`\n${extra}Trailing spaces stay.  \n\n## Verdict\n\nholds\n`;
  const write = async (name, text) => {
    await writeFile(join(outputRoot, name), text);
    return join(outputRoot, name);
  };
  const base = { cwd, outputRoot, root, id: 'E-BL1-09', artifactPath, previousKey: 'exitReview', sourceRevision: source, sourceTree, proofToolPaths: ['tests/evidence/capture-bl1.mjs', 'tests/evidence/proof.mjs'] };
  try {
    // A review of an earlier revision: its tree differs, and the tool that changed since is named.
    const input = await write('review.md', record(reviewed, `Local path ${cwd}/x and /Users/someone/y.\n`));
    const earlier = await retainReview({ ...base, required: true, input, reviewedRevision: reviewed });
    assert.equal(earlier.reviewedRevisionDiffersFromSource, true);
    assert.equal(earlier.reviewedRevisionInMainHistory, true);
    assert.equal(earlier.reviewedTree, gitIn(cwd, 'rev-parse', `${reviewed}^{tree}`));
    assert.equal(earlier.comparison.equalTrees, false);
    assert.deepEqual(earlier.comparison.changedPaths, ['b.txt', 'tests/evidence/capture-bl1.mjs']);
    assert.deepEqual(earlier.comparison.proofToolsChangedSinceReviewed, ['tests/evidence/capture-bl1.mjs']);
    // Only local paths change, and each kind is counted; every other byte, including trailing spaces, is kept.
    assert.deepEqual(earlier.sanitization.replacements, { repositoryRoot: 1, temporary: 0, home: 1 });
    assert.ok(earlier.text.includes('Local path <repo>/x and <home>/y.'));
    assert.ok(earlier.text.includes('Trailing spaces stay.  \n'));
    assert.equal(earlier.reviewer, 'an independent reviewer, not the author.');
    assert.equal(earlier.verdictText, 'holds');

    // A review of the source revision itself compares equal, and a revision only on a branch is not in main's history.
    const same = await retainReview({ ...base, required: true, input: await write('same.md', record(source)), reviewedRevision: source });
    assert.deepEqual([same.reviewedRevisionDiffersFromSource, same.comparison.equalTrees, same.comparison.proofToolsChangedSinceReviewed], [false, true, []]);
    const onBranch = await retainReview({ ...base, required: true, input: await write('branch.md', record(branch)), reviewedRevision: branch });
    assert.equal(onBranch.reviewedRevisionInMainHistory, false);
    // A revision this repository does not hold cannot be compared, and says so.
    const absent = 'f'.repeat(40);
    const unknown = await retainReview({ ...base, required: true, input: await write('absent.md', record(absent)), reviewedRevision: absent });
    assert.deepEqual([unknown.reviewedTree, unknown.comparison, unknown.reviewedRevisionInMainHistory], [null, null, false]);

    // Refusals: a short revision, a record that does not name its revision, and one that names no reviewer.
    await assert.rejects(retainReview({ ...base, required: true, input, reviewedRevision: reviewed.slice(0, 8) }), /full 40-character revision/u);
    await assert.rejects(retainReview({ ...base, required: true, input: await write('other.md', record(source)), reviewedRevision: reviewed }), /does not name the revision/u);
    await assert.rejects(retainReview({ ...base, required: true, input: await write('anon.md', `no reviewer\n${reviewed.slice(0, 8)}\n`), reviewedRevision: reviewed }), /does not name its reviewer/u);

    // Absent: required throws, optional returns null. Present: the retained review is reused until its bytes change.
    await assert.rejects(retainReview({ ...base, required: true }), /required and none is retained/u);
    assert.equal(await retainReview({ ...base, required: false }), null);
    await mkdir(join(outputRoot, root, 'artifacts'), { recursive: true });
    await writeFile(join(outputRoot, artifactPath), earlier.text);
    const { text: _text, ...retained } = earlier;
    await writeFile(join(outputRoot, root, 'artifacts/E-BL1-09.json'), JSON.stringify({ observations: { exitReview: retained } }));
    const reused = await retainReview({ ...base, required: true });
    assert.equal(reused.artifact.sha256, earlier.artifact.sha256);
    assert.equal(reused.reviewedRevision, reviewed);
    assert.deepEqual(reused.comparison, earlier.comparison);
    await writeFile(join(outputRoot, artifactPath), `${earlier.text}tampered`);
    await assert.rejects(retainReview({ ...base, required: true }), /no longer matches its recorded digest/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('a BL1 capture that replaces an earlier one keeps it in the tree and names it, and a rerun carries the reference forward', async () => {
  const { archiveSupersededCapture, supersededFiles } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const outputRoot = await mkdtemp(join(tmpdir(), 'muxui-bl1-supersede-'));
  const root = 'tests/evidence/bl1';
  const revisionA = 'a'.repeat(40);
  const revisionB = 'b'.repeat(40);
  const revisionC = 'c'.repeat(40);
  const put = async (path, text) => {
    await mkdir(join(outputRoot, path, '..'), { recursive: true });
    await writeFile(join(outputRoot, path), text);
    return Buffer.from(text);
  };
  /** Writes a capture of two records at `revision`, each with its artifact and an excerpt, as the capture tool lays it out. */
  async function writeCapture(revision, supersedes = new Map()) {
    const bytes = {};
    for (const id of ['E-BL1-08', 'E-BL1-11']) {
      const artifact = await put(`${root}/artifacts/${id}.json`, JSON.stringify({ assertionId: id, revision }));
      await put(`${root}/validation/${id}.txt`, `excerpt ${id} ${revision}\n`);
      bytes[id] = await put(`${root}/records/${id}.json`, JSON.stringify({ assertionId: id, sourceRevision: revision, artifact: { path: `${root}/artifacts/${id}.json`, sha256: digest(artifact) }, ...(supersedes.has(id) ? { supersedes: supersedes.get(id) } : {}) }));
    }
    await put(`${root}/index.json`, JSON.stringify({ sourceRevision: revision }));
    await put(`${root}/verification.json`, JSON.stringify({ sourceRevision: revision }));
    return bytes;
  }
  try {
    // Nothing on disk: nothing to supersede.
    assert.equal((await archiveSupersededCapture({ outputRoot, root, sourceRevision: revisionA })).size, 0);

    // Capture B replaces capture A: A is copied byte for byte, and each new record names its predecessor.
    const bytesA = await writeCapture(revisionA);
    const first = await archiveSupersededCapture({ outputRoot, root, sourceRevision: revisionB });
    const archiveA = `${root}/superseded/${'a'.repeat(12)}`;
    assert.deepEqual(first.get('E-BL1-08'), { path: `${archiveA}/records/E-BL1-08.json`, sha256: digest(bytesA['E-BL1-08']), sourceRevision: revisionA });
    assert.deepEqual(await readFile(join(outputRoot, first.get('E-BL1-11').path)), bytesA['E-BL1-11']);
    const archived = (await supersededFiles({ outputRoot, root })).map(({ path }) => path);
    assert.deepEqual(archived, [
      'artifacts/E-BL1-08.json', 'artifacts/E-BL1-11.json', 'index.json', 'records/E-BL1-08.json', 'records/E-BL1-11.json',
      'validation/E-BL1-08.txt', 'validation/E-BL1-11.txt', 'verification.json',
    ].map((path) => `${archiveA}/${path}`));
    assert.ok((await supersededFiles({ outputRoot, root })).every(({ sha256 }) => /^sha256:[0-9a-f]{64}$/u.test(sha256)));

    // The tool then replaces the records at B; a rerun at B copies nothing and carries the references forward.
    const bytesB = await writeCapture(revisionB, first);
    const rerun = await archiveSupersededCapture({ outputRoot, root, sourceRevision: revisionB });
    assert.deepEqual([...rerun], [...first]);
    assert.equal((await supersededFiles({ outputRoot, root })).length, 8, 'a rerun archives nothing new');

    // Capture C replaces B: B is archived with its own reference to A, so the chain stays walkable.
    const second = await archiveSupersededCapture({ outputRoot, root, sourceRevision: revisionC });
    assert.equal(second.get('E-BL1-08').path, `${root}/superseded/${'b'.repeat(12)}/records/E-BL1-08.json`);
    assert.equal(second.get('E-BL1-08').sha256, digest(bytesB['E-BL1-08']));
    assert.deepEqual(JSON.parse(await readFile(join(outputRoot, second.get('E-BL1-08').path), 'utf8')).supersedes, first.get('E-BL1-08'));
    assert.equal((await supersededFiles({ outputRoot, root })).length, 16);
    // The records on disk are still B's, so a second archive of B is refused rather than overwritten.
    await assert.rejects(archiveSupersededCapture({ outputRoot, root, sourceRevision: revisionC }), /BL1_SUPERSEDE_EXISTS/u);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }

  // An earlier capture that does not verify, or that binds two revisions, is not archived.
  for (const [label, damage, pattern] of [
    ['an artifact that no longer matches its record', { 'E-BL1-08': { artifact: 'changed' } }, /BL1_SUPERSEDE_UNVERIFIED/u],
    ['records that bind two revisions', { 'E-BL1-11': { revision: revisionC } }, /BL1_SUPERSEDE_MIXED/u],
  ]) {
    const directory = await mkdtemp(join(tmpdir(), 'muxui-bl1-supersede-'));
    try {
      for (const id of ['E-BL1-08', 'E-BL1-11']) {
        const artifact = JSON.stringify({ id });
        await mkdir(join(directory, root, 'artifacts'), { recursive: true });
        await mkdir(join(directory, root, 'records'), { recursive: true });
        await writeFile(join(directory, root, `artifacts/${id}.json`), damage[id]?.artifact ?? artifact);
        await writeFile(join(directory, root, `records/${id}.json`), JSON.stringify({ assertionId: id, sourceRevision: damage[id]?.revision ?? revisionA, artifact: { path: `${root}/artifacts/${id}.json`, sha256: digest(Buffer.from(artifact)) } }));
      }
      await assert.rejects(archiveSupersededCapture({ outputRoot: directory, root, sourceRevision: revisionB }), pattern, label);
      assert.equal((await supersededFiles({ outputRoot: directory, root })).length, 0, `${label}: nothing was archived`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

// BL1 growth: a later block edits the regression thresholds, so an index pins them at the revision it binds.
test('an index pins a revision-bound input at its source revision, so a later edit leaves retained evidence valid', async () => {
  const thresholds = 'tests/evidence/bl1/regression-thresholds.json';
  assert.ok(REVISION_BOUND_INPUTS.has(thresholds), 'the BL1 regression thresholds are revision-bound');
  const cwd = await mkdtemp(join(tmpdir(), 'muxui-bound-input-'));
  const outside = await mkdtemp(join(tmpdir(), 'muxui-bound-input-rehearsal-'));
  try {
    gitIn(cwd, 'init', '-q', '-b', 'main');
    const bound = canonicalJson({ queries: ['poster grid'] });
    const revision = await commitFiles(cwd, { [thresholds]: bound }, 'thresholds at capture');
    const indexText = (sha256 = digest(bound), sourceRevision = revision) => canonicalJson({
      artifacts: [{ path: thresholds, sha256 }],
      schema: 'muxui-evidence-index-v1',
      sourceRevision,
      sourceTree: '1'.repeat(40),
    });
    const indexPath = join(cwd, 'tests/evidence/bl1/index.json');
    await writeFile(indexPath, indexText());
    assert.equal((await verifyEvidence(cwd)).artifactCount, 1);

    // A growth block edits the file, uncommitted and then committed: the index still verifies against the bound revision.
    await writeFile(join(cwd, thresholds), canonicalJson({ queries: ['poster grid', 'scratch sample'] }));
    assert.equal((await verifyEvidence(cwd)).artifactCount, 1, 'an uncommitted edit');
    await commitFiles(cwd, {}, 'growth block');
    assert.equal((await verifyEvidence(cwd)).artifactCount, 1, 'a committed edit');

    // The digest must still be the bound revision's bytes, and the revision must be a full one this repository holds.
    await writeFile(indexPath, indexText(digest(Buffer.from('other'))));
    await assert.rejects(verifyEvidence(cwd), /EVIDENCE_DIGEST_MISMATCH/u);
    await writeFile(indexPath, indexText(digest(bound), 'f'.repeat(40)));
    await assert.rejects(verifyEvidence(cwd), /EVIDENCE_REVISION_UNAVAILABLE/u);
    await writeFile(indexPath, indexText(digest(bound), 'main'));
    await assert.rejects(verifyEvidence(cwd), /EVIDENCE_REFERENCE_INVALID/u);

    // A rehearsal tree outside the repository reads the objects of gitRoot, and has none of its own.
    await mkdir(join(outside, 'tests/evidence/bl1'), { recursive: true });
    await writeFile(join(outside, 'tests/evidence/bl1/index.json'), indexText());
    assert.equal((await verifyEvidence(outside, { gitRoot: cwd })).artifactCount, 1);
    await assert.rejects(verifyEvidence(outside), /EVIDENCE_REVISION_UNAVAILABLE/u);
    assert.equal(readAtRevision(cwd, revision, thresholds).toString('utf8'), bound);

    // Any other artifact is still read from the working tree.
    await mkdir(join(cwd, 'tests/evidence/bl1/artifacts'), { recursive: true });
    await writeFile(join(cwd, 'tests/evidence/bl1/artifacts/a.json'), '{}');
    await writeFile(indexPath, canonicalJson({ artifacts: [{ path: 'tests/evidence/bl1/artifacts/a.json', sha256: digest('{}') }], schema: 'muxui-evidence-index-v1', sourceRevision: revision, sourceTree: '1'.repeat(40) }));
    assert.equal((await verifyEvidence(cwd)).artifactCount, 1);
    await writeFile(join(cwd, 'tests/evidence/bl1/artifacts/a.json'), '{"edited":true}');
    await assert.rejects(verifyEvidence(cwd), /EVIDENCE_DIGEST_MISMATCH/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('a capture reads the thresholds as committed at a revision, and lists what a block changed in them', async () => {
  const { readThresholds, loadThresholds, thresholdChanges, thresholdsPath } = await import('../../../../tests/evidence/bl1/regression.mjs');
  // The revision a capture binds holds the thresholds it measured, whatever the working tree has now.
  const bound = JSON.parse(await readFile(join(repositoryRoot, 'tests/evidence/bl1/index.json'), 'utf8')).sourceRevision;
  assert.deepEqual(await readThresholds(bound), readAtRevision(repositoryRoot, bound, thresholdsPath));
  assert.equal((await loadThresholds(bound)).schema, 'muxui-bl1-regression-thresholds-v1');
  await assert.rejects(readThresholds('f'.repeat(40)), /EVIDENCE_REVISION_UNAVAILABLE/u);

  const before = {
    discovery: { minimumMeanPrecisionAt3: 0.5, queries: [{ query: 'collections', expectedId: 'x', expectedWithin: 3 }, { query: 'hero', expectedFirst: 'h' }, { query: 'old', expectedFirst: 'o' }] },
    search: { maximumDisplacedComponentQueries: 0 },
    seedSet: ['x', 'h'],
  };
  assert.deepEqual(thresholdChanges(before, structuredClone(before)), { addedQueries: [], removedQueries: [], revisedQueries: [], changedValues: [], seedSet: { added: [], removed: [] } });
  const after = structuredClone(before);
  after.discovery.queries[0].expectedWithin = 5;
  after.discovery.queries.splice(2, 1);
  after.discovery.queries.push({ query: 'scratch sample', expectedFirst: 's' });
  after.discovery.minimumMeanPrecisionAt3 = 0.4;
  after.search.maximumDisplacedComponentQueries = 1;
  after.seedSet = ['x', 'h', 's'];
  assert.deepEqual(thresholdChanges(before, after), {
    addedQueries: ['scratch sample'],
    removedQueries: ['old'],
    revisedQueries: [{ query: 'collections', before: before.discovery.queries[0], after: after.discovery.queries[0] }],
    changedValues: [
      { path: 'discovery.minimumMeanPrecisionAt3', before: '0.5', after: '0.4' },
      { path: 'search.maximumDisplacedComponentQueries', before: '0', after: '1' },
    ],
    seedSet: { added: ['s'], removed: [] },
  });
});

// BL1 growth: a growth capture builds on a retained close-out capture and must add a block to it.
test('a growth capture needs a retained close-out capture and a block that capture did not measure', async () => {
  const { assertGrowthSource, retainedCaptures } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const root = 'tests/evidence/bl1';
  const evidenceRoot = await mkdtemp(join(tmpdir(), 'muxui-bl1-growth-'));
  const id = (name) => `muxui:pattern:${name}`;
  const capture = async (directory, scope, revision, names) => {
    await mkdir(join(evidenceRoot, directory, 'artifacts'), { recursive: true });
    await writeFile(join(evidenceRoot, directory, 'verification.json'), JSON.stringify({ ...(scope === undefined ? {} : { scope }), sourceRevision: revision }));
    await writeFile(join(evidenceRoot, directory, 'artifacts/E-BL1-11.json'), JSON.stringify({ observations: { measured: { denseBudgets: { patterns: names.map((name) => ({ id: id(name) })) } } } }));
  };
  const growth = (...names) => assertGrowthSource({ evidenceRoot, root, patternIds: names.map(id) });
  try {
    await assert.rejects(growth('a', 'b'), /BL1_GROWTH_NO_CLOSEOUT/u, 'nothing is retained');

    // A capture older than scopes, and a growth capture alone, are not a close-out.
    await capture(`${root}/superseded/${'0'.repeat(12)}`, undefined, '0'.repeat(40), ['a']);
    await capture(root, 'growth', 'b'.repeat(40), ['a', 'b']);
    await assert.rejects(growth('a', 'b', 'c'), /BL1_GROWTH_NO_CLOSEOUT/u);

    // The close-out is current: the catalog must have a pattern it did not measure.
    await capture(root, 'close-out', 'a'.repeat(40), ['a']);
    await assert.rejects(growth('a'), /BL1_GROWTH_NO_BLOCK/u);
    const added = await growth('a', 'b');
    assert.deepEqual([added.closeout.directory, added.closeout.sourceRevision, added.added], [root, 'a'.repeat(40), [id('b')]]);

    // A first growth capture replaced the close-out and archived it; a later one, or a rerun of the first, still builds on that close-out.
    const archive = `${root}/superseded/${'a'.repeat(12)}`;
    await capture(archive, 'close-out', 'a'.repeat(40), ['a']);
    await capture(root, 'growth', 'b'.repeat(40), ['a', 'b']);
    assert.deepEqual((await retainedCaptures({ outputRoot: evidenceRoot, root })).map(({ directory, scope }) => [directory, scope]), [[root, 'growth'], [`${root}/superseded/${'0'.repeat(12)}`, undefined], [archive, 'close-out']]);
    for (const names of [['a', 'b'], ['a', 'b', 'c']]) {
      const next = await growth(...names);
      assert.deepEqual([next.closeout.directory, next.added], [archive, names.slice(1).map(id)]);
    }
    await assert.rejects(growth('a'), /BL1_GROWTH_NO_BLOCK/u, 'the close-out set alone is not growth');
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

// A duplicate query key would be merged by a comparison keyed by query, while measurement counts every entry.
test('BL1 threshold queries are unique, so a comparison and a measurement see the same entries', async () => {
  const { assertUniqueQueries, loadThresholds, measureRegression, parseThresholds, thresholdChanges } = await import('../../../../tests/evidence/bl1/regression.mjs');
  const thresholds = await loadThresholds();
  assertUniqueQueries(thresholds);
  const [first] = thresholds.discovery.queries;
  const duplicated = structuredClone(thresholds);
  duplicated.discovery.queries.push({ ...first, relevant: [] });
  const refused = /BL1_THRESHOLDS_DUPLICATE_QUERY: the discovery query "poster grid" is listed more than once/u;
  assert.throws(() => assertUniqueQueries(duplicated), refused);
  assert.throws(() => parseThresholds(Buffer.from(JSON.stringify(duplicated))), refused);
  assert.throws(() => thresholdChanges(thresholds, duplicated), refused);
  assert.throws(() => thresholdChanges(duplicated, thresholds), refused);
  assert.throws(() => measureRegression({ api: null, baselineApi: null, thresholds: duplicated }), refused, 'measurement refuses before it reads the catalog');
});

// A rehearsal copies the retained evidence over its destination, so a destination that overlaps the evidence must be refused first.
test('a BL1 rehearsal starts from a copy of the retained evidence and refuses a destination that overlaps it', async () => {
  const { seedRehearsal } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const root = 'tests/evidence/bl1';
  const base = await mkdtemp(join(tmpdir(), 'muxui-bl1-seed-'));
  const repo = join(base, 'repo');
  const retained = join(repo, root);
  const intact = async () => {
    assert.equal(await readFile(join(retained, 'index.json'), 'utf8'), '{"retained":true}', 'the retained evidence is untouched');
    assert.equal(await readFile(join(retained, 'records/a.json'), 'utf8'), 'a');
  };
  try {
    await mkdir(join(retained, 'records'), { recursive: true });
    await writeFile(join(retained, 'index.json'), '{"retained":true}');
    await writeFile(join(retained, 'records/a.json'), 'a');
    await symlink(repo, join(base, 'link-to-repo'));
    await mkdir(join(base, 'tests-link'), { recursive: true });
    await symlink(join(repo, 'tests'), join(base, 'tests-link/tests'));

    // Each destination overlaps the retained evidence: the repository itself (what `--rehearsal=.` resolves to), its parent, a
    // directory inside the evidence, a symlink to the repository, a path that reaches the evidence through a symlink and does not exist yet,
    // and a destination whose own `tests` is a symlink into the repository.
    for (const [label, destination] of [
      ['the repository', repo],
      ['its parent', base],
      ['inside the evidence', join(retained, 'out')],
      ['a symlink to the repository', join(base, 'link-to-repo')],
      ['a missing path through a symlink', join(base, 'link-to-repo', root, 'not-yet')],
      ['a destination whose tests is a symlink', join(base, 'tests-link')],
    ]) {
      await assert.rejects(seedRehearsal({ repositoryRoot: repo, destination, root }), /BL1_REHEARSAL_OVERLAP/u, label);
      await intact();
    }

    // A directory outside the evidence, existing or not, receives a copy, and a rerun replaces what an earlier rehearsal left.
    const destination = join(base, 'rehearsal');
    await seedRehearsal({ repositoryRoot: repo, destination, root });
    assert.equal(await readFile(join(destination, root, 'records/a.json'), 'utf8'), 'a');
    await writeFile(join(destination, root, 'stale.json'), 'stale');
    await seedRehearsal({ repositoryRoot: repo, destination, root });
    assert.deepEqual((await readdir(join(destination, root))).sort(), ['index.json', 'records']);
    // A directory inside the repository but outside the evidence is allowed.
    await seedRehearsal({ repositoryRoot: repo, destination: join(repo, 'scratch'), root });
    assert.equal(await readFile(join(repo, 'scratch', root, 'index.json'), 'utf8'), '{"retained":true}');
    await intact();
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

// BL1: each retained capture is checked against what it derives from its own source revision, read through git objects so a
// later edit to the catalog, the thresholds, or the browser test routes never changes what a record bound. A close-out capture
// is also held to the exact close-out pins. The current capture is at tests/evidence/bl1; an earlier one that a later capture
// replaced is archived at tests/evidence/bl1/superseded/<revision>, with the paths it cites still naming the root it was written to.
const bl1 = 'tests/evidence/bl1';
const closeoutRevision = 'c8f3e7cbc18bebe1a4d6292dddf5dde88875e88b';
const jsonAt = (revision, path) => JSON.parse(readAtRevision(repositoryRoot, revision, path).toString('utf8'));
const gitOut = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();

/** What the catalog declares at `revision`: the patterns, their variant example ids, and the block browser tests the policy routes. */
function catalogAt(revision) {
  const { records } = jsonAt(revision, 'packages/catalog/catalog-sources.json');
  const patterns = records.filter(({ family }) => family === 'pattern').map(({ path }) => jsonAt(revision, path));
  const declared = jsonAt(revision, 'tooling/audits/repository-policy/repository-policy.json').pullRequestImpact.patternBrowserTests ?? {};
  const slugOf = ({ id }) => id.slice('muxui:pattern:'.length);
  return {
    patternIds: patterns.map(({ id }) => id).sort(),
    patternSlugs: patterns.map(slugOf).sort(),
    variantIds: patterns.flatMap(({ variants }) => variants.map(({ example }) => example)).sort(),
    browserTests: patterns.filter((pattern) => declared[slugOf(pattern)] !== undefined).map((pattern) => `packages/react/${declared[slugOf(pattern)]}`).sort(),
  };
}

/** The git tree of `catalog/patterns/<block>` at `revision`, or null when the revision holds no such block. */
function blockTreeAt(revision, block) {
  const result = spawnSync('git', ['rev-parse', `${revision}:catalog/patterns/${block}`], { cwd: repositoryRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const reviewCoverageTool = 'tests/evidence/bl1/capture-support.mjs';

/** The React sources that render nothing, as the capture-support tool bound at `revision` lists them (a literal list of file names). */
function boundNonRenderingSources(revision) {
  const body = /export const nonRenderingReactSources = \[([^\]]*)\]\.map/u.exec(readAtRevision(repositoryRoot, revision, reviewCoverageTool).toString('utf8'))?.[1];
  assert.ok(body !== undefined, `${reviewCoverageTool} at ${revision.slice(0, 8)} lists the React sources that render nothing`);
  return [...body.matchAll(/'([^']+)'/gu)].map(([, name]) => `packages/react/src/${name}`);
}

/**
 * What a review of `block` read at `revision`, derived here from git and not by the capture tool: the block's tree, the catalog record
 * tree of every participant component, and a digest of the path and blob of every file under packages/react/src except `excluded`.
 */
function expectedCoverageKey(revision, block, excluded) {
  const blockTree = blockTreeAt(revision, block);
  if (blockTree === null) return null;
  const participants = [...new Set(jsonAt(revision, `catalog/patterns/${block}/artifact.json`).participants.map(({ component }) => component))].sort().map((component) => {
    const result = spawnSync('git', ['rev-parse', `${revision}:catalog/components/${component.slice('muxui:component:'.length)}`], { cwd: repositoryRoot, encoding: 'utf8' });
    return { component, tree: result.status === 0 ? result.stdout.trim() : null };
  });
  const files = gitOut('ls-tree', '-r', revision, '--', 'packages/react/src').split('\n').map((line) => /^\d+ blob ([0-9a-f]+)\t(.+)$/u.exec(line))
    .filter((match) => match !== null && !excluded.includes(match[2])).map(([, blob, path]) => `${path}\0${blob}\n`).sort();
  return { blockTree, participants, reactRuntime: { root: 'packages/react/src', excluded, files: files.length, digest: digest(files.join('')) } };
}

/** The titles of the cross-engine tests in a browser test file at `revision`: its `test(\`... in ${engine}\`)` declarations. */
function browserTestTitles(revision, file) {
  const titles = [...readAtRevision(repositoryRoot, revision, file).toString('utf8').matchAll(/^\s*test\(`([^`]*?) in \$\{engine\}`/gmu)].map(([, title]) => title);
  assert.ok(titles.length > 0, `${file} declares a test titled "... in \${engine}"`);
  return titles;
}

/** Maps a path a capture cites into the directory that holds the capture; archived copies keep the layout of the root. */
const capturePath = (directory) => (path) => (path.startsWith(`${bl1}/superseded/`) ? path : path.replace(`${bl1}/`, `${directory}/`));

/** Reads the capture in `directory` of the tree `repo`: its index, validation summary, records, and artifacts. */
async function loadCapture({ repo = repositoryRoot, directory = bl1 } = {}) {
  const read = async (path) => JSON.parse(await readFile(join(repo, path), 'utf8'));
  const into = capturePath(directory);
  const index = await read(`${directory}/index.json`);
  const records = {};
  const artifacts = {};
  for (const { assertionId, path } of index.records) {
    records[assertionId] = await read(into(path));
    artifacts[assertionId] = await read(into(records[assertionId].artifact.path));
  }
  return { repo, directory, index, verification: await read(into(index.validation.path)), records, artifacts, retained: new Map(index.artifacts.map(({ path, sha256 }) => [path, sha256])) };
}

/** An archived capture is a byte-for-byte copy: every file its index names is in the archive at that digest. */
async function assertCopyMatchesIndex({ repo = repositoryRoot, directory, index }) {
  const into = capturePath(directory);
  for (const { path, sha256 } of [...index.records, ...index.artifacts, index.validation]) {
    if (REVISION_BOUND_INPUTS.has(path)) continue;
    assert.equal(digest(await readFile(join(repo, into(path)))), sha256, `${directory}: ${path} is archived at the digest its index names`);
  }
}

const growthScopeTool = 'tests/evidence/bl1/growth-scope.mjs';

/** The `digestAffectingPaths` a growth-scope tool source exports: a constant array of string literals. */
function parseGrowthToolPaths(source, label) {
  const body = /export const digestAffectingPaths = \[([^\]]*)\];/u.exec(source)?.[1];
  assert.ok(body !== undefined, `${growthScopeTool} at ${label} exports digestAffectingPaths as an array of string literals`);
  return [...body.matchAll(/'([^']+)'/gu)].map(([, path]) => path);
}

/** The `digestAffectingPaths` the growth-scope tool exports at `revision`, read from its source in git. */
const growthToolPaths = (revision) => parseGrowthToolPaths(readAtRevision(repositoryRoot, revision, growthScopeTool).toString('utf8'), revision.slice(0, 8));

const boundaryAuditTool = 'tests/evidence/bl1/boundary-audit.mjs';

const boundTools = new Map();
const boundToolDirectories = [];
after(() => Promise.all(boundToolDirectories.map((directory) => rm(directory, { recursive: true, force: true }))));

/**
 * The boundary-audit tool as it was at `revision`, imported from a copy of its bytes in git (with the canonical-JSON module it imports,
 * at that revision), so a retained capture is re-derived by the functions that made it and a later change to the tool never changes
 * how an earlier capture is read. Its git reads run in this repository (`cwd`), so only the checks that read git objects apply.
 */
function boundBoundaryAudit(revision) {
  if (!boundTools.has(revision)) {
    boundTools.set(revision, (async () => {
      const directory = await mkdtemp(join(tmpdir(), 'muxui-bl1-bound-tool-'));
      boundToolDirectories.push(directory);
      for (const path of [boundaryAuditTool, 'tooling/audits/repository-policy/src/canonical-json.mjs']) {
        await mkdir(dirname(join(directory, path)), { recursive: true });
        await writeFile(join(directory, path), readAtRevision(repositoryRoot, revision, path));
      }
      return import(pathToFileURL(join(directory, boundaryAuditTool)).href);
    })());
  }
  return boundTools.get(revision);
}

/** The checks the boundary-audit tool scopes to the growth commits at `revision`: each check object that declares a `growthClaim`. */
function growthToolScopedChecks(revision) {
  let current;
  const scoped = [];
  for (const line of readAtRevision(repositoryRoot, revision, boundaryAuditTool).toString('utf8').split('\n')) {
    current = /^    id: '([^']+)',$/u.exec(line)?.[1] ?? current;
    if (/^    growthClaim: /u.test(line)) scoped.push(current);
  }
  assert.ok(scoped.length > 0, `${boundaryAuditTool} at ${revision.slice(0, 8)} scopes checks to the growth commits`);
  return scoped;
}

/** The legs the boundary-audit tool at `revision` records without gating on them for an informational growth capture: each check object's `growthInformational` line. */
function growthToolInformationalLegs(revision) {
  let current;
  const informational = {};
  for (const line of readAtRevision(repositoryRoot, revision, boundaryAuditTool).toString('utf8').split('\n')) {
    current = /^    id: '([^']+)',$/u.exec(line)?.[1] ?? current;
    const body = /^    growthInformational: \[([^\]]*)\],$/u.exec(line)?.[1];
    if (body !== undefined) informational[current] = [...body.matchAll(/'([^']+)'/gu)].map(([, leg]) => leg);
  }
  return informational;
}

/** The non-claim an informational growth record states (Decision 0029): a growth commit may change what it records and the record claims nothing about it. */
const growthNonClaim = /^A growth commit may change @muxui\/react, dependencies, and component records; this record lists what it changed and claims nothing about it\.$/u;

/**
 * A growth capture's E-BL1-08 and E-BL1-09 are scoped to the commits after the retained close-out that added or changed its
 * blocks, so they are derived from git at the capture's own source revision (the first-parent commits that touch a block the
 * close-out did not measure, each against its first parent) and the recorded scope must be those commits. The scoped audit is
 * recomputed from git objects, which later history never changes, and so is everything E-BL1-08 records except its two digests:
 * the added and changed blocks, the excluded sources, and the compiler and schema paths a commit changed must match git exactly.
 * The digests are only checked to agree with each other, because recompiling an old tree with a later compiler would tie a
 * retained record to the compiler of a later day; like the other retained values they are bound by the artifact and index digests.
 * The capture is held to the digest-affecting paths the growth-scope tool bound at its source revision exports, read from git and
 * not from the record, so a record cannot narrow the list; a later change to the list in the tool never fails a retained capture.
 * The same holds for the checks the boundary-audit tool scoped at its source revision, so a later check added to the scope
 * (the workflow and hosting check) does not fail a capture made before it.
 */
async function assertGrowthScope({ sourceRevision, closeoutRevision, toolRevision = sourceRevision, added, verification, artifacts, records, informational = false }) {
  const { growthCommits } = await import('../../../../tests/evidence/bl1/growth-scope.mjs');
  const { auditBoundary } = await boundBoundaryAudit(toolRevision);
  const scopedChecks = growthToolScopedChecks(toolRevision);
  // The legs the bound tool records without gating on them. A capture without `growthGate` has none: every leg gates.
  const boundInformational = informational ? growthToolInformationalLegs(toolRevision) : {};
  if (informational) assert.ok(Object.keys(boundInformational).length > 0, 'the bound boundary-audit tool declares informational legs');
  const catalog = artifacts['E-BL1-08'].observations;
  assert.equal(catalog.baseline, undefined, 'a growth capture does not carry the close-out digest pin');
  const bound = growthToolPaths(toolRevision);
  assert.equal(verification.proofTools.find(({ path }) => path === growthScopeTool)?.sha256, digest(readAtRevision(repositoryRoot, toolRevision, growthScopeTool)), 'E-BL1-08 binds the growth-scope tool at the source revision');
  assert.deepEqual(catalog.growthScope?.digestAffectingPaths, bound, 'E-BL1-08 declares the digest-affecting paths of the bound growth-scope tool');
  const derived = growthCommits({ cwd: repositoryRoot, head: sourceRevision, since: closeoutRevision, patternIds: added, digestPaths: bound });
  assert.ok(derived.length > 0, 'a growth capture follows at least one commit that added a block');
  const short = derived.map(({ commit }) => commit.slice(0, 8));

  const { audit } = artifacts['E-BL1-09'].observations;
  assert.deepEqual(audit.growthScope?.commits.map(({ commit, parent }) => [commit, parent]), derived.map(({ commit, parent }) => [commit, parent]), 'E-BL1-09 audits the commits that added or changed the blocks');
  assert.deepEqual(audit.growthScope.scopedChecks, scopedChecks, 'E-BL1-09 scopes the checks that read @muxui/react, the catalog records, and workflow and hosting files, as the bound tool does');
  if (informational) {
    assert.equal(audit.growthScope.growthGate, 'informational');
    assert.deepEqual(audit.growthScope.informationalLegs, boundInformational, 'E-BL1-09 records the informational legs of the bound tool and no others');
  } else {
    assert.equal(audit.growthScope.growthGate, undefined, 'a capture without growthGate does not claim one');
    assert.equal(audit.growthScope.informationalLegs, undefined, 'a capture without growthGate gates every leg');
  }
  for (const check of audit.checks) {
    assert.deepEqual(check.informationalLegs, boundInformational[check.id], `E-BL1-09: ${check.id} records the informational legs of the bound tool and no others`);
    const scoped = scopedChecks.includes(check.id);
    assert.equal(check.observations.scope, scoped ? 'growth' : undefined, `E-BL1-09: ${check.id} is evaluated ${scoped ? 'across the growth commits' : 'over the range from the pre-BL1 base'}`);
    if (scoped) assert.deepEqual(check.observations.commits.map(({ commit }) => commit), derived.map(({ commit }) => commit), `E-BL1-09: ${check.id} is evaluated across every growth commit`);
  }
  // Every leg is recomputed from git. The gate is read from the bound tool's own list, so a record cannot widen what it records without gating.
  const recomputed = auditBoundary({ cwd: repositoryRoot, head: sourceRevision, growthCommits: derived.map(({ commit }) => commit), growthGate: informational ? 'informational' : undefined, offline: true, only: scopedChecks, closeoutBase: null });
  const gateHolds = ({ id, legs }) => Object.entries(legs).every(([leg, value]) => value !== false || (boundInformational[id] ?? []).includes(leg));
  assert.ok(recomputed.checks.every(gateHolds), 'E-BL1-09: every gate leg of the scoped checks holds across the growth commits in git');
  if (!informational) assert.equal(recomputed.pass, true, 'E-BL1-09: the scoped checks hold across the growth commits in git');
  assert.deepEqual(audit.checks.filter(({ id }) => scopedChecks.includes(id)).map(({ id, legs }) => [id, legs]), recomputed.checks.map(({ id, legs }) => [id, legs]), 'E-BL1-09: the recorded legs are the legs git gives');
  assert.ok(audit.checks.filter(({ id }) => scopedChecks.includes(id)).every(({ pass, ...check }) => pass === gateHolds(check)), 'E-BL1-09: a scoped check passes exactly when its gate legs hold');
  // Everything a scoped check records per commit (parents, per-commit legs, changed files, dependency fields, records) is what git gives,
  // derived by the tool bound at the capture's revision, and so are the growth scope and its commits' subjects.
  assert.equal(canonicalJson(audit.checks.filter(({ id }) => scopedChecks.includes(id))), canonicalJson(recomputed.checks), 'E-BL1-09: the recorded scoped checks, per-commit observations included, are what git gives');
  assert.equal(canonicalJson(audit.growthScope), canonicalJson(recomputed.growthScope), 'E-BL1-09: the recorded growth scope, its commits and their subjects included, is what git gives');
  for (const claim of [records['E-BL1-08'].claim, records['E-BL1-09'].claim]) for (const prefix of short) assert.ok(claim.includes(prefix), `the claim names the audited commit ${prefix}`);

  const gitDerived = ({ commit, parent, subject, addedPatterns, changedPatterns, excludedDirectories, excludedEntries, digestAffectingPathsChanged }) => ({ commit, parent, subject, addedPatterns, changedPatterns, excludedDirectories, excludedEntries, digestAffectingPathsChanged });
  assert.deepEqual(catalog.growthScope.commits?.map(gitDerived), derived.map(gitDerived), 'E-BL1-08 records the growth commits, their blocks, and their excluded sources as git gives them');
  for (const { commit, digestBefore, digestAfter, identical, holds, digestAffectingPathsChanged } of catalog.growthScope.commits) {
    assert.match(digestBefore, /^sha256:[0-9a-f]{64}$/u);
    assert.match(digestAfter, /^sha256:[0-9a-f]{64}$/u);
    if (informational) {
      // An observation: the recorded values only have to agree with each other, whatever the commit changed.
      assert.equal(identical, digestBefore === digestAfter, `E-BL1-08: ${commit.slice(0, 8)} records whether the digest moved`);
      assert.equal(holds, identical && digestAffectingPathsChanged.length === 0, `E-BL1-08: ${commit.slice(0, 8)} records whether the comparison held`);
    } else {
      assert.deepEqual(digestAffectingPathsChanged, [], `E-BL1-08: ${commit.slice(0, 8)} changed no compiler or schema path that moves the digest`);
      assert.ok(identical === true && holds === true && digestBefore === digestAfter, `E-BL1-08: the catalog without the sources ${commit.slice(0, 8)} added or changed has the same digest before and after`);
    }
  }
  assert.ok(records['E-BL1-08'].nonClaims.some((claim) => /does not run a historical compiler/u.test(claim)), 'E-BL1-08 states that the digests are not recomputed from historical trees');
  if (informational) {
    assert.equal(catalog.growthScope.gate, 'informational', 'E-BL1-08 records the per-commit digest comparison as an observation');
    // What the claim is: generation identity, two identical compiles, and that the pattern entries add only their own artifacts.
    assert.deepEqual(catalog.repeatedCompile, { compiles: 2, bytesIdentical: true }, 'E-BL1-08 records two identical compiles');
    assert.equal(catalog.addedSources.remainderIdenticalToBaseline, true, 'E-BL1-08: the pattern entries add only their own artifacts');
    assert.match(catalog.generationIdentity.digest, /^sha256:[0-9a-f]{64}$/u, 'E-BL1-08 records generation identity');
    for (const id of ['E-BL1-08', 'E-BL1-09']) assert.ok(records[id].nonClaims.some((claim) => growthNonClaim.test(claim)), `${id} states that a growth commit may change @muxui/react, dependencies, and component records and the record claims nothing about it`);
  }
}

/**
 * The checks every capture passes, then those of its scope: a close-out capture is held to the exact close-out facts,
 * and a growth capture to the facts derived from the catalog, the browser test routes, and the thresholds at its own
 * revision, and to the retained close-out at `closeoutRevision`, whether it is the current capture or an archived one.
 */
async function assertCapture({ repo = repositoryRoot, directory, index, verification, records, artifacts, retained }, { closeoutRevision, growthToolRevision, thresholdsRevision } = {}) {
  const { assertUniqueQueries, parseThresholds, thresholdChanges, thresholdRevisionProblems } = await import('../../../../tests/evidence/bl1/regression.mjs');
  const { sourceRevision, sourceTree } = index;
  const { scope, growthGate } = verification;
  assert.ok(scope === 'close-out' || scope === 'growth', `${directory}: the validation summary records its scope`);
  // A capture made before Decision 0029 records no growth gate and is verified strictly, as it always was.
  assert.ok(growthGate === undefined || (growthGate === 'informational' && scope === 'growth'), `${directory}: growthGate is absent (a capture made before Decision 0029) or informational on a growth capture`);
  const informational = growthGate === 'informational';
  assert.equal(index.milestone, 'BL1');
  assert.equal(index.disclosureClass, 'public-sanitized');
  assert.equal(index.sourceRevisionInMainHistory, true, `${directory}: the source revision is in main's history`);
  const ids = Array.from({ length: 11 }, (_, offset) => `E-BL1-${String(offset + 1).padStart(2, '0')}`);
  assert.deepEqual(index.records.map(({ assertionId }) => assertionId), ids);
  assert.equal(verification.sourceRevision, sourceRevision);
  assert.equal(verification.sourceTree, sourceTree);
  // Every excerpt an artifact cites is retained at the cited digest.
  const excerpts = (value) => (Array.isArray(value) ? value.flatMap(excerpts)
    : value && typeof value === 'object' ? [...(value.excerpt ? [value.excerpt] : []), ...Object.values(value).flatMap(excerpts)] : []);
  for (const assertionId of ids) {
    const record = records[assertionId];
    assert.equal(record.outcome, 'pass', assertionId);
    assert.equal(record.sourceRevision, sourceRevision, assertionId);
    assert.equal(record.sourceTree, sourceTree, assertionId);
    assert.equal(record.executedRevision, record.sourceRevision, assertionId);
    assert.deepEqual(record.proofTool, verification.proofTool, assertionId);
    assert.ok(record.nonClaims.some((claim) => /^No assistive-technology support claim/u.test(claim)), `${assertionId} states the assistive-technology non-claim`);
    assert.equal(artifacts[assertionId].assertionId, assertionId);
    assert.equal(artifacts[assertionId].sourceRevision, sourceRevision, assertionId);
    for (const excerpt of excerpts(artifacts[assertionId])) assert.equal(retained.get(excerpt.path), excerpt.sha256, `${assertionId} cites ${excerpt.path}`);
  }
  // The proof tools are bound at revisions in main's history.
  for (const { path, revision } of verification.proofTools) {
    assert.equal(spawnSync('git', ['merge-base', '--is-ancestor', revision, sourceRevision], { cwd: repositoryRoot }).status, 0, `${path} is bound at an ancestor of the source revision`);
  }
  // A record a later capture replaced names the copy of its predecessor kept in the tree, and the index retains that copy at the digest it names.
  for (const [id, { supersedes }] of Object.entries(records).filter(([, record]) => record.supersedes !== undefined)) {
    assert.ok(supersedes.path.startsWith(`${bl1}/superseded/${supersedes.sourceRevision.slice(0, 12)}/records/`), `${id}: the predecessor is archived in the tree`);
    assert.equal(retained.get(supersedes.path), supersedes.sha256, `${id}: the index retains the predecessor at the digest the record names`);
  }

  // What the catalog, the policy routes, and the thresholds declare at this capture's own revision.
  const catalog = catalogAt(sourceRevision);

  // E-BL1-01: eight negatives, parsed from the tests; an unknown field names a path, not an owner.
  const negatives = artifacts['E-BL1-01'].observations.requiredNegatives;
  assert.equal(negatives.length, 8);
  assert.ok(negatives.every(({ owner }) => typeof owner === 'string' && owner.length > 0), 'E-BL1-01: all eight name an owner');
  assert.deepEqual(negatives.filter(({ ownerProof }) => ownerProof !== undefined).map(({ negative, owner }) => [negative, owner]), [['an unknown field', 'pattern-contract']]);
  assert.ok(negatives.every(({ code, path, outcome }) => /^MUXUI_/u.test(code) && path.startsWith('$/') && outcome === 'pass'));

  // E-BL1-03: every variant the catalog declares typechecked on its own against the packed declarations.
  const typecheck = artifacts['E-BL1-03'].observations.typecheck.perVariant;
  assert.deepEqual(typecheck.variants.map(({ id }) => id).sort(), catalog.variantIds, 'E-BL1-03 typechecks every variant the catalog declares');
  assert.ok(typecheck.variants.every(({ exitCode, diagnostics, packedDeclarations, workspaceSources }) => exitCode === 0 && diagnostics === 0 && packedDeclarations && !workspaceSources));

  // E-BL1-04: every variant page is audited, and every block browser test the policy routes passes in all three engines.
  // The expected test and engine pairs come from the test files at this revision, never from the record's own engine list.
  const { storybook, browser } = artifacts['E-BL1-04'].observations;
  assert.deepEqual([...storybook.selection.families].sort(), catalog.patternSlugs, 'E-BL1-04 audits every block');
  assert.equal(storybook.selection.pages.length, catalog.variantIds.length, 'E-BL1-04 audits every variant page');
  assert.deepEqual(browser.engines, ['chromium', 'firefox', 'webkit'], 'E-BL1-04 runs chromium, firefox, and webkit');
  assert.deepEqual([...browser.files].sort(), catalog.browserTests, 'E-BL1-04 runs the block browser tests the policy routes');
  const expectedRuns = browser.engines.flatMap((engine) => catalog.browserTests.flatMap((file) => browserTestTitles(sourceRevision, file).map((title) => `${engine}: ${title}`))).sort();
  assert.ok(expectedRuns.length > 0, 'E-BL1-04 expects at least one browser run');
  assert.deepEqual(browser.engineRuns.map(({ engine, test }) => `${engine}: ${test}`).sort(), expectedRuns, 'E-BL1-04 passes each block browser test in each engine');
  assert.match(browser.proof.command, /MUXUI_BROWSER_ENGINES=chromium,firefox,webkit /u, 'E-BL1-04 ran with all three engines');
  assert.deepEqual(browser.proof.command.match(/test\/browser\/\S+\.test\.mjs/gu).sort(), catalog.browserTests.map((file) => file.slice('packages/react/'.length)), 'E-BL1-04 ran the routed test files');
  const results = browser.proof.tests;
  assert.ok(results.fail === 0 && results.cancelled === 0 && results.skipped === 0 && results.pass === results.tests && results.pass >= expectedRuns.length, 'E-BL1-04: every browser result passes');

  // E-BL1-05 and E-BL1-07: every pattern and variant is covered by the docs check and the parity matrix.
  const docs = artifacts['E-BL1-05'].observations.counts;
  assert.deepEqual([docs.patterns, docs.variantPages], [catalog.patternIds.length, catalog.variantIds.length], 'E-BL1-05 covers every pattern and variant');
  const matrix = artifacts['E-BL1-07'].observations.matrix;
  assert.deepEqual([[...matrix.patterns].sort(), [...matrix.variants].sort(), matrix.rowCount], [catalog.patternIds, catalog.variantIds, matrix.rows.length], 'E-BL1-07 covers every pattern and variant');

  // E-BL1-06: every capture is retained at its digest, and none overflows.
  const visual = artifacts['E-BL1-06'].observations;
  const widths = pageWidthsAt(sourceRevision);
  assert.deepEqual(visual.pageWidths.widths, widths, 'E-BL1-06 captures the page widths the docs presets module lists at the source revision');
  assert.deepEqual(visual.expected.pageWidths, widths);
  if (informational) assert.deepEqual([visual.pageWidths.source, visual.pageWidths.blob], [pageWidthsSource, gitOut('rev-parse', `${sourceRevision}:${pageWidthsSource}`)], 'E-BL1-06 names the module and blob the widths were read from');
  assert.equal(visual.expected.variants, catalog.variantIds.length, 'E-BL1-06 captures every variant');
  assert.equal(visual.captures.length, visual.expected.variants * 2 * visual.expected.toolbarPresets.length + visual.expected.marketingVariants.length * 2 * visual.expected.pageWidths.length);
  assert.equal(visual.overflowReport.measurements, visual.captures.length);
  assert.ok(visual.captures.every(({ overflowX, path, sha256 }) => overflowX === false && retained.get(path) === sha256));

  // E-BL1-09: the audit passed at the source revision, every control rejected, and the deployment claim is honest.
  const boundary = artifacts['E-BL1-09'].observations;
  assert.equal(boundary.audit.pass, true);
  assert.ok(boundary.audit.checks.every(({ pass }) => pass), 'E-BL1-09: every audit check passes');
  assert.equal(boundary.audit.head.revision, sourceRevision);
  assert.deepEqual(boundary.negativeControls.checksWithoutControl, []);
  assert.deepEqual(boundary.negativeControls.legsWithoutControl, {});
  assert.ok(boundary.negativeControls.results.every(({ rejected, accepted, failingLegs, expectedFailingLegs }) => rejected === true && accepted !== false && JSON.stringify(failingLegs) === JSON.stringify(expectedFailingLegs)));
  const deployment = boundary.audit.checks.find(({ id }) => id === 'no-deployment');
  assert.equal(deployment.observations.observed === true ? deployment.observations.problems.length : 0, 0);
  assert.match(records['E-BL1-09'].claim, deployment.observations.observed ? /GitHub lists no deployment/u : /no deployment configuration was added/u);
  assert.equal(boundary.audit.checks.find(({ id }) => id === 'plan-install-registry-scaffold-unavailable').observations.liveCli.run, true);

  // Independent reviews: each is retained at its digest, names its own reviewed revision, and records how its tree compares with the source tree.
  const content = artifacts['E-BL1-10'].observations;
  assert.deepEqual(content.scan.failures, []);
  assert.equal(content.scan.variantSources, catalog.variantIds.length, 'E-BL1-10 scans every variant source');
  assert.equal(content.review.verdict, 'pass');
  if (!informational) {
    assert.deepEqual([...content.review.blocks].sort(), catalog.patternSlugs, 'E-BL1-10 reviews every block');
    assert.equal(content.review.reviewedCatalogPatternsTree, gitOut('rev-parse', `${sourceRevision}:catalog/patterns`), 'E-BL1-10: the reviewer read the block sources this capture scanned');
    assert.equal(content.reviewCoverage, undefined, 'a capture without growthGate records one review of the whole catalog/patterns tree');
  } else {
    // A review covers a block when it names the block and the reviewer read what this capture scanned: the block's tree, the catalog record of
    // every participant, and the React runtime sources. The key is derived here from git with the tool bound at the capture's revision; each row keeps the review's own revision and tree.
    assert.ok(content.reviewCoverage, 'E-BL1-10 records its reviewCoverage');
    assert.deepEqual(content.reviewCoverage.rows.map(({ block }) => block).sort(), catalog.patternSlugs, 'E-BL1-10 covers every block with a retained review');
    const excluded = boundNonRenderingSources(growthToolRevision ?? sourceRevision);
    for (const { block, key, review } of content.reviewCoverage.rows) {
      assert.deepEqual(key, expectedCoverageKey(sourceRevision, block, excluded), `E-BL1-10: ${block} is covered at the key its sources, participants, and React runtime have at the source revision`);
      assert.match(review.reviewedRevision, /^[0-9a-f]{40}$/u);
      assert.deepEqual(review.keyAtReviewedRevision, expectedCoverageKey(review.reviewedRevision, block, excluded), `E-BL1-10: the row for ${block} records the key at its review's reviewed revision`);
      assert.deepEqual(review.keyAtReviewedRevision, key, `E-BL1-10: the reviewer of ${block} read the sources, participants, and React runtime this capture scanned`);
      assert.equal(review.reviewedTree, gitOut('rev-parse', `${review.reviewedRevision}^{tree}`), `E-BL1-10: the row for ${block} keeps its review's own reviewed tree`);
      assert.equal(retained.get(review.artifact.path), review.artifact.sha256, `E-BL1-10: the review covering ${block} is retained at its digest`);
      const reviewText = await readFile(join(repo, capturePath(directory)(review.artifact.path)), 'utf8');
      assert.equal(digest(reviewText), review.artifact.sha256);
      assert.ok(reviewText.includes(`catalog/patterns/${block}`) && /\*\*Pass\.\*\*/u.test(reviewText), `E-BL1-10: the review covering ${block} names it and passes`);
    }
  }
  const exitReview = boundary.exitReview;
  for (const review of [content.review, ...(exitReview === null ? [] : [exitReview])]) {
    assert.equal(retained.get(review.artifact.path), review.artifact.sha256);
    assert.match(review.reviewedRevision, /^[0-9a-f]{40}$/u);
    assert.equal(review.comparison.sourceTree, sourceTree);
    assert.equal(review.comparison.equalTrees, review.reviewedTree === sourceTree, 'the recorded tree comparison agrees with the recorded trees');
    assert.deepEqual(Object.keys(review.sanitization.replacements).sort(), ['home', 'repositoryRoot', 'temporary']);
  }

  // E-BL1-11: the thresholds are the ones committed at the source revision, and the expectations revised and the known weaknesses stay on the record.
  const baseline = artifacts['E-BL1-11'].observations;
  const thresholdBytes = readAtRevision(repositoryRoot, sourceRevision, baseline.thresholds.path);
  assert.equal(digest(thresholdBytes), baseline.thresholds.sha256, 'E-BL1-11 binds the thresholds committed at the source revision');
  assert.equal(retained.get(baseline.thresholds.path), baseline.thresholds.sha256);
  const thresholds = parseThresholds(thresholdBytes);
  assertUniqueQueries(thresholds);
  const { queries } = thresholds.discovery;
  const revised = thresholds.provenance.revisedAfterFirstMeasurement;
  assert.deepEqual(baseline.seedSet, thresholds.seedSet);
  assert.ok(thresholds.seedSet.every((id) => catalog.patternIds.includes(id)));
  assert.ok(revised.every((query) => queries.some((entry) => entry.query === query)), 'every revised expectation names a query');
  assert.equal(baseline.measured.discovery.queries.length, queries.length, 'E-BL1-11 measures every threshold query');
  assert.deepEqual(baseline.measured.denseBudgets.patterns.map(({ id }) => id).sort(), catalog.patternIds, 'E-BL1-11 measures every pattern');
  assert.deepEqual(baseline.failures, []);
  assert.deepEqual(baseline.knownDiscoveryWeaknesses.map(({ query }) => query).sort(), queries.filter(({ knownWeakness }) => knownWeakness !== undefined).map(({ query }) => query).sort());
  assert.match(records['E-BL1-11'].claim, new RegExp(`${revised.length} of ${queries.length} discovery expectations were revised`, 'u'));

  if (informational) {
    // Decision 0029: a change to a query, limit, or budget since the close-out is on the record. The log is read at `thresholdsRevision`
    // (the source revision unless a forged capture stands on a later one).
    assert.ok(baseline.revisionLog, 'E-BL1-11 records its revisionLog');
    const logged = parseThresholds(readAtRevision(repositoryRoot, thresholdsRevision ?? sourceRevision, baseline.thresholds.path));
    assert.deepEqual(thresholdRevisionProblems(parseThresholds(readAtRevision(repositoryRoot, closeoutRevision, baseline.thresholds.path)), logged), [], 'E-BL1-11: every threshold change since the close-out is logged and no expectation is removed');
    // Against the capture this one replaces, a later revision of a query already on the log still needs its own new entry.
    const replaced = records['E-BL1-11'].supersedes.sourceRevision;
    assert.deepEqual(thresholdRevisionProblems(parseThresholds(readAtRevision(repositoryRoot, replaced, baseline.thresholds.path)), logged), [], 'E-BL1-11: every threshold change since the capture this one replaces has a new log entry');
    assert.deepEqual(baseline.revisionLog.unlogged, [], 'E-BL1-11 records no unlogged threshold change');
    assert.equal(baseline.revisionLog.entries, (logged.provenance.revisions ?? []).length, 'E-BL1-11 counts the log entries');
  } else {
    assert.equal(baseline.revisionLog, undefined, 'a capture without growthGate records no revision log');
  }

  if (scope === 'close-out') {
    // The close-out facts stay pinned, so a later change to the derivations above cannot soften what the close-out claims.
    assert.equal(typecheck.variants.length, 5, 'the close-out covers five variants');
    assert.deepEqual([results.pass, results.tests], [57, 57], 'the close-out passes 57 of 57 browser results');
    assert.equal(matrix.rows.length, 79, 'the close-out compares 79 parity rows');
    assert.deepEqual([boundary.audit.checks.length, boundary.audit.checks.filter(({ pass }) => pass).length], [13, 13], 'the close-out passes 13 of 13 audit checks');
    assert.equal(boundary.closeoutScope.run, true, 'the close-out runs the close-out scope check');
    assert.ok(boundary.audit.checks.some(({ id }) => id === 'closeout-scope'));
    // The close-out audits the whole range from the pre-BL1 base, and holds the catalog without patterns to the digest pinned at #225.
    assert.equal(boundary.audit.growthScope, undefined, 'the close-out has no growth scope');
    assert.deepEqual([artifacts['E-BL1-08'].observations.baseline.catalogDigest, artifacts['E-BL1-08'].observations.baseline.equalsPinnedDigest], ['sha256:ab0998dfb2f51aa572e77f16e5d5f80982242a5c5df4aac16d66b1390bbc9671', true], 'the close-out holds the catalog without patterns to the digest pinned at #225');
    // #227 is stated, not hidden, and is not called BL1.
    const reactSource = boundary.audit.checks.find(({ id }) => id === 'react-source-files').observations;
    assert.deepEqual(reactSource.nonBl1Changes.map(({ pullRequest, bl1: isBl1 }) => [pullRequest, isBl1]), [[227, false]]);
    assert.match(records['E-BL1-09'].claim, /BL1 evidence validates the package after it/u);
    assert.deepEqual([revised.length, queries.length], [9, 21], 'the close-out revised 9 of 21 expectations');
    assert.equal(baseline.thresholdChanges, undefined, 'the close-out lists no threshold changes');
    assert.equal(content.review.advisoryLines.length >= 3, true);
    assert.notEqual(exitReview, null, 'the close-out retains the independent exit review');
    assert.deepEqual([exitReview.comparison.equalTrees, exitReview.comparison.changedPathCount, exitReview.comparison.proofToolsChangedSinceReviewed], [true, 0, []], 'the exit review read the source tree and the tools that ran');
    // The earlier E-BL1-08 and E-BL1-11 records are named by their successors, never silently replaced.
    assert.deepEqual(Object.entries(records).filter(([, record]) => record.supersedes !== undefined).map(([id, { supersedes }]) => [id, supersedes.sourceRevision]), [['E-BL1-08', 'be6f7c411f03dd7e7d6f4cc50016d4a3d2f65151'], ['E-BL1-11', 'be6f7c411f03dd7e7d6f4cc50016d4a3d2f65151']]);
  } else {
    // A growth capture skips the close-out scope check and says so, and is held to the retained close-out: it compares the
    // thresholds with the close-out's, and its added blocks are the catalog here minus the catalog there, derived independently.
    assert.equal(boundary.closeoutScope.run, false, 'a growth capture records that it skipped the close-out scope check');
    assert.ok(!boundary.audit.checks.some(({ id }) => id === 'closeout-scope'));
    assert.match(closeoutRevision ?? '', /^[0-9a-f]{40}$/u, `${directory}: a growth capture is checked against a retained close-out revision`);
    const { against, addedPatterns, ...changes } = baseline.thresholdChanges;
    assert.deepEqual([against.revision, against.path], [closeoutRevision, baseline.thresholds.path], 'E-BL1-11 compares the thresholds with the retained close-out revision');
    const before = readAtRevision(repositoryRoot, closeoutRevision, against.path);
    assert.equal(digest(before), against.sha256);
    assert.deepEqual(changes, thresholdChanges(parseThresholds(before), thresholds), 'E-BL1-11 lists every change to the thresholds since the close-out');
    const closeoutPatterns = catalogAt(closeoutRevision).patternIds;
    const added = catalog.patternIds.filter((id) => !closeoutPatterns.includes(id));
    assert.ok(added.length > 0, 'E-BL1-11: a growth capture adds a block to the close-out');
    assert.deepEqual([...addedPatterns].sort(), added, 'E-BL1-11 names the blocks added since the close-out');
    for (const [id, record] of Object.entries(records)) assert.ok(record.supersedes !== undefined, `${id}: a growth capture replaces the capture before it`);
    await assertGrowthScope({ sourceRevision, closeoutRevision, toolRevision: growthToolRevision, added, verification, artifacts, records, informational });
  }
  return { scope, sourceRevision, catalog };
}

// BL1 growth: the block browser tests are declared once, in the policy's pattern routes, and the capture runs what it declares.
test('the BL1 block browser tests are derived from the policy routes, one per interactive block', async () => {
  const { blockBrowserTests } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const reactRoot = await mkdtemp(join(tmpdir(), 'muxui-bl1-browser-'));
  try {
    await mkdir(join(reactRoot, 'test/browser'), { recursive: true });
    const declared = { a: 'test/browser/pattern-a.test.mjs', c: 'test/browser/pattern-c.test.mjs' };
    for (const file of Object.values(declared)) await writeFile(join(reactRoot, file), '');
    // Pattern order, and a block with no declared test (a non-interactive one) adds none.
    assert.deepEqual(blockBrowserTests({ declared, patternSlugs: ['c', 'b', 'a'], reactRoot }), [declared.c, declared.a]);
    assert.throws(() => blockBrowserTests({ declared: { ...declared, z: 'test/browser/pattern-z.test.mjs' }, patternSlugs: ['a', 'c'], reactRoot }), /BL1_BROWSER_TEST_UNKNOWN: .* z,/u);
    assert.throws(() => blockBrowserTests({ declared: { a: 'test/browser/pattern-gone.test.mjs' }, patternSlugs: ['a'], reactRoot }), /BL1_BROWSER_TEST_MISSING: test\/browser\/pattern-gone/u);
    assert.throws(() => blockBrowserTests({ declared: {}, patternSlugs: ['a'], reactRoot }), /BL1_BROWSER_TEST_MISSING: patternBrowserTests declares no/u);
  } finally {
    await rm(reactRoot, { recursive: true, force: true });
  }

  // The shipped routes derive every declared test, and the same derivation at a revision gives that revision's set.
  const { loadPolicy } = await import('../src/policy.mjs');
  const { patternParticipants } = await import('../src/pattern-variants.mjs');
  const { patternBrowserTests } = (await loadPolicy(repositoryRoot)).pullRequestImpact;
  const patternSlugs = (await patternParticipants(repositoryRoot)).map(({ slug }) => slug);
  assert.deepEqual(blockBrowserTests({ declared: patternBrowserTests, patternSlugs, reactRoot: join(repositoryRoot, 'packages/react') }).sort(), Object.values(patternBrowserTests).sort());
  assert.deepEqual(catalogAt('5026836747b36e23b8f2dd8bd695d3a420cc295c').browserTests, ['packages/react/test/browser/pattern-poster-grid.test.mjs'], 'only the poster grid had shipped at #226');
  assert.equal(catalogAt(closeoutRevision).browserTests.length, 4);
});

// The one capture older than scopes: the first E-BL1-08 and E-BL1-11 records. It is immutable history, and its index names every
// file of the archive by digest, so the digest of that index is pinned here. Only an archive whose index is this exact file is
// exempt from the scope-specific assertions, and its files are still checked against that index.
const legacyCapture = {
  directory: `${bl1}/superseded/be6f7c411f03`,
  sourceRevision: 'be6f7c411f03dd7e7d6f4cc50016d4a3d2f65151',
  indexSha256: 'sha256:84eaec2dca4c6440f6d60e48de059eaca1aeb892a7f149583cad663c34583565',
};

/** Checks the older capture against its pin, then every file its index names against the digests the index records. */
async function assertLegacyCapture({ repo, summaryRevision }) {
  const { directory, sourceRevision, indexSha256 } = legacyCapture;
  const indexBytes = await readFile(join(repo, directory, 'index.json'));
  assert.equal(digest(indexBytes), indexSha256, `${directory}: the older capture's index is the pinned immutable one`);
  const index = JSON.parse(indexBytes.toString('utf8'));
  assert.deepEqual([index.sourceRevision, summaryRevision], [sourceRevision, sourceRevision], `${directory}: the older capture's index and summary name its revision`);
  await assertCopyMatchesIndex({ repo, directory, index });
  const into = capturePath(directory);
  for (const { path } of index.records) {
    const record = JSON.parse(await readFile(join(repo, into(path)), 'utf8'));
    assert.equal(record.sourceRevision, sourceRevision, `${path}: the older record names its revision`);
    assert.equal(digest(await readFile(join(repo, into(record.artifact.path)))), record.artifact.sha256, `${path}: the older record names its artifact`);
  }
}

/**
 * Checks every capture under the retained root of `repo`: the current capture and each archived one records a scope
 * (only the pinned older capture may not), and each is held to its scope and to the retained close-out revision.
 */
async function assertRetainedCaptures({ repo = repositoryRoot } = {}) {
  const { retainedCaptures } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const captures = await retainedCaptures({ outputRoot: repo, root: bl1 });
  assert.equal(captures[0].directory, bl1, 'the current capture is retained');
  const closeout = captures.find(({ scope }) => scope === 'close-out');
  assert.ok(closeout, 'a close-out capture is retained, current or archived');
  for (const { directory, scope, sourceRevision } of captures) {
    if (scope === undefined && directory === legacyCapture.directory) {
      await assertLegacyCapture({ repo, summaryRevision: sourceRevision });
      continue;
    }
    assert.ok(scope === 'close-out' || scope === 'growth', `${directory} records a scope`);
    const capture = await loadCapture({ repo, directory });
    if (directory !== bl1) await assertCopyMatchesIndex({ repo, ...capture });
    await assertCapture(capture, { closeoutRevision: closeout.sourceRevision });
  }
  return captures;
}

// The retained evidence covers E-BL1-01 to E-BL1-11 at one source revision that is in main's history, keeps its
// disclosures, and cites only excerpts and captures the index retains. Every capture under the root is checked.
test('BL1 retained evidence covers every assertion at one source revision and keeps its disclosures', async () => {
  await assertRetainedCaptures();
});

/** The retained close-out capture of the repository: the current capture, or the one archived under superseded/. */
async function retainedCloseout() {
  const { retainedCaptures } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  return (await retainedCaptures({ outputRoot: repositoryRoot, root: bl1 })).find(({ scope }) => scope === 'close-out');
}

/** A tree holding copies of the retained close-out, as the current capture and as each archive named in `archives`, plus the older named capture. */
async function stageRetainedTree(closeout, archives = []) {
  const repo = await mkdtemp(join(tmpdir(), 'muxui-bl1-retained-'));
  const copy = async (directory) => {
    for (const entry of ['index.json', 'verification.json', 'records', 'artifacts', 'validation', 'captures']) {
      await cp(join(repositoryRoot, closeout.directory, entry), join(repo, directory, entry), { recursive: true });
    }
  };
  await copy(bl1);
  for (const name of archives) await copy(`${bl1}/superseded/${name}`);
  await cp(join(repositoryRoot, bl1, 'superseded/be6f7c411f03'), join(repo, bl1, 'superseded/be6f7c411f03'), { recursive: true });
  return repo;
}

/** Edits the validation summary of the capture in `directory` and keeps its index naming the edited bytes, so only the edit fails. */
async function editSummary(repo, directory, change) {
  const summaryPath = join(repo, directory, 'verification.json');
  const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
  change(summary);
  const text = canonicalJson(summary);
  await writeFile(summaryPath, text);
  const indexPath = join(repo, directory, 'index.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  index.validation.sha256 = digest(text);
  await writeFile(indexPath, canonicalJson(index));
}

test('every retained BL1 capture records a valid scope, and only the one named older capture may go without', async () => {
  const closeout = await retainedCloseout();
  const archive = `${bl1}/superseded/${closeout.sourceRevision.slice(0, 12)}`;
  const refuses = async (label, pattern, edit, archives = [closeout.sourceRevision.slice(0, 12)]) => {
    const repo = await stageRetainedTree(closeout, archives);
    try {
      await edit(repo);
      await assert.rejects(assertRetainedCaptures({ repo }), pattern, label);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  };
  const clean = await stageRetainedTree(closeout, [closeout.sourceRevision.slice(0, 12)]);
  try {
    const found = (await assertRetainedCaptures({ repo: clean })).map(({ directory, scope }) => [directory, scope]);
    assert.deepEqual(found[0], [bl1, 'close-out']);
    assert.deepEqual(found.slice(1), [[archive, 'close-out'], [`${bl1}/superseded/be6f7c411f03`, undefined]].sort(([left], [right]) => (left < right ? -1 : 1)));
  } finally {
    await rm(clean, { recursive: true, force: true });
  }

  // The archived close-out satisfies the presence check, so the current capture must carry a valid scope itself.
  await refuses('the current capture has no scope', /tests\/evidence\/bl1 records a scope/u, (repo) => editSummary(repo, bl1, (summary) => { delete summary.scope; }));
  await refuses('the current capture has an unknown scope', /tests\/evidence\/bl1 records a scope/u, (repo) => editSummary(repo, bl1, (summary) => { summary.scope = 'sideways'; }));
  await refuses('an archived capture has no scope', /superseded\/\w+ records a scope/u, (repo) => editSummary(repo, archive, (summary) => { delete summary.scope; }));
  await refuses('the older capture summary is edited', /the older capture's index is the pinned immutable one/u, (repo) => editSummary(repo, legacyCapture.directory, (summary) => { summary.sourceRevision = 'c'.repeat(40); }));
  await refuses('a capture with no validation summary', /tests\/evidence\/bl1 records a scope/u, (repo) => rm(join(repo, bl1, 'verification.json')));
  // An archived capture is held to its scope as the current one is.
  await refuses('an archived close-out relabelled growth', /a growth capture records that it skipped the close-out scope check/u, (repo) => editSummary(repo, archive, (summary) => { summary.scope = 'growth'; }));
});

// The exemption was once applied before the archive was read: an index naming another revision, a summary still naming the exempt
// one, and a refreshed parent digest passed both the generic verifier and the scope loop. The pinned index digest closes that.
test('the older BL1 capture is exempt from a scope only while it is the pinned immutable capture', async () => {
  const closeout = await retainedCloseout();
  const archive = legacyCapture.directory;
  const parentPath = `${bl1}/index.json`;
  /** Names the current bytes of `paths` in the parent index, as a rewrite of the archive plus a refreshed digest would. */
  const refreshParent = async (repo, paths) => {
    const parent = JSON.parse(await readFile(join(repo, parentPath), 'utf8'));
    for (const entry of parent.artifacts.filter(({ path }) => paths.includes(path))) entry.sha256 = digest(await readFile(join(repo, entry.path)));
    await writeFile(join(repo, parentPath), canonicalJson(parent));
  };
  const rewrite = async (repo, file, change) => {
    const path = join(repo, archive, file);
    const value = JSON.parse(await readFile(path, 'utf8'));
    change(value);
    await writeFile(path, canonicalJson(value));
    return `${archive}/${file}`;
  };
  const tampered = async (label, pattern, edit) => {
    const repo = await stageRetainedTree(closeout);
    try {
      assert.equal((await verifyEvidence(repo, { gitRoot: repositoryRoot })).indexCount, 1, 'the untouched tree verifies');
      await assertRetainedCaptures({ repo });
      await edit(repo);
      // The generic verifier checks only the digests the parent index names, so a consistent rewrite is blind to it.
      if (label !== 'a file the archive index names is changed') assert.equal((await verifyEvidence(repo, { gitRoot: repositoryRoot })).indexCount, 1, `${label}: the generic verifier accepts the rewrite`);
      await assert.rejects(assertRetainedCaptures({ repo }), pattern, label);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  };

  // The reviewer's rewrite: the archive's index names a revision that does not exist, its summary still names the exempt one.
  await tampered('the archive index names another revision', /the older capture's index is the pinned immutable one/u, async (repo) => {
    await refreshParent(repo, [await rewrite(repo, 'index.json', (index) => { index.sourceRevision = 'f'.repeat(40); })]);
  });
  // A record rewritten, with the archive index and the parent index refreshed to match, changes the pinned index, and the
  // successor record that names its predecessor's digest no longer finds it.
  await tampered('a record is rewritten and both indexes are refreshed', /the older capture's index is the pinned immutable one|the index retains the predecessor at the digest the record names/u, async (repo) => {
    const record = await rewrite(repo, 'records/E-BL1-08.json', (value) => { value.claim = 'rewritten'; });
    const index = await rewrite(repo, 'index.json', (value) => { value.records[0].sha256 = digest(readFileSync(join(repo, archive, 'records/E-BL1-08.json'))); });
    await refreshParent(repo, [record, index]);
  });
  // The pinned index is untouched but a file it names is not the file it names.
  await tampered('a file the archive index names is changed', /archived at the digest its index names/u, async (repo) => {
    await rewrite(repo, 'artifacts/E-BL1-08.json', (value) => { value.claim = 'rewritten'; });
  });
  // The summary alone: it must name the exempt revision too.
  await tampered('the archive summary names another revision', /the older capture's index is the pinned immutable one|index and summary name its revision/u, async (repo) => {
    await refreshParent(repo, [await rewrite(repo, 'verification.json', (summary) => { summary.sourceRevision = 'f'.repeat(40); })]);
  });
});

/**
 * The close-out capture forged into a growth capture of the same source revision, as if `closeout` were the retained
 * close-out revision, carrying what a real growth capture records: the thresholds compared with that revision's, the
 * blocks added since it, and a predecessor for every record.
 */
async function forgeGrowth(capture, closeout) {
  const { parseThresholds, thresholdChanges } = await import('../../../../tests/evidence/bl1/regression.mjs');
  const forged = structuredClone(capture);
  forged.verification.scope = 'growth';
  const boundary = forged.artifacts['E-BL1-09'].observations;
  boundary.closeoutScope = { run: false, reason: 'forged' };
  boundary.audit.checks = boundary.audit.checks.filter(({ id }) => id !== 'closeout-scope');
  const path = forged.artifacts['E-BL1-11'].observations.thresholds.path;
  const before = readAtRevision(repositoryRoot, closeout, path);
  const closeoutPatterns = catalogAt(closeout).patternIds;
  forged.artifacts['E-BL1-11'].observations.thresholdChanges = {
    against: { revision: closeout, path, sha256: digest(before) },
    addedPatterns: catalogAt(capture.index.sourceRevision).patternIds.filter((id) => !closeoutPatterns.includes(id)),
    ...thresholdChanges(parseThresholds(before), parseThresholds(readAtRevision(repositoryRoot, capture.index.sourceRevision, path))),
  };
  for (const [id, record] of Object.entries(forged.records)) {
    record.supersedes = { path: `${bl1}/superseded/${closeout.slice(0, 12)}/records/${id}.json`, sha256: digest(id), sourceRevision: closeout };
    forged.retained.set(record.supersedes.path, record.supersedes.sha256);
  }
  // The growth scope a real growth capture records, from git: the commits that added the blocks, audited against their first parents.
  const added = forged.artifacts['E-BL1-11'].observations.thresholdChanges.addedPatterns;
  if (added.length > 0) {
    const { growthCommits } = await import('../../../../tests/evidence/bl1/growth-scope.mjs');
    const { auditBoundary, growthScopedChecks } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
    const source = capture.index.sourceRevision;
    const { digestAffectingPaths } = await import('../../../../tests/evidence/bl1/growth-scope.mjs');
    const commits = growthCommits({ cwd: repositoryRoot, head: source, since: closeout, patternIds: added });
    // The forged source revision predates the tool, so the fixture binds the committed tool and reads it at HEAD (see `growthToolRevision`).
    forged.verification.proofTools.push({ ...forged.verification.proofTool, path: growthScopeTool, sha256: digest(readAtRevision(repositoryRoot, 'HEAD', growthScopeTool)) });
    const scoped = auditBoundary({ head: source, growthCommits: commits.map(({ commit }) => commit), offline: true, only: growthScopedChecks, closeoutBase: null });
    boundary.audit.growthScope = scoped.growthScope;
    boundary.audit.checks = boundary.audit.checks.map((check) => scoped.checks.find(({ id }) => id === check.id) ?? check);
    const catalogObservations = forged.artifacts['E-BL1-08'].observations;
    delete catalogObservations.baseline;
    // Without the blocks the commit added, the catalog after is the catalog before, and the tooling golden at the parent pins the digest of that catalog.
    const parentDigest = (parent) => /sha256:[0-9a-f]{64}/u.exec(gitOut('show', `${parent}:packages/tooling/test/goldens/manifest-brief.txt`))[0];
    assert.equal(commits.length, 1, 'the forged capture follows a single growth commit, whose parent pins both digests');
    catalogObservations.growthScope = { digestAffectingPaths, commits: commits.map((scope) => ({ ...scope, digestBefore: parentDigest(scope.parent), digestAfter: parentDigest(scope.parent), identical: true, holds: true })) };
    const short = commits.map(({ commit }) => commit.slice(0, 8)).join(', ');
    forged.records['E-BL1-08'].claim = `${forged.records['E-BL1-08'].claim} Across each commit that added or changed a block (${short}).`;
    forged.records['E-BL1-08'].nonClaims.push('The recorded digests are bound by the artifact and index digests; the integrity test does not run a historical compiler to recompute them.');
    forged.records['E-BL1-09'].claim = `${forged.records['E-BL1-09'].claim} Across the growth commits that added or changed the blocks (${short}).`;
  }
  return forged;
}

test('BL1 retained captures are held to their derived and close-out facts', async () => {
  const closeout = await retainedCloseout();
  const capture = await loadCapture({ directory: closeout.directory });
  assert.equal((await assertCapture(capture)).catalog.variantIds.length, 5);
  const rejects = (change, message, base = capture, options) => {
    const forged = structuredClone(base);
    change(forged);
    return assert.rejects(assertCapture(forged, options), (error) => error.message.includes(message), message);
  };

  // Derived from the catalog, the policy routes, and the thresholds at the capture's own revision.
  await rejects(({ artifacts: forged }) => { forged['E-BL1-03'].observations.typecheck.perVariant.variants.pop(); }, 'E-BL1-03 typechecks every variant the catalog declares');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-04'].observations.browser.files.pop(); }, 'E-BL1-04 runs the block browser tests the policy routes');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-11'].observations.thresholds.sha256 = `sha256:${'0'.repeat(64)}`; }, 'E-BL1-11 binds the thresholds committed at the source revision');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-10'].observations.review.reviewedCatalogPatternsTree = 'c'.repeat(40); }, 'the reviewer read the block sources this capture scanned');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-01'].observations.requiredNegatives[0].owner = null; }, 'E-BL1-01: all eight name an owner');
  // The browser proof is derived from the test files, not from the record's own engine list: an empty record is refused.
  await rejects(({ artifacts: forged }) => {
    const browser = forged['E-BL1-04'].observations.browser;
    Object.assign(browser, { engines: [], engineRuns: [] });
    Object.assign(browser.proof.tests, { pass: 0, tests: 0 });
  }, 'E-BL1-04 runs chromium, firefox, and webkit');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-04'].observations.browser.engineRuns = forged['E-BL1-04'].observations.browser.engineRuns.filter(({ engine }) => engine !== 'webkit'); }, 'E-BL1-04 passes each block browser test in each engine');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-04'].observations.browser.engineRuns.pop(); }, 'E-BL1-04 passes each block browser test in each engine');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-04'].observations.browser.proof.command = forged['E-BL1-04'].observations.browser.proof.command.replace('chromium,firefox,webkit', 'chromium'); }, 'E-BL1-04 ran with all three engines');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-04'].observations.browser.proof.command = forged['E-BL1-04'].observations.browser.proof.command.replace(/ test\/browser\/pattern-poster-grid\.test\.mjs/u, ''); }, 'E-BL1-04 ran the routed test files');
  // The close-out pins.
  await rejects(({ artifacts: forged }) => { Object.assign(forged['E-BL1-04'].observations.browser.proof.tests, { pass: 56, tests: 56 }); }, 'the close-out passes 57 of 57 browser results');
  await rejects(({ artifacts: forged }) => {
    const review = forged['E-BL1-09'].observations.exitReview;
    review.comparison.equalTrees = false;
    review.reviewedTree = 'c'.repeat(40);
  }, 'the exit review read the source tree and the tools that ran');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-09'].observations.exitReview = null; }, 'the close-out retains the independent exit review');
  // A scope is not interchangeable: relabelled as growth, the close-out is refused for the facts a growth capture must carry.
  await rejects(({ verification: forged }) => { forged.scope = 'growth'; }, 'a growth capture records that it skipped the close-out scope check');
  await rejects(({ verification: forged }) => { delete forged.scope; }, 'the validation summary records its scope');
});

test('a BL1 growth capture is held to the retained close-out revision, current or archived', async () => {
  const closeout = await retainedCloseout();
  const capture = await loadCapture({ directory: closeout.directory });
  // Only the poster grid had shipped at #226, so a capture of the four blocks added three to that close-out.
  const earlier = '5026836747b36e23b8f2dd8bd695d3a420cc295c';
  const added = ['muxui:pattern:account-settings', 'muxui:pattern:marketing-hero', 'muxui:pattern:pricing-plans'];
  const growth = await forgeGrowth(capture, earlier);
  assert.deepEqual(growth.artifacts['E-BL1-11'].observations.thresholdChanges.addedPatterns, added);
  // Derived expectations alone hold a growth capture; the close-out pins do not apply to it.
  // The forged source revision predates the growth-scope tool, so the tool bound there is read at HEAD.
  const forgedOptions = { closeoutRevision: earlier, growthToolRevision: 'HEAD' };
  assert.equal((await assertCapture(growth, forgedOptions)).scope, 'growth');
  const rejects = (change, message, options = forgedOptions, base = growth) => {
    const forged = structuredClone(base);
    change(forged);
    return assert.rejects(assertCapture(forged, options), (error) => error.message.includes(message), message);
  };

  // It compares with the retained close-out, not with itself.
  const own = capture.index.sourceRevision;
  await rejects(({ artifacts: forged }) => {
    const changes = forged['E-BL1-11'].observations.thresholdChanges;
    Object.assign(changes, { against: { ...changes.against, revision: own }, addedPatterns: ['muxui:pattern:poster-grid'], addedQueries: [], revisedQueries: [], changedValues: [], removedQueries: [], seedSet: { added: [], removed: [] } });
  }, 'E-BL1-11 compares the thresholds with the retained close-out revision');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-11'].observations.thresholdChanges.addedPatterns = ['muxui:pattern:poster-grid']; }, 'E-BL1-11 names the blocks added since the close-out');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-11'].observations.thresholdChanges.addedQueries.push('invented'); }, 'E-BL1-11 lists every change to the thresholds since the close-out');
  // It must add a block to that close-out, and must be checked against one.
  await assert.rejects(assertCapture(await forgeGrowth(capture, own), { closeoutRevision: own }), (error) => error.message.includes('a growth capture adds a block to the close-out'));
  await rejects(() => {}, 'a growth capture is checked against a retained close-out revision', {});

  // E-BL1-08 and E-BL1-09 are scoped to the commits after the close-out that added or changed the blocks, which git gives at the capture's own revision.
  const scopedAudit = (forged) => forged['E-BL1-09'].observations.audit;
  const recordedScope = (forged) => forged['E-BL1-08'].observations.growthScope;
  await rejects(({ artifacts: forged }) => { scopedAudit(forged).growthScope.commits.pop(); }, 'E-BL1-09 audits the commits that added or changed the blocks');
  await rejects(({ artifacts: forged }) => { scopedAudit(forged).growthScope.commits[0].commit = own; }, 'E-BL1-09 audits the commits that added or changed the blocks');
  await rejects(({ artifacts: forged }) => { delete scopedAudit(forged).growthScope; }, 'E-BL1-09 audits the commits that added or changed the blocks');
  await rejects(({ artifacts: forged }) => { scopedAudit(forged).checks.find(({ id }) => id === 'react-source-files').observations = {}; }, 'react-source-files is evaluated across the growth commits');
  // The scoped checks are those of the bound tool: a record cannot narrow the list.
  await rejects(({ artifacts: forged }) => { scopedAudit(forged).growthScope.scopedChecks.pop(); }, 'as the bound tool does');
  await rejects(({ artifacts: forged }) => { scopedAudit(forged).checks.find(({ id }) => id === 'react-package-manifest').legs.manifestUnchanged = null; }, 'the recorded legs are the legs git gives');
  // E-BL1-08 records what git gives (the commits, parents, blocks, excluded sources, and changed compiler paths) and must match it exactly.
  const gitGiven = 'E-BL1-08 records the growth commits, their blocks, and their excluded sources as git gives them';
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits.pop(); }, gitGiven);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].commit = own; }, gitGiven);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].parent = own; }, gitGiven);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].addedPatterns.pop(); }, gitGiven);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].changedPatterns.push('muxui:pattern:poster-grid'); }, gitGiven);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].excludedEntries.pop(); }, gitGiven);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].excludedDirectories = []; }, gitGiven);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].digestAffectingPathsChanged.push('packages/schema/src/index.mjs'); }, gitGiven);
  // The declared digest-affecting paths are those of the bound tool, not whatever the record says: a narrowed or widened list is refused.
  const declaresBound = 'E-BL1-08 declares the digest-affecting paths of the bound growth-scope tool';
  await rejects(({ artifacts: forged }) => { recordedScope(forged).digestAffectingPaths = []; }, declaresBound);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).digestAffectingPaths = recordedScope(forged).digestAffectingPaths.filter((path) => path !== 'packages/schema/schemas'); }, declaresBound);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).digestAffectingPaths = recordedScope(forged).digestAffectingPaths.filter((path) => path !== 'packages/tokens/src'); }, declaresBound);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).digestAffectingPaths = recordedScope(forged).digestAffectingPaths.filter((path) => !path.endsWith('package.json')); }, declaresBound);
  await rejects(({ artifacts: forged }) => { recordedScope(forged).digestAffectingPaths.push('packages/react/src'); }, declaresBound);
  await rejects(({ verification: forged }) => { forged.proofTools = forged.proofTools.filter(({ path }) => path !== growthScopeTool); }, 'E-BL1-08 binds the growth-scope tool at the source revision');
  await rejects(({ verification: forged }) => { forged.proofTools.find(({ path }) => path === growthScopeTool).sha256 = digest('another tool'); }, 'E-BL1-08 binds the growth-scope tool at the source revision');
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].digestAfter = `sha256:${'f'.repeat(64)}`; }, 'has the same digest before and after');
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].identical = false; }, 'has the same digest before and after');
  await rejects(({ artifacts: forged }) => { recordedScope(forged).commits[0].holds = false; }, 'has the same digest before and after');
  await rejects(({ records: forged }) => { forged['E-BL1-08'].nonClaims = forged['E-BL1-08'].nonClaims.filter((claim) => !/historical compiler/u.test(claim)); }, 'E-BL1-08 states that the digests are not recomputed from historical trees');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-08'].observations.baseline = {}; }, 'a growth capture does not carry the close-out digest pin');
});

test('a BL1 archived capture is read from its own directory and must match its index', async () => {
  const closeout = await retainedCloseout();
  const capture = await loadCapture({ directory: closeout.directory });
  const outputRoot = await stageRetainedTree(closeout);
  try {
    const archive = `${bl1}/superseded/${capture.index.sourceRevision.slice(0, 12)}`;
    for (const entry of ['index.json', 'verification.json', 'records', 'artifacts', 'validation', 'captures']) {
      await cp(join(repositoryRoot, closeout.directory, entry), join(outputRoot, archive, entry), { recursive: true });
    }
    const archived = await loadCapture({ repo: outputRoot, directory: archive });
    await assertCopyMatchesIndex({ repo: outputRoot, ...archived });
    assert.deepEqual(await assertCapture(archived), await assertCapture(capture));
    await writeFile(join(outputRoot, archive, 'artifacts/E-BL1-05.json'), '{}');
    await assert.rejects(assertCopyMatchesIndex({ repo: outputRoot, ...archived }), /E-BL1-05\.json is archived at the digest its index names/u);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

// BL1 growth scope: E-BL1-08 and E-BL1-09 are evaluated across the commits that added the blocks, each against its first parent,
// so a main that other pull requests changed since the close-out does not fail them and they claim nothing about those changes.
test('a BL1 growth scope audits the commits that added or changed the blocks, not the range since the close-out', async () => {
  const { growthCommits } = await import('../../../../tests/evidence/bl1/growth-scope.mjs');
  const { auditBoundary, growthScopedChecks, preBl1Base } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  const slug = (id) => id.slice('muxui:pattern:'.length);
  const posterGrid = '5026836747b36e23b8f2dd8bd695d3a420cc295c'; // #226
  const otherBlocks = '70a093bf48a361ff918cb4f15b05d005b0ee0145'; // #228
  const table = 'e6d330ef19dab85e9f9fc65965a3404410e0c6d5'; // #234, a Table change in @muxui/react and its record
  const components = '51b90de31eba3ddb9ccec07913b16ad02e85eeb3'; // #235, five new components and a dependency change
  const latest = '46d66444bd2b1c3bc26988e3b47fd08aa6cda4ab'; // #236, a main with all three after the close-out
  const workspaceNavigation = 'e9a470c26afec974dba93a2daa5b1c95b7071b00'; // #247, a growth commit on a main whose CI workflow #245 changed
  const collections = 'bb6097269c3a2683e8680d0d7be9a83b4f069958'; // #238, the first real growth merge, on top of #236
  // The four close-out blocks arrived in two commits since the pre-BL1 base, and the head need not be either of them. #226 also changed the
  // compiler and the catalog package manifest, which a growth commit may not: the digest comparison compiles both sides with one compiler and could not see it.
  for (const head of [closeoutRevision, latest]) {
    assert.deepEqual(
      growthCommits({ head, since: preBl1Base, patternIds: catalogAt(closeoutRevision).patternIds }).map(({ commit, parent, addedPatterns, changedPatterns, digestAffectingPathsChanged }) => [commit, parent, addedPatterns.map(slug), changedPatterns, digestAffectingPathsChanged]),
      [
        [posterGrid, '5302eeb528588e53beb89a6617e85a05dce24aa1', ['poster-grid'], [], ['packages/catalog/package.json', 'packages/catalog/src/compiler.mjs']],
        [otherBlocks, posterGrid, ['account-settings', 'marketing-hero', 'pricing-plans'], [], []],
      ],
      `the commits that added the close-out blocks, found from ${head.slice(0, 8)}`,
    );
  }
  // The real growth, #238: one clean commit after the close-out, on a main that #234 to #236 changed first.
  const [growth] = growthCommits({ head: collections, since: closeoutRevision, patternIds: ['muxui:pattern:company-records', 'muxui:pattern:task-filters'] });
  assert.deepEqual([growth.commit, growth.parent, growth.addedPatterns.map(slug), growth.changedPatterns, growth.digestAffectingPathsChanged], [collections, latest, ['company-records', 'task-filters'], [], []]);
  assert.ok(growth.excludedEntries.length > 0 && growth.excludedEntries.every(({ path }) => growth.excludedDirectories.some((directory) => path.startsWith(directory))));
  const scoped = (growth, head = latest) => auditBoundary({ head, growthCommits: growth, offline: true, only: growthScopedChecks, closeoutBase: null });
  // The real growth merges are squash merges, so the selection accepts them: #238, then #247 on a main whose workflow #245 changed.
  assert.deepEqual(
    growthCommits({ head: workspaceNavigation, since: closeoutRevision, patternIds: ['muxui:pattern:company-records', 'muxui:pattern:task-filters', 'muxui:pattern:workspace-navigation'] }).map(({ commit, subject }) => [commit, subject.slice(subject.lastIndexOf(' (#'))]),
    [[collections, ' (#238)'], [workspaceNavigation, ' (#247)']],
  );
  const failed = (audit) => audit.checks.filter(({ pass }) => !pass).map(({ id }) => id);
  // The defect this scope removes: over the whole range, #234 to #236 fail the checks that read @muxui/react, the lockfile, and the component records.
  assert.deepEqual(failed(auditBoundary({ head: latest, offline: true, only: growthScopedChecks, closeoutBase: null })), ['react-package-manifest', 'react-source-files', 'no-dependency-change', 'no-new-component-token-capability-or-platform']);
  const clean = scoped([posterGrid, otherBlocks]);
  assert.deepEqual([clean.pass, clean.growthScope.commits.map(({ commit }) => commit)], [true, [posterGrid, otherBlocks]]);
  assert.deepEqual(clean.growthScope.scopedChecks, growthScopedChecks);
  assert.equal(scoped([collections], collections).pass, true, 'the real growth merge passes the scoped checks');
  // #245 changed the CI workflow after the close-out: the range from the pre-BL1 base blames the next growth commit for it, the scope does not.
  assert.ok(failed(auditBoundary({ head: workspaceNavigation, offline: true, only: growthScopedChecks, closeoutBase: null })).includes('no-workflow-or-hosting-config'));
  assert.equal(scoped([workspaceNavigation], workspaceNavigation).pass, true, 'a growth commit that changes no workflow passes although a later pull request did');
  // A growth commit that also changes @muxui/react source or a component record fails, and so does the other growth commit's company.
  assert.deepEqual(failed(scoped([otherBlocks, table])), ['react-source-files', 'no-new-component-token-capability-or-platform']);
  assert.deepEqual(failed(scoped([components])), ['react-package-manifest', 'react-source-files', 'no-dependency-change', 'no-new-component-token-capability-or-platform']);
  assert.throws(() => scoped([]), /BL1_AUDIT_GROWTH/u);
});

/**
 * A throwaway repository holding this checkout's HEAD tree, rebuilt so its last two patterns arrive in two growth commits:
 * `base` has neither, `first` adds the first, `second` adds the other. `variant(change)` branches from `first`, adds the other
 * pattern back, and applies `change`, as a growth commit that also changes something else. Its growth commits are squash merges
 * (their subjects end with a pull request number), as growth commits must be; `rebased()` builds the pull request that is not one.
 */
async function growthRepository() {
  const cwd = await mkdtemp(join(tmpdir(), 'muxui-bl1-growth-repo-'));
  const stash = await mkdtemp(join(tmpdir(), 'muxui-bl1-growth-stash-'));
  gitIn(cwd, 'init', '-q', '-b', 'main');
  gitIn(cwd, 'config', 'gc.auto', '0');
  execFileSync('tar', ['-x', '-C', cwd], { input: execFileSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: repositoryRoot, maxBuffer: 1 << 29 }), maxBuffer: 1 << 26 });
  const manifestPath = 'packages/catalog/catalog-sources.json';
  const original = await readFile(join(cwd, manifestPath), 'utf8');
  const manifest = JSON.parse(original);
  const records = manifest.records.filter(({ family }) => family === 'pattern');
  const entries = records.slice(-2);
  const [directoryA, directoryB] = entries.map(({ path }) => dirname(path));
  const [patternA, patternB] = entries.map(({ path }) => JSON.parse(readFileSync(join(cwd, path), 'utf8')).id);
  const earlier = JSON.parse(readFileSync(join(cwd, records[0].path), 'utf8')).id;
  // The manifest without the entries under the two directories, except those under `kept`.
  const listing = (...kept) => JSON.stringify({ ...manifest, records: manifest.records.filter(({ path }) => ![directoryA, directoryB].some((directory) => path.startsWith(`${directory}/`)) || kept.some((directory) => path.startsWith(`${directory}/`))) }, null, 2);
  const commitAll = (message) => {
    gitIn(cwd, 'add', '-A');
    gitIn(cwd, 'commit', '-q', '-m', message);
    return gitIn(cwd, 'rev-parse', 'HEAD');
  };
  for (const directory of [directoryA, directoryB]) {
    await mkdir(join(stash, directory, '..'), { recursive: true });
    await cp(join(cwd, directory), join(stash, directory), { recursive: true });
    await rm(join(cwd, directory), { recursive: true });
  }
  const restore = (directory) => cp(join(stash, directory), join(cwd, directory), { recursive: true });
  const edit = async (path, change) => writeFile(join(cwd, path), change(await readFile(join(cwd, path), 'utf8')));
  await writeFile(join(cwd, manifestPath), listing());
  const base = commitAll('base: neither block');
  await restore(directoryA);
  await writeFile(join(cwd, manifestPath), listing(directoryA));
  const first = commitAll('first: adds one block (#101)');
  await restore(directoryB);
  await writeFile(join(cwd, manifestPath), original);
  const second = commitAll('second: adds the other block (#102)');
  const variant = async (change) => {
    gitIn(cwd, 'checkout', '-q', '--detach', first);
    await restore(directoryB);
    await writeFile(join(cwd, manifestPath), original);
    await change(edit);
    return commitAll('growth that also changes something else (#103)');
  };
  // A later commit on top of `second`: the growth is over, and this one changes the second block, as a follow-up to the pull request does.
  const modify = async (change) => {
    gitIn(cwd, 'checkout', '-q', '--detach', second);
    await change(edit, cwd);
    return commitAll('a later commit that changes the second block (#104)');
  };
  // One pull request rebase-merged as two commits on `base`, neither with a pull request number: the first adds a block, the second adds a
  // workflow and touches no block.
  const rebased = async () => {
    gitIn(cwd, 'checkout', '-q', '--detach', base);
    await restore(directoryA);
    await writeFile(join(cwd, manifestPath), listing(directoryA));
    const block = commitAll('feat(catalog): add the block');
    await mkdir(join(cwd, '.github/workflows'), { recursive: true });
    await writeFile(join(cwd, '.github/workflows/x.yml'), 'name: x\n');
    return { block, workflow: commitAll('ci: add a workflow') };
  };
  const dispose = () => Promise.all([cwd, stash].map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
  return { cwd, base, first, second, variant, modify, rebased, edit, patternA, patternB, directoryA, directoryB, earlier, records, dispose };
}

test('each BL1 growth commit is audited against its first parent, and one that changes more than its blocks fails', async () => {
  const { growthCommits, catalogAcrossCommit } = await import('../../../../tests/evidence/bl1/growth-scope.mjs');
  const { auditBoundary, growthScopedChecks } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  const repo = await growthRepository();
  const { cwd, base, first, second, patternA, patternB, directoryA, directoryB } = repo;
  // The retained close-out stands at `base`: neither new block exists yet, and the older blocks predate it.
  const derive = (head, patternIds = [patternA, patternB]) => growthCommits({ cwd, head, since: base, patternIds });
  const audit = (growth) => auditBoundary({ cwd, base, head: growth.at(-1), mergeRevision: base, closeoutBase: null, growthCommits: growth, offline: true, only: growthScopedChecks });
  const failed = (growth) => audit(growth).checks.filter(({ pass }) => !pass).map(({ id }) => id);
  const commitsOf = (head) => derive(head).map(({ commit }) => commit);
  const jsonEdit = (change) => (text) => `${JSON.stringify(change(JSON.parse(text)), null, 2)}\n`;
  const summaryEdit = jsonEdit((record) => ({ ...record, summary: `${record.summary} Edited.` }));
  try {
    const reactSource = (await readdir(join(cwd, 'packages/react/src'))).find((name) => name.endsWith('.mjs'));
    // Blocks that arrived in two commits are found one commit at a time, from a head that is later than both.
    gitIn(cwd, 'checkout', '-q', '--detach', second);
    await repo.edit('README.md', (text) => `${text}\nMore.\n`);
    gitIn(cwd, 'add', '-A');
    gitIn(cwd, 'commit', '-q', '-m', 'an unrelated change after the growth');
    const later = gitIn(cwd, 'rev-parse', 'HEAD');
    const found = derive(later);
    assert.deepEqual(
      found.map(({ commit, parent, addedPatterns, changedPatterns, excludedDirectories, digestAffectingPathsChanged }) => [commit, parent, addedPatterns, changedPatterns, excludedDirectories, digestAffectingPathsChanged]),
      [[first, base, [patternA], [], [`${directoryA}/`], []], [second, first, [patternB], [], [`${directoryB}/`], []]],
    );
    assert.ok(found[1].excludedEntries.length > 0 && found[1].excludedEntries.every(({ path }) => path.startsWith(`${directoryB}/`)), 'the excluded sources are the ones the commit added');
    assert.throws(() => derive(later, ['muxui:pattern:missing']), /BL1_GROWTH_COMMIT_MISSING: muxui:pattern:missing is not a pattern/u);
    assert.throws(() => derive(later, [repo.earlier]), /BL1_GROWTH_COMMIT_MISSING: no commit after .* added or changed/u, 'a block no commit after the close-out touched is not growth');
    // Growth that only adds blocks passes every scoped check, whatever else the head holds.
    assert.deepEqual(failed([first, second]), []);

    // Git cannot say which commits belong to one pull request, so each growth pull request must be one squash-merged commit. A pull request
    // rebase-merged as several commits has a commit that touches no block (here a workflow): selection would never see it, and every scoped
    // check would pass without it. The selection refuses the pull request instead.
    const { block, workflow } = await repo.rebased();
    assert.throws(() => derive(workflow, [patternA]), /BL1_GROWTH_NOT_SQUASHED: .* \(feat\(catalog\): add the block\) adds or changes a block but is not a squash merge/u);
    // Without the rule the workflow commit escapes the selection and the scoped audit passes: the defect the rule closes.
    const escaped = growthCommits({ cwd, head: workflow, since: base, patternIds: [patternA], requireSquash: false }).map(({ commit }) => commit);
    assert.deepEqual(escaped, [block], 'the workflow commit is not a growth commit');
    assert.deepEqual(failed(escaped), [], 'and so no scoped check sees the workflow');
    assert.deepEqual(failed([block, workflow]), ['no-workflow-or-hosting-config'], 'while auditing the workflow commit does fail the check');
    // A merge commit is refused the same way.
    gitIn(cwd, 'checkout', '-q', '--detach', base);
    gitIn(cwd, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #7 from side', block);
    assert.throws(() => derive(gitIn(cwd, 'rev-parse', 'HEAD'), [patternA]), /BL1_GROWTH_NOT_SQUASHED: .* is a merge commit/u);
    const clean = await catalogAcrossCommit({ cwd, ...found[1] });
    assert.deepEqual([clean.identical, clean.holds], [true, true], 'the catalog without the sources the commit added is the same before and after');

    // A later commit that only edits a new block is a growth commit too, audited with that block left out of both sides.
    const edited = await repo.modify((edit) => edit(`${directoryB}/artifact.json`, summaryEdit));
    const [, , editCommit] = derive(edited);
    assert.deepEqual([editCommit.commit, editCommit.parent, editCommit.addedPatterns, editCommit.changedPatterns], [edited, second, [], [patternB]]);
    assert.deepEqual(failed(commitsOf(edited)), []);
    assert.deepEqual([(await catalogAcrossCommit({ cwd, ...editCommit })).holds], [true], 'the edited block is left out of both sides');
    // The add-then-modify escape: the same later commit also changes React source, a dependency, or a component record. Only the commits that first
    // added the blocks pass; every commit that touches them is audited, so the later one fails.
    for (const [label, extra, checks] of [
      ['@muxui/react source', (edit) => edit(`packages/react/src/${reactSource}`, (text) => `${text}\n// changed\n`), ['react-source-files']],
      ['the lockfile', (edit) => edit('pnpm-lock.yaml', (text) => `${text}\n# changed\n`), ['no-dependency-change']],
      ['a component record', (edit) => edit('catalog/components/button/artifact.json', summaryEdit), ['no-new-component-token-capability-or-platform']],
      ['a workflow', (edit) => edit('.github/workflows/ci.yml', (text) => `${text}\n# changed\n`), ['no-workflow-or-hosting-config']],
    ]) {
      const head = await repo.modify(async (edit) => { await edit(`${directoryB}/artifact.json`, summaryEdit); await extra(edit); });
      assert.deepEqual(failed([first, second]), [], `${label}: the commits that added the blocks alone are clean`);
      assert.deepEqual(failed(commitsOf(head)), checks, `${label}: a later commit that edits a new block and also changes it fails`);
    }

    // A growth commit that also changes @muxui/react source, its package.json, the lockfile, or a component record fails the check that reads it.
    const withSource = await repo.variant((edit) => edit(`packages/react/src/${reactSource}`, (text) => `${text}\n// changed\n`));
    assert.deepEqual(failed([first, withSource]), ['react-source-files']);
    const withManifest = await repo.variant((edit) => edit('packages/react/package.json', jsonEdit((manifest) => ({ ...manifest, version: '9.9.9' }))));
    assert.deepEqual(failed([first, withManifest]), ['react-package-manifest', 'react-source-files', 'versions-follow-decision-0026']);
    const withLockfile = await repo.variant((edit) => edit('pnpm-lock.yaml', (text) => `${text}\n# changed\n`));
    assert.deepEqual(failed([first, withLockfile]), ['no-dependency-change']);
    const withRecord = await repo.variant((edit) => edit('catalog/components/button/artifact.json', summaryEdit));
    assert.deepEqual(failed([first, withRecord]), ['no-new-component-token-capability-or-platform']);
    const withWorkflow = await repo.variant((edit) => edit('.github/workflows/ci.yml', (text) => `${text}\n# changed\n`));
    assert.deepEqual(failed([first, withWorkflow]), ['no-workflow-or-hosting-config']);
    // Only the commit that changed more is blamed: the clean one alone still passes.
    assert.deepEqual(failed([first]), []);

    // A growth commit that changes the catalog without the sources of its blocks moves the digest: a component record, or a close-out block, which is
    // not one of the new blocks and so is never left out of either side.
    const [, recordCommit] = derive(withRecord);
    const recordCatalog = await catalogAcrossCommit({ cwd, ...recordCommit });
    assert.deepEqual([recordCatalog.identical, recordCatalog.holds], [false, false], 'a changed component record moves the digest');
    const withCloseoutBlock = await repo.variant((edit) => edit(`${dirname(repo.records[0].path)}/artifact.json`, summaryEdit));
    assert.deepEqual(failed([first, withCloseoutBlock]), [], 'an edit to a close-out block is outside the E-BL1-09 record checks');
    const [, closeoutBlockCommit] = derive(withCloseoutBlock);
    assert.ok(!closeoutBlockCommit.excludedDirectories.some((directory) => directory.startsWith(dirname(repo.records[0].path))), 'a close-out block is not left out of either side, so its edit moves the digest');

    // A growth commit that changes a compiler or schema path fails even though the one-compiler digest comparison cannot see it.
    const withSchema = await repo.variant((edit) => edit('packages/schema/src/index.mjs', (text) => text.replace("SCHEMA_VERSION = '2.2.0'", "SCHEMA_VERSION = '2.2.1'")));
    const [, schemaCommit] = derive(withSchema);
    assert.deepEqual(schemaCommit.digestAffectingPathsChanged, ['packages/schema/src/index.mjs']);
    const schemaCatalog = await catalogAcrossCommit({ cwd, ...schemaCommit });
    assert.deepEqual([schemaCatalog.identical, schemaCatalog.holds], [true, false], 'the same compiler compiles both sides, so only the changed path fails the commit');
    // Export resolution decides which module the compiler loads, so redirecting a package's exports fails like changing the module: the
    // same compiler compiles both sides and the digest cannot show it. A growth pull request never touches these files.
    const redirect = (name) => repo.variant((edit) => edit(`packages/${name}/package.json`, jsonEdit((manifest) => ({ ...manifest, exports: { ...manifest.exports, '.': './src/elsewhere.mjs' } }))));
    const [, redirectCommit] = derive(await redirect('schema'));
    assert.deepEqual(redirectCommit.digestAffectingPathsChanged, ['packages/schema/package.json']);
    const redirected = await catalogAcrossCommit({ cwd, ...redirectCommit });
    assert.deepEqual([redirected.identical, redirected.holds], [true, false], 'a redirected schema export leaves the digest alone and fails the commit');
    for (const name of ['tokens', 'catalog']) assert.deepEqual(derive(await redirect(name))[1].digestAffectingPathsChanged, [`packages/${name}/package.json`], `a redirected ${name} export is a digest-affecting change`);
    // A commit that changes only a pattern validator, which writes nothing to the compiled output, is not held to the compiler paths.
    const withValidator = await repo.variant((edit) => edit('packages/catalog/src/pattern-content.mjs', (text) => `${text}\n// changed\n`));
    assert.deepEqual(derive(withValidator)[1].digestAffectingPathsChanged, []);

    // Decision 0028 removed `authorityDecisionPath` from the source manifest and the compiler rejects it, so trees from before then compile with that one key
    // dropped, on both sides. It is not an escape hatch: any other unknown manifest key still fails the compiler.
    const manifestEdit = (change) => jsonEdit((manifest) => ({ ...manifest, ...change }));
    const legacy = await repo.modify((edit) => edit('packages/catalog/catalog-sources.json', manifestEdit({ authorityDecisionPath: 'decisions/0017-text-family-admission.md' })));
    await repo.edit('README.md', (text) => `${text}\nLegacy.\n`);
    gitIn(cwd, 'add', '-A');
    gitIn(cwd, 'commit', '-q', '-m', 'a later change to a tree with the legacy manifest key (#105)');
    const legacyChild = gitIn(cwd, 'rev-parse', 'HEAD');
    const acrossLegacy = await catalogAcrossCommit({ cwd, commit: legacyChild, parent: legacy, excludedDirectories: [], digestAffectingPathsChanged: [] });
    assert.deepEqual([acrossLegacy.identical, acrossLegacy.holds], [true, true], 'trees that carry the removed manifest key compile on both sides');
    const acrossAdded = await catalogAcrossCommit({ cwd, commit: legacy, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] });
    assert.deepEqual([acrossAdded.identical, acrossAdded.holds], [true, true], 'the key is dropped from the tree that carries it, and the one that does not is unchanged');
    const unknownKey = await repo.modify((edit) => edit('packages/catalog/catalog-sources.json', manifestEdit({ unexpectedKey: true })));
    await assert.rejects(catalogAcrossCommit({ cwd, commit: unknownKey, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), /MUXUI_CATALOG_SOURCE_INVALID/u, 'any other unknown manifest key still fails');

    // Renames are not tracked: a commit that renames, moves, or deletes the directory or record of a block added since the close-out fails, whatever
    // the block is called at the head, because the two sides could not exclude it consistently and its earlier commits would go unaudited.
    const movedMessage = /BL1_GROWTH_BLOCK_MOVED: .* the growth block .*; rename or remove a growth block in a separate, non-growth change/u;
    const renamed = await repo.modify(async (edit, root) => {
      const target = join(dirname(directoryB), 'zz-renamed-block');
      await cp(join(root, directoryB), join(root, target), { recursive: true });
      await rm(join(root, directoryB), { recursive: true });
      await edit('packages/catalog/catalog-sources.json', (text) => text.replaceAll(`${directoryB}/`, `${target}/`));
    });
    assert.throws(() => derive(renamed), movedMessage, 'a growth block renamed after its addition');
    const deleted = await repo.modify(async (edit, root) => {
      await rm(join(root, directoryB), { recursive: true });
      await edit('packages/catalog/catalog-sources.json', jsonEdit((manifest) => ({ ...manifest, records: manifest.records.filter(({ path }) => !path.startsWith(`${directoryB}/`)) })));
    });
    assert.throws(() => derive(deleted, [patternA]), movedMessage, 'a growth block deleted after its addition');
    // Only the record's move counts: the other blocks, and later edits to an unmoved block, are untouched by this rule.
    assert.doesNotThrow(() => derive(edited));
  } finally {
    await repo.dispose();
  }
});

// The digest-affecting paths are the compiler and what it runs; a new module the compiler imports must be classified, not missed.
test('the BL1 growth scope lists every module the catalog compiler runs that can move the digest', async () => {
  const { digestAffectingPaths } = await import('../../../../tests/evidence/bl1/growth-scope.mjs');
  const compiler = await readFile(join(repositoryRoot, 'packages/catalog/src/compiler.mjs'), 'utf8');
  const imports = [...compiler.matchAll(/^import[\s\S]*?from '([^']+)';/gmu)].map(([, specifier]) => specifier).filter((specifier) => !specifier.startsWith('node:'));
  assert.deepEqual(imports.sort(), ['./pattern-content.mjs', './pattern-imports.mjs', '@muxui/schema', '@muxui/tokens'], 'a new import of the compiler is classified here and in digestAffectingPaths');
  for (const path of ['packages/catalog/src/compiler.mjs', 'packages/schema/src', 'packages/schema/schemas', 'packages/tokens/src']) assert.ok(digestAffectingPaths.includes(path), `${path} is digest-affecting`);
  // Export resolution picks the module each package loads, so the three package manifests are listed too.
  for (const name of ['catalog', 'schema', 'tokens']) assert.ok(digestAffectingPaths.includes(`packages/${name}/package.json`), `packages/${name}/package.json decides which module the compiler loads`);
  assert.deepEqual(parseGrowthToolPaths(await readFile(join(repositoryRoot, growthScopeTool), 'utf8'), 'the working tree'), digestAffectingPaths, 'the constant the integrity test parses from the tool source is the one the tool exports');
  // The two validators only reject records: neither is listed, and the compiler throws on their issues before it builds any artifact.
  assert.ok(!digestAffectingPaths.some((path) => /pattern-(?:content|imports)/u.test(path)));
  assert.match(compiler, /if \(importIssues\.length \+ contentIssues\.length > 0\) \{\s*throw new SchemaValidationError/u);
});

// ---- Decision 0029: thresholds, the informational growth gate, re-scoped release checks, and content-review coverage. ----

test('a BL1 threshold change is refused unless it is logged, and no expectation is ever removed', async () => {
  const { assertThresholdsLogged, loadThresholds, thresholdRevisionProblems } = await import('../../../../tests/evidence/bl1/regression.mjs');
  const closeout = await retainedCloseout();
  const current = JSON.parse(await readFile(join(repositoryRoot, bl1, 'verification.json'), 'utf8')).sourceRevision;
  const now = await loadThresholds();
  // The standing guard: the thresholds in the working tree differ from the close-out's, and from the last retained capture's, only in logged ways.
  assert.deepEqual(thresholdRevisionProblems(await loadThresholds(closeout.sourceRevision), now), [], 'every change since the close-out is logged');
  assert.deepEqual(thresholdRevisionProblems(await loadThresholds(current), now), [], 'every change since the last retained capture is logged');

  const limit = 'denseBudgets.examplesSection.variantSourceLexemes';
  const problems = (change, before = now) => {
    const after = structuredClone(before);
    change(after);
    return thresholdRevisionProblems(before, after);
  };
  // An entry states its exact transition: a query field `from` and `to` (a list field `added` and `removed`), or a limit by its path.
  const entry = (extra) => ({ change: 'raised', reason: 'a stated reason', ...extra });
  const query = (thresholds, name) => thresholds.discovery.queries.find((candidate) => candidate.query === name);
  const collections = (thresholds) => query(thresholds, 'collections');
  const component = (thresholds) => thresholds.discovery.queries.find(({ firstWithoutPatterns }) => firstWithoutPatterns);
  const raise = (after, from, to) => {
    collections(after).expectedWithin = to;
    after.provenance.revisions.push(entry({ query: 'collections', field: 'expectedWithin', from, to, afterFirstMeasurement: true }));
  };

  // A revised expectation, a changed list, a changed limit or budget, and a changed metric each need a new entry that names the exact transition.
  assert.deepEqual(problems(() => {}), []);
  assert.match(problems((after) => { collections(after).expectedWithin += 1; })[0], /the query "collections" field expectedWithin changed from 4 to 5 with no new entry in provenance\.revisions that continues it/u);
  assert.match(problems((after) => { component(after).relevant.push('muxui:pattern:x'); })[0], /field relevant changed \(added \[muxui:pattern:x\]; removed \[\]\) with no new entry/u);
  assert.match(problems((after) => { component(after).relevant.pop(); })[0], /field relevant changed \(added \[\]; removed \[.+\]\) with no new entry/u);
  assert.match(problems((after) => { collections(after).knownWeakness = 'something else'; })[0], /field knownWeakness changed from .* to "something else"/u);
  assert.match(problems((after) => { collections(after).extra = true; })[0], /field extra changed from null to true/u);
  assert.match(problems((after) => { after.denseBudgets.examplesSection.variantSourceLexemes += 100; })[0], new RegExp(`${limit} changed from 700 to 800 with no new entry`, 'u'));
  assert.match(problems((after) => { after.discovery.minimumMeanPrecisionAt3 = 0.1; })[0], /discovery\.minimumMeanPrecisionAt3 changed from 0\.5 to 0\.1 with no new entry/u);
  assert.match(problems((after) => { after.search.maximumDisplacedComponentQueries = 3; })[0], /search\.maximumDisplacedComponentQueries changed from 0 to 3 with no new entry/u);

  // An entry covers exactly the transition it states. The backfilled 3 -> 4 entry for `collections` does not cover 4 -> 999, and neither does an
  // entry for the wrong field, the wrong starting value, the wrong end value, or another query.
  assert.match(problems((after) => { collections(after).expectedWithin = 999; })[0], /changed from 4 to 999/u);
  const wrong = (extra) => problems((after) => { collections(after).expectedWithin = 999; after.provenance.revisions.push(entry({ query: 'collections', field: 'expectedWithin', from: 4, to: 999, ...extra })); });
  assert.deepEqual(wrong({}), [], 'the exact transition is covered');
  assert.deepEqual(wrong({ afterFirstMeasurement: true }), [], 'and so is one disclosed as made after a first measurement, as collections is already listed');
  assert.match(wrong({ from: 3 })[0], /changed from 4 to 999/u);
  assert.match(wrong({ to: 998 })[0], /changed from 4 to 999/u);
  assert.match(wrong({ field: 'expectedId' })[0], /changed from 4 to 999/u);
  assert.match(wrong({ query: 'poster grid' })[0], /changed from 4 to 999/u);
  // The same holds for a list and for a limit, and a chain of entries is followed in order.
  assert.deepEqual(problems((after) => {
    component(after).relevant.push('muxui:pattern:x');
    after.provenance.revisions.push(entry({ query: component(after).query, field: 'relevant', added: ['muxui:pattern:x'], removed: [] }));
  }), []);
  assert.match(problems((after) => {
    component(after).relevant.push('muxui:pattern:x');
    after.provenance.revisions.push(entry({ query: component(after).query, field: 'relevant', added: ['muxui:pattern:y'], removed: [] }));
  })[0], /added \[muxui:pattern:x\]/u);
  assert.deepEqual(problems((after) => {
    after.denseBudgets.examplesSection.variantSourceLexemes += 100;
    after.provenance.revisions.push(entry({ limit, from: 700, to: 800 }));
  }), []);
  assert.match(problems((after) => {
    after.denseBudgets.examplesSection.variantSourceLexemes += 100;
    after.provenance.revisions.push(entry({ limit, from: 700, to: 900 }));
  })[0], new RegExp(`${limit} changed from 700 to 800`, 'u'));
  assert.deepEqual(problems((after) => {
    after.denseBudgets.examplesSection.variantSourceLexemes += 200;
    after.provenance.revisions.push(entry({ limit, from: 700, to: 800 }), entry({ limit, from: 800, to: 900 }));
  }), [], 'two entries that chain from the base value to the current one');
  assert.match(problems((after) => {
    after.denseBudgets.examplesSection.variantSourceLexemes += 200;
    after.provenance.revisions.push(entry({ limit, from: 800, to: 900 }));
  })[0], /changed from 700 to 900/u, 'an entry that does not start at the base value is history, not a cover');

  // An expectation is never removed: not the query, not its expectation fields, not the flag that makes them bind.
  assert.match(problems((after) => { after.discovery.queries = after.discovery.queries.slice(1); })[0], /was removed; an expectation is never removed/u);
  assert.match(problems((after) => { const { expectedFirst: _first, ...rest } = after.discovery.queries[0]; after.discovery.queries[0] = rest; })[0], /has no expectation/u);
  assert.ok(problems((after) => { after.discovery.everyQueryMeetsItsExpectation = false; }).some((problem) => /no longer bind/u.test(problem)));

  // An entry names one thing that exists, its field, its transition, what changed and why; an entry made after a first measurement is listed as such.
  assert.match(problems((after) => { after.provenance.revisions.push(entry({ query: 'collections', limit, field: 'expectedWithin', from: 1, to: 2 })); })[0], /names exactly one of a query or a limit/u);
  assert.match(problems((after) => { after.provenance.revisions.push(entry({ query: 'no such query', field: 'relevant', added: [], removed: [] })); })[0], /names the query "no such query", which is not in the thresholds/u);
  assert.match(problems((after) => { after.provenance.revisions.push(entry({ limit: 'denseBudgets.nothing', from: 1, to: 2 })); })[0], /names the value denseBudgets\.nothing/u);
  assert.match(problems((after) => { after.provenance.revisions.push(entry({ query: 'collections', field: 'expectedWithin', from: 4, to: 4, reason: ' ' })); })[0], /does not say its reason/u);
  assert.match(problems((after) => { after.provenance.revisions.push(entry({ query: 'collections', from: 4, to: 4 })); })[0], /does not name the field of "collections"/u);
  assert.match(problems((after) => { after.provenance.revisions.push(entry({ query: 'collections', field: 'expectedWithin' })); })[0], /does not state its transition: from and to, or added and removed/u);
  assert.match(problems((after) => { after.provenance.revisions.push(entry({ limit, added: [], removed: [] })); })[0], /does not state its transition: from and to$/u);
  assert.match(problems((after) => { after.provenance.revisions.push(entry({ query: 'poster grid', field: 'expectedFirst', from: 'a', to: 'a', afterFirstMeasurement: true })); })[0], /must be listed in provenance\.revisedAfterFirstMeasurement/u);
  assert.deepEqual(problems((after) => {
    after.provenance.revisions.push(entry({ query: 'poster grid', field: 'expectedFirst', from: 'a', to: 'a', afterFirstMeasurement: true }));
    after.provenance.revisedAfterFirstMeasurement.push('poster grid');
  }), []);
  assert.match(problems((after) => { after.provenance.revisions.push(entry({ limit, from: 700, to: 700, afterFirstMeasurement: true })); })[0], /never fitted to a result/u);

  // The log and the list of expectations revised after a first measurement only grow, and a dropped entry leaves its own revision unlogged.
  assert.match(problems((after) => { after.provenance.revisions.pop(); })[0], /dropped or changed an earlier entry for menu; the log only grows/u);
  const withoutFirstEntry = structuredClone(now);
  withoutFirstEntry.provenance.revisions.shift();
  assert.match(thresholdRevisionProblems(await loadThresholds(closeout.sourceRevision), withoutFirstEntry)[0], /"collections" field expectedWithin changed from 3 to 4 with no new entry/u);
  assert.ok(problems((after) => { after.provenance.revisedAfterFirstMeasurement.pop(); }).some((problem) => /the list only grows/u.test(problem)));

  // The refusal the capture makes, against the real revisions. The same 4 -> 999 is refused against the close-out (3 -> 4 is followed, 999 is not
  // reached) and against the last retained capture (which has 4, and for which the backfilled entry is history); logged, it is accepted against both.
  assert.deepEqual(await assertThresholdsLogged({ closeoutRevision: closeout.sourceRevision, previousRevision: current, thresholds: now }), []);
  const unlogged = structuredClone(now);
  collections(unlogged).expectedWithin = 999;
  await assert.rejects(assertThresholdsLogged({ closeoutRevision: closeout.sourceRevision, thresholds: unlogged }), /BL1_THRESHOLDS_UNLOGGED: .*field expectedWithin changed from 3 to 999/su);
  await assert.rejects(assertThresholdsLogged({ closeoutRevision: closeout.sourceRevision, previousRevision: current, thresholds: unlogged }), /BL1_THRESHOLDS_UNLOGGED: .*since the capture at [0-9a-f]{8}: the query "collections" field expectedWithin changed from 4 to 999/su);
  await assert.rejects(assertThresholdsLogged({ closeoutRevision: closeout.sourceRevision, previousRevision: 'HEAD', thresholds: unlogged }), /BL1_THRESHOLDS_UNLOGGED: .*since the capture at HEAD: the query "collections" field expectedWithin changed from 4 to 999/su);
  const logged = structuredClone(now);
  raise(logged, 4, 999);
  assert.deepEqual(await assertThresholdsLogged({ closeoutRevision: closeout.sourceRevision, previousRevision: current, thresholds: logged }), []);
  await assert.rejects(assertThresholdsLogged({ closeoutRevision: closeout.sourceRevision, thresholds: { ...now, discovery: { ...now.discovery, queries: now.discovery.queries.slice(1) } } }), /BL1_THRESHOLDS_UNLOGGED: .*an expectation is never removed/su);
});

/**
 * The retained growth capture made before Decision 0029 (no growth gate), at its source revision: the current capture, or the one
 * archived when a later capture replaced it. Forged into an informational capture for the tests below.
 */
async function retainedLegacyGrowth() {
  const { retainedCaptures } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const legacy = (await retainedCaptures({ outputRoot: repositoryRoot, root: bl1 })).find(({ sourceRevision }) => sourceRevision === 'a7237f58d8706ec54d21b88e0363241a936695f0');
  assert.ok(legacy, 'the growth capture at a7237f58 is retained');
  return legacy;
}

/**
 * That capture forged into one made under Decision 0029: the informational growth gate, the scoped audit recomputed with it, the
 * non-claim on E-BL1-08 and E-BL1-09, the page widths' source, the content-review coverage table, and the threshold revision log.
 * Its source revision predates the gate, so the tools of this checkout stand in as the bound ones (`growthToolRevision: 'HEAD'`) and its
 * thresholds are read at HEAD (`thresholdsRevision`).
 */
async function forgeInformational(capture) {
  const { auditBoundary, growthScopedChecks } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  const { parseThresholds } = await import('../../../../tests/evidence/bl1/regression.mjs');
  const forged = structuredClone(capture);
  const source = capture.index.sourceRevision;
  forged.verification.growthGate = 'informational';
  for (const tool of forged.verification.proofTools) {
    if ([growthScopeTool, boundaryAuditTool].includes(tool.path)) tool.sha256 = digest(readAtRevision(repositoryRoot, 'HEAD', tool.path));
  }
  const audit = forged.artifacts['E-BL1-09'].observations.audit;
  const scoped = auditBoundary({ head: source, growthCommits: audit.growthScope.commits.map(({ commit }) => commit), growthGate: 'informational', offline: true, only: growthScopedChecks, closeoutBase: null });
  audit.growthScope = scoped.growthScope;
  audit.checks = audit.checks.map((check) => scoped.checks.find(({ id }) => id === check.id) ?? check);
  for (const id of ['E-BL1-08', 'E-BL1-09']) forged.records[id].nonClaims.push('A growth commit may change @muxui/react, dependencies, and component records; this record lists what it changed and claims nothing about it.');
  forged.artifacts['E-BL1-08'].observations.growthScope.gate = 'informational';
  Object.assign(forged.artifacts['E-BL1-06'].observations.pageWidths, { source: pageWidthsSource, blob: gitOut('rev-parse', `${source}:${pageWidthsSource}`) });
  const { review } = forged.artifacts['E-BL1-10'].observations;
  forged.artifacts['E-BL1-10'].observations.reviewCoverage = {
    rule: 'forged',
    rows: catalogAt(source).patternSlugs.map((block) => ({
      block,
      key: expectedCoverageKey(source, block, boundNonRenderingSources('HEAD')),
      review: { artifact: review.artifact, reviewer: review.reviewer, reviewedRevision: review.reviewedRevision, reviewedTree: review.reviewedTree, keyAtReviewedRevision: expectedCoverageKey(review.reviewedRevision, block, boundNonRenderingSources('HEAD')) },
    })),
  };
  const logged = parseThresholds(readAtRevision(repositoryRoot, 'HEAD', forged.artifacts['E-BL1-11'].observations.thresholds.path));
  forged.artifacts['E-BL1-11'].observations.revisionLog = { rule: 'forged', entries: (logged.provenance.revisions ?? []).length, unlogged: [] };
  return forged;
}

test('an informational BL1 growth capture is held to what it claims, and a capture made before Decision 0029 stays strict', async () => {
  const closeout = await retainedCloseout();
  const legacy = await retainedLegacyGrowth();
  const capture = await loadCapture({ directory: legacy.directory });
  const options = { closeoutRevision: closeout.sourceRevision, growthToolRevision: 'HEAD', thresholdsRevision: 'HEAD' };
  const informational = await forgeInformational(capture);
  assert.equal((await assertCapture(informational, options)).scope, 'growth');
  const rejects = (change, message, base = informational, withOptions = options) => {
    const forged = structuredClone(base);
    change(forged);
    return assert.rejects(assertCapture(forged, withOptions), (error) => error.message.includes(message), message);
  };
  const audit = (forged) => forged.artifacts['E-BL1-09'].observations.audit;
  const check = (forged, id) => audit(forged).checks.find((candidate) => candidate.id === id);

  // The non-claim is present on both records.
  await rejects(({ records }) => { records['E-BL1-09'].nonClaims = records['E-BL1-09'].nonClaims.filter((claim) => !/^A growth commit may change/u.test(claim)); }, 'E-BL1-09 states that a growth commit may change @muxui/react');
  await rejects(({ records }) => { records['E-BL1-08'].nonClaims = records['E-BL1-08'].nonClaims.filter((claim) => !/^A growth commit may change/u.test(claim)); }, 'E-BL1-08 states that a growth commit may change @muxui/react');
  // The legs recorded without gating are those of the bound tool: a record cannot widen them to hide a failing gate.
  await rejects((forged) => { audit(forged).growthScope.informationalLegs['no-workflow-or-hosting-config'] = ['workflowsUnchanged']; }, 'E-BL1-09 records the informational legs of the bound tool and no others');
  await rejects((forged) => { check(forged, 'no-workflow-or-hosting-config').informationalLegs = ['workflowsUnchanged']; }, 'records the informational legs of the bound tool and no others');
  await rejects((forged) => { delete check(forged, 'react-source-files').informationalLegs; }, 'records the informational legs of the bound tool and no others');
  // A gate leg that fails is not accepted, and no leg is recorded as other than git gives it, informational or not.
  await rejects((forged) => { const workflow = check(forged, 'no-workflow-or-hosting-config'); workflow.legs.workflowsUnchanged = false; workflow.pass = false; }, 'E-BL1-09: every audit check passes');
  await rejects((forged) => { check(forged, 'no-workflow-or-hosting-config').legs.workflowsUnchanged = false; }, 'the recorded legs are the legs git gives');
  await rejects((forged) => { check(forged, 'react-source-files').legs.onlyKnownPaths = false; }, 'the recorded legs are the legs git gives');
  await rejects((forged) => { check(forged, 'versions-follow-decision-0026').legs.onlyDecidedVersionsChanged = false; }, 'the recorded legs are the legs git gives');
  // Nothing recorded per commit is taken on trust: parents, per-commit legs, changed files, dependency fields, records, and subjects are what git gives.
  const observed = 'E-BL1-09: the recorded scoped checks, per-commit observations included, are what git gives';
  await rejects((forged) => { check(forged, 'react-package-manifest').observations.commits[0].parent = 'f'.repeat(40); }, observed);
  await rejects((forged) => { check(forged, 'react-package-manifest').observations.commits[0].legs.manifestUnchanged = false; }, observed);
  await rejects((forged) => { check(forged, 'react-source-files').observations.commits[0].observations.bl1PullRequestCommits[0].nonTestReactFiles = ['packages/react/src/imaginary.mjs']; }, observed);
  await rejects((forged) => { check(forged, 'react-source-files').observations.commits[1].observations.nonTestChangesInRange.push('packages/react/src/imaginary.mjs'); }, observed);
  await rejects((forged) => { check(forged, 'no-dependency-change').observations.commits[0].observations.dependencyChanges.push({ path: 'packages/react/package.json', field: 'dependencies' }); }, observed);
  await rejects((forged) => { check(forged, 'no-new-component-token-capability-or-platform').observations.commits[0].observations.changedCatalogRecords.push('catalog/components/button/artifact.json'); }, observed);
  await rejects((forged) => { check(forged, 'react-package-manifest').claim = 'A growth commit changed nothing.'; }, observed);
  await rejects((forged) => { audit(forged).growthScope.commits[0].subject = 'another subject'; }, 'E-BL1-09: the recorded growth scope, its commits and their subjects included, is what git gives');
  // The gate is recorded once and only on a growth capture.
  await rejects((forged) => { delete forged.verification.growthGate; }, 'a capture without growthGate records one review of the whole catalog/patterns tree');
  await rejects((forged) => { forged.verification.growthGate = 'advisory'; }, 'growthGate is absent');
  await rejects((forged) => { delete forged.artifacts['E-BL1-08'].observations.growthScope.gate; }, 'E-BL1-08 records the per-commit digest comparison as an observation');
  const closeoutCapture = await loadCapture({ directory: closeout.directory });
  closeoutCapture.verification.growthGate = 'informational';
  await assert.rejects(assertCapture(closeoutCapture), (error) => error.message.includes('growthGate is absent'), 'a close-out capture has no growth gate');

  // An unlogged threshold change is refused: against the close-out, and against the capture this one replaces.
  await assert.rejects(assertCapture(informational, { ...options, thresholdsRevision: capture.index.sourceRevision }), (error) => error.message.includes('every threshold change since the close-out is logged'));
  await rejects((forged) => { forged.artifacts['E-BL1-11'].observations.revisionLog.unlogged = ['collections']; }, 'E-BL1-11 records no unlogged threshold change');
  await rejects((forged) => { forged.artifacts['E-BL1-11'].observations.revisionLog.entries += 1; }, 'E-BL1-11 counts the log entries');
  await rejects((forged) => { delete forged.artifacts['E-BL1-11'].observations.revisionLog; }, 'revisionLog');

  // The page widths are the code's at the source revision.
  await rejects((forged) => { forged.artifacts['E-BL1-06'].observations.pageWidths.widths.pop(); }, 'E-BL1-06 captures the page widths the docs presets module lists at the source revision');
  await rejects((forged) => { forged.artifacts['E-BL1-06'].observations.pageWidths.blob = 'c'.repeat(40); }, 'E-BL1-06 names the module and blob the widths were read from');

  // A content review covers a block only for the tree it read, and every block needs one.
  const rows = (forged) => forged.artifacts['E-BL1-10'].observations.reviewCoverage.rows;
  await rejects((forged) => { rows(forged).pop(); }, 'E-BL1-10 covers every block with a retained review');
  await rejects((forged) => { rows(forged)[0].key.blockTree = 'c'.repeat(40); }, 'is covered at the key its sources, participants, and React runtime have at the source revision');
  await rejects((forged) => { rows(forged)[0].key.participants[0].tree = 'c'.repeat(40); }, 'is covered at the key its sources, participants, and React runtime have at the source revision');
  await rejects((forged) => { rows(forged)[0].key.participants.pop(); }, 'is covered at the key its sources, participants, and React runtime have at the source revision');
  await rejects((forged) => { rows(forged)[0].key.reactRuntime.digest = `sha256:${'0'.repeat(64)}`; }, 'is covered at the key its sources, participants, and React runtime have at the source revision');
  await rejects((forged) => { rows(forged)[0].key.reactRuntime.excluded = []; }, 'is covered at the key its sources, participants, and React runtime have at the source revision');
  await rejects((forged) => { rows(forged).at(-1).review.reviewedRevision = closeout.sourceRevision; }, 'the row for workspace-navigation records the key at its review\'s reviewed revision');
  await rejects((forged) => { rows(forged)[0].review.reviewedTree = 'c'.repeat(40); }, 'keeps its review\'s own reviewed tree');
  await rejects((forged) => { rows(forged)[0].review.artifact.sha256 = `sha256:${'0'.repeat(64)}`; }, 'is retained at its digest');
  await rejects((forged) => { delete forged.artifacts['E-BL1-10'].observations.reviewCoverage; }, 'reviewCoverage');

  // A capture without growthGate cannot borrow any of it: the same records are held to the strict facts.
  assert.equal((await assertCapture(capture, { closeoutRevision: closeout.sourceRevision })).scope, 'growth');
  const strict = (change, message) => rejects(change, message, capture, { closeoutRevision: closeout.sourceRevision });
  await strict((forged) => { audit(forged).growthScope.informationalLegs = { 'react-source-files': ['onlyKnownPaths'] }; }, 'a capture without growthGate gates every leg');
  await strict((forged) => { check(forged, 'react-source-files').informationalLegs = ['onlyKnownPaths']; }, 'records the informational legs of the bound tool and no others');
  await strict((forged) => { forged.artifacts['E-BL1-11'].observations.revisionLog = { entries: 0, unlogged: [] }; }, 'a capture without growthGate records no revision log');
  await strict((forged) => { forged.artifacts['E-BL1-10'].observations.reviewCoverage = { rows: [] }; }, 'a capture without growthGate records one review of the whole catalog/patterns tree');
  await strict((forged) => { forged.artifacts['E-BL1-09'].observations.audit.checks.find(({ id }) => id === 'react-source-files').legs.onlyKnownPaths = false; }, 'the recorded legs are the legs git gives');
  await strict((forged) => { forged.artifacts['E-BL1-08'].observations.growthScope.commits[0].identical = false; }, 'has the same digest before and after');
});

test('an informational growth gate records what a growth commit changed in @muxui/react, dependencies, and component records, and still fails a workflow, a version bump, or a platform', async () => {
  const { auditBoundary, growthInformationalLegs, growthScopedChecks } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  const repo = await growthRepository();
  const { cwd, base, first, second, directoryB } = repo;
  const jsonEdit = (change) => (text) => `${JSON.stringify(change(JSON.parse(text)), null, 2)}\n`;
  const audit = (growth, growthGate) => auditBoundary({ cwd, base, head: growth.at(-1), mergeRevision: base, closeoutBase: null, growthCommits: growth, offline: true, only: growthScopedChecks, growthGate });
  const failed = (growth, growthGate) => audit(growth, growthGate).checks.filter(({ pass }) => !pass).map(({ id }) => id);
  try {
    const reactSource = (await readdir(join(cwd, 'packages/react/src'))).find((name) => name.endsWith('.mjs'));
    // Every check that reads @muxui/react, dependencies, and component records has legs that are recorded and do not gate; the gates are the rest.
    assert.deepEqual(Object.keys(growthInformationalLegs), ['react-package-manifest', 'react-source-files', 'react-stylesheet-names', 'no-dependency-change', 'no-new-component-token-capability-or-platform']);
    assert.deepEqual(growthInformationalLegs['no-new-component-token-capability-or-platform'], ['catalogRecordsUnchanged'], 'web.react-only stays a gate');
    for (const gate of ['no-workflow-or-hosting-config', 'versions-follow-decision-0026']) assert.equal(growthInformationalLegs[gate], undefined, `${gate} gates every leg`);

    const bumpVersion = jsonEdit((manifest) => ({ ...manifest, version: '0.1.0-rc.2' }));
    for (const [label, change, checks] of [
      ['@muxui/react source', (edit) => edit(`packages/react/src/${reactSource}`, (text) => `${text}\n// changed\n`), ['react-source-files']],
      ['the lockfile', (edit) => edit('pnpm-lock.yaml', (text) => `${text}\n# changed\n`), ['no-dependency-change']],
      ['a component record', (edit) => edit('catalog/components/button/artifact.json', jsonEdit((record) => ({ ...record, summary: `${record.summary} Edited.` }))), ['no-new-component-token-capability-or-platform']],
    ]) {
      const commit = await repo.variant(change);
      assert.deepEqual(failed([first, commit]), checks, `${label}: a strict audit fails the commit, as every capture made before Decision 0029 did`);
      const recorded = audit([first, commit], 'informational');
      assert.equal(recorded.pass, true, `${label}: the informational audit passes`);
      assert.deepEqual(recorded.growthScope.informationalLegs, growthInformationalLegs);
      const check = recorded.checks.find(({ id }) => id === checks[0]);
      assert.equal(Object.values(check.legs).includes(false), true, `${label}: the leg is still computed and recorded as failing`);
      assert.deepEqual(check.informationalLegs, growthInformationalLegs[checks[0]]);
      assert.equal(check.observations.commits.length, 2, `${label}: the per-commit list is recorded`);
      assert.match(check.claim, /claims nothing about/u, `${label}: the claim says it claims nothing`);
    }

    // What stays a gate fails a growth commit whatever the gate: a workflow, a hosting file, a version bump, and a platform other than web.react.
    const withWorkflow = await repo.variant((edit) => edit('.github/workflows/ci.yml', (text) => `${text}\n# changed\n`));
    assert.deepEqual(failed([first, withWorkflow], 'informational'), ['no-workflow-or-hosting-config'], 'a growth commit that changes a workflow still fails');
    const withHosting = await repo.variant(() => writeFile(join(cwd, 'netlify.toml'), '[build]\n'));
    assert.deepEqual(failed([first, withHosting], 'informational'), ['no-workflow-or-hosting-config']);
    const withVersion = await repo.variant((edit) => edit('packages/react/package.json', bumpVersion));
    assert.deepEqual(failed([first, withVersion], 'informational'), ['versions-follow-decision-0026'], 'a growth commit that bumps a version fails, and the manifest leg it also changes is recorded');
    const withCatalogVersion = await repo.variant((edit) => edit('packages/catalog/package.json', bumpVersion));
    assert.ok(failed([first, withCatalogVersion], 'informational').includes('versions-follow-decision-0026'), 'the three packages Decision 0026 named may not be bumped by a growth commit either');
    const withPlatform = await repo.variant((edit) => edit(`${directoryB}/artifact.json`, jsonEdit((record) => ({ ...record, platforms: [...record.platforms, 'web.html'] }))));
    assert.deepEqual(failed([first, withPlatform], 'informational'), ['no-new-component-token-capability-or-platform'], 'web.react-only stays a gate');

    // A later release candidate is not a growth commit: it bumps @muxui/react after the growth, and the range from the base blames the growth for it.
    const later = await repo.modify((edit) => edit('packages/react/package.json', bumpVersion));
    const versionsOver = (growthCommits) => auditBoundary({ cwd, base, head: later, mergeRevision: base, closeoutBase: null, growthCommits, offline: true, only: ['versions-follow-decision-0026'] }).pass;
    assert.equal(versionsOver(undefined), false, 'the range from the base fails after a later release candidate');
    assert.equal(versionsOver([first, second]), true, 'the growth commits do not');
    assert.throws(() => audit([first], 'sideways'), /BL1_AUDIT_GROWTH_GATE: unknown growth gate/u);
    assert.throws(() => auditBoundary({ cwd, base, head: first, closeoutBase: null, offline: true, growthGate: 'informational' }), /a growth gate needs growth commits/u);
  } finally {
    await repo.dispose();
  }
});

test('the BL1 registry check passes after a later release candidate and fails when something already published was rewritten', async () => {
  const { auditBoundary, registryProblems } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  const { view } = JSON.parse(readFileSync(join(repositoryRoot, 'tests/evidence/r1-exit/artifacts/registry-observation.json'), 'utf8'));
  const [recordedVersion] = view.versions;
  const recorded = { distTags: view.distTags, integrity: view.integrity, shasum: view.shasum, deprecated: view.deprecated ?? null, versions: view.versions, versionTimes: { [recordedVersion]: view.time[recordedVersion] } };
  const observe = (observed) => auditBoundary({ only: ['registry-unchanged'], closeoutBase: null, observers: { registry: () => ({ observed }) } }).checks[0];
  const failing = (observed) => Object.entries(observe(observed).legs).filter(([, value]) => value === false).map(([leg]) => leg).sort();
  const nextVersion = '0.1.0-rc.2';
  const later = { ...recorded, distTags: { ...recorded.distTags, next: nextVersion }, versions: [recordedVersion, nextVersion], versionTimes: { ...recorded.versionTimes, [nextVersion]: '2099-01-01T00:00:00.000Z' } };

  const unchanged = observe(recorded);
  assert.deepEqual([unchanged.pass, unchanged.observations.laterVersions], [true, []]);
  // A later release candidate publishes a version and moves `next`: listed, not claimed, and not a failure.
  const sequence = observe(later);
  assert.deepEqual([sequence.pass, sequence.observations.laterVersions], [true, [nextVersion]]);
  assert.deepEqual(registryProblems(later, recorded), []);
  // Something the R1 exit published, rewritten, retagged, or removed, is a failure on its own leg.
  assert.deepEqual(failing({ ...later, distTags: { ...later.distTags, latest: nextVersion } }), ['distTags']);
  assert.deepEqual(failing({ ...later, integrity: 'sha512-other' }), ['integrity']);
  assert.deepEqual(failing({ ...later, shasum: 'other' }), ['shasum']);
  assert.deepEqual(failing({ ...later, versionTimes: { ...later.versionTimes, [recordedVersion]: '2099-01-01T00:00:00.000Z' } }), ['versionTimes']);
  assert.deepEqual(failing({ ...later, versions: [nextVersion] }), ['versions']);
  // A deprecation of the recorded version (a Decision 0023 rollback) is a failure too: it needs a reviewed edit of the check, like a re-point of `latest`.
  assert.equal(recorded.deprecated, null, 'the R1 exit read-back records no deprecation');
  assert.deepEqual(failing({ ...later, deprecated: 'rc.1 is bad; use rc.2' }), ['deprecated']);
  assert.deepEqual(failing({ ...recorded, deprecated: 'rc.1 is bad' }), ['deprecated']);
  assert.equal(auditBoundary({ only: ['registry-unchanged'], closeoutBase: null, observers: { registry: () => ({ observed: null, failure: 'unreachable' }) } }).checks[0].legs.registryReadable, false);
});

test('a content review covers a block only for the sources, participants, and React runtime it read, and a capture needs a new review only for a block no retained review covers', async () => {
  const { contentReviewCoverage, coverageKey, nonRenderingReactSources } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const cwd = await mkdtemp(join(tmpdir(), 'muxui-bl1-coverage-'));
  try {
    gitIn(cwd, 'init', '-q', '-b', 'main');
    const pattern = (slug, text, ...components) => ({ [`catalog/patterns/${slug}/artifact.json`]: `${JSON.stringify({ text, participants: components.map((component) => ({ role: component, component: `muxui:component:${component}` })) })}\n` });
    const component = (slug, text) => ({ [`catalog/components/${slug}/artifact.json`]: `${JSON.stringify({ text })}\n` });
    // Block a renders Button; block b renders Button and Text. The Sidebar's default placeholder lives in the runtime and in its record.
    const first = await commitFiles(cwd, {
      ...pattern('a', 'a1', 'button'), ...pattern('b', 'b1', 'button', 'text'),
      ...component('button', 'button1'), ...component('text', 'text1'), ...component('unrelated', 'unrelated1'),
      'packages/react/src/button.mjs': 'export const Button = 1;\n', 'packages/react/src/generate.mjs': 'generate 1\n', 'packages/react/src/r1-contracts.mjs': 'contracts 1\n',
    }, 'a and b');
    const review = (name, reviewedRevision, blocks) => ({ artifact: { path: `reviews/${name}.md`, sha256: `sha256:${name}` }, reviewer: `reviewer ${name}`, reviewedRevision, reviewedTree: gitIn(cwd, 'rev-parse', `${reviewedRevision}^{tree}`), blocks });
    const early = review('early', first, ['a', 'b']);
    const coverage = (source, reviews, patternSlugs = ['a', 'b']) => contentReviewCoverage({ cwd, sourceRevision: source, patternSlugs, reviews });
    const covering = ({ rows }) => Object.fromEntries(rows.map(({ block, review: { artifact } }) => [block, artifact.path]));
    const uncoveredAfter = async (files, message, patternSlugs) => coverage(await commitFiles(cwd, files, message), [early], patternSlugs).uncovered;
    gitIn(cwd, 'tag', 'base');

    // The key is the block's tree, the catalog record tree of each participant, and the runtime files that can render, and it names what it leaves out.
    const key = coverageKey(cwd, first, 'b');
    assert.deepEqual(key.participants.map(({ component: name }) => name), ['muxui:component:button', 'muxui:component:text']);
    assert.equal(key.participants[0].tree, gitIn(cwd, 'rev-parse', `${first}:catalog/components/button`));
    assert.equal(key.blockTree, gitIn(cwd, 'rev-parse', `${first}:catalog/patterns/b`));
    assert.deepEqual([key.reactRuntime.root, key.reactRuntime.files, key.reactRuntime.excluded], ['packages/react/src', 1, nonRenderingReactSources]);
    assert.ok(nonRenderingReactSources.every((path) => path.startsWith('packages/react/src/')) && nonRenderingReactSources.includes('packages/react/src/generate.mjs'));
    assert.equal(coverageKey(cwd, first, 'missing'), null);
    assert.deepEqual(coverage(first, [early]).uncovered, [], 'a review covers what it read');

    // A change that reaches no copy a block renders does not ask for a new review: an unrelated component's record, and a file that renders nothing.
    assert.deepEqual(await uncoveredAfter(component('unrelated', 'unrelated2'), 'an unrelated component changes'), []);
    assert.deepEqual(await uncoveredAfter({ 'packages/react/src/generate.mjs': 'generate 2\n', 'packages/react/src/r1-contracts.mjs': 'contracts 2\n' }, 'the generator and contracts change'), []);
    // A change to a participant's record asks for a new review of the blocks that render that participant, and of no other.
    assert.deepEqual(await uncoveredAfter(component('text', 'text2'), 'Text changes'), ['b']);
    assert.deepEqual(await uncoveredAfter(component('button', 'button2'), 'Button changes'), ['a', 'b']);
    // A change to a runtime source module, which carries a default placeholder or label, asks for a new review of every block.
    assert.deepEqual(await uncoveredAfter({ 'packages/react/src/button.mjs': 'export const Button = 2;\n' }, 'the runtime changes'), ['a', 'b']);
    assert.deepEqual(await uncoveredAfter({ 'packages/react/src/supplemental/index.mjs': 'export const placeholder = "Search";\n' }, 'a runtime module is added'), ['a', 'b']);
    // The block's own sources, as before.
    gitIn(cwd, 'reset', '-q', '--hard', 'base');
    assert.deepEqual(await uncoveredAfter(pattern('b', 'b2', 'button', 'text'), 'b changes'), ['b']);
    gitIn(cwd, 'reset', '-q', '--hard', 'base');
    // A participant added to a block changes the block's own record, and a participant record that did not exist is a different key.
    assert.deepEqual(await uncoveredAfter({ ...pattern('c', 'c1', 'missing') }, 'c is added', ['a', 'b', 'c']), ['c']);
    assert.equal(coverageKey(cwd, 'HEAD', 'c').participants[0].tree, null);

    // The early review is preferred where it covers, a later review covers what the early one cannot, and a review covers only the blocks it names.
    gitIn(cwd, 'reset', '-q', '--hard', 'base');
    const changed = await commitFiles(cwd, component('text', 'text2'), 'Text changes');
    const late = review('late', changed, ['a', 'b']);
    assert.deepEqual(covering(coverage(changed, [early, late])), { a: 'reviews/early.md', b: 'reviews/late.md' }, 'a is untouched by the Text change; b needs the later review');
    assert.deepEqual(covering(coverage(changed, [late, early])), { a: 'reviews/late.md', b: 'reviews/late.md' });
    assert.deepEqual(coverage(changed, [{ ...late, blocks: ['a'] }]).uncovered, ['b']);
    assert.deepEqual(coverage(changed, [{ ...late, reviewedRevision: 'f'.repeat(40) }]).uncovered, ['a', 'b']);
    assert.deepEqual(coverage(changed, [late], ['a', 'missing']).uncovered, ['missing']);
    assert.deepEqual(coverage(changed, []).uncovered, ['a', 'b']);
    // A row keeps the covering review's own reviewed revision, tree, and key.
    const [row] = coverage(changed, [early, late]).rows;
    assert.deepEqual(row, {
      block: 'a',
      key: coverageKey(cwd, changed, 'a'),
      review: { artifact: early.artifact, reviewer: 'reviewer early', reviewedRevision: first, reviewedTree: early.reviewedTree, keyAtReviewedRevision: coverageKey(cwd, first, 'a') },
    });
    assert.deepEqual(row.key, row.review.keyAtReviewedRevision);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('the content reviews earlier BL1 captures retained are the coverage candidates, at the paths they are retained at', async () => {
  const { retainedContentReviews } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const outputRoot = await mkdtemp(join(tmpdir(), 'muxui-bl1-reviews-'));
  const root = 'tests/evidence/bl1';
  const put = async (path, text) => {
    await mkdir(join(outputRoot, path, '..'), { recursive: true });
    await writeFile(join(outputRoot, path), text);
  };
  /** A capture at `directory` that retained `text` as its content review, naming `blocks`. */
  const capture = async (directory, sourceRevision, text, blocks) => {
    await put(`${directory}/verification.json`, JSON.stringify({ scope: 'growth', sourceRevision }));
    await put(`${directory}/artifacts/E-BL1-10-content-review.md`, text);
    await put(`${directory}/artifacts/E-BL1-10.json`, JSON.stringify({ observations: { review: { artifact: { path: `${root}/artifacts/E-BL1-10-content-review.md`, sha256: digest(text) }, reviewer: `reviewer of ${sourceRevision.slice(0, 1)}`, reviewedRevision: sourceRevision, reviewedTree: 't'.repeat(40), blocks } } }));
  };
  try {
    const [revisionA, revisionB, revisionC] = ['a', 'b', 'c'].map((letter) => letter.repeat(40));
    await capture(`${root}/superseded/${'a'.repeat(12)}`, revisionA, 'review of a\n', ['x']);
    await capture(root, revisionB, 'review of b\n', ['x', 'y']);
    // A capture at a new revision replaces the one at the root, whose review is then archived under its own revision.
    assert.deepEqual((await retainedContentReviews({ outputRoot, root, sourceRevision: revisionC })).map(({ artifact, reviewer, blocks }) => [artifact.path, artifact.sha256, reviewer, blocks]), [
      [`${root}/superseded/${'b'.repeat(12)}/artifacts/E-BL1-10-content-review.md`, digest('review of b\n'), 'reviewer of b', ['x', 'y']],
      [`${root}/superseded/${'a'.repeat(12)}/artifacts/E-BL1-10-content-review.md`, digest('review of a\n'), 'reviewer of a', ['x']],
    ]);
    // A rerun at the revision already at the root replaces that review, so it is not a candidate.
    assert.deepEqual((await retainedContentReviews({ outputRoot, root, sourceRevision: revisionB })).map(({ artifact }) => artifact.path), [`${root}/superseded/${'a'.repeat(12)}/artifacts/E-BL1-10-content-review.md`]);
    // A retained review that no longer matches its digest is refused rather than relied on.
    await put(`${root}/artifacts/E-BL1-10-content-review.md`, 'tampered\n');
    await assert.rejects(retainedContentReviews({ outputRoot, root, sourceRevision: revisionC }), /no longer matches its recorded digest/u);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

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

function r1ExitFixture() {
  const head = 'a'.repeat(40);
  const tree = 'b'.repeat(40);
  const version = '0.1.0-rc.1';
  const tarballBytes = Buffer.from('r1 exit fixture tarball');
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
  return { head, tree, version, facts, manifest, artifact, run, job, publishJob, prepareLog, publishLog, dryRunInput, attestationDocument, view, consumer };
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

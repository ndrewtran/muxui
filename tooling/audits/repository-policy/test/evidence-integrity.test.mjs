import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
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

test('the BL1 close-out scope check is skipped only for a growth capture, and the page widths match the amendment', async () => {
  const { auditBoundary } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  const only = ['closeout-scope', 'react-package-manifest'];
  assert.deepEqual(auditBoundary({ offline: true, only }).checks.map(({ id }) => id), ['react-package-manifest', 'closeout-scope']);
  assert.deepEqual(auditBoundary({ offline: true, only, closeoutBase: null }).checks.map(({ id }) => id), ['react-package-manifest']);
  // The capture takes the page widths from the accepted amendment and refuses a docs module that disagrees.
  const { pageWidths } = await import('../../../../apps/docs/src/lib/block-presets.ts');
  const amendment = await readFile(join(repositoryRoot, 'decisions/0026-amendment-01-page-width-presets.md'), 'utf8');
  const widths = [...(/page-width presets are \*\*([^*]+)\*\*/u.exec(amendment)?.[1] ?? '').matchAll(/\d+/gu)].map(([width]) => Number(width));
  assert.deepEqual(widths, [360, 768, 1024, 1280, 1920]);
  assert.deepEqual([...pageWidths], widths);
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
  return { directory, index, verification: await read(into(index.validation.path)), records, artifacts, retained: new Map(index.artifacts.map(({ path, sha256 }) => [path, sha256])) };
}

/** An archived capture is a byte-for-byte copy: every file its index names is in the archive at that digest. */
async function assertCopyMatchesIndex({ repo = repositoryRoot, directory, index }) {
  const into = capturePath(directory);
  for (const { path, sha256 } of [...index.records, ...index.artifacts, index.validation]) {
    if (REVISION_BOUND_INPUTS.has(path)) continue;
    assert.equal(digest(await readFile(join(repo, into(path)))), sha256, `${directory}: ${path} is archived at the digest its index names`);
  }
}

/**
 * The checks every capture passes, then those of its scope: a close-out capture is held to the exact close-out facts,
 * and a growth capture to the facts derived from the catalog, the browser test routes, and the thresholds at its own revision.
 */
async function assertCapture({ directory, index, verification, records, artifacts, retained }) {
  const { thresholdChanges } = await import('../../../../tests/evidence/bl1/regression.mjs');
  const { sourceRevision, sourceTree } = index;
  const { scope } = verification;
  assert.ok(scope === 'close-out' || scope === 'growth', `${directory}: the validation summary records its scope`);
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
  assert.equal(index.supersessions, undefined, 'the index does not use the applicability-certificate supersessions list');

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

  // E-BL1-04: every variant page is audited, and every block browser test the policy routes passes in every engine.
  const { storybook, browser } = artifacts['E-BL1-04'].observations;
  assert.deepEqual([...storybook.selection.families].sort(), catalog.patternSlugs, 'E-BL1-04 audits every block');
  assert.equal(storybook.selection.pages.length, catalog.variantIds.length, 'E-BL1-04 audits every variant page');
  assert.deepEqual([...browser.files].sort(), catalog.browserTests, 'E-BL1-04 runs the block browser tests the policy routes');
  assert.equal(browser.engineRuns.length, browser.files.length * browser.engines.length, 'E-BL1-04 runs each test in each engine');
  const results = browser.proof.tests;
  assert.ok(results.fail === 0 && results.cancelled === 0 && results.skipped === 0 && results.pass === results.tests && results.pass >= browser.engineRuns.length, 'E-BL1-04: every browser result passes');

  // E-BL1-05 and E-BL1-07: every pattern and variant is covered by the docs check and the parity matrix.
  const docs = artifacts['E-BL1-05'].observations.counts;
  assert.deepEqual([docs.patterns, docs.variantPages], [catalog.patternIds.length, catalog.variantIds.length], 'E-BL1-05 covers every pattern and variant');
  const matrix = artifacts['E-BL1-07'].observations.matrix;
  assert.deepEqual([[...matrix.patterns].sort(), [...matrix.variants].sort(), matrix.rowCount], [catalog.patternIds, catalog.variantIds, matrix.rows.length], 'E-BL1-07 covers every pattern and variant');

  // E-BL1-06: every capture is retained at its digest, and none overflows.
  const visual = artifacts['E-BL1-06'].observations;
  assert.deepEqual(visual.pageWidths.widths, [360, 768, 1024, 1280, 1920]);
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
  // #227 is stated, not hidden, and is not called BL1.
  const reactSource = boundary.audit.checks.find(({ id }) => id === 'react-source-files').observations;
  assert.deepEqual(reactSource.nonBl1Changes.map(({ pullRequest, bl1: isBl1 }) => [pullRequest, isBl1]), [[227, false]]);
  assert.match(records['E-BL1-09'].claim, /BL1 evidence validates the package after it/u);

  // Independent reviews: each is retained at its digest, names its own reviewed revision, and records how its tree compares with the source tree.
  const content = artifacts['E-BL1-10'].observations;
  assert.deepEqual(content.scan.failures, []);
  assert.equal(content.scan.variantSources, catalog.variantIds.length, 'E-BL1-10 scans every variant source');
  assert.equal(content.review.verdict, 'pass');
  assert.deepEqual([...content.review.blocks].sort(), catalog.patternSlugs, 'E-BL1-10 reviews every block');
  assert.equal(content.review.reviewedCatalogPatternsTree, gitOut('rev-parse', `${sourceRevision}:catalog/patterns`), 'E-BL1-10: the reviewer read the block sources this capture scanned');
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
  const thresholds = JSON.parse(thresholdBytes.toString('utf8'));
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

  if (scope === 'close-out') {
    // The close-out facts stay pinned, so a later change to the derivations above cannot soften what the close-out claims.
    assert.equal(typecheck.variants.length, 5, 'the close-out covers five variants');
    assert.deepEqual([results.pass, results.tests], [57, 57], 'the close-out passes 57 of 57 browser results');
    assert.equal(matrix.rows.length, 79, 'the close-out compares 79 parity rows');
    assert.deepEqual([boundary.audit.checks.length, boundary.audit.checks.filter(({ pass }) => pass).length], [13, 13], 'the close-out passes 13 of 13 audit checks');
    assert.equal(boundary.closeoutScope.run, true, 'the close-out runs the close-out scope check');
    assert.ok(boundary.audit.checks.some(({ id }) => id === 'closeout-scope'));
    assert.deepEqual([revised.length, queries.length], [9, 21], 'the close-out revised 9 of 21 expectations');
    assert.equal(baseline.thresholdChanges, undefined, 'the close-out lists no threshold changes');
    assert.equal(content.review.advisoryLines.length >= 3, true);
    assert.notEqual(exitReview, null, 'the close-out retains the independent exit review');
    assert.deepEqual([exitReview.comparison.equalTrees, exitReview.comparison.changedPathCount, exitReview.comparison.proofToolsChangedSinceReviewed], [true, 0, []], 'the exit review read the source tree and the tools that ran');
    // The earlier E-BL1-08 and E-BL1-11 records are named by their successors, never silently replaced.
    assert.deepEqual(Object.entries(records).filter(([, record]) => record.supersedes !== undefined).map(([id, { supersedes }]) => [id, supersedes.sourceRevision]), [['E-BL1-08', 'be6f7c411f03dd7e7d6f4cc50016d4a3d2f65151'], ['E-BL1-11', 'be6f7c411f03dd7e7d6f4cc50016d4a3d2f65151']]);
  } else {
    // A growth capture skips the close-out scope check and says so, and lists how the thresholds changed since the close-out.
    assert.equal(boundary.closeoutScope.run, false, 'a growth capture records that it skipped the close-out scope check');
    assert.ok(!boundary.audit.checks.some(({ id }) => id === 'closeout-scope'));
    const { against, addedPatterns, ...changes } = baseline.thresholdChanges;
    const before = readAtRevision(repositoryRoot, against.revision, against.path);
    assert.equal(digest(before), against.sha256);
    assert.deepEqual(changes, thresholdChanges(JSON.parse(before.toString('utf8')), thresholds), 'E-BL1-11 lists every change to the thresholds since the close-out');
    assert.ok(addedPatterns.length > 0 && addedPatterns.every((id) => catalog.patternIds.includes(id)), 'E-BL1-11 names the added blocks');
    for (const [id, record] of Object.entries(records)) assert.ok(record.supersedes !== undefined, `${id}: a growth capture replaces the capture before it`);
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

// The retained evidence covers E-BL1-01 to E-BL1-11 at one source revision that is in main's history, keeps its
// disclosures, and cites only excerpts and captures the index retains. Every capture under the root is checked.
test('BL1 retained evidence covers every assertion at one source revision and keeps its disclosures', async () => {
  const { assertGrowthSource, measuredPatternIds, retainedCaptures } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const captures = await retainedCaptures({ outputRoot: repositoryRoot, root: bl1 });
  assert.equal(captures[0].directory, bl1, 'the current capture is retained');
  assert.ok(captures.some(({ scope }) => scope === 'close-out'), 'a close-out capture is retained, current or archived');
  for (const { directory, scope } of captures) {
    // A capture older than scopes is kept for its supersession chain, which the capture that replaced it names.
    if (scope === undefined) continue;
    const capture = await loadCapture({ directory });
    if (directory !== bl1) await assertCopyMatchesIndex(capture);
    await assertCapture(capture);
  }
  if (captures[0].scope === 'growth') {
    // The growth capture adds a block to the close-out it replaced, and its threshold changes are relative to that close-out.
    const baseline = (await loadCapture()).artifacts['E-BL1-11'].observations;
    const { closeout, added } = await assertGrowthSource({ evidenceRoot: repositoryRoot, root: bl1, patternIds: await measuredPatternIds({ outputRoot: repositoryRoot, directory: bl1 }) });
    assert.equal(baseline.thresholdChanges.against.revision, closeout.sourceRevision);
    assert.deepEqual(baseline.thresholdChanges.addedPatterns, added);
  }
});

test('BL1 retained captures are held to their derived and close-out facts, and an archived copy is read from its own directory', async () => {
  const { retainedCaptures } = await import('../../../../tests/evidence/bl1/capture-support.mjs');
  const closeout = (await retainedCaptures({ outputRoot: repositoryRoot, root: bl1 })).find(({ scope }) => scope === 'close-out');
  const capture = await loadCapture({ directory: closeout.directory });
  assert.equal((await assertCapture(capture)).catalog.variantIds.length, 5);
  const tampered = (change) => {
    const forged = structuredClone(capture);
    change(forged);
    return assertCapture(forged);
  };
  const rejects = (change, message) => assert.rejects(tampered(change), (error) => error.message.includes(message), message);

  // Derived from the catalog, the policy routes, and the thresholds at the capture's own revision.
  await rejects(({ artifacts: forged }) => { forged['E-BL1-03'].observations.typecheck.perVariant.variants.pop(); }, 'E-BL1-03 typechecks every variant the catalog declares');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-04'].observations.browser.files.pop(); }, 'E-BL1-04 runs the block browser tests the policy routes');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-11'].observations.thresholds.sha256 = `sha256:${'0'.repeat(64)}`; }, 'E-BL1-11 binds the thresholds committed at the source revision');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-10'].observations.review.reviewedCatalogPatternsTree = 'c'.repeat(40); }, 'the reviewer read the block sources this capture scanned');
  await rejects(({ artifacts: forged }) => { forged['E-BL1-01'].observations.requiredNegatives[0].owner = null; }, 'E-BL1-01: all eight name an owner');
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

  // An archived capture sits under superseded/<revision>/ and cites the root it was written to.
  const outputRoot = await mkdtemp(join(tmpdir(), 'muxui-bl1-archive-'));
  try {
    const archive = `${bl1}/superseded/${capture.index.sourceRevision.slice(0, 12)}`;
    for (const entry of ['index.json', 'verification.json', 'records', 'artifacts', 'validation', 'captures']) {
      await cp(join(repositoryRoot, closeout.directory, entry), join(outputRoot, archive, entry), { recursive: true });
    }
    await cp(join(repositoryRoot, bl1, 'superseded'), join(outputRoot, bl1, 'superseded'), { recursive: true, force: true });
    const archived = await loadCapture({ repo: outputRoot, directory: archive });
    await assertCopyMatchesIndex({ repo: outputRoot, ...archived });
    assert.deepEqual(await assertCapture(archived), await assertCapture(capture));
    await writeFile(join(outputRoot, archive, 'artifacts/E-BL1-05.json'), '{}');
    await assert.rejects(assertCopyMatchesIndex({ repo: outputRoot, ...archived }), /E-BL1-05\.json is archived at the digest its index names/u);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

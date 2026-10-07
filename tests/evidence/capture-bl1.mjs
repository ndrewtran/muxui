// BL1 retained evidence for the seed set (the poster grid): E-BL1-08 generation
// identity and E-BL1-11 catalog regression baseline.
//
//   node tests/evidence/capture-bl1.mjs [--capture-timestamp=<ISO-8601 UTC>]
//
// Run it from the exact committed implementation revision with a clean worktree
// (only tests/evidence/bl1 may differ). It compiles the catalog twice, compares
// it with the catalog the BL1-A2 goldens pin, measures the baseline against the
// thresholds committed before capture (tests/evidence/bl1/regression-thresholds.json,
// whose provenance names the expectations revised after a first measurement),
// runs `pnpm generate:check`, and rewrites the artifacts, records, validation
// summary, and index below tests/evidence/bl1. It refuses to write when a
// threshold fails or a proof tool differs from HEAD. The other E-BL1 assertions
// join this root as their slices land.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from '../../tooling/audits/repository-policy/src/canonical-json.mjs';
import { hasUnsanitizedEvidenceOutput } from '../../tooling/audits/repository-policy/src/evidence-verify.mjs';
import {
  compileBundle,
  isPatternSource,
  loadThresholds,
  measureRegression,
  regressionFailures,
  repositoryRoot,
  thresholdsPath,
} from './bl1/regression.mjs';
import { createCatalogApi } from '../../packages/catalog/src/index.mjs';

const root = 'tests/evidence/bl1';
const captureTool = 'tests/evidence/capture-bl1.mjs';
const authority = 'strategy/milestone-roadmap.md: BL1 Blocks showcase (Decision 0026)';
// The catalogDigest pinned by packages/tooling/test/goldens/manifest-brief.txt at the BL1-A2 head 68f6f9f8,
// the last commit before any shipped pattern.
const a2CatalogDigest = 'sha256:ab0998dfb2f51aa572e77f16e5d5f80982242a5c5df4aac16d66b1390bbc9671';
const a2Commit = '68f6f9f8fdf462229a57f99d7675058eb8b2394d';

const captureTimestamp = process.argv.find((argument) => argument.startsWith('--capture-timestamp='))?.split('=')[1]
  ?? new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
const command = (executable, args) => execFileSync(executable, args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const dirty = command('git', ['status', '--porcelain=v1', '--untracked-files=all'])
  .split('\n').filter(Boolean).filter((line) => !line.slice(3).startsWith(`${root}/`));
if (dirty.length > 0) throw new Error(`EVIDENCE_DIRTY_WORKTREE: commit the implementation first; changed: ${dirty.join(', ')}`);

const sourceRevision = command('git', ['rev-parse', 'HEAD']);
const sourceTree = command('git', ['rev-parse', 'HEAD^{tree}']);
const environment = {
  architecture: process.arch,
  node: process.version,
  pnpm: command('pnpm', ['--version']),
  runnerOs: `macOS ${command('sw_vers', ['-productVersion'])}`,
};

// E-BL1-08: repeated generation is a no-op, and the digest moves only for the added sources.
const [first, second] = [await compileBundle(), await compileBundle()];
if (first.bytes !== second.bytes) throw new Error('E-BL1-08: two compiles of the same sources differ');
const withoutPatterns = await compileBundle((entry) => !isPatternSource(entry));
if (withoutPatterns.bundle.catalogDigest !== a2CatalogDigest) {
  throw new Error(`E-BL1-08: the catalog without patterns has digest ${withoutPatterns.bundle.catalogDigest}, not the BL1-A2 digest ${a2CatalogDigest}`);
}
const manifest = JSON.parse(await readFile(join(repositoryRoot, 'packages/catalog/catalog-sources.json'), 'utf8'));
const addedEntries = manifest.records.filter(isPatternSource).map(({ family, path }) => ({ family, path }));
const baseIds = new Set(withoutPatterns.bundle.artifacts.map(({ id }) => id));
const addedIds = first.bundle.artifacts.map(({ id }) => id).filter((id) => !baseIds.has(id));
const added = new Set(addedIds);
const addedRelations = first.bundle.relations.filter(({ source, target }) => added.has(source) || added.has(target));
const strip = ({ catalogDigest: _digest, sourceRevision: _revision, ...bundle }) => bundle;
const remainder = strip(structuredClone(first.bundle));
remainder.artifacts = remainder.artifacts.filter(({ id }) => !added.has(id));
remainder.relations = remainder.relations.filter(({ source, target }) => !added.has(source) && !added.has(target));
remainder.searchIndex = remainder.searchIndex.filter(({ id }) => !added.has(id));
if (canonicalJson(remainder) !== canonicalJson(strip(withoutPatterns.bundle))) {
  throw new Error('E-BL1-08: the catalog differs from the BL1-A2 catalog by more than the added sources');
}
const identityOutput = execFileSync('pnpm', ['generate:check'], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const identity = /independent clean checkouts ([0-9a-f]{40}) generated identical projections with clean worktrees \((sha256:[0-9a-f]{64})\)/u.exec(identityOutput);
if (!identity || identity[1] !== sourceRevision) throw new Error('E-BL1-08: pnpm generate:check did not report identical generation at the source revision');

// E-BL1-11: the baseline for the seed set, held to the thresholds committed before capture.
const thresholds = await loadThresholds();
const api = createCatalogApi(first.bundle);
const measured = measureRegression({ api, baselineApi: createCatalogApi(withoutPatterns.bundle), thresholds });
const failures = regressionFailures(measured, thresholds);
if (failures.length > 0) throw new Error(`E-BL1-11: the seed set breaks its thresholds:\n${failures.join('\n')}`);
// A query the pattern ranks below first stays visible as a weakness, not a pass.
const knownDiscoveryWeaknesses = thresholds.discovery.queries.filter(({ knownWeakness }) => knownWeakness !== undefined).map(({ query, expectedId, knownWeakness }) => ({
  query,
  expectedId,
  rank: measured.discovery.queries.find((candidate) => candidate.query === query).rank,
  weakness: knownWeakness,
}));
const weaknessSummary = knownDiscoveryWeaknesses.map(({ query, rank }) => `the query "${query}" ranks the pattern at ${rank}, not first`).join('; ');

const artifacts = {
  'E-BL1-08': {
    evidenceKind: 'catalog-generation-identity',
    claim: 'Repeated generation is a no-op, and the catalog digest changes only for the added sources.',
    observations: {
      catalogDigest: first.bundle.catalogDigest,
      catalogVersion: first.bundle.catalogVersion,
      repeatedCompile: { compiles: 2, bytesIdentical: true },
      baseline: {
        description: 'the catalog compiled from the manifest without the added entries',
        catalogDigest: withoutPatterns.bundle.catalogDigest,
        pinnedBy: `packages/tooling/test/goldens/manifest-brief.txt at the BL1-A2 head ${a2Commit}`,
        equalsPinnedDigest: true,
      },
      addedSources: {
        manifestEntries: addedEntries,
        artifacts: addedIds,
        relations: addedRelations,
        remainderIdenticalToBaseline: true,
      },
      generationIdentity: { command: 'pnpm generate:check', digest: identity[2], checkoutRevision: identity[1] },
    },
  },
  'E-BL1-11': {
    evidenceKind: 'catalog-regression-baseline',
    claim: `The seed set stays within the regression thresholds committed before capture, after ${thresholds.provenance.revisedAfterFirstMeasurement.length} of ${thresholds.discovery.queries.length} discovery expectations were revised following a first measurement. Known discovery weakness: ${weaknessSummary}.`,
    observations: {
      seedSet: thresholds.seedSet,
      thresholds: { path: thresholdsPath, sha256: sha256(await readFile(join(repositoryRoot, thresholdsPath))) },
      measured,
      knownDiscoveryWeaknesses,
      failures,
    },
  },
};

await mkdir(join(repositoryRoot, root, 'artifacts'), { recursive: true });
await mkdir(join(repositoryRoot, root, 'records'), { recursive: true });
async function write(path, value) {
  const text = canonicalJson(value);
  if (hasUnsanitizedEvidenceOutput(text, repositoryRoot)) throw new Error(`EVIDENCE_UNSANITIZED: ${path}`);
  await writeFile(join(repositoryRoot, path), text);
  return { path, sha256: sha256(text) };
}

// A proof tool is bound by its bytes and by the last commit that changed it; it must already be committed.
async function proofToolIdentity(path) {
  const bytes = await readFile(join(repositoryRoot, path));
  const committed = execFileSync('git', ['show', `HEAD:${path}`], { cwd: repositoryRoot, encoding: 'buffer' });
  if (!committed.equals(bytes)) throw new Error(`EVIDENCE_PROOF_TOOL_UNCOMMITTED: ${path} must match HEAD`);
  const revision = command('git', ['log', '-1', '--format=%H', '--', path]);
  return { path, revision, sha256: sha256(bytes), tree: command('git', ['rev-parse', `${revision}^{tree}`]) };
}
const proofTool = await proofToolIdentity(captureTool);
const regressionTool = await proofToolIdentity(`${root}/regression.mjs`);
const captureProcedure = `node ${captureTool} --capture-timestamp=${captureTimestamp}`;
const artifactRefs = {};
for (const [assertionId, { evidenceKind, claim, observations }] of Object.entries(artifacts)) {
  artifactRefs[assertionId] = await write(`${root}/artifacts/${assertionId}.json`, {
    assertionId, captureTimestamp, claim, environment, evidenceKind, observations, outcome: 'pass',
    schema: 'muxui-evidence-artifact-v1', sourceRevision, sourceTree,
  });
}
const validation = await write(`${root}/verification.json`, {
  captureProcedure,
  captureTimestamp,
  environment,
  proofTool,
  proofTools: [proofTool, regressionTool],
  results: [{
    command: 'pnpm generate:check',
    exitState: 0,
    observedAssertions: [{ id: 'generation-identity', value: identity[2] }],
  }],
  schema: 'muxui-evidence-validation-v1',
  sourceRevision,
  sourceTree,
});

const nonClaims = [
  'Only E-BL1-08 and E-BL1-11 are recorded here; the other BL1 assertions join this root as their slices land.',
  'No assistive-technology support claim (Decision 0022), no publication, and no deployment.',
];
const extraNonClaims = {
  'E-BL1-11': [`No claim that discovery by category term works: ${weaknessSummary}, a known weakness this baseline records and does not pass as a first-ranked result.`],
};
const retentionPolicy = 'Content-addressed Git records retained in default-branch history';
const records = [];
for (const [assertionId, { evidenceKind, claim }] of Object.entries(artifacts)) {
  records.push({
    assertionId,
    ...await write(`${root}/records/${assertionId}.json`, {
      activeExceptionRefs: [],
      advisoryRefs: [],
      artifact: artifactRefs[assertionId],
      assertionId,
      basis: `${assertionId} under ${authority}`,
      captureTimestamp,
      claim,
      command: captureProcedure,
      disclosureClass: 'public-sanitized',
      environment,
      evidenceKind,
      executedIdentityBasis: 'declared equal to the source revision and tree because the capture ran there from a clean worktree; not observed separately',
      executedRevision: sourceRevision,
      executedTree: sourceTree,
      expiry: 'Retained as the BL1 baseline for the seed set at this commit; a later block adds its own measurement against the same thresholds rather than editing this record',
      milestone: 'BL1',
      nonClaims: [...nonClaims, ...(extraNonClaims[assertionId] ?? [])],
      outcome: 'pass',
      owner: 'ndrewtran',
      proofTool,
      retentionPolicy,
      schema: 'muxui-evidence-record-v1',
      sourceRevision,
      sourceTree,
      validation,
    }),
  });
}
await write(`${root}/index.json`, {
  artifacts: [
    { path: thresholdsPath, sha256: artifacts['E-BL1-11'].observations.thresholds.sha256 },
    ...Object.values(artifactRefs),
  ].sort((left, right) => (left.path < right.path ? -1 : 1)),
  authority,
  captureTimestamp,
  disclosureClass: 'public-sanitized',
  evidenceHead: {
    reason: 'the index digest is the content address; the retaining commit follows capture',
    status: 'not-applicable',
  },
  milestone: 'BL1',
  owner: 'ndrewtran',
  records,
  retentionPolicy,
  schema: 'muxui-evidence-index-v1',
  sourceRevision,
  sourceTree,
  validation,
});
console.log(`[evidence] captured BL1 E-BL1-08 and E-BL1-11 at ${sourceRevision}`);

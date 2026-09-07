import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, parseJsonStrict } from '@muxui/schema';
import {
  verifyDecision0009Amendment02SkillSuccessor,
  verifyDecision0009ReadmeHistoricalCompatibility,
  verifyDeliveryReviewReadinessAuthority,
  verifyDeliveryWorkflowAuthority,
} from '../src/delivery-workflow-authority-verify.mjs';
import {
  verifyHistoricalR1ContinuousAuthority,
} from '../src/r1-continuous-authority-compatibility.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');
const decisionSource = fs.readFileSync(path.join(repositoryRoot, 'decisions/0007-delivery-workflow-authority.json'), 'utf8');
const acceptanceSource = fs.readFileSync(path.join(repositoryRoot, 'decisions/0007-delivery-workflow-authority-acceptance.json'), 'utf8');
const productScopeSource = fs.readFileSync(path.join(repositoryRoot, 'strategy/product-scope.md'), 'utf8');
const historicalProductScopeSource = execFileSync(
  'git', ['show', 'b27cb4fb3d71f8feca9505684201286d76f62d42:strategy/product-scope.md'], { encoding: 'utf8' },
);
const r1AcceptancePath = 'decisions/0010-amendment-04-r1-continuous-execution-acceptance.md';
const amendment04DecisionPath = 'decisions/0009-amendment-04-repository-policy-readme-historical-compatibility.md';
const amendment04AcceptancePath = 'decisions/0009-amendment-04-repository-policy-readme-historical-compatibility-acceptance.md';
const amendment08DecisionPath = 'decisions/0010-amendment-08-r1-readme-historical-compatibility-recovery.md';
const amendment08AcceptancePath = 'decisions/0010-amendment-08-r1-readme-historical-compatibility-recovery-acceptance.md';
const recoveryCandidateSha256 = '23fbb5acb55416a4079fe012b2f9c67b3df6e18ecdd8bbed2da1a1caa311d81a';
const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const renderTemplate = (template, substitutions) => Object.entries(substitutions).reduce(
  (output, [name, value]) => output.replaceAll(`{${name}}`, value),
  template,
);

const recoveryStatement = `I accept Core UI R1 README historical compatibility recovery candidate v4, SHA-256 ${recoveryCandidateSha256}; pre-acceptance materialization diff, SHA-256 ${'1'.repeat(64)}; and execution manifest v4, SHA-256 ${'2'.repeat(64)}. I authorize the exact six-path authority materialization and owner acceptance records; its authority issue, protected non-draft PR, and merge after all named deterministic checks and external authority review pass; the exact ten-path PR #92 recovery, protected intermediate merge, postmerge verification, bounded Project README reconciliation, and continuation under the existing R1 continuous-execution envelope. Npm publication and the final R1-exit PR merge remain separate stops.`;
const recoveryAcceptance = ({ acceptancePath, decisionId, decisionPath, parentId, title }) => [
  `# Acceptance: ${title}`,
  '',
  `- Decision: \`${decisionId}\``,
  `- Parent decision: \`${parentId}\``,
  '- Repository: `ndrewtran/core-ui`',
  '- Owner: Andrew / `ndrewtran`',
  '- Outcome: Accepted',
  `- Candidate: 12,193 bytes, SHA-256 \`${recoveryCandidateSha256}\``,
  `- Pre-acceptance materialization diff: 1 bytes, SHA-256 \`${'1'.repeat(64)}\``,
  `- Execution manifest: 1 bytes, SHA-256 \`${'2'.repeat(64)}\``,
  `- Decision path: \`${decisionPath}\``,
  `- Acceptance path: \`${acceptancePath}\``,
  `- Approval instruction: “${recoveryStatement}”`,
  `- Human acceptance: Andrew / \`ndrewtran\`: “${recoveryStatement}”`,
  '- Approval timestamp: Not recorded',
  '- Protected authority PR/merge: Pending; not claimed by this record',
  '',
  'This record claims acceptance only; no issue, PR, checks, review, merge, implementation, Project, publication, or release outcome is claimed.',
  '',
].join('\n');
const recoveryOptions = Object.freeze({
  reviewAmendment04Source: fs.readFileSync(path.join(repositoryRoot, amendment04DecisionPath), 'utf8'),
  reviewAmendment04AcceptanceSource: recoveryAcceptance({
    acceptancePath: amendment04AcceptancePath,
    decisionId: 'core-ui:decision:0009:amendment:04',
    decisionPath: amendment04DecisionPath,
    parentId: 'core-ui:decision:0009',
    title: 'Decision 0009 amendment 04',
  }),
  r1ReadmeRecoverySource: fs.readFileSync(path.join(repositoryRoot, amendment08DecisionPath), 'utf8'),
  r1ReadmeRecoveryAcceptanceSource: recoveryAcceptance({
    acceptancePath: amendment08AcceptancePath,
    decisionId: 'core-ui:decision:0010:amendment:08',
    decisionPath: amendment08DecisionPath,
    parentId: 'core-ui:decision:0010',
    title: 'Decision 0010 amendment 08',
  }),
});

const writeR1Acceptance = (fixtureRoot) => {
  fs.writeFileSync(path.join(fixtureRoot, r1AcceptancePath), execFileSync(
    'git', ['show', `9a7cf99b0e74b2813998775138f0bc340e82c962:${r1AcceptancePath}`], {encoding: 'buffer'},
  ));
};

const materializeStagedIndex = (sourceRoot, fixtureRoot) => {
  const stagedPaths = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], {
    cwd: sourceRoot,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const stagedEntries = new Map();
  const indexSource = execFileSync('git', ['ls-files', '--cached', '--stage', '-z'], {
    cwd: sourceRoot,
    encoding: 'buffer',
  });
  let indexEntryStart = 0;
  while (indexEntryStart < indexSource.length) {
    const indexEntryEnd = indexSource.indexOf(0, indexEntryStart);
    if (indexEntryEnd < 0) throw new Error('Malformed staged index entry');
    const indexEntry = indexSource.subarray(indexEntryStart, indexEntryEnd);
    const metadataEnd = indexEntry.indexOf(0x09);
    if (metadataEnd < 0) throw new Error('Malformed staged index entry');
    const metadata = indexEntry.subarray(0, metadataEnd).toString('ascii').split(' ');
    stagedEntries.set(indexEntry.subarray(metadataEnd + 1).toString('utf8'), metadata[1]);
    indexEntryStart = indexEntryEnd + 1;
  }
  for (const relativePath of stagedPaths) {
    const destination = path.join(fixtureRoot, relativePath);
    fs.rmSync(destination, {recursive: true, force: true});
    const objectId = stagedEntries.get(relativePath);
    if (objectId === undefined) continue;
    const source = execFileSync('git', ['cat-file', 'blob', objectId], {
      cwd: sourceRoot,
      encoding: 'buffer',
    });
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, source);
  }
  if (stagedPaths.length > 0) {
    execFileSync('git', ['add', '--all', '--', ...stagedPaths], {cwd: fixtureRoot, stdio: 'ignore'});
  }
  return stagedPaths;
};

const makeStagedIndexFixture = (sourceRoot) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'muxui-r1-authority-fixture-'));
  execFileSync('git', ['clone', '--no-local', '--no-tags', '--no-checkout', sourceRoot, fixtureRoot], {
    stdio: 'ignore',
  });
  execFileSync('git', ['checkout', '--quiet', '--detach', 'HEAD'], {cwd: fixtureRoot, stdio: 'ignore'});
  materializeStagedIndex(sourceRoot, fixtureRoot);
  return fixtureRoot;
};

const makeR1Fixture = (receiptState = 'staged') => {
  const fixtureRoot = makeStagedIndexFixture(repositoryRoot);
  execFileSync('git', ['rm', '--ignore-unmatch', '--', r1AcceptancePath], {
    cwd: fixtureRoot,
    stdio: 'ignore',
  });
  if (receiptState !== 'absent') writeR1Acceptance(fixtureRoot);
  if (receiptState === 'staged') {
    execFileSync('git', ['add', '--', r1AcceptancePath], {cwd: fixtureRoot, stdio: 'ignore'});
  } else if (receiptState === 'intent-to-add') {
    execFileSync('git', ['add', '-N', '--', r1AcceptancePath], {cwd: fixtureRoot, stdio: 'ignore'});
  }
  return fixtureRoot;
};

const replaySourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'muxui-r1-index-replay-source-'));
try {
  execFileSync('git', ['init', '--quiet'], {cwd: replaySourceRoot});
  execFileSync('git', ['config', 'user.email', 'muxui-tests@example.invalid'], {cwd: replaySourceRoot});
  execFileSync('git', ['config', 'user.name', 'Mux UI Tests'], {cwd: replaySourceRoot});
  fs.writeFileSync(path.join(replaySourceRoot, 'staged-deletion.txt'), 'base deletion\n');
  fs.writeFileSync(path.join(replaySourceRoot, 'staged-modification.txt'), 'base modification\n');
  execFileSync('git', ['add', '--', 'staged-deletion.txt', 'staged-modification.txt'], {cwd: replaySourceRoot});
  execFileSync('git', ['commit', '--quiet', '-m', 'base'], {cwd: replaySourceRoot});

  fs.rmSync(path.join(replaySourceRoot, 'staged-deletion.txt'));
  execFileSync('git', ['add', '--all', '--', 'staged-deletion.txt'], {cwd: replaySourceRoot});
  fs.writeFileSync(path.join(replaySourceRoot, 'staged-deletion.txt'), 'unstaged recreation\n');
  fs.writeFileSync(path.join(replaySourceRoot, 'staged-modification.txt'), 'staged bytes\n');
  execFileSync('git', ['add', '--', 'staged-modification.txt'], {cwd: replaySourceRoot});
  fs.writeFileSync(path.join(replaySourceRoot, 'staged-modification.txt'), 'unstaged edit\n');

  const replayFixture = makeStagedIndexFixture(replaySourceRoot);
  try {
    assert.equal(fs.existsSync(path.join(replayFixture, 'staged-deletion.txt')), false);
    assert.deepEqual(
      fs.readFileSync(path.join(replayFixture, 'staged-modification.txt')),
      Buffer.from('staged bytes\n'),
    );
    assert.match(
      execFileSync('git', ['diff', '--cached', '--name-status', '--', 'staged-deletion.txt'], {
        cwd: replayFixture,
        encoding: 'utf8',
      }),
      /^D\tstaged-deletion\.txt\n$/u,
    );
    assert.deepEqual(
      execFileSync('git', ['show', ':staged-modification.txt'], {cwd: replayFixture, encoding: 'buffer'}),
      Buffer.from('staged bytes\n'),
    );
  } finally {
    fs.rmSync(replayFixture, {recursive: true, force: true});
  }
} finally {
  fs.rmSync(replaySourceRoot, {recursive: true, force: true});
}

const rejectAt = (root, options, label) => {
  try {
    verifyDeliveryWorkflowAuthority(root, { ...options, sourceMode: 'historical' });
  } catch (error) {
    if (String(error.message).startsWith('DELIVERY_WORKFLOW_AUTHORITY_INVALID:')) return;
    throw error;
  }
  throw new Error(`negative accepted: ${label}`);
};
const reject = (options, label) => rejectAt(repositoryRoot, options, label);

assert.throws(
  () => verifyDeliveryWorkflowAuthority(repositoryRoot),
  /historical audit requires explicit sourceMode: historical/u,
);
assert.throws(
  () => verifyDeliveryWorkflowAuthority(repositoryRoot, { sourceMode: 'current' }),
  /historical audit requires explicit sourceMode: historical/u,
);

const decision = parseJsonStrict(decisionSource);
const wrongPlan = structuredClone(decision);
wrongPlan.authorityApplicability.replacementPlan = ['E-DELIVERY-01'];
reject({ decisionSource: canonicalJson(wrongPlan) }, 'replacement plan');

const wrongStatus = structuredClone(decision);
wrongStatus.authorityApplicability.replacementStatus = 'complete';
reject({ decisionSource: canonicalJson(wrongStatus) }, 'replacement status');

const acceptance = parseJsonStrict(acceptanceSource);
acceptance.bodySha256 = `sha256:${'0'.repeat(64)}`;
reject({ acceptanceSource: canonicalJson(acceptance) }, 'acceptance receipt');

reject({ productScopeSource: productScopeSource.replace('scopeVersion: 6.0.1', 'scopeVersion: 6.0.2') }, 'Product Scope');
reject({ architectureSource: 'not the accepted historical architecture' }, 'historical Architecture');
reject({ roadmapSource: 'not the accepted historical roadmap' }, 'historical roadmap');

const historicalFixture = makeR1Fixture();
try {
  for (const relativePath of ['strategy/product-scope.md', 'strategy/monorepo-architecture.md', 'strategy/milestone-roadmap.md']) {
    fs.writeFileSync(path.join(historicalFixture, relativePath), 'live source drift\n');
  }
  const committedResult = verifyDeliveryWorkflowAuthority(historicalFixture, { sourceMode: 'historical' });
  assert.equal(committedResult.sourceMode, 'historical');
  assert.equal(committedResult.productScope.version, '4.0.2');
} finally {
  fs.rmSync(historicalFixture, {recursive: true, force: true});
}
const result = verifyDeliveryWorkflowAuthority(repositoryRoot, { sourceMode: 'historical' });
if (result.activationEvidence !== 8
    || result.applicabilityTargets !== 28
    || result.productScope.version !== '4.0.2'
    || result.sourceMode !== 'historical'
    || result.r1Entry !== undefined) {
  throw new Error('positive result mismatch');
}
const historical = verifyHistoricalR1ContinuousAuthority(repositoryRoot);
if (historical.commit !== '9a7cf99b0e74b2813998775138f0bc340e82c962'
    || historical.tree !== '470d0f7bc6751b7f66d49fbf4fdc2d62f6cc89f0'
    || historical.parents.join(',') !== 'd4bba1a5f004d638936b79b673f0b1c4f9691426,374db5debff52c64929ad3255a6824ce42af756c') {
  throw new Error('historical R1 authority topology mismatch');
}

const wrongHistoricalVersion = historicalProductScopeSource.replace('scopeVersion: 4.0.2', 'scopeVersion: 5.0.1');
reject({ productScopeSource: wrongHistoricalVersion }, 'historical Product Scope version');
const missingStage1Route = fs.readFileSync(path.join(repositoryRoot, 'strategy/milestone-roadmap.md'), 'utf8')
  .replace('react-aria-stage1-source-verify.mjs', 'react-aria-stage1-source-verify-replaced.mjs');
reject({ productScopeSource, roadmapSource: missingStage1Route }, 'missing historical Stage 1 route');

const reviewDecisionSource = fs.readFileSync(path.join(repositoryRoot, 'decisions/0009-delivery-review-readiness.json'), 'utf8');
const reviewAcceptanceSource = fs.readFileSync(path.join(repositoryRoot, 'decisions/0009-delivery-review-readiness-acceptance.json'), 'utf8');
const implementationClarificationSource = fs.readFileSync(
  path.join(repositoryRoot, 'decisions/0009-amendment-01-implementation-clarification.md'),
  'utf8',
);
const amendment02Source = fs.readFileSync(
  path.join(repositoryRoot, 'decisions/0009-amendment-02-skill-routing.md'),
  'utf8',
);
const amendment02AcceptanceSource = fs.readFileSync(
  path.join(repositoryRoot, 'decisions/0009-amendment-02-skill-routing-acceptance.md'),
  'utf8',
);
const successorSkillSource = fs.readFileSync(
  path.join(repositoryRoot, '.agents/skills/muxui-delivery/SKILL.md'),
  'utf8',
);
const successorYamlSource = fs.readFileSync(
  path.join(repositoryRoot, '.agents/skills/muxui-delivery/agents/openai.yaml'),
  'utf8',
);
const rejectAmendment02 = (options, label) => {
  try {
    verifyDecision0009Amendment02SkillSuccessor(repositoryRoot, options);
  } catch (error) {
    if (String(error.message).startsWith('DELIVERY_WORKFLOW_AUTHORITY_INVALID:')) return;
    throw error;
  }
  throw new Error(`Decision 0009 amendment 02 negative accepted: ${label}`);
};
const amendment02Result = verifyDecision0009Amendment02SkillSuccessor(repositoryRoot);
if (!amendment02Result.accepted
    || amendment02Result.amendment.bytes !== 6976
    || amendment02Result.skill.bytes !== 7839
    || amendment02Result.interfaceMetadata.bytes !== 577) {
  throw new Error('Decision 0009 amendment 02 positive result mismatch');
}
rejectAmendment02({
  reviewAmendment02Source: amendment02Source.replace('Status: Candidate;', 'Status: Candidate changed;'),
}, 'candidate identity');
rejectAmendment02({
  reviewAmendment02AcceptanceSource: amendment02AcceptanceSource.replace(
    'Approval timestamp: Not recorded',
    'Approval timestamp: 2026-08-18T00:00:00Z',
  ),
}, 'acceptance identity');
rejectAmendment02({
  reviewSuccessorSkillSource: successorSkillSource.replace('Root implementation and routine', 'Root implementation and routine drift'),
}, 'successor SKILL identity');
rejectAmendment02({
  reviewSuccessorYamlSource: successorYamlSource.replace('Mux UI Delivery', 'Mux UI Delivery drift'),
}, 'successor interface metadata identity');
rejectAmendment02({ reviewSuccessorYamlSource: '' }, 'missing successor binding');
const rejectReview = (options, label) => {
  try {
    verifyDeliveryReviewReadinessAuthority(repositoryRoot, { ...recoveryOptions, ...options });
  } catch (error) {
    if (String(error.message).startsWith('DELIVERY_WORKFLOW_AUTHORITY_INVALID:')) return;
    throw error;
  }
  throw new Error(`Decision 0009 negative accepted: ${label}`);
};
const rejectReadmeCompatibility = (options, label) => {
  try {
    verifyDecision0009ReadmeHistoricalCompatibility(repositoryRoot, { ...recoveryOptions, ...options });
  } catch (error) {
    if (String(error.message).startsWith('DELIVERY_WORKFLOW_AUTHORITY_INVALID:')) return;
    throw error;
  }
  throw new Error(`Decision 0009 amendment 04 negative accepted: ${label}`);
};
const recoveryResult = verifyDecision0009ReadmeHistoricalCompatibility(repositoryRoot, recoveryOptions);
if (!recoveryResult.accepted
    || recoveryResult.amendment0009.bytes !== 2948
    || recoveryResult.amendment0010.bytes !== 3050
    || recoveryResult.acceptance.statement !== recoveryStatement) {
  throw new Error('Decision 0009 amendment 04 positive result mismatch');
}
rejectReadmeCompatibility({
  reviewAmendment04Source: `${recoveryOptions.reviewAmendment04Source}\ndrift`,
}, 'Decision 0009 amendment 04 identity');
rejectReadmeCompatibility({
  r1ReadmeRecoverySource: `${recoveryOptions.r1ReadmeRecoverySource}\ndrift`,
}, 'Decision 0010 amendment 08 identity');
rejectReadmeCompatibility({
  reviewAmendment04AcceptanceSource: recoveryOptions.reviewAmendment04AcceptanceSource.replace(
    recoveryStatement,
    `${recoveryStatement} drift`,
  ),
}, 'acceptance statement mismatch');
rejectReadmeCompatibility({
  r1ReadmeRecoveryAcceptanceSource: recoveryOptions.r1ReadmeRecoveryAcceptanceSource.replace(
    `SHA-256 \`${'2'.repeat(64)}\``,
    `SHA-256 \`${'3'.repeat(64)}\``,
  ),
}, 'acceptance manifest mismatch');
rejectReadmeCompatibility({
  reviewAmendment04AcceptanceSource: recoveryOptions.reviewAmendment04AcceptanceSource.replaceAll(
    recoveryStatement,
    'I accept an unrelated recovery without artifact identities.',
  ),
  r1ReadmeRecoveryAcceptanceSource: recoveryOptions.r1ReadmeRecoveryAcceptanceSource.replaceAll(
    recoveryStatement,
    'I accept an unrelated recovery without artifact identities.',
  ),
}, 'acceptance statement without artifact identities');
rejectReadmeCompatibility({
  reviewAmendment04AcceptanceSource: recoveryOptions.reviewAmendment04AcceptanceSource.replace(
    `SHA-256 \`${recoveryCandidateSha256}\``,
    `SHA-256 \`${recoveryCandidateSha256}\` with suffix`,
  ),
}, 'acceptance identity suffix');
rejectReadmeCompatibility({
  reviewAmendment04AcceptanceSource: `${recoveryOptions.reviewAmendment04AcceptanceSource}Publication completed.\n`,
}, 'acceptance appended outcome claim');
const reviewDecision = parseJsonStrict(reviewDecisionSource);
const mutations = [
  ['plan', (value) => { value.acceptanceTopology.planSha256 = `sha256:${'0'.repeat(64)}`; }],
  ['base', (value) => { value.sourceConstruction.acceptedBase = '0'.repeat(40); }],
  ['future source', (value) => { value.sourceConstruction.futureSourceCommit = '0'.repeat(40); }],
  ['write authority', (value) => { value.implementationBoundary.guidanceOnly = false; }],
  ['target omission', (value) => { value.continuationTopology.targets.pop(); }],
  ['continuation status', (value) => { value.continuationTopology.targets[0].replacementStatus = 'complete'; }],
  ['artifact digest', (value) => { value.sourceConstruction.artifactEntries[0].sha256 = `sha256:${'f'.repeat(64)}`; }],
  ['historical resolver digest', (value) => {
    value.sourceConstruction.artifactEntries
      .find(({ path: artifactPath }) => artifactPath === 'tests/evidence/delivery-review-readiness-applicability-profile.mjs')
      .sha256 = `sha256:${'f'.repeat(64)}`;
  }],
];
for (const [label, mutate] of mutations) {
  const value = structuredClone(reviewDecision);
  mutate(value);
  rejectReview({ reviewDecisionSource: canonicalJson(value), reviewAcceptanceSource }, label);
}
rejectReview({
  implementationClarificationSource: implementationClarificationSource.replace('Every other', 'Each other'),
  reviewAcceptanceSource,
  reviewDecisionSource,
}, 'implementation clarification');
const reviewAcceptance = parseJsonStrict(reviewAcceptanceSource);
for (const [label, mutate] of [
  ['receipt owner', (value) => { value.owner = 'someone-else'; }],
  ['receipt timestamp claim', (value) => { value.taskProvenance.approvalTimestamp = '2026-08-12T00:00:00Z'; }],
  ['receipt comment claim', (value) => { value.taskProvenance.githubCommentClaimed = true; }],
  ['receipt manifest', (value) => { value.manifest.sha256 = `sha256:${'f'.repeat(64)}`; }],
]) {
  const value = structuredClone(reviewAcceptance);
  mutate(value);
  rejectReview({ reviewDecisionSource, reviewAcceptanceSource: canonicalJson(value) }, label);
}
const reviewResult = verifyDeliveryReviewReadinessAuthority(repositoryRoot, recoveryOptions);
if (!reviewResult.accepted || reviewResult.targets !== 29 || reviewResult.manifest.entries < 20) {
  throw new Error('Decision 0009 positive result mismatch');
}

const driftFixture = makeR1Fixture();
try {
  fs.appendFileSync(path.join(driftFixture, '.github/scripts/validate-planning-pr.cjs'), '\nhistorical audit drift\n');
  const driftResult = verifyDeliveryReviewReadinessAuthority(driftFixture, recoveryOptions);
  if (driftResult.manifest.sha256 !== reviewResult.manifest.sha256
      || driftResult.readmeCompatibility?.accepted !== true) {
    throw new Error('historical Decision 0009 result changed after current worktree drift');
  }
} finally {
  fs.rmSync(driftFixture, { recursive: true, force: true });
}

process.stdout.write('[delivery-authority] Decision 0007 preserved; Decision 0009 amendments 02 and 04 successor negatives rejected; positive candidates accepted\n');

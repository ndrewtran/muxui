'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { changedPaths, validatePlanningPullRequest } = require('./validate-planning-pr.cjs');

const completeBody = `
- Authority change record: #1
- Scope version effect: minor — adds one admitted item
- Affected Scope IDs / commitment transitions: SCOPE-EXAMPLE-001 admitted; no commitment transitions
- Roadmap / evidence effect: no semantic changes; tracker references are reconciled
- Release additions / removals: None — accepted release boundary remains unchanged
- Open tracker migration: issues #1–#19 and the Mux UI Delivery Project
`;

function bodyWith(scopeVersionEffect, fields = {}) {
  const values = {
    'Affected Scope IDs / commitment transitions': 'None',
    'Roadmap / evidence effect': 'None',
    'Release additions / removals': 'None',
    'Open tracker migration': 'None',
    ...fields,
  };
  return [
    '- Authority change record: #12',
    `- Scope version effect: ${scopeVersionEffect}`,
    ...Object.entries(values).map(([label, value]) => `- ${label}: ${value}`),
  ].join('\n');
}

function assertNeedsLabelAndRecord(files) {
  const errors = validatePlanningPullRequest({ files, labels: [], body: '' });
  assert.equal(errors.length, 2, files.join(', '));
  assert.match(errors[0], /label/);
  assert.match(errors[1], /change record/);
}

test('ignores pull requests outside the protected set', () => {
  assert.deepEqual(validatePlanningPullRequest({ files: ['README.md'], labels: [], body: '' }), []);
});

test('protects the strategy documents and the platform-safety registry', () => {
  for (const file of [
    'strategy/monorepo-architecture.md',
    'strategy/milestone-roadmap.md',
    'strategy/platform-safety-contract.json',
  ]) {
    assertNeedsLabelAndRecord([file]);
  }
  // Product Scope also needs its version effect stated.
  assert.equal(
    validatePlanningPullRequest({ files: ['strategy/product-scope.md'], labels: [], body: '' }).length,
    3,
  );
});

test('protects the protection machinery and the publishing workflow', () => {
  for (const file of [
    '.github/CODEOWNERS',
    '.github/workflows/repository-planning-policy.yml',
    '.github/workflows/npm-publish.yml',
    'tooling/audits/repository-policy/src/npm-publication.mjs',
    '.github/scripts/validate-planning-pr.cjs',
    '.github/scripts/validate-planning-pr.test.cjs',
  ]) {
    assertNeedsLabelAndRecord([file]);
  }
});

test('leaves documentation, templates, the policy package, and the delivery skill to ordinary review', () => {
  for (const file of [
    'README.md',
    'AGENTS.md',
    'tests/AGENTS.md',
    'tooling/AGENTS.md',
    'tests/evidence/README.md',
    'tooling/audits/repository-policy/README.md',
    'tooling/audits/repository-policy/package.json',
    '.github/pull_request_template.md',
    '.github/ISSUE_TEMPLATE/implementation.yml',
    '.github/workflows/ci.yml',
    '.agents/skills/muxui-delivery/SKILL.md',
    '.agents/skills/muxui-delivery/references/ci-delivery.md',
    'decisions/0029-example.md',
  ]) {
    assert.deepEqual(validatePlanningPullRequest({ files: [file], labels: [], body: '' }), [], file);
  }
});

test('accepts an authority change with a label and an issue reference', () => {
  assert.deepEqual(validatePlanningPullRequest({
    files: ['.github/CODEOWNERS'],
    labels: ['type:decision'],
    body: '- Authority change record: #12',
  }), []);
});

test('accepts a decision path as the authority change record', () => {
  for (const record of [
    'decisions/0029-narrow-planning-protection.md',
    '`decisions/0029-narrow-planning-protection.md`',
    'decisions/0009-amendment-06-repository-delivery-skill-owner.md',
  ]) {
    assert.deepEqual(validatePlanningPullRequest({
      files: ['.github/workflows/npm-publish.yml'],
      labels: ['type:architecture-maintenance'],
      body: `- Authority change record: ${record}`,
    }), [], record);
  }
});

test('rejects a missing, placeholder, or non-decision authority change record', () => {
  for (const record of ['', 'N/A', 'TBD', 'decisions/archive/0012-x.md', 'docs/0029-x.md', 'decisions/notes.md']) {
    const errors = validatePlanningPullRequest({
      files: ['strategy/milestone-roadmap.md'],
      labels: ['type:decision'],
      body: `- Authority change record: ${record}`,
    });
    assert.equal(errors.length, 1, record);
    assert.match(errors[0], /change record/);
  }
});

test('rejects an unrelated label on an authority change', () => {
  const errors = validatePlanningPullRequest({
    files: ['strategy/milestone-roadmap.md'],
    labels: ['type:implementation'],
    body: '- Authority change record: #12',
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /label/);
});

test('accepts a complete Product Scope version change', () => {
  assert.deepEqual(validatePlanningPullRequest({
    files: ['strategy/product-scope.md'],
    labels: ['type:architecture-maintenance'],
    body: completeBody,
  }), []);
});

test('needs no Product Scope change packet when the version effect is none', () => {
  for (const effect of ['none', 'None', 'none, the scope text is unchanged']) {
    assert.deepEqual(validatePlanningPullRequest({
      files: ['strategy/product-scope.md'],
      labels: ['type:decision'],
      body: `- Authority change record: #12\n- Scope version effect: ${effect}\n`,
    }), [], effect);
  }
});

test('requires a Scope version effect on every Product Scope change', () => {
  for (const effect of ['', 'someday']) {
    const errors = validatePlanningPullRequest({
      files: ['strategy/product-scope.md'],
      labels: ['type:decision'],
      body: `- Authority change record: #12\n- Scope version effect: ${effect}\n`,
    });
    assert.equal(errors.length, 1, effect);
    assert.match(errors[0], /Scope version effect/);
  }
});

test('requires the four Product Scope fields for a patch, minor, or major version effect', () => {
  for (const effect of ['patch', 'minor', 'major']) {
    const errors = validatePlanningPullRequest({
      files: ['strategy/product-scope.md'],
      labels: ['type:decision'],
      body: `- Authority change record: #12\n- Scope version effect: ${effect}\n`,
    });
    assert.equal(errors.length, 4, effect);
    assert.match(errors[0], /Affected Scope IDs/);
    assert.match(errors[1], /Roadmap \/ evidence effect/);
    assert.match(errors[2], /Release additions \/ removals/);
    assert.match(errors[3], /Open tracker migration/);
  }
});

test('accepts an honest None in the Product Scope fields', () => {
  assert.deepEqual(validatePlanningPullRequest({
    files: ['strategy/product-scope.md'],
    labels: ['type:decision'],
    body: bodyWith('patch'),
  }), []);
  assert.deepEqual(validatePlanningPullRequest({
    files: ['strategy/product-scope.md'],
    labels: ['type:decision'],
    body: bodyWith('patch', { 'Open tracker migration': 'N/A' }),
  }), []);
});

test('rejects placeholder Product Scope fields', () => {
  const errors = validatePlanningPullRequest({
    files: ['strategy/product-scope.md'],
    labels: ['type:decision'],
    body: bodyWith('major', {
      'Affected Scope IDs / commitment transitions': 'Pending',
      'Roadmap / evidence effect': 'TBD',
      'Release additions / removals': 'Not assigned',
    }),
  });
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Affected Scope IDs/);
  assert.match(errors[1], /Roadmap \/ evidence effect/);
  assert.match(errors[2], /Release additions \/ removals/);
});

test('changedPaths includes previous names once and skips missing ones', () => {
  assert.deepEqual(changedPaths([
    { filename: 'docs/x.md', previous_filename: 'strategy/product-scope.md' },
    { filename: 'README.md' },
    { filename: 'a.md', previous_filename: undefined },
    { filename: 'strategy/product-scope.md' },
  ]), ['docs/x.md', 'strategy/product-scope.md', 'README.md', 'a.md']);
});

test('treats a rename out of a protected path as an authority change', () => {
  assertNeedsLabelAndRecord(changedPaths([
    { filename: 'docs/x.md', previous_filename: '.github/workflows/npm-publish.yml' },
  ]));
});

test('ignores a rename between unprotected paths', () => {
  assert.deepEqual(validatePlanningPullRequest({
    files: changedPaths([{ filename: 'docs/b.md', previous_filename: 'docs/a.md' }]),
    labels: [],
    body: '',
  }), []);
});

test('requires a Scope version effect when product-scope.md is renamed away', () => {
  const errors = validatePlanningPullRequest({
    files: changedPaths([{ filename: 'docs/product-scope.md', previous_filename: 'strategy/product-scope.md' }]),
    labels: ['type:decision'],
    body: '- Authority change record: #12\n',
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Scope version effect/);
});

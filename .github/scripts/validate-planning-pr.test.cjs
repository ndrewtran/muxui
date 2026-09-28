'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { changedPaths, validatePlanningPullRequest } = require('./validate-planning-pr.cjs');

const completeBody = `
- Authority change record: #1
- Scope version effect: none — publishes accepted scopeVersion 1.0.0 unchanged
- Affected Scope IDs / commitment transitions: all accepted IDs; no commitment transitions
- Roadmap / evidence effect: no semantic changes; tracker references are reconciled
- Release additions / removals: None — accepted release boundary remains unchanged
- Open tracker migration: issues #1–#19 and the Mux UI Delivery Project
`;

test('ignores pull requests outside authority sources', () => {
  assert.deepEqual(validatePlanningPullRequest({ files: ['README.md'], labels: [], body: '' }), []);
});

test('accepts a complete Product Scope authority publication', () => {
  assert.deepEqual(validatePlanningPullRequest({
    files: ['strategy/product-scope.md'],
    labels: ['type:architecture-maintenance'],
    body: completeBody,
  }), []);
});

test('rejects an authority change without a label or change record', () => {
  const errors = validatePlanningPullRequest({ files: ['strategy/milestone-roadmap.md'], labels: [], body: '' });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /label/);
  assert.match(errors[1], /change record/);
});

test('protects the executable platform-safety registry as architecture authority', () => {
  const errors = validatePlanningPullRequest({ files: ['strategy/platform-safety-contract.json'], labels: [], body: '' });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /label/);
  assert.match(errors[1], /change record/);
});

test('rejects a planning-control-only change without governance metadata', () => {
  const errors = validatePlanningPullRequest({ files: ['.github/workflows/repository-planning-policy.yml'], labels: [], body: '' });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /label/);
  assert.match(errors[1], /change record/);
});

test('rejects incomplete Product Scope change metadata', () => {
  const errors = validatePlanningPullRequest({
    files: ['strategy/product-scope.md'],
    labels: ['type:decision'],
    body: `
- Authority change record: #12
- Scope version effect: someday
- Affected Scope IDs / commitment transitions: Pending
- Roadmap / evidence effect: TBD
- Release additions / removals: None
- Open tracker migration: N/A
`,
  });
  assert.equal(errors.length, 5);
  assert.match(errors[0], /Scope version effect/);
  assert.match(errors[1], /Affected Scope IDs/);
  assert.match(errors[2], /Roadmap \/ evidence effect/);
  assert.match(errors[3], /Release additions \/ removals/);
  assert.match(errors[4], /Open tracker migration/);
});

test('routes repository-policy and skill changes through ordinary governance metadata', () => {
  assert.deepEqual(validatePlanningPullRequest({
    files: ['.agents/skills/muxui-delivery/agents/openai.yaml'],
    labels: ['type:decision'],
    body: completeBody,
  }), []);
});

test('protects every file under the delivery skill and issue forms, but not sibling paths', () => {
  for (const file of [
    '.agents/skills/muxui-delivery/SKILL.md',
    '.agents/skills/muxui-delivery/agents/openai.yaml',
    '.agents/skills/muxui-delivery/references/ci-delivery.md',
    '.github/ISSUE_TEMPLATE/x.yml',
  ]) {
    const errors = validatePlanningPullRequest({ files: [file], labels: [], body: '' });
    assert.equal(errors.length, 2, file);
  }
  for (const file of [
    '.agents/skills/other/SKILL.md',
    '.agents/skills/muxui-delivery-extra/x.md',
  ]) {
    assert.deepEqual(validatePlanningPullRequest({ files: [file], labels: [], body: '' }), [], file);
  }
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
  const errors = validatePlanningPullRequest({
    files: changedPaths([
      { filename: 'docs/x.md', previous_filename: '.agents/skills/muxui-delivery/references/x.md' },
    ]),
    labels: [],
    body: '',
  });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /label/);
  assert.match(errors[1], /change record/);
});

test('ignores a rename between unprotected paths', () => {
  assert.deepEqual(validatePlanningPullRequest({
    files: changedPaths([{ filename: 'docs/b.md', previous_filename: 'docs/a.md' }]),
    labels: [],
    body: '',
  }), []);
});

test('requires Product Scope fields when product-scope.md is renamed away', () => {
  const errors = validatePlanningPullRequest({
    files: changedPaths([{ filename: 'docs/product-scope.md', previous_filename: 'strategy/product-scope.md' }]),
    labels: ['type:decision'],
    body: '- Authority change record: #12\n',
  });
  assert.equal(errors.length, 5);
  assert.match(errors[0], /Scope version effect/);
});

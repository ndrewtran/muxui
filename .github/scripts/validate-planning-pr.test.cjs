'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  changedPaths,
  decisionFileExists,
  validatePlanningPullRequest,
} = require('./validate-planning-pr.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');

// Stands in for the PR checkout, which holds a decision the PR adds.
const checkoutWith = (...references) => (reference) => references.includes(reference);
const anyFile = () => true;

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

test('protects the protection machinery, the publishing workflow, and the release path it runs', () => {
  for (const file of [
    '.github/CODEOWNERS',
    '.github/workflows/repository-planning-policy.yml',
    '.github/scripts/validate-planning-pr.cjs',
    '.github/scripts/validate-planning-pr.test.cjs',
    '.github/workflows/npm-publish.yml',
    'tooling/audits/repository-policy/src/npm-publication.mjs',
    'tooling/audits/repository-policy/src/release-prepare.mjs',
    'tooling/audits/repository-policy/src/release-proof.mjs',
    'packages/react/src/publish-guard.mjs',
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
    'tooling/audits/repository-policy/src/ci-impact.mjs',
    'package.json',
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

test('accepts the path of a decision file that exists in the checkout', () => {
  const record = 'decisions/0029-narrow-planning-protection.md';
  for (const value of [record, `\`${record}\``]) {
    assert.deepEqual(validatePlanningPullRequest({
      files: ['.github/workflows/npm-publish.yml'],
      labels: ['type:architecture-maintenance'],
      body: `- Authority change record: ${value}`,
      exists: checkoutWith(record),
    }), [], value);
  }
});

test('rejects a decision path that is not exactly decisions/NNNN-name.md', () => {
  for (const record of [
    'decisions/0009-amendment-06-repository-delivery-skill-owner.md.bak',
    'decisions/0009-amendment-06-repository-delivery-skill-owner.md/../../archive/0012-x.md',
    'decisions/0009-amendment-06-repository-delivery-skill-owner.md and more',
    'decisions/../strategy/product-scope.md',
    'decisions/archive/0012-muxui-identity-reset.md',
    'decisions/AGENTS.md',
    'decisions/notes/0029-x.md',
    'decisions/0029-X.md',
    'decisions/29-x.md',
    '/decisions/0029-x.md',
    'docs/0029-x.md',
  ]) {
    const errors = validatePlanningPullRequest({
      files: ['strategy/milestone-roadmap.md'],
      labels: ['type:decision'],
      body: `- Authority change record: ${record}`,
      exists: anyFile,
    });
    assert.equal(errors.length, 1, record);
    assert.match(errors[0], /change record/);
  }
});

test('rejects a decision path whose file is not in the checkout', () => {
  const errors = validatePlanningPullRequest({
    files: ['strategy/milestone-roadmap.md'],
    labels: ['type:decision'],
    body: '- Authority change record: decisions/9999-does-not-exist.md',
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /change record/);
});

test('checks decision paths against the repository checkout by default', () => {
  const existing = fs.readdirSync(path.join(repoRoot, 'decisions')).find((name) => /^\d{4}-[a-z0-9-]+\.md$/.test(name));
  assert.ok(existing, 'the repository has at least one decision file');
  assert.deepEqual(validatePlanningPullRequest({
    files: ['strategy/milestone-roadmap.md'],
    labels: ['type:decision'],
    body: `- Authority change record: decisions/${existing}`,
  }), []);
});

test('counts only a regular file as a decision, not a symbolic link to one', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-pr-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'decisions', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(root, 'decisions', '0001-real.md'), '# Real\n');
  fs.writeFileSync(path.join(root, 'decisions', 'archive', '0002-archived.md'), '# Archived\n');
  fs.symlinkSync('archive/0002-archived.md', path.join(root, 'decisions', '9999-record.md'));
  fs.symlinkSync('0001-real.md', path.join(root, 'decisions', '0003-alias.md'));
  fs.symlinkSync('missing.md', path.join(root, 'decisions', '0004-dangling.md'));
  fs.mkdirSync(path.join(root, 'decisions', '0005-directory.md'));

  assert.equal(decisionFileExists('decisions/0001-real.md', root), true);
  for (const link of ['9999-record', '0003-alias', '0004-dangling', '0005-directory', '0006-absent']) {
    assert.equal(decisionFileExists(`decisions/${link}.md`, root), false, link);
  }

  const run = (record) => validatePlanningPullRequest({
    files: ['strategy/milestone-roadmap.md'],
    labels: ['type:decision'],
    body: `- Authority change record: ${record}`,
    exists: (reference) => decisionFileExists(reference, root),
  });
  assert.deepEqual(run('decisions/0001-real.md'), []);
  assert.equal(run('decisions/9999-record.md').length, 1);
  assert.equal(run('decisions/0003-alias.md').length, 1);
});

test('rejects a missing or placeholder authority change record', () => {
  for (const record of ['', 'N/A', 'TBD', '<#issue or decisions/NNNN-….md>']) {
    const errors = validatePlanningPullRequest({
      files: ['strategy/milestone-roadmap.md'],
      labels: ['type:decision'],
      body: `- Authority change record: ${record}`,
    });
    assert.equal(errors.length, 1, record);
    assert.match(errors[0], /change record/);
  }
});

test('ignores trailing punctuation and comments around an authority change record', () => {
  for (const record of ['#12.', '`#12`.', '#12 <!-- tracker -->']) {
    assert.deepEqual(validatePlanningPullRequest({
      files: ['strategy/milestone-roadmap.md'],
      labels: ['type:decision'],
      body: `- Authority change record: ${record}`,
    }), [], record);
  }
  assert.deepEqual(validatePlanningPullRequest({
    files: ['strategy/milestone-roadmap.md'],
    labels: ['type:decision'],
    body: '- Authority change record: `decisions/0029-x.md`. <!-- the decision -->',
    exists: checkoutWith('decisions/0029-x.md'),
  }), []);
});

test('reads a field only from its own line', () => {
  const errors = validatePlanningPullRequest({
    files: ['strategy/milestone-roadmap.md'],
    labels: ['type:decision'],
    body: '- Authority change record:\n#12\n- Scope version effect: none\n',
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /change record/);
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

test('rejects placeholder Product Scope fields, including Markdown-wrapped and template ones', () => {
  const errors = validatePlanningPullRequest({
    files: ['strategy/product-scope.md'],
    labels: ['type:decision'],
    body: bodyWith('major', {
      'Affected Scope IDs / commitment transitions': 'Pending',
      'Roadmap / evidence effect': '`TBD`',
      'Release additions / removals': '*Pending*',
      'Open tracker migration': '<Scope IDs>',
    }),
  });
  assert.equal(errors.length, 4);
  assert.match(errors[0], /Affected Scope IDs/);
  assert.match(errors[1], /Roadmap \/ evidence effect/);
  assert.match(errors[2], /Release additions \/ removals/);
  assert.match(errors[3], /Open tracker migration/);

  for (const value of [
    '**TBD**', '_not assigned_', '~~Pending~~', '`<anything at all>`', '<a> <b>', '', '``', '**',
    // Trailing punctuation and HTML comments do not make a placeholder an answer.
    '**TBD**.', '`TBD.`', '*Pending*;', 'tbd!', '**`Pending`**.',
    'TBD <!-- complete later -->', 'TBD <!-- unterminated', '<!-- complete later -->', '<Scope IDs>. <!-- x -->',
  ]) {
    const [error, ...rest] = validatePlanningPullRequest({
      files: ['strategy/product-scope.md'],
      labels: ['type:decision'],
      body: bodyWith('minor', { 'Open tracker migration': value }),
    });
    assert.match(error, /Open tracker migration/, value);
    assert.deepEqual(rest, [], value);
  }
});

test('accepts an honest None or N/A in the Product Scope fields, also when wrapped', () => {
  for (const value of [
    'None', '`None`', '**N/A**', 'none yet, tracked in #12',
    'None.', '**None**.', '`N/A`.', 'None <!-- confirmed -->',
  ]) {
    assert.deepEqual(validatePlanningPullRequest({
      files: ['strategy/product-scope.md'],
      labels: ['type:decision'],
      body: bodyWith('patch', { 'Release additions / removals': value }),
    }), [], value);
  }
});

test('treats a blank Product Scope field as missing, not as the next label', () => {
  const body = [
    '- Authority change record: #12',
    '- Scope version effect: major',
    '- Affected Scope IDs / commitment transitions:',
    '- Roadmap / evidence effect:',
    '- Release additions / removals:',
    '- Open tracker migration: None',
  ].join('\n');
  for (const text of [body, body.replaceAll('\n', '\r\n')]) {
    const errors = validatePlanningPullRequest({ files: ['strategy/product-scope.md'], labels: ['type:decision'], body: text });
    assert.equal(errors.length, 3);
    assert.match(errors[0], /Affected Scope IDs/);
    assert.match(errors[1], /Roadmap \/ evidence effect/);
    assert.match(errors[2], /Release additions \/ removals/);
  }
});

test('a partially filled PR template fails until every Product Scope field is filled', () => {
  const template = fs.readFileSync(path.join(repoRoot, '.github', 'pull_request_template.md'), 'utf8');
  const fill = (values) => Object.entries(values).reduce(
    (body, [label, value]) => body.replace(new RegExp(`^(- ${label}:).*$`, 'm'), `$1 ${value}`),
    template,
  );
  const run = (body) => validatePlanningPullRequest({
    files: ['strategy/product-scope.md'],
    labels: ['type:decision'],
    body,
    exists: anyFile,
  });

  assert.equal(run(template).length, 2, 'the unfilled template needs a record and a version effect');

  const partial = fill({
    'Authority change record': 'decisions/0029-narrow-planning-protection.md',
    'Scope version effect': 'major',
    'Open tracker migration': 'None',
  });
  const errors = run(partial);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Affected Scope IDs/);
  assert.match(errors[1], /Roadmap \/ evidence effect/);
  assert.match(errors[2], /Release additions \/ removals/);

  assert.deepEqual(run(fill({
    'Authority change record': '#12',
    'Scope version effect': 'major',
    'Affected Scope IDs / commitment transitions': 'None',
    'Roadmap / evidence effect': 'None',
    'Release additions / removals': 'None',
    'Open tracker migration': 'None',
  })), []);
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

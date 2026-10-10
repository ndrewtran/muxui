'use strict';

const AUTHORITY_FILES = new Set([
  'strategy/monorepo-architecture.md',
  'strategy/milestone-roadmap.md',
  'strategy/platform-safety-contract.json',
  'strategy/product-scope.md',
]);

const AUTHORITY_LABELS = new Set([
  'type:architecture-maintenance',
  'type:decision',
]);

// The machinery that enforces protection, plus the publishing workflow and the
// registry preflight it runs.
const PLANNING_CONTROL_FILES = new Set([
  '.github/CODEOWNERS',
  '.github/workflows/repository-planning-policy.yml',
  '.github/workflows/npm-publish.yml',
  'tooling/audits/repository-policy/src/npm-publication.mjs',
  '.github/scripts/validate-planning-pr.cjs',
  '.github/scripts/validate-planning-pr.test.cjs',
]);

function isProtectedPlanningFile(file) {
  return AUTHORITY_FILES.has(file) || PLANNING_CONTROL_FILES.has(file);
}

// A rename or move out of a protected path still changes that path, so the
// previous name counts alongside the new one.
function changedPaths(files) {
  const paths = new Set();
  for (const file of files) {
    paths.add(file.filename);
    if (file.previous_filename) paths.add(file.previous_filename);
  }
  return [...paths];
}

function fieldValue(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`^\\s*-?\\s*${escaped}:\\s*(.+?)\\s*$`, 'im'));
  return match ? match[1].trim() : '';
}

// A filled-in answer; an honest "None" or "N/A" counts, a placeholder does not.
function isFilledIn(value) {
  return Boolean(value) && !/^(?:pending|tbd|not assigned)[\s.!-]*$/i.test(value);
}

// An issue number or the path of a decision that records the change.
const CHANGE_RECORD = /^`?(?:#\d+|decisions\/\d{4}-[\w.-]+\.md)\b/;

function validatePlanningPullRequest({ files = [], labels = [], body = '' }) {
  const errors = [];

  if (!files.some(isProtectedPlanningFile)) return errors;

  if (!labels.some((label) => AUTHORITY_LABELS.has(label))) {
    errors.push(
      'Authority-source changes require the type:architecture-maintenance or type:decision label.',
    );
  }

  if (!CHANGE_RECORD.test(fieldValue(body, 'Authority change record'))) {
    errors.push(
      'Authority-source changes require an Authority change record: #… or decisions/NNNN-….md reference.',
    );
  }

  if (!files.includes('strategy/product-scope.md')) return errors;

  // Only a change that alters a commitment (a version effect other than none)
  // needs the change packet.
  const scopeVersion = fieldValue(body, 'Scope version effect');
  if (!/^(?:none|patch|minor|major)\b/i.test(scopeVersion)) {
    errors.push('Product Scope changes require a Scope version effect: none, patch, minor, or major.');
    return errors;
  }
  if (/^none\b/i.test(scopeVersion)) return errors;

  for (const label of [
    'Affected Scope IDs / commitment transitions',
    'Roadmap / evidence effect',
    'Release additions / removals',
    'Open tracker migration',
  ]) {
    if (!isFilledIn(fieldValue(body, label))) {
      errors.push(`Product Scope version changes require a ${label} entry (None is accepted).`);
    }
  }

  return errors;
}

module.exports = {
  AUTHORITY_FILES,
  PLANNING_CONTROL_FILES,
  changedPaths,
  isProtectedPlanningFile,
  validatePlanningPullRequest,
};

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// The checkout root. The planning-policy workflow runs this from the PR merge
// checkout, so a decision added in the PR exists here.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

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

// The machinery that enforces protection, the publishing workflow, and the
// files it runs to prepare, prove, and guard a release.
const PLANNING_CONTROL_FILES = new Set([
  '.github/CODEOWNERS',
  '.github/workflows/repository-planning-policy.yml',
  '.github/scripts/validate-planning-pr.cjs',
  '.github/scripts/validate-planning-pr.test.cjs',
  '.github/workflows/npm-publish.yml',
  'tooling/audits/repository-policy/src/npm-publication.mjs',
  'tooling/audits/repository-policy/src/release-prepare.mjs',
  'tooling/audits/repository-policy/src/release-proof.mjs',
  'packages/react/src/publish-guard.mjs',
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

// The value on the label's own line. An empty value is missing; the next
// line's label is never its value.
function fieldValue(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?${escaped}:[ \\t]*(.*?)[ \\t]*$`, 'im'));
  return match ? match[1].trim() : '';
}

// Drops Markdown emphasis and code wrappers: `x`, *x*, **x**, _x_, ~x~.
function unwrap(value) {
  return value.replace(/^[\s`*_~]+|[\s`*_~]+$/g, '');
}

// A filled-in answer. An honest "None" or "N/A" counts; an empty value, a
// placeholder word, or a template placeholder such as <Scope IDs> does not.
const PLACEHOLDER = /^(?:pending|tbd|not assigned)[\s.!-]*$|^(?:<[^<>]*>[\s,;/|]*)+$/i;

function isFilledIn(value) {
  const text = unwrap(value);
  return text !== '' && !PLACEHOLDER.test(text);
}

// A decision record is exactly decisions/<NNNN-name>.md: no subdirectory, no
// "..", no suffix.
const DECISION_REFERENCE = /^decisions\/\d{4}-[a-z0-9-]+\.md$/;

function decisionFileExists(reference) {
  return fs.statSync(path.join(REPO_ROOT, reference), { throwIfNoEntry: false })?.isFile() === true;
}

// An issue number, or the path of a decision file that exists in the checkout.
function isChangeRecord(value, exists) {
  const reference = unwrap(value);
  return /^#\d+\b/.test(reference) || (DECISION_REFERENCE.test(reference) && exists(reference));
}

function validatePlanningPullRequest({ files = [], labels = [], body = '', exists = decisionFileExists }) {
  const errors = [];

  if (!files.some(isProtectedPlanningFile)) return errors;

  if (!labels.some((label) => AUTHORITY_LABELS.has(label))) {
    errors.push(
      'Authority-source changes require the type:architecture-maintenance or type:decision label.',
    );
  }

  if (!isChangeRecord(fieldValue(body, 'Authority change record'), exists)) {
    errors.push(
      'Authority-source changes require an Authority change record: #… or the path of an existing decisions/NNNN-….md file.',
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

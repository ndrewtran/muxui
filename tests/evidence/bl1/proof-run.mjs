// Runs one BL1 proof command and reduces its output to what a retained record may hold
// (E-BL1-01 to E-BL1-07, E-BL1-10). The output is sanitized before it is retained or
// checked: ANSI codes, the repository root, temporary directories, and the home
// directory never enter evidence, and `hasUnsanitizedEvidenceOutput` must still pass.
// The raw output is not retained; its digest binds the retained excerpt to it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasUnsanitizedEvidenceOutput } from '../../../tooling/audits/repository-policy/src/evidence-verify.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const ansiSequence = /\u001B\[[0-9;?]*[ -/]*[@-~]/gu;

export const sanitizationRules = [
  'ANSI escape sequences are removed',
  'the repository root becomes <repo>',
  'temporary-directory paths become <tmp>',
  'home-directory paths become <home>',
  'trailing whitespace is trimmed from each line',
];

export const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export function sanitizeOutput(text) {
  let output = text.replace(ansiSequence, '').replaceAll('\r', '');
  for (const root of new Set([repositoryRoot, realpathSync(repositoryRoot)])) output = output.replaceAll(root, '<repo>');
  return output
    .replace(/\/(?:private\/)?(?:var\/folders|tmp)\/[^\s'")]+/gu, '<tmp>')
    .replace(/\/Users\/[^/\s'")]+/gu, '<home>')
    .replace(/[ \t]+$/gmu, '');
}

/**
 * Runs `command` from `cwd` (relative to the repository root) and returns its exit code,
 * the display form of the command, the raw output digest, and the sanitized output.
 * The caller decides what a non-zero exit means.
 */
export function runProof({ command, args = [], cwd = '.', env = {} }) {
  const result = spawnSync(command, args, {
    cwd: resolve(repositoryRoot, cwd),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const raw = `${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}`;
  const output = sanitizeOutput(raw);
  const assignments = Object.entries(env).map(([name, value]) => `${name}=${value}`);
  const display = sanitizeOutput([...(cwd === '.' ? [] : [`cd ${cwd} &&`]), ...assignments, command === process.execPath ? 'node' : command, ...args].join(' '));
  if (hasUnsanitizedEvidenceOutput(output, repositoryRoot)) throw new Error(`EVIDENCE_UNSANITIZED: the output of ${display} is not disclosable`);
  return {
    command: display,
    exitCode: result.status ?? 1,
    rawOutput: { bytes: Buffer.byteLength(raw), retained: false, sha256: sha256(raw) },
    output,
  };
}

/** The `node --test` summary counts and every result line (`name`, `depth`, `outcome`) of a spec report. */
export function parseTestReport(output) {
  const summary = {};
  for (const [, name, count] of output.matchAll(/^ℹ (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/gmu)) {
    summary[name] = (summary[name] ?? 0) + Number(count);
  }
  const outcomes = { '✔': 'pass', '✖': 'fail', '﹣': 'skipped' };
  const results = [];
  for (const line of output.split('\n')) {
    const match = /^(\s*)([✔✖﹣]) (.+?) \(\d+(?:\.\d+)?ms\)(?: # .*)?$/u.exec(line);
    if (match) results.push({ depth: match[1].length / 2, name: match[3], outcome: outcomes[match[2]] });
  }
  return { summary, results };
}
